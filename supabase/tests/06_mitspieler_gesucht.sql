-- ===========================================================================
-- Mitspieler gesucht und die Gastgebuehr
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
--
-- Merke: nach tests.act_as() besteht kein Zugriff mehr auf das Schema tests.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- join_booking
-- ---------------------------------------------------------------------------

create or replace function tests.test_join_booking_traegt_ein_und_meldet()
returns setof text language plpgsql as $f$
declare a record; b record; c record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 17); v_anzahl integer; v_offen boolean;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  -- Doppel zu zweit: unterbesetzt, aber erlaubt, weil Mitspieler gesucht
  -- werden. Genau dafuer ist das Feld da.
  select public.create_booking(v_court, s1, 'doppel', array[c.member_id],
                               '{}'::text[], true) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(b.auth_id);
  return next lives_ok(format('select public.join_booking(%L)', v_id),
    'Ein anderes Mitglied kann beitreten');
  return next throws_ok(format('select public.join_booking(%L)', v_id),
    '22023', 'Du bist schon dabei.', 'Ein zweites Mal geht nicht');
  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_anzahl
  from public.booking_players where booking_id = v_id and member_id = b.member_id;
  return next is(v_anzahl, 1, 'Er steht danach in der Besetzung');

  select partner_wanted into v_offen from public.bookings where id = v_id;
  return next is(v_offen, true, 'Mit drei von vier Spielern bleibt die Buchung offen');

  select count(*)::integer into v_anzahl
  from public.notifications where member_id = a.member_id and kind = 'player_joined';
  return next is(v_anzahl, 1, 'Der Bucher wird benachrichtigt');
end; $f$;

create or replace function tests.test_join_booking_nur_wenn_ausgeschrieben()
returns setof text language plpgsql as $f$
declare a record; b record; c record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 18);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', array[b.member_id]) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(c.auth_id);
  return next throws_ok(format('select public.join_booking(%L)', v_id),
    '23514', 'Fuer diese Buchung werden keine Mitspieler gesucht.',
    'Ohne Ausschreibung kommt niemand in eine fremde Buchung');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_join_booking_voll_wird_abgewiesen()
returns setof text language plpgsql as $f$
declare a record; b record; c record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 19);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', '{}'::uuid[], '{}'::text[], true) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(b.auth_id);
  perform public.join_booking(v_id);
  perform set_config('role', 'postgres', true);

  return next is(
    (select partner_wanted from public.bookings where id = v_id), false,
    'Die volle Buchung sucht von selbst keine Mitspieler mehr');

  -- Jetzt ist das Einzel mit zwei Spielern voll; partner_wanted steht auf
  -- false, deshalb faellt der Dritte schon an dieser Huerde.
  perform tests.act_as(c.auth_id);
  return next throws_ok(format('select public.join_booking(%L)', v_id),
    '23514', null, 'In eine volle Buchung kommt niemand mehr');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_set_partner_wanted_nur_der_bucher()
returns setof text language plpgsql as $f$
declare a record; b record; c record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(3, 17); v_offen boolean;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'doppel',
                               array[b.member_id, c.member_id]) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(b.auth_id);
  return next throws_ok(format('select public.set_partner_wanted(%L, true)', v_id),
    '42501', null, 'Ein Mitspieler kann die Buchung nicht ausschreiben');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(a.auth_id);
  return next lives_ok(format('select public.set_partner_wanted(%L, true)', v_id),
    'Der Bucher schon');
  perform set_config('role', 'postgres', true);

  select partner_wanted into v_offen from public.bookings where id = v_id;
  return next is(v_offen, true, 'Die Buchung steht danach als offen da');
end; $f$;

create or replace function tests.test_open_matches_zeigt_nur_offene()
returns setof text language plpgsql as $f$
declare a record; b record; c record; v_court uuid := tests.fixture_court();
        v_offen uuid; v_zu uuid;
        s1 timestamptz := tests.naechster_slot(3, 18);
        s2 timestamptz := tests.naechster_slot(3, 19);
        v_anzahl integer; v_frei integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'doppel', array[b.member_id],
                               '{}'::text[], true) into v_offen;
  select public.create_booking(v_court, s2, 'einzel', array[b.member_id]) into v_zu;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(c.auth_id);
  select count(*)::integer into v_anzahl from public.open_matches() o where o.booking_id = v_offen;
  return next is(v_anzahl, 1, 'Die ausgeschriebene Buchung steht in den offenen Spielen');

  select count(*)::integer into v_anzahl from public.open_matches() o where o.booking_id = v_zu;
  return next is(v_anzahl, 0, 'Die geschlossene nicht');

  select o.frei into v_frei from public.open_matches() o where o.booking_id = v_offen;
  return next is(v_frei, 2, 'Im Doppel sind nach Bucher und Mitspieler zwei Plaetze frei');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Gastgebuehr
