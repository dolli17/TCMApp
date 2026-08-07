-- ===========================================================================
-- Meine Buchungen, Austragen und Benachrichtigungen
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
--
-- Merke: nach tests.act_as() besteht kein Zugriff mehr auf das Schema tests.
-- Alle Helferaufrufe und Zeitberechnungen muessen vorher passieren.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- my_bookings
-- ---------------------------------------------------------------------------

create or replace function tests.test_my_bookings_zeigt_eigene_und_fremde()
returns setof text language plpgsql as $f$
declare a record; b record; c record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 8);
        v_anzahl integer; v_bucher boolean;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', array[b.member_id]) into v_id;

  select count(*)::integer into v_anzahl from public.my_bookings() m where m.booking_id = v_id;
  return next is(v_anzahl, 1, 'Der Bucher findet seine Buchung');
  select m.bin_bucher into v_bucher from public.my_bookings() m where m.booking_id = v_id;
  return next is(v_bucher, true, 'und ist darin als Bucher gekennzeichnet');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(b.auth_id);
  select count(*)::integer into v_anzahl from public.my_bookings() m where m.booking_id = v_id;
  return next is(v_anzahl, 1, 'Der Mitspieler findet dieselbe Buchung');
  select m.bin_bucher into v_bucher from public.my_bookings() m where m.booking_id = v_id;
  return next is(v_bucher, false, 'aber nicht als Bucher');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(c.auth_id);
  select count(*)::integer into v_anzahl from public.my_bookings() m where m.booking_id = v_id;
  return next is(v_anzahl, 0, 'Ein Unbeteiligter sieht sie nicht in seiner Liste');
  perform set_config('role', 'postgres', true);
end; $f$;

/**
 * Stornierte Buchungen verschwinden aus der Liste.
 *
 * Ohne diese Bedingung stuende eine abgesagte Stunde weiter unter "Das steht
 * an" - und jemand faende sich am Platz wieder, den es nicht mehr gibt.
 */
create or replace function tests.test_my_bookings_ohne_stornierte()
returns setof text language plpgsql as $f$
declare a record; b record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(3, 8); v_anzahl integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', array[b.member_id]) into v_id;
  perform public.cancel_booking(v_id);
  select count(*)::integer into v_anzahl from public.my_bookings() m where m.booking_id = v_id;
  return next is(v_anzahl, 0, 'Eine stornierte Buchung steht nicht mehr in der Liste');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- leave_booking
-- ---------------------------------------------------------------------------

create or replace function tests.test_leave_booking_mitspieler_traegt_sich_aus()
returns setof text language plpgsql as $f$
declare a record; b record; c record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 9); v_anzahl integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  -- Doppel mit drei Spielern: einer darf gehen, dann sind es noch drei
  -- inklusive Bucher... also genau die Untergrenze. Deshalb hier vier.
  select public.create_booking(v_court, s1, 'doppel',
                               array[b.member_id, c.member_id]) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(c.auth_id);
  return next throws_ok(
    format('select public.leave_booking(%L)', v_id),
    '23514', 'Ohne dich waeren es zu wenige Spieler. Bitte sag dem Bucher Bescheid.',
    'Wer die Untergrenze reissen wuerde, kommt nicht raus');
  perform set_config('role', 'postgres', true);

  -- Ein vierter Spieler macht den Weg frei.
  perform tests.act_as(a.auth_id);
  perform public.update_booking_players(v_id, array[b.member_id, c.member_id], array['Gast']);
  perform set_config('role', 'postgres', true);

  perform tests.act_as(c.auth_id);
  return next lives_ok(format('select public.leave_booking(%L)', v_id),
    'Mit genug Spielern darf sich ein Mitspieler austragen');
  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_anzahl
  from public.booking_players where booking_id = v_id and member_id = c.member_id;
  return next is(v_anzahl, 0, 'Er steht danach nicht mehr in der Besetzung');

  select count(*)::integer into v_anzahl
  from public.notifications
  where member_id = a.member_id and kind = 'player_left';
  return next is(v_anzahl, 1, 'Der Bucher wird benachrichtigt');
