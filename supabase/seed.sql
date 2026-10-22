-- ===========================================================================
-- Testbestand
--
-- ACHTUNG: Diese Datei leert die fachlichen Tabellen und legt sie neu an.
-- Sie ist ausschliesslich fuer Entwicklung und Tests gedacht.
--
-- Alle Personen hier sind erfunden. Die IBANs sind formal gueltig (korrekte
-- Pruefziffer), gehoeren aber zu keinem realen Konto. Waehrend der gesamten
-- Bauphase kommt kein echter Mitgliederdatensatz in die Datenbank.
--
-- Die Verteilungen bilden den eBuSy-Ist-Stand nach, damit die App an
-- realistischen Groessenordnungen entwickelt wird und die Randfaelle - zwei
-- Beitragsarten, fehlende Bankverbindung, Kinder mit dem Konto der Eltern -
-- schon hier auftreten und nicht erst beim Cutover.
-- ===========================================================================

select setseed(0.4711);   -- reproduzierbar: gleicher Lauf, gleicher Bestand

-- ---------------------------------------------------------------------------
-- Verschluesselungsschluessel sicherstellen
--
-- Wird zufaellig erzeugt und liegt in Supabase Vault - nicht im Repo.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'iban_encryption_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'iban_encryption_key',
      'Schluessel fuer die IBAN-Verschluesselung in bank_accounts'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Aufraeumen
-- ---------------------------------------------------------------------------
truncate table
  public.notifications,
  public.booking_players,
  public.bookings,
  public.booking_series,
  public.drink_purchases,
  public.billing_periods,
  public.drink_prices,
  public.drink_items,
  public.debit_items,
  public.debit_batches,
  public.charges,
  public.work_duty_settlements,
  public.work_duty_entries,
  public.work_duty_rules,
  public.sepa_mandates,
  public.bank_accounts,
  public.member_fees,
  public.fee_prices,
  public.fee_types,
  public.member_roles,
  public.memberships,
  public.members,
  public.teams,
  public.booking_types,
  public.courts
cascade;

-- WICHTIG: settings hat einen Fremdschluessel auf members (updated_by) und
-- wird deshalb vom CASCADE oben mit geleert. Ohne booking.opening_time bricht
-- create_booking sofort ab - die Standardwerte muessen also zurueck.
select public.ensure_default_settings();

-- ---------------------------------------------------------------------------
-- Plaetze: acht Sandplaetze
-- ---------------------------------------------------------------------------
insert into public.courts (name, short_name, subline, position)
select 'Platz ' || i, 'P' || i, 'Sandplatz', i - 1
from generate_series(1, 8) i;

-- ---------------------------------------------------------------------------
-- Buchungsarten
--
-- Alle Buchungsarten dauern 60 Minuten. Im Ist-Stand waren 393 von 460
-- Buchungen exakt so lang; die Ausnahmen fielen mit dem Stundenraster weg.
-- Blockungen duerfen weiter krumme Zeiten haben - ein Training faengt um
-- 18:30 an, und daran aendert die Anzeige nichts.
-- ---------------------------------------------------------------------------
insert into public.booking_types
  (code, name, applies_to, duration_minutes, min_players, max_players,
   requires_partner, counts_towards_quota, allowed_roles, sort_order)
values
  ('einzel', 'Einzel', 'booking', 60, 2, 2, true, true, null, 1),
  ('doppel', 'Doppel', 'booking', 60, 3, 4, true, true, null, 2),
  ('training', 'Training', 'blocking', 90, 0, 0, false, false,
   array['admin']::public.app_role[], 3),
  ('verbandsspiel', 'Verbandsspiel', 'blocking', 240, 0, 0, false, false,
   array['admin']::public.app_role[], 4),
  ('platzpflege', 'Platzpflege', 'blocking', 120, 0, 0, false, false,
   array['admin']::public.app_role[], 5);

-- ---------------------------------------------------------------------------
-- Beitragsarten mit Platzhalterpreisen
--
-- Die echten Betraege pflegt der Vorstand im Admin. Die Anteile entsprechen
-- dem Ist-Stand: Erwachsener 140, Jugend 97, Passiv 63, Paare 29 usw.
-- ---------------------------------------------------------------------------
insert into public.fee_types (code, name, description, sort_order) values
  ('erwachsener',        'Erwachsener',              'Aktives Mitglied ab 18',            1),
  ('erwachsener_passiv', 'Erwachsener Passiv',       'Passive Mitgliedschaft',            2),
  ('jugend',             'Kinder und Jugendliche',   'Bis einschließlich 17 Jahre',       3),
  ('student',            'Student',                  'Mit gültiger Bescheinigung',        4),
  ('paare',              'Erwachsener Paare',        'Ermäßigung für Paare',              5),
  ('beitragsbefreit',    'Beitragsbefreit',          'Ehrenmitglieder und Sonderfälle',   6),
  ('trainer',            'Trainer',                  'Beitragsbefreit als Trainer',       7),
  ('schnuppern',         'Erwachsener-Schnuppern',   'Schnuppermitgliedschaft',           8),
  ('schluesselpfand',    'Schlüsselpfand',           'Einmalig, zusätzlich zum Beitrag',  9);

insert into public.fee_prices (fee_type_id, valid_from_year, amount_cents)
select id, 2026,
  case code
    when 'erwachsener'        then 19000
    when 'erwachsener_passiv' then  7000
    when 'jugend'             then  9000
    when 'student'            then 11000
    when 'paare'              then 15000
    when 'beitragsbefreit'    then     0
    when 'trainer'            then     0
    when 'schnuppern'         then  8000
    when 'schluesselpfand'    then  5000
  end
