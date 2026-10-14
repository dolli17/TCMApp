-- ===========================================================================
-- Onboarding: Grundlagen, Pflichtfelder und Sperre
--
-- Neue Mitglieder entstehen ueber einen angenommenen Antrag oder durch direkte
-- Anlage. Beide Wege erheben jetzt dieselben Mindestdaten (Name, Geburtsdatum,
-- Adresse, Geschlecht, Telefon, E-Mail). Alles Weitere erledigt das Mitglied
-- nach dem ersten Login selbst im Onboarding:
--
--   1. Passwort             (Einladungslink)
--   2. Stammdaten pruefen   Pflicht
--   3. Rechtliches          Pflicht: Satzung, Beitragsordnung, Datenschutz
--   4. Erziehungsberechtigte  Pflicht bei Minderjaehrigen
--   5. Notfallkontakt       Pflicht bei Minderjaehrigen, sonst optional
--   6. SEPA-Mandat online   Pflicht
--   7.-9. Einwilligungen, Tennis, App-Einstellungen: optional
--
-- complete_onboarding() prueft die Pflichtschritte und setzt
-- members.onboarding_completed_at. Bis dahin liefert private.is_member()
-- false: Belegungsplan, Getraenke, Verzeichnis und die uebrigen Lese-Policies
-- bleiben zu. Eigene Daten (can_view_member), Benachrichtigungen, Merkmale,
-- Push-Tokens und die Onboarding-RPCs haengen nicht an is_member() und
-- bleiben erreichbar. Admin-Pruefungen (is_admin) und der Kiosk sind nicht
-- betroffen.
--
-- Der Bestand bekommt kein Onboarding: die Spalte startet mit now() fuer alle
-- vorhandenen Zeilen. Der Default bleibt stehen, damit Seed, Import und
-- Testhelfer weiter fertige Mitglieder anlegen; nur create_member setzt
-- ausdruecklich null.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Neue Spalten an members
-- ---------------------------------------------------------------------------
alter table public.members
  add column onboarding_completed_at  timestamptz default now(),
  add column onboarding_stammdaten_at timestamptz,
  add column guardian_name            text,
  add column guardian_email           extensions.citext,
  add column guardian_phone           text,
  add column guardian_consent_at      timestamptz;

alter table public.members
  add constraint members_guardian_email_format
  check (guardian_email is null or position('@' in guardian_email::text) > 1);

comment on column public.members.onboarding_completed_at is
  'Ende des Pflicht-Onboardings. null = Konto noch nicht freigeschaltet (is_member() ist false).';
comment on column public.members.onboarding_stammdaten_at is
  'Wann das Mitglied seine Stammdaten im Onboarding bestaetigt hat.';
comment on column public.members.guardian_consent_at is
  'Zustimmung der Erziehungsberechtigten zur Mitgliedschaft (bei Minderjaehrigen).';

-- ---------------------------------------------------------------------------
-- 2. Rechtstexte
--
-- Je Code ist hoechstens eine Version aktiv. Die Texte sind oeffentlich: der
-- Antrag verlinkt sie, und auch waehrend des Onboardings muessen sie lesbar
-- sein. Version 1 ist ein Platzhalter, die echten Texte folgen.
-- ---------------------------------------------------------------------------
create table public.legal_documents (
  id         uuid primary key default gen_random_uuid(),
  code       text not null check (code in ('satzung', 'beitragsordnung', 'datenschutz')),
  version    integer not null check (version > 0),
  title      text not null check (length(btrim(title)) > 0),
  body_md    text not null,
  valid_from date not null default current_date,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (code, version)
);

create unique index legal_documents_ein_aktives on public.legal_documents (code) where active;

comment on table public.legal_documents is
  'Satzung, Beitragsordnung und Datenschutzerklaerung mit Version. Zustimmungen verweisen auf (code, version).';

alter table public.legal_documents enable row level security;

create policy legal_documents_select on public.legal_documents
  for select to anon, authenticated using (active or (select private.is_admin()));
create policy legal_documents_admin_all on public.legal_documents
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

grant select on public.legal_documents to anon, authenticated;
grant insert, update on public.legal_documents to authenticated;

insert into public.legal_documents (code, version, title, body_md) values
  ('satzung', 1, 'Satzung',
   U&'# Satzung des TC Muckensturm e.V.\000a\000a[[Platzhalter: Der Text der Satzung folgt. Bis dahin gilt die Satzung, die der Verein in der Mitgliederversammlung beschlossen hat.]]'),
  ('beitragsordnung', 1, 'Beitragsordnung',
   U&'# Beitragsordnung des TC Muckensturm e.V.\000a\000a[[Platzhalter: Der Text der Beitragsordnung folgt. Bis dahin gelten die vom Vorstand ver\00f6ffentlichten Beitr\00e4ge.]]'),
  ('datenschutz', 1, U&'Datenschutzerkl\00e4rung',
   U&'# Datenschutzerkl\00e4rung\000a\000a[[Platzhalter: Der Text der Datenschutzerkl\00e4rung folgt.]]')
on conflict (code, version) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Zustimmungen
--
-- Eine Zeile je Mitglied, Text und Version. Geschrieben wird nur ueber
-- onboarding_accept_documents(); eine neue Textversion braucht eine neue
-- Zustimmung, die alte Zeile bleibt als Nachweis stehen.
-- ---------------------------------------------------------------------------
create table public.member_consents (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.members (id) on delete cascade,
  document_code text not null,
  version       integer not null,
  accepted_at   timestamptz not null default now(),
  unique (member_id, document_code, version),
  foreign key (document_code, version) references public.legal_documents (code, version)
);

create index member_consents_document_idx on public.member_consents (document_code, version);

comment on table public.member_consents is
  'Nachweis, wann ein Mitglied welcher Version eines Rechtstexts zugestimmt hat.';

alter table public.member_consents enable row level security;

create policy member_consents_select on public.member_consents
  for select to authenticated
  using (member_id = (select private.current_member_id()) or (select private.is_admin()));

grant select on public.member_consents to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Nachweis fuer online erteilte Mandate
-- ---------------------------------------------------------------------------
alter table public.sepa_mandates
  add column granted_online_at timestamptz,
  add column mandate_text      text,
  add column accepted_holder   text;

alter table public.sepa_mandates
  add constraint sepa_mandates_online_nachweis
  check (granted_online_at is null or (mandate_text is not null and accepted_holder is not null));

comment on column public.sepa_mandates.granted_online_at is
  'Zeitpunkt, zu dem das Mitglied das Mandat online erteilt hat. null = vom Vorstand erfasst.';
comment on column public.sepa_mandates.mandate_text is
  'Der Mandatstext, so wie er dem Mitglied beim Erteilen angezeigt wurde.';
comment on column public.sepa_mandates.accepted_holder is
  'Kontoinhaber, der das Mandat online erteilt hat.';

-- ---------------------------------------------------------------------------
-- 5. Einstellungen: Version des Mandatstexts
-- ---------------------------------------------------------------------------
create or replace function public.ensure_default_settings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before integer;
  v_after  integer;
