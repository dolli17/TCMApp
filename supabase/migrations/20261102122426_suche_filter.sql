-- ===========================================================================
-- Mitspielersuche mit LK-Bereich und Geschlecht
--
-- Entscheidung des Vereins (02.11.2026): Wer Mitspieler sucht, kann die Suche
-- auf einen LK-Bereich (1,0 = beste, 25,0 = schwaechste) und auf Damen oder
-- Herren einschraenken.
--
-- - bookings bekommt partner_lk_von, partner_lk_bis, partner_fuer. Ein
--   Trigger leert sie, sobald partner_wanted aus ist - egal, wer die Suche
--   beendet (Bucher, voll, Storno, Austragen).
-- - private.lk_zahl liest die LK aus members.tennis_lk (Text).
-- - private.passt_zur_suche entscheidet, ob ein Mitglied zur Suche passt:
--     LK lesbar: von <= LK <= bis (fehlende Grenze = offen).
--     Ohne LK:   nur wenn bis fehlt oder 25 ist.
--     fuer null: alle; female/male: dieses Geschlecht oder divers;
--     ohne Angabe zum Geschlecht nur bei fuer null.
-- - open_matches zeigt eine Suche nur, wer passt. Bucher, Eingetragene und
--   Platzverwalter (darf_plaetze) sehen sie wie bisher. join_booking setzt
--   dieselbe Regel durch. Wen der Bucher selbst eintraegt, ist frei.
-- - create_booking und set_partner_wanted nehmen die Filter als neue
--   Parameter mit Default null; von = 1 und bis = 25 werden als "keine
--   Grenze" (null) gespeichert.
-- - open_matches und day_schedule liefern die Filter hinten angehaengt.
--
-- Abwaertskompatibel: Alte Clients (auch die Expo-App) rufen die RPCs ohne
-- die neuen Parameter auf und bekommen das bisherige Verhalten. Signaturen
-- werden per drop + create mit Defaults erweitert, Rechte neu vergeben.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Spalten
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column if not exists partner_lk_von numeric(3,1),
  add column if not exists partner_lk_bis numeric(3,1),
  add column if not exists partner_fuer   text;

alter table public.bookings
  add constraint bookings_partner_lk_von_bereich
    check (partner_lk_von between 1 and 25),
  add constraint bookings_partner_lk_bis_bereich
    check (partner_lk_bis between 1 and 25),
  add constraint bookings_partner_lk_reihenfolge
    check (partner_lk_von <= partner_lk_bis),
  add constraint bookings_partner_fuer_werte
    check (partner_fuer in ('female', 'male'));

comment on column public.bookings.partner_lk_von is
  'Mitspielersuche: beste LK, die mitspielen darf (1,0 = beste). null = keine Grenze.';
comment on column public.bookings.partner_lk_bis is
  'Mitspielersuche: schwaechste LK, die mitspielen darf (25,0 = schwaechste). null = keine Grenze; ohne LK sieht man die Suche nur bei null oder 25.';
comment on column public.bookings.partner_fuer is
  'Mitspielersuche nur für female (Damen) oder male (Herren), jeweils auch divers. null = alle.';

/** Ohne Suche keine Filter: beim Abschalten werden sie geleert. */
create or replace function private.suchfilter_leeren()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not coalesce(new.partner_wanted, false) then
    new.partner_lk_von := null;
    new.partner_lk_bis := null;
    new.partner_fuer := null;
  end if;
  return new;
end;
$$;

revoke execute on function private.suchfilter_leeren() from public, anon, authenticated;

drop trigger if exists bookings_suchfilter_leeren on public.bookings;
create trigger bookings_suchfilter_leeren
  before insert or update of partner_wanted, partner_lk_von, partner_lk_bis, partner_fuer
  on public.bookings
  for each row execute function private.suchfilter_leeren();

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------

/**
 * LK aus dem Freitext in members.tennis_lk: "LK12,3", "LK 12.3", "12,3",
 * "12" ... Nicht lesbar, mehr als eine Nachkommastelle oder ausserhalb
 * 1-25 ergibt null.
 */
