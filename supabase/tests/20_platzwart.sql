-- ===========================================================================
-- Platzwart: Rechte an den Plaetzen, aber keine Verwaltung
--
-- Der Platzwart darf, was kurzfristig am Platz passiert: sperren und
-- aufheben, Serien pflegen, fremde Buchungen stornieren und ihre Besetzung
-- aendern. Plaetze, Buchungsarten, Einstellungen und Rollen bleiben bei
-- Vorstand und App Admin. Ein einfaches Mitglied darf von alledem nichts.
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Sperren
-- ---------------------------------------------------------------------------

create or replace function tests.test_platzwart_sperrt_und_hebt_auf()
returns setof text language plpgsql as $f$
declare p record; a record; v_court uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(2, 10);
        v_bis timestamptz; v_id uuid; v_sperre uuid; v_displaced integer;
begin
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into a from tests.fixture_user() limit 1;
  v_bis := s1 + interval '2 hours';

  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', '{}'::uuid[], array['Gast']) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(p.auth_id);
  return next throws_ok(
    format('select * from public.create_blocking(array[%L]::uuid[], %L, %L, ''platzpflege'', ''Regen'')',
           v_court, s1, v_bis),
    '23P01', null, 'Auch beim Platzwart wird ohne Bestaetigung nicht verdraengt');

  select c.displaced_count into v_displaced
  from public.create_blocking(array[v_court]::uuid[], s1, v_bis, 'platzpflege', 'Regen', true) c;
  return next is(v_displaced, 1, 'Der Platzwart sperrt und verdraengt mit Bestaetigung');
  perform set_config('role', 'postgres', true);

  return next is(
    (select status::text from public.charges where booking_id = v_id and kind = 'guest'),
    'waived', 'Die Gastgebuehr der verdraengten Buchung wird erlassen');

  select id into v_sperre from public.bookings
   where court_id = v_court and kind = 'blocking' and status = 'active';

  perform tests.act_as(p.auth_id);
  return next lives_ok(format('select public.cancel_booking(%L, ''Wieder trocken'')', v_sperre),
    'Der Platzwart hebt die Sperrung wieder auf');
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.bookings where id = v_sperre), 'cancelled',
    'Die Sperrung ist aufgehoben');
end; $f$;

-- ---------------------------------------------------------------------------
-- Serien
-- ---------------------------------------------------------------------------

create or replace function tests.test_platzwart_pflegt_serien()
returns setof text language plpgsql as $f$
declare p record; v_court uuid := tests.fixture_court();
        v_von date := (now() at time zone 'Europe/Berlin')::date + 1;
        v_tag integer; v_serie uuid; v_termin uuid;
begin
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  v_tag := extract(dow from v_von + 1)::integer;

  perform tests.act_as(p.auth_id);
  return next is(
    (select count(*)::integer
       from public.preview_series(v_court, v_tag, '18:00', '19:00', v_von, v_von + 13)),
    2, 'Der Platzwart sieht die Vorschau einer Serie');

  select s.series_id into v_serie
  from public.create_series(v_court, 'training', v_tag, '18:00', '19:00',
                            v_von, v_von + 13, 'Training') s;
  return next isnt(v_serie, null, 'Der Platzwart legt eine Serie an');

  return next ok(
    exists (select 1 from public.series_overview() where id = v_serie),
    'Der Platzwart sieht die Serienuebersicht');
  return next ok(
    exists (select 1 from public.court_overview() where id = v_court),
    'und die Platzuebersicht');

  return next lives_ok(
    format('select * from public.update_series(%L, ''17:30'', ''19:00'', ''Training neu'')', v_serie),
    'Der Platzwart aendert die Serie');
  perform set_config('role', 'postgres', true);

  select id into v_termin from public.bookings
   where series_id = v_serie and status = 'active' order by lower(slot) limit 1;

  perform tests.act_as(p.auth_id);
  return next lives_ok(
    format('select public.cancel_series_occurrence(%L, ''Ferien'')', v_termin),
    'Der Platzwart sagt einen einzelnen Termin ab');
  return next lives_ok(format('select public.end_series(%L)', v_serie),
    'Der Platzwart beendet die Serie');
  perform set_config('role', 'postgres', true);

  return next is(
    (select count(*)::integer from public.bookings
      where series_id = v_serie and status = 'active'),
    0, 'Danach steht kein Termin mehr aus');
end; $f$;

/**
 * Beim Verdraengen durch eine neue Serie gilt dasselbe wie bei Sperrung und
 * Serienaenderung: vor Spielbeginn keine Gastgebuehr, und die Buchung
 * verschwindet aus den offenen Spielen.
 */
create or replace function tests.test_create_series_verdraengen_erlaesst_gastgebuehr()
returns setof text language plpgsql as $f$
declare p record; a record; v_court uuid := tests.fixture_court();
        v_heute date := (now() at time zone 'Europe/Berlin')::date;
        s1 timestamptz := tests.naechster_slot(2, 18);
        v_id uuid; v_displaced integer;
begin
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into a from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'doppel', '{}'::uuid[], array['Gast'], true)
    into v_id;
  perform set_config('role', 'postgres', true);

  return next is(
    (select status::text from public.charges where booking_id = v_id and kind = 'guest'),
    'open', 'Vorher ist die Gastgebuehr offen');

  perform tests.act_as(p.auth_id);
  select s.displaced_count into v_displaced
  from public.create_series(v_court, 'training', extract(dow from v_heute + 2)::integer,
                            '18:00', '19:00', v_heute + 1, v_heute + 3, 'Training', true) s;
  perform set_config('role', 'postgres', true);

  return next is(v_displaced, 1, 'Die Buchung wird verdraengt');
  return next is(
    (select status::text from public.charges where booking_id = v_id and kind = 'guest'),
    'waived', 'Die Gastgebuehr wird erlassen');
  return next is(
    (select partner_wanted from public.bookings where id = v_id), false,
    'Die Buchung sucht keine Mitspieler mehr');
