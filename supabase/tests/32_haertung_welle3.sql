-- ===========================================================================
-- Haertung Welle 3: Sperre, Datum, Status (B6, B10, B21, B23)
--
--   1. join_booking, update_booking_players und leave_booking sperren die
--      Buchungszeile mit FOR UPDATE (B6). Ohne die Sperre zaehlen zwei
--      gleichzeitige "Mitspielen" dieselbe Besetzung und ueberbuchen. Echte
--      Nebenlaeufigkeit laesst sich in einer Testtransaktion nicht herstellen.
--      Geprueft wird deshalb die Sperre selbst, ueber pgrowlocks. xmax allein
--      reicht nicht: der Fremdschluessel von booking_players setzt schon eine
--      FOR-KEY-SHARE-Sperre, und die haelt einen zweiten Beitritt nicht auf.
--   2. Ein Mandat mit dem Berliner Datum geht immer durch, auch wenn die
--      Sitzung in einer Zeitzone hinter Berlin laeuft (B10). Zwischen 0 und
--      2 Uhr ist das in UTC der Fall.
--   3. Wer zu einem kuenftigen Datum austritt, bleibt bis dahin im
--      Namensverzeichnis und kann Getraenke buchen (B21). Danach nicht mehr.
--   4. update_member archiviert nicht (B23). Dafuer gibt es archive_member.
--
-- Fixtures aus 01_constraints.sql (fixture_court), 02_rls.sql (fixture_user,
-- act_as), 03_rpc_bookings.sql (naechster_slot), 10_getraenkekarte.sql
-- (fixture_getraenk) und 29_zugang_ausgeschiedene.sql (fixture_ausgetreten).
-- ===========================================================================

/**
 * Die Sperrmodi auf einer Buchungszeile, z. B. {"For Update"}.
 *
 * pgrowlocks wird erst hier angelegt, in der Testtransaktion. runtests rollt
 * es mit allem anderen zurueck; die Datenbank selbst braucht es nicht.
 */
create or replace function tests.sperrmodi(p_booking_id uuid)
returns text[] language plpgsql as $f$
declare v_modi text[];
begin
  create extension if not exists pgrowlocks with schema extensions;
  select coalesce(array_agg(m), '{}') into v_modi
  from extensions.pgrowlocks('public.bookings') r, unnest(r.modes) m
  where r.locked_row = (select ctid from public.bookings where id = p_booking_id);
  return v_modi;
end; $f$;

-- ---------------------------------------------------------------------------
-- B6: Zeilensperre auf die Buchung
-- ---------------------------------------------------------------------------

create or replace function tests.test_welle3_join_booking_sperrt_die_buchung()
returns setof text language plpgsql as $f$
declare a record; b record; c record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 17);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  -- Direkt angelegt, damit die Zeile vor dem Beitritt sicher unberuehrt ist.
  insert into public.bookings (court_id, member_id, slot, booking_type_id, partner_wanted)
  values (v_court, a.member_id, tstzrange(s1, s1 + interval '1 hour'),
          (select id from public.booking_types where code = 'doppel'), true)
  returning id into v_id;
  insert into public.booking_players (booking_id, member_id) values (v_id, c.member_id);
  return next ok(not 'For Update' = any (tests.sperrmodi(v_id)), 'Vorher ist die Buchung nicht gesperrt');

  perform tests.act_as(b.auth_id);
  perform public.join_booking(v_id);
  perform set_config('role', 'postgres', true);

  return next is((select partner_wanted from public.bookings where id = v_id), true,
    'Drei von vier: die Buchung selbst bleibt unveraendert');
  return next ok('For Update' = any (tests.sperrmodi(v_id)),
    'join_booking sperrt die Buchung, bevor es die Besetzung zaehlt');
end; $f$;

