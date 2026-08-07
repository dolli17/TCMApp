-- ===========================================================================
-- Serien aendern und einzelne Termine absagen
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
-- ===========================================================================

/**
 * Legt eine Serie mit einem vergangenen und einem kuenftigen Termin an.
 *
 * Direkt per INSERT statt ueber create_series: die RPC legt nur Termine ab dem
 * Startdatum an, und fuer die interessante Frage - bleibt die Historie stehen? -
 * wird ein Termin in der Vergangenheit gebraucht.
 *
 * Die Termine liegen auf einer festen Uhrzeit (18:00 Berliner Zeit), nicht auf
 * "jetzt plus sieben Tage". Sonst haengt jeder Kollisionstest daran, zu welcher
 * Uhrzeit die Suite zufaellig laeuft - und um halb vier nachts kollidiert
 * nichts mit 16 Uhr.
 */
create or replace function tests.fixture_serie(p_court uuid)
returns table (series_id uuid, alt uuid, neu uuid) language plpgsql as $f$
declare
  v_type uuid; v_serie uuid; v_alt uuid; v_neu uuid;
  v_heute date := (now() at time zone 'Europe/Berlin')::date;
  v_vergangen timestamptz :=
    ((v_heute - 7)::timestamp + time '18:00') at time zone 'Europe/Berlin';
  v_kuenftig timestamptz :=
    ((v_heute + 7)::timestamp + time '18:00') at time zone 'Europe/Berlin';
begin
  select id into v_type from public.booking_types where code = 'training';

  insert into public.booking_series
    (court_id, booking_type_id, weekday, start_time, end_time, valid_from, valid_to, title)
  values (p_court, v_type, extract(dow from v_heute)::integer, '18:00', '19:00',
          v_heute - 30, v_heute + 30, 'Training')
  returning id into v_serie;

  insert into public.bookings (court_id, slot, kind, booking_type_id, series_id, title)
  values (p_court, tstzrange(v_vergangen, v_vergangen + interval '1 hour', '[)'),
          'blocking', v_type, v_serie, 'Training')
  returning id into v_alt;

  insert into public.bookings (court_id, slot, kind, booking_type_id, series_id, title)
  values (p_court, tstzrange(v_kuenftig, v_kuenftig + interval '1 hour', '[)'),
          'blocking', v_type, v_serie, 'Training')
  returning id into v_neu;

  return query select v_serie, v_alt, v_neu;
end; $f$;

-- ---------------------------------------------------------------------------
-- update_series
-- ---------------------------------------------------------------------------

create or replace function tests.test_update_series_laesst_vergangenes_stehen()
returns setof text language plpgsql as $f$
declare adm record; s record; v_court uuid := tests.fixture_court();
        v_created integer; v_cancelled integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into s from tests.fixture_serie(v_court) limit 1;

  perform tests.act_as(adm.auth_id);
  select u.created_count, u.cancelled_count into v_created, v_cancelled
  from public.update_series(s.series_id, '17:00', '18:00', 'Training neu') u;
  perform set_config('role', 'postgres', true);

  return next ok(v_created > 0, 'Es entstehen neue Termine in der neuen Lage');
  return next is(v_cancelled, 1, 'Genau der eine kuenftige Termin wird abgesagt');
  return next is((select status::text from public.bookings where id = s.alt), 'active',
    'Der vergangene Termin bleibt als Historie stehen');
  return next is((select status::text from public.bookings where id = s.neu), 'cancelled',
    'Der kuenftige ist weg');
  return next is((select start_time from public.booking_series where id = s.series_id),
    '17:00'::time, 'Die Serie traegt die neue Startzeit');
  return next is((select title from public.booking_series where id = s.series_id),
    'Training neu', 'und den neuen Titel');
end; $f$;

/**
 * Die eigenen Termine zaehlen nicht als Kollision.
 *
 * Sonst waere jede Aenderung, die sich mit der alten Lage ueberschneidet,
 * bestaetigungspflichtig - und der Vorstand haette sich daran gewoehnt,
 * "Verdraengen" blind zu druecken.
 */