-- ---------------------------------------------------------------------------

create or replace function tests.test_gastgebuehr_entsteht_je_gast()
returns setof text language plpgsql as $f$
declare a record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(4, 17); v_anzahl integer; v_summe integer;
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'doppel', '{}'::uuid[],
                               array['Gast', 'Gast']) into v_id;
  perform set_config('role', 'postgres', true);

  select count(*)::integer, coalesce(sum(amount_cents), 0)::integer into v_anzahl, v_summe
  from public.charges where booking_id = v_id and kind = 'guest';
  return next is(v_anzahl, 2, 'Je Gast entsteht eine Forderung');
  return next is(v_summe, 2000, 'Zusammen 20,00 Euro bei 10,00 Euro Gastgebuehr');

  return next is(
    (select count(*)::integer from public.charges
      where booking_id = v_id and kind = 'guest' and period_label is not null),
    0,
    'Ohne period_label - sonst greift der Idempotenz-Index des Beitragslaufs');
end; $f$;

/**
 * Der Tausch fuehrt die Gebuehren nach.
 *
 * Wichtiger Fall, weil update_booking_players vollstaendig austauscht: von zwei
 * Gaesten auf einen muss eine Forderung wieder verschwinden, sonst zahlt das
 * Mitglied fuer jemanden, der nicht mitgespielt hat.
 */
create or replace function tests.test_gastgebuehr_folgt_dem_tausch()
returns setof text language plpgsql as $f$
declare a record; b record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(4, 18); v_anzahl integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'doppel', '{}'::uuid[],
                               array['Gast', 'Gast']) into v_id;

  perform public.update_booking_players(v_id, array[b.member_id], array['Gast']);
  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_anzahl
  from public.charges where booking_id = v_id and kind = 'guest' and status = 'open';
  return next is(v_anzahl, 1, 'Ein Gast weniger heisst eine Forderung weniger');
end; $f$;

create or replace function tests.test_gastgebuehr_wird_vor_spielbeginn_erlassen()
returns setof text language plpgsql as $f$
declare a record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(4, 19); v_status text;
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', '{}'::uuid[], array['Gast']) into v_id;
  perform public.cancel_booking(v_id, 'Regen');
  perform set_config('role', 'postgres', true);

  select status::text into v_status
  from public.charges where booking_id = v_id and kind = 'guest';
  return next is(v_status, 'waived',
    'Wer vor Spielbeginn storniert, zahlt die Gastgebuehr nicht');
end; $f$;

/**
 * Nach Spielbeginn bleibt die Forderung stehen - auch wenn ein Admin
 * storniert. Die Regel haengt am Zeitpunkt, nicht an der Person.
 */
create or replace function tests.test_gastgebuehr_bleibt_nach_spielbeginn()
returns setof text language plpgsql as $f$
declare a record; adm record; v_court uuid := tests.fixture_court(); v_id uuid;
        v_type uuid; v_status text;
        v_start timestamptz := now() - interval '30 minutes';
begin
  select * into a from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;
  select id into v_type from public.booking_types where code = 'einzel';

  -- Die Buchung entsteht direkt, nicht ueber create_booking: die RPC laesst
  -- Vergangenes zu Recht nicht zu, und genau diese Lage soll geprueft werden.
  insert into public.bookings (court_id, slot, kind, booking_type_id, member_id, created_by)
  values (v_court, tstzrange(v_start, v_start + interval '1 hour', '[)'),
          'booking', v_type, a.member_id, a.member_id)
  returning id into v_id;
  insert into public.booking_players (booking_id, guest_name) values (v_id, 'Gast');
  insert into public.charges (member_id, payer_id, kind, amount_cents, description, booking_id)
  values (a.member_id, a.member_id, 'guest', 1000, 'Gastgebuehr Test', v_id);

  perform tests.act_as(adm.auth_id);
  perform public.cancel_booking(v_id, 'Platz unbespielbar');
  perform set_config('role', 'postgres', true);

  select status::text into v_status
  from public.charges where booking_id = v_id and kind = 'guest';
  return next is(v_status, 'open',
    'Nach Spielbeginn bleibt die Gastgebuehr stehen, auch beim Admin-Storno');
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer Mitspielersuche und Gastgebuehr sind eingespielt');
select * from extensions.finish();
