-- Buchungs-RPCs: Kontingent 0 = unbegrenzt, Admins duerfen alles,
-- neue Funktion zum Tauschen der Mitspieler.

create or replace function public.create_booking(
  p_court_id uuid, p_starts_at timestamptz, p_booking_type_code text,
  p_player_member_ids uuid[] default '{}', p_guest_names text[] default '{}'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_type public.booking_types%rowtype;
  v_ends_at timestamptz; v_local_start time; v_local_end time;
  v_opening time := public.setting_time('booking.opening_time');
  v_closing time := public.setting_time('booking.closing_time');
  v_grid integer := public.setting_int('booking.slot_minutes');
  v_lead_days integer := public.setting_int('booking.lead_days');
  v_max_open integer := public.setting_int('booking.max_open_bookings');
  v_players integer; v_booking_id uuid; v_blocker text; v_player uuid; v_guest text;
begin
  if v_me is null then
    raise exception 'Nur Mitglieder koennen buchen.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_type from public.booking_types where code = p_booking_type_code and active;
  if not found then
    raise exception 'Unbekannte Buchungsart: %', p_booking_type_code
      using errcode = 'invalid_parameter_value';
  end if;
  if v_type.applies_to <> 'booking' then
    raise exception 'Die Art "%" ist eine Blockung und kann nicht regulaer gebucht werden.', v_type.name
      using errcode = 'invalid_parameter_value';
  end if;
  -- Beschraenkte Buchungsarten sind seit der Rollenzusammenlegung Admin-Sache.
  if v_type.allowed_roles is not null and not private.is_admin() then
    raise exception 'Fuer "%" fehlt dir die Berechtigung.', v_type.name
      using errcode = 'insufficient_privilege';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_type.duration_minutes);

  if extract(second from p_starts_at) <> 0
     or (extract(minute from p_starts_at)::integer % v_grid) <> 0 then
    raise exception 'Startzeit muss auf ein %-Minuten-Raster fallen.', v_grid
      using errcode = 'invalid_parameter_value';
  end if;

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
  if p_starts_at < now() then
    raise exception 'Dieser Zeitpunkt liegt in der Vergangenheit.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_starts_at > now() + make_interval(days => v_lead_days) then
    raise exception 'Es kann hoechstens % Tage im Voraus gebucht werden.', v_lead_days
      using errcode = 'invalid_parameter_value';
  end if;

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
  if v_me = any (p_player_member_ids) then
    raise exception 'Du bist als Bucher schon dabei und musst dich nicht als Mitspieler eintragen.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Kontingent: 0 bedeutet unbegrenzt. Die Regel bleibt vollstaendig erhalten,
  -- damit der Vorstand sie in knappen Zeiten wieder einschalten kann.
  if v_max_open > 0 and v_type.counts_towards_quota then
    if private.open_booking_count(v_me) >= v_max_open then
      raise exception 'Du hast bereits % offene Buchungen. Mehr sind nicht moeglich.', v_max_open
        using errcode = 'check_violation';
    end if;
    foreach v_player in array coalesce(p_player_member_ids, '{}') loop
      if private.open_booking_count(v_player) >= v_max_open then
        select m.first_name || ' ' || m.last_name into v_blocker
        from public.members m where m.id = v_player;
        raise exception '% hat bereits % offene Buchungen und kann nicht mitspielen.',
          coalesce(v_blocker, 'Ein Mitspieler'), v_max_open using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  begin
    insert into public.bookings (court_id, slot, kind, booking_type_id, member_id, created_by)
    values (p_court_id, tstzrange(p_starts_at, v_ends_at, '[)'), 'booking', v_type.id, v_me, v_me)
    returning id into v_booking_id;
  exception when exclusion_violation then
    raise exception 'Dieser Platz ist zu der Zeit bereits belegt.' using errcode = 'exclusion_violation';
  end;

  foreach v_player in array coalesce(p_player_member_ids, '{}') loop
    insert into public.booking_players (booking_id, member_id) values (v_booking_id, v_player);
  end loop;
  foreach v_guest in array coalesce(p_guest_names, '{}') loop
    if length(btrim(v_guest)) = 0 then
      raise exception 'Gastname darf nicht leer sein.' using errcode = 'invalid_parameter_value';
    end if;
    insert into public.booking_players (booking_id, guest_name) values (v_booking_id, btrim(v_guest));
  end loop;

  return v_booking_id;
