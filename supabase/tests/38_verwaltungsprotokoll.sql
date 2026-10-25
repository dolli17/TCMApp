-- ===========================================================================
-- Verwaltungsprotokoll (O27) und Notizen im Protokoll (S29)
--
--   1. Eigene Buchungen, eigene Gastgebuehren und eigene Arbeitsstunden
--      erzeugen keinen Eintrag; dieselbe Aktion durch einen Admin fuer ein
--      anderes Mitglied schon, mit dem Admin als Urheber. Sperrungen immer.
--      Ohne Verwaltungsrolle (Einstieg ins offene Spiel, Nachruecken) und
--      ganz ohne Konto (Seed, Wartung) auch an fremden Zeilen nicht.
--   2. Ein Massenlauf schreibt je Tabelle einen Sammeleintrag mit Anzahl und
--      Summe statt einer Zeile je Forderung.
--   3. tcm.protokoll_sammel kann ein Client nicht setzen: keine erreichbare
--      Funktion ausser den Laeufen setzt es, set_config liegt nicht in einem
--      Schema der API, und der Wert gilt nur in der eigenen Transaktion.
--   4. Mitglieder sehen das Protokoll nicht mehr, auch nicht ihre eigenen
--      Eintraege (S29). Notizen und Antragsangaben stehen nicht darin, die
--      IBAN des Vereins in den Einstellungen nur maskiert.
--   5. protokoll_zugang: nur fuer Admins, Urheber aus dem Token.
--
-- Fixtures aus 01_constraints.sql (fixture_court), 02_rls.sql (fixture_user,
-- act_as), 03_rpc_bookings.sql (naechster_slot), 11_forderungen.sql
-- (fixture_beitragsart, fixture_beitragszahler).
-- ===========================================================================

create or replace function tests.test_protokoll_eigene_buchung_ohne_eintrag()
returns setof text language plpgsql as $f$
declare a record; b record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(3, 10);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  v_id := public.create_booking(v_court, s1, 'einzel', array[b.member_id]);
  perform public.cancel_booking(v_id);
  perform set_config('role', 'postgres', true);

  return next is(
    (select count(*)::integer from public.change_log where table_name = 'bookings' and row_id = v_id),
    0, 'Eigene Buchung und eigenes Storno stehen nicht im Protokoll');
end; $f$;

create or replace function tests.test_protokoll_admin_storniert_fremde_buchung()
returns setof text language plpgsql as $f$
declare a record; b record; adm record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(3, 12);
        v_eintrag record;
begin
  select * into a   from tests.fixture_user() limit 1;
  select * into b   from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin', 'Admin') limit 1;
  perform tests.act_as(a.auth_id);
  v_id := public.create_booking(v_court, s1, 'einzel', array[b.member_id]);
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  perform public.cancel_booking(v_id, 'Turnier');
  perform set_config('role', 'postgres', true);

  select * into v_eintrag from public.change_log
   where table_name = 'bookings' and row_id = v_id;

  return next is(v_eintrag.action, 'update', 'Das Storno durch den Admin steht im Protokoll');
  return next is(v_eintrag.changed_by, adm.member_id, 'mit dem Admin als Urheber');
  return next is(v_eintrag.member_id, a.member_id, 'und dem Mitglied, dem die Buchung gehört');
  return next is(v_eintrag.kenn ->> 'court_id', v_court::text, 'Die Kennfelder stehen in kenn');
  return next ok(not (v_eintrag.diff ? 'cancellation_reason'), 'Die Begründung als Freitext nicht');
end; $f$;