from public.fee_types;

-- Vorjahrespreise, damit die Preishistorie im Test echte Tiefe hat
insert into public.fee_prices (fee_type_id, valid_from_year, amount_cents)
select id, 2025,
  case code
    when 'erwachsener'        then 18000
    when 'erwachsener_passiv' then  6500
    when 'jugend'             then  8500
    when 'student'            then 10000
    when 'paare'              then 14000
    when 'beitragsbefreit'    then     0
    when 'trainer'            then     0
    when 'schnuppern'         then  8000
    when 'schluesselpfand'    then  5000
  end
from public.fee_types;

-- ---------------------------------------------------------------------------
-- Arbeitsdienst: Erwachsene leisten Stunden, Jugend und Passive nicht.
-- ---------------------------------------------------------------------------
insert into public.work_duty_rules (fee_type_id, year, required_hours)
select id, 2026,
  case code
    when 'erwachsener' then 8
    when 'paare'       then 8
    when 'student'     then 8
    else 0
  end
from public.fee_types;

-- ---------------------------------------------------------------------------
-- Getraenkeliste
-- ---------------------------------------------------------------------------
insert into public.drink_items (name, description, category, sort_order) values
  ('Wasser still',      '0,5 l',        'drink', 1),
  ('Wasser spritzig',   '0,5 l',        'drink', 2),
  ('Apfelschorle',      '0,5 l',        'drink', 3),
  ('Cola',              '0,33 l',       'drink', 4),
  ('Iso-Getränk',       '0,5 l',        'drink', 5),
  ('Bier',              '0,33 l',       'drink', 6),
  ('Alkoholfreies Bier','0,33 l',       'drink', 7),
  ('Radler',            '0,33 l',       'drink', 8),
  ('Kaffee',            'Tasse',        'drink', 9),
  ('Schokoriegel',      '',             'food',  10),
  ('Brezel',            '',             'food',  11);

insert into public.drink_prices (drink_item_id, valid_from, price_cents)
select id, date '2026-01-01',
  case name
    when 'Wasser still'       then 150
    when 'Wasser spritzig'    then 150
    when 'Apfelschorle'       then 180
    when 'Cola'               then 180
    when 'Iso-Getränk'        then 200
    when 'Bier'               then 250
    when 'Alkoholfreies Bier' then 250
    when 'Radler'             then 250
    when 'Kaffee'             then 120
    when 'Schokoriegel'       then 100
    when 'Brezel'             then 130
  end
from public.drink_items;

-- ---------------------------------------------------------------------------
-- Mitglieder
--
-- 400 Personen, Alter 6 bis 92 mit Schwerpunkt um 35, davon rund 19 Prozent
-- minderjaehrig. Jedes Mitglied hat eine eigene, eindeutige Adresse und einen
-- Login, auch ein Kind (CHECK members_login_pflicht). Login und Mitglied
-- entstehen deshalb im selben Statement: zuerst das Konto in auth.users, dann
-- das Mitglied mit auth_user_id.
--
-- An die @example.org-Adressen geht nie eine Mail (ist_testadresse). Das
-- Passwort ist dasselbe wie bei den Testkonten unten; der Hash wird einmal
-- berechnet, sonst kostet bcrypt fuer 400 Konten spuerbar Zeit.
--
-- Die Token-Spalten in auth.users muessen leere Zeichenketten enthalten,
-- nicht null: GoTrue liest sie in Go-Strings ein und quittiert null mit
-- "converting NULL to string is unsupported" - einem Fehler 500 beim
-- Anmelden, der nichts ueber seine Ursache verraet. Ohne Identitaet lehnt
-- GoTrue die Anmeldung mit Passwort ab.
-- ---------------------------------------------------------------------------
with vornamen as (
  select array[
    'Andreas','Anja','Bernd','Birgit','Christian','Claudia','Daniel','Diana',
    'Erik','Eva','Frank','Franziska','Georg','Gabriele','Hannes','Heike',
    'Ingo','Irene','Jan','Julia','Kai','Katrin','Lars','Lena','Martin','Maria',
    'Nils','Nadine','Oliver','Olivia','Peter','Petra','Ralf','Rebecca',
    'Stefan','Sabine','Thomas','Tanja','Uwe','Ulrike','Volker','Vera',
    'Wolfgang','Wiebke','Xaver','Yvonne','Zeno','Zoe','Emil','Emma',
    'Finn','Frieda','Jonas','Johanna','Leon','Lea','Noah','Nele','Paul','Paula'
  ] as v
), nachnamen as (
  select array[
    'Bauer','Becker','Berger','Braun','Brandt','Dietrich','Engel','Fischer',
    'Frank','Graf','Gross','Haas','Hartmann','Herzog','Hofmann','Huber',
    'Jung','Kaiser','Keller','Klein','Koch','Koenig','Krause','Krueger',
    'Lang','Lehmann','Lorenz','Ludwig','Maier','Martin','Mayer','Meier',
    'Meyer','Moser','Neumann','Peters','Richter','Roth','Schaefer','Schmid',
    'Schmidt','Schneider','Scholz','Schulz','Schwarz','Seidel','Simon',
    'Sommer','Stein','Vogel','Voigt','Wagner','Walter','Weber','Wegner',
    'Werner','Winkler','Wolf','Zimmermann','Ziegler'
  ] as n
), gen as (
  select
    i,
    (select v from vornamen)[1 + floor(random() * 60)::int]  as first_name,
    (select n from nachnamen)[1 + floor(random() * 60)::int] as last_name,
    -- Altersverteilung
    case
      when random() < 0.19 then 6  + floor(random() * 12)::int
      else                      18 + floor(power(random(), 1.6) * 74)::int
    end as age,
    random() as r_gender,
    random() as r_bank,
    random() as r_phone,
    -- Feste IDs statt gen_random_uuid (T3): Wer Admin wird, wessen Konto die
    -- Kinder mitbenutzen, und welche Mitglieder admin@ und mitglied@ werden,
    -- haengt an der Sortierung nach id. Mit zufaelligen IDs wanderte das bei
    -- jedem db reset. Die ersten beiden werden die Testkonten (siehe unten).
    case i when 1 then 'e2e00000-0000-4000-8000-000000000001'::uuid
           when 2 then 'e2e00000-0000-4000-8000-000000000002'::uuid
           else md5('tcm-mitglied-' || i)::uuid end as member_id,
    case i when 1 then 'e2e00000-0000-4000-8000-000000000101'::uuid
           when 2 then 'e2e00000-0000-4000-8000-000000000102'::uuid
           else md5('tcm-konto-' || i)::uuid end as auth_id
  from generate_series(1, 400) i
), passwort as (
  select extensions.crypt('tcm-lokal-2026', extensions.gen_salt('bf')) as hash
), konten as (
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  )
  select
    g.auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    lower(g.first_name) || '.' || lower(g.last_name) || g.i::text || '@example.org',
    (select hash from passwort),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('member_id', g.member_id),
    '', '', '', '', '', '', '', ''
  from gen g
  returning id, email
), identitaeten as (
  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
  )
  select
    extensions.gen_random_uuid(), k.id, k.id::text, 'email',
    jsonb_build_object('sub', k.id::text, 'email', k.email, 'email_verified', true),
    null, now(), now()
  from konten k
)
insert into public.members
  (id, auth_user_id, invited_at, first_name, last_name, gender, salutation, birthday, email, mobile,
   street, postcode, city, country_code, status)
