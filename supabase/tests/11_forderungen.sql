-- ===========================================================================
-- Forderungen entstehen
--
-- Der wichtigste Test steht ganz oben: ein zweiter Beitragslauf darf keine
-- doppelte Forderung erzeugen. Wer im Januar zweimal auf den Knopf drueckt,
-- wuerde sonst jedem Mitglied den Beitrag zweimal abbuchen - der teuerste
-- denkbare Fehler in dieser App.
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
-- ===========================================================================

/** Eine Beitragsart mit Preis, ueber die RPCs angelegt. */
create or replace function tests.fixture_beitragsart(
  p_name text, p_jahr integer, p_cents integer
)
returns uuid language plpgsql as $f$
declare adm record; v_id uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  perform tests.act_as(adm.auth_id);
  select public.upsert_fee_type(null, 'zztest-' || substr(gen_random_uuid()::text, 1, 8),
                                p_name) into v_id;
  perform public.set_fee_price(v_id, p_jahr, p_cents);
  perform set_config('role', 'postgres', true);
  return v_id;
end; $f$;

/** Ein Mitglied mit zugewiesener Beitragsart. */
create or replace function tests.fixture_beitragszahler(p_art uuid, p_jahr integer)
returns table (member_id uuid, auth_id uuid) language plpgsql as $f$
declare u record; adm record;
begin
  select * into u from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;
  perform tests.act_as(adm.auth_id);
  perform public.set_member_fee(u.member_id, p_art, p_jahr);
  perform set_config('role', 'postgres', true);
  return query select u.member_id, u.auth_id;
end; $f$;

-- ---------------------------------------------------------------------------
-- Der Beitragslauf
-- ---------------------------------------------------------------------------

/**
 * Der Kern: zweimal starten erzeugt nicht zweimal.
 *
 * Getragen wird das vom Teilindex charges_one_per_member_kind_period, nicht
 * von einer Pruefung im Code - ein zweiter Aufruf im selben Moment kann
 * deshalb auch nicht durchschluepfen.
 */
create or replace function tests.test_zweiter_beitragslauf_erzeugt_nichts()
returns setof text language plpgsql as $f$
declare adm record; v_art uuid; u record;
        v1 record; v2 record; v_anzahl integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_art := tests.fixture_beitragsart('ZZTest Erwachsene', 2031, 12000);
  select * into u from tests.fixture_beitragszahler(v_art, 2031) limit 1;

  perform tests.act_as(adm.auth_id);
  select * into v1 from public.fee_run_execute(2031);
  select * into v2 from public.fee_run_execute(2031);
  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_anzahl
  from public.charges where member_id = u.member_id and kind = 'fee' and period_label = '2031';

  return next ok(v1.erzeugt >= 1, 'Der erste Lauf erzeugt Forderungen');
  return next is(v2.erzeugt, 0, 'Der zweite Lauf erzeugt keine einzige mehr');
  return next is(v_anzahl, 1, 'Das Mitglied hat genau eine Beitragsforderung');
  return next is(
    (select amount_cents from public.charges
      where member_id = u.member_id and kind = 'fee' and period_label = '2031'),
    12000, 'mit dem Betrag der Beitragsart');
end; $f$;

/**
 * Der Zahler ist der Elternteil, nicht das Kind.
 *
 * Die Forderung gehoert fachlich zum Kind (member_id), abgebucht wird aber
 * beim Zahler. Steht das falsch herum, zieht der Verein von einem Konto ein,
 * fuer das kein Mandat vorliegt.
 */
create or replace function tests.test_beitragslauf_setzt_den_zahler()
returns setof text language plpgsql as $f$
-- "kind" waere als Variablenname mehrdeutig: charges hat eine Spalte kind.
declare adm record; eltern record; sohn record; v_art uuid; v_payer uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into eltern from tests.fixture_user() limit 1;
  v_art := tests.fixture_beitragsart('ZZTest Jugend', 2032, 6000);
  select * into sohn from tests.fixture_beitragszahler(v_art, 2032) limit 1;

  update public.members set billing_payer_id = eltern.member_id where id = sohn.member_id;

  perform tests.act_as(adm.auth_id);
  perform public.fee_run_execute(2032);
  perform set_config('role', 'postgres', true);

  select c.payer_id into v_payer from public.charges c
   where c.member_id = sohn.member_id and c.kind = 'fee' and c.period_label = '2032';

  return next is(v_payer, eltern.member_id, 'Der Zahler ist der Elternteil');
  return next is(
    (select c.member_id from public.charges c
      where c.member_id = sohn.member_id and c.kind = 'fee' and c.period_label = '2032'),
    sohn.member_id, 'Die Forderung gehoert weiterhin dem Kind');