create or replace function tests.test_protokoll_sperre_immer()
returns setof text language plpgsql as $f$
declare adm record; v_court uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(4, 8);
begin
  select * into adm from tests.fixture_user('admin', 'Admin') limit 1;
  perform tests.act_as(adm.auth_id);
  perform public.create_blocking(array[v_court], s1, s1 + interval '2 hours', 'platzpflege', 'Walzen');
  perform set_config('role', 'postgres', true);

  return next is(
    (select count(*)::integer from public.change_log
      where table_name = 'bookings' and action = 'insert'
        and kenn ->> 'kind' = 'blocking' and kenn ->> 'court_id' = v_court::text
        and changed_by = adm.member_id),
    1, 'Eine Sperrung steht im Protokoll');
end; $f$;

create or replace function tests.test_protokoll_forderung_fremd_und_eigen()
returns setof text language plpgsql as $f$
declare b record; adm record; v_fremd uuid; v_eigen uuid; v_eintrag record;
begin
  select * into b   from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin', 'Admin') limit 1;
  perform tests.act_as(adm.auth_id);
  v_fremd := public.create_manual_charge(b.member_id, 'guest', 1200, 'Gastgebühr');
  v_eigen := public.create_manual_charge(adm.member_id, 'misc', 500, 'Eigene');
  perform set_config('role', 'postgres', true);

  select * into v_eintrag from public.change_log where table_name = 'charges' and row_id = v_fremd;
  return next is(v_eintrag.changed_by, adm.member_id, 'Forderung für ein anderes Mitglied steht im Protokoll');
  return next is(v_eintrag.kenn, '{"description": "Gastgebühr", "amount_cents": 1200, "period_label": null}'::jsonb,
    'mit Beschreibung und Betrag in kenn');
  return next is(
    (select count(*)::integer from public.change_log where table_name = 'charges' and row_id = v_eigen),
    0, 'Eine Forderung an sich selbst nicht');
end; $f$;

create or replace function tests.test_protokoll_arbeitsstunden_nur_fuer_andere()
returns setof text language plpgsql as $f$
declare b record; adm record; v_fremd uuid; v_eigen uuid;
begin
  select * into b   from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin', 'Admin') limit 1;
  perform tests.act_as(adm.auth_id);
  v_fremd := public.record_work_duty(b.member_id, 2, current_date - 1, 'Platzpflege');
  v_eigen := public.record_work_duty(adm.member_id, 3, current_date - 1, 'Platzpflege');
  perform set_config('role', 'postgres', true);

  return next is(
    (select changed_by from public.change_log where table_name = 'work_duty_entries' and row_id = v_fremd),
    adm.member_id, 'Stunden für ein anderes Mitglied stehen im Protokoll');
  return next is(
    (select count(*)::integer from public.change_log where table_name = 'work_duty_entries' and row_id = v_eigen),
    0, 'Eigene Stunden nicht');
end; $f$;

create or replace function tests.test_protokoll_sammeleintrag_beitragslauf()
returns setof text language plpgsql as $f$
declare adm record; v_art uuid; u1 record; u2 record; v_lauf record; v_eintrag record;
begin
  select * into adm from tests.fixture_user('admin', 'Admin') limit 1;
  v_art := tests.fixture_beitragsart('ZZTest Protokoll', 2041, 10000);
  select * into u1 from tests.fixture_beitragszahler(v_art, 2041) limit 1;
  select * into u2 from tests.fixture_beitragszahler(v_art, 2041) limit 1;

  perform tests.act_as(adm.auth_id);
  select * into v_lauf from public.fee_run_execute(2041);
  perform set_config('role', 'postgres', true);

  return next is(
    (select count(*)::integer from public.change_log
      where table_name = 'charges' and action <> 'event'
        and member_id in (u1.member_id, u2.member_id)),
    0, 'Die Forderungen des Laufs stehen nicht einzeln im Protokoll');

  select * into v_eintrag from public.change_log
   where table_name = 'charges' and action = 'event' and ereignis = 'beitragslauf'
     and kenn ->> 'jahr' = '2041';
  return next is(v_eintrag.changed_by, adm.member_id, 'sondern in einem Sammeleintrag des Admins');
  return next is((v_eintrag.kenn ->> 'anzahl')::integer, v_lauf.erzeugt, 'mit der Anzahl');
  return next is((v_eintrag.kenn ->> 'betrag_cents')::integer, v_lauf.summe_cents, 'und der Summe');
