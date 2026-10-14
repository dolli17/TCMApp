-- ===========================================================================
-- E-Mail ist Pflicht: jedes Mitglied bekommt einen Login
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
-- ===========================================================================

create or replace function tests.test_email_create_member_ohne_email_abgewiesen()
returns setof text language plpgsql as $f$
declare a record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    $q$select public.create_member('Ohne', 'Adresse')$q$,
    '22023', 'Ohne E-Mail-Adresse kann kein Mitglied angelegt werden.',
    'create_member ohne E-Mail wird abgewiesen');
  return next throws_ok(
    $q$select public.create_member('Leere', 'Adresse', '   ')$q$,
    '22023', 'Ohne E-Mail-Adresse kann kein Mitglied angelegt werden.',
    'Eine leere Adresse zaehlt nicht');
  return next lives_ok(
    $q$select public.create_member('Mit', 'Adresse', '  Mit.Adresse@Example.org ')$q$,
    'Mit Adresse geht es');

  perform set_config('role', 'postgres', true);

  return next is(
    (select email::text from public.members where last_name = 'Adresse' and first_name = 'Mit'),
    'mit.adresse@example.org', 'Die Adresse wird bereinigt abgelegt');
end; $f$;

create or replace function tests.test_email_update_member_kann_email_nicht_leeren()
returns setof text language plpgsql as $f$
declare a record; v_mem uuid := tests.fixture_member('Leeren');
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format($q$select public.update_member(%L, '{"email":""}'::jsonb)$q$, v_mem),
    '22023', null, 'update_member leert die E-Mail nicht (leere Zeichenkette)');
  return next throws_ok(
    format($q$select public.update_member(%L, '{"email":null}'::jsonb)$q$, v_mem),
    '22023', null, 'Und auch nicht mit null');
  return next lives_ok(
    format($q$select public.update_member(%L, '{"email":"neu.leeren@example.org"}'::jsonb)$q$, v_mem),
    'Eine andere Adresse eintragen geht');

  perform set_config('role', 'postgres', true);

  return next is((select email::text from public.members where id = v_mem),
    'neu.leeren@example.org', 'Die neue Adresse steht drin');
end; $f$;

create or replace function tests.test_email_regel_greift_bei_insert_und_update()
returns setof text language plpgsql as $f$
declare v_mem uuid := tests.fixture_member('Regel');
begin
  return next throws_ok(
    $q$insert into public.members (first_name, last_name) values ('Direkt', 'Ohne')$q$,
    '23514', 'Ohne E-Mail-Adresse kann kein Mitglied angelegt werden.',
    'Ein INSERT ohne E-Mail scheitert auch an der Datenbank');
  return next throws_ok(
    $q$insert into public.members (first_name, last_name, email) values ('Direkt', 'Leer', ' ')$q$,
    '23514', null, 'Ein INSERT mit leerer E-Mail ebenso');
  return next throws_ok(
    format($q$update public.members set email = null where id = %L$q$, v_mem),
    '23514', null, 'Ein UPDATE, das die E-Mail entfernt, scheitert');
  return next lives_ok(
    format($q$update public.members set phone = '0711 1' where id = %L$q$, v_mem),
    'Ein UPDATE anderer Felder laeuft');
end; $f$;

create or replace function tests.test_email_altbestand_bleibt_bearbeitbar()
returns setof text language plpgsql as $f$
declare a record; v_alt uuid := tests.fixture_altbestand('Alt'); v_zeile record;
begin
  select * into a from tests.fixture_user('admin') limit 1;

  return next lives_ok(
    format($q$update public.members set phone = '0711 2' where id = %L$q$, v_alt),
    'Beim Altbestand ohne E-Mail laeuft ein UPDATE anderer Felder');

  perform tests.act_as(a.auth_id);

  return next ok(exists (select 1 from public.members where id = v_alt),
    'Der Vorstand sieht den Altbestand weiter');
  return next lives_ok(
    format($q$select public.update_member(%L, '{"mobile":"0170 1"}'::jsonb)$q$, v_alt),
    'update_member aendert beim Altbestand andere Felder');
  return next lives_ok(
    format($q$select public.update_member(%L, '{"email":""}'::jsonb)$q$, v_alt),
    'Ein leeres E-Mail-Feld laesst den Altbestand, wie er ist');

  select * into v_zeile from public.member_login_state(v_alt);
  return next is(v_zeile.einladbar, false, 'Ohne E-Mail ist der Altbestand nicht einladbar');
  return next matches(v_zeile.grund, '^Altbestand: E-Mail fehlt', 'Und heisst so');

  return next lives_ok(
    format($q$select public.update_member(%L, '{"email":"alt.nachgetragen@example.org"}'::jsonb)$q$, v_alt),
    'Eine Adresse nachtragen geht');

  select * into v_zeile from public.member_login_state(v_alt);
  perform set_config('role', 'postgres', true);

  return next is(v_zeile.einladbar, true, 'Danach ist er einladbar');
  return next is((select mobile from public.members where id = v_alt), '0170 1',
    'Die Aenderung am Altbestand ist gespeichert');