begin
  select count(*) into v_before from public.settings;

  insert into public.settings (key, value, value_type, label, description) values
    ('booking.max_open_bookings', '0'::jsonb, 'integer', 'Maximale offene Buchungen',
     'Wie viele kuenftige Buchungen ein Mitglied gleichzeitig haben darf. '
     'Mitspieler zaehlen mit. 0 bedeutet unbegrenzt.'),
    ('booking.lead_days', '7'::jsonb, 'integer', 'Buchungsvorlauf in Tagen',
     'Rollierend: buchbar ist alles innerhalb der naechsten X Tage.'),
    ('booking.opening_time', '"08:00"'::jsonb, 'time', 'Oeffnungszeit',
     'Frueheste Startzeit einer Buchung.'),
    ('booking.closing_time', '"21:00"'::jsonb, 'time', 'Schliesszeit',
     'Spaeteste Endzeit einer Buchung.'),
    ('booking.slot_minutes', '30'::jsonb, 'integer', 'Raster in Minuten',
     'Startzeiten muessen auf dieses Raster fallen (30 = :00 und :30).'),
    ('booking.display_minutes', '60'::jsonb, 'integer', 'Raster der Plananzeige',
     'In welchen Schritten der Belegungsplan Zeilen zeigt. Gebucht wird im '
     'feineren Raster aus booking.slot_minutes.'),
    ('booking.guest_fee_cents', '1000'::jsonb, 'integer', 'Gastgebuehr in Cent',
     '0 = keine Gebuehr. Sonst wird sie je Gast dem buchenden Mitglied '
     'berechnet und mit der naechsten Lastschrift eingezogen.'),
    ('notifications.mail_kinds',
     '"booking_displaced,booking_cancelled,booking_removed,application_new,charge_announced,charge_returned,booking_moved"'::jsonb,
     'text', 'Benachrichtigungen, die auch per E-Mail gehen',
     'Kommagetrennte Liste. Wer bei "E-Mails zu Buchungen" auf "Alle" steht, '
     'bekommt jede Art; alle anderen nur diese hier.'),
    ('drinks.min_debit_cents', '500'::jsonb, 'integer', 'Mindestbetrag Lastschrift',
     'Betraege darunter werden nicht eingezogen, sondern beim naechsten Lauf '
     'mitgenommen. Die Schwelle gilt je Zahler ueber alle offenen Forderungen.'),
    ('drinks.void_window_minutes', '15'::jsonb, 'integer', 'Storno-Fenster Getraenke',
     'So lange darf ein Mitglied eine eigene Fehlbuchung selbst zuruecknehmen.'),
    ('sepa.creditor_id', '""'::jsonb, 'text', 'Glaeubiger-Identifikationsnummer',
     'Aus dem eBuSy-Backend uebernehmen. Muss unveraendert bleiben, damit die '
     'Bestandsmandate gueltig bleiben.'),
    ('sepa.creditor_iban', '""'::jsonb, 'text', 'IBAN des Vereinskontos',
     'Auf dieses Konto werden die Lastschriften gutgeschrieben. Ohne sie laesst '
     'sich keine Datei erzeugen.'),
    ('sepa.creditor_bic', '""'::jsonb, 'text', 'BIC des Vereinskontos',
     'Optional. Fehlt sie, traegt die Datei NOTPROVIDED - das reicht innerhalb '
     'des SEPA-Raums.'),
    ('sepa.pain_version', '"pain.008.001.08"'::jsonb, 'text', 'Format der Lastschriftdatei',
     'Mit der Hausbank abklaeren.'),
    ('sepa.prenotification_days', '14'::jsonb, 'integer', 'Vorabankuendigung in Tagen',
     'Pflicht vor jedem Einzug. So viele Tage muessen zwischen Ankuendigung '
     'und Faelligkeit liegen.'),
    ('sepa.creditor_name', '"TC Muckensturm e.V."'::jsonb, 'text', 'Name des Zahlungsempfaengers',
     'Erscheint auf dem Kontoauszug der Mitglieder.'),
    ('sepa.mandate_text_version', '1'::jsonb, 'integer', 'Version des Mandatstexts',
     'Fassung des Textes, mit dem Mitglieder ihr SEPA-Mandat online erteilen. '
     'Wird hochgezaehlt, wenn sich der Text in private.sepa_mandatstext aendert.'),
    ('fees.annual_run_month', '1'::jsonb, 'integer', 'Monat des Beitragslaufs',
     'Der Lauf wird trotzdem manuell gestartet.'),
    ('fees.annual_run_day', '15'::jsonb, 'integer', 'Tag des Beitragslaufs',
     'Faelligkeitsdatum der Jahresbeitrags-Lastschrift.'),
    ('work_duty.hourly_rate_cents', '1500'::jsonb, 'integer', 'Stundensatz Arbeitsdienst',
     'Womit nicht geleistete Stunden zum Jahresende abgerechnet werden. Platzhalter.'),
    ('privacy.change_log_days', '1095'::jsonb, 'integer',
     'Aufbewahrung des Aenderungsprotokolls in Tagen',
     'Aeltere Eintraege werden beim Aufraeumlauf entfernt. 1095 Tage sind drei Jahre.'),
    ('notifications.push_kinds',
     '"booking_displaced,booking_cancelled,booking_removed,booking_added,player_joined,player_left,application_new,booking_moved"'::jsonb,
     'text', 'Benachrichtigungen, die auch als Push gehen',
     'Kommagetrennte Liste. Getrennt von den E-Mail-Arten, weil ein Push sofort '
     'da ist und auch Erfreuliches melden darf, das als Mail nur Laerm waere.')
  on conflict (key) do nothing;

  select count(*) into v_after from public.settings;
  return v_after - v_before;
end;
$$;

revoke execute on function public.ensure_default_settings() from public, anon, authenticated;

select public.ensure_default_settings();

-- ---------------------------------------------------------------------------
-- 6. Merkmale fuer die optionalen Schritte
--
-- foto, newsletter und whatsapp standen bisher nur im Seed. Das Onboarding
-- braucht sie aber auch auf Prod. Gibt es sie schon, bleibt alles, wie der
-- Vorstand es eingestellt hat. mannschaft_interesse ist neu (Schritt Tennis).
-- ---------------------------------------------------------------------------
insert into public.member_attribute_types
  (code, name, description, value_kind, multiple, self_editable, in_application, sort_order)
values
  ('foto', U&'Fotos und Ver\00f6ffentlichung',
   U&'Darf die Person auf Fotos der Website, in Aush\00e4ngen und in der Presse erscheinen? '
   || U&'Bei Minderj\00e4hrigen erteilen die Erziehungsberechtigten die Einwilligung.',
   'boolean', false, true, false, 10),
  ('newsletter', 'Vereinsnachrichten per E-Mail',
   'Rundmails zu Veranstaltungen und Neuigkeiten. Pflichtinformationen zu Beitrag und '
   'Lastschrift gehen unabh' || U&'\00e4' || 'ngig davon heraus.',
   'boolean', false, true, false, 20),
  ('whatsapp', 'Messenger-Gruppen',
   'Aufnahme in die Gruppen des Vereins. Eigene Einwilligung, weil die Telefonnummer '
   'dabei an einen Dritten gelangt.',
   'boolean', false, true, false, 30),
  ('mannschaft_interesse', 'Interesse an einer Mannschaft',
   U&'Die Person m\00f6chte in einer Mannschaft spielen. Der Sportwart meldet sich.',
   'boolean', false, true, false, 35)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Selbstpflege-Schutz: Durchlass fuer die Onboarding-RPCs
