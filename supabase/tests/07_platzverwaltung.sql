-- ===========================================================================
-- Platzverwaltung: Sperrungen, Serien, Plaetze, Buchungsarten
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- create_blocking
-- ---------------------------------------------------------------------------

/**
 * Die zweistufige Verdraengung ist der Kern dieser Funktion: ohne p_force
 * bricht sie ab, damit die Oberflaeche fragen kann, statt kommentarlos zehn
 * Buchungen zu loeschen.
 */
create or replace function tests.test_blocking_ohne_force_bricht_ab()
returns setof text language plpgsql as $f$
declare a record; adm record; b record; v_court uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(2, 10);
        v_von timestamptz; v_bis timestamptz; v_id uuid;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;
  v_von := s1; v_bis := s1 + interval '2 hours';

  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', array[b.member_id]) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select * from public.create_blocking(array[%L]::uuid[], %L, %L, ''platzpflege'', ''Regen'')',
           v_court, v_von, v_bis),
    '23P01', null, 'Ohne Bestaetigung wird nicht verdraengt');
  perform set_config('role', 'postgres', true);

  return next is(
    (select status::text from public.bookings where id = v_id), 'active',
    'Die bestehende Buchung steht danach unveraendert da');
end; $f$;

create or replace function tests.test_blocking_mit_force_verdraengt_und_meldet()
returns setof text language plpgsql as $f$
declare a record; adm record; b record; v_court uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(2, 11);
        v_von timestamptz; v_bis timestamptz; v_id uuid;
        v_created integer; v_displaced integer; v_anzahl integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;
  v_von := s1; v_bis := s1 + interval '2 hours';

  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', '{}'::uuid[], array['Gast']) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  select c.created_count, c.displaced_count into v_created, v_displaced
  from public.create_blocking(array[v_court]::uuid[], v_von, v_bis,
                              'platzpflege', 'Regen', true) c;
  perform set_config('role', 'postgres', true);

  return next is(v_created, 1, 'Eine Blockung je Platz');
  return next is(v_displaced, 1, 'Eine Buchung wurde verdraengt');
  return next is(
    (select status::text from public.bookings where id = v_id), 'cancelled',
    'Die Buchung ist storniert');

  select count(*)::integer into v_anzahl
  from public.notifications where member_id = a.member_id and kind = 'booking_displaced';
  return next is(v_anzahl, 1, 'Der Bucher wird benachrichtigt');

  -- Wer wegen einer Sperrung nicht spielen konnte, zahlt keine Gastgebuehr.
  return next is(
    (select status::text from public.charges where booking_id = v_id and kind = 'guest'),
    'waived', 'Die Gastgebuehr wird erlassen');
end; $f$;

create or replace function tests.test_blocking_nur_admin()
returns setof text language plpgsql as $f$
declare a record; v_court uuid := tests.fixture_court();
        v_von timestamptz := tests.naechster_slot(2, 12);
        v_bis timestamptz;
begin
  select * into a from tests.fixture_user() limit 1;
  v_bis := v_von + interval '1 hour';

  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format('select * from public.create_blocking(array[%L]::uuid[], %L, %L, ''platzpflege'', ''Regen'')',
           v_court, v_von, v_bis),
    '42501', null, 'Ein normales Mitglied kann keinen Platz sperren');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- end_series
-- ---------------------------------------------------------------------------

/**
 * Kuenftige Termine weg, vergangene bleiben.
 *
 * Die zweite Haelfte ist die wichtigere: wer die Historie mitloescht, kann
 * hinterher nicht mehr belegen, wer wann auf dem Platz stand.
 */