end; $f$;

create or replace function tests.test_email_antrag_laedt_immer_ein()
returns setof text language plpgsql as $f$
declare a record; v_a uuid; v_e record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform public.submit_membership_application(
    tests.antrag_daten('immer.einladen@example.org', 'Immer'));
  select id into v_a from public.membership_applications where email = 'immer.einladen@example.org';

  perform tests.act_as(a.auth_id);
  select * into v_e from public.accept_membership_application(v_a);
  perform set_config('role', 'postgres', true);

  return next is(v_e.needs_invite, true, 'Nach der Annahme wird immer eingeladen');
end; $f$;

-- ---------------------------------------------------------------------------
-- members_ohne_login: nur fuer den Dienstschluessel
-- ---------------------------------------------------------------------------
create or replace function tests.test_email_members_ohne_login_rechte()
returns setof text language plpgsql as $f$
declare a record;
begin
  select * into a from tests.fixture_user('admin') limit 1;

  return next ok(not has_function_privilege('anon', 'public.members_ohne_login()', 'execute'),
    'anon darf members_ohne_login nicht aufrufen');
  return next ok(not has_function_privilege('authenticated', 'public.members_ohne_login()', 'execute'),
    'authenticated auch nicht');
  return next ok(has_function_privilege('service_role', 'public.members_ohne_login()', 'execute'),
    'service_role schon');

  perform tests.act_as(a.auth_id);
  return next throws_ok($q$select * from public.members_ohne_login()$q$, '42501', null,
    'Auch ein Admin bekommt die Liste nicht');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_email_members_ohne_login_abgleich()
returns setof text language plpgsql as $f$
declare
  v_frei    uuid := tests.fixture_member('Frei');
  v_konto   uuid := tests.fixture_member('Kontohaber');
  v_vergeben uuid := tests.fixture_member('Vergeben');
  v_alt     uuid := tests.fixture_altbestand('Alt');
  v_besitzer record;
  v_auth    uuid := gen_random_uuid();
  v_auth2   uuid := gen_random_uuid();
  v_mail    text;
  r         record;
begin
  -- Freies Konto mit derselben Adresse (anders geschrieben)
  select email::text into v_mail from public.members where id = v_konto;
  insert into auth.users (id, email, aud, role)
  values (v_auth, upper(v_mail), 'authenticated', 'authenticated');

  -- Konto zur Adresse gehoert schon einem anderen Mitglied
  select * into v_besitzer from tests.fixture_user(null, 'Besitzer') limit 1;
  update public.members set email = 'vergeben-' || v_auth2 || '@example.org' where id = v_vergeben;
  update auth.users set email = 'vergeben-' || v_auth2 || '@example.org' where id = v_besitzer.auth_id;

  perform set_config('role', 'service_role', true);

  select * into r from public.members_ohne_login() where id = v_frei;
  return next ok(r.konto_id is null and r.ist_testadresse and r.email like 'fixture-%',
    'Ohne Konto: Adresse und Testadresse, kein Konto');

  select * into r from public.members_ohne_login() where id = v_konto;
  return next is(r.konto_id, v_auth, 'Ein freies Konto wird ohne Ruecksicht auf die Schreibweise gefunden');
  return next is(r.konto_mitglied, null, 'Es gehoert keinem Mitglied');

  select * into r from public.members_ohne_login() where id = v_vergeben;
  return next is(r.konto_id, v_besitzer.auth_id, 'Das vergebene Konto wird gefunden');
  return next matches(r.konto_mitglied, '^Besitzer ', 'Mit dem Namen des Besitzers');

  select * into r from public.members_ohne_login() where id = v_alt;
  return next ok(r.id is not null and r.email is null, 'Der Altbestand ohne E-Mail steht drin');

  return next ok(not exists (select 1 from public.members_ohne_login() where id = v_besitzer.member_id),
    'Wer schon einen Login hat, fehlt');

  perform set_config('role', 'postgres', true);
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer die E-Mail-Pflicht sind eingespielt');
select * from extensions.finish();