--
-- Die RPCs unten laufen als security definer, aber auth.uid() ist dabei
-- gesetzt - der Trigger wuerde Geburtsdatum, Geschlecht oder den
-- Onboarding-Abschluss sonst abweisen. Die RPCs setzen deshalb fuer die
-- Dauer ihrer Transaktion tcm.selbstpflege_rpc. Clients koennen diese
-- Einstellung nicht setzen (PostgREST setzt nur role und request.*), und
-- direkt kommen sie an die Spalten ohnehin nicht heran: authenticated hat
-- auf members nur einen Spalten-Grant.
-- ---------------------------------------------------------------------------
create or replace function public.guard_member_self_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_erlaubt constant text[] := array[
    'first_name', 'last_name', 'title', 'phone', 'mobile',
    'street', 'postcode', 'city', 'country_code',
    'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
    'nationality_code', 'updated_at'
  ];
  v_alt   jsonb := to_jsonb(old);
  v_neu   jsonb := to_jsonb(new);
  v_feld  text;
begin
  -- Kein angemeldeter Nutzer: Seed, Import, Cron oder Service-Rolle.
  if (select auth.uid()) is null then return new; end if;
  if (select private.is_admin()) then return new; end if;
  -- Eine der Onboarding-RPCs; sie prueft selbst, was sie schreibt.
  if coalesce(current_setting('tcm.selbstpflege_rpc', true), '') = 'on' then return new; end if;

  for v_feld in select jsonb_object_keys(v_neu) loop
    if v_neu -> v_feld is distinct from v_alt -> v_feld
       and not (v_feld = any (v_erlaubt))
    then
      raise exception 'Das Feld "%" kann nur ein Administrator aendern.', v_feld
        using errcode = 'insufficient_privilege';
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function public.guard_member_self_update() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Die Sperre
--
-- is_member() heisst jetzt "freigeschaltetes Mitglied". Alles, was nur
-- current_member_id() oder can_view_member() nutzt, bleibt fuer das eigene
-- Konto erreichbar.
-- ---------------------------------------------------------------------------
create or replace function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.auth_user_id = (select auth.uid())
      and m.onboarding_completed_at is not null
  );
$$;

comment on function private.is_member() is
  'Angemeldet, Mitglied und Onboarding abgeschlossen. Basis der vereinsweiten Lese-Policies.';

-- Fuer die schreibenden RPCs, die bisher nur current_member_id() pruefen.
create or replace function private.pruefe_freigeschaltet()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_member() then
    raise exception 'Bitte schliesse zuerst die Einrichtung deines Kontos ab.'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke execute on function private.pruefe_freigeschaltet() from public, anon, authenticated;

-- Die eigenen Rollen sieht jeder, auch vor dem Abschluss: Web und App lesen
-- daraus, ob jemand Admin ist.
drop policy if exists member_roles_select on public.member_roles;
create policy member_roles_select on public.member_roles
  for select to authenticated
  using ((select private.is_member()) or member_id = (select private.current_member_id()));

-- ---------------------------------------------------------------------------
-- 9. Helfer
-- ---------------------------------------------------------------------------
create or replace function private.heute()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Berlin')::date;
$$;

-- Minderjaehrig bis einschliesslich des Tages vor dem 18. Geburtstag. Wer am
-- 29. Februar geboren ist, wird in Nicht-Schaltjahren am 1. Maerz volljaehrig
-- - genauso rechnet istMinderjaehrig() in packages/core.
create or replace function private.ist_minderjaehrig(p_birthday date, p_heute date default null)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    p_birthday > (coalesce(p_heute, private.heute()) - interval '18 years')::date,
    false);
$$;

create or replace function private.anrede_aus_geschlecht(p_gender public.gender)
returns public.salutation
language sql
immutable
set search_path = ''
as $$
  select case p_gender
    when 'female' then 'female'::public.salutation
    when 'male'   then 'male'::public.salutation
    when 'diverse' then 'none'::public.salutation
  end;
$$;

-- Die Pflicht-Stammdaten beider Wege (Antrag, Anlage) und des Onboardings.
-- Name und E-Mail haben eigene, aeltere Meldungen und fehlen hier.
create or replace function private.fehlende_stammdaten(
  p_birthday date, p_gender public.gender,
  p_street text, p_postcode text, p_city text,
  p_phone text, p_mobile text
)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array_remove(array[
    case when p_birthday is null then 'Geburtsdatum' end,
    case when p_gender is null then 'Geschlecht' end,
    case when btrim(coalesce(p_street, '')) = '' then 'Strasse' end,
    case when btrim(coalesce(p_postcode, '')) = '' then 'PLZ' end,
    case when btrim(coalesce(p_city, '')) = '' then 'Ort' end,
    case when btrim(coalesce(p_phone, '')) = '' and btrim(coalesce(p_mobile, '')) = ''
         then 'Telefon' end
  ], null);
$$;

