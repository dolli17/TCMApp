-- ===========================================================================
-- Security-Audit, bestaetigte Befunde (run-1, Abschnitt 3)
--
-- 3.1 Benachrichtigungs-Warteschlange: Ein Mitglied konnte ueber
--     update_booking_players beliebig viele Benachrichtigungen erzeugen. Die
--     Abholung nahm global die aeltesten 200 Zeilen, hakte sie ab und filterte
--     erst danach. Mit genug Rueckstand gingen andere Mails still verloren,
--     auch die SEPA-Vorabankuendigung.
--     - Abholen filtert jetzt zuerst. Was nicht zugestellt wird (zu alt, Art
--       nicht gewuenscht, keine Adresse, kein Geraet), wird vorher in einem
--       eigenen Schritt abgehakt und als verworfen markiert
--       (mail_discarded_at, push_discarded_at). So belegt es keinen Platz im
--       Lauf, und es ist nachvollziehbar, was nie rausging.
--     - charge_announced verfaellt nie nach Alter: lieber spaet als gar nicht.
--     - Fair: hoechstens 20 Benachrichtigungen je Empfaenger und Lauf, wichtige
--       Arten zuerst.
--     - Hoechstens 20 Aenderungen der Mitspieler je Buchung und Stunde
--       (update_booking_players), hoechstens 20 Buchungen mit Mitspielern je
--       Mitglied und Stunde (create_booking). Admins sind ausgenommen.
--     - Noch nicht verschickte booking_added/booking_removed fuer denselben
--       Empfaenger und dieselbe Buchung heben sich auf. Dafuer merkt sich die
--       Benachrichtigung die Buchung (booking_id).
-- 3.2 Mitspieler ohne Zustimmung: leave_booking verweigert den Austritt nicht
--     mehr. Faellt die Buchung unter die Untergrenze, sucht sie Mitspieler.
-- 3.3 Nachruecken ohne Zugang: event_nachruecken ueberspringt Wartende ohne
--     Zugang. end_membership (Ende heute oder frueher) und
--     set_login_disabled(true) nehmen das Mitglied von den Wartelisten
--     kuenftiger Veranstaltungen.
-- 3.4 S15-Umgehung: day_schedule, open_matches und booking_players_select
--     zeigen Buchungen, die laenger als 7 Tage vorbei sind, nur Beteiligten
--     (Bucher oder Mitspieler) und Admins.
-- 3.5 Platzwart und Gastgebuehren: Nach Spielbeginn aendern nur Admins die
--     Besetzung; Gastgebuehren gleicht update_booking_players nur ab, wenn ein
--     Admin handelt oder das Spiel noch nicht begonnen hat.
--
-- Abwaertskompatibel: Signaturen, Rueckgaben und Rechte bleiben (create or
-- replace). Neue Spalten sind nullable. mailed_at/pushed_at bedeuten weiter
-- "abgehakt"; ob wirklich verschickt, sagt jetzt zusaetzlich *_discarded_at.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 3.1 Spalten und Hilfsfunktionen
-- ---------------------------------------------------------------------------

alter table public.notifications
  add column if not exists booking_id uuid references public.bookings (id) on delete set null,
  add column if not exists mail_discarded_at timestamptz,
  add column if not exists push_discarded_at timestamptz;

comment on column public.notifications.booking_id is
  'Die Buchung, um die es geht (nur booking_added/booking_removed). Dient dem Zusammenfassen noch nicht verschickter Nachrichten.';
comment on column public.notifications.mail_discarded_at is
  'Abgehakt, aber nie als Mail verschickt (zu alt, Art nicht gewuenscht, keine gueltige Adresse).';
comment on column public.notifications.push_discarded_at is
  'Abgehakt, aber nie als Push verschickt (zu alt, Art nicht gewuenscht, kein Geraet).';

create index if not exists notifications_booking_idx
  on public.notifications (booking_id, member_id, kind) where booking_id is not null;

