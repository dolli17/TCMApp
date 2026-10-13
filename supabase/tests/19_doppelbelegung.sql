-- ===========================================================================
-- Niemand spielt zur selben Zeit auf zwei Plaetzen (Befund O21)
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
--
-- Merke: nach tests.act_as() besteht kein Zugriff mehr auf das Schema tests.
-- Platznamen und Zeiten deshalb vorher in Variablen holen.
-- ===========================================================================

create or replace function tests.platzname(p_court_id uuid)
returns text language sql stable as $f$
  select name from public.courts where id = p_court_id;
$f$;

-- ---------------------------------------------------------------------------
-- Anlegen
-- ---------------------------------------------------------------------------

create or replace function tests.test_doppelbelegung_als_bucher() returns setof text
language plpgsql as $f$
declare a record; b record; c record;
        p1 uuid := tests.fixture_court(); p2 uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(3, 14); n1 text;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  n1 := tests.platzname(p1);

  perform tests.act_as(a.auth_id);
  perform public.create_booking(p1, s1, 'einzel', array[b.member_id]);
  return next throws_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])', p2, s1, c.member_id),
    '23514', format('Du spielst zu dieser Zeit schon auf %s.', n1),
    'Wer schon bucht, kann zur selben Zeit nicht noch einen Platz buchen');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_doppelbelegung_als_mitspieler() returns setof text
language plpgsql as $f$
declare a record; b record; c record; d record;
        p1 uuid := tests.fixture_court(); p2 uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(3, 15); n1 text; b_name text; a_name text;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  select * into d from tests.fixture_user() limit 1;
  n1 := tests.platzname(p1);
  select first_name || ' ' || last_name into b_name from public.members where id = b.member_id;
  select first_name || ' ' || last_name into a_name from public.members where id = a.member_id;

  perform tests.act_as(a.auth_id);
  perform public.create_booking(p1, s1, 'einzel', array[b.member_id]);
  perform set_config('role', 'postgres', true);

  perform tests.act_as(c.auth_id);
  return next throws_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])', p2, s1, b.member_id),
    '23514', format('%s spielt zu dieser Zeit schon auf %s.', b_name, n1),
    'Ein Mitspieler, der schon woanders spielt, wird abgewiesen');
  return next throws_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])', p2, s1, a.member_id),
    '23514', format('%s spielt zu dieser Zeit schon auf %s.', a_name, n1),
    'Auch der Bucher einer anderen Buchung zaehlt als belegt');
  -- Eine halbe Stunde versetzt ueberschneidet sich immer noch.
  return next throws_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])',
           p2, s1 + interval '30 minutes', b.member_id),
    '23514', format('%s spielt zu dieser Zeit schon auf %s.', b_name, n1),
    'Teilweise Ueberschneidung wird ebenfalls abgewiesen');
  return next lives_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])', p2, s1, d.member_id),
    'Andere Leute koennen den zweiten Platz zur selben Zeit buchen');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_doppelbelegung_angrenzend_und_storniert() returns setof text
language plpgsql as $f$
declare a record; b record; c record;
        p1 uuid := tests.fixture_court(); p2 uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(3, 16); v_id uuid;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  select public.create_booking(p1, s1, 'einzel', array[b.member_id]) into v_id;
  return next lives_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])',
           p2, s1 + interval '1 hour', b.member_id),
    'Direkt im Anschluss auf einem anderen Platz geht');
  return next lives_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])',
           p2, s1 - interval '1 hour', b.member_id),
    'Direkt davor auf einem anderen Platz geht');

  perform public.cancel_booking(v_id);
  return next lives_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])', p2, s1, c.member_id),
    'Nach dem Storno ist die Zeit wieder frei');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Besetzung aendern
-- ---------------------------------------------------------------------------