select
  member_id,
  auth_id,
  now(),
  first_name,
  last_name,
  case when r_gender < 0.48 then 'female'::public.gender
       when r_gender < 0.98 then 'male'::public.gender
       else 'diverse'::public.gender end,
  case when r_gender < 0.48 then 'female'::public.salutation
       when r_gender < 0.98 then 'male'::public.salutation
       else 'none'::public.salutation end,
  -- Die beiden Testkonten sind erwachsen. random() laeuft trotzdem mit, damit
  -- der restliche Bestand derselbe bleibt.
  (current_date - make_interval(years => case when i <= 2 then 41 else age end)
                - make_interval(days => floor(random() * 365)::int))::date,
  lower(first_name) || '.' || lower(last_name) || i::text || '@example.org',
  case when r_phone < 0.86
       then '0170 ' || lpad(floor(random() * 9999999)::text, 7, '0')
       else null end,
  (array['Waiblinger Str.','Hauptstr.','Schmidener Str.','Muehlweg',
         'Am Sportplatz','Bahnhofstr.','Lindenweg','Talstr.'])[1 + floor(random() * 8)::int]
    || ' ' || (1 + floor(random() * 120)::int)::text,
  (array['70372','70374','70376','70378','71332','70734'])[1 + floor(random() * 6)::int],
  (array['Stuttgart','Stuttgart','Stuttgart','Fellbach','Waiblingen'])[1 + floor(random() * 5)::int],
  'DE',
  'active'
from gen;

-- ---------------------------------------------------------------------------
-- Mitgliedschaften mit fortlaufender Nummer
-- ---------------------------------------------------------------------------
insert into public.memberships (member_id, number, started_on, status)
select
  m.id,
  lpad(row_number() over (order by m.created_at, m.id)::text, 4, '0'),
  (current_date - make_interval(days => (30 + floor(random() * 15000))::int))::date,
  'active'
from public.members m;

-- ---------------------------------------------------------------------------
-- Beitragsarten zuweisen
--
-- Regelbasiert nach Alter, danach die Sonderfaelle. Ergibt eine Verteilung,
-- die dem Ist-Stand nahekommt.
-- ---------------------------------------------------------------------------
-- Der Beitrags-Code wird pro Mitglied EINMAL bestimmt und danach gejoint.
-- Stuende das CASE mit random() in der WHERE-Klausel, wuerde es pro Zeile von
-- fee_types neu ausgewuerfelt - dann bekaemen manche Mitglieder gar keine
-- Beitragsart und andere eine zufaellig andere als gedacht.
with zuordnung as (
  select
    m.id as member_id,
    case
      when extract(year from age(m.birthday)) < 18 then 'jugend'
      when extract(year from age(m.birthday)) between 18 and 27 and r < 0.25 then 'student'
      when r < 0.35 then 'erwachsener_passiv'
      when r < 0.44 then 'paare'
      when r < 0.47 then 'beitragsbefreit'
      when r < 0.52 then 'schnuppern'
      else 'erwachsener'
    end as code
  from (select id, birthday, random() as r from public.members) m
)
insert into public.member_fees (member_id, fee_type_id, year)
select z.member_id, f.id, 2026
from zuordnung z
join public.fee_types f on f.code = z.code;

