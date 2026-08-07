-- ===========================================================================
-- Mitspieler gesucht, Gastgebuehr
--
-- Der inhaltliche Kern dieses Vorhabens. Bei 300 Mitgliedern und 8 Plaetzen
-- ist der groesste Gewinn an tatsaechlicher Spielzeit nicht ein feineres
-- Kontingent, sondern dass zwei Leute, die spielen wollen, voneinander
-- erfahren. Das abzuloesende System kennt dafuer nur ein Feld am Mitspieler
-- (PARTNER_WANTED); andere Systeme haben daraus ihre wichtigste Funktion
-- gemacht.
--
-- Dazu die Gaeste: bisher ein Freitextname ohne Folgen, ab jetzt ein Platz mit
-- Preis. Die Gebuehr steht in booking.guest_fee_cents und laeuft als Forderung
-- mit der naechsten Lastschrift mit.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Gastgebuehren einer Buchung fuehren
-- ---------------------------------------------------------------------------

/**
 * Bringt die Gastgebuehren einer Buchung auf die gewuenschte Anzahl.
 *
 * Bewusst "Soll herstellen" statt "eine anlegen": update_booking_players
 * tauscht die Besetzung vollstaendig aus, und beim Tausch von zwei Gaesten auf
 * einen muss eine Forderung wieder weg. Geloescht werden nur offene - was
 * bereits in einer Lastschrift steckt, verhindert der Fremdschluessel von
 * debit_items ohnehin.
 *
 * period_label bleibt null. Der Index charges_one_per_member_kind_period
 * greift nur bei gesetztem Label; mit einem Label liesse sich je Mitglied und
 * Jahr genau eine Gastgebuehr anlegen - und die zweite ginge still verloren.
 */