end; $f$;

/**
 * Ein fehlender Preis bricht den ganzen Lauf ab.
 *
 * Ein Teilergebnis waere hier gefaehrlicher als ein Fehler: wer nicht in der
 * Datei steht, faellt niemandem auf, und das Mitglied waere stillschweigend
 * beitragsfrei gestellt.
 */
create or replace function tests.test_fehlender_preis_bricht_den_lauf_ab()
returns setof text language plpgsql as $f$
declare adm record; v_art uuid; v_ohne uuid; u record; v record; v_anzahl integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_art := tests.fixture_beitragsart('ZZTest Aktiv', 2033, 10000);
  select * into u from tests.fixture_beitragszahler(v_art, 2033) limit 1;

  -- Eine zweite Art ohne Preis, demselben Mitglied zugewiesen
  perform tests.act_as(adm.auth_id);
  select public.upsert_fee_type(null, 'zztest-ohnepreis', 'ZZTest Ohne Preis') into v_ohne;
  perform public.set_member_fee(u.member_id, v_ohne, 2033);

  return next throws_ok(
    format('select public.fee_run_execute(%L)', 2033),
    '22023',
    null,
    'Der Lauf bricht ab, wenn zu einer Beitragsart der Preis fehlt');
  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_anzahl
  from public.charges where period_label = '2033' and kind = 'fee';
  return next is(v_anzahl, 0, 'und hinterlaesst keine einzige halbe Forderung');
end; $f$;

/** Ein Sonderbetrag ersetzt den Preis der Beitragsart. */
create or replace function tests.test_sonderbetrag_gilt_im_beitragslauf()
returns setof text language plpgsql as $f$
declare adm record; v_art uuid; u record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_art := tests.fixture_beitragsart('ZZTest Ehren', 2034, 12000);
  select * into u from tests.fixture_user() limit 1;

  perform tests.act_as(adm.auth_id);
  perform public.set_member_fee(u.member_id, v_art, 2034, 1);
  perform public.fee_run_execute(2034);
  perform set_config('role', 'postgres', true);

  return next is(
    (select amount_cents from public.charges
      where member_id = u.member_id and period_label = '2034' and kind = 'fee'),
    1, 'Der Sonderbetrag ersetzt den Preis der Beitragsart');
end; $f$;

/** Nur Administratoren starten den Lauf. */
create or replace function tests.test_beitragslauf_nur_admin()
returns setof text language plpgsql as $f$
declare u record;
begin
  select * into u from tests.fixture_user() limit 1;
  perform tests.act_as(u.auth_id);
  return next throws_ok(
    'select public.fee_run_execute(2035)', '42501', null,
    'Ein normales Mitglied startet keinen Beitragslauf');
  perform set_config('role', 'postgres', true);
end; $f$;

/** Eine erlassene Forderung gibt den Idempotenz-Index frei. */
create or replace function tests.test_erlassene_forderung_kann_neu_entstehen()
returns setof text language plpgsql as $f$
declare adm record; v_art uuid; u record; v_id uuid; v record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_art := tests.fixture_beitragsart('ZZTest Neu', 2036, 9000);
  select * into u from tests.fixture_beitragszahler(v_art, 2036) limit 1;

  perform tests.act_as(adm.auth_id);
  perform public.fee_run_execute(2036);
  select id into v_id from public.charges
   where member_id = u.member_id and period_label = '2036' and kind = 'fee';
  perform public.waive_charge(v_id, 'Falscher Preis');
  select * into v from public.fee_run_execute(2036);
  perform set_config('role', 'postgres', true);

  return next ok(v.erzeugt >= 1, 'Nach dem Erlass entsteht die Forderung neu');
  return next is(
    (select count(*)::integer from public.charges
      where member_id = u.member_id and period_label = '2036' and kind = 'fee'),
    2, 'Die erlassene bleibt als Beleg stehen');