-- Schluesselpfand als zweite Beitragsart bei rund 17 Prozent - das erzeugt
-- genau die Doppelzuordnung, die im Ist-Stand 67 mal vorkommt.
insert into public.member_fees (member_id, fee_type_id, year)
select m.id, ft.id, 2026
from public.members m
cross join (select id from public.fee_types where code = 'schluesselpfand') ft
where random() < 0.17
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Bankverbindungen und Mandate fuer rund 94 Prozent
--
-- Die restlichen Mitglieder zahlen per Ueberweisung. Dieser Fall muss im Test
-- vorkommen, sonst faellt er erst beim ersten echten Beitragslauf auf.
-- ---------------------------------------------------------------------------
with kandidaten as (
  select m.id as member_id, m.first_name, m.last_name,
         lpad(floor(random() * 99999999)::text, 8, '0')  as blz,
         lpad(floor(random() * 9999999999)::text, 10, '0') as konto
  from public.members m
  where random() < 0.94
    and m.birthday <= current_date - interval '14 years'   -- Kinder: siehe Kinderkonten unten
), erzeugt as (
  select
    member_id, first_name, last_name,
    'DE' || public.iban_check_digits(blz || konto) || blz || konto as iban
  from kandidaten
)
insert into public.bank_accounts
  (member_id, iban_encrypted, iban_fingerprint, iban_last4, holder, bank_name)
select
  member_id,
  private.encrypt_iban(iban),
  -- Der Fingerabdruck gehoert von Anfang an dazu: ohne ihn liefe die
  -- Dublettenpruefung auf dem Testbestand ins Leere, weil der Chiffretext
  -- bei jeder Verschluesselung ein anderer ist.
  private.fingerprint_iban(iban),
  right(iban, 4),
  first_name || ' ' || last_name,
  (array['Volksbank Stuttgart','Kreissparkasse Waiblingen','LBBW',
         'comdirect','ING','DKB'])[1 + floor(random() * 6)::int]
from erzeugt;

-- Kinderkonten
--
-- Jedes Mitglied zahlt fuer sich, auch ein Kind. Kinder unter 14 bekommen
-- deshalb ein eigenes Konto mit der IBAN eines Erwachsenen,
-- der als Kontoinhaber eingetragen ist. Das bildet die 36 paidByInfo-Faelle
-- aus eBuSy ab: drei Kinder einer Familie ergeben drei Lastschriften auf
-- dieselbe IBAN, jede mit eigener Mandatsreferenz.
with kinder as (
  select id, row_number() over (order by id) as rn
  from public.members
  where birthday > current_date - interval '14 years'
), eltern as (
  select id, first_name, last_name, row_number() over (order by id) as rn
  from public.members
  where extract(year from age(birthday)) between 30 and 60
)
insert into public.bank_accounts
  (member_id, iban_encrypted, iban_fingerprint, iban_last4, holder, bank_name)
select
  k.id,
  private.encrypt_iban(private.decrypt_iban(ba.iban_encrypted)),
  ba.iban_fingerprint,
  ba.iban_last4,
  e.first_name || ' ' || e.last_name,
  ba.bank_name
from kinder k
join eltern e on e.rn = ((k.rn - 1) % (select count(*) from eltern)) + 1
join public.bank_accounts ba on ba.member_id = e.id;

-- last_used_on wird aus signed_on abgeleitet, nicht unabhaengig gewuerfelt:
-- ein Mandat kann nicht benutzt worden sein, bevor es unterschrieben wurde.
-- Der Check sepa_mandates_used_after_signed erzwingt das ohnehin.
with basis as (
  select
    ba.member_id,
    ba.id as bank_account_id,
    row_number() over (order by ba.created_at, ba.id) as rn,
    (current_date - make_interval(days => (60 + floor(random() * 1200))::int))::date as signed_on,
    random() as r_used
  from public.bank_accounts ba
)
insert into public.sepa_mandates
  (member_id, bank_account_id, reference, signed_on, last_used_on, sequence_type)
select
  member_id,
  bank_account_id,
  'TCM-' || lpad(rn::text, 5, '0'),
  signed_on,
  -- 13 Prozent haben ihr Mandat noch nie benutzt; bei denen laeuft die
  -- 36-Monats-Frist ab Unterschrift.
  case when r_used < 0.87
       then (signed_on + make_interval(
              days => floor(random() * greatest(current_date - signed_on, 1))::int))::date
       else null end,
  'RCUR'
from basis;

-- ---------------------------------------------------------------------------
-- Rollen
-- ---------------------------------------------------------------------------
insert into public.member_roles (member_id, role)
select id, 'member'::public.app_role from public.members;

-- Es gibt nur noch zwei Stufen. Admin wird der Vorstand samt Kassenwart und
-- Sportwart - sieben Personen; alle uebrigen bleiben Mitglied.
with nummeriert as (
  select id, row_number() over (order by created_at, id) as rn from public.members
  where id::text not like 'e2e00000-%'   -- die Testkonten bekommen ihre Rollen unten
)
insert into public.member_roles (member_id, role)
select id, 'admin'::public.app_role from nummeriert where rn <= 7
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Arbeitsdienst: einige Mitglieder haben schon Stunden geleistet
-- ---------------------------------------------------------------------------
insert into public.work_duty_entries
  (member_id, year, hours, worked_on, description, confirmed_by, confirmed_at)
select
  mf.member_id,
  2026,
  (array[2, 3, 4, 6, 8])[1 + floor(random() * 5)::int],
  (current_date - make_interval(days => floor(random() * 180)::int))::date,
  (array['Platzpflege Frühjahr','Thekendienst','Anlagenpflege','Turnierhelfer'])
    [1 + floor(random() * 4)::int],
  (select member_id from public.member_roles where role = 'admin' limit 1),
  now()