create or replace function private.sync_guest_charges(
  p_booking_id uuid, p_member_id uuid, p_anzahl integer
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_gebuehr integer := public.setting_int('booking.guest_fee_cents');
  v_ist integer;
  v_payer uuid;
  v_text text;
begin
  if v_gebuehr <= 0 then return; end if;

  select count(*)::integer into v_ist
  from public.charges
  where booking_id = p_booking_id and kind = 'guest' and status = 'open';

  if v_ist = p_anzahl then return; end if;

  if v_ist > p_anzahl then
    delete from public.charges
    where id in (
      select id from public.charges
      where booking_id = p_booking_id and kind = 'guest' and status = 'open'
      order by created_at desc
      limit v_ist - p_anzahl
    );
    return;
  end if;

  -- Wer zahlt: bei Kindern der hinterlegte Elternteil, sonst das Mitglied
  -- selbst. Dasselbe Muster wie im Beitragslauf.
  select coalesce(m.billing_payer_id, m.id) into v_payer
  from public.members m where m.id = p_member_id;

  v_text := 'Gastgebuehr ' || private.booking_label(p_booking_id);

  insert into public.charges (member_id, payer_id, kind, amount_cents, description, booking_id)
  select p_member_id, v_payer, 'guest', v_gebuehr, v_text, p_booking_id
  from generate_series(1, p_anzahl - v_ist);
end; $$;

/**
 * Vor Spielbeginn wird die Gastgebuehr erlassen, danach bleibt sie stehen.
 *
 * Die Regel haengt am Zeitpunkt, nicht an der Person: storniert ein Admin nach
 * Spielbeginn - etwa weil der Platz unbespielbar wurde -, bleibt die Forderung
 * ebenfalls. Alles andere waere eine Ermessensentscheidung im Code.
 *
 * "waived" statt loeschen: dass eine Gebuehr entstanden und erlassen wurde, ist
 * Teil der Kontohistorie und soll nachvollziehbar bleiben.
 */
create or replace function private.waive_guest_charges(p_booking_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.charges
     set status = 'waived'
   where booking_id = p_booking_id
     and kind = 'guest'
     and status = 'open';
$$;

-- ---------------------------------------------------------------------------
-- create_booking: Gastgebuehr und der Wunsch nach Mitspielern
-- ---------------------------------------------------------------------------

-- Erst die alte Fassung weg. "create or replace" mit einem Parameter mehr legt
-- eine zweite Funktion daneben, und ein Aufruf mit fuenf Argumenten waere
-- danach mehrdeutig - PostgREST wie pgTAP bekaemen "function is not unique".
drop function if exists public.create_booking(uuid, timestamptz, text, uuid[], text[]);

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
-- update_booking_players: Gastgebuehren mitfuehren
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
-- cancel_booking: Gastgebuehr erlassen, solange nicht gespielt wurde
-- ---------------------------------------------------------------------------
create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_text text;
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

  -- Der Text wird vor dem Storno gebildet: booking_label liest die Buchung,
  -- und die soll den Zeitpunkt nennen, nicht den Status.
  v_text := format('Die Buchung am %s wurde storniert.', private.booking_label(p_booking_id));
  if p_reason is not null and btrim(p_reason) <> '' then
    v_text := v_text || ' Grund: ' || btrim(p_reason);
  end if;

  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me,
         cancellation_reason = p_reason, partner_wanted = false
   where id = p_booking_id;

  -- Vor Spielbeginn wird die Gastgebuehr erlassen, danach bleibt sie stehen.
  if lower(v_booking.slot) > now() then
    perform private.waive_guest_charges(p_booking_id);
  end if;

  -- Alle Betroffenen ausser dem, der storniert hat: der weiss es bereits.
  insert into public.notifications (member_id, kind, title, body)
  select distinct p.member_id, 'booking_cancelled', 'Eine Buchung wurde storniert', v_text
  from (
    select v_booking.member_id as member_id
    union
    select bp.member_id from public.booking_players bp
    where bp.booking_id = p_booking_id and bp.member_id is not null
  ) p
  where p.member_id is not null and p.member_id <> v_me;
end; $$;
revoke execute on function public.cancel_booking(uuid, text) from public, anon;
grant  execute on function public.cancel_booking(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Mitspieler gesucht
-- ---------------------------------------------------------------------------

/**
 * Einer Buchung beitreten, die offen ausgeschrieben ist.
 *
 * Der Unterschied zu update_booking_players: die gehoert dem Bucher, hier
 * traegt sich jemand selbst ein. Deshalb die Pruefung auf partner_wanted - ohne
 * sie koennte sich jeder in jede fremde Buchung setzen.
 */
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

create or replace function public.set_partner_wanted(p_booking_id uuid, p_wanted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_type public.booking_types%rowtype;
  v_besetzt integer;
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.member_id is distinct from v_me and not private.is_admin() then
    raise exception 'Nur der Bucher kann Mitspieler suchen.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_booking.status <> 'active' then
    raise exception 'Diese Buchung ist storniert.' using errcode = 'check_violation';
  end if;

  if p_wanted then
    select * into v_type from public.booking_types where id = v_booking.booking_type_id;
    select 1 + count(*)::integer into v_besetzt
    from public.booking_players bp where bp.booking_id = p_booking_id;
    if v_besetzt >= v_type.max_players then
      raise exception 'Die Buchung ist voll - es ist kein Platz mehr frei.'
        using errcode = 'check_violation';
    end if;
  end if;

  update public.bookings set partner_wanted = coalesce(p_wanted, false)
   where id = p_booking_id;
end; $$;

revoke execute on function public.set_partner_wanted(uuid, boolean) from public, anon;
grant  execute on function public.set_partner_wanted(uuid, boolean) to authenticated;

/**
 * Alle offenen Spiele der naechsten Tage.
 *
 * Ohne Datumsangaben: von jetzt bis zum Ende des Buchungsvorlaufs - weiter
 * voraus gibt es ohnehin nichts zu sehen.
 */
create or replace function public.open_matches(
  p_von date default null, p_bis date default null
)
returns table (
  booking_id uuid, court_name text, starts_at timestamptz, ends_at timestamptz,
  type_code text, type_name text, owner_name text, owner_member_id uuid,
  players text[], frei integer, bin_dabei boolean
)
language sql stable security definer set search_path = '' as $$
  with ich as (select private.current_member_id() as id),
  fenster as (
    select
      coalesce((p_von::timestamp) at time zone 'Europe/Berlin', now()) as von,
      coalesce(((p_bis + 1)::timestamp) at time zone 'Europe/Berlin',
               now() + make_interval(days => public.setting_int('booking.lead_days'))) as bis
  )
  select
    b.id,
    c.name,
    lower(b.slot),
    upper(b.slot),
    bt.code,
    bt.name,
    private.member_label(b.member_id),
    b.member_id,
    coalesce(
      array_agg(
        coalesce(
          nullif(btrim(coalesce(pm.first_name, '') || ' ' || coalesce(pm.last_name, '')), ''),
          bp.guest_name
        )
        order by pm.last_name nulls last, bp.guest_name
      ) filter (where bp.id is not null),
      '{}'::text[]
    ),
    bt.max_players - 1 - count(bp.id)::integer,
    bool_or(bp.member_id = (select id from ich)) is true
      or b.member_id = (select id from ich)
  from public.bookings b
  join public.booking_types bt on bt.id = b.booking_type_id
  left join public.courts c on c.id = b.court_id
  left join public.booking_players bp on bp.booking_id = b.id
  left join public.members pm on pm.id = bp.member_id
  where b.status = 'active'
    and b.partner_wanted
    and private.is_member()
    and lower(b.slot) >= (select von from fenster)
    and lower(b.slot) <  (select bis from fenster)
  group by b.id, c.name, b.slot, bt.code, bt.name, bt.max_players, b.member_id
  having bt.max_players - 1 - count(bp.id) > 0
  order by lower(b.slot);
$$;

revoke execute on function public.open_matches(date, date) from public, anon;
grant  execute on function public.open_matches(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- day_schedule kennt den Wunsch nach Mitspielern
-- ---------------------------------------------------------------------------
drop function if exists public.day_schedule(date);

create function public.day_schedule(p_date date)
returns table (
  booking_id uuid, court_id uuid, starts_at timestamptz, ends_at timestamptz,
  kind public.booking_kind, type_code text, type_name text, title text,
  owner_name text, owner_member_id uuid, is_own boolean, players text[],
  player_member_ids uuid[], guest_names text[],
  partner_wanted boolean, frei integer, bin_dabei boolean
)
language sql stable security definer set search_path = '' as $$
  select
    b.id,
    b.court_id,
    lower(b.slot),
    upper(b.slot),
    b.kind,
    bt.code,
    bt.name,
    b.title,
    nullif(btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')), ''),
    b.member_id,
    b.member_id = private.current_member_id(),
    coalesce(
      array_agg(
        coalesce(
          nullif(btrim(coalesce(pm.first_name, '') || ' ' || coalesce(pm.last_name, '')), ''),
          bp.guest_name
        )
        order by pm.last_name nulls last, bp.guest_name
      ) filter (where bp.id is not null),
      '{}'::text[]
    ),
    coalesce(
      array_agg(bp.member_id order by pm.last_name nulls last)
        filter (where bp.member_id is not null),
      '{}'::uuid[]
    ),
    coalesce(
      array_agg(bp.guest_name order by bp.guest_name)
        filter (where bp.guest_name is not null),
      '{}'::text[]
    ),
    b.partner_wanted,
    greatest(bt.max_players - 1 - count(bp.id)::integer, 0),
    bool_or(bp.member_id = private.current_member_id()) is true
  from public.bookings b
  join public.booking_types bt on bt.id = b.booking_type_id
  left join public.members m on m.id = b.member_id
  left join public.booking_players bp on bp.booking_id = b.id
  left join public.members pm on pm.id = bp.member_id
  where b.status = 'active'
    and private.is_member()
    and b.slot && tstzrange(
          (p_date::timestamp) at time zone 'Europe/Berlin',
          ((p_date + 1)::timestamp) at time zone 'Europe/Berlin', '[)')
  group by b.id, b.court_id, b.slot, b.kind, bt.code, bt.name, bt.max_players, b.title,
           m.first_name, m.last_name, b.member_id
  order by lower(b.slot);
$$;

revoke execute on function public.day_schedule(date) from public, anon;
grant  execute on function public.day_schedule(date) to authenticated;
