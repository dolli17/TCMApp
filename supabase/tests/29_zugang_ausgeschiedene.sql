-- ===========================================================================
-- Zugang endet mit der Mitgliedschaft (S12, B3, B4, B5)
--
-- Die wichtigsten Zusagen:
--
--   1. Archivierte, gesperrte und ausgetretene Mitglieder haben keinen Zugang
--      mehr: current_member_id(), is_member(), is_admin(), has_role() und
--      darf_plaetze() greifen nicht. Ein ausgeschiedener Vorstand sieht keine
--      IBANs und keine fremden Mitglieder mehr.
--   2. Ausgetreten heisst: das Austrittsdatum ist vorbei. Bis einschliesslich
--      zum Austrittsdatum bleibt alles, wie es war.
--   3. Archivieren setzt den Sperrvermerk, Austreten zum heutigen oder einem
--      vergangenen Datum nimmt die Rollen.
--   4. Archivieren raeumt auf: Gastgebuehren kuenftiger Buchungen,
--      Mitspielerplaetze, Veranstaltungsanmeldungen und Wartelisten. Ein
--      Archivierter rueckt nicht nach.
--   5. Archivieren nimmt das Mitglied aus Einzuegen, deren Datei noch nicht
--      erzeugt ist.
--
-- Fixtures aus 02_rls.sql (fixture_user, act_as), 03_rpc_bookings.sql
-- (naechster_slot), 13_lastschrift.sql (fixture_mandat), 24_einzug.sql
-- (fixture_offen, einzug_tag) und 25_veranstaltungen.sql (fixture_event).
-- ===========================================================================

/** Eine Mitgliedschaft mit Austrittsdatum, das Mitglied steht auf inaktiv. */
create or replace function tests.fixture_ausgetreten(p_member_id uuid, p_ended_on date)
returns void language plpgsql as $f$
begin
  insert into public.memberships (member_id, number, started_on, ended_on, status)
  values (p_member_id, 'ZZ-' || substr(gen_random_uuid()::text, 1, 8),
          p_ended_on - 365, p_ended_on, 'ended');
  update public.members set status = 'inactive' where id = p_member_id;
end; $f$;

-- ---------------------------------------------------------------------------
-- Die Rechtefunktionen
-- ---------------------------------------------------------------------------

create or replace function tests.test_zugang_gesperrt_hat_keine_rechte()
returns setof text language plpgsql as $f$
declare v record; x record; v_court uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(3, 9);
begin
  select * into v from tests.fixture_user('board', 'Vorstand') limit 1;
  select * into x from tests.fixture_user(null, 'Fremd') limit 1;
  insert into public.member_roles (member_id, role) values (v.member_id, 'groundskeeper');
  perform tests.fixture_mandat(x.member_id);
  update public.members set login_disabled_at = now() where id = v.member_id;

  perform tests.act_as(v.auth_id);
  return next ok(private.current_member_id() is null, 'Gesperrt: kein current_member_id()');
  return next ok(not private.is_member(), 'kein is_member()');
  return next ok(not private.is_admin(), 'kein is_admin()');
  return next ok(not public.am_i_admin(), 'kein am_i_admin()');
  return next ok(not private.has_role('board'), 'kein has_role()');
  return next ok(not private.darf_plaetze(), 'keine Platzrechte');
  return next is((select count(*)::integer from public.bank_accounts), 0,
    'Ein gesperrter Vorstand sieht keine Bankverbindungen');
  return next is((select count(*)::integer from public.members), 0,
    'und keine Mitglieder, auch sich selbst nicht');
  return next throws_ok(
    format($q$select public.create_booking(%L, %L, 'einzel', '{}'::uuid[], array['Gast'])$q$, v_court, s1),
    '42501', null, 'Ein Gesperrter bucht nicht');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_zugang_archiviert_hat_keine_rechte()
returns setof text language plpgsql as $f$
declare v record;
begin
  select * into v from tests.fixture_user('board', 'Vorstand') limit 1;
  update public.members set status = 'archived' where id = v.member_id;
  -- Auch wenn eine Rolle liegen geblieben ist: archiviert ist archiviert.
  insert into public.member_roles (member_id, role) values (v.member_id, 'board');

  perform tests.act_as(v.auth_id);
  return next ok(private.current_member_id() is null, 'Archiviert: kein current_member_id()');
  return next ok(not private.is_member(), 'kein is_member()');
  return next ok(not private.is_admin(), 'kein is_admin()');
  return next ok(not private.has_role('board'), 'kein has_role()');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_zugang_endet_nach_dem_austrittsdatum()