create or replace function private.lk_zahl(p_text text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when z between 1 and 25 then z end
  from (
    select replace(substring(p_text from '^\s*(?:[Ll][Kk])?\s*([0-9]{1,2}(?:[.,][0-9])?)\s*$'),
                   ',', '.')::numeric as z
  ) t;
$$;

revoke execute on function private.lk_zahl(text) from public, anon, authenticated;

/**
 * Passt das Mitglied zu einer Suche mit diesen Filtern? Regeln siehe Kopf.
 * Ein unbekanntes Mitglied zaehlt wie eines ohne LK und ohne Geschlecht.
 */
create or replace function private.passt_zur_suche(
  p_member_id uuid, p_lk_von numeric, p_lk_bis numeric, p_fuer text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when lk is null then p_lk_bis is null or p_lk_bis >= 25
         else (p_lk_von is null or lk >= p_lk_von)
          and (p_lk_bis is null or lk <= p_lk_bis)
    end
    and (p_fuer is null
         or gender::text = p_fuer
         or gender = 'diverse'::public.gender) is true
  from (
    select private.lk_zahl(m.tennis_lk) as lk, m.gender
    from (select 1) eins
    left join public.members m on m.id = p_member_id
  ) t;
$$;

revoke execute on function private.passt_zur_suche(uuid, numeric, numeric, text) from public, anon, authenticated;

/**
 * Prueft die Filter einer Suche und gibt sie normalisiert zurueck: von = 1
 * und bis = 25 schraenken nichts ein und werden zu null, nur_fuer wird klein
 * geschrieben, leer wird null.
 */
create or replace function private.suchfilter_pruefen(
  p_lk_von numeric, p_lk_bis numeric, p_fuer text,
  out lk_von numeric, out lk_bis numeric, out nur_fuer text
)
language plpgsql
immutable
set search_path = ''
as $$
begin
  if (p_lk_von is not null and (p_lk_von < 1 or p_lk_von > 25))
     or (p_lk_bis is not null and (p_lk_bis < 1 or p_lk_bis > 25)) then
    raise exception 'Die LK muss zwischen 1 und 25 liegen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_lk_von <> round(p_lk_von, 1) or p_lk_bis <> round(p_lk_bis, 1) then
    raise exception 'Die LK hat höchstens eine Nachkommastelle.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_lk_von > p_lk_bis then
    raise exception 'Beim LK-Bereich darf „von“ nicht größer sein als „bis“.'
      using errcode = 'invalid_parameter_value';
  end if;

  nur_fuer := lower(nullif(btrim(p_fuer), ''));
  if nur_fuer is not null and nur_fuer not in ('female', 'male') then
    raise exception 'Die Suche kann nur auf Damen oder Herren eingeschränkt werden.'
      using errcode = 'invalid_parameter_value';
  end if;

  lk_von := nullif(p_lk_von, 1);
  lk_bis := nullif(p_lk_bis, 25);
end;
$$;

revoke execute on function private.suchfilter_pruefen(numeric, numeric, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_booking: Filter beim Anlegen
-- ---------------------------------------------------------------------------

drop function if exists public.create_booking(uuid, timestamptz, text, uuid[], text[], boolean);

create function public.create_booking(
  p_court_id uuid, p_starts_at timestamp with time zone, p_booking_type_code text,
  p_player_member_ids uuid[] default '{}'::uuid[], p_guest_names text[] default '{}'::text[],
  p_partner_wanted boolean default false,
  p_partner_lk_von numeric default null, p_partner_lk_bis numeric default null,
  p_partner_fuer text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
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
  v_filter record;
begin
  if v_me is null then
    raise exception 'Nur Mitglieder können buchen.' using errcode = 'insufficient_privilege';
  end if;
  perform private.pruefe_freigeschaltet();

  select * into v_type from public.booking_types where code = p_booking_type_code and active;
  if not found then
    raise exception 'Unbekannte Buchungsart: %', p_booking_type_code
      using errcode = 'invalid_parameter_value';
  end if;
  if v_type.applies_to <> 'booking' then
    raise exception 'Die Art "%" ist eine Blockung und kann nicht regulär gebucht werden.', v_type.name
      using errcode = 'invalid_parameter_value';
  end if;
  -- Beschraenkte Buchungsarten sind seit der Rollenzusammenlegung Admin-Sache.
  if v_type.allowed_roles is not null and not private.is_admin() then
    raise exception 'Für "%" fehlt dir die Berechtigung.', v_type.name
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
    raise exception 'Es kann höchstens % Tage im Voraus gebucht werden.', v_lead_days
      using errcode = 'invalid_parameter_value';
  end if;

  -- Filter gelten nur mit Suche; ohne Suche leert sie der Trigger ohnehin.
  if coalesce(p_partner_wanted, false) then
    select * into v_filter
    from private.suchfilter_pruefen(p_partner_lk_von, p_partner_lk_bis, p_partner_fuer);
  else
    select null::numeric as lk_von, null::numeric as lk_bis, null::text as nur_fuer into v_filter;
  end if;

  v_players := 1 + coalesce(array_length(p_player_member_ids, 1), 0) + v_gaeste;

  -- Wer Mitspieler sucht, darf die Untergrenze noch nicht erfuellen: genau
  -- dafuer ist das Feld da. Die Obergrenze gilt trotzdem.
  if not p_partner_wanted then
    if v_type.requires_partner and v_players < 2 then
      raise exception 'Für "%" musst du mindestens einen Mitspieler angeben.', v_type.name
        using errcode = 'invalid_parameter_value';
    end if;
    if v_players < v_type.min_players then
      raise exception '"%" braucht mindestens % Spieler.', v_type.name, v_type.min_players
        using errcode = 'invalid_parameter_value';
    end if;
  end if;
  if v_players > v_type.max_players then
    raise exception '"%" erlaubt höchstens % Spieler.', v_type.name, v_type.max_players
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

  -- Rate-Limit (Audit 3.1): Anlegen und Stornieren im Wechsel benachrichtigt
  -- die Mitspieler jedes Mal. Die Grenze je Buchung greift dort nicht, deshalb
  -- hier je Mitglied.
  if cardinality(coalesce(p_player_member_ids, '{}')) > 0 and not private.is_admin() then
    if (select count(*) from private.besetzung_aenderungen a
         where a.changed_by = v_me and a.angelegt
           and a.changed_at > now() - interval '1 hour') >= 20 then
      raise exception 'Du hast in der letzten Stunde zu viele Buchungen mit Mitspielern angelegt. Bitte versuche es später noch einmal.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Kontingent: 0 bedeutet unbegrenzt. Die Regel bleibt vollstaendig erhalten,
  -- damit der Vorstand sie in knappen Zeiten wieder einschalten kann.
  if v_max_open > 0 and v_type.counts_towards_quota then
    if private.open_booking_count(v_me) >= v_max_open then
      raise exception 'Du hast bereits % offene Buchungen. Mehr sind nicht möglich.', v_max_open
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
      (court_id, slot, kind, booking_type_id, member_id, created_by, partner_wanted,
       partner_lk_von, partner_lk_bis, partner_fuer)
    values (p_court_id, tstzrange(p_starts_at, v_ends_at, '[)'), 'booking', v_type.id,
            v_me, v_me, coalesce(p_partner_wanted, false),
            v_filter.lk_von, v_filter.lk_bis, v_filter.nur_fuer)
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

  if cardinality(coalesce(p_player_member_ids, '{}')) > 0 then
    delete from private.besetzung_aenderungen where changed_at < now() - interval '1 day';
    insert into private.besetzung_aenderungen (booking_id, changed_by, angelegt)
    values (v_booking_id, v_me, true);
  end if;

  -- Wer eingetragen wurde, soll es erfahren, ohne den Plan aufzuschlagen.
  insert into public.notifications (member_id, kind, title, body, booking_id)
  select v_player_id, 'booking_added', 'Du bist als Mitspieler eingetragen',
         format('%s hat dich für %s eingetragen.',
                private.member_label(v_me), private.booking_label(v_booking_id)),
         v_booking_id
  from unnest(coalesce(p_player_member_ids, '{}')) as v_player_id;

  return v_booking_id;
end;
$function$;

revoke execute on function public.create_booking(uuid, timestamptz, text, uuid[], text[], boolean, numeric, numeric, text) from public, anon;
grant  execute on function public.create_booking(uuid, timestamptz, text, uuid[], text[], boolean, numeric, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- set_partner_wanted: Suche ein- und ausschalten, Filter setzen oder aendern
-- ---------------------------------------------------------------------------

drop function if exists public.set_partner_wanted(uuid, boolean);

create function public.set_partner_wanted(
  p_booking_id uuid, p_wanted boolean,
  p_lk_von numeric default null, p_lk_bis numeric default null, p_fuer text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_type public.booking_types%rowtype;
  v_besetzt integer;
  v_filter record;
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.member_id is distinct from v_me and not private.darf_plaetze() then
    raise exception 'Nur der Bucher kann Mitspieler suchen.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_booking.status <> 'active' then
    raise exception 'Diese Buchung ist storniert.' using errcode = 'check_violation';
  end if;

  if p_wanted then
    select * into v_filter from private.suchfilter_pruefen(p_lk_von, p_lk_bis, p_fuer);

    select * into v_type from public.booking_types where id = v_booking.booking_type_id;
    select 1 + count(*)::integer into v_besetzt
    from public.booking_players bp where bp.booking_id = p_booking_id;
    if v_besetzt >= v_type.max_players then
      raise exception 'Die Buchung ist voll - es ist kein Platz mehr frei.'
        using errcode = 'check_violation';
    end if;

    update public.bookings
       set partner_wanted = true,
           partner_lk_von = v_filter.lk_von,
           partner_lk_bis = v_filter.lk_bis,
           partner_fuer = v_filter.nur_fuer
     where id = p_booking_id;
  else
    -- Die Filter leert der Trigger.
    update public.bookings set partner_wanted = false where id = p_booking_id;
  end if;
end;
$$;

revoke execute on function public.set_partner_wanted(uuid, boolean, numeric, numeric, text) from public, anon;
grant  execute on function public.set_partner_wanted(uuid, boolean, numeric, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- open_matches: nur Suchen, zu denen man passt; Filter hinten angehaengt
-- ---------------------------------------------------------------------------

drop function if exists public.open_matches(date, date);

create function public.open_matches(p_von date default null, p_bis date default null)
returns table (booking_id uuid, court_name text, starts_at timestamp with time zone, ends_at timestamp with time zone, type_code text, type_name text, owner_name text, owner_member_id uuid, players text[], frei integer, bin_dabei boolean, lk_von numeric, lk_bis numeric, fuer text)
language sql
stable
security definer
set search_path = ''
as $function$
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
      or b.member_id = (select id from ich),
    b.partner_lk_von,
    b.partner_lk_bis,
    b.partner_fuer
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
    -- S15: Was laenger als eine Woche vorbei ist, sehen nur Beteiligte.
    and private.buchung_sichtbar(b.id)
    -- Eingeschraenkte Suche: nur wer passt. Bucher, Eingetragene und
    -- Platzverwalter sehen sie immer.
    and (b.member_id = (select id from ich)
         or exists (select 1 from public.booking_players ich_bp
                     where ich_bp.booking_id = b.id
                       and ich_bp.member_id = (select id from ich))
         or private.darf_plaetze()
         or private.passt_zur_suche((select id from ich),
                                    b.partner_lk_von, b.partner_lk_bis, b.partner_fuer))
  group by b.id, c.name, b.slot, bt.code, bt.name, bt.max_players, b.member_id
  having bt.max_players - 1 - count(bp.id) > 0
  order by lower(b.slot);
$function$;

revoke execute on function public.open_matches(date, date) from public, anon;
grant  execute on function public.open_matches(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- day_schedule: Filter hinten angehaengt, damit das Buchungsblatt sie zeigt
-- ---------------------------------------------------------------------------

drop function if exists public.day_schedule(date);

create function public.day_schedule(p_date date)
returns table (booking_id uuid, court_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, kind public.booking_kind, type_code text, type_name text, title text, owner_name text, owner_member_id uuid, is_own boolean, players text[], player_member_ids uuid[], guest_names text[], partner_wanted boolean, frei integer, bin_dabei boolean, series_id uuid, partner_lk_von numeric, partner_lk_bis numeric, partner_fuer text)
language sql
stable
security definer
set search_path = ''
as $function$
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
    bool_or(bp.member_id = private.current_member_id()) is true,
    b.series_id,
    b.partner_lk_von,
    b.partner_lk_bis,
    b.partner_fuer
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
    -- S15: Was laenger als eine Woche vorbei ist, sehen nur Beteiligte.
    and private.buchung_sichtbar(b.id)
  group by b.id, b.court_id, b.slot, b.kind, bt.code, bt.name, bt.max_players, b.title,
           m.first_name, m.last_name, b.member_id, b.series_id
  order by lower(b.slot);
$function$;

revoke execute on function public.day_schedule(date) from public, anon;
grant  execute on function public.day_schedule(date) to authenticated;

-- ---------------------------------------------------------------------------
-- join_booking: nur wer zur Suche passt
-- ---------------------------------------------------------------------------

create or replace function public.join_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
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
  perform private.pruefe_freigeschaltet();

  -- Die Sperre reiht gleichzeitige Beitritte hintereinander. Ohne sie
  -- zaehlen zwei dieselbe Besetzung, und beide kommen hinein (B6).
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.status <> 'active' then
    raise exception 'Diese Buchung ist storniert.' using errcode = 'check_violation';
  end if;
  if not v_booking.partner_wanted then
    raise exception 'Für diese Buchung werden keine Mitspieler gesucht.'
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
  -- Wie in open_matches: Platzverwalter sehen jede Suche und duerfen deshalb
  -- auch jeder beitreten.
  if not private.darf_plaetze()
     and not private.passt_zur_suche(v_me, v_booking.partner_lk_von,
                                     v_booking.partner_lk_bis, v_booking.partner_fuer) then
    raise exception 'Diese Suche richtet sich an andere Spieler (LK oder Damen/Herren).'
      using errcode = 'check_violation';
  end if;

  select * into v_type from public.booking_types where id = v_booking.booking_type_id;

  select 1 + count(*)::integer into v_besetzt
  from public.booking_players bp where bp.booking_id = p_booking_id;

  if v_besetzt >= v_type.max_players then
    raise exception 'Diese Buchung ist bereits voll.' using errcode = 'check_violation';
  end if;

  if v_max_open > 0 and v_type.counts_towards_quota
     and private.open_booking_count(v_me) >= v_max_open then
    raise exception 'Du hast bereits % offene Buchungen. Mehr sind nicht möglich.', v_max_open
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
          format('%s hat sich für %s eingetragen.',
                 private.member_label(v_me), private.booking_label(p_booking_id)));
end; $function$;