end; $f$;

create or replace function tests.test_protokoll_sammeleintrag_serie()
returns setof text language plpgsql as $f$
declare adm record; v_court uuid := tests.fixture_court(); v_serie uuid; v_eintrag record;
        v_heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  select * into adm from tests.fixture_user('admin', 'Admin') limit 1;
  perform tests.act_as(adm.auth_id);
  select series_id into v_serie from public.create_series(v_court, 'training', extract(dow from v_heute)::integer,
                                  '07:00', '08:00', v_heute + 1, v_heute + 60, 'Protokolltraining');
  perform set_config('role', 'postgres', true);

  return next is(
    (select count(*)::integer from public.change_log
      where table_name = 'booking_series' and row_id = v_serie and changed_by = adm.member_id),
    1, 'Die Serie selbst steht einzeln im Protokoll');
  select * into v_eintrag from public.change_log
   where table_name = 'bookings' and action = 'event' and ereignis = 'serie_anlegen'
     and kenn ->> 'titel' = 'Protokolltraining';
  return next is((v_eintrag.kenn ->> 'anzahl')::integer,
    (select count(*)::integer from public.bookings where series_id = v_serie),
    'ihre Termine in einem Sammeleintrag mit Anzahl');
  return next is(
    (select count(*)::integer from public.change_log c join public.bookings b on b.id = c.row_id
      where b.series_id = v_serie),
    0, 'und nicht einzeln');
end; $f$;

create or replace function tests.test_protokoll_einstieg_offenes_spiel_ohne_eintrag()
returns setof text language plpgsql as $f$
declare a record; b record; c record; d record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(3, 17);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  select * into d from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  v_id := public.create_booking(v_court, s1, 'doppel', array[c.member_id, d.member_id], '{}'::text[], true);
  perform set_config('role', 'postgres', true);

  -- B macht das Doppel voll; dabei faellt partner_wanted an As Buchung.
  perform tests.act_as(b.auth_id);
  perform public.join_booking(v_id);
  perform set_config('role', 'postgres', true);

  return next is((select partner_wanted from public.bookings where id = v_id), false,
    'Der Einstieg hat As Buchung geaendert');
  return next is(
    (select count(*)::integer from public.change_log where table_name = 'bookings' and row_id = v_id),
    0, 'Ein Mitglied ohne Verwaltungsrolle, das einsteigt, steht nicht im Protokoll');
end; $f$;

create or replace function tests.test_protokoll_nachruecken_ohne_eintrag()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1000, 2); a record; b record;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  perform public.event_anmelden(v_event, 1);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(b.auth_id);
  perform public.event_anmelden(v_event, 0);
  perform set_config('role', 'postgres', true);

  -- A meldet sich ab, B rueckt nach und bekommt die Gebuehr.
  perform tests.act_as(a.auth_id);
  perform public.event_abmelden(v_event);
  perform set_config('role', 'postgres', true);

  return next is((tests.event_forderung(v_event, b.member_id)).amount_cents, 1000,
    'B ist nachgerueckt und hat die Forderung');
  return next is(
    (select count(*)::integer from public.change_log
      where table_name = 'charges' and member_id in (a.member_id, b.member_id)),
    0, 'Abmeldung und Nachruecken stehen nicht im Protokoll');
end; $f$;

create or replace function tests.test_protokoll_ohne_konto_nicht_in_modus_tabellen()
returns setof text language plpgsql as $f$
declare b record; v_court uuid := tests.fixture_court(); v_id uuid; v_charge uuid;
        s1 timestamptz := tests.naechster_slot(5, 9);