end; $f$;

-- ---------------------------------------------------------------------------
-- Beitragsarten und Preise
-- ---------------------------------------------------------------------------

/**
 * Ein Preis laesst sich nicht mehr aendern, wenn das Jahr schon berechnet ist.
 *
 * Anders als bei den Getraenken gibt es hier keine eingefrorene Kopie an der
 * Buchung - Historie und gestellte Betraege wuerden auseinanderlaufen.
 */
create or replace function tests.test_preis_nach_berechnung_gesperrt()
returns setof text language plpgsql as $f$
declare adm record; v_art uuid; u record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_art := tests.fixture_beitragsart('ZZTest Gesperrt', 2037, 8000);
  select * into u from tests.fixture_beitragszahler(v_art, 2037) limit 1;

  perform tests.act_as(adm.auth_id);
  perform public.fee_run_execute(2037);

  return next throws_ok(
    format('select public.set_fee_price(%L, %L, 9999)', v_art, 2037),
    '22023', null,
    'Ein bereits berechnetes Jahr laesst keine Preisaenderung mehr zu');

  -- Das Folgejahr dagegen schon: eine beschlossene Erhoehung muss eintragbar sein
  perform public.set_fee_price(v_art, 2038, 9000);
  perform set_config('role', 'postgres', true);

  return next is(
    (select amount_cents from public.fee_prices
      where fee_type_id = v_art and valid_from_year = 2038),
    9000, 'Der Preis fuers Folgejahr laesst sich eintragen');
end; $f$;

/** Die Uebersicht nennt den Preis des Folgejahrs. */
create or replace function tests.test_fee_type_overview_zeigt_folgejahr()
returns setof text language plpgsql as $f$
declare adm record; v_art uuid; v record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_art := tests.fixture_beitragsart('ZZTest Vorschau', 2040, 10000);

  perform tests.act_as(adm.auth_id);
  perform public.set_fee_price(v_art, 2041, 11000);
  select * into v from public.fee_type_overview(2040) o where o.id = v_art;
  perform set_config('role', 'postgres', true);

  return next is(v.preis_cents, 10000, 'Die Uebersicht zeigt den geltenden Preis');
  return next is(v.naechster_preis_cents, 11000, 'und den beschlossenen fuers Folgejahr');
  return next is(v.naechster_preis_ab_jahr, 2041, 'mit dem Jahr, ab dem er gilt');
end; $f$;

/** Ein doppelter Code wird abgewiesen. */
create or replace function tests.test_beitragsart_code_nur_einmal()
returns setof text language plpgsql as $f$
declare adm record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  perform tests.act_as(adm.auth_id);
  perform public.upsert_fee_type(null, 'zztest-doppelt', 'ZZTest Erste');

  return next throws_ok(
    'select public.upsert_fee_type(null, ''zztest-doppelt'', ''ZZTest Zweite'')',
    '23505', null,
    'Denselben Code gibt es nur einmal');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Der Getraenkemonat
-- ---------------------------------------------------------------------------

/** Ein Getraenk mit Preis und eine Entnahme in einem vergangenen Monat. */
create or replace function tests.fixture_alte_entnahme(
  p_jahr integer, p_monat integer, p_cents integer default 250
)
returns table (member_id uuid, period_id uuid, purchase_id uuid)
language plpgsql as $f$
declare adm record; u record; v_item uuid; v_period uuid; v_kauf uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;

  perform tests.act_as(adm.auth_id);
  select public.upsert_drink_item(
    null, 'ZZTest Saft ' || substr(gen_random_uuid()::text, 1, 8), null, 'drink', p_cents
  ) into v_item;
  perform set_config('role', 'postgres', true);

  insert into public.billing_periods (year, month) values (p_jahr, p_monat)
  on conflict (year, month) do nothing;
  select id into v_period from public.billing_periods where year = p_jahr and month = p_monat;

  -- total_cents ist eine generierte Spalte, sie darf nicht mitgegeben werden.
  insert into public.drink_purchases
    (member_id, drink_item_id, billing_period_id, quantity, unit_price_cents)
  values (u.member_id, v_item, v_period, 1, p_cents)
  returning id into v_kauf;

  return query select u.member_id, v_period, v_kauf;