-- Der Mandatstext einer SEPA-Basislastschrift. Wortgleich mit mandatstext()
-- in packages/core/src/onboarding.ts - aendert sich einer, aendert sich der
-- andere, und sepa.mandate_text_version wird hochgezaehlt.
create or replace function private.sepa_mandatstext(
  p_glaeubiger_name text, p_glaeubiger_id text, p_referenz text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select concat_ws(chr(10),
    'SEPA-Lastschriftmandat (SEPA-Basislastschrift)',
    '',
    U&'Zahlungsempf\00e4nger: ' || p_glaeubiger_name,
    U&'Gl\00e4ubiger-Identifikationsnummer: ' || p_glaeubiger_id,
    'Mandatsreferenz: ' || p_referenz,
    'Zahlungsart: Wiederkehrende Zahlungen',
    '',
    U&'Ich erm\00e4chtige ' || p_glaeubiger_name
      || ', Zahlungen von meinem Konto mittels Lastschrift einzuziehen. '
      || 'Zugleich weise ich mein Kreditinstitut an, die von ' || p_glaeubiger_name
      || U&' auf mein Konto gezogenen Lastschriften einzul\00f6sen.',
    '',
    'Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, '
      || 'die Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit '
      || 'meinem Kreditinstitut vereinbarten Bedingungen.'
  );
$$;

-- Erledigt-Status je Schritt. Die Reihenfolge und welche Schritte Pflicht
-- sind, steht in onboarding_pflicht_fehlt() und in packages/core.
create or replace function private.onboarding_status(p_member_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_m      public.members;
  v_minder boolean;
begin
  select * into v_m from public.members where id = p_member_id;
  if not found then return null; end if;

  v_minder := private.ist_minderjaehrig(v_m.birthday);

  return jsonb_build_object(
    'passwort', exists (
      select 1 from auth.users u
      where u.id = v_m.auth_user_id and coalesce(u.encrypted_password, '') <> ''),
    'stammdaten', v_m.onboarding_stammdaten_at is not null
      and cardinality(private.fehlende_stammdaten(
            v_m.birthday, v_m.gender, v_m.street, v_m.postcode, v_m.city,
            v_m.phone, v_m.mobile)) = 0,
    'rechtliches', not exists (
      select 1 from public.legal_documents d
      where d.active
        and not exists (
          select 1 from public.member_consents c
          where c.member_id = p_member_id
            and c.document_code = d.code and c.version = d.version)),
    'erziehungsberechtigte', not v_minder or (
      btrim(coalesce(v_m.guardian_name, '')) <> ''
      and (v_m.guardian_email is not null or btrim(coalesce(v_m.guardian_phone, '')) <> '')
      and v_m.guardian_consent_at is not null),
    'notfallkontakt', btrim(coalesce(v_m.emergency_contact_name, '')) <> ''
      and btrim(coalesce(v_m.emergency_contact_phone, '')) <> '',
    'sepa', exists (
      select 1 from public.sepa_mandates s
      where s.member_id = p_member_id and s.status = 'active'),
    'einwilligungen', exists (
      select 1 from public.member_attribute_values v
      join public.member_attribute_types t on t.id = v.attribute_type_id
      where v.member_id = p_member_id and t.code in ('foto', 'newsletter', 'whatsapp')),
    'tennis', v_m.tennis_lk is not null or v_m.nuliga_id is not null or exists (
      select 1 from public.member_attribute_values v
      join public.member_attribute_types t on t.id = v.attribute_type_id
      where v.member_id = p_member_id and t.code = 'mannschaft_interesse'),
    'einstellungen', exists (
      select 1 from public.member_attribute_values v
      join public.member_attribute_types t on t.id = v.attribute_type_id
      where v.member_id = p_member_id and t.code = 'booking_mail')
      or exists (select 1 from public.push_tokens p where p.member_id = p_member_id)
  );
end;
$$;

-- Die offenen Pflichtschritte in Reihenfolge, als Schluessel.
create or replace function private.onboarding_pflicht_fehlt(p_member_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status jsonb := private.onboarding_status(p_member_id);
  v_minder boolean;
begin
  if v_status is null then return null; end if;
  select private.ist_minderjaehrig(m.birthday) into v_minder
  from public.members m where m.id = p_member_id;

  return array(
    select s.schluessel
    from (values
      (1, 'passwort',              true),
      (2, 'stammdaten',            true),
      (3, 'rechtliches',           true),
      (4, 'erziehungsberechtigte', v_minder),
      (5, 'notfallkontakt',        v_minder),
      (6, 'sepa',                  true)
    ) as s(reihe, schluessel, pflicht)
    where s.pflicht and not (v_status ->> s.schluessel)::boolean
    order by s.reihe);
end;
$$;

revoke execute on function private.heute() from public, anon, authenticated;
revoke execute on function private.ist_minderjaehrig(date, date) from public, anon, authenticated;
revoke execute on function private.anrede_aus_geschlecht(public.gender) from public, anon, authenticated;
revoke execute on function private.fehlende_stammdaten(date, public.gender, text, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function private.sepa_mandatstext(text, text, text) from public, anon, authenticated;
revoke execute on function private.onboarding_status(uuid) from public, anon, authenticated;
revoke execute on function private.onboarding_pflicht_fehlt(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. Pflichtfelder bei Anlage und Antrag
-- ---------------------------------------------------------------------------
create or replace function public.create_member(
  p_first_name text, p_last_name text, p_email text default null,
  p_birthday date default null, p_gender public.gender default null,
  p_salutation public.salutation default null, p_title text default null,
  p_phone text default null, p_mobile text default null,
  p_street text default null, p_postcode text default null, p_city text default null,
  p_country_code text default 'DE', p_notes text default null,
  p_number text default null, p_started_on date default null,
  p_fee_type_ids uuid[] default '{}', p_auth_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_nummer text;
  v_fee    uuid;
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_fehlt  text[];
begin
  if not private.is_admin() then
    raise exception 'Mitglieder anlegen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if length(btrim(coalesce(p_first_name, ''))) = 0
     or length(btrim(coalesce(p_last_name, ''))) = 0 then
    raise exception 'Vor- und Nachname sind Pflicht.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- p_email, die Stammdaten und p_auth_user_id sind nur der Reihenfolge wegen
  -- optional.
  if v_email = '' then
    raise exception 'Ohne E-Mail-Adresse kann kein Mitglied angelegt werden.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_fehlt := private.fehlende_stammdaten(p_birthday, p_gender, p_street, p_postcode,
                                         p_city, p_phone, p_mobile);
  if cardinality(v_fehlt) > 0 then
    raise exception 'Pflichtangaben fehlen: %.', array_to_string(v_fehlt, ', ')
      using errcode = 'invalid_parameter_value';
  end if;

  if p_birthday > private.heute() then
    raise exception 'Das Geburtsdatum liegt in der Zukunft.'
      using errcode = 'invalid_parameter_value';
  end if;

  perform private.login_pruefen(p_auth_user_id);

  -- Login und Mitglied gehoeren zur selben Adresse. Sonst haette jemand Zugang
  -- zu einem Datensatz, dessen Mails an eine andere Person gehen.
  if not exists (select 1 from auth.users
                  where id = p_auth_user_id and lower(email) = v_email) then
    raise exception 'Der Login gehoert zu einer anderen E-Mail-Adresse als das Mitglied.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- onboarding_completed_at bleibt null: das neue Mitglied durchlaeuft nach
  -- dem ersten Login das Onboarding.
  insert into public.members (
    first_name, last_name, title, gender, salutation, birthday,
    email, phone, mobile, street, postcode, city, country_code,
    notes, auth_user_id, invited_at, onboarding_completed_at
  ) values (
    btrim(p_first_name), btrim(p_last_name), nullif(btrim(coalesce(p_title, '')), ''),
    p_gender, coalesce(p_salutation, private.anrede_aus_geschlecht(p_gender)), p_birthday,
    v_email::extensions.citext,
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_mobile, '')), ''),
    nullif(btrim(coalesce(p_street, '')), ''),
    nullif(btrim(coalesce(p_postcode, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    coalesce(nullif(btrim(coalesce(p_country_code, '')), ''), 'DE'),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_auth_user_id, now(), null
  )
  returning id into v_id;

  v_nummer := coalesce(nullif(btrim(coalesce(p_number, '')), ''),
                       private.next_membership_number());

  insert into public.memberships (member_id, number, started_on, status)
  values (v_id, v_nummer, coalesce(p_started_on, current_date), 'active');

  insert into public.member_roles (member_id, role) values (v_id, 'member');

  foreach v_fee in array coalesce(p_fee_type_ids, '{}') loop
    insert into public.member_fees (member_id, fee_type_id, year)
    values (v_id, v_fee, extract(year from current_date)::integer)
    on conflict do nothing;
  end loop;

  return v_id;
end;
$$;

create or replace function public.accept_membership_application(
  p_application_id uuid, p_number text default null,
  p_fee_type_ids uuid[] default null, p_started_on date default null,
  p_auth_user_id uuid default null
)
returns table (member_id uuid, membership_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a      public.membership_applications;
  v_id     uuid;
  v_nummer text;
  v_arten  uuid[];
  v_code   text;
  v_wert   jsonb;
begin
  if not private.is_admin() then
    raise exception 'Antraege bearbeiten duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_a from public.membership_applications where id = p_application_id;
  if not found then
    raise exception 'Diesen Antrag gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if v_a.status <> 'new' then
    raise exception 'Dieser Antrag wurde bereits bearbeitet.'
      using errcode = 'check_violation';
  end if;

  -- Ohne Angabe (null) die im Antrag gewuenschte Beitragsart. Ein leeres
  -- Array heisst "spaeter festlegen": dann gibt es keine Zuordnung.
  v_arten := case
    when p_fee_type_ids is not null then p_fee_type_ids
    when v_a.desired_fee_type_id is not null then array[v_a.desired_fee_type_id]
    else '{}'::uuid[]
  end;

  -- create_member prueft die Pflichtangaben. Ein alter Antrag, dem etwas
  -- fehlt, laesst sich nicht annehmen; der Vorstand legt das Mitglied dann
  -- direkt an.
  v_id := public.create_member(
    p_first_name   => v_a.first_name,
    p_last_name    => v_a.last_name,
    p_email        => v_a.email::text,
    p_birthday     => v_a.birthday,
    p_gender       => v_a.gender,
    p_salutation   => v_a.salutation,
    p_title        => v_a.title,
    p_phone        => v_a.phone,
    p_mobile       => v_a.mobile,
    p_street       => v_a.street,
    p_postcode     => v_a.postcode,
    p_city         => v_a.city,
    p_country_code => coalesce(v_a.country_code, 'DE'),
    p_notes        => v_a.message,
    p_number       => p_number,
    p_started_on   => coalesce(p_started_on, current_date),
    p_fee_type_ids => v_arten,
    p_auth_user_id => p_auth_user_id
  );

  -- Neue Antraege erheben Notfallkontakt und Erziehungsberechtigte nicht
  -- mehr, das passiert im Onboarding. Aeltere Antraege haben sie noch; dann
  -- gehen sie nicht verloren.
  update public.members set
    emergency_contact_name     = v_a.emergency_contact_name,
    emergency_contact_phone    = v_a.emergency_contact_phone,
    emergency_contact_relation = v_a.emergency_contact_relation,
    guardian_name              = v_a.guardian_name,
    guardian_email             = v_a.guardian_email
  where id = v_id;

  -- Einwilligungen aus aelteren Antraegen uebernehmen. Erteilt wurden sie
  -- beim Absenden; set_at haelt hier den Zeitpunkt der Annahme fest, was der
  -- naechstbeste nachweisbare Zeitpunkt ist.
  for v_code, v_wert in select * from jsonb_each(coalesce(v_a.attribute_choices, '{}'::jsonb)) loop
    if v_wert = 'true'::jsonb then
      begin
        perform public.set_member_attribute(v_id, v_code);
      exception when others then
        -- Ein zwischenzeitlich stillgelegtes Merkmal soll die Aufnahme nicht
        -- aufhalten.
        null;
      end;
    end if;
  end loop;

  select s.number into v_nummer from public.memberships s
  where s.member_id = v_id and s.ended_on is null;

  update public.membership_applications set
    status = 'accepted',
    decided_at = now(),
    decided_by = private.current_member_id(),
    created_member_id = v_id
  where id = p_application_id;

  return query select v_id, v_nummer;
end;
$$;

create or replace function public.submit_membership_application(
  p_data jsonb, p_ip text default null, p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Erziehungsberechtigte, Notfallkontakt und Einwilligungen erhebt jetzt
  -- das Onboarding. Die Spalten bleiben fuer aeltere Antraege stehen.
  v_erlaubt constant text[] := array[
    'first_name', 'last_name', 'title', 'gender', 'salutation', 'birthday',
    'email', 'phone', 'mobile', 'street', 'postcode', 'city',
    'desired_fee_type_id', 'message'
  ];
  v_d       jsonb := '{}'::jsonb;
  v_schl    text;
  v_ip      text := private.hash_ip(p_ip);
  v_email   extensions.citext;
  v_anzahl  integer;
  v_gender  public.gender;
  v_fehlt   text[];
begin
  -- Unbekannte Schluessel werden still uebergangen, nicht abgewiesen: eine
  -- Fehlermeldung waere eine Auskunft ueber die Feldstruktur.
  for v_schl in select jsonb_object_keys(coalesce(p_data, '{}'::jsonb)) loop
    if v_schl = any (v_erlaubt) then
      v_d := v_d || jsonb_build_object(v_schl, p_data -> v_schl);
    end if;
  end loop;

  if length(btrim(coalesce(v_d ->> 'first_name', ''))) = 0
     or length(btrim(coalesce(v_d ->> 'last_name', ''))) = 0 then
    raise exception 'Bitte Vor- und Nachnamen angeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_email := lower(btrim(coalesce(v_d ->> 'email', '')))::extensions.citext;
  if v_email is null or position('@' in v_email::text) = 0 then
    raise exception 'Bitte eine gueltige E-Mail-Adresse angeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  if (v_d ->> 'birthday') is null then
    raise exception 'Bitte das Geburtsdatum angeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  if coalesce(v_d ->> 'gender', '') in ('female', 'male', 'diverse') then
    v_gender := (v_d ->> 'gender')::public.gender;
  end if;

  v_fehlt := private.fehlende_stammdaten(
    (v_d ->> 'birthday')::date, v_gender,
    v_d ->> 'street', v_d ->> 'postcode', v_d ->> 'city',
    v_d ->> 'phone', v_d ->> 'mobile');
  if cardinality(v_fehlt) > 0 then
    raise exception 'Bitte noch angeben: %.', array_to_string(v_fehlt, ', ')
      using errcode = 'invalid_parameter_value';
  end if;

  if (v_d ->> 'birthday')::date > private.heute() then
    raise exception 'Das Geburtsdatum liegt in der Zukunft.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Sperre 1: dieselbe Herkunft, zehnmal in einer Stunde.
  --
  -- Die Zahl war zuerst drei und damit zu streng: hinter einem Anschluss
  -- sitzt oft mehr als eine Person. Beim Schnuppertag melden sich mehrere aus
  -- dem WLAN des Clubheims an, eine Familie fuellt vier Antraege nacheinander
  -- aus - alles voellig gewoehnliche Faelle, die an einer Sperre von drei
  -- gescheitert waeren. Zehn je Stunde bremst Massenzusendungen immer noch
  -- wirksam und trifft niemanden, der wirklich beitreten will.
  if v_ip is not null then
    select count(*)::integer into v_anzahl
    from public.membership_applications
    where ip_hash = v_ip and submitted_at > now() - interval '1 hour';

    if v_anzahl >= 10 then
      raise exception 'Es sind gerade zu viele Antraege eingegangen. Bitte spaeter erneut versuchen.'
        using errcode = 'too_many_rows';
    end if;
  end if;

  -- Sperre 2: zwanzig Antraege in einer Stunde ueberhaupt. Der Verein hat
  -- dreihundert Mitglieder; das ist mit Sicherheit kein echter Andrang.
  select count(*)::integer into v_anzahl
  from public.membership_applications
  where submitted_at > now() - interval '1 hour';

  if v_anzahl >= 20 then
    raise exception 'Es sind gerade zu viele Antraege eingegangen. Bitte spaeter erneut versuchen.'
      using errcode = 'too_many_rows';
  end if;

  -- Sperre 3: schon ein offener Antrag zu dieser Adresse. Das ist ein stiller
  -- Ausstieg mit Erfolgsmeldung - wer hier eine Fehlermeldung bekaeme, wuesste,
  -- dass die Adresse bereits eingereicht hat.
  if exists (select 1 from public.membership_applications
              where email = v_email and status = 'new') then
    return;
  end if;

  insert into public.membership_applications (
    first_name, last_name, title, gender, salutation, birthday,
    email, phone, mobile, street, postcode, city,
    desired_fee_type_id, message, possible_duplicate, ip_hash, user_agent
  ) values (
    btrim(v_d ->> 'first_name'),
    btrim(v_d ->> 'last_name'),
    nullif(btrim(coalesce(v_d ->> 'title', '')), ''),
    v_gender,
    coalesce((nullif(v_d ->> 'salutation', ''))::public.salutation,
             private.anrede_aus_geschlecht(v_gender)),
    (v_d ->> 'birthday')::date,
    v_email,
    nullif(btrim(coalesce(v_d ->> 'phone', '')), ''),
    nullif(btrim(coalesce(v_d ->> 'mobile', '')), ''),
    btrim(v_d ->> 'street'),
    btrim(v_d ->> 'postcode'),
    btrim(v_d ->> 'city'),
    (nullif(v_d ->> 'desired_fee_type_id', ''))::uuid,
    nullif(btrim(coalesce(v_d ->> 'message', '')), ''),
    -- Nur ein Vermerk fuer den Vorstand. Nach aussen aendert er nichts.
    exists (select 1 from public.members m where m.email = v_email),
    v_ip,
    left(coalesce(p_user_agent, ''), 300)
  );

  -- Den Vorstand benachrichtigen. Geht aus anon heraus nur, weil diese
  -- Funktion security definer ist.
  insert into public.notifications (member_id, kind, title, body)
  select distinct r.member_id, 'application_new', 'Neuer Mitgliedsantrag',
         btrim(v_d ->> 'first_name') || ' ' || btrim(v_d ->> 'last_name')
         || ' moechte dem Verein beitreten.'
  from public.member_roles r
  where r.role in ('admin', 'board');
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Onboarding-RPCs, jeweils fuer das eigene Mitglied
-- ---------------------------------------------------------------------------

-- Alles, was Web und App fuer den Assistenten brauchen, in einem Aufruf.
-- null, wenn der Aufrufer kein Mitglied ist (Kiosk).
create or replace function public.my_onboarding()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_m         public.members;
  v_minder    boolean;
  v_mandat    public.sepa_mandates;
  v_g_name    text := btrim(coalesce(public.setting_text('sepa.creditor_name'), ''));
  v_g_id      text := btrim(coalesce(public.setting_text('sepa.creditor_id'), ''));
  v_referenz  text;
begin
  select * into v_m from public.members where id = private.current_member_id();
  if not found then return null; end if;

  v_minder := private.ist_minderjaehrig(v_m.birthday);

  select * into v_mandat from public.sepa_mandates
  where member_id = v_m.id and status = 'active';

  v_referenz := coalesce(v_mandat.reference, private.next_mandate_reference(v_m.id));

  return jsonb_build_object(
    'abgeschlossen_am', v_m.onboarding_completed_at,
    'minderjaehrig', v_minder,
    'status', private.onboarding_status(v_m.id),
    'pflicht_fehlt', to_jsonb(private.onboarding_pflicht_fehlt(v_m.id)),
    'stammdaten', jsonb_build_object(
      'first_name', v_m.first_name, 'last_name', v_m.last_name, 'title', v_m.title,
      'gender', v_m.gender, 'salutation', v_m.salutation, 'birthday', v_m.birthday,
      'email', v_m.email, 'phone', v_m.phone, 'mobile', v_m.mobile,
      'street', v_m.street, 'postcode', v_m.postcode, 'city', v_m.city,
      'country_code', v_m.country_code, 'nationality_code', v_m.nationality_code,
      'bestaetigt_am', v_m.onboarding_stammdaten_at),
    'erziehungsberechtigte', jsonb_build_object(
      'name', v_m.guardian_name, 'email', v_m.guardian_email,
      'phone', v_m.guardian_phone, 'zustimmung_am', v_m.guardian_consent_at),
    'notfallkontakt', jsonb_build_object(
      'name', v_m.emergency_contact_name, 'phone', v_m.emergency_contact_phone,
      'relation', v_m.emergency_contact_relation),
    'dokumente', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', d.code, 'version', d.version, 'title', d.title,
               'valid_from', d.valid_from,
               'zugestimmt_am', c.accepted_at)
             order by array_position(array['satzung', 'beitragsordnung', 'datenschutz'], d.code))
      from public.legal_documents d
      left join public.member_consents c
        on c.member_id = v_m.id and c.document_code = d.code and c.version = d.version
      where d.active), '[]'::jsonb),
    'mandat', jsonb_build_object(
      'vorhanden', v_mandat.id is not null,
      'online_erteilt_am', v_mandat.granted_online_at,
      'referenz', v_referenz,
      'glaeubiger_name', v_g_name,
      'glaeubiger_id', v_g_id,
      'moeglich', v_g_name <> '' and v_g_id <> '',
      'text_version', public.setting_int('sepa.mandate_text_version'),
      'text', coalesce(v_mandat.mandate_text,
                       case when v_g_name <> '' and v_g_id <> ''
                            then private.sepa_mandatstext(v_g_name, v_g_id, v_referenz) end),
      'kontoinhaber_vorschlag', case
        when v_minder then nullif(btrim(coalesce(v_m.guardian_name, '')), '')
        else btrim(v_m.first_name || ' ' || v_m.last_name) end),
    'beitragsarten', coalesce((
      select jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name) order by t.sort_order, t.name)
      from public.member_fees f
      join public.fee_types t on t.id = f.fee_type_id
      where f.member_id = v_m.id
        and f.year = (select max(f2.year) from public.member_fees f2 where f2.member_id = v_m.id)
    ), '[]'::jsonb),
    'merkmale', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', t.code, 'name', t.name, 'description', t.description,
               'gesetzt', exists (select 1 from public.member_attribute_values v
                                  where v.member_id = v_m.id and v.attribute_type_id = t.id))
             order by t.sort_order)
      from public.member_attribute_types t
      where t.code in ('foto', 'newsletter', 'whatsapp') and t.active), '[]'::jsonb),
    'tennis', jsonb_build_object(
      'tennis_lk', v_m.tennis_lk, 'nuliga_id', v_m.nuliga_id,
      'mannschaft_interesse', exists (
        select 1 from public.member_attribute_values v
        join public.member_attribute_types t on t.id = v.attribute_type_id
        where v.member_id = v_m.id and t.code = 'mannschaft_interesse')),
    'einstellungen', jsonb_build_object(
      'booking_mail', (
        select o.value from public.member_attribute_values v
        join public.member_attribute_types t on t.id = v.attribute_type_id
        join public.member_attribute_options o on o.id = v.option_id
        where v.member_id = v_m.id and t.code = 'booking_mail'
        limit 1))
  );