returns setof text language plpgsql as $f$
declare v record; k record; h record; v_heute date := private.heute();
begin
  select * into v from tests.fixture_user('board', 'Gestern') limit 1;
  select * into k from tests.fixture_user('board', 'Kuenftig') limit 1;
  select * into h from tests.fixture_user(null, 'Heute') limit 1;
  perform tests.fixture_ausgetreten(v.member_id, v_heute - 1);
  perform tests.fixture_ausgetreten(k.member_id, v_heute + 30);
  perform tests.fixture_ausgetreten(h.member_id, v_heute);

  perform tests.act_as(v.auth_id);
  return next ok(private.current_member_id() is null, 'Ausgetreten bis gestern: kein Zugang');
  return next ok(not private.is_member(), 'kein is_member()');
  return next ok(not private.is_admin(), 'Ein ausgeschiedener Vorstand ist kein Admin mehr');
  return next is((select count(*)::integer from public.bank_accounts), 0,
    'und sieht keine Bankverbindungen');

  perform set_config('role', 'postgres', true);
  perform tests.act_as(k.auth_id);
  return next is(private.current_member_id(), k.member_id,
    'Austritt zum kuenftigen Datum: bis dahin Mitglied');
  return next ok(private.is_member(), 'mit is_member()');
  return next ok(private.is_admin(), 'und den Rechten seiner Rolle');

  perform set_config('role', 'postgres', true);
  perform tests.act_as(h.auth_id);
  return next ok(private.is_member(), 'Am Austrittstag selbst ist man noch Mitglied');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_zugang_aktive_unberuehrt()
returns setof text language plpgsql as $f$
declare a record; p record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;

  perform tests.act_as(a.auth_id);
  return next is(private.current_member_id(), a.member_id, 'Aktiv: current_member_id()');
  return next ok(private.is_member(), 'is_member()');
  return next ok(private.is_admin(), 'is_admin()');
  return next ok(private.has_role('admin'), 'has_role()');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(p.auth_id);
  return next ok(private.darf_plaetze(), 'Der aktive Platzwart hat Platzrechte');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Archivieren und Austreten
-- ---------------------------------------------------------------------------

create or replace function tests.test_zugang_archivieren_sperrt_login()
returns setof text language plpgsql as $f$
declare a record; x record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into x from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  perform public.archive_member(x.member_id, true);
  perform set_config('role', 'postgres', true);

  return next isnt((select login_disabled_at from public.members where id = x.member_id), null,
    'Archivieren setzt den Sperrvermerk');
end; $f$;

create or replace function tests.test_zugang_austritt_nimmt_rollen()
returns setof text language plpgsql as $f$
declare a record; v record; k record; v_heute date := private.heute();
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into v from tests.fixture_user('board', 'Vorstand') limit 1;
  select * into k from tests.fixture_user('groundskeeper', 'Kuenftig') limit 1;
  insert into public.memberships (member_id, number, started_on)
  values (v.member_id, 'ZZ-' || substr(gen_random_uuid()::text, 1, 8), current_date - 100),
         (k.member_id, 'ZZ-' || substr(gen_random_uuid()::text, 1, 8), current_date - 100);

  perform tests.act_as(a.auth_id);
  perform public.end_membership(v.member_id, v_heute);
  perform public.end_membership(k.member_id, v_heute + 60);
  perform set_config('role', 'postgres', true);

  return next is(
    (select array_agg(role::text) from public.member_roles where member_id = v.member_id),
    array['member'], 'Austritt zu heute: es bleibt nur die Rolle Mitglied');
  return next is(
    (select array_agg(role::text order by role) from public.member_roles where member_id = k.member_id),
    array['member', 'groundskeeper'], 'Austritt zum kuenftigen Datum: die Rollen bleiben bis dahin');

  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format('select * from public.end_membership(%L)', a.member_id),
    '23514', null, 'Ein Admin beendet seine eigene Mitgliedschaft nicht selbst');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_zugang_wiedereintritt_ohne_alte_rollen()