end; $f$;

/**
 * Nach dem Schliessen ist der Monat unveraenderlich.
 *
 * Genau darum geht es: der Betrag muss feststehen, bevor er angekuendigt wird.
 * Ein Storno danach wuerde die Abrechnung nachtraeglich verschieben.
 */
create or replace function tests.test_geschlossener_monat_nimmt_kein_storno()
returns setof text language plpgsql as $f$
declare adm record; f record; v record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_alte_entnahme(2020, 3) limit 1;

  perform tests.act_as(adm.auth_id);
  select * into v from public.close_billing_period(2020, 3);
  perform set_config('role', 'postgres', true);

  return next is(v.buchungen, 1, 'Der Abschluss zaehlt die Entnahmen');
  return next is(v.summe_cents, 250, 'und ihre Summe');
  return next is(
    (select status::text from public.billing_periods where id = f.period_id),
    'closed', 'Der Monat steht auf geschlossen');
  return next throws_ok(
    format('update public.drink_purchases set voided_at = now() where id = %L', f.purchase_id),
    null, null,
    'Eine Entnahme aus einem geschlossenen Monat laesst sich nicht mehr stornieren');
end; $f$;

/** Der laufende Monat laesst sich nicht schliessen. */
create or replace function tests.test_laufender_monat_bleibt_offen()
returns setof text language plpgsql as $f$
declare adm record; v_jahr integer; v_monat integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_jahr  := extract(year  from (now() at time zone 'Europe/Berlin'))::integer;
  v_monat := extract(month from (now() at time zone 'Europe/Berlin'))::integer;

  insert into public.billing_periods (year, month) values (v_jahr, v_monat)
  on conflict (year, month) do nothing;

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select public.close_billing_period(%L, %L)', v_jahr, v_monat),
    '22023', null,
    'Der laufende Monat laesst sich nicht schliessen - an der Theke wird noch gebucht');
  perform set_config('role', 'postgres', true);
end; $f$;

/** Ein offener Monat laesst sich nicht abrechnen. */
create or replace function tests.test_offener_monat_wird_nicht_abgerechnet()
returns setof text language plpgsql as $f$
declare adm record; f record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_alte_entnahme(2020, 5) limit 1;

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    'select public.charge_billing_period(2020, 5)', '22023', null,
    'Erst schliessen, dann abrechnen - solange er offen ist, kann sich die Summe aendern');
  perform set_config('role', 'postgres', true);
end; $f$;

/**
 * Aus dem geschlossenen Monat wird eine Forderung, auch unter dem
 * Mindestbetrag.
 *
 * Die Schwelle aus drinks.min_debit_cents wirkt erst beim Einzug und dort je
 * Zahler. Wuerde sie schon hier greifen, verschwaende eine Familie mit drei
 * Kindern zu je 3 Euro dauerhaft aus der Abrechnung.
 */
create or replace function tests.test_getraenkeforderung_auch_unter_mindestbetrag()
returns setof text language plpgsql as $f$
declare adm record; f record; v record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_alte_entnahme(2020, 7, 150) limit 1;

  perform tests.act_as(adm.auth_id);
  perform public.close_billing_period(2020, 7);
  select * into v from public.charge_billing_period(2020, 7);
  perform set_config('role', 'postgres', true);

  return next is(v.erzeugt, 1, 'Auch 1,50 Euro werden zur Forderung');
  return next is(v.summe_cents, 150, 'mit dem tatsaechlichen Betrag');
  return next is(
    (select status::text from public.billing_periods where id = f.period_id),
    'charged', 'Der Monat gilt als abgerechnet');
end; $f$;

