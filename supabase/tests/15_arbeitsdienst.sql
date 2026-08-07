-- ===========================================================================
-- Arbeitsdienst
--
-- Zwei Tests tragen die Datei:
--
--   1. Das Soll ist die HOECHSTE Regel ueber alle Beitragsarten, nicht die
--      Summe. Wer Beitrag plus Schluesselpfand hat, muesste sonst doppelt
--      arbeiten - und das faellt niemandem auf, bis die Rechnung kommt.
--   2. Das Jahr wird aus dem Einsatztag abgeleitet, nicht aus dem Tagesdatum.
--      Der Platzaufbau vom 30. Dezember, im Januar nachgetragen, landete
--      sonst unter dem falschen Jahr.
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
-- ===========================================================================

/** Ein Mitglied mit Beitragsart und Soll-Stunden. */
create or replace function tests.fixture_dienstpflichtig(
  p_jahr integer, p_stunden numeric default 5
)
returns table (mitglied uuid, auth uuid, art uuid) language plpgsql as $f$
declare adm record; u record; v_art uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_art := tests.fixture_beitragsart('ZZTest Dienst ' || substr(gen_random_uuid()::text, 1, 6),
                                     p_jahr, 19000);
  select * into u from tests.fixture_beitragszahler(v_art, p_jahr) limit 1;

  perform tests.act_as(adm.auth_id);
  perform public.upsert_work_duty_rule(v_art, p_jahr, p_stunden);
  perform set_config('role', 'postgres', true);

  return query select u.member_id, u.auth_id, v_art;
end; $f$;

-- ---------------------------------------------------------------------------
-- Regeln
-- ---------------------------------------------------------------------------

/**
 * Der Kern: das Soll ist die hoechste Regel, nicht die Summe.
 *
 * Spiegelt requiredHoursFor in packages/core/src/workDuty.ts. Wuerde hier
 * summiert, muesste jemand mit Beitrag plus Schluesselpfand doppelt arbeiten.
 */
create or replace function tests.test_soll_ist_die_hoechste_regel()
returns setof text language plpgsql as $f$
declare adm record; f record; v_pfand uuid; v record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_dienstpflichtig(2028, 8) limit 1;

  -- Eine zweite Beitragsart mit eigener, kleinerer Regel
  v_pfand := tests.fixture_beitragsart('ZZTest Schluessel', 2028, 2000);
  perform tests.act_as(adm.auth_id);
  perform public.set_member_fee(f.mitglied, v_pfand, 2028);
  perform public.upsert_work_duty_rule(v_pfand, 2028, 3);

  select * into v from public.work_duty_overview(2028) o where o.member_id = f.mitglied;
  perform set_config('role', 'postgres', true);

  return next is(v.required_hours, 8::numeric,
    'Das Soll ist die hoechste Regel (8), nicht die Summe (11)');
end; $f$;

/** Eine Regel laesst sich nach der Abrechnung nicht mehr aendern. */
create or replace function tests.test_regel_nach_abrechnung_gesperrt()
returns setof text language plpgsql as $f$
declare adm record; f record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_dienstpflichtig(2020, 5) limit 1;

  perform tests.act_as(adm.auth_id);
  perform public.work_duty_settle_year(2020);

  return next throws_ok(
    format('select public.upsert_work_duty_rule(%L, 2020, 99)', f.art),
    '22023', null,
    'Nach der Abrechnung sind die Regeln des Jahres gesperrt');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Stunden erfassen
-- ---------------------------------------------------------------------------

/**
 * Der zweite Kern: das Jahr kommt aus dem Einsatztag.
 *
 * Ein im Januar nachgetragener Dezember-Einsatz gehoert ins alte Jahr. Kaeme
 * das Jahr aus dem Tagesdatum, faende es erst die Abrechnung heraus - und
 * dann steht es im falschen.
 */
create or replace function tests.test_jahr_folgt_dem_einsatztag()
returns setof text language plpgsql as $f$
declare adm record; f record; v_id uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_dienstpflichtig(2024, 5) limit 1;

  perform tests.act_as(adm.auth_id);
  select public.record_work_duty(f.mitglied, 4, '2024-12-30', 'ZZTest Platzabbau') into v_id;
  perform set_config('role', 'postgres', true);

  return next is(
    (select year from public.work_duty_entries where id = v_id), 2024,
    'Der Einsatz vom 30.12.2024 zaehlt fuer 2024, egal wann er eingetragen wurde');
end; $f$;

/** Ein Einsatz in der Zukunft wird abgewiesen. */
create or replace function tests.test_kein_einsatz_in_der_zukunft()
returns setof text language plpgsql as $f$
declare adm record; f record; v_morgen date;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_dienstpflichtig(2026, 5) limit 1;
  v_morgen := (now() at time zone 'Europe/Berlin')::date + 1;

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select public.record_work_duty(%L, 3, %L)', f.mitglied, v_morgen),
    '22023', null,
    'Was noch nicht geleistet ist, laesst sich nicht eintragen');
  perform set_config('role', 'postgres', true);