create or replace function tests.test_update_series_eigene_termine_sind_keine_kollision()
returns setof text language plpgsql as $f$
declare adm record; s record; v_court uuid := tests.fixture_court();
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into s from tests.fixture_serie(v_court) limit 1;

  perform tests.act_as(adm.auth_id);
  -- Nur eine halbe Stunde verschoben: die neue Lage ueberlappt die alte.
  return next lives_ok(
    format('select * from public.update_series(%L, ''18:30'', ''19:30'', ''Training'')',
           s.series_id),
    'Eine Verschiebung ueber die eigene alte Lage braucht keine Bestaetigung');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_update_series_fremde_buchung_bricht_ab()
returns setof text language plpgsql as $f$
declare adm record; a record; b record; s record; v_court uuid := tests.fixture_court();
        v_id uuid; v_start timestamptz;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into s from tests.fixture_serie(v_court) limit 1;

  -- Eine fremde Buchung genau dort, wohin die Serie verschoben werden soll:
  -- am Tag des kuenftigen Termins, aber von 16 bis 17 Uhr.
  select ((lower(slot) at time zone 'Europe/Berlin')::date::timestamp + time '16:00')
           at time zone 'Europe/Berlin'
    into v_start
  from public.bookings where id = s.neu;

  insert into public.bookings (court_id, slot, kind, booking_type_id, member_id, created_by)
  values (v_court, tstzrange(v_start, v_start + interval '1 hour', '[)'),
          'booking', (select id from public.booking_types where code = 'einzel'),
          a.member_id, a.member_id)
  returning id into v_id;
  insert into public.booking_players (booking_id, member_id) values (v_id, b.member_id);

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select * from public.update_series(%L, ''16:00'', ''17:00'', ''Training'')',
           s.series_id),
    '23P01', null, 'Ohne Bestaetigung wird eine fremde Buchung nicht verdraengt');

  return next lives_ok(
    format('select * from public.update_series(%L, ''16:00'', ''17:00'', ''Training'', null, true)',
           s.series_id),
    'Mit Bestaetigung schon');
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.bookings where id = v_id), 'cancelled',
    'Die fremde Buchung ist storniert');
  return next is(
    (select count(*)::integer from public.notifications
      where member_id = a.member_id and kind = 'booking_displaced'),
    1, 'Der Bucher wird benachrichtigt');
  return next is(
    (select count(*)::integer from public.notifications
      where member_id = b.member_id and kind = 'booking_displaced'),
    1, 'Der Mitspieler ebenso');
end; $f$;

create or replace function tests.test_update_series_nur_admin()
returns setof text language plpgsql as $f$
declare a record; s record; v_court uuid := tests.fixture_court();
begin
  select * into a from tests.fixture_user() limit 1;
  select * into s from tests.fixture_serie(v_court) limit 1;

  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format('select * from public.update_series(%L, ''17:00'', ''18:00'', ''Hallo'')', s.series_id),
    '42501', null, 'Ein normales Mitglied kann keine Serie aendern');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_update_series_prueft_die_zeiten()
returns setof text language plpgsql as $f$
declare adm record; s record; v_court uuid := tests.fixture_court();
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into s from tests.fixture_serie(v_court) limit 1;

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select * from public.update_series(%L, ''19:00'', ''18:00'', ''Training'')', s.series_id),
    '22023', 'Die Endzeit muss nach der Startzeit liegen.',
    'Endzeit vor Startzeit wird abgewiesen');
  return next throws_ok(
    format('select * from public.update_series(%L, ''17:00'', ''18:00'', ''  '')', s.series_id),
    '22023', 'Bitte einen Titel angeben.', 'Ein leerer Titel ebenso');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- day_schedule kennt die Serie
-- ---------------------------------------------------------------------------

create or replace function tests.test_day_schedule_nennt_die_serie()
returns setof text language plpgsql as $f$
declare a record; s record; v_court uuid := tests.fixture_court();
        v_tag date; v_serie uuid;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into s from tests.fixture_serie(v_court) limit 1;
  select (lower(slot) at time zone 'Europe/Berlin')::date into v_tag
  from public.bookings where id = s.neu;

  perform tests.act_as(a.auth_id);
  select d.series_id into v_serie
  from public.day_schedule(v_tag) d where d.booking_id = s.neu;
  return next is(v_serie, s.series_id, 'Ein Serientermin nennt seine Serie');
  perform set_config('role', 'postgres', true);
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer Serienaenderungen sind eingespielt');
select * from extensions.finish();
