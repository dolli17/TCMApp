-- ===========================================================================
-- Haertung Welle 4: Rechte und Grenzen (B7, S6, S8, S15, S17, S21, S26)
--
--   1. B7: Die Lastschriftdatei liegt je Versuch unter einem eigenen Pfad.
--      Im Bucket sepa gibt es bewusst kein Aendern; ein zweiter Versuch
--      unter neuem Pfad geht durch, und der Lauf nimmt ihn an. Den Pfad baut
--      das Web (lastschriftPfad in @tcm/core, dort unter Test).
--   2. S6: Die Herkunft eines Antrags kommt aus dem Anfragekopf
--      x-forwarded-for (erster Eintrag), nicht aus p_ip.
--   3. S8: Keine Funktion in private ist fuer PUBLIC ausfuehrbar, auch keine
--      kuenftige. authenticated behaelt, was die Policies brauchen, anon nur
--      is_admin() fuer legal_documents.
--   4. S15: Mitglieder lesen aus bookings nur die Spalten fuer den Plan, und
--      fremde Buchungen nur bis eine Woche zurueck.
--   5. S17: Mitglieder lesen notes, import_notes und legacy_data nicht, auch
--      die eigenen nicht. Admins lesen die Notizen ueber member_notes().
--   6. S21: Freitext hat eine Laengengrenze.
--   7. S26: register_push_token haengt kein Geraet um, das noch einem
--      anderen Mitglied mit Zugang gehoert.
--
-- Fixtures aus 01_constraints.sql (fixture_court), 02_rls.sql (fixture_user,
-- act_as, act_as_anon), 03_rpc_bookings.sql (naechster_slot),
-- 04_mitglieder.sql (antrag_daten), 16_benachrichtigungs_pushes.sql
-- (fixture_user_mit_geraet).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- B7: neuer Pfad je Versuch
-- ---------------------------------------------------------------------------

create or replace function tests.test_welle4_lastschriftdatei_neuer_pfad_je_versuch()
returns setof text language plpgsql as $f$
declare adm record; v_batch uuid := gen_random_uuid(); v_n integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;

  perform tests.act_as(adm.auth_id);
  insert into storage.objects (bucket_id, name)
  values ('sepa', v_batch || '/versuch-1/lastschrift.xml');
  -- Ein Upsert auf denselben Pfad waere ein UPDATE. Das bleibt verboten:
  -- eine abgelegte Datei ist ein Beleg.
  update storage.objects set metadata = '{}'::jsonb
   where bucket_id = 'sepa' and name = v_batch || '/versuch-1/lastschrift.xml';
  get diagnostics v_n = row_count;
  return next is(v_n, 0, 'Eine abgelegte Datei laesst sich nicht ueberschreiben');
  return next lives_ok(format(
    $q$insert into storage.objects (bucket_id, name) values ('sepa', %L)$q$,
    v_batch || '/versuch-2/lastschrift.xml'),
    'Ein zweiter Versuch unter eigenem Pfad geht durch');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- S6: Herkunft aus dem Anfragekopf
-- ---------------------------------------------------------------------------

create or replace function tests.test_welle4_antrag_herkunft_aus_dem_kopf()
returns setof text language plpgsql as $f$
declare v_hash text; v_erwartet text := private.hash_ip('203.0.113.50');
        v_a jsonb := tests.antrag_daten('kopf@example.org');
        v_b jsonb := tests.antrag_daten('ohnekopf@example.org');
begin
  perform set_config('request.headers',
    '{"x-forwarded-for": "203.0.113.50, 10.0.0.1"}', true);
  perform tests.act_as_anon();
  -- Wer p_ip setzt, bestimmt seine Herkunft nicht mehr selbst.
  perform public.submit_membership_application(v_a, '198.51.100.99');
  perform set_config('role', 'postgres', true);

  select ip_hash into v_hash from public.membership_applications where email = 'kopf@example.org';
  return next is(v_hash, v_erwartet, 'Die Herkunft ist der erste Eintrag aus x-forwarded-for');

  perform set_config('request.headers', null, true);
  perform tests.act_as_anon();
  perform public.submit_membership_application(v_b, '198.51.100.99');
  perform set_config('role', 'postgres', true);
  select ip_hash into v_hash from public.membership_applications where email = 'ohnekopf@example.org';
  return next is(v_hash, null, 'Ohne Kopf keine Herkunft, auch wenn p_ip gesetzt ist');
end; $f$;

-- ---------------------------------------------------------------------------
-- S8: Funktionsrechte in private
-- ---------------------------------------------------------------------------