create or replace function tests.test_welle3_update_booking_players_sperrt_die_buchung()
returns setof text language plpgsql as $f$
declare a record; b record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 18);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  insert into public.bookings (court_id, member_id, slot, booking_type_id)
  values (v_court, a.member_id, tstzrange(s1, s1 + interval '1 hour'),
          (select id from public.booking_types where code = 'einzel'))
  returning id into v_id;
  insert into public.booking_players (booking_id, guest_name) values (v_id, 'Gast');
  return next ok(not 'For Update' = any (tests.sperrmodi(v_id)), 'Vorher ist die Buchung nicht gesperrt');

  perform tests.act_as(a.auth_id);
  perform public.update_booking_players(v_id, array[b.member_id], '{}'::text[]);
  perform set_config('role', 'postgres', true);

  return next ok('For Update' = any (tests.sperrmodi(v_id)), 'update_booking_players sperrt die Buchung');
end; $f$;

create or replace function tests.test_welle3_leave_booking_sperrt_die_buchung()
returns setof text language plpgsql as $f$
declare a record; b record; c record; d record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 19);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  select * into d from tests.fixture_user() limit 1;
  -- Ein Doppel zu viert: ohne b bleiben drei, die Untergrenze haelt.
  insert into public.bookings (court_id, member_id, slot, booking_type_id)
  values (v_court, a.member_id, tstzrange(s1, s1 + interval '1 hour'),
          (select id from public.booking_types where code = 'doppel'))
  returning id into v_id;
  insert into public.booking_players (booking_id, member_id)
  values (v_id, b.member_id), (v_id, c.member_id), (v_id, d.member_id);
  return next ok(not 'For Update' = any (tests.sperrmodi(v_id)), 'Vorher ist die Buchung nicht gesperrt');

  perform tests.act_as(b.auth_id);
  perform public.leave_booking(v_id);
  perform set_config('role', 'postgres', true);

  return next ok('For Update' = any (tests.sperrmodi(v_id)), 'leave_booking sperrt die Buchung');
end; $f$;

-- ---------------------------------------------------------------------------
-- B10: Das Mandat traegt das Berliner Datum
-- ---------------------------------------------------------------------------