from public.member_fees mf
join public.work_duty_rules wr
  on wr.fee_type_id = mf.fee_type_id and wr.year = mf.year and wr.required_hours > 0
where random() < 0.55;

-- ---------------------------------------------------------------------------
-- Getraenkebuchungen der letzten 40 Tage
-- ---------------------------------------------------------------------------
insert into public.drink_purchases
  (member_id, drink_item_id, quantity, unit_price_cents, source, recorded_by, created_at)
select
  m.id,
  di.id,
  1 + floor(random() * 2)::int,
  dp.price_cents,
  (array['app','kiosk','kiosk','bar_duty'])[1 + floor(random() * 4)::int]::public.purchase_source,
  m.id,
  now() - make_interval(days => floor(random() * 40)::int, mins => floor(random() * 1440)::int)
from public.members m
cross join lateral (
  select id from public.drink_items order by random() limit 1
) di
join public.drink_prices dp on dp.drink_item_id = di.id
cross join generate_series(1, 3)
where random() < 0.6;

-- Eine Trainingsserie, wie sie der Sportwart anlegen wuerde
--
-- Steht vor den Zufallsbuchungen: die weichen ihr dann aus (on conflict). In
-- umgekehrter Reihenfolge fehlte der Serie ab und zu ein Termin, und wer sie
-- bearbeitete, musste ploetzlich eine Buchung verdraengen (E2E-Flake).
insert into public.booking_series
  (court_id, booking_type_id, weekday, start_time, end_time, valid_from, valid_to, title)
select
  (select id from public.courts where short_name = 'P8'),
  (select id from public.booking_types where code = 'training'),
  2, '18:30', '20:00', current_date, current_date + 60, 'Jugendtraining';

insert into public.bookings (court_id, slot, kind, booking_type_id, series_id, title)
select
  bs.court_id,
  tstzrange((d::date + bs.start_time) at time zone 'Europe/Berlin',
            (d::date + bs.end_time)   at time zone 'Europe/Berlin', '[)'),
  'blocking', bs.booking_type_id, bs.id, bs.title
from public.booking_series bs
cross join generate_series(bs.valid_from, bs.valid_to, interval '1 day') d
where extract(dow from d)::integer = bs.weekday
on conflict on constraint bookings_no_overlap do nothing;

-- ---------------------------------------------------------------------------
-- Platzbuchungen der naechsten Tage
--
-- Bewusst nur im erlaubten Vorlauffenster und ohne Kontingentverletzung, damit
-- der Bestand konsistent zu den Regeln ist.
--
-- Nie um 08:00 und nie zwischen 11 und 15 Uhr: dieses Fenster haelt der Seed
-- frei, dort buchen die E2E-Tests feste Termine (T3). Die Testkonten
-- (e2e00000-...) bekommen keine Zufallsbuchungen, sonst stuenden sie den
-- Tests mit "Du spielst zu dieser Zeit schon" im Weg.
-- ---------------------------------------------------------------------------
with kandidaten as (
  select
    c.id as court_id,
    ((date_trunc('day', now() at time zone 'Europe/Berlin')::date + d)
      + (array['09:00','10:00','15:00','16:00','17:00','18:00','19:00','20:00'])
        [1 + floor(random() * 8)::int]::time
    ) at time zone 'Europe/Berlin' as starts_at,
    random() as r
  from public.courts c
  cross join generate_series(0, 6) d
), gefiltert as (
  select court_id, starts_at,
         (select id from public.members where id::text not like 'e2e00000-%'
           order by random() limit 1) as member_id
  from kandidaten
  where r < 0.45 and starts_at > now() + interval '2 hours'
)
insert into public.bookings (court_id, slot, kind, booking_type_id, member_id, created_by)
select court_id, tstzrange(starts_at, starts_at + interval '1 hour', '[)'),
       'booking', (select id from public.booking_types where code = 'einzel'),
       member_id, member_id
from gefiltert
-- Zufallstreffer auf denselben Slot einfach verwerfen; der EXCLUDE-Constraint
-- ist hier Teil des Seeds, nicht ein Fehlerfall.
on conflict on constraint bookings_no_overlap do nothing;

-- Mitspieler ergaenzen: die Mitspielerpflicht gilt auch fuer den Testbestand
insert into public.booking_players (booking_id, member_id)
select b.id,
       (select m.id from public.members m
         where m.id <> b.member_id and m.id::text not like 'e2e00000-%'
         order by random() limit 1)
from public.bookings b
where b.kind = 'booking'
  and not exists (select 1 from public.booking_players bp where bp.booking_id = b.id)
on conflict do nothing;

-- ===========================================================================
-- Merkmale: Einwilligungen und ein Beispiel aus der Praxis
--
-- Bewusst im Seed und nicht in der Migration: das sind Vereinsdaten, keine
-- Struktur. Ein anderer Verein braucht andere - und der Vorstand kann sie im
-- Admin-Dashboard jederzeit selbst anlegen.
-- ===========================================================================

insert into public.member_attribute_types
  (code, name, description, value_kind, multiple, self_editable, in_application, sort_order)