end; $$;
revoke execute on function public.create_booking(uuid, timestamptz, text, uuid[], text[]) from public, anon;
grant execute on function public.create_booking(uuid, timestamptz, text, uuid[], text[]) to authenticated;

create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.current_member_id(); v_booking public.bookings%rowtype;
begin
  if v_me is null then
    raise exception 'Nur Mitglieder koennen stornieren.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.status = 'cancelled' then return; end if;

  if v_booking.member_id is distinct from v_me and not private.is_admin() then
    raise exception 'Du kannst nur deine eigenen Buchungen stornieren.'
      using errcode = 'insufficient_privilege';
  end if;
  -- Admins raeumen auch waehrend der Spielzeit auf, etwa bei Platzsperrung.
  if lower(v_booking.slot) <= now() and not private.is_admin() then
    raise exception 'Die Spielzeit hat bereits begonnen.' using errcode = 'check_violation';
  end if;

  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me,
         cancellation_reason = p_reason
   where id = p_booking_id;
end; $$;
revoke execute on function public.cancel_booking(uuid, text) from public, anon;
grant  execute on function public.cancel_booking(uuid, text) to authenticated;

/**
 * Ersetzt die Mitspieler einer bestehenden Buchung.
 *
 * Bewusst ein vollstaendiger Austausch statt einzelner Zu- und Abgaenge: die
 * Oberflaeche schickt den Zustand, den der Benutzer sieht, und die
 * Regelpruefung sieht immer die Endbesetzung.
 */
