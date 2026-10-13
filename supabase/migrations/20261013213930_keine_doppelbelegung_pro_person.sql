-- ===========================================================================
-- Niemand spielt zur selben Zeit auf zwei Plaetzen (Befund O21)
--
-- bookings_no_overlap verhindert Ueberschneidungen nur pro Platz. Dass
-- dieselbe Person um 14 Uhr auf Platz 1 bucht und auf Platz 2 als Mitspieler
-- steht, hielt bisher nichts auf. Die Pruefung pro Person sitzt jetzt in
-- private.spielt_schon und wird ueberall aufgerufen, wo jemand in eine Buchung
-- kommt: beim Anlegen (Bucher und Mitspieler), beim Aendern der Besetzung,
-- beim Mitspielen in offenen Spielen und beim Verschieben einer Buchung.
--
-- Serien und Training sind Blockungen: sie gehoeren dem Verein, haben kein
-- member_id und keine Mitspieler. Sie belegen also keine Person und werden
-- hier weder geprueft noch beruecksichtigt. create_series und update_series
-- bleiben unveraendert - sie verdraengen ohnehin Buchungen auf ihrem Platz.
--
-- Bewusst kein Constraint und kein Trigger auf INSERT: Altbestand und der
-- eBuSy-Import koennen solche Doppelungen enthalten, und die sollen den Import
-- nicht abbrechen. Geprueft wird, was ab jetzt neu dazukommt.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Die zentrale Pruefung
-- ---------------------------------------------------------------------------

/**
 * Spielt das Mitglied in diesem Zeitraum schon irgendwo?
 *
 * Liefert den Namen des Platzes, auf dem es schon steht, sonst null. Gezaehlt
 * wird jede aktive Buchung, in der die Person Bucher oder Mitspieler ist.
 * Stornierte Buchungen zaehlen nicht, und weil die Zeitraeume halboffen sind,
 * kollidieren 10-11 Uhr und 11-12 Uhr nicht.
 *
 * p_ausser_booking_id nimmt die Buchung aus, um die es gerade geht: wer in
 * seiner eigenen Buchung steht, kollidiert nicht mit sich selbst.
 */
create or replace function private.spielt_schon(
  p_member_id uuid, p_slot tstzrange, p_ausser_booking_id uuid default null
)
returns text language sql stable security definer set search_path = '' as $$
  select c.name
  from public.bookings b
  join public.courts c on c.id = b.court_id
  where b.status = 'active'
    and b.slot && p_slot
    and b.id is distinct from p_ausser_booking_id
    and (b.member_id = p_member_id
         or exists (select 1 from public.booking_players bp
                     where bp.booking_id = b.id and bp.member_id = p_member_id))
  order by lower(b.slot), c.position
  limit 1;
$$;
revoke execute on function private.spielt_schon(uuid, tstzrange, uuid) from public, anon, authenticated;

/**
 * Weist ab, wenn eine der Personen zu der Zeit schon spielt.
 *
 * Die Sperre je Person schliesst das Rennen zweier gleichzeitiger Buchungen
 * aus: ohne sie saehen beide Transaktionen eine freie Person und traegen sie
 * beide ein. Gesperrt wird sortiert, damit zwei Buchungen mit denselben
 * Leuten in umgekehrter Reihenfolge sich nicht gegenseitig festhalten.
 * Gemeldet wird in der Reihenfolge der Eingabe, der Bucher also zuerst.
 */