create or replace function tests.test_doppelbelegung_beim_mitspieler_aendern() returns setof text
language plpgsql as $f$
declare a record; b record; c record; d record;
        p1 uuid := tests.fixture_court(); p2 uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(3, 17); v_id uuid; n1 text; b_name text;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  select * into d from tests.fixture_user() limit 1;
  n1 := tests.platzname(p1);
  select first_name || ' ' || last_name into b_name from public.members where id = b.member_id;

  perform tests.act_as(a.auth_id);
  perform public.create_booking(p1, s1, 'einzel', array[b.member_id]);
  perform set_config('role', 'postgres', true);

  perform tests.act_as(c.auth_id);
  select public.create_booking(p2, s1, 'einzel', array[d.member_id]) into v_id;
  return next throws_ok(
    format('select public.update_booking_players(%L, array[%L]::uuid[])', v_id, b.member_id),
    '23514', format('%s spielt zu dieser Zeit schon auf %s.', b_name, n1),
    'Ein Mitspieler, der schon woanders spielt, laesst sich nicht nachtragen');
  return next lives_ok(
    format('select public.update_booking_players(%L, array[%L]::uuid[])', v_id, d.member_id),
    'Die eigene Besetzung erneut speichern kollidiert nicht mit sich selbst');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Mitspielen in offenen Spielen
-- ---------------------------------------------------------------------------

create or replace function tests.test_doppelbelegung_beim_mitspielen() returns setof text
language plpgsql as $f$
declare a record; b record; c record; d record;
        p1 uuid := tests.fixture_court(); p2 uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(3, 18); v_id uuid; n1 text;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  select * into d from tests.fixture_user() limit 1;
  n1 := tests.platzname(p1);

  perform tests.act_as(a.auth_id);
  perform public.create_booking(p1, s1, 'einzel', array[b.member_id]);
  perform set_config('role', 'postgres', true);

  perform tests.act_as(c.auth_id);
  select public.create_booking(p2, s1, 'doppel', array[d.member_id], '{}'::text[], true) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(b.auth_id);
  return next throws_ok(format('select public.join_booking(%L)', v_id),
    '23514', format('Du spielst zu dieser Zeit schon auf %s.', n1),
    'Wer schon woanders spielt, kann nicht mitspielen');
  perform set_config('role', 'postgres', true);

  return next is(
    (select count(*)::integer from public.booking_players
      where booking_id = v_id and member_id = b.member_id),
    0, 'Er steht danach nicht in der Besetzung');
end; $f$;

-- ---------------------------------------------------------------------------
-- Verschieben
-- ---------------------------------------------------------------------------

create or replace function tests.test_doppelbelegung_beim_verschieben() returns setof text
language plpgsql as $f$
declare a record; b record;
        p1 uuid := tests.fixture_court(); p2 uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(4, 10); v_spaeter uuid; n1 text; a_name text;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  n1 := tests.platzname(p1);
  select first_name || ' ' || last_name into a_name from public.members where id = a.member_id;

  perform tests.act_as(a.auth_id);
  perform public.create_booking(p1, s1, 'einzel', array[b.member_id]);
  select public.create_booking(p2, s1 + interval '1 hour', 'einzel', array[b.member_id]) into v_spaeter;
  perform set_config('role', 'postgres', true);

  -- Eine Verschiebe-RPC gibt es nicht, und Clients duerfen bookings nicht
  -- direkt aendern. Verschoben wird also nur serverseitig - genau dort greift
  -- der Trigger. Ohne angemeldetes Mitglied nennt die Meldung den Namen.
  perform set_config('request.jwt.claims', '', true);
  return next throws_ok(
    format($q$update public.bookings
                set slot = tstzrange(%L::timestamptz, %L::timestamptz, '[)')
              where id = %L$q$,
           s1 + interval '30 minutes', s1 + interval '90 minutes', v_spaeter),
    '23514', format('%s spielt zu dieser Zeit schon auf %s.', a_name, n1),
    'Verschieben in eine belegte Zeit wird abgewiesen');
  return next lives_ok(
    format($q$update public.bookings
                set slot = tstzrange(%L::timestamptz, %L::timestamptz, '[)')
              where id = %L$q$,
           s1 + interval '90 minutes', s1 + interval '150 minutes', v_spaeter),
    'Verschieben, das sich nur mit der eigenen alten Lage ueberschneidet, geht');
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer die Doppelbelegung pro Person sind eingespielt');
select * from extensions.finish();