end;
$$;

create or replace function public.onboarding_save_stammdaten(
  p_first_name text, p_last_name text, p_birthday date, p_gender public.gender,
  p_street text, p_postcode text, p_city text,
  p_phone text default null, p_mobile text default null,
  p_salutation public.salutation default null, p_title text default null,
  p_country_code text default 'DE', p_nationality_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m     public.members;
  v_fehlt text[];
begin
  select * into v_m from public.members where id = private.current_member_id();
  if not found then
    raise exception 'Nur Mitglieder haben ein Onboarding.' using errcode = 'insufficient_privilege';
  end if;

  -- Geburtsdatum und Geschlecht korrigiert das Mitglied nur hier, solange das
  -- Onboarding offen ist. Danach geht das ueber den Vorstand.
  if v_m.onboarding_completed_at is not null then
    raise exception 'Das Onboarding ist abgeschlossen. Geburtsdatum und Geschlecht aendert jetzt der Vorstand.'
      using errcode = 'check_violation';
  end if;

  if length(btrim(coalesce(p_first_name, ''))) = 0
     or length(btrim(coalesce(p_last_name, ''))) = 0 then
    raise exception 'Vor- und Nachname sind Pflicht.' using errcode = 'invalid_parameter_value';
  end if;

  v_fehlt := private.fehlende_stammdaten(p_birthday, p_gender, p_street, p_postcode,
                                         p_city, p_phone, p_mobile);
  if cardinality(v_fehlt) > 0 then
    raise exception 'Pflichtangaben fehlen: %.', array_to_string(v_fehlt, ', ')
      using errcode = 'invalid_parameter_value';
  end if;

  if p_birthday > private.heute() or p_birthday < date '1900-01-01' then
    raise exception 'Bitte ein gueltiges Geburtsdatum angeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  perform set_config('tcm.selbstpflege_rpc', 'on', true);

  update public.members set
    first_name       = btrim(p_first_name),
    last_name        = btrim(p_last_name),
    title            = nullif(btrim(coalesce(p_title, '')), ''),
    birthday         = p_birthday,
    gender           = p_gender,
    salutation       = coalesce(p_salutation, private.anrede_aus_geschlecht(p_gender)),
    street           = btrim(p_street),
    postcode         = btrim(p_postcode),
    city             = btrim(p_city),
    phone            = nullif(btrim(coalesce(p_phone, '')), ''),
    mobile           = nullif(btrim(coalesce(p_mobile, '')), ''),
    country_code     = coalesce(nullif(upper(btrim(coalesce(p_country_code, ''))), ''), 'DE'),
    nationality_code = nullif(upper(btrim(coalesce(p_nationality_code, ''))), ''),
    onboarding_stammdaten_at = now()
  where id = v_m.id;

  perform set_config('tcm.selbstpflege_rpc', '', true);
end;
$$;

-- Speichert die aktuell gueltige Version jedes genannten Texts. Eine neue
-- Textversion laesst sich jederzeit nachtraeglich bestaetigen.
create or replace function public.onboarding_accept_documents(p_codes text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me   uuid := private.current_member_id();
  v_code text;
  v_ver  integer;
begin
  if v_me is null then
    raise exception 'Nur Mitglieder koennen zustimmen.' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(cardinality(p_codes), 0) = 0 then
    raise exception 'Es wurde kein Text ausgewaehlt.' using errcode = 'invalid_parameter_value';
  end if;

  foreach v_code in array p_codes loop
    select d.version into v_ver from public.legal_documents d
    where d.code = v_code and d.active;
    if v_ver is null then
      raise exception 'Den Text "%" gibt es nicht.', v_code using errcode = 'invalid_parameter_value';
    end if;

    insert into public.member_consents (member_id, document_code, version)
    values (v_me, v_code, v_ver)
    on conflict (member_id, document_code, version) do nothing;
  end loop;
end;
$$;

create or replace function public.onboarding_save_guardian(
  p_name text, p_email text default null, p_phone text default null,
  p_consent boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m     public.members;
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  select * into v_m from public.members where id = private.current_member_id();
  if not found then
    raise exception 'Nur Mitglieder haben ein Onboarding.' using errcode = 'insufficient_privilege';
  end if;

  if v_email is not null and position('@' in v_email) < 2 then
    raise exception 'Bitte eine gueltige E-Mail-Adresse der Erziehungsberechtigten angeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  if private.ist_minderjaehrig(v_m.birthday) then
    if v_name is null then
      raise exception 'Bitte den Namen der Erziehungsberechtigten angeben.'
        using errcode = 'invalid_parameter_value';
    end if;
    if v_email is null and v_phone is null then
      raise exception 'Bitte eine E-Mail-Adresse oder Telefonnummer der Erziehungsberechtigten angeben.'
        using errcode = 'invalid_parameter_value';
    end if;
    if not coalesce(p_consent, false) then
      raise exception 'Die Erziehungsberechtigten muessen der Mitgliedschaft zustimmen.'
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  perform set_config('tcm.selbstpflege_rpc', 'on', true);

  update public.members set
    guardian_name       = v_name,
    guardian_email      = v_email::extensions.citext,
    guardian_phone      = v_phone,
    guardian_consent_at = case when coalesce(p_consent, false)
                               then coalesce(v_m.guardian_consent_at, now()) end
  where id = v_m.id;

  perform set_config('tcm.selbstpflege_rpc', '', true);
end;
$$;

create or replace function public.onboarding_save_notfallkontakt(
  p_name text, p_phone text, p_relation text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m     public.members;
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  select * into v_m from public.members where id = private.current_member_id();
  if not found then
    raise exception 'Nur Mitglieder haben ein Onboarding.' using errcode = 'insufficient_privilege';
  end if;

  if private.ist_minderjaehrig(v_m.birthday) and (v_name is null or v_phone is null) then
    raise exception 'Bei Minderjaehrigen sind Name und Telefonnummer des Notfallkontakts Pflicht.'
      using errcode = 'invalid_parameter_value';
  end if;

  if (v_name is null) <> (v_phone is null) then
    raise exception 'Bitte Name und Telefonnummer des Notfallkontakts angeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.members set
    emergency_contact_name     = v_name,
    emergency_contact_phone    = v_phone,
    emergency_contact_relation = nullif(btrim(coalesce(p_relation, '')), '')
  where id = v_m.id;
end;
$$;

-- Das Mitglied erteilt sein Mandat selbst. Bei Minderjaehrigen ist der
-- Kontoinhaber ein Elternteil; ohne Angabe wird der Name der
-- Erziehungsberechtigten eingetragen.
create or replace function public.create_my_sepa_mandate(
  p_iban text, p_holder text default null, p_accept boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m       public.members;
  v_g_name  text := btrim(coalesce(public.setting_text('sepa.creditor_name'), ''));
  v_g_id    text := btrim(coalesce(public.setting_text('sepa.creditor_id'), ''));
  v_iban    text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
  v_holder  text := nullif(btrim(coalesce(p_holder, '')), '');
  v_finger  bytea;
  v_konto   uuid;
  v_ref     text;
begin
  select * into v_m from public.members where id = private.current_member_id();
  if not found then
    raise exception 'Nur Mitglieder koennen ein Mandat erteilen.'
      using errcode = 'insufficient_privilege';
  end if;

  if not coalesce(p_accept, false) then
    raise exception 'Bitte bestaetige das Mandat ausdruecklich.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Pro Mitglied hoechstens ein aktives Mandat (Index sepa_mandates_ein_aktives).
  if exists (select 1 from public.sepa_mandates
              where member_id = v_m.id and status = 'active') then
    raise exception 'Fuer dich besteht bereits ein aktives SEPA-Mandat. Aendern kann es der Vorstand.'
      using errcode = 'check_violation';
  end if;

  if v_g_name = '' or v_g_id = '' then
    raise exception 'Die Glaeubigerdaten des Vereins fehlen noch. Bitte wende dich an den Vorstand.'
      using errcode = 'check_violation';
  end if;

  if not public.iban_is_valid(v_iban) then
    raise exception 'Diese IBAN ist nicht gueltig. Bitte die Ziffern pruefen.'
      using errcode = 'invalid_parameter_value';
  end if;

  if private.ist_minderjaehrig(v_m.birthday) then
    v_holder := coalesce(v_holder, nullif(btrim(coalesce(v_m.guardian_name, '')), ''));
    if v_holder is null then
      raise exception 'Bitte zuerst die Erziehungsberechtigten angeben. Kontoinhaber ist bei Kindern ein Elternteil.'
        using errcode = 'invalid_parameter_value';
    end if;
  else
    v_holder := coalesce(v_holder, btrim(v_m.first_name || ' ' || v_m.last_name));
  end if;

  if length(v_holder) > 70 then
    raise exception 'Der Name des Kontoinhabers ist zu lang (hoechstens 70 Zeichen).'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Dieselbe IBAN hat der Vorstand vielleicht schon erfasst. Dann wird die
  -- vorhandene Bankverbindung genommen statt einer zweiten.
  v_finger := private.fingerprint_iban(v_iban);
  select id into v_konto from public.bank_accounts
  where member_id = v_m.id and iban_fingerprint = v_finger;

  if v_konto is null then
    insert into public.bank_accounts
      (member_id, iban_encrypted, iban_fingerprint, iban_last4, holder, source)
    values (v_m.id, private.encrypt_iban(v_iban), v_finger, right(v_iban, 4), v_holder, 'app')
    returning id into v_konto;
  else
    update public.bank_accounts set holder = v_holder, active = true where id = v_konto;
  end if;

  v_ref := private.next_mandate_reference(v_m.id);

  insert into public.sepa_mandates (
    member_id, bank_account_id, reference, signed_on, sequence_type, status, source,
    granted_online_at, mandate_text, accepted_holder
  ) values (
    v_m.id, v_konto, v_ref, private.heute(), 'FRST', 'active', 'app',
    now(), private.sepa_mandatstext(v_g_name, v_g_id, v_ref), v_holder
  );

  return v_ref;
end;
$$;

-- Schritt Tennis. Bleibt nach dem Onboarding im Konto erreichbar.
create or replace function public.save_my_tennis(
  p_tennis_lk text default null, p_nuliga_id text default null,
  p_mannschaft_interesse boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me  uuid := private.current_member_id();
  v_lk  text := nullif(btrim(coalesce(p_tennis_lk, '')), '');
  v_nu  text := nullif(btrim(coalesce(p_nuliga_id, '')), '');
  v_typ uuid;
begin
  if v_me is null then
    raise exception 'Nur Mitglieder haben ein Konto.' using errcode = 'insufficient_privilege';
  end if;

  if length(coalesce(v_lk, '')) > 20 or length(coalesce(v_nu, '')) > 40 then
    raise exception 'LK oder nuLiga-ID ist zu lang.' using errcode = 'invalid_parameter_value';
  end if;

  perform set_config('tcm.selbstpflege_rpc', 'on', true);
  update public.members set tennis_lk = v_lk, nuliga_id = v_nu where id = v_me;
  perform set_config('tcm.selbstpflege_rpc', '', true);

  select id into v_typ from public.member_attribute_types where code = 'mannschaft_interesse';
  if v_typ is not null then
    delete from public.member_attribute_values
    where member_id = v_me and attribute_type_id = v_typ;
    if coalesce(p_mannschaft_interesse, false) then
      insert into public.member_attribute_values (member_id, attribute_type_id, text_value, set_by)
      values (v_me, v_typ, 'ja', v_me);
    end if;
  end if;
end;
$$;

-- Schliesst das Onboarding ab, wenn alle Pflichtschritte erledigt sind.
-- Sonst nennt die Meldung, was fehlt; DETAIL enthaelt die Schluessel
-- kommagetrennt (passwort, stammdaten, rechtliches, erziehungsberechtigte,
-- notfallkontakt, sepa).
create or replace function public.complete_onboarding()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m      public.members;
  v_fehlt  text[];
  v_namen  text[];
  v_jetzt  timestamptz := now();
begin
  select * into v_m from public.members where id = private.current_member_id();
  if not found then
    raise exception 'Nur Mitglieder haben ein Onboarding.' using errcode = 'insufficient_privilege';
  end if;

  if v_m.onboarding_completed_at is not null then
    return v_m.onboarding_completed_at;
  end if;

  v_fehlt := private.onboarding_pflicht_fehlt(v_m.id);

  if cardinality(v_fehlt) > 0 then
    select array_agg(case k
             when 'passwort'              then 'Passwort'
             when 'stammdaten'            then 'Stammdaten'
             when 'rechtliches'           then 'Satzung, Beitragsordnung und Datenschutz'
             when 'erziehungsberechtigte' then 'Erziehungsberechtigte'
             when 'notfallkontakt'        then 'Notfallkontakt'
             when 'sepa'                  then 'SEPA-Lastschriftmandat'
           end order by o)
      into v_namen
    from unnest(v_fehlt) with ordinality as u(k, o);

    raise exception 'Es fehlt noch: %.', array_to_string(v_namen, ', ')
      using errcode = 'check_violation', detail = array_to_string(v_fehlt, ',');
  end if;

  perform set_config('tcm.selbstpflege_rpc', 'on', true);
  update public.members set onboarding_completed_at = v_jetzt where id = v_m.id;
  perform set_config('tcm.selbstpflege_rpc', '', true);

  return v_jetzt;
end;
$$;

revoke execute on function public.my_onboarding() from public, anon;
revoke execute on function public.onboarding_save_stammdaten(text, text, date, public.gender, text, text, text, text, text, public.salutation, text, text, text) from public, anon;
revoke execute on function public.onboarding_accept_documents(text[]) from public, anon;
revoke execute on function public.onboarding_save_guardian(text, text, text, boolean) from public, anon;
revoke execute on function public.onboarding_save_notfallkontakt(text, text, text) from public, anon;
revoke execute on function public.create_my_sepa_mandate(text, text, boolean) from public, anon;
revoke execute on function public.save_my_tennis(text, text, boolean) from public, anon;
revoke execute on function public.complete_onboarding() from public, anon;

grant execute on function public.my_onboarding() to authenticated;
grant execute on function public.onboarding_save_stammdaten(text, text, date, public.gender, text, text, text, text, text, public.salutation, text, text, text) to authenticated;
grant execute on function public.onboarding_accept_documents(text[]) to authenticated;
grant execute on function public.onboarding_save_guardian(text, text, text, boolean) to authenticated;
grant execute on function public.onboarding_save_notfallkontakt(text, text, text) to authenticated;
grant execute on function public.create_my_sepa_mandate(text, text, boolean) to authenticated;
grant execute on function public.save_my_tennis(text, text, boolean) to authenticated;
grant execute on function public.complete_onboarding() to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Schreibende RPCs, die bisher nur current_member_id() pruefen
--
-- Buchen, Mitspielen und Getraenke buchen. Die Lese-Seite sperrt is_member()
-- schon; ohne diese Pruefung koennte ein Konto mit offenem Onboarding am
-- Assistenten vorbei per RPC buchen. Ansonsten unveraendert.
-- ---------------------------------------------------------------------------

create or replace function public.create_booking(p_court_id uuid, p_starts_at timestamp with time zone, p_booking_type_code text, p_player_member_ids uuid[] DEFAULT '{}'::uuid[], p_guest_names text[] DEFAULT '{}'::text[], p_partner_wanted boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform private.pruefe_freigeschaltet();

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
end; $function$;

create or replace function public.join_booking(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end; $function$;

create or replace function public.record_drink_purchase(p_item_id uuid, p_quantity integer DEFAULT 1)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := private.current_member_id();
begin
  if v_me is null then
    raise exception 'Nur Mitglieder koennen Getraenke buchen.'
      using errcode = 'insufficient_privilege';
  end if;
  perform private.pruefe_freigeschaltet();
  return private.record_purchase(v_me, p_item_id, p_quantity, 'app', v_me);
end;
$function$;