end; $f$;

/** Eingetragene Stunden zaehlen sofort auf den Stand. */
create or replace function tests.test_eingetragene_stunden_zaehlen()
returns setof text language plpgsql as $f$
declare adm record; f record; v record; v_mein record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_dienstpflichtig(2024, 8) limit 1;

  perform tests.act_as(adm.auth_id);
  perform public.record_work_duty(f.mitglied, 3, '2024-05-04', 'ZZTest Platzaufbau');
  perform public.record_work_duty(f.mitglied, 2.5, '2024-09-14', 'ZZTest Herbstputz');
  select * into v from public.work_duty_overview(2024) o where o.member_id = f.mitglied;
  perform set_config('role', 'postgres', true);

  return next is(v.completed_hours, 5.5::numeric, 'Beide Einsaetze zaehlen');
  return next is(v.missing_hours, 2.5::numeric, 'und es fehlen noch zweieinhalb Stunden');
  return next is(v.eintraege, 2, 'Die Uebersicht zaehlt die Einsaetze');

  -- Das Mitglied sieht denselben Stand
  perform tests.act_as(f.auth);
  select * into v_mein from public.my_work_duty(2024);
  perform set_config('role', 'postgres', true);

  return next is(v_mein.completed_hours, 5.5::numeric,
    'Das Mitglied sieht denselben Stand in seinem Konto');
end; $f$;

/** Das Mitglied sieht seine Einsaetze, aber nicht die der anderen. */
create or replace function tests.test_mitglied_sieht_nur_eigene_einsaetze()
returns setof text language plpgsql as $f$
declare adm record; a record; b record; v_eigene integer; v_fremde integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_dienstpflichtig(2024, 5) limit 1;
  select * into b from tests.fixture_dienstpflichtig(2024, 5) limit 1;

  perform tests.act_as(adm.auth_id);
  perform public.record_work_duty(a.mitglied, 2, '2024-06-01');
  perform public.record_work_duty(b.mitglied, 2, '2024-06-01');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(a.auth);
  select count(*)::integer into v_eigene from public.my_work_duty_entries(2024);
  select count(*)::integer into v_fremde from public.work_duty_entries_for(b.mitglied, 2024);
  perform set_config('role', 'postgres', true);

  return next is(v_eigene, 1, 'Das Mitglied sieht seinen eigenen Einsatz');
  return next is(v_fremde, 0, 'aber nicht den eines anderen');
end; $f$;

/** Ein Mitglied traegt nichts ein. */
create or replace function tests.test_mitglied_traegt_nichts_ein()
returns setof text language plpgsql as $f$
declare f record;
begin
  select * into f from tests.fixture_dienstpflichtig(2024, 5) limit 1;

  perform tests.act_as(f.auth);
  return next throws_ok(
    format('select public.record_work_duty(%L, 5, ''2024-06-01'')', f.mitglied),
    '42501', null,
    'Ein Mitglied kann seinen Stand nicht selbst hochsetzen');
  perform set_config('role', 'postgres', true);
end; $f$;

/**
 * An den RPCs vorbei geht nichts.
 *
 * Auf work_duty_entries lagen direkte Schreibrechte - damit haette die
 * Oberflaeche auch fuer ein abgerechnetes Jahr eintragen koennen.
 */
