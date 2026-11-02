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

/**
 * Wer sich austraegt, storniert die ganze Buchung (Vereinsentscheidung vom
 * 02.11.2026). Bucher und uebrige Mitspieler erfahren in einer Nachricht, wer
 * gegangen ist; der Austragende selbst bekommt keine.
 */
create or replace function tests.test_leave_booking_storniert_die_buchung()
returns setof text language plpgsql as $f$
declare a record; b record; c record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 9); v_anzahl integer;
begin
  select * into a from tests.fixture_user(null, 'Bucherin') limit 1;
  select * into b from tests.fixture_user(null, 'Bleibt') limit 1;
  select * into c from tests.fixture_user(null, 'Geht') limit 1;
  perform tests.act_as(a.auth_id);
  -- Ein volles Doppel: auch ohne c waere die Untergrenze erreicht. Storniert
  -- wird trotzdem, die Regel haengt nicht an der Besetzung.
  select public.create_booking(v_court, s1, 'doppel',
                               array[b.member_id, c.member_id], array['Gast']) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(c.auth_id);
  return next lives_ok(format('select public.leave_booking(%L)', v_id),
    'Ein Mitspieler kann sich austragen');
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.bookings where id = v_id), 'cancelled',
    'Danach ist die Buchung storniert');
  return next is((select cancelled_by from public.bookings where id = v_id), c.member_id,
    'storniert von dem, der sich ausgetragen hat');
  return next is((select partner_wanted from public.bookings where id = v_id), false,
    'und sucht keine Mitspieler');
  return next is(
    (select status::text from public.charges where booking_id = v_id and kind = 'guest'),
    'waived', 'Die Gastgebuehr des Buchers wird erlassen');

  return next is(
    (select count(*)::integer from public.notifications
      where member_id = a.member_id and kind = 'booking_cancelled'
        and body like '% hat sich ausgetragen. Die Buchung am % ist storniert.'
        and body like '%Geht%'),
    1, 'Der Bucher erfaehrt, wer sich ausgetragen hat und dass storniert ist');
  return next is(
    (select count(*)::integer from public.notifications
      where member_id = b.member_id and kind = 'booking_cancelled' and body like '%Geht%'),
    1, 'Ebenso der uebrige Mitspieler');
  return next is(
    (select count(*)::integer from public.notifications
      where member_id in (a.member_id, b.member_id)
        and kind in ('booking_cancelled', 'player_left')),
    2, 'Je eine Nachricht, keine zusaetzliche Storno- oder Austragen-Nachricht');
  return next is(
    (select count(*)::integer from public.notifications
      where member_id = c.member_id and kind in ('booking_cancelled', 'player_left')),
    0, 'Der Austragende bekommt keine Nachricht');
end; $f$;

/**
 * Noch nicht verschickte "Du bist eingetragen" zu der Buchung sind mit dem
 * Storno hinfaellig und fallen weg; es bleibt nur die Storno-Nachricht.
 */
create or replace function tests.test_leave_booking_hebt_eintragen_auf()
returns setof text language plpgsql as $f$
declare a record; b record; c record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 10);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'doppel', array[b.member_id, c.member_id]) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(c.auth_id);
  perform public.leave_booking(v_id);
  perform set_config('role', 'postgres', true);

  return next is(
    (select count(*)::integer from public.notifications
      where booking_id = v_id and kind = 'booking_added'),
    0, 'Unverschickte Eintragen-Nachrichten zur Buchung sind weg');
  return next is(
    (select array_agg(kind order by kind) from public.notifications where member_id = b.member_id),
    array['booking_cancelled'], 'Der uebrige Mitspieler bekommt nur die Storno-Nachricht');
end; $f$;

create or replace function tests.test_leave_booking_nach_spielbeginn_verboten()
returns setof text language plpgsql as $f$
declare a record; b record; v_court uuid := tests.fixture_court(); v_id uuid;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  -- Direkt angelegt: create_booking nimmt keine laufende Stunde an.
  insert into public.bookings (court_id, member_id, slot, booking_type_id)
  values (v_court, a.member_id, tstzrange(now() - interval '10 minutes', now() + interval '50 minutes'),
          (select id from public.booking_types where code = 'einzel'))
  returning id into v_id;
  insert into public.booking_players (booking_id, member_id) values (v_id, b.member_id);

  perform tests.act_as(b.auth_id);
  return next throws_ok(
    format('select public.leave_booking(%L)', v_id),
    '23514', 'Die Spielzeit hat bereits begonnen.', 'Nach Spielbeginn kann sich niemand mehr austragen');
  perform set_config('role', 'postgres', true);
  return next is((select status::text from public.bookings where id = v_id), 'active',
    'Die Buchung bleibt dann bestehen');
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
  perform set_config('role', 'postgres', true);
  -- Die Eintragung ist schon beim Geraet angekommen. Sonst hoebe der Tausch
  -- sie still auf (Security-Audit 3.1, siehe 43_security_audit.sql).
  update public.notifications set pushed_at = now()
   where member_id = b.member_id and kind = 'booking_added';
  perform tests.act_as(a.auth_id);
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

/**
 * Der Zaehler der Glocke zaehlt nur eigene Benachrichtigungen.
 *
 * Admins sehen ueber RLS alle Zeilen in notifications. Der Zaehler darf das
 * nicht mitnehmen, sonst zeigt die Glocke eine Zahl, die Liste aber nichts.
 */
create or replace function tests.test_ungelesen_zaehler_nur_eigene()
returns setof text language plpgsql as $f$
declare adm record; b record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  insert into public.notifications (member_id, kind, title, body)
  values (b.member_id, 'booking_added', 'Eins', 'x'),
         (b.member_id, 'booking_added', 'Zwei', 'x');

  perform tests.act_as(adm.auth_id);
  return next is(public.my_unread_notification_count(), 0,
    'Der Admin zaehlt keine fremden Benachrichtigungen');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(b.auth_id);
  return next is(public.my_unread_notification_count(), 2,
    'Das Mitglied zaehlt seine eigenen');
  perform public.mark_notifications_read(null);
  return next is(public.my_unread_notification_count(), 0,
    'Nach dem Lesen steht der Zaehler auf null');
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer meine Buchungen sind eingespielt');
select * from extensions.finish();