begin
  select * into b from tests.fixture_user() limit 1;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);

  insert into public.bookings (court_id, slot, kind, booking_type_id, member_id)
  values (v_court, tstzrange(s1, s1 + interval '1 hour', '[)'), 'booking',
          (select id from public.booking_types where code = 'einzel'), b.member_id)
  returning id into v_id;
  insert into public.charges (member_id, payer_id, kind, amount_cents, description)
  values (b.member_id, b.member_id, 'misc', 100, 'Wartung')
  returning id into v_charge;

  return next is(
    (select count(*)::integer from public.change_log where row_id in (v_id, v_charge)),
    0, 'Aenderungen ohne jedes Konto (Seed, Wartung) stehen in Buchungen und Forderungen nicht im Protokoll');

  insert into public.teams (name) values ('ZZ Ohne Konto');
  return next ok(
    exists (select 1 from public.change_log where table_name = 'teams' and kenn ->> 'name' = 'ZZ Ohne Konto'),
    'in Tabellen ohne Modus schon');
end; $f$;

create or replace function tests.test_protokoll_sammeln_nicht_vom_client()
returns setof text language plpgsql as $f$
begin
  return next is(
    (select array_agg(p.proname::text order by p.proname)
       from pg_proc p
      where p.pronamespace in ('public'::regnamespace, 'graphql_public'::regnamespace)
        and p.prosrc like '%tcm.protokoll_sammel%'),
    array['add_charges_to_debit_batch', 'announce_charges', 'charge_billing_period',
          'complete_debit_batch', 'create_series', 'einzug_vorbereiten', 'end_series',
          'fee_run_execute', 'mark_debit_batch_generated', 'mark_debit_batch_submitted',
          'update_series', 'work_duty_settle_year'],
    'Nur die Massenläufe setzen den Sammelmodus');
  return next ok(
    not exists (select 1 from pg_proc p
                 where p.pronamespace in ('public'::regnamespace, 'graphql_public'::regnamespace)
                   and p.proname in ('set_config', 'protokoll_sammel')),
    'set_config ist über die API nicht erreichbar');

  -- Die Laeufe pruefen ihre Rechte vor allem anderen; ein Mitglied kommt nicht
  -- bis zum Sammelmodus.
  perform tests.act_as((select auth_id from tests.fixture_user() limit 1));
  return next throws_ok('select public.fee_run_execute(2042)', '42501', null,
    'Ein Mitglied kann keinen Lauf starten');
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
  return next is(nullif(current_setting('tcm.protokoll_sammel', true), ''), null,
    'Nach dem abgewiesenen Aufruf ist kein Sammelmodus gesetzt');
end; $f$;

create or replace function tests.test_protokoll_fuer_mitglieder_unsichtbar()
returns setof text language plpgsql as $f$
declare a record; v_anzahl integer;
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  update public.members set mobile = '0170 3333333' where id = a.member_id;
  select count(*)::integer into v_anzahl from public.change_log;
  perform set_config('role', 'postgres', true);

  return next cmp_ok(
    (select count(*)::integer from public.change_log where member_id = a.member_id), '>', 0,
    'Die Änderung steht im Protokoll');
  return next is(v_anzahl, 0, 'Ein Mitglied sieht keinen Eintrag, auch nicht die eigenen (S29)');
end; $f$;

create or replace function tests.test_protokoll_ohne_notizen()
returns setof text language plpgsql as $f$
declare b record; adm record;
begin
  select * into b   from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin', 'Admin') limit 1;
  perform tests.act_as(adm.auth_id);
  perform public.update_member(b.member_id, '{"notes": "Geheime Notiz", "mobile": "0170 4444444"}'::jsonb);
  perform set_config('role', 'postgres', true);

  return next ok(
    exists (select 1 from public.change_log where member_id = b.member_id and diff ? 'mobile'),
    'Die übrigen Änderungen stehen im Protokoll');
  return next ok(
    not exists (select 1 from public.change_log
                 where member_id = b.member_id and (diff ? 'notes' or diff ? 'import_notes')),
    'Notizen nicht (S29)');