create or replace function private.pruefe_spielt_schon(
  p_member_ids uuid[], p_slot tstzrange, p_ausser_booking_id uuid default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_id uuid;
  v_platz text;
begin
  perform pg_advisory_xact_lock(hashtextextended('spielt_schon:' || x::text, 0))
  from (select distinct unnest(p_member_ids) as x order by 1) s
  where x is not null;

  foreach v_id in array coalesce(p_member_ids, '{}') loop
    continue when v_id is null;
    v_platz := private.spielt_schon(v_id, p_slot, p_ausser_booking_id);
    if v_platz is not null then
      if v_id = v_me then
        raise exception 'Du spielst zu dieser Zeit schon auf %.', v_platz
          using errcode = 'check_violation';
      end if;
      raise exception '% spielt zu dieser Zeit schon auf %.', private.member_label(v_id), v_platz
        using errcode = 'check_violation';
    end if;
  end loop;
end; $$;
revoke execute on function private.pruefe_spielt_schon(uuid[], tstzrange, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verschieben
--
-- Eine RPC zum Verschieben einzelner Buchungen gibt es nicht, und Clients
-- haben auf bookings nur Leserechte. Verschoben wird heute also nur
-- serverseitig (SQL, Skripte, eine kuenftige RPC). Damit auch dieser Weg
-- niemanden doppelt belegt, prueft ein Trigger, sobald sich der Zeitraum
-- aendert, das Mitglied wechselt oder eine Buchung wieder aktiv wird.
-- ---------------------------------------------------------------------------
create or replace function private.bookings_spielt_schon()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.pruefe_spielt_schon(
    array[new.member_id] || coalesce(
      (select array_agg(bp.member_id order by bp.created_at)
         from public.booking_players bp
        where bp.booking_id = new.id and bp.member_id is not null),
      '{}'::uuid[]),
    new.slot, new.id);
  return new;
end; $$;
revoke execute on function private.bookings_spielt_schon() from public, anon, authenticated;

create trigger bookings_spielt_schon
  before update of slot, member_id, status on public.bookings
  for each row
  when (new.status = 'active' and new.kind = 'booking'
        and (old.slot is distinct from new.slot
             or old.member_id is distinct from new.member_id
             or old.status is distinct from new.status))
  execute function private.bookings_spielt_schon();

-- ---------------------------------------------------------------------------
-- create_booking: Bucher und Mitspieler pruefen
-- ---------------------------------------------------------------------------
create or replace function public.create_booking(
  p_court_id uuid, p_starts_at timestamptz, p_booking_type_code text,
  p_player_member_ids uuid[] default '{}', p_guest_names text[] default '{}',
  p_partner_wanted boolean default false
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
  v_gaeste integer := coalesce(array_length(p_guest_names, 1), 0);
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

  v_players := 1 + coalesce(array_length(p_player_member_ids, 1), 0) + v_gaeste;

  -- Wer Mitspieler sucht, darf die Untergrenze noch nicht erfuellen: genau
  -- dafuer ist das Feld da. Die Obergrenze gilt trotzdem.
  if not p_partner_wanted then
    if v_type.requires_partner and v_players < 2 then
      raise exception 'Fuer "%" musst du mindestens einen Mitspieler angeben.', v_type.name
        using errcode = 'invalid_parameter_value';
    end if;
    if v_players < v_type.min_players then
      raise exception '"%" braucht mindestens % Spieler.', v_type.name, v_type.min_players
        using errcode = 'invalid_parameter_value';
    end if;
  end if;
  if v_players > v_type.max_players then
    raise exception '"%" erlaubt hoechstens % Spieler.', v_type.name, v_type.max_players
      using errcode = 'invalid_parameter_value';
  end if;
  if p_partner_wanted and v_players >= v_type.max_players then
    raise exception 'Die Buchung ist schon voll - dann brauchst du keine Mitspieler zu suchen.'
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
    insert into public.bookings
      (court_id, slot, kind, booking_type_id, member_id, created_by, partner_wanted)
    values (p_court_id, tstzrange(p_starts_at, v_ends_at, '[)'), 'booking', v_type.id,
            v_me, v_me, coalesce(p_partner_wanted, false))
    returning id into v_booking_id;
  exception when exclusion_violation then
    raise exception 'Dieser Platz ist zu der Zeit bereits belegt.' using errcode = 'exclusion_violation';
  end;

  -- Erst nach dem Platz die Personen: ist der Platz selbst belegt, ist das die
  -- treffendere Meldung. Bucher zuerst, dann die Mitspieler; die neue Buchung
  -- steht schon in der Tabelle und wird ausgenommen.
  perform private.pruefe_spielt_schon(
    array[v_me] || coalesce(p_player_member_ids, '{}'),
    tstzrange(p_starts_at, v_ends_at, '[)'), v_booking_id);

  foreach v_player in array coalesce(p_player_member_ids, '{}') loop
    insert into public.booking_players (booking_id, member_id) values (v_booking_id, v_player);
  end loop;
  foreach v_guest in array coalesce(p_guest_names, '{}') loop
    if length(btrim(v_guest)) = 0 then
      raise exception 'Gastname darf nicht leer sein.' using errcode = 'invalid_parameter_value';
    end if;
    insert into public.booking_players (booking_id, guest_name) values (v_booking_id, btrim(v_guest));
  end loop;

  perform private.sync_guest_charges(v_booking_id, v_me, v_gaeste);

  -- Wer eingetragen wurde, soll es erfahren, ohne den Plan aufzuschlagen.
  insert into public.notifications (member_id, kind, title, body)
  select v_player_id, 'booking_added', 'Du bist als Mitspieler eingetragen',
         format('%s hat dich fuer %s eingetragen.',
                private.member_label(v_me), private.booking_label(v_booking_id))
  from unnest(coalesce(p_player_member_ids, '{}')) as v_player_id;

  return v_booking_id;
end; $$;
revoke execute on function
  public.create_booking(uuid, timestamptz, text, uuid[], text[], boolean) from public, anon;
grant execute on function
  public.create_booking(uuid, timestamptz, text, uuid[], text[], boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- update_booking_players: neu hinzukommende Mitspieler pruefen
-- ---------------------------------------------------------------------------
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
  v_vorher uuid[];
  v_label text;
  v_gaeste integer := coalesce(array_length(p_guest_names, 1), 0);
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

  v_players := 1 + coalesce(array_length(p_member_ids, 1), 0) + v_gaeste;

  -- Solange Mitspieler gesucht werden, darf die Buchung unterbesetzt sein.
  if not v_booking.partner_wanted then
    if v_type.requires_partner and v_players < 2 then
      raise exception 'Fuer "%" musst du mindestens einen Mitspieler angeben.', v_type.name
        using errcode = 'invalid_parameter_value';
    end if;
    -- Dieselbe Untergrenze wie beim Anlegen. Ohne sie waere die Regel nur eine
    -- Huerde beim ersten Speichern und danach beliebig zu umgehen.
    if v_players < v_type.min_players then
      raise exception '"%" braucht mindestens % Spieler.', v_type.name, v_type.min_players
        using errcode = 'invalid_parameter_value';
    end if;
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

  -- Nur wer neu dazukommt, wird auf Doppelbelegung geprueft. Bucher und
  -- bisherige Mitspieler stehen schon in dieser Buchung; sie erneut zu pruefen,
  -- wuerde nur Altbestand aus der Zeit vor dieser Regel zur Huerde machen.
  perform private.pruefe_spielt_schon(
    array(select neu from unnest(coalesce(p_member_ids, '{}')) with ordinality as t(neu, i)
           where not exists (select 1 from public.booking_players bp
                              where bp.booking_id = p_booking_id and bp.member_id = neu)
           order by i),
    v_booking.slot, p_booking_id);

  -- Die alte Besetzung merken, bevor sie geloescht wird: nur so laesst sich
  -- danach sagen, wer neu dazukam und wer gehen musste. Die Funktion tauscht
  -- vollstaendig aus, kennt also von sich aus keinen Unterschied.
  select coalesce(array_agg(bp.member_id), '{}')
    into v_vorher
  from public.booking_players bp
  where bp.booking_id = p_booking_id and bp.member_id is not null;

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

  -- Die Gebuehr traegt immer der Bucher, auch wenn ein Admin die Besetzung
  -- aendert: er hat den Gast mitgebracht, nicht der Verwalter.
  perform private.sync_guest_charges(p_booking_id, v_booking.member_id, v_gaeste);

  -- Voll ist voll: die Buchung verschwindet aus den offenen Spielen.
  if v_booking.partner_wanted and v_players >= v_type.max_players then
    update public.bookings set partner_wanted = false where id = p_booking_id;
  end if;

  v_label := private.booking_label(p_booking_id);

  insert into public.notifications (member_id, kind, title, body)
  select neu, 'booking_added', 'Du bist als Mitspieler eingetragen',
         format('%s hat dich fuer %s eingetragen.', private.member_label(v_me), v_label)
  from unnest(coalesce(p_member_ids, '{}')) as neu
  where not (neu = any (v_vorher)) and neu <> v_me;

  insert into public.notifications (member_id, kind, title, body)
  select alt, 'booking_removed', 'Du bist nicht mehr dabei',
         format('%s hat dich von %s ausgetragen.', private.member_label(v_me), v_label)
  from unnest(v_vorher) as alt
  where not (alt = any (coalesce(p_member_ids, '{}'))) and alt <> v_me;
end; $$;
revoke execute on function public.update_booking_players(uuid, uuid[], text[]) from public, anon;
grant  execute on function public.update_booking_players(uuid, uuid[], text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- join_booking: wer mitspielen will, darf nicht schon woanders stehen
-- ---------------------------------------------------------------------------
create or replace function public.join_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_type public.booking_types%rowtype;
  v_max_open integer := public.setting_int('booking.max_open_bookings');
  v_besetzt integer;
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
  if not v_booking.partner_wanted then
    raise exception 'Fuer diese Buchung werden keine Mitspieler gesucht.'
      using errcode = 'check_violation';
  end if;
  if lower(v_booking.slot) <= now() then
    raise exception 'Die Spielzeit hat bereits begonnen.' using errcode = 'check_violation';
  end if;
  if v_booking.member_id = v_me then
    raise exception 'Es ist deine eigene Buchung.' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.booking_players bp
              where bp.booking_id = p_booking_id and bp.member_id = v_me) then
    raise exception 'Du bist schon dabei.' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_type from public.booking_types where id = v_booking.booking_type_id;

  select 1 + count(*)::integer into v_besetzt
  from public.booking_players bp where bp.booking_id = p_booking_id;

  if v_besetzt >= v_type.max_players then
    raise exception 'Diese Buchung ist bereits voll.' using errcode = 'check_violation';
  end if;

  if v_max_open > 0 and v_type.counts_towards_quota
     and private.open_booking_count(v_me) >= v_max_open then
    raise exception 'Du hast bereits % offene Buchungen. Mehr sind nicht moeglich.', v_max_open
      using errcode = 'check_violation';
  end if;

  perform private.pruefe_spielt_schon(array[v_me], v_booking.slot, p_booking_id);

  insert into public.booking_players (booking_id, member_id) values (p_booking_id, v_me);

  -- Voll ist voll: die Buchung verschwindet aus den offenen Spielen, ohne dass
  -- der Bucher daran denken muss.
  if v_besetzt + 1 >= v_type.max_players then
    update public.bookings set partner_wanted = false where id = p_booking_id;
  end if;

  insert into public.notifications (member_id, kind, title, body)
  values (v_booking.member_id, 'player_joined', 'Jemand spielt mit',
          format('%s hat sich fuer %s eingetragen.',
                 private.member_label(v_me), private.booking_label(p_booking_id)));
end; $$;

revoke execute on function public.join_booking(uuid) from public, anon;
grant  execute on function public.join_booking(uuid) to authenticated;
