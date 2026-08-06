-- ===========================================================================
-- Buchungsregeln ueber die RPC
--
-- Diese Tests pruefen das Regelwerk so, wie es die App benutzt: als
-- angemeldetes Mitglied ueber create_booking. Da nach dem Rollenwechsel kein
-- Zugriff mehr auf das Schema tests besteht, werden alle Zeitpunkte vorher in
-- Variablen berechnet.
-- ===========================================================================

create or replace function tests.naechster_slot(
  p_tage integer default 2, p_stunde integer default 10, p_minute integer default 0)
returns timestamptz language sql stable as $f$
  select ((date_trunc('day', now() at time zone 'Europe/Berlin')::date + p_tage)
          + make_time(p_stunde, p_minute, 0)) at time zone 'Europe/Berlin';
$f$;

/**
 * Kontingent voruebergehend setzen.
 *
 * Im Betrieb steht der Wert auf 0, also unbegrenzt. Die Regel bleibt trotzdem
 * im Code und muss weiter geprueft werden - sonst faellt sie unbemerkt aus,
 * falls der Vorstand sie in einem knappen Sommer wieder einschaltet.
 */
create or replace function tests.setze_kontingent(p_wert integer)
returns void language sql as $f$
  update public.settings set value = to_jsonb(p_wert) where key = 'booking.max_open_bookings';
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
  perform tests.setze_kontingent(2);

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
  perform tests.setze_kontingent(0);
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
  perform tests.setze_kontingent(2);
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
  perform tests.setze_kontingent(0);
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

-- ---------------------------------------------------------------------------
-- Kontingent abgeschaltet
--
-- 0 bedeutet unbegrenzt. Der Test haelt fest, dass die Regel dann wirklich
-- nicht mehr greift - und nicht etwa "0 offene Buchungen erlaubt" bedeutet.
-- ---------------------------------------------------------------------------
create or replace function tests.test_rpc_kontingent_null_ist_unbegrenzt() returns setof text language plpgsql as $f$
declare
  a record; b record;
  v_c1 uuid := tests.fixture_court(); v_c2 uuid := tests.fixture_court();
  v_c3 uuid := tests.fixture_court(); v_c4 uuid := tests.fixture_court();
  v_c5 uuid := tests.fixture_court();
  s1 timestamptz := tests.naechster_slot(1, 9);
  s2 timestamptz := tests.naechster_slot(2, 9);
  s3 timestamptz := tests.naechster_slot(3, 9);
  s4 timestamptz := tests.naechster_slot(4, 9);
  s5 timestamptz := tests.naechster_slot(5, 9);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.setze_kontingent(0);
  perform tests.act_as(a.auth_id);

  perform public.create_booking(v_c1, s1, 'einzel', array[b.member_id]);
  perform public.create_booking(v_c2, s2, 'einzel', array[b.member_id]);
  return next lives_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])',
           v_c3, s3, b.member_id),
    'Dritte Buchung wird bei Kontingent 0 angenommen');
  return next lives_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])',
           v_c4, s4, b.member_id),
    'Vierte Buchung ebenso');
  return next lives_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])',
           v_c5, s5, b.member_id),
    'Fuenfte Buchung ebenso - auch ueber den Mitspieler greift nichts mehr');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Startzeiten: :00 und :30 ja, alles andere nein
-- ---------------------------------------------------------------------------
create or replace function tests.test_rpc_halbe_stunde_erlaubt() returns setof text language plpgsql as $f$
declare a record; b record; v_court uuid := tests.fixture_court();
        s_halb  timestamptz := tests.naechster_slot(2, 18, 30);
        s_krumm timestamptz := tests.naechster_slot(3, 18, 15);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  return next lives_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])',
           v_court, s_halb, b.member_id),
    'Start um 18:30 wird angenommen');
  return next throws_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])',
           v_court, s_krumm, b.member_id),
    '22023', null, 'Start um 18:15 wird abgelehnt');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_rpc_buchung_dauert_sechzig_minuten() returns setof text language plpgsql as $f$
