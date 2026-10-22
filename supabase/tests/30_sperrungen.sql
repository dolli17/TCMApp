-- ===========================================================================
-- Sperrungen bearbeiten (B24) und ohne Grund anlegen (B25)
--
-- Die wichtigsten Zusagen:
--
--   1. Der Grund ist freiwillig, beim Anlegen wie beim Bearbeiten. Ohne Grund
--      steht die Sperrung mit title = null da; was sie ist, sagt die
--      Kategorie (Buchungsart).
--   2. update_blocking aendert Zeit, Plaetze, Kategorie und Grund einer
--      Sperrung. Bearbeiten darf, wer sperren darf (darf_plaetze).
--   3. Nur echte Sperrungen: keine Buchung, kein Serientermin, nichts
--      Aufgehobenes. Die Kategorie muss eine Blockungsart sein.
--   4. Ueberschneidungen wie bei create_blocking: ohne p_force Abbruch mit
--      der Zahl, mit p_force verdraengen, Gastgebuehr erlassen, Betroffene
--      benachrichtigen. Die Sperrung selbst ist keine Ueberschneidung.
--
-- Fixtures aus 01_constraints.sql (fixture_court), 02_rls.sql (fixture_user,
-- act_as), 03_rpc_bookings.sql (naechster_slot) und 08_serien_aendern.sql
-- (fixture_serie).
-- ===========================================================================

/** Eine Sperrung auf einem Platz, angelegt wie aus der Oberflaeche. */
create or replace function tests.fixture_sperre(
  p_court uuid, p_von timestamptz, p_bis timestamptz, p_title text default 'Regen')
returns uuid language plpgsql as $f$
declare v_type uuid; v_id uuid;
begin
  select id into v_type from public.booking_types where code = 'platzpflege';
  insert into public.bookings (court_id, slot, kind, booking_type_id, title)
  values (p_court, tstzrange(p_von, p_bis, '[)'), 'blocking', v_type, p_title)
  returning id into v_id;
  return v_id;
end; $f$;

-- ---------------------------------------------------------------------------
-- B25: Grund freiwillig
-- ---------------------------------------------------------------------------