values
  ('foto', 'Fotos und Veröffentlichung',
   'Darf die Person auf Fotos der Website, in Aushängen und in der Presse erscheinen? '
   'Bei Minderjährigen erteilen die Erziehungsberechtigten die Einwilligung.',
   'boolean', false, true, true, 10),

  ('newsletter', 'Vereinsnachrichten per E-Mail',
   'Rundmails zu Veranstaltungen und Neuigkeiten. Pflichtinformationen zu Beitrag und '
   'Lastschrift gehen unabhängig davon heraus.',
   'boolean', false, true, true, 20),

  ('whatsapp', 'Messenger-Gruppen',
   'Aufnahme in die Gruppen des Vereins. Eigene Einwilligung, weil die Telefonnummer '
   'dabei an einen Dritten gelangt.',
   'boolean', false, true, true, 30),

  ('ehrung', 'Ehrungen',
   'Vom Verein verliehene Auszeichnungen, etwa für langjährige Mitgliedschaft.',
   'list', true, false, false, 40),

  -- Bewusst eine Liste und kein Ja/Nein: bei den Booleans hier bedeutet allein
  -- die Existenz der Zeile „eingewilligt“, und keines davon ist im Bestand bei
  -- irgendwem gesetzt. Ein Ja/Nein-Merkmal erreichte am ersten Tag also exakt
  -- niemanden. Mit einer Liste gilt: kein Wert = „Nur Wichtiges“ – und das ist
  -- auch sachlich richtig, denn es geht um Mitteilungen zur eigenen Buchung,
  -- nicht um Werbung.
  ('booking_mail', 'E-Mails zu Buchungen',
   'Ob Änderungen an deinen Platzbuchungen zusätzlich per E-Mail kommen. '
   'In der App siehst du sie in jedem Fall.',
   'list', false, true, false, 25)
on conflict (code) do nothing;

insert into public.member_attribute_options (attribute_type_id, value, label, sort_order)
select t.id, v.value, v.label, v.sort_order
from public.member_attribute_types t
cross join (values
  ('alle',     'Alle Benachrichtigungen', 1),
  ('wichtige', 'Nur Wichtiges',           2),
  ('keine',    'Keine E-Mails',           3)
) as v(value, label, sort_order)
where t.code = 'booking_mail'
on conflict (attribute_type_id, value) do nothing;

-- Die Migration 20260808100100 legt dasselbe Merkmal an, damit es produktiv
-- ueberhaupt existiert - dort aber in ASCII wie jede SQL-Datei des Projekts.
-- Hier steht der Text, den die Mitglieder lesen sollen.
update public.member_attribute_types
   set name = 'E-Mails zu Buchungen',
       description = 'Ob Änderungen an deinen Platzbuchungen zusätzlich per E-Mail kommen. '
                     'In der App siehst du sie in jedem Fall.'
 where code = 'booking_mail';

insert into public.member_attribute_options (attribute_type_id, value, label, sort_order)
select t.id, v.value, v.label, v.sort_order
from public.member_attribute_types t
cross join (values
  ('silberne_nadel', 'Silberne Ehrennadel', 1),
  ('goldene_nadel',  'Goldene Ehrennadel',  2),
  ('ehrenmitglied',  'Ehrenmitgliedschaft', 3)
) as v(value, label, sort_order)
where t.code = 'ehrung'
on conflict (attribute_type_id, value) do nothing;

-- ===========================================================================
-- Mannschaften: vier Teams, je sechs Spieler, einer davon Mannschaftsfuehrer
--
-- Wie die Merkmale Vereinsdaten, keine Struktur. Die Spieler sind zufaellig
-- gewaehlte aktive Erwachsene mit eigener Spielberechtigung; die grosse
-- Mehrheit der 400 bleibt ohne Mannschaft - so ist es auch im echten Verein.
-- ===========================================================================

insert into public.teams (name, sort_order) values
  ('Herren',    10),
  ('Herren 30', 20),
  ('Herren 50', 30),
  ('Damen',     40);

do $$
declare
  v_team   record;
  v_member uuid;
  v_i      integer;
begin
  for v_team in select id, name from public.teams order by sort_order loop
    for v_i in 1..6 loop
      select m.id into v_member
      from public.members m
      where m.status = 'active'
        and m.team_id is null
        and m.birthday is not null
        and m.birthday <= current_date - interval '18 years'
        and m.gender = case when v_team.name = 'Damen' then 'female'::public.gender
                            else 'male'::public.gender end
      order by random()
      limit 1;

      exit when v_member is null;

      update public.members
         set team_id = v_team.id, is_team_captain = (v_i = 1)
       where id = v_member;
    end loop;
  end loop;
end $$;

-- ===========================================================================
-- Anmeldbare Testkonten fuer die lokale Entwicklung
--
-- Drei Konten mit bekannter Adresse: Admin und Mitglied uebernehmen den Login
-- je eines Mitglieds aus dem Bestand, der Kiosk ist ein eigenes Geraetekonto.
--
-- Alle Testkonten haben feste UUIDs mit dem Praefix e2e00000- (T3), dieselben
-- stehen in apps/web/e2e/hilfen.ts:
--   ...0001 / ...0101  admin@     Mitglied / Login
--   ...0002 / ...0102  mitglied@
--            ...0103  kiosk@     nur Login (Geraetekonto)
--   ...0004 / ...0104  neu@       (Onboarding, unten)
--   ...0005 / ...0105  kind@
--   ...0006 / ...0106  Mia Mitspiel   feste Mitspieler, ohne Login-Nutzung
--   ...0007 / ...0107  Max Mitspiel
--   ...0008 / ...0108  Kira Kasse     mit Bankverbindung und Mandat
--
-- Die Adressen enden auf .local und sind damit weder erreichbar noch mit
-- echten Adressen zu verwechseln. Das Passwort steht bewusst im Klartext hier:
-- es gilt ausschliesslich fuer diese synthetische Datenbank.
-- ===========================================================================