returns setof text language plpgsql as $f$
declare a record; v record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into v from tests.fixture_user('board', 'Vorstand') limit 1;
  -- Ausgetreten zum damals kuenftigen Datum, das inzwischen vorbei ist.
  perform tests.fixture_ausgetreten(v.member_id, private.heute() - 10);

  perform tests.act_as(a.auth_id);
  perform public.reactivate_membership(v.member_id);
  perform set_config('role', 'postgres', true);

  return next is(
    (select array_agg(role::text) from public.member_roles where member_id = v.member_id),
    array['member'], 'Wer wieder eintritt, bekommt die alten Rollen nicht automatisch zurueck');
end; $f$;

-- ---------------------------------------------------------------------------
-- B4: Archivieren raeumt auf
-- ---------------------------------------------------------------------------

create or replace function tests.test_archivieren_erlaesst_gastgebuehren()
returns setof text language plpgsql as $f$
declare a record; x record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(4, 9);
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into x from tests.fixture_user() limit 1;
  perform tests.act_as(x.auth_id);
  select public.create_booking(v_court, s1, 'einzel', '{}'::uuid[], array['Gast']) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(a.auth_id);
  perform public.archive_member(x.member_id, true);
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.bookings where id = v_id), 'cancelled',
    'Die kuenftige Buchung ist abgesagt');
  return next is(
    (select array_agg(status::text) from public.charges where booking_id = v_id and kind = 'guest'),
    array['waived'], 'und ihre Gastgebuehr erlassen');
end; $f$;

create or replace function tests.test_archivieren_gibt_mitspielerplaetze_frei()
returns setof text language plpgsql as $f$
declare a record; b record; x record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(4, 10);
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user(null, 'Bucher') limit 1;
  select * into x from tests.fixture_user() limit 1;
  perform tests.act_as(b.auth_id);
  select public.create_booking(v_court, s1, 'einzel', array[x.member_id]) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(a.auth_id);
  perform public.archive_member(x.member_id, true);
  perform set_config('role', 'postgres', true);

  return next is(
    (select count(*)::integer from public.booking_players where booking_id = v_id and member_id = x.member_id),
    0, 'Der Archivierte steht nicht mehr als Mitspieler in fremden Buchungen');
  return next is((select status::text from public.bookings where id = v_id), 'active',
    'Die Buchung selbst bleibt bestehen');
  return next is(
    (select count(*)::integer from public.notifications
      where member_id = b.member_id and kind = 'player_left'),
    1, 'Der Bucher erfaehrt davon');
end; $f$;

create or replace function tests.test_archivieren_meldet_von_veranstaltungen_ab()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1800, 2); a record; b record; x record; w record;
        v_x text; v_w text;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user(null, 'Bleibt') limit 1;
  select * into x from tests.fixture_user(null, 'Geht') limit 1;
  select * into w from tests.fixture_user(null, 'Wartet') limit 1;

  perform tests.act_as(b.auth_id);
  perform public.event_anmelden(v_event, 0, null);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(x.auth_id);
  v_x := public.event_anmelden(v_event, 0, null);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(w.auth_id);
  v_w := public.event_anmelden(v_event, 0, null);
  perform set_config('role', 'postgres', true);

  return next is(v_x, 'registered', 'Vorher: X ist angemeldet');
  return next is(v_w, 'waitlisted', 'und W wartet');

  perform tests.act_as(a.auth_id);
  perform public.archive_member(x.member_id, true);
  perform set_config('role', 'postgres', true);

  return next is(
    (select status::text from public.event_registrations where event_id = v_event and member_id = x.member_id),
    'cancelled', 'Die Anmeldung des Archivierten ist abgemeldet');
  return next ok(tests.event_forderung(v_event, x.member_id) is null,
    'und seine Forderung fuer die Veranstaltung ist weg');
  return next is(
    (select status::text from public.event_registrations where event_id = v_event and member_id = w.member_id),
    'registered', 'Der Naechste auf der Warteliste rueckt nach');
end; $f$;

