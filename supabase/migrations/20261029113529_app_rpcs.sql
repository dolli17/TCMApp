-- ===========================================================================
-- RPCs fuer die nativen Apps (Phase A, docs/native-apps.md)
--
-- Die Expo-App liest neun Tabellen direkt ueber PostgREST und schreibt
-- members direkt (docs/native/app-api.md, "Direkte Tabellenzugriffe"). Die
-- nativen Apps sollen nur noch RPCs sprechen. Hier kommen die Ersatz-RPCs:
--
--   ich()                         Wer bin ich, was darf ich, habe ich Zugang?
--   mein_profil()                 Stammdaten, Notfallkontakt, Mitgliedschaft,
--                                 Mannschaft in einem Zug
--   save_my_profile(...)          Stammdaten speichern
--   save_my_notfallkontakt(...)   Notfallkontakt speichern
--   mein_mandat()                 Eigenes SEPA-Mandat mit Bankverbindung
--   courts_aktiv()                Aktive Plaetze
--   booking_types_aktiv(kind)     Aktive Buchungs- bzw. Sperrarten
--   drink_void_window_minutes()   Stornofenster der Getraenke
--   push_token_aktiv(token)       Ist dieses Geraet noch angemeldet?
--   events_fuer_mitglied()        + meine_forderung_cents/_status
--
-- Dazu der Umbau auf APNs und FCM: push_tokens.provider, ein optionaler
-- Parameter p_provider in register_push_token und die Anbieter je Geraet in
-- claim_notification_pushes.
--
-- Rechte: Wo die bestehenden Policies schon genau das Richtige zeigen, laufen
-- die Funktionen als Aufrufer (security invoker) und filtern zusaetzlich auf
-- das eigene Mitglied - ein Admin saehe ueber RLS sonst alle. Security
-- definer nur, wo eine Funktion ohnehin schon so lief (events_fuer_mitglied,
-- register_push_token, claim_notification_pushes) oder mehrere Rechte in
-- einem Zug braucht (ich).
--
-- Die beiden Speicher-RPCs laufen bewusst als Aufrufer: dann gelten Policy
-- members_update_own, der Spalten-Grant und der Trigger
-- guard_member_self_update genau wie beim direkten update der Expo-App.
-- Nichts wird gelockert, die Regel steht weiter an einer Stelle.
--
-- Abwaertskompatibel: Die Expo-App und das Web laufen unveraendert weiter.
-- Neue Funktionen; events_fuer_mitglied und claim_notification_pushes
-- bekommen nur zusaetzliche Spalten am Ende, register_push_token einen
-- optionalen vierten Parameter. Die Tabellen-Policies und -Grants bleiben bis
-- zum Aufraeumen nach dem Umstieg.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- ich()
--
-- Eine Zeile, immer - wie mein_zugang(), dessen drei Spalten hier am Ende
-- stehen. member_id, Name und Rollen nur mit Zugang; ohne Zugang (oder ohne
-- Mitglied, etwa am Kiosk) sind sie null bzw. leer und alle Rechte false.
--
--   admin         private.is_admin(): Vorstand oder App Admin
--                 (hatVolleRechte in @tcm/core rollen.ts)
--   platz_rechte  private.darf_plaetze(): dazu der Platzwart
--                 (hatPlatzRechte)
--   kiosk         private.is_kiosk(): aktives Kiosk-Geraet
--
-- Security definer, weil Rollen und Zugang zusammen gelesen werden und
-- mein_zugang() ebenso laeuft. Gelesen wird nur das eigene Mitglied.
-- ---------------------------------------------------------------------------
create or replace function public.ich()
returns table (
  member_id uuid,
  first_name text,
  last_name text,
  roles public.app_role[],
  admin boolean,
  platz_rechte boolean,
  kiosk boolean,
  zugang boolean,
  grund text,
  onboarding_offen boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.first_name, m.last_name,
         coalesce((select array_agg(r.role order by r.role)
                     from public.member_roles r
                    where r.member_id = m.id), '{}'::public.app_role[]),
         private.is_admin(), private.darf_plaetze(), private.is_kiosk(),
         z.zugang, z.grund, z.onboarding_offen
  from public.mein_zugang() z
  left join public.members m on m.id = (select private.current_member_id());
$$;

-- ---------------------------------------------------------------------------
-- mein_profil()
--
-- Genau die Felder, die die Expo-App heute einzeln liest (ladeMeinenNamen,
-- ladeMeineStammdaten, ladeMeineMitgliedschaft, ladeMeineMannschaft). Die
-- Mitgliedschaft ist die neueste aktive, die Mannschaft null fuer die
-- meisten. Ohne Zugang keine Zeile.
-- ---------------------------------------------------------------------------
create or replace function public.mein_profil()
returns table (
  first_name text,
  last_name text,
  title text,
  phone text,
  mobile text,
  street text,
  postcode text,
  city text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,
  membership_number text,
  member_since date,
  team_name text,
  is_team_captain boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.first_name, m.last_name, m.title, m.phone, m.mobile,
         m.street, m.postcode, m.city,
         m.emergency_contact_name, m.emergency_contact_phone, m.emergency_contact_relation,
         ms.number, ms.started_on,
         t.name, m.is_team_captain
  from public.members m
  left join lateral (
    select x.number, x.started_on
      from public.memberships x
     where x.member_id = m.id and x.status = 'active'
     order by x.started_on desc
     limit 1
  ) ms on true
  left join public.teams t on t.id = m.team_id
  where m.id = (select private.current_member_id());
$$;

-- ---------------------------------------------------------------------------
-- save_my_profile(...)
--
-- Die acht Stammdatenfelder, die der Spalten-Grant auf members hergibt.
-- null heisst "unveraendert", ein leerer Text "leeren". So schickt die App
-- wie heute nur, was sich geaendert hat. Vor- und Nachname lassen sich nicht
-- leeren (Constraint members_first_name_set/members_last_name_set).
--
-- Als Aufrufer: Policy, Spalten-Grant und guard_member_self_update gelten
-- unveraendert. Andere Spalten nimmt die Funktion gar nicht erst an.
-- ---------------------------------------------------------------------------
create or replace function public.save_my_profile(
  p_first_name text default null,
  p_last_name text default null,
  p_title text default null,
  p_phone text default null,
  p_mobile text default null,
  p_street text default null,
  p_postcode text default null,
  p_city text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_me uuid := (select private.current_member_id());
begin
  if v_me is null then
    raise exception 'Nur Mitglieder haben ein Konto.' using errcode = 'insufficient_privilege';
  end if;

  if (p_first_name is not null and btrim(p_first_name) = '')
     or (p_last_name is not null and btrim(p_last_name) = '') then
    raise exception 'Vor- und Nachname sind Pflicht.' using errcode = 'invalid_parameter_value';
  end if;

  update public.members m set
    first_name = coalesce(btrim(p_first_name), m.first_name),
    last_name  = coalesce(btrim(p_last_name), m.last_name),
    title      = case when p_title    is null then m.title    else nullif(btrim(p_title), '') end,
    phone      = case when p_phone    is null then m.phone    else nullif(btrim(p_phone), '') end,
    mobile     = case when p_mobile   is null then m.mobile   else nullif(btrim(p_mobile), '') end,
    street     = case when p_street   is null then m.street   else nullif(btrim(p_street), '') end,
    postcode   = case when p_postcode is null then m.postcode else nullif(btrim(p_postcode), '') end,
    city       = case when p_city     is null then m.city     else nullif(btrim(p_city), '') end
  where m.id = v_me;

  if not found then
    raise exception 'Nur Mitglieder haben ein Konto.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_my_notfallkontakt(...)
--
-- Ersetzt den Notfallkontakt als Ganzes, wie speichereNotfallkontakt in der
-- Expo-App. Leere Texte werden null. Eine Nummer ohne Namen lehnt schon
-- members_emergency_contact_paarweise ab; hier kommt derselbe Satz wie in der
-- App, frueher und auf Deutsch.
-- ---------------------------------------------------------------------------
create or replace function public.save_my_notfallkontakt(
  p_name text,
  p_phone text,
  p_relation text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_me    uuid := (select private.current_member_id());
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if v_me is null then
    raise exception 'Nur Mitglieder haben ein Konto.' using errcode = 'insufficient_privilege';
  end if;

  if v_phone is not null and v_name is null then
    raise exception 'Zur Notfallnummer gehört auch ein Name.' using errcode = 'invalid_parameter_value';
  end if;

  update public.members m set
    emergency_contact_name     = v_name,
    emergency_contact_phone    = v_phone,
    emergency_contact_relation = nullif(btrim(coalesce(p_relation, '')), '')
  where m.id = v_me;

  if not found then
    raise exception 'Nur Mitglieder haben ein Konto.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- mein_mandat()
--
-- Das neueste aktive eigene Mandat mit Kontoinhaber, Bank und den letzten
-- vier Stellen der IBAN - mehr von der IBAN gibt es nicht. Ohne Mandat oder
-- ohne Zugang keine Zeile.
-- ---------------------------------------------------------------------------
create or replace function public.mein_mandat()
returns table (
  reference text,
  signed_on date,
  status public.mandate_status,
  holder text,
  bank_name text,
  iban_last4 text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.reference, s.signed_on, s.status, b.holder, b.bank_name, b.iban_last4
  from public.sepa_mandates s
  join public.bank_accounts b on b.id = s.bank_account_id
  where s.member_id = (select private.current_member_id())
    and s.status = 'active'
  order by s.signed_on desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- courts_aktiv() und booking_types_aktiv(p_applies_to)
--
-- Was der Belegungsplan beim Start braucht. Sichtbar wie heute ueber die
-- Policies courts_select und booking_types_select: nur Mitglieder mit
-- abgeschlossenem Onboarding (private.is_member). Die Verwaltung mit den
-- inaktiven Arten liest weiter selbst.
-- ---------------------------------------------------------------------------
create or replace function public.courts_aktiv()
returns table (id uuid, name text, short_name text, "position" integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.name, c.short_name, c.position
  from public.courts c
  where c.active and (select private.is_member())
  order by c.position;
$$;

create or replace function public.booking_types_aktiv(p_applies_to public.booking_kind)
returns table (
  code text,
  name text,
  duration_minutes integer,
  requires_partner boolean,
  min_players integer,
  max_players integer,
  sort_order integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.code, t.name, t.duration_minutes, t.requires_partner,
         t.min_players, t.max_players, t.sort_order
  from public.booking_types t
  where t.active and t.applies_to = p_applies_to and (select private.is_member())
  order by t.sort_order, t.name;
$$;

-- ---------------------------------------------------------------------------
-- drink_void_window_minutes()
--
-- Eigene kleine RPC statt einer weiteren Spalte: drink_menu liefert eine
-- Zeile je Getraenk, dort stuende dieselbe Zahl in jeder Zeile, und
-- booking_settings gehoert zum Platz, nicht zur Getraenkekasse. Beide haetten
-- dafuer ausserdem neu angelegt werden muessen (andere Rueckgabe).
--
-- Fehlt die Einstellung, gelten 15 Minuten wie in der Expo-App (angelegt
-- wird sie mit ensure_default_settings ohnehin). Ohne Zugang null.
-- ---------------------------------------------------------------------------
create or replace function public.drink_void_window_minutes()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
           (select (s.value #>> '{}')::integer
              from public.settings s
             where s.key = 'drinks.void_window_minutes'),
           15)
  where (select private.is_member()) or (select private.is_kiosk());
$$;

-- ---------------------------------------------------------------------------
-- push_token_aktiv(p_token)
--
-- Ist dieses Geraet noch fuer mich angemeldet? Fuer den Schalter in den
-- Einstellungen. Fremde Marken sind nie aktiv, auch nicht fuer Admins.
-- ---------------------------------------------------------------------------
create or replace function public.push_token_aktiv(p_token text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.push_tokens p
     where p.token = btrim(p_token)
       and p.member_id = (select private.current_member_id())
       and p.disabled_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- events_fuer_mitglied(): die eigene Forderung je Veranstaltung
--
-- Bisher las die App sie direkt aus charges (ladeVeranstaltung). Zwei
-- Spalten am Ende, alle bisherigen bleiben in derselben Reihenfolge - Expo
-- und Web lesen die Zeilen nach Namen. Je Mitglied und Veranstaltung gibt es
-- hoechstens eine nicht erlassene Forderung (charges_one_per_member_event).
-- Eine andere Rueckgabe geht nur mit drop und create; beides in dieser
-- Transaktion, ein Aufruf sieht also immer eine der beiden Fassungen.
-- ---------------------------------------------------------------------------
drop function public.events_fuer_mitglied();

create function public.events_fuer_mitglied()
returns table (
  id uuid,
  kind public.event_kind,
  title text,
  description text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.event_status,
  registration_enabled boolean,
  registration_deadline timestamptz,
  max_participants integer,
  companions_allowed boolean,
  fee_cents integer,
  work_hours numeric,
  personen integer,
  warteliste integer,
  mein_status public.event_registration_status,
  meine_begleitpersonen integer,
  meine_bemerkung text,
  meine_forderung_cents integer,
  meine_forderung_status public.charge_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.kind, e.title, e.description, e.location, e.starts_at, e.ends_at, e.status,
         e.registration_enabled, e.registration_deadline, e.max_participants,
         e.companions_allowed, e.fee_cents, e.work_hours,
         private.event_belegt(e.id),
         (select count(*)::integer from public.event_registrations w
           where w.event_id = e.id and w.status = 'waitlisted'),
         mine.status, mine.companions, mine.note,
         fo.amount_cents, fo.status
  from public.events e
  left join public.event_registrations mine
    on mine.event_id = e.id and mine.member_id = private.current_member_id()
  left join public.charges fo
    on fo.event_id = e.id and fo.member_id = private.current_member_id()
   and fo.status <> 'waived'
  where private.is_member() and e.status <> 'draft'
  order by e.starts_at;
$$;

-- ---------------------------------------------------------------------------
-- Push-Anbieter
--
-- Die nativen Apps melden APNs- bzw. FCM-Marken an, die Expo-App weiter
-- Expo-Marken. Ohne Angabe bleibt es 'expo', alte App-Versionen aendern also
-- nichts.
-- ---------------------------------------------------------------------------
alter table public.push_tokens
  add column provider text not null default 'expo'
  constraint push_tokens_provider_check check (provider in ('expo', 'apns', 'fcm'));

-- Ein vierter, optionaler Parameter. Die alte Fassung mit drei Parametern
-- muss weg, sonst waere ein Aufruf mit zwei oder drei Parametern mehrdeutig.
-- Der Inhalt bleibt, wie er war (S26), nur provider kommt dazu.
drop function public.register_push_token(text, text, text);

create function public.register_push_token(
  p_token text,
  p_platform text,
  p_device_name text default null,
  p_provider text default 'expo'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid; v_alt public.push_tokens; v_alt_zugang boolean;
  v_provider text := coalesce(nullif(btrim(p_provider), ''), 'expo');
begin
  v_member := (select private.current_member_id());
  if v_member is null then
    raise exception 'Nur Mitglieder können ein Gerät anmelden.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(p_token), '') = '' then
    raise exception 'Ohne Marke lässt sich kein Gerät anmelden.'
      using errcode = 'check_violation';
  end if;

  if v_provider not in ('expo', 'apns', 'fcm') then
    raise exception 'Unbekannter Push-Anbieter "%".', v_provider
      using errcode = 'check_violation';
  end if;

  -- Umziehen nur, wenn das Geraet frei ist (S26): stillgelegt, oder der
  -- bisherige Besitzer hat keinen Zugang mehr. Sonst koennte jeder, der eine
  -- fremde Marke kennt, dessen Nachrichten auf sein Konto umleiten. Auf dem
  -- Familientelefon meldet die App beim Abmelden ab (remove_push_token), dann
  -- ist die Marke ohnehin frei.
  select pt.* into v_alt from public.push_tokens pt where pt.token = btrim(p_token) for update;
  if found and v_alt.member_id <> v_member and v_alt.disabled_at is null then
    select private.hat_zugang(m) into v_alt_zugang from public.members m where m.id = v_alt.member_id;
    if coalesce(v_alt_zugang, false) then
      raise exception 'Dieses Gerät ist noch für ein anderes Mitglied angemeldet. Bitte dort zuerst abmelden.'
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.push_tokens (member_id, token, platform, device_name, provider)
  values (v_member, btrim(p_token), p_platform, nullif(btrim(p_device_name), ''), v_provider)
  on conflict (token) do update
    set member_id    = v_member,
        platform     = excluded.platform,
        device_name  = excluded.device_name,
        provider     = excluded.provider,
        last_seen_at = now(),
        disabled_at  = null;
end; $$;

-- claim_notification_pushes: zusaetzlich geraete, je aktives Geraet
-- {token, provider}, neueste zuerst. tokens bleibt, was die Edge Function
-- heute erwartet: nur Expo-Marken, denn sie schickt alles an exp.host. Eine
-- APNs- oder FCM-Marke dort haette Expo abgelehnt, und die Funktion haette
-- das Geraet stillgelegt. Ohne Expo-Marke ist tokens leer, nicht null.
-- Empfaenger ist weiter jedes aktive Mitglied mit irgendeinem aktiven Geraet;
-- die Nachricht ist mit dem Abholen abgehakt, wie bisher.
drop function public.claim_notification_pushes(integer);

create function public.claim_notification_pushes(p_limit integer default 200)
returns table (member_id uuid, tokens text[], notification_ids uuid[], items jsonb, geraete jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Push-Benachrichtigungen darf nur der Versanddienst abholen.'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext('notification_pushes'));

  return query
  with kandidaten as (
    select n.id from public.notifications n
    where n.pushed_at is null
    order by n.created_at
    limit greatest(coalesce(p_limit, 200), 1)
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
  where m.status = 'active'
    and a.created_at > now() - interval '1 day'
    and a.kind = any (private.notification_push_kinds())
    and exists (
      select 1 from public.push_tokens p
       where p.member_id = m.id and p.disabled_at is null
    )
  group by m.id;
end; $$;

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
revoke all on function public.ich() from public, anon;
revoke all on function public.mein_profil() from public, anon;
revoke all on function public.save_my_profile(text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.save_my_notfallkontakt(text, text, text) from public, anon;
revoke all on function public.mein_mandat() from public, anon;
revoke all on function public.courts_aktiv() from public, anon;
revoke all on function public.booking_types_aktiv(public.booking_kind) from public, anon;
revoke all on function public.drink_void_window_minutes() from public, anon;
revoke all on function public.push_token_aktiv(text) from public, anon;
revoke all on function public.events_fuer_mitglied() from public, anon;
revoke all on function public.register_push_token(text, text, text, text) from public, anon;
revoke all on function public.claim_notification_pushes(integer) from public, anon;

grant execute on function public.ich() to authenticated;
grant execute on function public.mein_profil() to authenticated;
grant execute on function public.save_my_profile(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.save_my_notfallkontakt(text, text, text) to authenticated;
grant execute on function public.mein_mandat() to authenticated;
grant execute on function public.courts_aktiv() to authenticated;
grant execute on function public.booking_types_aktiv(public.booking_kind) to authenticated;
grant execute on function public.drink_void_window_minutes() to authenticated;
grant execute on function public.push_token_aktiv(text) to authenticated;
grant execute on function public.events_fuer_mitglied() to authenticated;
grant execute on function public.register_push_token(text, text, text, text) to authenticated;
grant execute on function public.claim_notification_pushes(integer) to authenticated, service_role;
