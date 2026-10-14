-- ===========================================================================
-- Jedes Mitglied hat eine E-Mail-Adresse und einen Login
--
-- Beides sichern CHECKs ab (members_email_pflicht, members_login_pflicht),
-- Archivierte sind ausgenommen. Der Login entsteht vor dem Mitglied und geht
-- create_member bzw. accept_membership_application als p_auth_user_id mit.
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- E-Mail-Pflicht
-- ---------------------------------------------------------------------------
create or replace function tests.test_email_create_member_ohne_email_abgewiesen()
returns setof text language plpgsql as $f$
declare a record; v_login uuid := tests.fixture_login('mit.adresse@example.org');
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
    format($q$select public.create_member('Mit', 'Adresse', '  Mit.Adresse@Example.org ',
                                          p_auth_user_id => %L)$q$, v_login),
    'Mit Adresse und Login geht es');

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

create or replace function tests.test_email_regel_ist_check()
returns setof text language plpgsql as $f$
declare v_mem uuid := tests.fixture_member('Regel'); v_login uuid := tests.fixture_login();
begin
  return next col_has_check('public', 'members', array['status', 'email']::name[],
    'members.email hat einen CHECK');
  return next hasnt_trigger('public', 'members', 'members_email_pflicht',
    'Der Trigger aus PR A ist durch den CHECK ersetzt');
  return next ok((select convalidated from pg_constraint
                   where conname = 'members_email_pflicht'
                     and conrelid = 'public.members'::regclass),
    'Der CHECK ist validiert');

  return next throws_ok(
    format($q$insert into public.members (first_name, last_name, auth_user_id)
              values ('Direkt', 'Ohne', %L)$q$, v_login),
    '23514', null, 'Ein aktives Mitglied ohne E-Mail scheitert an der Datenbank');
  return next throws_ok(
    format($q$insert into public.members (first_name, last_name, email, auth_user_id)
              values ('Direkt', 'Leer', ' ', %L)$q$, v_login),
    '23514', null, 'Eine leere E-Mail ebenso');
  return next throws_ok(
    format($q$update public.members set email = null where id = %L$q$, v_mem),
    '23514', null, 'Ein UPDATE, das die E-Mail entfernt, scheitert');
  return next lives_ok(
    format($q$update public.members set phone = '0711 1' where id = %L$q$, v_mem),
    'Ein UPDATE anderer Felder laeuft');
  return next lives_ok(
    $q$insert into public.members (first_name, last_name, status)
       values ('Archiv', 'Ohne Alles', 'archived')$q$,
    'Ein archiviertes Mitglied darf ohne E-Mail und Login sein');
end; $f$;

-- ---------------------------------------------------------------------------
-- Login-Pflicht
-- ---------------------------------------------------------------------------
create or replace function tests.test_login_regel_ist_check()
returns setof text language plpgsql as $f$
declare v_mem uuid := tests.fixture_member('Login'); v_auth uuid;
begin
  return next col_has_check('public', 'members', array['status', 'auth_user_id']::name[],
    'members.auth_user_id hat einen CHECK');
  return next ok((select convalidated from pg_constraint
                   where conname = 'members_login_pflicht'
                     and conrelid = 'public.members'::regclass),
    'Der CHECK ist validiert');

  return next throws_ok(
    $q$insert into public.members (first_name, last_name, email)
       values ('Ohne', 'Login', 'ohne.login@example.org')$q$,
    '23514', null, 'Ein aktives Mitglied ohne Login scheitert an der Datenbank');
  return next throws_ok(
    $q$insert into public.members (first_name, last_name, email, status)
       values ('Inaktiv', 'Ohne Login', 'inaktiv.ohne@example.org', 'inactive')$q$,
    '23514', null, 'Ein inaktives auch');
  return next throws_ok(
    format($q$update public.members set auth_user_id = null where id = %L$q$, v_mem),
    '23514', null, 'Den Login eines aktiven Mitglieds entfernen scheitert');

  -- Auch nicht ueber den Fremdschluessel (on delete set null).
  select auth_user_id into v_auth from public.members where id = v_mem;
  return next throws_ok(
    format($q$delete from auth.users where id = %L$q$, v_auth),
    '23514', null, 'Den Login loeschen scheitert, solange das Mitglied aktiv ist');

  return next lives_ok(
    format($q$update public.members set status = 'archived', auth_user_id = null where id = %L$q$, v_mem),
    'Archiviert darf der Login fehlen');
  return next throws_ok(
    format($q$update public.members set status = 'active' where id = %L$q$, v_mem),
    '23514', null, 'Ohne Login wird ein Archivierter nicht wieder aktiv');
end; $f$;