create or replace function public.update_booking_players(
  p_booking_id uuid, p_member_ids uuid[] default '{}', p_guest_names text[] default '{}'
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_type public.booking_types%rowtype;
  v_max_open integer := public.setting_int('booking.max_open_bookings');
  v_players integer; v_player uuid; v_guest text; v_blocker text;
  v_ist_admin boolean := private.is_admin();
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.status <> 'active' then
    raise exception 'Diese Buchung ist storniert.' using errcode = 'check_violation';
  end if;
  if v_booking.member_id is distinct from v_me and not v_ist_admin then
    raise exception 'Du kannst nur deine eigenen Buchungen aendern.'
      using errcode = 'insufficient_privilege';
  end if;
  if lower(v_booking.slot) <= now() and not v_ist_admin then
    raise exception 'Die Spielzeit hat bereits begonnen.' using errcode = 'check_violation';
  end if;

  select * into v_type from public.booking_types where id = v_booking.booking_type_id;

  v_players := 1 + coalesce(array_length(p_member_ids, 1), 0)
                 + coalesce(array_length(p_guest_names, 1), 0);
  if v_type.requires_partner and v_players < 2 then
    raise exception 'Fuer "%" musst du mindestens einen Mitspieler angeben.', v_type.name
      using errcode = 'invalid_parameter_value';
  end if;
  if v_players > v_type.max_players then
    raise exception '"%" erlaubt hoechstens % Spieler.', v_type.name, v_type.max_players
      using errcode = 'invalid_parameter_value';
  end if;
  if v_booking.member_id = any (p_member_ids) then
    raise exception 'Der Bucher ist schon dabei und muss nicht als Mitspieler eingetragen werden.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Kontingent nur fuer neu hinzukommende Mitspieler pruefen: wer schon
  -- eingetragen war, zaehlt diese Buchung bereits mit.
  if v_max_open > 0 and v_type.counts_towards_quota then
    foreach v_player in array coalesce(p_member_ids, '{}') loop
      if not exists (select 1 from public.booking_players bp
                      where bp.booking_id = p_booking_id and bp.member_id = v_player)
         and private.open_booking_count(v_player) >= v_max_open then
        select m.first_name || ' ' || m.last_name into v_blocker
        from public.members m where m.id = v_player;
        raise exception '% hat bereits % offene Buchungen und kann nicht mitspielen.',
          coalesce(v_blocker, 'Ein Mitspieler'), v_max_open using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  delete from public.booking_players where booking_id = p_booking_id;

  foreach v_player in array coalesce(p_member_ids, '{}') loop
    insert into public.booking_players (booking_id, member_id) values (p_booking_id, v_player);
  end loop;
  foreach v_guest in array coalesce(p_guest_names, '{}') loop
    if length(btrim(v_guest)) = 0 then
      raise exception 'Gastname darf nicht leer sein.' using errcode = 'invalid_parameter_value';
    end if;
    insert into public.booking_players (booking_id, guest_name) values (p_booking_id, btrim(v_guest));
  end loop;
end; $$;
revoke execute on function public.update_booking_players(uuid, uuid[], text[]) from public, anon;
grant  execute on function public.update_booking_players(uuid, uuid[], text[]) to authenticated;

create or replace function public.create_series(
  p_court_id uuid, p_booking_type_code text, p_weekday integer,
  p_start_time time, p_end_time time, p_valid_from date, p_valid_to date,
  p_title text, p_displace boolean default false
)
returns table (series_id uuid, created_count integer, displaced_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_type public.booking_types%rowtype;
  v_series_id uuid; v_created integer := 0; v_displaced integer := 0; v_conflicts integer;
  v_occ record; v_conflict record; v_court_name text;
begin
  if not private.is_admin() then
    raise exception 'Serien koennen nur Administratoren anlegen.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_type from public.booking_types where code = p_booking_type_code and active;
  if not found then
    raise exception 'Unbekannte Buchungsart: %', p_booking_type_code
      using errcode = 'invalid_parameter_value';
  end if;
  if v_type.applies_to <> 'blocking' then
    raise exception '"%" ist keine Blockungsart.', v_type.name using errcode = 'invalid_parameter_value';
  end if;
  if p_end_time <= p_start_time then
    raise exception 'Die Endzeit muss nach der Startzeit liegen.' using errcode = 'invalid_parameter_value';
  end if;

  select count(*) into v_conflicts
  from private.series_occurrences(p_weekday, p_start_time, p_end_time, p_valid_from, p_valid_to) o
  join public.bookings b on b.court_id = p_court_id and b.status = 'active'
   and b.slot && tstzrange(o.starts_at, o.ends_at, '[)');

  if v_conflicts > 0 and not p_displace then
    raise exception
      '% Termine kollidieren mit bestehenden Buchungen. Vorschau ansehen und Verdraengen bestaetigen.',
      v_conflicts using errcode = 'exclusion_violation';
  end if;

  select name into v_court_name from public.courts where id = p_court_id;

  insert into public.booking_series
    (court_id, booking_type_id, weekday, start_time, end_time, valid_from, valid_to, title, created_by)
  values (p_court_id, v_type.id, p_weekday, p_start_time, p_end_time, p_valid_from, p_valid_to, p_title, v_me)
  returning id into v_series_id;

  for v_occ in
    select * from private.series_occurrences(p_weekday, p_start_time, p_end_time, p_valid_from, p_valid_to)
  loop
    for v_conflict in
      select b.id, b.member_id, b.slot from public.bookings b
      where b.court_id = p_court_id and b.status = 'active'
        and b.slot && tstzrange(v_occ.starts_at, v_occ.ends_at, '[)')
    loop
      update public.bookings
         set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me,
             cancellation_reason = 'Verdraengt durch Blockung: ' || p_title
       where id = v_conflict.id;
      v_displaced := v_displaced + 1;

      insert into public.notifications (member_id, kind, title, body)
      select distinct p.member_id, 'booking_displaced',
             'Deine Platzbuchung wurde aufgehoben',
             format('Die Buchung am %s auf %s wurde durch "%s" ersetzt.',
                    to_char(lower(v_conflict.slot) at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI'),
                    coalesce(v_court_name, 'dem Platz'), p_title)
      from (
        select v_conflict.member_id as member_id
        union
        select bp.member_id from public.booking_players bp
        where bp.booking_id = v_conflict.id and bp.member_id is not null
      ) p where p.member_id is not null;
    end loop;

    insert into public.bookings (court_id, slot, kind, booking_type_id, series_id, title, created_by)
    values (p_court_id, tstzrange(v_occ.starts_at, v_occ.ends_at, '[)'),
            'blocking', v_type.id, v_series_id, p_title, v_me);
    v_created := v_created + 1;
  end loop;

  return query select v_series_id, v_created, v_displaced;
end; $$;
revoke execute on function
  public.create_series(uuid, text, integer, time, time, date, date, text, boolean) from public, anon;
grant execute on function
  public.create_series(uuid, text, integer, time, time, date, date, text, boolean) to authenticated;
