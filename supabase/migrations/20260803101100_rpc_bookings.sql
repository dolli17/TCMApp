-- ===========================================================================
-- Buchungs-RPCs
--
-- Es gibt bewusst keine INSERT-Policy auf bookings. Der einzige Weg zu einer
-- Buchung fuehrt durch create_booking - damit sind die Regeln serverseitig
-- durchgesetzt und unabhaengig davon, was ein Client tut.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Wie viele kuenftige Buchungen belegen das Kontingent dieser Person?
--
-- Zaehlt eigene Buchungen UND solche, in denen die Person als Mitspieler
-- eingetragen ist. Ohne den zweiten Teil waere die Regel wertlos: vier Leute
-- koennten reihum buchen und haetten faktisch unbegrenzt Plaetze.
-- ---------------------------------------------------------------------------
create or replace function private.open_booking_count(p_member_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct b.id)::integer
  from public.bookings b
  join public.booking_types bt on bt.id = b.booking_type_id
  left join public.booking_players bp on bp.booking_id = b.id
  where b.status = 'active'
    and b.kind = 'booking'
    and bt.counts_towards_quota
    and upper(b.slot) > now()
    and (b.member_id = p_member_id or bp.member_id = p_member_id);
$$;

revoke execute on function private.open_booking_count(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Eigener Kontingentstand, fuer die Anzeige "1 von 2 Buchungen offen"
-- ---------------------------------------------------------------------------
create or replace function public.my_booking_quota()
returns table (used integer, allowed integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.open_booking_count(private.current_member_id()),
    public.setting_int('booking.max_open_bookings')
  where private.is_member();
$$;

revoke execute on function public.my_booking_quota() from public, anon;
grant  execute on function public.my_booking_quota() to authenticated;

-- ---------------------------------------------------------------------------
-- Buchung anlegen
-- ---------------------------------------------------------------------------
create or replace function public.create_booking(
  p_court_id          uuid,
  p_starts_at         timestamptz,
  p_booking_type_code text,
  p_player_member_ids uuid[] default '{}',
  p_guest_names       text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me          uuid := private.current_member_id();
  v_type        public.booking_types%rowtype;
  v_ends_at     timestamptz;
  v_local_start time;
  v_local_end   time;
  v_opening     time := public.setting_time('booking.opening_time');
  v_closing     time := public.setting_time('booking.closing_time');
  v_grid        integer := public.setting_int('booking.slot_minutes');
  v_lead_days   integer := public.setting_int('booking.lead_days');
  v_max_open    integer := public.setting_int('booking.max_open_bookings');
  v_players     integer;
  v_booking_id  uuid;
  v_blocker     text;
  v_player      uuid;
  v_guest       text;
begin
  if v_me is null then
    raise exception 'Nur Mitglieder koennen buchen.' using errcode = 'insufficient_privilege';
  end if;

  -- Buchungsart laden und pruefen
  select * into v_type
  from public.booking_types
  where code = p_booking_type_code and active;

  if not found then
    raise exception 'Unbekannte Buchungsart: %', p_booking_type_code
      using errcode = 'invalid_parameter_value';
  end if;

  if v_type.applies_to <> 'booking' then
    raise exception 'Die Art "%" ist eine Blockung und kann nicht regulaer gebucht werden.', v_type.name
      using errcode = 'invalid_parameter_value';
  end if;

  if v_type.allowed_roles is not null
     and not private.has_any_role(v_type.allowed_roles) then
    raise exception 'Fuer "%" fehlt dir die Berechtigung.', v_type.name
      using errcode = 'insufficient_privilege';
  end if;

  -- Dauer ergibt sich aus der Buchungsart, nicht aus der Eingabe
  v_ends_at := p_starts_at + make_interval(mins => v_type.duration_minutes);

  -- Zeitraster: Startzeiten nur auf volle bzw. halbe Stunde
  if extract(second from p_starts_at) <> 0
     or (extract(minute from p_starts_at)::integer % v_grid) <> 0 then
    raise exception 'Startzeit muss auf ein %-Minuten-Raster fallen.', v_grid
      using errcode = 'invalid_parameter_value';
  end if;

  -- Oeffnungszeiten in lokaler Zeit pruefen
  v_local_start := (p_starts_at at time zone 'Europe/Berlin')::time;
  v_local_end   := (v_ends_at   at time zone 'Europe/Berlin')::time;

  if v_local_start < v_opening then
    raise exception 'Vor % wird nicht gespielt.', to_char(v_opening, 'HH24:MI')
      using errcode = 'invalid_parameter_value';
  end if;

  if v_local_end > v_closing or v_local_end <= v_local_start then
    raise exception 'Die Buchung endet nach % Uhr.', to_char(v_closing, 'HH24:MI')
      using errcode = 'invalid_parameter_value';
  end if;

  -- Vorlauf: nicht in der Vergangenheit, nicht weiter als erlaubt
  if p_starts_at < now() then
    raise exception 'Dieser Zeitpunkt liegt in der Vergangenheit.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_starts_at > now() + make_interval(days => v_lead_days) then
    raise exception 'Es kann hoechstens % Tage im Voraus gebucht werden.', v_lead_days
      using errcode = 'invalid_parameter_value';
  end if;

  -- Spieleranzahl
  v_players := 1 + coalesce(array_length(p_player_member_ids, 1), 0)
                 + coalesce(array_length(p_guest_names, 1), 0);

  if v_type.requires_partner and v_players < 2 then
    raise exception 'Fuer "%" musst du mindestens einen Mitspieler angeben.', v_type.name
      using errcode = 'invalid_parameter_value';
  end if;

  if v_players < v_type.min_players then
    raise exception '"%" braucht mindestens % Spieler.', v_type.name, v_type.min_players
      using errcode = 'invalid_parameter_value';
  end if;

  if v_players > v_type.max_players then
    raise exception '"%" erlaubt hoechstens % Spieler.', v_type.name, v_type.max_players
      using errcode = 'invalid_parameter_value';
  end if;

  -- Der Bucher darf nicht zusaetzlich als Mitspieler auftauchen
  if v_me = any (p_player_member_ids) then
    raise exception 'Du bist als Bucher schon dabei und musst dich nicht als Mitspieler eintragen.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Kontingent des Buchers
  if v_type.counts_towards_quota
     and private.open_booking_count(v_me) >= v_max_open then
    raise exception 'Du hast bereits % offene Buchungen. Mehr sind nicht moeglich.', v_max_open
      using errcode = 'check_violation';
  end if;

  -- Kontingent jedes Mitspielers. Hier faellt auf, wenn jemand ueber fremde
  -- Buchungen dauerhaft Plaetze belegt.
  if v_type.counts_towards_quota then
    foreach v_player in array coalesce(p_player_member_ids, '{}') loop
      if private.open_booking_count(v_player) >= v_max_open then
        select m.first_name || ' ' || m.last_name into v_blocker
        from public.members m where m.id = v_player;

        raise exception '% hat bereits % offene Buchungen und kann nicht mitspielen.',
          coalesce(v_blocker, 'Ein Mitspieler'), v_max_open
          using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  -- Anlegen. Ueberschneidungen faengt der EXCLUDE-Constraint ab.
  begin
    insert into public.bookings (court_id, slot, kind, booking_type_id, member_id, created_by)
    values (p_court_id,
            tstzrange(p_starts_at, v_ends_at, '[)'),
            'booking', v_type.id, v_me, v_me)
    returning id into v_booking_id;
  exception when exclusion_violation then
    raise exception 'Dieser Platz ist zu der Zeit bereits belegt.'
      using errcode = 'exclusion_violation';
  end;

  foreach v_player in array coalesce(p_player_member_ids, '{}') loop
    insert into public.booking_players (booking_id, member_id)
    values (v_booking_id, v_player);
  end loop;

  foreach v_guest in array coalesce(p_guest_names, '{}') loop
    if length(btrim(v_guest)) = 0 then
      raise exception 'Gastname darf nicht leer sein.' using errcode = 'invalid_parameter_value';
    end if;
    insert into public.booking_players (booking_id, guest_name)
    values (v_booking_id, btrim(v_guest));
  end loop;

  return v_booking_id;
end;
$$;

revoke execute on function public.create_booking(uuid, timestamptz, text, uuid[], text[])
  from public, anon;
grant execute on function public.create_booking(uuid, timestamptz, text, uuid[], text[])
  to authenticated;

-- ---------------------------------------------------------------------------
-- Buchung stornieren
--
-- Jederzeit bis Spielbeginn und ohne Folgen. Der Slot wird sofort frei und
-- zaehlt nicht mehr aufs Kontingent - das ist der Anreiz, tatsaechlich zu
-- stornieren, statt den Platz verfallen zu lassen.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me      uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
begin
  if v_me is null then
    raise exception 'Nur Mitglieder koennen stornieren.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;

  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if v_booking.status = 'cancelled' then
    return;
  end if;

  -- Eigene Buchung, oder Sportwart/Vorstand
  if v_booking.member_id is distinct from v_me
     and not private.is_sports_officer() then
    raise exception 'Du kannst nur deine eigenen Buchungen stornieren.'
      using errcode = 'insufficient_privilege';
  end if;

  if lower(v_booking.slot) <= now() and not private.is_sports_officer() then
    raise exception 'Die Spielzeit hat bereits begonnen.' using errcode = 'check_violation';
  end if;

  update public.bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_me,
         cancellation_reason = p_reason
   where id = p_booking_id;
end;
$$;

revoke execute on function public.cancel_booking(uuid, text) from public, anon;
grant  execute on function public.cancel_booking(uuid, text) to authenticated;