create or replace function tests.test_keine_direkten_dienstrechte()
returns setof text language plpgsql as $f$
begin
  return next is(
    (select count(*)::integer from information_schema.role_table_grants
      where grantee = 'authenticated' and table_name = 'work_duty_entries'
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
    0, 'authenticated schreibt nicht direkt in work_duty_entries');
end; $f$;

-- ---------------------------------------------------------------------------
-- Der Jahresausgleich
-- ---------------------------------------------------------------------------

/**
 * Der Stundensatz wird eingefroren.
 *
 * Dafuer ist work_duty_settlements gebaut: eine spaetere Erhoehung darf ein
 * abgeschlossenes Jahr nicht umschreiben.
 */
create or replace function tests.test_stundensatz_wird_eingefroren()
returns setof text language plpgsql as $f$
declare adm record; f record; v record; v_betrag integer; v_satz integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_dienstpflichtig(2021, 10) limit 1;

  perform tests.act_as(adm.auth_id);
  perform public.record_work_duty(f.mitglied, 4, '2021-05-01');
  select * into v from public.work_duty_settle_year(2021);
  perform set_config('role', 'postgres', true);

  -- 6 fehlende Stunden zu 15,00 Euro
  return next is(v.abgerechnet, 1, 'Ein Mitglied wurde abgerechnet');
  return next is(v.summe_cents, 9000, 'sechs fehlende Stunden zu 15,00 Euro');

  -- Stundensatz aendern und nachsehen
  update public.settings set value = '3000'::jsonb where key = 'work_duty.hourly_rate_cents';

  select w.amount_cents, w.hourly_rate_cents into v_betrag, v_satz
  from public.work_duty_settlements w where w.member_id = f.mitglied and w.year = 2021;

  return next is(v_betrag, 9000,
    'Die Erhoehung des Stundensatzes aendert das abgerechnete Jahr nicht');
  return next is(v_satz, 1500, 'Der Satz von damals steht in der Abrechnung');
end; $f$;

/**
 * Wer sein Soll erfuellt hat, bekommt eine Zeile mit 0 und keine Forderung.
 *
 * Die Zeile ist kein Ballast: sie ist der Beleg "geprueft, nichts offen" und
 * die Sperre des Jahres.
 */
create or replace function tests.test_erfuelltes_soll_ohne_forderung()
returns setof text language plpgsql as $f$
declare adm record; f record; v record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_dienstpflichtig(2022, 5) limit 1;

  perform tests.act_as(adm.auth_id);
  perform public.record_work_duty(f.mitglied, 6, '2022-05-01');
  select * into v from public.work_duty_settle_year(2022);
  perform set_config('role', 'postgres', true);

  return next is(v.abgerechnet, 1, 'Auch wer sein Soll erfuellt hat, wird abgerechnet');
  return next is(v.forderungen, 0, 'aber es entsteht keine Forderung');
  return next is(
    (select amount_cents from public.work_duty_settlements
      where member_id = f.mitglied and year = 2022),
    0, 'Die Zeile steht mit 0 da - geprueft, nichts offen');
  return next is(
    (select charge_id from public.work_duty_settlements
      where member_id = f.mitglied and year = 2022),
    null, 'und ohne Forderung');
end; $f$;

/** Die Forderung geht an den Zahler und traegt die richtige Art. */
create or replace function tests.test_dienstforderung_geht_an_den_zahler()
returns setof text language plpgsql as $f$
declare adm record; eltern record; f record; c record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into eltern from tests.fixture_user() limit 1;
  select * into f from tests.fixture_dienstpflichtig(2023, 6) limit 1;
  update public.members set billing_payer_id = eltern.member_id where id = f.mitglied;

  perform tests.act_as(adm.auth_id);
  perform public.work_duty_settle_year(2023);
  perform set_config('role', 'postgres', true);

  select * into c from public.charges
   where member_id = f.mitglied and kind = 'work_duty' and period_label = '2023';

  return next is(c.payer_id, eltern.member_id, 'Die Forderung geht an den Zahler');
  return next is(c.amount_cents, 9000, 'sechs Stunden zu 15,00 Euro');
  return next ok(c.description like '%Arbeitsdienst 2023%',
    'und die Beschreibung nennt Jahr und Stunden');
end; $f$;

/** Das laufende Jahr laesst sich nicht abrechnen. */
create or replace function tests.test_laufendes_jahr_nicht_abrechenbar()
returns setof text language plpgsql as $f$
declare adm record; v_jahr integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_jahr := extract(year from (now() at time zone 'Europe/Berlin'))::integer;

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select public.work_duty_settle_year(%L)', v_jahr), '22023', null,
    'Solange das Jahr laeuft, koennen noch Stunden dazukommen');
  perform set_config('role', 'postgres', true);
end; $f$;

/** Eine Nachmeldung fuer ein abgerechnetes Jahr wird abgewiesen. */
create or replace function tests.test_nachmeldung_nach_abrechnung_abgewiesen()
returns setof text language plpgsql as $f$
declare adm record; f record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_dienstpflichtig(2019, 5) limit 1;

  perform tests.act_as(adm.auth_id);
  perform public.work_duty_settle_year(2019);

  return next throws_ok(
    format('select public.record_work_duty(%L, 3, ''2019-06-01'')', f.mitglied),
    '22023', null,
    'Eine Nachmeldung fuer ein abgerechnetes Jahr ginge ins Leere');
  perform set_config('role', 'postgres', true);
end; $f$;

/** Zweimal abrechnen erzeugt nichts. */
create or replace function tests.test_zweite_abrechnung_erzeugt_nichts()
returns setof text language plpgsql as $f$
declare adm record; f record; v record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_dienstpflichtig(2018, 5) limit 1;

  perform tests.act_as(adm.auth_id);
  perform public.work_duty_settle_year(2018);
  select * into v from public.work_duty_settle_year(2018);
  perform set_config('role', 'postgres', true);

  return next is(v.abgerechnet, 0, 'Der zweite Lauf rechnet niemanden noch einmal ab');
  return next is(
    (select count(*)::integer from public.charges
      where member_id = f.mitglied and kind = 'work_duty' and period_label = '2018'),
    1, 'und es bleibt bei einer Forderung');
end; $f$;

/** Nur der Vorstand rechnet ab. */
create or replace function tests.test_abrechnung_nur_admin()
returns setof text language plpgsql as $f$
declare u record;
begin
  select * into u from tests.fixture_user() limit 1;
  perform tests.act_as(u.auth_id);
  return next throws_ok(
    'select public.work_duty_settle_year(2020)', '42501', null,
    'Ein normales Mitglied rechnet den Arbeitsdienst nicht ab');
  perform set_config('role', 'postgres', true);
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer den Arbeitsdienst sind eingespielt');
select * from extensions.finish();
