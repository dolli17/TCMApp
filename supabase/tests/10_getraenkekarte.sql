-- ===========================================================================
-- Die Getraenkekarte pflegen
--
-- Der wichtigste Test steht ganz oben: eine Preisaenderung darf eine bereits
-- gebuchte Entnahme nicht anfassen. Alles andere haengt daran - wenn das nicht
-- gilt, aendert eine Preispflege rueckwirkend abgeschlossene Monate.
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
-- ===========================================================================

/** Ein Getraenk mit Preis, ueber die RPC angelegt. */
create or replace function tests.fixture_getraenk(p_name text, p_preis integer default 200)
returns uuid language plpgsql as $f$
declare adm record; v_id uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  perform tests.act_as(adm.auth_id);
  select public.upsert_drink_item(null, p_name, null, 'drink', p_preis) into v_id;
  perform set_config('role', 'postgres', true);
  return v_id;
end; $f$;

-- ---------------------------------------------------------------------------
-- Preise
-- ---------------------------------------------------------------------------

/**
 * Der Kern: die Buchung behaelt ihren Preis, die Karte zeigt den neuen.
 *
 * drink_purchases.unit_price_cents wird beim Buchen kopiert und nie wieder
 * nachgeschlagen - dieser Test haelt genau das fest.
 */
create or replace function tests.test_preisaenderung_laesst_altbuchung_unberuehrt()
returns setof text language plpgsql as $f$
declare a record; adm record; v_id uuid; v_kauf uuid; v_betroffen integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;
  v_id := tests.fixture_getraenk('ZZTest Bier', 200);

  perform tests.act_as(a.auth_id);
  select public.record_drink_purchase(v_id, 2) into v_kauf;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  select public.set_drink_price(v_id, 300) into v_betroffen;
  perform set_config('role', 'postgres', true);

  return next is(
    (select unit_price_cents from public.drink_purchases where id = v_kauf), 200,
    'Die gebuchte Entnahme behaelt ihren Preis');
  return next is(
    (select total_cents from public.drink_purchases where id = v_kauf), 400,
    'und damit auch ihre Summe');
  return next is(private.current_drink_price(v_id), 300,
    'Die Karte zeigt ab jetzt den neuen Preis');
  return next is(v_betroffen, 1,
    'Die Funktion nennt die Zahl der Buchungen, die den alten Preis behalten');
end; $f$;

create or replace function tests.test_preis_nicht_rueckwirkend()
returns setof text language plpgsql as $f$
declare adm record; v_id uuid; v_gestern date;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_id := tests.fixture_getraenk('ZZTest Wasser', 150);
  v_gestern := (now() at time zone 'Europe/Berlin')::date - 1;

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select public.set_drink_price(%L, 200, %L)', v_id, v_gestern),
    '22023', null, 'Ein rueckwirkender Preis wird abgewiesen');
  perform set_config('role', 'postgres', true);
end; $f$;

/**
 * Ein geplanter Preis liegt bereit, wirkt aber noch nicht.
 *
 * Genau dafuer ist die Historie ohne valid_to gebaut: der neue Zeitraum
 * beginnt von selbst, ohne dass jemand am Stichtag etwas tun muss.
 */
create or replace function tests.test_geplanter_preis_gilt_erst_ab_datum()
returns setof text language plpgsql as $f$
declare a record; adm record; v_id uuid; v_kauf uuid;
        v_morgen date := (now() at time zone 'Europe/Berlin')::date + 1;
        v_geplant integer; v_ab date;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;
  v_id := tests.fixture_getraenk('ZZTest Schorle', 200);

  perform tests.act_as(adm.auth_id);
  perform public.set_drink_price(v_id, 250, v_morgen);
  select o.naechster_preis_cents, o.naechster_preis_ab into v_geplant, v_ab
  from public.drink_item_overview() o where o.id = v_id;
  perform set_config('role', 'postgres', true);

  return next is(private.current_drink_price(v_id), 200,
    'Heute gilt noch der alte Preis');
  return next is(v_geplant, 250, 'Die Uebersicht zeigt den geplanten Preis');
  return next is(v_ab, v_morgen, 'samt seinem Stichtag');

  perform tests.act_as(a.auth_id);
  select public.record_drink_purchase(v_id, 1) into v_kauf;
  perform set_config('role', 'postgres', true);

  return next is(
    (select unit_price_cents from public.drink_purchases where id = v_kauf), 200,
    'Eine Buchung von heute friert den heutigen Preis ein');
end; $f$;

create or replace function tests.test_geplanten_preis_zuruecknehmen()
returns setof text language plpgsql as $f$
declare adm record; v_id uuid;
        v_morgen date := (now() at time zone 'Europe/Berlin')::date + 1;
        v_heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_id := tests.fixture_getraenk('ZZTest Cola', 200);

  perform tests.act_as(adm.auth_id);
  perform public.set_drink_price(v_id, 250, v_morgen);
  return next lives_ok(
    format('select public.remove_drink_price(%L, %L)', v_id, v_morgen),
    'Ein geplanter Preis laesst sich zuruecknehmen');
  return next throws_ok(
    format('select public.remove_drink_price(%L, %L)', v_id, v_heute),
    '22023', null, 'Ein geltender Preis nicht');
  perform set_config('role', 'postgres', true);

  return next is(
    (select count(*)::integer from public.drink_prices
      where drink_item_id = v_id and valid_from = v_morgen),
    0, 'Die geplante Zeile ist weg');