create or replace function tests.test_archivieren_streicht_von_der_warteliste()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1800, 1); a record; b record; x record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user(null, 'Drin') limit 1;
  select * into x from tests.fixture_user(null, 'Wartet') limit 1;

  perform tests.act_as(b.auth_id);
  perform public.event_anmelden(v_event, 0, null);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(x.auth_id);
  perform public.event_anmelden(v_event, 0, null);
  perform set_config('role', 'postgres', true);

  perform tests.act_as(a.auth_id);
  perform public.archive_member(x.member_id, true);
  perform set_config('role', 'postgres', true);

  return next is(
    (select status::text from public.event_registrations where event_id = v_event and member_id = x.member_id),
    'cancelled', 'Der Archivierte steht nicht mehr auf der Warteliste');

  perform tests.act_as(b.auth_id);
  perform public.event_abmelden(v_event);
  perform set_config('role', 'postgres', true);

  return next is(
    (select status::text from public.event_registrations where event_id = v_event and member_id = x.member_id),
    'cancelled', 'und rueckt auch nicht nach, wenn ein Platz frei wird');
end; $f$;

/** Auch ohne archive_member, etwa ueber update_member: wer archiviert ist, rueckt nicht nach. */
create or replace function tests.test_archivierter_rueckt_nicht_nach()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1800, 1); b record; x record; w record;
begin
  select * into b from tests.fixture_user(null, 'Drin') limit 1;
  select * into x from tests.fixture_user(null, 'Archiv') limit 1;
  select * into w from tests.fixture_user(null, 'Wartet') limit 1;

  perform tests.act_as(b.auth_id);
  perform public.event_anmelden(v_event, 0, null);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(x.auth_id);
  perform public.event_anmelden(v_event, 0, null);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(w.auth_id);
  perform public.event_anmelden(v_event, 0, null);
  perform set_config('role', 'postgres', true);

  -- Ohne angemeldeten Nutzer, sonst haelt guard_member_self_update das auf.
  perform set_config('request.jwt.claims', null, true);
  update public.members set status = 'archived' where id = x.member_id;

  perform tests.act_as(b.auth_id);
  perform public.event_abmelden(v_event);
  perform set_config('role', 'postgres', true);

  return next is(
    (select status::text from public.event_registrations where event_id = v_event and member_id = x.member_id),
    'waitlisted', 'Der Archivierte rueckt nicht nach');
  return next is(
    (select status::text from public.event_registrations where event_id = v_event and member_id = w.member_id),
    'registered', 'sondern der Naechste nach ihm');
end; $f$;

-- ---------------------------------------------------------------------------
-- B5: Archivieren bei offenem Einzug
-- ---------------------------------------------------------------------------

create or replace function tests.test_archivieren_nimmt_aus_dem_einzug()
returns setof text language plpgsql as $f$
declare v_tag date := tests.einzug_tag(); adm record; x record; b record; r record;
        v_x uuid; v_b uuid; v_period text := 'ZZ-' || substr(gen_random_uuid()::text, 1, 8);
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into x from tests.fixture_user(null, 'Geht') limit 1;
  select * into b from tests.fixture_user(null, 'Bleibt') limit 1;
  perform tests.fixture_mandat(x.member_id);
  perform tests.fixture_mandat(b.member_id);
  v_x := tests.fixture_offen(x.member_id, 18500, 'fee', v_period);
  v_b := tests.fixture_offen(b.member_id, 9000, 'fee', v_period);

  perform tests.act_as(adm.auth_id);
  select * into r from public.einzug_vorbereiten(
    v_tag, jsonb_build_array(jsonb_build_object('kind', 'fee', 'period', v_period)), 'ZZTest Archiv');
  perform public.archive_member(x.member_id, true);
  perform set_config('role', 'postgres', true);

  return next is(
    (select array_agg(charge_id) from public.debit_items where batch_id = r.batch_id),
    array[v_b], 'Im Entwurf steht nur noch das verbliebene Mitglied');
  return next is((select status::text from public.charges where id = v_x), 'open',
    'Die Forderung des Archivierten ist wieder offen');
  return next is(
    (select item_count from public.debit_batches where id = r.batch_id), 1,
    'Die Zahl der Lastschriften ist nachgezogen');
  return next is(
    (select total_cents from public.debit_batches where id = r.batch_id), 9000,
    'und die Summe auch');
end; $f$;

select extensions.plan(1);
select extensions.pass('Tests fuer den Zugang Ausgeschiedener sind eingespielt');