create or replace function tests.test_welle3_mandat_mit_berliner_datum()
returns setof text language plpgsql as $f$
declare a record; v_konto uuid; v_def text;
begin
  select * into a from tests.fixture_user() limit 1;
  insert into public.bank_accounts (member_id, iban_encrypted, iban_fingerprint, iban_last4, holder)
  values (a.member_id, private.encrypt_iban('DE02120300000000202051'),
          private.fingerprint_iban('DE02120300000000202051'), '2051', 'ZZTest')
  returning id into v_konto;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conname = 'sepa_mandates_signed_not_future';
  return next ok(v_def ~ 'Europe/Berlin',
    'Die Pruefung rechnet mit dem Berliner Datum, nicht mit current_date');

  -- Eine Sitzung zwoelf Stunden hinter UTC: current_date liegt dort vor dem
  -- Berliner Datum, wie in UTC zwischen 0 und 2 Uhr.
  perform set_config('timezone', 'Etc/GMT+12', true);
  return next lives_ok(format(
    $q$insert into public.sepa_mandates (member_id, bank_account_id, reference, signed_on, status)
       values (%L, %L, 'ZZ-B10-' || substr(gen_random_uuid()::text, 1, 8), private.heute(), 'active')$q$,
    a.member_id, v_konto),
    'Ein heute in Berlin unterschriebenes Mandat geht durch');
  return next throws_ok(format(
    $q$insert into public.sepa_mandates (member_id, bank_account_id, reference, signed_on, status)
       values (%L, %L, 'ZZ-B10-' || substr(gen_random_uuid()::text, 1, 8), private.heute() + 1, 'revoked')$q$,
    a.member_id, v_konto),
    '23514', null, 'Ein Mandat von morgen bleibt verboten');
  perform set_config('timezone', 'UTC', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- B21: Austritt zu einem kuenftigen Datum
-- ---------------------------------------------------------------------------

create or replace function tests.test_welle3_austritt_kuenftig_im_verzeichnis_und_am_kiosk()
returns setof text language plpgsql as $f$
declare a record; k record; g record; v_item uuid; v_heute date := private.heute();
begin
  select * into a from tests.fixture_user() limit 1;
  select * into k from tests.fixture_user(null, 'Kuenftig') limit 1;
  select * into g from tests.fixture_user(null, 'Gestern') limit 1;
  perform tests.fixture_ausgetreten(k.member_id, v_heute + 60);
  perform tests.fixture_ausgetreten(g.member_id, v_heute - 1);
  v_item := tests.fixture_getraenk('ZZTest Welle3', 200);

  perform tests.act_as(a.auth_id);
  return next ok(exists (select 1 from public.member_directory() d where d.id = k.member_id),
    'Austritt zum Jahresende: bis dahin in der Mitspielerwahl');
  return next ok(not exists (select 1 from public.member_directory() d where d.id = g.member_id),
    'Ausgetreten bis gestern: nicht mehr im Verzeichnis');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(k.auth_id);
  return next lives_ok(format('select public.record_drink_purchase(%L, 1)', v_item),
    'Bis zum Austrittsdatum bucht man Getraenke selbst');
  perform set_config('role', 'postgres', true);

  -- Der Kiosk bucht fuer ein Mitglied, also ohne dessen Login: hier greift
  -- nur noch record_purchase.
  return next lives_ok(
    format($q$select private.record_purchase(%L, %L, 1, 'kiosk', null)$q$, k.member_id, v_item),
    'und der Kiosk bucht fuer ihn');
  return next throws_ok(
    format($q$select private.record_purchase(%L, %L, 1, 'kiosk', null)$q$, g.member_id, v_item),
    'P0002', 'Kein aktives Mitglied.', 'Nach dem Austritt nicht mehr');
end; $f$;

create or replace function tests.test_welle3_verzeichnis_ohne_archivierte_und_gesperrte()
returns setof text language plpgsql as $f$
declare a record; x record; s record;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into x from tests.fixture_user(null, 'Archiv') limit 1;
  select * into s from tests.fixture_user(null, 'Gesperrt') limit 1;
  update public.members set status = 'archived' where id = x.member_id;
  update public.members set login_disabled_at = now() where id = s.member_id;

  perform tests.act_as(a.auth_id);
  return next ok(not exists (select 1 from public.member_directory() d where d.id = x.member_id),
    'Archivierte stehen nicht im Verzeichnis');
  return next ok(not exists (select 1 from public.member_directory() d where d.id = s.member_id),
    'Gesperrte auch nicht');
  return next ok(exists (select 1 from public.member_directory() d where d.id = a.member_id),
    'Aktive wie bisher');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- B23: Archivieren nur ueber archive_member
-- ---------------------------------------------------------------------------

create or replace function tests.test_welle3_update_member_archiviert_nicht()
returns setof text language plpgsql as $f$
declare adm record; b record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format($q$select public.update_member(%L, '{"status":"archived"}'::jsonb)$q$, b.member_id),
    '22023', null, 'update_member setzt nicht auf archiviert');
  return next lives_ok(
    format($q$select public.update_member(%L, '{"status":"inactive"}'::jsonb)$q$, b.member_id),
    'Inaktiv geht');
  return next lives_ok(
    format($q$select public.update_member(%L, '{"status":"active"}'::jsonb)$q$, b.member_id),
    'und zurueck auf aktiv');
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.members where id = b.member_id), 'active',
    'Der Status steht danach auf aktiv');

  -- Ein archiviertes Mitglied holt update_member nicht zurueck. Das bleibt
  -- Sache von reactivate_member.
  update public.members set status = 'archived' where id = b.member_id;
  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format($q$select public.update_member(%L, '{"status":"active"}'::jsonb)$q$, b.member_id),
    '22023', null, 'Aus dem Archiv holt update_member nicht');
  perform set_config('role', 'postgres', true);
end; $f$;

select plan(1);
select pass('Haertung Welle 3: Testfunktionen definiert');
