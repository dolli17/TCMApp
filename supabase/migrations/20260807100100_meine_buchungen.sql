-- ===========================================================================
-- Meine Buchungen und Benachrichtigungen
--
-- Die Tabelle public.notifications gibt es seit dem ersten Tag: mit RLS, mit
-- Indizes, mit einer Policy fuers Als-gelesen-Markieren. Geschrieben hat sie
-- bisher genau eine Stelle - das Verdraengen durch eine Serie -, und gelesen
-- hat sie niemand. Wer als Mitspieler eingetragen oder wieder ausgetragen
-- wurde, erfuhr es nicht.
--
-- Diese Migration fuellt sie an allen Stellen, an denen sich die Besetzung
-- einer Buchung aendert, und gibt den Mitgliedern zwei Sichten darauf:
-- my_bookings (was steht an?) und my_notifications (was hat sich geaendert?).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Ein Termin in einem Satz - fuer die Texte der Benachrichtigungen
-- ---------------------------------------------------------------------------
create or replace function private.booking_label(p_booking_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select format('%s um %s Uhr auf %s',
                to_char(lower(b.slot) at time zone 'Europe/Berlin', 'DD.MM.YYYY'),
                to_char(lower(b.slot) at time zone 'Europe/Berlin', 'HH24:MI'),
                coalesce(c.name, 'dem Platz'))
  from public.bookings b
  left join public.courts c on c.id = b.court_id
  where b.id = p_booking_id;
$$;

create or replace function private.member_label(p_member_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    nullif(btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')), ''),
    'Ein Mitglied')
  from public.members m where m.id = p_member_id;
$$;

-- ---------------------------------------------------------------------------
-- Was steht an?
-- ---------------------------------------------------------------------------

/**
 * Kuenftige Buchungen des angemeldeten Mitglieds - eigene und die, in denen es
 * als Mitspieler steht.
 *
 * Genau diese Vereinigung ist der Grund fuer die Funktion: mit einer
 * Tabellenabfrage muesste die App zwei Anfragen stellen und selbst
 * zusammenfuehren, und die Trennung "gebucht" gegen "eingetragen" ginge dabei
 * verloren. bin_bucher entscheidet, ob die Oberflaeche Stornieren oder
 * Austragen anbietet.
 */
create or replace function public.my_bookings(p_ab date default null)
returns table (
  booking_id uuid, court_name text, starts_at timestamptz, ends_at timestamptz,
  type_code text, type_name text, title text, kind public.booking_kind,
  owner_name text, players text[], bin_bucher boolean
)
language sql stable security definer set search_path = '' as $$
  with ich as (select private.current_member_id() as id),
  ab as (
    select coalesce(p_ab, (now() at time zone 'Europe/Berlin')::date) as tag
  )
  select
    b.id,
    c.name,
    lower(b.slot),
    upper(b.slot),
    bt.code,
    bt.name,
    b.title,
    b.kind,
    private.member_label(b.member_id),
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
    b.member_id = (select id from ich)
  from public.bookings b
  join public.booking_types bt on bt.id = b.booking_type_id
  left join public.courts c on c.id = b.court_id
  left join public.booking_players bp on bp.booking_id = b.id
  left join public.members pm on pm.id = bp.member_id
  where b.status = 'active'
    and (select id from ich) is not null
    and upper(b.slot) >= ((select tag from ab)::timestamp) at time zone 'Europe/Berlin'
    and (
      b.member_id = (select id from ich)
      or exists (
        select 1 from public.booking_players x
        where x.booking_id = b.id and x.member_id = (select id from ich)
      )
    )
  group by b.id, c.name, b.slot, bt.code, bt.name, b.title, b.kind, b.member_id
  order by lower(b.slot);
$$;

revoke execute on function public.my_bookings(date) from public, anon;
grant  execute on function public.my_bookings(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Sich selbst austragen
-- ---------------------------------------------------------------------------

/**
 * Ein Mitspieler traegt sich aus einer fremden Buchung aus.
 *
 * Bewusst keine allgemeine "entferne Spieler X"-Funktion: die gibt es schon als
 * update_booking_players, und die gehoert dem Bucher. Hier geht es nur um den
 * eigenen Platz - deshalb reicht die Buchungs-Id als Parameter.
 *
 * Die Untergrenze wird geprueft, bevor jemand geht. Ein Doppel, aus dem sich
 * der dritte Spieler stillschweigend austraegt, waere sonst regelwidrig
 * besetzt, ohne dass es jemand merkt - und der Bucher stuende am Platz.
 */
create or replace function public.leave_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_type public.booking_types%rowtype;
  v_danach integer;
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
  if v_booking.member_id = v_me then
    raise exception 'Als Bucher kannst du dich nicht austragen. Storniere die Buchung stattdessen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.booking_players bp
                  where bp.booking_id = p_booking_id and bp.member_id = v_me) then
    raise exception 'Du bist bei dieser Buchung nicht als Mitspieler eingetragen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if lower(v_booking.slot) <= now() then
    raise exception 'Die Spielzeit hat bereits begonnen.' using errcode = 'check_violation';
  end if;

  select * into v_type from public.booking_types where id = v_booking.booking_type_id;

  -- Nach dem Austragen: der Bucher plus alle Eintraege ausser dem eigenen.
  -- Gaeste zaehlen mit, sie stehen ja auch auf dem Platz.
  select 1 + count(*) filter (where bp.member_id is distinct from v_me)::integer
    into v_danach
  from public.booking_players bp where bp.booking_id = p_booking_id;

  if v_danach < v_type.min_players then
    raise exception 'Ohne dich waeren es zu wenige Spieler. Bitte sag dem Bucher Bescheid.'
      using errcode = 'check_violation';
  end if;

  delete from public.booking_players
   where booking_id = p_booking_id and member_id = v_me;

  insert into public.notifications (member_id, kind, title, body)
  values (v_booking.member_id, 'player_left', 'Ein Mitspieler hat sich ausgetragen',
          format('%s spielt am %s nicht mit.',
                 private.member_label(v_me), private.booking_label(p_booking_id)));
end; $$;

revoke execute on function public.leave_booking(uuid) from public, anon;
grant  execute on function public.leave_booking(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Benachrichtigungen lesen
-- ---------------------------------------------------------------------------
create or replace function public.my_notifications(p_limit integer default 30)
returns table (
  id uuid, kind text, title text, body text,
  read_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select n.id, n.kind, n.title, n.body, n.read_at, n.created_at
  from public.notifications n
  where n.member_id = private.current_member_id()
  order by (n.read_at is null) desc, n.created_at desc
  limit greatest(coalesce(p_limit, 30), 1);
$$;

revoke execute on function public.my_notifications(integer) from public, anon;
grant  execute on function public.my_notifications(integer) to authenticated;

/**
 * Als gelesen markieren.
 *
 * Geht auch ohne RPC ueber den Spalten-Grant auf read_at - aber nur eine Zeile
 * je Anfrage und ohne Schutz davor, ein fremdes read_at zu setzen, falls die
 * Policy einmal wackelt. Ein Aufruf fuer die ganze Liste ist ausserdem das,
 * was die Glocke beim Oeffnen braucht.
 */
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.current_member_id(); v_anzahl integer;
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;

  -- Ohne Liste alles - so muss die Glocke nicht erst alle Ids einsammeln.
  update public.notifications
     set read_at = now()
   where member_id = v_me
     and read_at is null
     and (p_ids is null or id = any (p_ids));

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end; $$;

revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant  execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ===========================================================================
-- Die drei RPCs, die die Besetzung aendern, benachrichtigen ab jetzt
-- ===========================================================================

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

  -- Wer eingetragen wurde, soll es erfahren, ohne den Plan aufzuschlagen.
  insert into public.notifications (member_id, kind, title, body)
  select v_player_id, 'booking_added', 'Du bist als Mitspieler eingetragen',
         format('%s hat dich fuer %s eingetragen.',
                private.member_label(v_me), private.booking_label(v_booking_id))
  from unnest(coalesce(p_player_member_ids, '{}')) as v_player_id;

  return v_booking_id;
end; $$;
revoke execute on function public.create_booking(uuid, timestamptz, text, uuid[], text[]) from public, anon;
grant execute on function public.create_booking(uuid, timestamptz, text, uuid[], text[]) to authenticated;


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
         cancellation_reason = p_reason
   where id = p_booking_id;

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
  -- Dieselbe Untergrenze wie beim Anlegen. Ohne sie waere die Regel nur eine
  -- Huerde beim ersten Speichern und danach beliebig zu umgehen.
  if v_players < v_type.min_players then
    raise exception '"%" braucht mindestens % Spieler.', v_type.name, v_type.min_players
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