end; $f$;

create or replace function tests.test_leave_booking_bucher_darf_nicht()
returns setof text language plpgsql as $f$
declare a record; b record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 13);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', array[b.member_id]) into v_id;
  return next throws_ok(
    format('select public.leave_booking(%L)', v_id),
    '22023', null, 'Der Bucher kann sich nicht austragen, er storniert');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_leave_booking_nur_wer_dabei_ist()
returns setof text language plpgsql as $f$
declare a record; b record; c record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 14);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', array[b.member_id]) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(c.auth_id);
  return next throws_ok(
    format('select public.leave_booking(%L)', v_id),
    '22023', null, 'Wer gar nicht eingetragen ist, kann sich nicht austragen');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Benachrichtigungen
-- ---------------------------------------------------------------------------

create or replace function tests.test_benachrichtigung_beim_eintragen()
returns setof text language plpgsql as $f$
declare a record; b record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(4, 8); v_anzahl integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', array[b.member_id]) into v_id;
  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_anzahl
  from public.notifications where member_id = b.member_id and kind = 'booking_added';
  return next is(v_anzahl, 1, 'Der eingetragene Mitspieler wird benachrichtigt');

  select count(*)::integer into v_anzahl
  from public.notifications where member_id = a.member_id;
  return next is(v_anzahl, 0, 'Der Bucher bekommt keine Nachricht ueber die eigene Tat');
end; $f$;

create or replace function tests.test_benachrichtigung_beim_tausch()
returns setof text language plpgsql as $f$
declare a record; b record; c record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(4, 9); v_anzahl integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', array[b.member_id]) into v_id;
  perform public.update_booking_players(v_id, array[c.member_id]);
  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_anzahl
  from public.notifications where member_id = b.member_id and kind = 'booking_removed';
  return next is(v_anzahl, 1, 'Wer ausgetauscht wird, erfaehrt es');

  select count(*)::integer into v_anzahl
  from public.notifications where member_id = c.member_id and kind = 'booking_added';
  return next is(v_anzahl, 1, 'Wer neu dazukommt, ebenso');
end; $f$;

create or replace function tests.test_benachrichtigung_beim_storno()
returns setof text language plpgsql as $f$
declare a record; b record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(4, 10); v_anzahl integer; v_text text;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', array[b.member_id]) into v_id;
  perform public.cancel_booking(v_id, 'Regen');
  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_anzahl
  from public.notifications where member_id = b.member_id and kind = 'booking_cancelled';
  return next is(v_anzahl, 1, 'Der Mitspieler erfaehrt vom Storno');

  select body into v_text
  from public.notifications where member_id = b.member_id and kind = 'booking_cancelled';
  return next matches(v_text, 'Regen', 'Der genannte Grund steht in der Nachricht');
end; $f$;

/**
 * Fremde Benachrichtigungen bleiben fremd.
 *
 * my_notifications laeuft als security definer und umgeht damit RLS - die
 * Einschraenkung auf das eigene Mitglied steckt in der Funktion selbst. Genau
 * deshalb muss sie geprueft werden.
 */
create or replace function tests.test_my_notifications_nur_eigene()
returns setof text language plpgsql as $f$
declare a record; b record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(4, 11); v_anzahl integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', array[b.member_id]) into v_id;

  select count(*)::integer into v_anzahl from public.my_notifications(50);
  return next is(v_anzahl, 0, 'Der Bucher sieht keine fremde Benachrichtigung');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(b.auth_id);
  select count(*)::integer into v_anzahl from public.my_notifications(50);
  return next is(v_anzahl, 1, 'Der Mitspieler sieht seine eigene');
  return next is(public.mark_notifications_read(null), 1, 'Als gelesen markieren zaehlt sie');
  return next is(public.mark_notifications_read(null), 0, 'Ein zweiter Aufruf tut nichts mehr');
  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_anzahl
  from public.notifications where member_id = b.member_id and read_at is not null;
  return next is(v_anzahl, 1, 'Das Lesedatum steht in der Tabelle');
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer meine Buchungen sind eingespielt');
select * from extensions.finish();