end; $f$;

-- ---------------------------------------------------------------------------
-- Die Karte
-- ---------------------------------------------------------------------------

create or replace function tests.test_getraenk_ohne_preis_wird_abgewiesen()
returns setof text language plpgsql as $f$
declare adm record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;

  perform tests.act_as(adm.auth_id);
  -- Ohne Preis waere das Getraenk in drink_menu unsichtbar und ueber
  -- record_purchase unbuchbar - ein Datensatz, den niemand findet.
  return next throws_ok(
    'select public.upsert_drink_item(null, ''ZZTest Ohne Preis'')',
    '22023', null, 'Ein neues Getraenk ohne Preis wird abgewiesen');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_getraenkename_nur_einmal()
returns setof text language plpgsql as $f$
declare adm record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  perform tests.fixture_getraenk('ZZTest Radler', 200);

  perform tests.act_as(adm.auth_id);
  -- Der Unique-Index steht auf lower(name): Gross- und Kleinschreibung
  -- unterscheiden nicht.
  return next throws_ok(
    'select public.upsert_drink_item(null, ''zztest radler'', null, ''drink'', 200)',
    '23505', 'Ein Getraenk mit diesem Namen gibt es schon.',
    'Denselben Namen gibt es nicht zweimal');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_stillgelegtes_getraenk_verschwindet_aus_der_karte()
returns setof text language plpgsql as $f$
declare a record; adm record; v_id uuid; v_kauf uuid; v_anzahl integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;
  v_id := tests.fixture_getraenk('ZZTest Apfelsaft', 180);

  perform tests.act_as(a.auth_id);
  select public.record_drink_purchase(v_id, 1) into v_kauf;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  perform public.set_drink_item_active(v_id, false);
  perform set_config('role', 'postgres', true);

  perform tests.act_as(a.auth_id);
  select count(*)::integer into v_anzahl from public.drink_menu() m where m.id = v_id;
  return next is(v_anzahl, 0, 'Das stillgelegte Getraenk steht nicht mehr in der Karte');

  return next throws_ok(
    format('select public.record_drink_purchase(%L, 1)', v_id),
    null, null, 'und laesst sich nicht mehr buchen');

  select count(*)::integer into v_anzahl
  from public.my_drink_purchases() p where p.id = v_kauf;
  return next is(v_anzahl, 1, 'Die bisherige Buchung bleibt in der Historie');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_getraenke_umsortieren()
returns setof text language plpgsql as $f$
declare adm record; v_a uuid; v_b uuid; v_anzahl integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_a := tests.fixture_getraenk('ZZTest Erster', 200);
  v_b := tests.fixture_getraenk('ZZTest Zweiter', 200);

  perform tests.act_as(adm.auth_id);
  select public.reorder_drink_items(array[v_b, v_a]::uuid[]) into v_anzahl;
  perform set_config('role', 'postgres', true);

  return next is(v_anzahl, 2, 'Beide Getraenke wurden neu einsortiert');
  return next ok(
    (select sort_order from public.drink_items where id = v_b)
    < (select sort_order from public.drink_items where id = v_a),
    'Die Reihenfolge folgt der uebergebenen Liste');
end; $f$;

-- ---------------------------------------------------------------------------
-- Berechtigung
-- ---------------------------------------------------------------------------

create or replace function tests.test_getraenkepflege_nur_admin()
returns setof text language plpgsql as $f$
declare a record; v_id uuid;
begin
  select * into a from tests.fixture_user() limit 1;
  v_id := tests.fixture_getraenk('ZZTest Tee', 200);

  perform tests.act_as(a.auth_id);
  return next throws_ok(
    'select public.upsert_drink_item(null, ''ZZTest Kaffee'', null, ''drink'', 200)',
    '42501', null, 'Ein Mitglied legt kein Getraenk an');
  return next throws_ok(format('select public.set_drink_price(%L, 300)', v_id),
    '42501', null, 'und aendert keinen Preis');
  return next throws_ok(format('select public.set_drink_item_active(%L, false)', v_id),
    '42501', null, 'und legt nichts still');
  return next throws_ok(format('select public.reorder_drink_items(array[%L]::uuid[])', v_id),
    '42501', null, 'und sortiert die Karte nicht um');
  return next is((select count(*)::integer from public.drink_item_overview()), 0,
    'und bekommt die Verwaltungsuebersicht nicht zu sehen');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_drink_item_overview_zaehlt_nur_offene()
returns setof text language plpgsql as $f$
declare a record; adm record; v_id uuid; v_kauf uuid;
        v_gesamt integer; v_offen integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;
  v_id := tests.fixture_getraenk('ZZTest Spezi', 220);

  perform tests.act_as(a.auth_id);
  select public.record_drink_purchase(v_id, 1) into v_kauf;
  perform public.void_drink_purchase(v_kauf, 'Vertippt');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  select o.buchungen, o.buchungen_offen into v_gesamt, v_offen
  from public.drink_item_overview() o where o.id = v_id;
  perform set_config('role', 'postgres', true);

  return next is(v_gesamt, 0, 'Eine stornierte Buchung zaehlt nicht mit');
  return next is(v_offen, 0, 'auch nicht im offenen Zeitraum');
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer die Getraenkekarte sind eingespielt');
select * from extensions.finish();