create or replace function tests.test_welle4_private_nicht_fuer_public()
returns setof text language plpgsql as $f$
declare v_offen text; v_auth text; v_anon text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_offen
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                 where a.grantee = 0 and a.privilege_type = 'EXECUTE');
  return next is(v_offen, null, 'Keine Funktion in private ist fuer PUBLIC ausfuehrbar');

  select string_agg(p.proname, ', ' order by p.proname) into v_auth
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute');
  return next is(v_auth,
    'can_view_member, current_member_id, darf_plaetze, has_full_rights, has_role, is_admin, is_kiosk, is_member',
    'authenticated fuehrt nur aus, was Policies und Rechtepruefung brauchen');

  select string_agg(p.proname, ', ' order by p.proname) into v_anon
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute');
  return next is(v_anon, 'is_admin', 'anon nur is_admin() fuer die Policy auf legal_documents');

  -- Auch was kuenftig in private entsteht, ist nicht fuer PUBLIC offen.
  create function private.zz_test_neu() returns integer language sql as 'select 1';
  return next ok(not has_function_privilege('anon', 'private.zz_test_neu()', 'execute'),
    'Eine neue Funktion ist nicht automatisch ausfuehrbar');
end; $f$;

create or replace function tests.test_welle4_rls_greift_weiter()
returns setof text language plpgsql as $f$
declare a record; adm record; v_n integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;

  perform tests.act_as(a.auth_id);
  return next lives_ok('select count(*) from public.courts', 'Mitglied liest die Plaetze');
  return next lives_ok('select count(*) from public.members', 'und Mitglieder');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  return next lives_ok('select count(*) from public.bank_accounts', 'Admin liest Bankverbindungen');
  perform set_config('role', 'postgres', true);

  perform tests.act_as_anon();
  return next lives_ok('select count(*) from public.legal_documents', 'anon liest die Rechtstexte');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- S15: Buchungen, Spalten und Zeitraum
-- ---------------------------------------------------------------------------

create or replace function tests.test_welle4_buchungen_spalten_und_zeitraum()
returns setof text language plpgsql as $f$
declare a record; b record; adm record; v_court uuid := tests.fixture_court();
        v_einzel uuid := (select id from public.booking_types where code = 'einzel');
        v_alt uuid; v_eigen uuid; v_neu uuid; s1 timestamptz := tests.naechster_slot(2, 17);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;

  insert into public.bookings (court_id, member_id, slot, booking_type_id, cancellation_reason, booking_code)
  values (v_court, b.member_id, tstzrange(now() - interval '30 days', now() - interval '30 days' + interval '1 hour'),
          v_einzel, 'privat', 'X1')
  returning id into v_alt;
  insert into public.bookings (court_id, member_id, slot, booking_type_id)
  values (v_court, a.member_id, tstzrange(now() - interval '31 days', now() - interval '31 days' + interval '1 hour'),
          v_einzel)
  returning id into v_eigen;
  insert into public.bookings (court_id, member_id, slot, booking_type_id)
  values (v_court, b.member_id, tstzrange(s1, s1 + interval '1 hour'), v_einzel)
  returning id into v_neu;

  perform tests.act_as(a.auth_id);
  return next is((select count(*)::integer from public.bookings where id = v_neu), 1,
    'Eine kuenftige fremde Buchung steht im Plan');
  return next lives_ok('select id, court_id, slot, kind, booking_type_id, member_id, series_id, title, status, partner_wanted, created_at from public.bookings',
    'mit allen Spalten, die der Plan braucht');
  return next throws_ok('select cancellation_reason from public.bookings', '42501', null,
    'Den Stornogrund liest ein Mitglied nicht');
  return next throws_ok('select booking_code from public.bookings', '42501', null, 'den Buchungscode nicht');
  return next throws_ok('select created_by from public.bookings', '42501', null, 'wer gebucht hat, nicht');
  return next throws_ok('select cancelled_by from public.bookings', '42501', null, 'wer storniert hat, nicht');
  return next is((select count(*)::integer from public.bookings where id = v_alt), 0,
    'Eine fremde Buchung von vor einem Monat nicht');
  return next is((select count(*)::integer from public.bookings where id = v_eigen), 1,
    'Die eigene schon');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  return next is((select count(*)::integer from public.bookings where id = v_alt), 1,
    'Der Admin sieht auch alte Buchungen');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- S17: Notizen am Mitglied
-- ---------------------------------------------------------------------------