end; $f$;

create or replace function tests.test_protokoll_iban_maskiert()
returns setof text language plpgsql as $f$
declare adm record; v_diff jsonb;
begin
  select * into adm from tests.fixture_user('admin', 'Admin') limit 1;
  perform tests.act_as(adm.auth_id);
  perform public.set_setting('sepa.creditor_iban', 'DE02120300000000202051');
  perform set_config('role', 'postgres', true);

  select diff into v_diff from public.change_log
   where table_name = 'settings' and kenn ->> 'key' = 'sepa.creditor_iban' and changed_by = adm.member_id;
  return next is(v_diff -> 'value' ->> 'neu', '***', 'Die IBAN des Vereins steht nur maskiert im Protokoll');
  return next ok(v_diff::text not like '%202051%', 'auch nicht in Teilen');
end; $f$;

create or replace function tests.test_protokoll_antrag_nur_entscheidung()
returns setof text language plpgsql as $f$
declare adm record; v_antrag uuid; v_eintrag record;
begin
  select * into adm from tests.fixture_user('admin', 'Admin') limit 1;
  insert into public.membership_applications
    (first_name, last_name, email, birthday, message, ip_hash, user_agent, confirmed_at)
  values ('Anna', 'Antrag', 'anna.antrag@example.org', '1990-01-01', 'Hallo, ich spiele gern', 'x', 'y', now())
  returning id into v_antrag;
  return next is(
    (select count(*)::integer from public.change_log where row_id = v_antrag), 0,
    'Ein neuer Antrag steht nicht im Protokoll');

  perform tests.act_as(adm.auth_id);
  perform public.decline_membership_application(v_antrag, 'Kein Platz');
  perform set_config('role', 'postgres', true);

  select * into v_eintrag from public.change_log where row_id = v_antrag;
  return next is(v_eintrag.diff -> 'status' ->> 'neu', 'declined', 'Die Ablehnung steht im Protokoll');
  return next is(v_eintrag.changed_by, adm.member_id, 'mit dem Admin');
  return next is(v_eintrag.kenn, '{"first_name": "Anna", "last_name": "Antrag"}'::jsonb, 'und dem Namen');
  return next ok(not (v_eintrag.diff ?| array['decision_note', 'message', 'ip_hash', 'user_agent', 'email']),
    'Begründung, Nachricht und Antragsangaben nicht');
end; $f$;

create or replace function tests.test_protokoll_zugang()
returns setof text language plpgsql as $f$
declare a record; adm record; v_eintrag record;
begin
  select * into a   from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin', 'Admin') limit 1;

  perform tests.act_as(a.auth_id);
  return next throws_ok(format('select public.protokoll_zugang(%L, %L)', a.member_id, 'einladung_erneut'),
    '42501', null, 'Ein Mitglied kann keinen Zugangseintrag schreiben');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  perform public.protokoll_zugang(a.member_id, 'passwort_zuruecksetzen');
  return next throws_ok(format('select public.protokoll_zugang(%L, %L)', a.member_id, 'irgendwas'),
    '22023', null, 'Nur bekannte Ereignisse');
  perform set_config('role', 'postgres', true);

  select * into v_eintrag from public.change_log
   where member_id = a.member_id and action = 'event';
  return next is(v_eintrag.ereignis, 'passwort_zuruecksetzen', 'Der Passwort-Link steht im Protokoll');
  return next is(v_eintrag.changed_by, adm.member_id, 'mit dem Admin aus dem Token');
  return next is(v_eintrag.kenn ->> 'first_name', 'RLS', 'und dem Namen des Mitglieds');
end; $f$;

select plan(1);
select pass('Verwaltungsprotokoll (O27, S29): Testfunktionen definiert');
