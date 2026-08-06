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
-- Beitragsarten, fehlende Bankverbindung, Minderjaehrige ohne Login - schon
-- hier auftreten und nicht erst beim Cutover.
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
  ('jugend',             'Kinder und Jugendliche',   'Bis einschliesslich 17 Jahre',      3),
  ('student',            'Student',                  'Mit gueltiger Bescheinigung',       4),
  ('paare',              'Erwachsener Paare',        'Ermaessigung fuer Paare',           5),
  ('beitragsbefreit',    'Beitragsbefreit',          'Ehrenmitglieder und Sonderfaelle',  6),
  ('trainer',            'Trainer',                  'Beitragsbefreit als Trainer',       7),
  ('schnuppern',         'Erwachsener-Schnuppern',   'Schnuppermitgliedschaft',           8),
  ('schluesselpfand',    'Schluesselpfand',          'Einmalig, zusaetzlich zum Beitrag', 9);

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
  ('Iso-Getraenk',      '0,5 l',        'drink', 5),
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
    when 'Iso-Getraenk'       then 200
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
-- minderjaehrig. Minderjaehrige unter 14 bekommen bewusst keine E-Mail und
-- damit keinen Login - genau die Konstellation, die es im echten Bestand gibt.
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
    random() as r_phone
  from generate_series(1, 400) i
)
insert into public.members
  (first_name, last_name, gender, salutation, birthday, email, mobile,
   street, postcode, city, country_code, status)
select
  first_name,
  last_name,
  case when r_gender < 0.48 then 'female'::public.gender
       when r_gender < 0.98 then 'male'::public.gender
       else 'diverse'::public.gender end,
  case when r_gender < 0.48 then 'female'::public.salutation
       when r_gender < 0.98 then 'male'::public.salutation
       else 'none'::public.salutation end,
  (current_date - make_interval(years => age) - make_interval(days => floor(random() * 365)::int))::date,
  -- Kinder unter 14 bekommen keinen eigenen Zugang
  case when age < 14 then null
       else lower(first_name) || '.' || lower(last_name) || i::text || '@example.org'
  end,
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

-- last_used_on wird aus signed_on abgeleitet, nicht unabhaengig gewuerfelt:
-- ein Mandat kann nicht benutzt worden sein, bevor es unterschrieben wurde.
-- Der Check sepa_mandates_used_after_signed erzwingt das ohnehin.
with basis as (
  select
    ba.member_id,
    ba.id as bank_account_id,
    row_number() over (order by ba.created_at, ba.id) as rn,
    (current_date - make_interval(days => (60 + floor(random() * 1200))::int))::date as signed_on,
    random() as r_used,
    random() as r_scope
  from public.bank_accounts ba
)
insert into public.sepa_mandates
  (member_id, bank_account_id, reference, signed_on, last_used_on, sequence_type, scope)
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
  'RCUR',
  case when r_scope < 0.5 then 'all_payments'::public.mandate_scope
       else 'fees_only'::public.mandate_scope end
from basis;

-- ---------------------------------------------------------------------------
-- Zahler-Beziehungen
--
-- Minderjaehrige ohne eigene E-Mail bekommen einen erwachsenen Zahler. Das
-- bildet die 36 paidByInfo-Faelle aus eBuSy ab und ist die Voraussetzung
-- dafuer, dass Eltern die Abrechnung ihrer Kinder sehen.
-- ---------------------------------------------------------------------------
with kinder as (
  select id, row_number() over (order by id) as rn
  from public.members
  where email is null
), zahler as (
  select id, row_number() over (order by id) as rn
  from public.members
  where email is not null
    and extract(year from age(birthday)) between 30 and 60
)
update public.members m
   set billing_payer_id = z.id
  from kinder k
  join zahler z on z.rn = ((k.rn - 1) % (select count(*) from zahler)) + 1
 where m.id = k.id;

-- ---------------------------------------------------------------------------
-- Rollen
-- ---------------------------------------------------------------------------
insert into public.member_roles (member_id, role)
select id, 'member'::public.app_role from public.members;