create or replace function tests.test_login_create_member_braucht_login()
returns setof text language plpgsql as $f$
declare
  a        record;
  b        record;
  v_kiosk  uuid := tests.fixture_login('kiosk-test@example.org');
  v_fremd  uuid := tests.fixture_login('fremd@example.org');
  v_login  uuid := tests.fixture_login('neu.login@example.org');
  v_id     uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user(null, 'Besitzer') limit 1;
  insert into public.kiosk_devices (auth_user_id, name) values (v_kiosk, 'Testkiosk');
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    $q$select public.create_member('Ohne', 'Login', 'ohne.login@example.org')$q$,
    '22023', 'Ohne Login kann kein Mitglied angelegt werden.',
    'create_member ohne Login wird abgewiesen');
  return next throws_ok(
    format($q$select public.create_member('Kiosk', 'Konto', 'kiosk-test@example.org',
                                          p_auth_user_id => %L)$q$, v_kiosk),
    '23514', null, 'Ein Kiosk-Konto wird kein Mitglied');
  return next throws_ok(
    format($q$select public.create_member('Fremde', 'Adresse', 'andere@example.org',
                                          p_auth_user_id => %L)$q$, v_fremd),
    '22023', 'Der Login gehoert zu einer anderen E-Mail-Adresse als das Mitglied.',
    'Login und Mitglied muessen dieselbe Adresse haben');
  return next throws_ok(
    format($q$select public.create_member('Doppelt', 'Login', 'doppelt@example.org',
                                          p_auth_user_id => %L)$q$, b.auth_id),
    '23514', 'Dieser Zugang gehoert bereits zu einem anderen Mitglied.',
    'Ein vergebener Login wird nicht noch einmal vergeben');
  return next throws_ok(
    format($q$select public.create_member('Kein', 'Konto', 'kein.konto@example.org',
                                          p_auth_user_id => %L)$q$, gen_random_uuid()),
    'P0002', null, 'Ein Login, den es nicht gibt, wird abgewiesen');

  v_id := public.create_member('Neu', 'Mit Login', 'Neu.Login@example.org', p_auth_user_id => v_login);
  perform set_config('role', 'postgres', true);

  return next is((select auth_user_id from public.members where id = v_id), v_login,
    'create_member verknuepft den Login');
  return next ok((select invited_at is not null from public.members where id = v_id),
    'und haelt den Zeitpunkt der Einladung fest');
  return next ok(exists (select 1 from public.memberships where member_id = v_id),
    'Die Mitgliedschaft entsteht mit');
end; $f$;

create or replace function tests.test_login_kein_zahler_parameter()
returns setof text language plpgsql as $f$
begin
  return next hasnt_function('public', 'create_member',
    array['text', 'text', 'text', 'date', 'gender', 'salutation', 'text', 'text', 'text',
          'text', 'text', 'text', 'text', 'uuid', 'text', 'text', 'date', 'uuid[]'],
    'create_member mit p_billing_payer_id ist entfernt');
  return next ok(
    exists (select 1 from pg_proc p
             where p.oid = 'public.accept_membership_application(uuid, text, uuid[], date, uuid)'::regprocedure
               and 'p_auth_user_id' = any (p.proargnames)
               and not 'p_billing_payer_id' = any (p.proargnames)),
    'accept_membership_application nimmt p_auth_user_id statt eines Zahlers');
  return next hasnt_function('public', 'unlink_auth_user', array['uuid'],
    'unlink_auth_user ist entfernt');
  return next hasnt_function('public', 'members_ohne_login', '{}'::name[],
    'members_ohne_login ist entfernt');
end; $f$;

-- ---------------------------------------------------------------------------
-- O25: Kiosk-Konten lassen sich nicht verknuepfen
-- ---------------------------------------------------------------------------
create or replace function tests.test_login_kiosk_nicht_verknuepfbar()
returns setof text language plpgsql as $f$
declare
  a       record;
  v_kiosk uuid := tests.fixture_login('kiosk-link@example.org');
  v_arch  uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  insert into public.kiosk_devices (auth_user_id, name) values (v_kiosk, 'Testkiosk');
  insert into public.members (first_name, last_name, status)
  values ('Archiv', 'Kiosk', 'archived') returning id into v_arch;

  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format($q$select public.link_auth_user(%L, %L)$q$, v_arch, v_kiosk),
    '23514', 'Dieser Zugang gehoert zu einem Kiosk-Geraet und laesst sich keinem Mitglied zuordnen.',
    'link_auth_user weist das Kiosk-Konto ab (Admin)');
  perform set_config('role', 'postgres', true);

  -- Die Edge Function ruft ohne angemeldeten Nutzer, mit dem Dienstschluessel.
  perform set_config('request.jwt.claims', null, true);
  perform set_config('role', 'service_role', true);
  return next throws_ok(
    format($q$select public.link_auth_user(%L, %L)$q$, v_arch, v_kiosk),
    '23514', null, 'Auch mit dem Dienstschluessel');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Anonymisieren und Archivieren laufen weiter