create or replace function tests.test_end_series_laesst_vergangenes_stehen()
returns setof text language plpgsql as $f$
declare adm record; v_court uuid := tests.fixture_court(); v_type uuid;
        v_serie uuid; v_alt uuid; v_neu uuid; v_weg integer;
        v_vergangen timestamptz := now() - interval '7 days';
        v_kuenftig  timestamptz := now() + interval '7 days';
        v_heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select id into v_type from public.booking_types where code = 'training';

  insert into public.booking_series
    (court_id, booking_type_id, weekday, start_time, end_time, valid_from, valid_to, title)
  values (v_court, v_type, 2, '18:00', '19:00',
          v_heute - interval '30 days', v_heute + interval '30 days', 'Training')
  returning id into v_serie;

  insert into public.bookings (court_id, slot, kind, booking_type_id, series_id, title)
  values (v_court, tstzrange(v_vergangen, v_vergangen + interval '1 hour', '[)'),
          'blocking', v_type, v_serie, 'Training')
  returning id into v_alt;

  insert into public.bookings (court_id, slot, kind, booking_type_id, series_id, title)
  values (v_court, tstzrange(v_kuenftig, v_kuenftig + interval '1 hour', '[)'),
          'blocking', v_type, v_serie, 'Training')
  returning id into v_neu;

  perform tests.act_as(adm.auth_id);
  select public.end_series(v_serie) into v_weg;
  perform set_config('role', 'postgres', true);

  return next is(v_weg, 1, 'Genau der kuenftige Termin wird abgesagt');
  return next is((select status::text from public.bookings where id = v_neu), 'cancelled',
    'Der kuenftige Termin ist storniert');
  return next is((select status::text from public.bookings where id = v_alt), 'active',
    'Der vergangene bleibt als Historie stehen');
  return next ok(
    (select valid_to from public.booking_series where id = v_serie) < v_heute + 1,
    'valid_to wurde zurueckgesetzt');
end; $f$;

create or replace function tests.test_serientermin_absagen()
returns setof text language plpgsql as $f$
declare adm record; a record; v_court uuid := tests.fixture_court(); v_type uuid;
        v_serie uuid; v_id uuid; v_frei uuid;
        v_kuenftig timestamptz := now() + interval '9 days';
        v_heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select id into v_type from public.booking_types where code = 'training';

  insert into public.booking_series
    (court_id, booking_type_id, weekday, start_time, end_time, valid_from, valid_to, title)
  values (v_court, v_type, 2, '18:00', '19:00', v_heute, v_heute + 30, 'Training')
  returning id into v_serie;

  insert into public.bookings (court_id, slot, kind, booking_type_id, series_id, title)
  values (v_court, tstzrange(v_kuenftig, v_kuenftig + interval '1 hour', '[)'),
          'blocking', v_type, v_serie, 'Training')
  returning id into v_id;

  -- Eine Buchung ohne Serie darf die Funktion nicht anfassen.
  insert into public.bookings (court_id, slot, kind, booking_type_id, member_id, created_by)
  values (v_court, tstzrange(v_kuenftig + interval '2 hours',
                             v_kuenftig + interval '3 hours', '[)'),
          'booking', (select id from public.booking_types where code = 'einzel'),
          a.member_id, a.member_id)
  returning id into v_frei;

  perform tests.act_as(adm.auth_id);
  return next lives_ok(format('select public.cancel_series_occurrence(%L, ''Ferien'')', v_id),
    'Ein einzelner Serientermin laesst sich absagen');
  return next throws_ok(format('select public.cancel_series_occurrence(%L)', v_frei),
    '22023', null, 'Eine gewoehnliche Buchung gehoert nicht hierher');
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.bookings where id = v_id), 'cancelled',
    'Der Termin ist storniert');
end; $f$;

-- ---------------------------------------------------------------------------
-- Plaetze und Buchungsarten
-- ---------------------------------------------------------------------------