-- Es gibt nur noch zwei Stufen. Admin wird der Vorstand samt Kassenwart und
-- Sportwart - sieben Personen; alle uebrigen bleiben Mitglied.
with nummeriert as (
  select id, row_number() over (order by created_at, id) as rn from public.members
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
  (array['Platzpflege Fruehjahr','Thekendienst','Anlagenpflege','Turnierhelfer'])
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

-- ---------------------------------------------------------------------------
-- Platzbuchungen der naechsten Tage
--
-- Bewusst nur im erlaubten Vorlauffenster und ohne Kontingentverletzung, damit
-- der Bestand konsistent zu den Regeln ist.
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
         (select id from public.members order by random() limit 1) as member_id
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
       (select m.id from public.members m where m.id <> b.member_id order by random() limit 1)
from public.bookings b
where b.kind = 'booking'
  and not exists (select 1 from public.booking_players bp where bp.booking_id = b.id)
on conflict do nothing;

-- Eine Trainingsserie, wie sie der Sportwart anlegen wuerde
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
   'list', true, false, false, 40)
on conflict (code) do nothing;

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
-- Anmeldbare Testkonten fuer die lokale Entwicklung
--
-- Der Seed legte bisher nur Mitglieder an, aber keine Logins - lokal konnte
-- sich also niemand anmelden, und die E2E-Tests liefen zwangslaeufig gegen die
-- Cloud. Diese drei Konten schliessen die Luecke.
--
-- Die Adressen enden auf .local und sind damit weder erreichbar noch mit
-- echten Adressen zu verwechseln. Das Passwort steht bewusst im Klartext hier:
-- es gilt ausschliesslich fuer diese synthetische Datenbank.
-- ===========================================================================

do $$
declare
  v_passwort constant text := 'tcm-lokal-2026';
  v_konten constant text[][] := array[
    array['admin@tcm.local',    'admin'],
    array['mitglied@tcm.local', 'member'],
    array['kiosk@tcm.local',    'kiosk']
  ];
  v_zeile  text[];
  v_auth   uuid;
  v_member uuid;
begin
  foreach v_zeile slice 1 in array v_konten loop
    v_auth := extensions.gen_random_uuid();

    -- Die Token-Spalten muessen leere Zeichenketten enthalten, nicht null:
    -- GoTrue liest sie in Go-Strings ein und quittiert null mit
    -- "converting NULL to string is unsupported" - einem Fehler 500 beim
    -- Anmelden, der nichts ueber seine Ursache verraet.
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

    -- Ohne Identitaet lehnt GoTrue die Anmeldung mit Passwort ab.
    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      extensions.gen_random_uuid(), v_auth, v_auth::text, 'email',
      jsonb_build_object('sub', v_auth::text, 'email', v_zeile[1], 'email_verified', true),
      now(), now(), now()
    );

    if v_zeile[2] = 'kiosk' then
      -- Das Tablet an der Theke ist kein Mitglied, sondern ein Geraetekonto.
      insert into public.kiosk_devices (auth_user_id, name, location)
      values (v_auth, 'Kiosk Clubheim', 'Theke');
    else
      -- An ein bestehendes Mitglied haengen, damit die Konten echte Historie
      -- haben: Buchungen, Getraenke, Forderungen.
      select m.id into v_member
      from public.members m
      where m.auth_user_id is null and m.status = 'active'
        and m.birthday is not null and m.birthday <= current_date - interval '18 years'
      order by m.last_name
      limit 1;

      update public.members
         set auth_user_id = v_auth, email = v_zeile[1]
       where id = v_member;

      insert into public.member_roles (member_id, role)
      values (v_member, 'member')
      on conflict do nothing;

      if v_zeile[2] = 'admin' then
        insert into public.member_roles (member_id, role)
        values (v_member, 'admin')
        on conflict do nothing;
      end if;
    end if;
  end loop;
end $$;