/** Ein zweiter Abrechnungslauf erzeugt nichts. */
create or replace function tests.test_zweite_getraenkeabrechnung_erzeugt_nichts()
returns setof text language plpgsql as $f$
declare adm record; f record; v record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_alte_entnahme(2020, 9) limit 1;

  perform tests.act_as(adm.auth_id);
  perform public.close_billing_period(2020, 9);
  perform public.charge_billing_period(2020, 9);
  select * into v from public.charge_billing_period(2020, 9);
  perform set_config('role', 'postgres', true);

  return next is(v.erzeugt, 0, 'Der zweite Abrechnungslauf erzeugt keine Forderung mehr');
  return next is(
    (select count(*)::integer from public.charges
      where member_id = f.member_id and kind = 'drinks' and period_label = '2020-09'),
    1, 'Es bleibt bei einer Forderung fuer den Monat');
end; $f$;

/** Eine stornierte Entnahme faellt aus der Abrechnung. */
create or replace function tests.test_stornierte_entnahme_wird_nicht_berechnet()
returns setof text language plpgsql as $f$
declare adm record; f record; v record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_alte_entnahme(2020, 11) limit 1;

  -- voided_by gehoert dazu: drink_purchases_void_consistent verlangt beides.
  update public.drink_purchases
     set voided_at = now(), voided_by = adm.member_id
   where id = f.purchase_id;

  perform tests.act_as(adm.auth_id);
  perform public.close_billing_period(2020, 11);
  select * into v from public.charge_billing_period(2020, 11);
  perform set_config('role', 'postgres', true);

  return next is(v.erzeugt, 0, 'Wer nur Stornos hat, bekommt keine Forderung');
end; $f$;

-- ---------------------------------------------------------------------------
-- Forderungen einzeln
-- ---------------------------------------------------------------------------

/** Eine eingereichte Forderung laesst sich nicht mehr erlassen. */
create or replace function tests.test_eingereichte_forderung_nicht_erlassbar()
returns setof text language plpgsql as $f$
declare adm record; u record; v_id uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;

  perform tests.act_as(adm.auth_id);
  select public.create_manual_charge(u.member_id, 'misc', 500, 'ZZTest Schluessel') into v_id;
  perform set_config('role', 'postgres', true);

  update public.charges set status = 'submitted' where id = v_id;

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select public.waive_charge(%L, ''Versehen'')', v_id),
    '22023', null,
    'Was in einem eingereichten Lauf steckt, laesst sich nicht erlassen');
  perform set_config('role', 'postgres', true);
end; $f$;

/** Eine Forderung von Hand: der Zahler wird mitgezogen. */
create or replace function tests.test_manuelle_forderung_nimmt_den_zahler()
returns setof text language plpgsql as $f$
declare adm record; eltern record; sohn record; v_id uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into eltern from tests.fixture_user() limit 1;
  select * into sohn from tests.fixture_user() limit 1;
  update public.members set billing_payer_id = eltern.member_id where id = sohn.member_id;

  perform tests.act_as(adm.auth_id);
  select public.create_manual_charge(sohn.member_id, 'misc', 1500, 'ZZTest Trikot') into v_id;
  perform set_config('role', 'postgres', true);

  return next is(
    (select payer_id from public.charges where id = v_id), eltern.member_id,
    'Auch eine Forderung von Hand geht an den Zahler');
end; $f$;

/** Ohne Beschreibung keine Forderung. */
create or replace function tests.test_manuelle_forderung_braucht_beschreibung()
returns setof text language plpgsql as $f$
declare adm record; u record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select public.create_manual_charge(%L, ''misc'', 500, '' '')', u.member_id),
    '22023', null,
    'Ohne Beschreibung weiss spaeter niemand mehr, wofuer die Forderung war');
  perform set_config('role', 'postgres', true);
end; $f$;

/** Das Mitglied sieht seine Forderung. */
create or replace function tests.test_mitglied_sieht_eigene_forderung()
returns setof text language plpgsql as $f$
declare adm record; u record; v_anzahl integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;

  perform tests.act_as(adm.auth_id);
  perform public.create_manual_charge(u.member_id, 'misc', 700, 'ZZTest Ball');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(u.auth_id);
  select count(*)::integer into v_anzahl from public.my_charges();
  perform set_config('role', 'postgres', true);

  return next is(v_anzahl, 1, 'Die Forderung taucht im eigenen Konto auf');
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer die Forderungen sind eingespielt');
select * from extensions.finish();