/** Reihenfolge beim Abholen: kleiner zuerst. */
create or replace function private.benachrichtigung_rang(p_kind text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'charge_announced' then 0
    when 'event_cancelled' then 1
    when 'booking_displaced' then 1
    else 2
  end;
$$;

/**
 * Darf diese Benachrichtigung noch per Mail raus? Die SEPA-Vorabankuendigung
 * verfaellt nie nach Alter, alles andere nach einem Tag.
 */
create or replace function private.mail_zustellbar(p_member_id uuid, p_kind text, p_created_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members m
    cross join lateral (select private.notification_mail_preference(m.id) as wahl) w
    where m.id = p_member_id
      and m.status = 'active'
      and m.email is not null
      -- Grobe Formpruefung: der Stapelversand lehnt sonst wegen einer kaputten
      -- Adresse die ganze Anfrage ab.
      and m.email::text ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
      -- Reservierte Testadressen nie anschreiben (siehe ist_testadresse).
      and not public.ist_testadresse(m.email::text)
      and (p_kind = 'charge_announced' or p_created_at > now() - interval '1 day')
      and w.wahl <> 'keine'
      and (w.wahl = 'alle' or p_kind = any (private.notification_mail_kinds()))
  );
$$;

/** Wie mail_zustellbar, fuer Pushes: aktives Mitglied mit Geraet. */
create or replace function private.push_zustellbar(p_member_id uuid, p_kind text, p_created_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members m
    where m.id = p_member_id
      and m.status = 'active'
      and (p_kind = 'charge_announced' or p_created_at > now() - interval '1 day')
      and p_kind = any (private.notification_push_kinds())
      and exists (
        select 1 from public.push_tokens p
         where p.member_id = m.id and p.disabled_at is null
      )
  );
$$;

revoke execute on function private.benachrichtigung_rang(text) from public, anon, authenticated;
revoke execute on function private.mail_zustellbar(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function private.push_zustellbar(uuid, text, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3.1 Abholen: erst filtern, dann abhaken, fair je Empfaenger
-- ---------------------------------------------------------------------------

create or replace function public.claim_notification_mails(p_limit integer default 200)
returns table (member_id uuid, email text, first_name text, notification_ids uuid[], items jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Je Empfaenger und Lauf. Ein Mitglied, das mit Nachrichten geflutet wird,
  -- haelt so nicht alle anderen auf.
  c_je_empfaenger constant integer := 20;
begin
  -- Angemeldete Menschen haben hier nichts zu suchen; der Aufrufer ist der
  -- Versanddienst mit Dienstschluessel (auth.uid() ist dann null) oder ein
  -- Admin, der von Hand anstoesst.
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Benachrichtigungs-Mails darf nur der Versanddienst abholen.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Zwei Laeufe duerfen sich nicht ueberholen.
  perform pg_advisory_xact_lock(hashtext('notification_mails'));

  -- Was nie als Mail rausgeht, verlaesst die Warteschlange hier, ohne einen
  -- Platz im Lauf zu belegen. Abgehakt, damit es den Index nicht verstopft,
  -- und als verworfen markiert, damit niemand es fuer verschickt haelt.
  update public.notifications n
     set mailed_at = now(), mail_discarded_at = now()
   where n.mailed_at is null
     and not private.mail_zustellbar(n.member_id, n.kind, n.created_at);

  return query
  with offen as (
    select n.id, n.created_at, private.benachrichtigung_rang(n.kind) as rang,
           row_number() over (partition by n.member_id
                              order by private.benachrichtigung_rang(n.kind), n.created_at, n.id) as nr
    from public.notifications n
    where n.mailed_at is null
      and private.mail_zustellbar(n.member_id, n.kind, n.created_at)
  ),
  kandidaten as (
    select n.id from public.notifications n
    where n.id in (
      select o.id from offen o
      where o.nr <= c_je_empfaenger
      order by o.rang, o.created_at, o.id
      limit greatest(coalesce(p_limit, 200), 1)
    )
    for update skip locked
  ),
  abgehakt as (
    update public.notifications n
       set mailed_at = now()
      from kandidaten k
     where n.id = k.id
    returning n.id, n.member_id, n.kind, n.title, n.body, n.created_at, n.event_id
  )
  select
    m.id,
    m.email::text,
    m.first_name,
    array_agg(a.id order by a.created_at),
    jsonb_agg(jsonb_build_object(
      'kind', a.kind, 'title', a.title, 'body', a.body, 'created_at', a.created_at,
      'event_id', a.event_id
    ) order by a.created_at)
  from abgehakt a
  join public.members m on m.id = a.member_id
  group by m.id, m.email, m.first_name;
end;
$$;

create or replace function public.claim_notification_pushes(p_limit integer default 200)
returns table (member_id uuid, tokens text[], notification_ids uuid[], items jsonb, geraete jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_je_empfaenger constant integer := 20;
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Push-Benachrichtigungen darf nur der Versanddienst abholen.'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext('notification_pushes'));

  -- Wie bei den Mails: Unzustellbares vorher abhaken und als verworfen
  -- markieren.
  update public.notifications n
     set pushed_at = now(), push_discarded_at = now()
   where n.pushed_at is null
     and not private.push_zustellbar(n.member_id, n.kind, n.created_at);

  return query
  with offen as (
    select n.id, n.created_at, private.benachrichtigung_rang(n.kind) as rang,
           row_number() over (partition by n.member_id
                              order by private.benachrichtigung_rang(n.kind), n.created_at, n.id) as nr
    from public.notifications n
    where n.pushed_at is null
      and private.push_zustellbar(n.member_id, n.kind, n.created_at)
  ),
  kandidaten as (
    select n.id from public.notifications n
    where n.id in (
      select o.id from offen o
      where o.nr <= c_je_empfaenger
      order by o.rang, o.created_at, o.id
      limit greatest(coalesce(p_limit, 200), 1)
    )
    for update skip locked
  ),
  abgehakt as (
    update public.notifications n
       set pushed_at = now()
      from kandidaten k
     where n.id = k.id
    returning n.id, n.member_id, n.kind, n.title, n.body, n.created_at, n.event_id
  )
  -- Die Marken als Unterabfrage und nicht als Join: bei zwei Geraeten
  -- verdoppelte der Join jede Nachricht, und ein distinct darueber haette die
  -- Sortierung nach Zeitpunkt gekostet.
  select
    m.id,
    coalesce((select array_agg(p.token order by p.last_seen_at desc)
                from public.push_tokens p
               where p.member_id = m.id and p.disabled_at is null
                 and p.provider = 'expo'), '{}'::text[]),
    array_agg(a.id order by a.created_at),
    jsonb_agg(jsonb_build_object(
      'kind', a.kind, 'title', a.title, 'body', a.body, 'created_at', a.created_at,
      'event_id', a.event_id
    ) order by a.created_at),
    (select jsonb_agg(jsonb_build_object('token', p.token, 'provider', p.provider)
                      order by p.last_seen_at desc)
       from public.push_tokens p
      where p.member_id = m.id and p.disabled_at is null)
  from abgehakt a
  join public.members m on m.id = a.member_id
  group by m.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3.1 Rate-Limit fuer Mitspieleraenderungen
-- ---------------------------------------------------------------------------

/**
 * Jede Aenderung der Mitglieder in einer Besetzung, die Benachrichtigungen
 * ausloest. Nur fuer das Rate-Limit; Eintraege aelter als ein Tag raeumt die
 * naechste Aenderung weg.
 */
create table if not exists private.besetzung_aenderungen (
  id         bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  changed_by uuid not null references public.members (id) on delete cascade,
  angelegt   boolean not null default false,
  changed_at timestamptz not null default now()
);

create index if not exists besetzung_aenderungen_booking_idx
  on private.besetzung_aenderungen (booking_id, changed_at);
create index if not exists besetzung_aenderungen_von_idx
  on private.besetzung_aenderungen (changed_by, changed_at) where angelegt;
create index if not exists besetzung_aenderungen_alt_idx
  on private.besetzung_aenderungen (changed_at);

revoke all on private.besetzung_aenderungen from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3.4 Sichtbarkeit einer Buchung (S15)
-- ---------------------------------------------------------------------------

/**
 * Darf der Aufrufer diese Buchung samt Besetzung sehen? Wie S15 auf bookings:
 * bis eine Woche nach dem Ende alle Mitglieder, danach nur Beteiligte (Bucher
 * oder Mitspieler) und Admins. Ob der Aufrufer ueberhaupt Mitglied ist, prueft
 * der Aufrufer selbst (is_member).
 */
create or replace function private.buchung_sichtbar(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
    where b.id = p_booking_id
      and (upper(b.slot) > now() - interval '7 days'
           or b.member_id = private.current_member_id()
           or exists (select 1 from public.booking_players bp
                       where bp.booking_id = b.id
                         and bp.member_id = private.current_member_id())
           or private.is_admin())
  );
$$;

revoke execute on function private.buchung_sichtbar(uuid) from public, anon;
grant execute on function private.buchung_sichtbar(uuid) to authenticated;

drop policy if exists booking_players_select on public.booking_players;
create policy booking_players_select on public.booking_players
  for select to authenticated
  using ((select private.is_member()) and private.buchung_sichtbar(booking_id));

create or replace function public.day_schedule(p_date date)
returns table (booking_id uuid, court_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, kind public.booking_kind, type_code text, type_name text, title text, owner_name text, owner_member_id uuid, is_own boolean, players text[], player_member_ids uuid[], guest_names text[], partner_wanted boolean, frei integer, bin_dabei boolean, series_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
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
    b.series_id
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
$$;

create or replace function public.open_matches(p_von date default null, p_bis date default null)
returns table (booking_id uuid, court_name text, starts_at timestamp with time zone, ends_at timestamp with time zone, type_code text, type_name text, owner_name text, owner_member_id uuid, players text[], frei integer, bin_dabei boolean)
language sql
stable
security definer
set search_path = ''
as $$
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
    -- S15: Was laenger als eine Woche vorbei ist, sehen nur Beteiligte.
    and private.buchung_sichtbar(b.id)
  group by b.id, c.name, b.slot, bt.code, bt.name, bt.max_players, b.member_id
  having bt.max_players - 1 - count(bp.id) > 0
  order by lower(b.slot);
$$;

-- ---------------------------------------------------------------------------
-- 3.1, 3.5 update_booking_players
-- ---------------------------------------------------------------------------

create or replace function public.update_booking_players(p_booking_id uuid, p_member_ids uuid[] default '{}'::uuid[], p_guest_names text[] default '{}'::text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_type public.booking_types%rowtype;
  v_max_open integer := public.setting_int('booking.max_open_bookings');
  v_players integer; v_player uuid; v_guest text; v_blocker text;
  v_ist_admin boolean := private.darf_plaetze();
  v_vorher uuid[];
  v_neu uuid[];
  v_weg uuid[];
  v_label text;
  v_gaeste integer := coalesce(array_length(p_guest_names, 1), 0);
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;

  -- Gesperrt wie in join_booking: die Besetzung wird gleich gelesen,
  -- geloescht und neu geschrieben, dazwischen darf niemand beitreten (B6).
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.status <> 'active' then
    raise exception 'Diese Buchung ist storniert.' using errcode = 'check_violation';
  end if;
  if v_booking.member_id is distinct from v_me and not v_ist_admin then
    raise exception 'Du kannst nur deine eigenen Buchungen ändern.'
      using errcode = 'insufficient_privilege';
  end if;
  -- Nach Spielbeginn haengen an der Besetzung Gastgebuehren, die schon
  -- feststehen. Die zu aendern ist Finanzsache und damit Admins vorbehalten
  -- (Audit 3.5), nicht Platzwart oder Vorstand.
  if lower(v_booking.slot) <= now() and not private.is_admin() then
    if v_ist_admin then
      raise exception 'Nach Spielbeginn können nur Administratoren die Besetzung ändern.'
        using errcode = 'insufficient_privilege';
    end if;
    raise exception 'Die Spielzeit hat bereits begonnen.' using errcode = 'check_violation';
  end if;

  select * into v_type from public.booking_types where id = v_booking.booking_type_id;

  v_players := 1 + coalesce(array_length(p_member_ids, 1), 0) + v_gaeste;

  -- Solange Mitspieler gesucht werden, darf die Buchung unterbesetzt sein.
  if not v_booking.partner_wanted then
    if v_type.requires_partner and v_players < 2 then
      raise exception 'Für "%" musst du mindestens einen Mitspieler angeben.', v_type.name
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
    raise exception '"%" erlaubt höchstens % Spieler.', v_type.name, v_type.max_players
      using errcode = 'invalid_parameter_value';
  end if;
  if v_booking.member_id = any (p_member_ids) then
    raise exception 'Der Bucher ist schon dabei und muss nicht als Mitspieler eingetragen werden.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Die alte Besetzung merken, bevor sie geloescht wird: nur so laesst sich
  -- danach sagen, wer neu dazukam und wer gehen musste. Die Funktion tauscht
  -- vollstaendig aus, kennt also von sich aus keinen Unterschied.
  select coalesce(array_agg(bp.member_id), '{}')
    into v_vorher
  from public.booking_players bp
  where bp.booking_id = p_booking_id and bp.member_id is not null;

  v_neu := array(select distinct neu from unnest(coalesce(p_member_ids, '{}')) as neu
                  where not (neu = any (v_vorher)));
  v_weg := array(select alt from unnest(v_vorher) as alt
                  where not (alt = any (coalesce(p_member_ids, '{}'))));

  -- Rate-Limit (Audit 3.1): jede Aenderung der Mitglieder benachrichtigt
  -- andere. Ohne Grenze liesse sich damit die Warteschlange fluten.
  if (cardinality(v_neu) > 0 or cardinality(v_weg) > 0) and not private.is_admin() then
    if (select count(*) from private.besetzung_aenderungen a
         where a.booking_id = p_booking_id
           and a.changed_at > now() - interval '1 hour') >= 20 then
      raise exception 'Die Mitspieler dieser Buchung wurden in der letzten Stunde zu oft geändert. Bitte versuche es später noch einmal.'
        using errcode = 'check_violation';
    end if;
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
  -- aendert: er hat den Gast mitgebracht, nicht der Verwalter. Nach
  -- Spielbeginn gleicht nur ein Admin ab (Audit 3.5); oben ist das schon
  -- erzwungen, hier steht es noch einmal ausdruecklich.
  if private.is_admin() or lower(v_booking.slot) > now() then
    perform private.sync_guest_charges(p_booking_id, v_booking.member_id, v_gaeste);
  end if;

  -- Voll ist voll: die Buchung verschwindet aus den offenen Spielen.
  if v_booking.partner_wanted and v_players >= v_type.max_players then
    update public.bookings set partner_wanted = false where id = p_booking_id;
  end if;

  if cardinality(v_neu) > 0 or cardinality(v_weg) > 0 then
    delete from private.besetzung_aenderungen where changed_at < now() - interval '1 day';
    insert into private.besetzung_aenderungen (booking_id, changed_by)
    values (p_booking_id, v_me);
  end if;

  v_label := private.booking_label(p_booking_id);

  -- Noch nicht verschickte Gegenstuecke heben sich auf: wer eingetragen und
  -- gleich wieder ausgetragen wird (oder umgekehrt), bekommt gar nichts. Noch
  -- nicht verschickt heisst: weder gemailt noch gepusht noch gelesen.
  with aufgehoben as (
    delete from public.notifications n
     where n.booking_id = p_booking_id
       and n.kind = 'booking_removed'
       and n.member_id = any (v_neu)
       and n.mailed_at is null and n.pushed_at is null and n.read_at is null
    returning n.member_id
  )
  insert into public.notifications (member_id, kind, title, body, booking_id)
  select neu, 'booking_added', 'Du bist als Mitspieler eingetragen',
         format('%s hat dich für %s eingetragen.', private.member_label(v_me), v_label),
         p_booking_id
  from unnest(v_neu) as neu
  where neu <> v_me
    and neu not in (select a.member_id from aufgehoben a)
    -- Dasselbe liegt schon unverschickt bereit: nicht doppelt.
    and not exists (select 1 from public.notifications n
                     where n.booking_id = p_booking_id and n.kind = 'booking_added'
                       and n.member_id = neu
                       and n.mailed_at is null and n.pushed_at is null and n.read_at is null);

  with aufgehoben as (
    delete from public.notifications n
     where n.booking_id = p_booking_id
       and n.kind = 'booking_added'
       and n.member_id = any (v_weg)
       and n.mailed_at is null and n.pushed_at is null and n.read_at is null
    returning n.member_id
  )
  insert into public.notifications (member_id, kind, title, body, booking_id)
  select alt, 'booking_removed', 'Du bist nicht mehr dabei',
         format('%s hat dich von %s ausgetragen.', private.member_label(v_me), v_label),
         p_booking_id
  from unnest(v_weg) as alt
  where alt <> v_me
    and alt not in (select a.member_id from aufgehoben a)
    and not exists (select 1 from public.notifications n
                     where n.booking_id = p_booking_id and n.kind = 'booking_removed'
                       and n.member_id = alt
                       and n.mailed_at is null and n.pushed_at is null and n.read_at is null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3.1 create_booking: Rate-Limit und booking_id an der Benachrichtigung
-- ---------------------------------------------------------------------------

create or replace function public.create_booking(p_court_id uuid, p_starts_at timestamp with time zone, p_booking_type_code text, p_player_member_ids uuid[] default '{}'::uuid[], p_guest_names text[] default '{}'::text[], p_partner_wanted boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- 3.2 leave_booking: austragen geht immer, notfalls wird gesucht
-- ---------------------------------------------------------------------------

create or replace function public.leave_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_type public.booking_types%rowtype;
  v_danach integer;
  v_suchen boolean := false;
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;

  -- Gesperrt wie in join_booking: gehen zwei gleichzeitig, zaehlt der
  -- zweite sonst den ersten noch mit (B6).
  select * into v_booking from public.bookings where id = p_booking_id for update;
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

  -- Wer eingetragen wurde, ohne gefragt zu werden, muss wieder rauskommen
  -- (Audit 3.2). Reicht es danach nicht mehr, sucht die Buchung Mitspieler,
  -- statt den Austritt zu verweigern.
  if v_danach < v_type.min_players or (v_type.requires_partner and v_danach < 2) then
    v_suchen := not v_booking.partner_wanted;
    update public.bookings set partner_wanted = true where id = p_booking_id;
  end if;

  delete from public.booking_players
   where booking_id = p_booking_id and member_id = v_me;

  insert into public.notifications (member_id, kind, title, body)
  values (v_booking.member_id, 'player_left', 'Ein Mitspieler hat sich ausgetragen',
          format('%s spielt am %s nicht mit.',
                 private.member_label(v_me), private.booking_label(p_booking_id))
          || case when v_suchen then ' Die Buchung sucht jetzt Mitspieler.' else '' end);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3.3 Nachruecken nur mit Zugang, Wartelisten raeumen
-- ---------------------------------------------------------------------------

create or replace function private.event_nachruecken(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  w record;
  v_belegt integer;
  v_anzahl integer := 0;
begin
  select * into e from public.events where id = p_event_id;
  if e.status <> 'published' or not e.registration_enabled or now() >= private.event_schluss(e) then
    return 0;
  end if;

  v_belegt := private.event_belegt(p_event_id);

  -- Nur wer noch Zugang hat (Audit 3.3): Ausgeschiedene und Gesperrte
  -- bekaemen sonst eine Gebuehr, die sie selbst nicht mehr stornieren koennen.
  for w in
    select r.id, 1 + r.companions as personen
    from public.event_registrations r
    join public.members m on m.id = r.member_id
    where r.event_id = p_event_id and r.status = 'waitlisted'
      and private.hat_zugang(m)
    order by r.waitlisted_at, r.registered_at
  loop
    if e.max_participants is null or v_belegt + w.personen <= e.max_participants then
      update public.event_registrations
         set status = 'registered', waitlisted_at = null
       where id = w.id;
      perform private.event_forderung_abgleichen(w.id);
      v_belegt := v_belegt + w.personen;
      v_anzahl := v_anzahl + 1;
    end if;
  end loop;

  return v_anzahl;
end;
$$;

/**
 * Nimmt ein Mitglied von den Wartelisten kuenftiger Veranstaltungen. Ein
 * Wartender belegt keinen Platz, also rueckt niemand nach. Rueckgabe: wie
 * viele.
 */
create or replace function private.wartelisten_raeumen(p_member_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_anzahl integer;
begin
  update public.event_registrations r
     set status = 'cancelled', cancelled_at = now(), waitlisted_at = null
    from public.events e
   where e.id = r.event_id
     and r.member_id = p_member_id
     and r.status = 'waitlisted'
     and e.status <> 'cancelled'
     and e.starts_at > now();
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke execute on function private.wartelisten_raeumen(uuid) from public, anon, authenticated;

create or replace function public.end_membership(p_member_id uuid, p_ended_on date default ((now() at time zone 'Europe/Berlin'::text))::date, p_cancellation_date date default null::date, p_reason text default null::text, p_set_inactive boolean default true)
returns table (open_charges integer, open_amount_cents integer, future_bookings integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ms public.memberships;
begin
  if not private.is_admin() then
    raise exception 'Mitgliedschaften beenden dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_member_id = private.current_member_id() then
    raise exception 'Du kannst deine eigene Mitgliedschaft nicht selbst beenden.'
      using errcode = 'check_violation';
  end if;

  select * into v_ms from public.memberships
  where member_id = p_member_id and ended_on is null;

  if not found then
    raise exception 'Dieses Mitglied hat keine laufende Mitgliedschaft.'
      using errcode = 'no_data_found';
  end if;

  if p_ended_on < v_ms.started_on then
    raise exception 'Das Austrittsdatum darf nicht vor dem Eintritt liegen.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.memberships set
    ended_on            = p_ended_on,
    cancellation_date   = coalesce(p_cancellation_date, private.heute()),
    cancellation_reason = nullif(btrim(coalesce(p_reason, '')), ''),
    status              = 'ended'
  where id = v_ms.id;

  if p_set_inactive then
    update public.members set status = 'inactive' where id = p_member_id;
  end if;

  -- Wer heute geht, behaelt keine Rollen. Bei einem kuenftigen Datum
  -- bleiben sie bis dahin, danach greift hat_zugang.
  if p_ended_on <= private.heute() then
    delete from public.member_roles where member_id = p_member_id and role <> 'member';
    -- Und rueckt nirgends mehr nach (Audit 3.3).
    perform private.wartelisten_raeumen(p_member_id);
  end if;

  return query
    select
      (select count(*)::integer from public.charges
        where member_id = p_member_id and status in ('open', 'notified')),
      (select coalesce(sum(amount_cents), 0)::integer from public.charges
        where member_id = p_member_id and status in ('open', 'notified')),
      (select count(*)::integer from public.bookings
        where member_id = p_member_id and status = 'active' and lower(slot) > now());
end;
$$;

create or replace function public.set_login_disabled(p_member_id uuid, p_disabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Zugänge verwalten dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_disabled and p_member_id = private.current_member_id() then
    raise exception 'Du kannst dich nicht selbst aussperren.'
      using errcode = 'check_violation';
  end if;

  update public.members
     set login_disabled_at = case when p_disabled then now() else null end
   where id = p_member_id;

  -- Gesperrt heisst auch: kein Nachruecken mehr (Audit 3.3).
  if p_disabled then
    perform private.wartelisten_raeumen(p_member_id);
  end if;
end;
$$;