create or replace function tests.test_sperre_ohne_grund()
returns setof text language plpgsql as $f$
declare adm record; v_court uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(2, 9);
        v_bis timestamptz;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_bis := s1 + interval '1 hour';

  perform tests.act_as(adm.auth_id);
  return next lives_ok(
    format('select * from public.create_blocking(array[%L]::uuid[], %L, %L, ''platzpflege'', '''')',
           v_court, s1, v_bis),
    'Sperren geht ohne Grund (leerer Text)');
  return next lives_ok(
    format('select * from public.create_blocking(array[%L]::uuid[], %L, %L, ''verbandsspiel'', null)',
           v_court, v_bis, v_bis + interval '1 hour'),
    'Sperren geht ohne Grund (null)');
  perform set_config('role', 'postgres', true);

  return next is(
    (select count(*)::integer from public.bookings
      where court_id = v_court and kind = 'blocking' and status = 'active' and title is null),
    2, 'Ohne Grund steht kein Titel an der Sperrung');
end; $f$;

create or replace function tests.test_sperre_ohne_grund_verdraengt_mit_kategorie()
returns setof text language plpgsql as $f$
declare a record; adm record; v_court uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(2, 13);
        v_id uuid;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;

  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', '{}'::uuid[], array['Gast']) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  perform public.create_blocking(array[v_court]::uuid[], s1, s1 + interval '1 hour',
                                 'verbandsspiel', null, true);
  perform set_config('role', 'postgres', true);

  return next is(
    (select cancellation_reason from public.bookings where id = v_id),
    'Platzsperrung: Verbandsspiel',
    'Ohne Grund nennt der Storno die Kategorie');
  return next ok(
    (select body like '%Verbandsspiel%' from public.notifications
      where member_id = a.member_id and kind = 'booking_displaced'),
    'Die Nachricht an den Bucher nennt die Kategorie');
end; $f$;

-- ---------------------------------------------------------------------------
-- B24: update_blocking
-- ---------------------------------------------------------------------------

create or replace function tests.test_update_blocking_aendert_alles()
returns setof text language plpgsql as $f$
declare adm record; c1 uuid := tests.fixture_court(); c2 uuid := tests.fixture_court();
        c3 uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(3, 10);
        v_sperre uuid; v_created integer; v_displaced integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_sperre := tests.fixture_sperre(c1, s1, s1 + interval '1 hour');

  perform tests.act_as(adm.auth_id);
  select u.created_count, u.displaced_count into v_created, v_displaced
  from public.update_blocking(v_sperre, array[c2, c3]::uuid[], s1 + interval '1 hour',
                              s1 + interval '3 hours', 'verbandsspiel', '  Heimspiel  ') u;
  perform set_config('role', 'postgres', true);

  return next is(v_created, 1, 'Fuer den zweiten Platz entsteht eine weitere Sperrung');
  return next is(v_displaced, 0, 'Nichts verdraengt');
  return next is(
    (select court_id from public.bookings where id = v_sperre), c2,
    'Die Sperrung ist auf den ersten gewaehlten Platz gewandert');
  return next is(
    (select slot from public.bookings where id = v_sperre),
    tstzrange(s1 + interval '1 hour', s1 + interval '3 hours', '[)'),
    'Die neue Zeit gilt');
  return next is(
    (select bt.code from public.bookings b join public.booking_types bt on bt.id = b.booking_type_id
      where b.id = v_sperre),
    'verbandsspiel', 'Die neue Kategorie gilt');
  return next is((select title from public.bookings where id = v_sperre), 'Heimspiel',
    'Der neue Grund gilt, ohne Leerzeichen');
  return next is(
    (select count(*)::integer from public.bookings
      where court_id = c3 and kind = 'blocking' and status = 'active' and title = 'Heimspiel'
        and slot = tstzrange(s1 + interval '1 hour', s1 + interval '3 hours', '[)')),
    1, 'Auf dem zweiten Platz liegt dieselbe Sperrung');
  return next is(
    (select count(*)::integer from public.bookings where court_id = c1 and status = 'active'),
    0, 'Der alte Platz ist frei');
end; $f$;

create or replace function tests.test_update_blocking_behaelt_eigenen_platz()
returns setof text language plpgsql as $f$
declare adm record; c1 uuid := tests.fixture_court(); c2 uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(3, 14);
        v_sperre uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_sperre := tests.fixture_sperre(c2, s1, s1 + interval '1 hour');

  perform tests.act_as(adm.auth_id);
  perform public.update_blocking(v_sperre, array[c1, c2]::uuid[], s1,
                                 s1 + interval '1 hour', 'platzpflege', 'Regen');
  perform set_config('role', 'postgres', true);

  return next is((select court_id from public.bookings where id = v_sperre), c2,
    'Liegt der eigene Platz in der Auswahl, bleibt die Sperrung dort');
  return next is(
    (select count(*)::integer from public.bookings
      where court_id = c1 and kind = 'blocking' and status = 'active'),
    1, 'Der andere Platz kommt dazu');
end; $f$;

create or replace function tests.test_update_blocking_grund_freiwillig()
returns setof text language plpgsql as $f$
declare adm record; v_court uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(3, 9);
        v_sperre uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_sperre := tests.fixture_sperre(v_court, s1, s1 + interval '1 hour');

  perform tests.act_as(adm.auth_id);
  return next lives_ok(
    format('select * from public.update_blocking(%L, array[%L]::uuid[], %L, %L, ''platzpflege'', ''  '')',
           v_sperre, v_court, s1, s1 + interval '1 hour'),
    'Den Grund entfernen geht');
  perform set_config('role', 'postgres', true);
  return next is((select title from public.bookings where id = v_sperre), null,
    'Ohne Grund steht kein Titel mehr da');

  perform tests.act_as(adm.auth_id);
  return next lives_ok(
    format('select * from public.update_blocking(%L, array[%L]::uuid[], %L, %L, ''platzpflege'', null)',
           v_sperre, v_court, s1, s1 + interval '1 hour'),
    'Auch null als Grund geht');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_update_blocking_rechte()
returns setof text language plpgsql as $f$
declare a record; p record; v record; v_court uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(3, 11);
        v_sperre uuid; v_sql text;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into v from tests.fixture_user('board', 'Vorstand') limit 1;
  v_sperre := tests.fixture_sperre(v_court, s1, s1 + interval '1 hour');
  v_sql := format(
    'select * from public.update_blocking(%L, array[%L]::uuid[], %L, %L, ''platzpflege'', ''Neu'')',
    v_sperre, v_court, s1, s1 + interval '2 hours');

  perform tests.act_as(a.auth_id);
  return next throws_ok(v_sql, '42501', null, 'Ein Mitglied darf keine Sperrung bearbeiten');
  perform set_config('role', 'postgres', true);
  return next is((select title from public.bookings where id = v_sperre), 'Regen',
    'Die Sperrung bleibt unveraendert');

  perform tests.act_as(p.auth_id);
  return next lives_ok(v_sql, 'Der Platzwart darf eine Sperrung bearbeiten');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(v.auth_id);
  return next lives_ok(v_sql, 'Der Vorstand darf eine Sperrung bearbeiten');
  perform set_config('role', 'postgres', true);

  -- Mit dem Austritt endet auch dieses Recht (private.hat_zugang).
  update public.members set login_disabled_at = now() where id = p.member_id;
  perform tests.act_as(p.auth_id);
  return next throws_ok(v_sql, '42501', null, 'Ein gesperrter Platzwart darf nicht mehr bearbeiten');
  perform set_config('role', 'postgres', true);

  perform tests.act_as_anon();
  return next throws_ok(v_sql, '42501', null, 'Anonym gibt es die Funktion nicht');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_update_blocking_nur_sperrungen()
returns setof text language plpgsql as $f$
declare a record; adm record; s record; v_court uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(3, 12);
        v_buchung uuid; v_sperre uuid; v_alt uuid;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into s from tests.fixture_serie(v_court);

  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', '{}'::uuid[], array['Gast']) into v_buchung;
  perform set_config('role', 'postgres', true);

  v_sperre := tests.fixture_sperre(v_court, s1 + interval '2 hours', s1 + interval '3 hours');
  v_alt := tests.fixture_sperre(v_court, s1 + interval '4 hours', s1 + interval '5 hours');
  update public.bookings set status = 'cancelled', cancelled_at = now() where id = v_alt;

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select * from public.update_blocking(%L, array[%L]::uuid[], %L, %L, ''platzpflege'', ''X'')',
           v_buchung, v_court, s1, s1 + interval '1 hour'),
    '22023', null, 'Eine normale Buchung ist keine Sperrung');
  return next throws_ok(
    format('select * from public.update_blocking(%L, array[%L]::uuid[], %L, %L, ''training'', ''X'')',
           s.neu, v_court, s1 + interval '6 hours', s1 + interval '7 hours'),
    '22023', null, 'Serientermine aendert man ueber die Serie');
  return next throws_ok(
    format('select * from public.update_blocking(%L, array[%L]::uuid[], %L, %L, ''platzpflege'', ''X'')',
           v_alt, v_court, s1 + interval '4 hours', s1 + interval '5 hours'),
    '22023', null, 'Eine aufgehobene Sperrung laesst sich nicht bearbeiten');
  return next throws_ok(
    format('select * from public.update_blocking(%L, array[%L]::uuid[], %L, %L, ''einzel'', ''X'')',
           v_sperre, v_court, s1 + interval '2 hours', s1 + interval '3 hours'),
    '22023', null, 'Die Kategorie muss eine Blockungsart sein');
  return next throws_ok(
    format('select * from public.update_blocking(%L, array[%L]::uuid[], %L, %L, ''platzpflege'', ''X'')',
           v_sperre, v_court, s1 + interval '3 hours', s1 + interval '2 hours'),
    '22023', null, 'Das Ende muss nach dem Beginn liegen');
  return next throws_ok(
    format('select * from public.update_blocking(%L, ''{}''::uuid[], %L, %L, ''platzpflege'', ''X'')',
           v_sperre, s1 + interval '2 hours', s1 + interval '3 hours'),
    '22023', null, 'Mindestens ein Platz');
  return next throws_ok(
    format('select * from public.update_blocking(%L, array[%L]::uuid[], %L, %L, ''platzpflege'', ''X'')',
           gen_random_uuid(), v_court, s1, s1 + interval '1 hour'),
    'P0002', null, 'Eine unbekannte Sperrung gibt es nicht');
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.bookings where id = v_buchung), 'active',
    'Die Buchung bleibt unberuehrt');
  return next is((select kind::text from public.bookings where id = v_buchung), 'booking',
    'und bleibt eine Buchung');
end; $f$;

create or replace function tests.test_update_blocking_ueberschneidung()
returns setof text language plpgsql as $f$
declare a record; b record; adm record; c1 uuid := tests.fixture_court(); c2 uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(4, 10);
        v_sperre uuid; v_buchung uuid; v_created integer; v_displaced integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;
  v_sperre := tests.fixture_sperre(c1, s1, s1 + interval '1 hour');

  -- Auf dem zweiten Platz spielt jemand mit Mitspieler und Gast eine Stunde spaeter.
  perform tests.act_as(a.auth_id);
  select public.create_booking(c2, s1 + interval '1 hour', 'doppel',
                               array[b.member_id], array['Gast']) into v_buchung;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  return next lives_ok(
    format('select * from public.update_blocking(%L, array[%L]::uuid[], %L, %L, ''platzpflege'', ''Regen'')',
           v_sperre, c1, s1 - interval '30 minutes', s1 + interval '30 minutes'),
    'Die Sperrung ueberschneidet sich nicht mit sich selbst');
  return next throws_ok(
    format('select * from public.update_blocking(%L, array[%L, %L]::uuid[], %L, %L, ''platzpflege'', ''Regen'')',
           v_sperre, c1, c2, s1, s1 + interval '2 hours'),
    '23P01', '1 Buchungen liegen in diesem Zeitraum. Bestätige das Verdrängen.',
    'Ohne Bestaetigung wird nicht verdraengt');
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.bookings where id = v_buchung), 'active',
    'Nach dem Abbruch steht die Buchung noch');
  return next is((select slot from public.bookings where id = v_sperre),
    tstzrange(s1 - interval '30 minutes', s1 + interval '30 minutes', '[)'),
    'und die Sperrung ist so, wie sie vorher war');

  perform tests.act_as(adm.auth_id);
  select u.created_count, u.displaced_count into v_created, v_displaced
  from public.update_blocking(v_sperre, array[c1, c2]::uuid[], s1, s1 + interval '2 hours',
                              'platzpflege', 'Regen', true) u;
  perform set_config('role', 'postgres', true);

  return next is(v_displaced, 1, 'Mit Bestaetigung wird verdraengt');
  return next is(v_created, 1, 'und der zweite Platz gesperrt');
  return next is((select status::text from public.bookings where id = v_buchung), 'cancelled',
    'Die Buchung ist storniert');
  return next is((select cancellation_reason from public.bookings where id = v_buchung),
    'Platzsperrung: Regen', 'mit dem Grund der Sperrung');
  return next is(
    (select status::text from public.charges where booking_id = v_buchung and kind = 'guest'),
    'waived', 'Die Gastgebuehr wird erlassen');
  return next is(
    (select count(*)::integer from public.notifications
      where kind = 'booking_displaced' and member_id in (a.member_id, b.member_id)),
    2, 'Bucher und Mitspieler werden benachrichtigt');
end; $f$;

select extensions.plan(1);
select extensions.pass('Tests fuer das Bearbeiten von Sperrungen sind eingespielt');