end; $f$;

-- ---------------------------------------------------------------------------
-- Fremde Buchungen
-- ---------------------------------------------------------------------------

create or replace function tests.test_platzwart_verwaltet_fremde_buchungen()
returns setof text language plpgsql as $f$
declare p record; a record; b record; c record; v_court uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(3, 11); v_id uuid;
begin
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'doppel', array[b.member_id], '{}'::text[], true)
    into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(p.auth_id);
  return next lives_ok(
    format('select public.update_booking_players(%L, array[%L, %L]::uuid[])',
           v_id, b.member_id, c.member_id),
    'Der Platzwart aendert die Mitspieler einer fremden Buchung');
  return next lives_ok(format('select public.set_partner_wanted(%L, false)', v_id),
    'Der Platzwart setzt "Mitspieler gesucht" zurueck');
  return next lives_ok(format('select public.cancel_booking(%L, ''Platz unbespielbar'')', v_id),
    'Der Platzwart storniert eine fremde Buchung');
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.bookings where id = v_id), 'cancelled',
    'Die Buchung ist storniert');
end; $f$;

-- ---------------------------------------------------------------------------
-- Was der Platzwart nicht darf
-- ---------------------------------------------------------------------------

create or replace function tests.test_platzwart_keine_verwaltung()
returns setof text language plpgsql as $f$
declare p record; x record; v_court uuid := tests.fixture_court();
begin
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into x from tests.fixture_user(null, 'Fremd') limit 1;
  perform tests.act_as(p.auth_id);

  return next ok(not public.am_i_admin(), 'Der Platzwart gilt nicht als Admin');

  return next throws_ok('select public.upsert_court(null, ''Platz X'', ''X'')',
    '42501', null, 'Der Platzwart legt keine Plaetze an');
  return next throws_ok(format('select public.set_court_active(%L, false)', v_court),
    '42501', null, 'und legt keinen still');
  return next throws_ok(format('select public.reorder_courts(array[%L]::uuid[])', v_court),
    '42501', null, 'und sortiert sie nicht um');
  return next throws_ok(
    'select public.upsert_booking_type(''zzpw'', ''ZZ'', ''booking'', 60, 2, 4, true, true)',
    '42501', null, 'Der Platzwart pflegt keine Buchungsarten');
  return next throws_ok('select public.set_setting(''booking.slot_minutes'', ''30'')',
    '42501', null, 'Der Platzwart aendert keine Einstellungen');
  return next throws_ok(
    format($q$select public.set_member_role(%L, 'groundskeeper', true)$q$, x.member_id),
    '42501', null, 'Der Platzwart vergibt keine Rollen');

  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Ein Mitglied darf weiterhin nichts davon
-- ---------------------------------------------------------------------------

create or replace function tests.test_platzwart_rechte_nicht_fuer_mitglieder()
returns setof text language plpgsql as $f$
declare a record; m record; s record; v_court uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(4, 10); v_id uuid;
        v_von date := (now() at time zone 'Europe/Berlin')::date + 1;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into m from tests.fixture_user() limit 1;
  select * into s from tests.fixture_serie(v_court) limit 1;

  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', '{}'::uuid[], array['Gast']) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(m.auth_id);
  return next throws_ok(
    format('select * from public.create_blocking(array[%L]::uuid[], %L, %L, ''platzpflege'', ''Regen'')',
           v_court, s1, s1 + interval '1 hour'),
    '42501', null, 'Ein Mitglied sperrt keinen Platz');
  return next is(
    (select count(*)::integer
       from public.preview_series(v_court, 2, '18:00', '19:00', v_von, v_von + 13)),
    0, 'Ein Mitglied bekommt keine Serienvorschau');
  return next throws_ok(
    format('select * from public.create_series(%L, ''training'', 2, ''18:00'', ''19:00'', %L, %L, ''Test'')',
           v_court, v_von, v_von + 7),
    '42501', null, 'Ein Mitglied legt keine Serie an');
  return next throws_ok(
    format('select * from public.update_series(%L, ''17:00'', ''18:00'', ''Test'')', s.series_id),
    '42501', null, 'Ein Mitglied aendert keine Serie');
  return next throws_ok(format('select public.cancel_series_occurrence(%L)', s.neu),
    '42501', null, 'Ein Mitglied sagt keinen Serientermin ab');
  return next throws_ok(format('select public.end_series(%L)', s.series_id),
    '42501', null, 'Ein Mitglied beendet keine Serie');
  return next is((select count(*)::integer from public.series_overview()), 0,
    'Ein Mitglied sieht die Serienuebersicht nicht');
  return next is((select count(*)::integer from public.court_overview()), 0,
    'und die Platzuebersicht auch nicht');
  return next throws_ok(format('select public.update_booking_players(%L)', v_id),
    '42501', null, 'Ein Mitglied aendert keine fremde Besetzung');
  return next throws_ok(format('select public.set_partner_wanted(%L, true)', v_id),
    '42501', null, 'Ein Mitglied schreibt keine fremde Buchung aus');
  return next throws_ok(format('select public.cancel_booking(%L)', v_id),
    '42501', null, 'Ein Mitglied storniert keine fremde Buchung');
  return next throws_ok(format('select public.cancel_booking(%L)', s.neu),
    '42501', null, 'und hebt keine Sperrung auf');
  perform set_config('role', 'postgres', true);
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer den Platzwart sind eingespielt');
select * from extensions.finish();