create or replace function tests.test_welle4_notizen_nur_fuer_admins()
returns setof text language plpgsql as $f$
declare a record; adm record;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;
  update public.members set notes = 'Intern', import_notes = 'eBuSy', legacy_data = '{"x":1}'
   where id = a.member_id;

  perform tests.act_as(a.auth_id);
  return next lives_ok(
    'select id, first_name, last_name, email, phone, mobile, street, postcode, city, status, is_team_captain, onboarding_completed_at from public.members',
    'Ein Mitglied liest seine Stammdaten weiter');
  return next throws_ok('select notes from public.members', '42501', null, 'aber nicht die Notizen');
  return next throws_ok('select import_notes from public.members', '42501', null, 'nicht die Importnotizen');
  return next throws_ok('select legacy_data from public.members', '42501', null, 'nicht die Altdaten');
  return next throws_ok(format('select public.member_notes(%L)', a.member_id), '42501', null,
    'und auch nicht ueber member_notes()');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  return next is(public.member_notes(a.member_id), 'Intern', 'Der Admin liest die Notizen');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- S21: Laengengrenzen
-- ---------------------------------------------------------------------------

create or replace function tests.test_welle4_freitext_hat_grenzen()
returns setof text language plpgsql as $f$
declare a record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(3, 10);
begin
  select * into a from tests.fixture_user() limit 1;
  insert into public.bookings (court_id, member_id, slot, booking_type_id)
  values (v_court, a.member_id, tstzrange(s1, s1 + interval '1 hour'),
          (select id from public.booking_types where code = 'einzel'))
  returning id into v_id;

  return next throws_ok(format(
    $q$insert into public.booking_players (booking_id, guest_name) values (%L, repeat('g', 101))$q$, v_id),
    '23514', null, 'Ein Gastname hat hoechstens 100 Zeichen');
  return next lives_ok(format(
    $q$insert into public.booking_players (booking_id, guest_name) values (%L, repeat('g', 100))$q$, v_id),
    '100 gehen');
  return next throws_ok(format(
    $q$update public.bookings set cancellation_reason = repeat('r', 501) where id = %L$q$, v_id),
    '23514', null, 'Ein Stornogrund hat hoechstens 500 Zeichen');
  return next throws_ok(format(
    $q$update public.bookings set title = repeat('t', 201) where id = %L$q$, v_id),
    '23514', null, 'Ein Buchungstitel hoechstens 200');
  return next throws_ok(format(
    $q$update public.members set first_name = repeat('n', 101) where id = %L$q$, a.member_id),
    '23514', null, 'Ein Vorname hoechstens 100');
  return next throws_ok(format(
    $q$update public.members set last_name = repeat('n', 101) where id = %L$q$, a.member_id),
    '23514', null, 'Ein Nachname hoechstens 100');
  return next throws_ok(
    $q$insert into public.membership_applications (first_name, last_name, email, birthday, message)
       values ('A', 'B', 'lang@example.org', '1990-01-01', repeat('m', 2001))$q$,
    '23514', null, 'Eine Antragsnachricht hoechstens 2000');
end; $f$;

-- ---------------------------------------------------------------------------
-- S26: Push-Geraete umhaengen
-- ---------------------------------------------------------------------------

create or replace function tests.test_welle4_push_token_nicht_fremd_umhaengen()
returns setof text language plpgsql as $f$
declare a record; b record; c record;
begin
  select * into a from tests.fixture_user_mit_geraet() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user_mit_geraet() limit 1;
  update public.push_tokens set disabled_at = now() where token = c.token;

  perform tests.act_as(b.auth_id);
  return next throws_ok(format($q$select public.register_push_token(%L, 'ios')$q$, a.token),
    '23514', null, 'Ein aktives Geraet eines anderen Mitglieds haengt niemand um');
  return next lives_ok(format($q$select public.register_push_token(%L, 'android')$q$, c.token),
    'Ein stillgelegtes schon');
  perform set_config('role', 'postgres', true);

  return next is((select member_id from public.push_tokens where token = a.token), a.member_id,
    'Das aktive bleibt beim Besitzer');
  return next is((select member_id from public.push_tokens where token = c.token), b.member_id,
    'Das stillgelegte zieht um und lebt wieder auf');
  return next is((select disabled_at from public.push_tokens where token = c.token), null,
    'ohne Stilllegung');

  perform tests.act_as(a.auth_id);
  return next lives_ok(format($q$select public.register_push_token(%L, 'ios')$q$, a.token),
    'Das eigene Geraet erneut anmelden geht');
  perform set_config('role', 'postgres', true);

  -- Wer keinen Zugang mehr hat, haelt sein Geraet nicht fest.
  perform set_config('request.jwt.claims', null, true);
  update public.members set status = 'archived' where id = a.member_id;
  perform tests.act_as(b.auth_id);
  return next lives_ok(format($q$select public.register_push_token(%L, 'ios')$q$, a.token),
    'Das Geraet eines Archivierten zieht um');
  perform set_config('role', 'postgres', true);
end; $f$;

select plan(1);
select pass('Haertung Welle 4: Testfunktionen definiert');