create or replace function tests.test_platz_anlegen_und_stilllegen()
returns setof text language plpgsql as $f$
declare adm record; v_id uuid; v_offen integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;

  perform tests.act_as(adm.auth_id);
  select public.upsert_court(null, 'Platz ZZTest', 'ZZ', 'Sandplatz') into v_id;
  return next isnt(v_id, null, 'Ein Platz laesst sich anlegen');

  return next throws_ok(
    'select public.upsert_court(null, ''Platz ZZTest'', ''ZZ2'')',
    '23505', null, 'Denselben Namen gibt es nicht zweimal');

  select public.set_court_active(v_id, false) into v_offen;
  return next is(v_offen, 0, 'Der neue Platz hat keine offenen Buchungen');
  perform set_config('role', 'postgres', true);

  return next is((select active from public.courts where id = v_id), false,
    'Der Platz ist stillgelegt');
end; $f$;

create or replace function tests.test_platzpflege_nur_admin()
returns setof text language plpgsql as $f$
declare a record; v_court uuid := tests.fixture_court();
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  return next throws_ok('select public.upsert_court(null, ''Platz X'', ''X'')',
    '42501', null, 'Ein Mitglied legt keine Plaetze an');
  return next throws_ok(format('select public.set_court_active(%L, false)', v_court),
    '42501', null, 'und legt auch keinen still');
  return next throws_ok(format('select public.reorder_courts(array[%L]::uuid[])', v_court),
    '42501', null, 'und sortiert sie nicht um');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_plaetze_umsortieren()
returns setof text language plpgsql as $f$
declare adm record; v_a uuid; v_b uuid; v_anzahl integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_a := tests.fixture_court();
  v_b := tests.fixture_court();

  perform tests.act_as(adm.auth_id);
  select public.reorder_courts(array[v_b, v_a]::uuid[]) into v_anzahl;
  perform set_config('role', 'postgres', true);

  return next is(v_anzahl, 2, 'Beide Plaetze wurden neu einsortiert');
  return next ok(
    (select position from public.courts where id = v_b)
    < (select position from public.courts where id = v_a),
    'Die Reihenfolge folgt der uebergebenen Liste');
end; $f$;

create or replace function tests.test_buchungsart_anlegen_und_aendern()
returns setof text language plpgsql as $f$
declare adm record; v_id uuid; v_zweite uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;

  perform tests.act_as(adm.auth_id);
  select public.upsert_booking_type('zztest', 'ZZ Test', 'booking', 60, 2, 4, true, true)
    into v_id;
  return next isnt(v_id, null, 'Eine Buchungsart laesst sich anlegen');

  -- Derselbe Code aktualisiert statt zu doppeln.
  select public.upsert_booking_type('zztest', 'ZZ Test neu', 'booking', 90, 2, 4, true, false)
    into v_zweite;
  return next is(v_zweite, v_id, 'Derselbe Code trifft denselben Datensatz');

  return next throws_ok(
    'select public.upsert_booking_type(''zzbad'', ''Kaputt'', ''booking'', 60, 4, 2, true, true)',
    '22023', null, 'Obergrenze unter Untergrenze wird abgewiesen');
  perform set_config('role', 'postgres', true);

  return next is((select name from public.booking_types where id = v_id), 'ZZ Test neu',
    'Die Aenderung ist angekommen');
  return next is((select duration_minutes from public.booking_types where id = v_id), 90,
    'auch die Dauer');
end; $f$;

create or replace function tests.test_court_overview_zaehlt_offene()
returns setof text language plpgsql as $f$
declare adm record; a record; b record; v_court uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(5, 10); v_anzahl integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  perform public.create_booking(v_court, s1, 'einzel', array[b.member_id]);
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  select o.offene_buchungen into v_anzahl
  from public.court_overview() o where o.id = v_court;
  return next is(v_anzahl, 1, 'Die Uebersicht zaehlt die kuenftige Buchung');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(a.auth_id);
  return next is((select count(*)::integer from public.court_overview()), 0,
    'Ein normales Mitglied bekommt die Verwaltungsuebersicht nicht');
  perform set_config('role', 'postgres', true);
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer die Platzverwaltung sind eingespielt');
select * from extensions.finish();