-- ---------------------------------------------------------------------------
create or replace function tests.test_login_anonymisieren_und_archivieren()
returns setof text language plpgsql as $f$
declare a record; v_anon uuid := tests.fixture_member('Anon'); v_arch uuid := tests.fixture_member('Arch');
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.act_as(a.auth_id);

  return next lives_ok(
    format($q$select public.anonymize_member(%L, 'Test')$q$, v_anon),
    'anonymize_member laeuft trotz E-Mail- und Login-Pflicht');
  return next lives_ok(
    format($q$select * from public.archive_member(%L)$q$, v_arch),
    'archive_member laeuft');

  perform set_config('role', 'postgres', true);

  return next ok(
    (select status = 'archived' and email is null and auth_user_id is null
       from public.members where id = v_anon),
    'Anonymisiert: archiviert, ohne Adresse und ohne Login');
  return next ok(
    (select status = 'archived' and auth_user_id is not null from public.members where id = v_arch),
    'Archiviert: der Login bleibt, bis jemand anonymisiert oder loescht');
end; $f$;

-- ---------------------------------------------------------------------------
-- Antrag annehmen: mit Login, und alles oder nichts
-- ---------------------------------------------------------------------------
create or replace function tests.test_login_antrag_annehmen_mit_login()
returns setof text language plpgsql as $f$
declare a record; v_a uuid; v_e record; v_login uuid := tests.fixture_login('mit.login@example.org');
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform public.submit_membership_application(
    tests.antrag_daten('mit.login@example.org', 'MitLogin'));
  select id into v_a from public.membership_applications where email = 'mit.login@example.org';

  perform tests.act_as(a.auth_id);
  select * into v_e from public.accept_membership_application(v_a, p_auth_user_id => v_login);
  perform set_config('role', 'postgres', true);

  return next is((select auth_user_id from public.members where id = v_e.member_id), v_login,
    'Das neue Mitglied hat den Login');
  return next ok(v_e.membership_number is not null, 'und eine Mitgliedsnummer');
  return next is((select status::text from public.membership_applications where id = v_a), 'accepted',
    'Der Antrag ist angenommen');
end; $f$;

create or replace function tests.test_login_antrag_ohne_login_bleibt_offen()
returns setof text language plpgsql as $f$
declare a record; b record; v_a uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user(null, 'Besitzer') limit 1;

  -- Eine Einwilligung, die bei der Annahme uebertragen wuerde.
  perform tests.fixture_merkmal('t_offen_foto', 'boolean', true);

  perform public.submit_membership_application(
    tests.antrag_daten('offen.bleiben@example.org', 'Offen')
      || jsonb_build_object('attribute_choices', jsonb_build_object('t_offen_foto', true)));
  select id into v_a from public.membership_applications where email = 'offen.bleiben@example.org';

  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format($q$select * from public.accept_membership_application(%L)$q$, v_a),
    '22023', 'Ohne Login kann kein Mitglied angelegt werden.',
    'Ohne Login wird kein Antrag angenommen');
  -- Der Login gehoert schon jemand anderem: create_member scheitert mitten in
  -- der Annahme.
  return next throws_ok(
    format($q$select * from public.accept_membership_application(%L, p_auth_user_id => %L)$q$,
           v_a, b.auth_id),
    '23514', null, 'Mit fremdem Login auch nicht');
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.membership_applications where id = v_a), 'new',
    'Der Antrag bleibt offen');
  return next ok(not exists (select 1 from public.members where email = 'offen.bleiben@example.org'),
    'Es entsteht kein Mitglied');
  return next ok(not exists (select 1 from public.member_attribute_values v
                              join public.members m on m.id = v.member_id
                              where m.email = 'offen.bleiben@example.org'),
    'und keine uebertragenen Einwilligungen');
end; $f$;

-- ---------------------------------------------------------------------------
-- Login-Status ohne Altbestand
-- ---------------------------------------------------------------------------
create or replace function tests.test_login_status_ohne_altbestand()
returns setof text language plpgsql as $f$
declare a record; v_mem uuid := tests.fixture_member('Status'); v_arch uuid; v_zeile record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  insert into public.members (first_name, last_name, status)
  values ('Archiv', 'Status', 'archived') returning id into v_arch;

  perform tests.act_as(a.auth_id);
  select * into v_zeile from public.member_login_state(v_mem);
  return next ok(v_zeile.hat_zugang and v_zeile.grund is null, 'Aktiv: Zugang, kein Hinweis');
  select * into v_zeile from public.member_login_state(v_arch);
  return next ok(not v_zeile.hat_zugang, 'Archiviert ohne Login: kein Zugang');
  return next is(v_zeile.grund, 'Archivierte Mitglieder bekommen keinen Zugang.', 'mit Begruendung');
  perform set_config('role', 'postgres', true);
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer E-Mail- und Login-Pflicht sind eingespielt');