do $$
declare
  v_passwort constant text := 'tcm-lokal-2026';
  -- E-Mail, Rolle, Mitglied, Login (beim Kiosk nur der Login)
  v_konten constant text[][] := array[
    array['admin@tcm.local',    'admin',  'e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-000000000101'],
    array['mitglied@tcm.local', 'member', 'e2e00000-0000-4000-8000-000000000002', 'e2e00000-0000-4000-8000-000000000102'],
    array['kiosk@tcm.local',    'kiosk',  '',                                     'e2e00000-0000-4000-8000-000000000103']
  ];
  v_zeile  text[];
  v_auth   uuid;
  v_member uuid;
begin
  foreach v_zeile slice 1 in array v_konten loop
    if v_zeile[2] = 'kiosk' then
      -- Das Tablet an der Theke ist kein Mitglied, sondern ein Geraetekonto.
      v_auth := v_zeile[4]::uuid;

      -- Leere Token-Spalten und eine Identitaet: siehe oben bei den Mitgliedern.
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token,
        email_change, email_change_token_new, email_change_token_current,
        phone_change, phone_change_token, reauthentication_token
      ) values (
        v_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        v_zeile[1], extensions.crypt(v_passwort, extensions.gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        '', '', '', '', '', '', '', ''
      );

      insert into auth.identities (
        id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
      ) values (
        extensions.gen_random_uuid(), v_auth, v_auth::text, 'email',
        jsonb_build_object('sub', v_auth::text, 'email', v_zeile[1], 'email_verified', true),
        now(), now(), now()
      );

      insert into public.kiosk_devices (auth_user_id, name, location)
      values (v_auth, 'Kiosk Clubheim', 'Theke');
    else
      -- Ein bestehendes Mitglied bekommt die bekannte Adresse, damit die
      -- Konten echte Historie haben: Getraenke, Forderungen. Sein Login zieht
      -- mit um. Welches, steht fest: die ersten beiden des Bestands.
      v_member := v_zeile[3]::uuid;
      v_auth := v_zeile[4]::uuid;

      update auth.users set email = v_zeile[1] where id = v_auth;
      update auth.identities
         set identity_data = identity_data || jsonb_build_object('email', v_zeile[1]),
             last_sign_in_at = now()
       where user_id = v_auth;
      update public.members set email = v_zeile[1] where id = v_member;

      insert into public.member_roles (member_id, role)
      values (v_member, 'member')
      on conflict do nothing;

      if v_zeile[2] = 'admin' then
        insert into public.member_roles (member_id, role)
        values (v_member, 'admin')
        on conflict do nothing;
      end if;

      -- Das Mitgliedskonto fuehrt "Herren 30": so zeigen Konto-Seite und
      -- Konto-Tab beim Durchklicken etwas, statt des leeren Normalfalls.
      if v_zeile[2] = 'member' then
        update public.members set is_team_captain = false
         where team_id = (select id from public.teams where name = 'Herren 30');
        update public.members
           set team_id = (select id from public.teams where name = 'Herren 30'),
               is_team_captain = true
         where id = v_member;
      end if;
    end if;
  end loop;
end $$;

-- ===========================================================================
-- Onboarding
--
-- Der ganze Bestand gilt als fertig eingerichtet (Default der Spalte,
-- hier nur ausdruecklich). Dazu zwei Konten mit offenem Onboarding:
--   neu@tcm.local   erwachsen, ohne Mandat
--   kind@tcm.local  minderjaehrig, ohne Erziehungsberechtigte und Mandat
-- Beide sehen so aus, wie create_member sie anlegt: Pflicht-Stammdaten da,
-- Mitgliedschaft und Rolle da, alles Weitere fehlt.
--
-- Die Glaeubiger-Id ist die Test-Id der Bundesbank. Ohne sie laesst sich
-- kein Mandat online erteilen.
-- ===========================================================================

update public.members set onboarding_completed_at = now() where onboarding_completed_at is null;

update public.settings set value = '"DE98ZZZ09999999999"'::jsonb
 where key = 'sepa.creditor_id' and value = '""'::jsonb;

do $$
declare
  v_passwort constant text := 'tcm-lokal-2026';
  v_konten constant text[][] := array[
    -- E-Mail, Vorname, Nachname, Geschlecht, Alter in Jahren, Mitglied, Login
    array['neu@tcm.local',  'Nora', 'Neumitglied', 'female', '34',
          'e2e00000-0000-4000-8000-000000000004', 'e2e00000-0000-4000-8000-000000000104'],
    array['kind@tcm.local', 'Kian', 'Neumitglied', 'male',   '12',
          'e2e00000-0000-4000-8000-000000000005', 'e2e00000-0000-4000-8000-000000000105']
  ];
  v_zeile  text[];
  v_auth   uuid;
  v_member uuid;
begin
  foreach v_zeile slice 1 in array v_konten loop
    v_auth := v_zeile[7]::uuid;

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) values (
      v_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_zeile[1], extensions.crypt(v_passwort, extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      extensions.gen_random_uuid(), v_auth, v_auth::text, 'email',
      jsonb_build_object('sub', v_auth::text, 'email', v_zeile[1], 'email_verified', true),
      null, now(), now()
    );

    insert into public.members (
      id, auth_user_id, invited_at, onboarding_completed_at, first_name, last_name,
      gender, salutation, birthday, email, mobile, street, postcode, city, country_code
    ) values (
      v_zeile[6]::uuid, v_auth, now(), null, v_zeile[2], v_zeile[3],
      v_zeile[4]::public.gender, v_zeile[4]::public.salutation,
      (current_date - make_interval(years => v_zeile[5]::int) - interval '40 days')::date,
      v_zeile[1], '0170 1234567', 'Hauptstr. 1', '70372', 'Stuttgart', 'DE'
    )
    returning id into v_member;

    insert into public.memberships (member_id, number, started_on, status)
    values (v_member, private.next_membership_number(), current_date, 'active');

    insert into public.member_roles (member_id, role) values (v_member, 'member');

    insert into public.member_fees (member_id, fee_type_id, year)
    select v_member, t.id, extract(year from current_date)::integer
    from public.fee_types t
    where t.code = case when v_zeile[5]::int < 18 then 'jugend' else 'erwachsener' end;
  end loop;
end $$;

-- ===========================================================================
-- Feste Mitglieder fuer die E2E-Tests (T3)
--
-- Die Tests suchten Mitspieler mit "a" und nahmen den ersten Treffer, und die
-- Kasse rechnete mit einer "Nadine Bauer", die es nur dank setseed gibt. Jetzt
-- gibt es drei Mitglieder mit festem Namen und fester UUID, die sonst nirgends
-- auftauchen: keine Zufallsbuchungen, keine Mannschaft.
--   Mia Mitspiel, Max Mitspiel  Mitspieler in den Buchungstests
--   Kira Kasse                  Forderungen und Einzug, mit aktivem Mandat
-- Dazu bekommt mitglied@ eine Getraenkebuchung: Historie, die das Loeschen
-- sperrt, haengt damit nicht mehr am Zufall.
-- ===========================================================================

do $$
declare
  v_passwort constant text := 'tcm-lokal-2026';
  v_konten constant text[][] := array[
    -- Vorname, Nachname, Geschlecht, Mitglied, Login
    array['Mia',  'Mitspiel', 'female', 'e2e00000-0000-4000-8000-000000000006', 'e2e00000-0000-4000-8000-000000000106'],
    array['Max',  'Mitspiel', 'male',   'e2e00000-0000-4000-8000-000000000007', 'e2e00000-0000-4000-8000-000000000107'],
    array['Kira', 'Kasse',    'female', 'e2e00000-0000-4000-8000-000000000008', 'e2e00000-0000-4000-8000-000000000108']
  ];
  v_iban constant text := 'DE02120300000000202051';
  v_zeile  text[];
  v_email  text;
  v_konto  uuid;
begin
  foreach v_zeile slice 1 in array v_konten loop
    -- @example.org: an diese Adressen geht nie eine Mail (ist_testadresse).
    v_email := lower(v_zeile[1] || '.' || v_zeile[2]) || '@example.org';

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) values (
      v_zeile[5]::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, extensions.crypt(v_passwort, extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('member_id', v_zeile[4]),
      '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      extensions.gen_random_uuid(), v_zeile[5]::uuid, v_zeile[5], 'email',
      jsonb_build_object('sub', v_zeile[5], 'email', v_email, 'email_verified', true),
      null, now(), now()
    );

    insert into public.members (
      id, auth_user_id, invited_at, onboarding_completed_at, first_name, last_name,
      gender, salutation, birthday, email, mobile, street, postcode, city, country_code
    ) values (
      v_zeile[4]::uuid, v_zeile[5]::uuid, now(), now(), v_zeile[1], v_zeile[2],
      v_zeile[3]::public.gender, v_zeile[3]::public.salutation,
      (current_date - interval '35 years')::date,
      v_email, '0170 7654321', 'Am Sportplatz 1', '70372', 'Stuttgart', 'DE'
    );

    insert into public.memberships (member_id, number, started_on, status)
    values (v_zeile[4]::uuid, private.next_membership_number(), current_date - 400, 'active');

    insert into public.member_roles (member_id, role) values (v_zeile[4]::uuid, 'member');

    insert into public.member_fees (member_id, fee_type_id, year)
    select v_zeile[4]::uuid, t.id, extract(year from current_date)::integer
    from public.fee_types t where t.code = 'erwachsener';
  end loop;

  -- Kira Kasse zahlt per Lastschrift: eigene Bankverbindung, aktives Mandat.
  insert into public.bank_accounts
    (member_id, iban_encrypted, iban_fingerprint, iban_last4, holder, bank_name)
  values (
    'e2e00000-0000-4000-8000-000000000008',
    private.encrypt_iban(v_iban), private.fingerprint_iban(v_iban), right(v_iban, 4),
    'Kira Kasse', 'Testbank'
  )
  returning id into v_konto;

  insert into public.sepa_mandates
    (member_id, bank_account_id, reference, signed_on, last_used_on, sequence_type)
  values (
    'e2e00000-0000-4000-8000-000000000008', v_konto, 'TCM-E2E-KASSE',
    current_date - 400, current_date - 200, 'RCUR'
  );

  -- Historie fuer mitglied@: eine Getraenkebuchung von gestern.
  insert into public.drink_purchases
    (member_id, drink_item_id, quantity, unit_price_cents, source, recorded_by, created_at)
  select 'e2e00000-0000-4000-8000-000000000002', dp.drink_item_id, 1, dp.price_cents, 'app',
         'e2e00000-0000-4000-8000-000000000002', now() - interval '1 day'
  from public.drink_prices dp
  order by dp.valid_from, dp.drink_item_id
  limit 1;
end $$;
