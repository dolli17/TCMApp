-- ===========================================================================
-- Buchungsregeln ueber die RPC
--
-- Diese Tests pruefen das Regelwerk so, wie es die App benutzt: als
-- angemeldetes Mitglied ueber create_booking. Da nach dem Rollenwechsel kein
-- Zugriff mehr auf das Schema tests besteht, werden alle Zeitpunkte vorher in
-- Variablen berechnet.
-- ===========================================================================

create or replace function tests.naechster_slot(p_tage integer default 2, p_stunde integer default 10)
returns timestamptz language sql stable as $f$
  select ((date_trunc('day', now() at time zone 'Europe/Berlin')::date + p_tage)
          + make_time(p_stunde, 0, 0)) at time zone 'Europe/Berlin';
$f$;

create or replace function tests.test_rpc_buchung_anlegen() returns setof text language plpgsql as $f$
declare a record; b record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 10);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', array[b.member_id]) into v_id;
  return next isnt(v_id, null, 'Buchung mit Mitspieler wird angelegt');
  perform set_config('role', 'postgres', true);
  return next is((select count(*)::integer from public.booking_players where booking_id = v_id), 1,
    'Mitspieler ist eingetragen');
end; $f$;

create or replace function tests.test_rpc_mitspieler_pflicht() returns setof text language plpgsql as $f$
declare a record; v_court uuid := tests.fixture_court(); s1 timestamptz := tests.naechster_slot(2, 11);
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format('select public.create_booking(%L, %L, ''einzel'')', v_court, s1),
    '22023', null, 'Buchung ohne Mitspieler wird abgelehnt');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_rpc_gast_erfuellt_mitspielerpflicht() returns setof text language plpgsql as $f$
declare a record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 12);
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', '{}'::uuid[],
                               array['Gast vom Nachbarverein']) into v_id;
  return next isnt(v_id, null, 'Ein Gast erfuellt die Mitspielerpflicht');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_rpc_vorlauf_wird_geprueft() returns setof text language plpgsql as $f$
declare a record; b record; v_court uuid := tests.fixture_court();
        s_weit timestamptz := tests.naechster_slot(30, 10);
        s_alt  timestamptz := now() - interval '1 day';
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])',
           v_court, s_weit, b.member_id),
    '22023', null, 'Buchung weiter als 7 Tage im Voraus wird abgelehnt');
  return next throws_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])',
           v_court, s_alt, b.member_id),
    '22023', null, 'Buchung in der Vergangenheit wird abgelehnt');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_rpc_oeffnungszeiten() returns setof text language plpgsql as $f$
declare a record; b record; v_court uuid := tests.fixture_court();
        s_frueh timestamptz := tests.naechster_slot(2, 6);
        s_spaet timestamptz := tests.naechster_slot(2, 21);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])',
           v_court, s_frueh, b.member_id),
    '22023', null, 'Buchung vor Oeffnungszeit wird abgelehnt');
  return next throws_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])',
           v_court, s_spaet, b.member_id),
    '22023', null, 'Buchung, die nach Schliesszeit endet, wird abgelehnt');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_rpc_zeitraster() returns setof text language plpgsql as $f$
declare a record; b record; v_court uuid := tests.fixture_court();
        s_krumm timestamptz := tests.naechster_slot(2, 10) + interval '17 minutes';
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])',
           v_court, s_krumm, b.member_id),
    '22023', null, 'Startzeit ausserhalb des 30-Minuten-Rasters wird abgelehnt');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Der zentrale Test des Regelwerks
--
-- Wuerden nur selbst angelegte Buchungen zaehlen, koennte eine Vierergruppe
-- reihum buchen und haette faktisch unbegrenzt Plaetze. Deshalb muss die
-- Mitspielerschaft auf das eigene Kontingent durchschlagen.
-- ---------------------------------------------------------------------------
create or replace function tests.test_rpc_kontingent_ueber_mitspieler() returns setof text language plpgsql as $f$
declare
  a record; b record; c record;
  v_c1 uuid := tests.fixture_court(); v_c2 uuid := tests.fixture_court();
  v_c3 uuid := tests.fixture_court();
  s1 timestamptz := tests.naechster_slot(1, 10);
  s2 timestamptz := tests.naechster_slot(2, 10);
  s3 timestamptz := tests.naechster_slot(3, 10);
  v_count integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;

  -- A bucht zweimal und traegt jeweils B als Mitspieler ein.
  perform tests.act_as(a.auth_id);
  perform public.create_booking(v_c1, s1, 'einzel', array[b.member_id]);
  perform public.create_booking(v_c2, s2, 'einzel', array[b.member_id]);
  perform set_config('role', 'postgres', true);

  select private.open_booking_count(b.member_id) into v_count;
  return next is(v_count, 2, 'Mitspielerschaft zaehlt auf das eigene Kontingent');

  -- C versucht zu buchen und traegt B ein: muss scheitern.
  perform tests.act_as(c.auth_id);
  return next throws_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])',
           v_c3, s3, b.member_id),
    '23514', null,
    'Buchung wird abgelehnt, weil der Mitspieler sein Kontingent ausgeschoepft hat');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_rpc_eigenes_kontingent() returns setof text language plpgsql as $f$
declare
  a record; b record;
  v_c1 uuid := tests.fixture_court(); v_c2 uuid := tests.fixture_court();
  v_c3 uuid := tests.fixture_court(); v_id uuid;
  s1 timestamptz := tests.naechster_slot(1, 14);
  s2 timestamptz := tests.naechster_slot(2, 14);
  s3 timestamptz := tests.naechster_slot(3, 14);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_c1, s1, 'einzel', array[b.member_id]) into v_id;
  perform public.create_booking(v_c2, s2, 'einzel', array[b.member_id]);
  return next throws_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])',
           v_c3, s3, b.member_id),
    '23514', null, 'Dritte Buchung wird abgelehnt');
  perform public.cancel_booking(v_id);
  return next lives_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])',
           v_c3, s3, b.member_id),
    'Nach dem Storno ist wieder eine Buchung moeglich');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_rpc_belegter_platz() returns setof text language plpgsql as $f$
declare a record; b record; c record; v_court uuid := tests.fixture_court();
        v_slot timestamptz := tests.naechster_slot(2, 16);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  perform public.create_booking(v_court, v_slot, 'einzel', array[b.member_id]);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(c.auth_id);
  return next throws_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])',
           v_court, v_slot, a.member_id),
    '23P01', null, 'Belegter Platz wird mit verstaendlicher Meldung abgelehnt');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_rpc_fremdes_storno_verboten() returns setof text language plpgsql as $f$
declare a record; b record; c record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 17);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', array[b.member_id]) into v_id;
  perform set_config('role', 'postgres', true);
  perform tests.act_as(c.auth_id);
  return next throws_ok(
    format('select public.cancel_booking(%L)', v_id),
    '42501', null, 'Fremde Buchung kann nicht storniert werden');
  perform set_config('role', 'postgres', true);
end; $f$;