declare a record; b record; c record; d record;
        v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 13);
        v_minuten integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  select * into d from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  -- Das Doppel verlangt vier Spieler; frueher dauerte es 90 Minuten.
  select public.create_booking(
    v_court, s1, 'doppel', array[b.member_id, c.member_id, d.member_id]) into v_id;
  perform set_config('role', 'postgres', true);
  select extract(epoch from (upper(slot) - lower(slot)))::integer / 60 into v_minuten
  from public.bookings where id = v_id;
  return next is(v_minuten, 60, 'Auch das Doppel dauert 60 Minuten');
end; $f$;

-- ---------------------------------------------------------------------------
-- Mitspieler tauschen
-- ---------------------------------------------------------------------------
create or replace function tests.test_rpc_mitspieler_tauschen() returns setof text language plpgsql as $f$
declare a record; b record; c record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 15); v_count integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', array[b.member_id]) into v_id;
  perform public.update_booking_players(v_id, array[c.member_id]);
  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_count
  from public.booking_players where booking_id = v_id and member_id = c.member_id;
  return next is(v_count, 1, 'Der neue Mitspieler ist eingetragen');

  select count(*)::integer into v_count
  from public.booking_players where booking_id = v_id and member_id = b.member_id;
  return next is(v_count, 0, 'Der alte Mitspieler ist ausgetragen');
end; $f$;

create or replace function tests.test_rpc_mitspieler_tauschen_pflicht() returns setof text language plpgsql as $f$
declare a record; b record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 19);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', array[b.member_id]) into v_id;
  return next throws_ok(
    format('select public.update_booking_players(%L, ''{}''::uuid[])', v_id),
    '22023', null, 'Der letzte Mitspieler kann nicht einfach entfernt werden');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_rpc_fremder_tausch_verboten() returns setof text language plpgsql as $f$
declare a record; b record; c record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 20);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', array[b.member_id]) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(c.auth_id);
  return next throws_ok(
    format('select public.update_booking_players(%L, array[%L]::uuid[])', v_id, c.member_id),
    '42501', null, 'Ein Fremder kann die Mitspieler nicht austauschen');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Admins duerfen jede Buchung anfassen
-- ---------------------------------------------------------------------------
create or replace function tests.test_rpc_admin_darf_fremde_buchung() returns setof text language plpgsql as $f$
declare a record; b record; adm record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(4, 16); v_status text;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;

  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', array[b.member_id]) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  return next lives_ok(
    format('select public.update_booking_players(%L, array[%L]::uuid[])', v_id, adm.member_id),
    'Admin darf die Mitspieler einer fremden Buchung tauschen');
  return next lives_ok(
    format('select public.cancel_booking(%L, ''Platzsperrung'')', v_id),
    'Admin darf eine fremde Buchung stornieren');
  perform set_config('role', 'postgres', true);

  select status::text into v_status from public.bookings where id = v_id;
  return next is(v_status, 'cancelled', 'Die Buchung steht danach auf storniert');
end; $f$;

-- ---------------------------------------------------------------------------
-- Serien bleiben Admin-Sache
-- ---------------------------------------------------------------------------
create or replace function tests.test_rpc_serie_nur_admin() returns setof text language plpgsql as $f$
declare a record; v_court uuid := tests.fixture_court();
        v_von date := (now() at time zone 'Europe/Berlin')::date + 1;
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format('select * from public.create_series(%L, ''training'', 2, ''18:30'', ''20:00'', %L, %L, ''Test'')',
           v_court, v_von, v_von + 7),
    '42501', null, 'Ein normales Mitglied kann keine Serie anlegen');
  perform set_config('role', 'postgres', true);
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Der eine Test hier belegt, dass die Definitionen selbst
-- fehlerfrei eingespielt wurden - ohne Plan haelt pg_prove die Datei sonst
-- fuer kaputt.
select extensions.plan(1);
select extensions.pass('Buchungs-RPC-Tests sind eingespielt');
select * from extensions.finish();
