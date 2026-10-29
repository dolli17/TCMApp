-- ===========================================================================
-- RPCs fuer die nativen Apps (Migration app_rpcs)
--
-- Die Zusagen:
--
--   1. Jede neue RPC liefert nur Eigenes, auch einem Admin.
--   2. Ohne Zugang gibt es nichts (Lesen) bzw. eine Ablehnung (Schreiben),
--      ohne Anmeldung ist keine aufrufbar.
--   3. save_my_profile und save_my_notfallkontakt laufen als Aufrufer, also
--      ueber Policy, Spalten-Grant und guard_member_self_update. Andere
--      Spalten nehmen sie gar nicht erst an.
--   4. push_tokens.provider: Standard 'expo', nur expo/apns/fcm.
--      register_push_token geht weiter mit zwei Parametern,
--      claim_notification_pushes liefert die Anbieter mit und in tokens nur
--      Expo-Marken.
--
-- Fixtures aus 02_rls.sql (fixture_user, act_as), 03_rpc_bookings.sql
-- (fixture_court), 13_lastschrift.sql (fixture_mandat), 17_mannschaften.sql
-- (fixture_team), 25_veranstaltungen.sql (fixture_event).
-- ===========================================================================

create or replace function tests.test_app_ich()
returns setof text language plpgsql as $f$
declare a record; b record; p record; r record; i record;
begin
  select * into a from tests.fixture_user(null, 'Ich') limit 1;
  select * into b from tests.fixture_user('board', 'Vorstand') limit 1;
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into r from tests.fixture_user('board', 'Archiv') limit 1;
  update public.members set status = 'archived', login_disabled_at = now() where id = r.member_id;

  perform tests.act_as(a.auth_id);
  select * into i from public.ich();
  perform set_config('role', 'postgres', true);
  return next is(i.member_id, a.member_id, 'ich: die eigene member_id');
  return next is(i.first_name, 'Ich', 'ich: der eigene Vorname');
  return next is(i.roles, array['member']::public.app_role[], 'ich: die eigenen Rollen');
  return next ok(not i.admin and not i.platz_rechte and not i.kiosk,
    'ich: ein Mitglied hat keine besonderen Rechte');
  return next ok(i.zugang and i.grund is null and not i.onboarding_offen,
    'ich: Zugang wie mein_zugang');

  perform tests.act_as(b.auth_id);
  select * into i from public.ich();
  perform set_config('role', 'postgres', true);
  return next ok(i.admin and i.platz_rechte, 'ich: Vorstand hat volle Rechte und Platzrechte');

  perform tests.act_as(p.auth_id);
  select * into i from public.ich();
  perform set_config('role', 'postgres', true);
  return next ok(not i.admin and i.platz_rechte, 'ich: Platzwart hat nur Platzrechte');

  perform tests.act_as(r.auth_id);
  select * into i from public.ich();
  perform set_config('role', 'postgres', true);
  return next ok(i.member_id is null and i.first_name is null and i.roles = '{}'
                 and not i.admin and not i.platz_rechte,
    'ich: ohne Zugang weder Id noch Name noch Rechte, auch nicht mit Vorstandsrolle');
  return next ok(not i.zugang and i.grund = 'archiviert', 'ich: ohne Zugang mit Grund');

  perform tests.act_as_anon();
  return next throws_ok('select * from public.ich()', '42501', null, 'ich: ohne Anmeldung nicht aufrufbar');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_app_mein_profil()
returns setof text language plpgsql as $f$
declare a record; b record; adm record; r record; x record; v_team uuid; v_n integer;
begin
  select * into a from tests.fixture_user(null, 'Profil') limit 1;
  select * into b from tests.fixture_user(null, 'Fremd') limit 1;
  select * into adm from tests.fixture_user('admin', 'Admin') limit 1;
  select * into r from tests.fixture_user(null, 'Gesperrt') limit 1;
  v_team := tests.fixture_team('ZZHerren 40');
  update public.members
     set title = 'Dr.', city = 'Muckensturm', team_id = v_team, is_team_captain = true,
         emergency_contact_name = 'Mama', emergency_contact_phone = '0123'
   where id = a.member_id;
  insert into public.memberships (member_id, number, started_on)
  values (a.member_id, 'ZZ-0815', date '2010-04-01');
  update public.members set login_disabled_at = now() where id = r.member_id;

  perform tests.act_as(a.auth_id);
  select count(*) into v_n from public.mein_profil();
  select * into x from public.mein_profil();
  perform set_config('role', 'postgres', true);
  return next is(v_n, 1, 'mein_profil: genau eine Zeile');
  return next is(row(x.first_name, x.title, x.city, x.emergency_contact_name, x.emergency_contact_phone)::text,
                 row('Profil', 'Dr.', 'Muckensturm', 'Mama', '0123')::text,
    'mein_profil: Stammdaten und Notfallkontakt');
  return next is(row(x.membership_number, x.member_since)::text, row('ZZ-0815', date '2010-04-01')::text,
    'mein_profil: Mitgliedsnummer und Mitglied seit');
  return next is(row(x.team_name, x.is_team_captain)::text, row('ZZHerren 40', true)::text,
    'mein_profil: Mannschaft und Mannschaftsführer');

  perform tests.act_as(adm.auth_id);
  select count(*) into v_n from public.mein_profil() z where z.first_name <> 'Admin';
  perform set_config('role', 'postgres', true);
  return next is(v_n, 0, 'mein_profil: auch ein Admin sieht nur sich selbst');

  perform tests.act_as(b.auth_id);
  select * into x from public.mein_profil();
  perform set_config('role', 'postgres', true);
  return next ok(x.first_name = 'Fremd' and x.team_name is null and x.membership_number is null,
    'mein_profil: ohne Mannschaft und Mitgliedschaft null, nichts vom anderen Mitglied');

  perform tests.act_as(r.auth_id);
  select count(*) into v_n from public.mein_profil();
  perform set_config('role', 'postgres', true);
  return next is(v_n, 0, 'mein_profil: ohne Zugang keine Zeile');

  perform tests.act_as_anon();
  return next throws_ok('select * from public.mein_profil()', '42501', null,
    'mein_profil: ohne Anmeldung nicht aufrufbar');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_app_save_my_profile()
returns setof text language plpgsql as $f$
declare a record; b record; r record; m public.members; v_b_vorher text;
begin
  select * into a from tests.fixture_user(null, 'Alt') limit 1;
  select * into b from tests.fixture_user(null, 'Andere') limit 1;
  select * into r from tests.fixture_user(null, 'Gesperrt') limit 1;
  update public.members set title = 'Dr.', city = 'Bühl', phone = '07223 1' where id = a.member_id;
  update public.members set login_disabled_at = now() where id = r.member_id;
  select to_jsonb(x)::text into v_b_vorher from public.members x where x.id = b.member_id;

  perform tests.act_as(a.auth_id);
  perform public.save_my_profile(p_first_name => '  Neu ', p_title => '', p_city => 'Muckensturm');
  perform set_config('role', 'postgres', true);
  select * into m from public.members where id = a.member_id;
  return next is(row(m.first_name, m.title, m.city, m.phone)::text,
                 row('Neu', null::text, 'Muckensturm', '07223 1')::text,
    'save_my_profile: getrimmt, leerer Text leert, null bleibt unverändert');
  return next is((select to_jsonb(x)::text from public.members x where x.id = b.member_id), v_b_vorher,
    'save_my_profile: ein anderes Mitglied bleibt unberührt');

  perform tests.act_as(a.auth_id);
  return next throws_ok($$select public.save_my_profile(p_last_name => ' ')$$, '22023',
    'Vor- und Nachname sind Pflicht.', 'save_my_profile: Nachname lässt sich nicht leeren');
  return next throws_ok($$select public.save_my_profile(p_status => 'archived')$$, '42883', null,
    'save_my_profile: eine fremde Spalte nimmt die Funktion gar nicht an');
  return next throws_ok($$select public.save_my_profile(p_birthday => '2000-01-01')$$, '42883', null,
    'save_my_profile: auch kein Geburtsdatum');
  perform set_config('role', 'postgres', true);

  return next ok(not (select p.prosecdef from pg_proc p where p.oid = 'public.save_my_profile'::regproc),
    'save_my_profile: läuft als Aufrufer, also über Policy, Grant und Trigger');
  return next ok(exists (select 1 from pg_trigger t
                          where t.tgrelid = 'public.members'::regclass
                            and t.tgname = 'members_guard_self_update' and t.tgenabled <> 'D'),
    'save_my_profile: der Trigger guard_member_self_update ist weiter aktiv');

  perform tests.act_as(r.auth_id);
  return next throws_ok($$select public.save_my_profile(p_city => 'Bühl')$$, '42501',
    'Nur Mitglieder haben ein Konto.', 'save_my_profile: ohne Zugang abgelehnt');
  perform set_config('role', 'postgres', true);

  perform tests.act_as_anon();
  return next throws_ok($$select public.save_my_profile(p_city => 'Bühl')$$, '42501', null,
    'save_my_profile: ohne Anmeldung nicht aufrufbar');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_app_save_my_notfallkontakt()
returns setof text language plpgsql as $f$
declare a record; r record; m public.members;
begin
  select * into a from tests.fixture_user(null, 'Notfall') limit 1;
  select * into r from tests.fixture_user(null, 'Gesperrt') limit 1;
  update public.members set login_disabled_at = now() where id = r.member_id;

  perform tests.act_as(a.auth_id);
  perform public.save_my_notfallkontakt(' Papa ', '0170 1', '');
  perform set_config('role', 'postgres', true);
  select * into m from public.members where id = a.member_id;
  return next is(row(m.emergency_contact_name, m.emergency_contact_phone, m.emergency_contact_relation)::text,
                 row('Papa', '0170 1', null::text)::text,
    'save_my_notfallkontakt: gespeichert, leere Beziehung wird null');

  perform tests.act_as(a.auth_id);
  return next throws_ok($$select public.save_my_notfallkontakt('', '0170 2')$$, '22023',
    'Zur Notfallnummer gehört auch ein Name.', 'save_my_notfallkontakt: Nummer ohne Namen abgelehnt');
  perform public.save_my_notfallkontakt(null, null);
  perform set_config('role', 'postgres', true);
  select * into m from public.members where id = a.member_id;
  return next ok(m.emergency_contact_name is null and m.emergency_contact_phone is null,
    'save_my_notfallkontakt: leeren geht');

  return next ok(not (select p.prosecdef from pg_proc p where p.oid = 'public.save_my_notfallkontakt'::regproc),
    'save_my_notfallkontakt: läuft als Aufrufer');

  perform tests.act_as(r.auth_id);
  return next throws_ok($$select public.save_my_notfallkontakt('A', '1')$$, '42501',
    'Nur Mitglieder haben ein Konto.', 'save_my_notfallkontakt: ohne Zugang abgelehnt');
  perform set_config('role', 'postgres', true);

  perform tests.act_as_anon();
  return next throws_ok($$select public.save_my_notfallkontakt('A', '1')$$, '42501', null,
    'save_my_notfallkontakt: ohne Anmeldung nicht aufrufbar');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_app_mein_mandat()
returns setof text language plpgsql as $f$
declare a record; b record; adm record; x record; v_ref text; v_n integer;
begin
  select * into a from tests.fixture_user(null, 'Mandat') limit 1;
  select * into b from tests.fixture_user(null, 'Ohne') limit 1;
  select * into adm from tests.fixture_user('admin', 'Kasse') limit 1;
  v_ref := tests.fixture_mandat(a.member_id);

  perform tests.act_as(a.auth_id);
  select * into x from public.mein_mandat();
  perform set_config('role', 'postgres', true);
  return next is(row(x.reference, x.status::text, x.holder, x.iban_last4)::text,
                 row(v_ref, 'active', 'ZZTest Kontoinhaber', '2051')::text,
    'mein_mandat: das eigene Mandat mit den letzten vier Stellen');

  perform tests.act_as(b.auth_id);
  select count(*) into v_n from public.mein_mandat();
  perform set_config('role', 'postgres', true);
  return next is(v_n, 0, 'mein_mandat: ohne eigenes Mandat nichts, auch nicht das fremde');

  perform tests.act_as(adm.auth_id);
  select count(*) into v_n from public.mein_mandat();
  perform set_config('role', 'postgres', true);
  return next is(v_n, 0, 'mein_mandat: auch ein Admin sieht nur das eigene');

  update public.members set login_disabled_at = now() where id = a.member_id;
  perform tests.act_as(a.auth_id);
  select count(*) into v_n from public.mein_mandat();
  perform set_config('role', 'postgres', true);
  return next is(v_n, 0, 'mein_mandat: ohne Zugang nichts');

  perform tests.act_as_anon();
  return next throws_ok('select * from public.mein_mandat()', '42501', null,
    'mein_mandat: ohne Anmeldung nicht aufrufbar');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_app_plaetze_und_arten()
returns setof text language plpgsql as $f$
declare a record; o record; v_court uuid; v_aktiv integer; v_n integer; v_falsch integer; v_arten integer;
begin
  select * into a from tests.fixture_user(null, 'Plan') limit 1;
  select * into o from tests.fixture_user(null, 'Neu') limit 1;
  update public.members set onboarding_completed_at = null where id = o.member_id;
  v_court := tests.fixture_court();
  update public.courts set active = false where id = v_court;
  select count(*) into v_aktiv from public.courts where active;
  select count(*) into v_arten from public.booking_types where active and applies_to = 'booking';

  perform tests.act_as(a.auth_id);
  select count(*) into v_n from public.courts_aktiv();
  select count(*) into v_falsch from public.courts_aktiv() c where c.id = v_court;
  perform set_config('role', 'postgres', true);
  return next is(v_n, v_aktiv, 'courts_aktiv: alle aktiven Plätze');
  return next is(v_falsch, 0, 'courts_aktiv: kein inaktiver Platz');

  perform tests.act_as(a.auth_id);
  select count(*) into v_n from public.booking_types_aktiv('booking');
  select count(*) into v_falsch from public.booking_types_aktiv('blocking') t
   where t.code in (select bt.code from public.booking_types bt where bt.applies_to = 'booking');
  perform set_config('role', 'postgres', true);
  return next is(v_n, v_arten, 'booking_types_aktiv: die aktiven Buchungsarten');
  return next is(v_falsch, 0, 'booking_types_aktiv: Sperrarten getrennt von Buchungsarten');

  perform tests.act_as(o.auth_id);
  select count(*) into v_n from public.courts_aktiv();
  select v_n + count(*) into v_n from public.booking_types_aktiv('booking');
  perform set_config('role', 'postgres', true);
  return next is(v_n, 0, 'courts_aktiv, booking_types_aktiv: vor dem Onboarding nichts, wie die Policies');

  perform tests.act_as_anon();
  return next throws_ok('select * from public.courts_aktiv()', '42501', null,
    'courts_aktiv: ohne Anmeldung nicht aufrufbar');
  return next throws_ok($$select * from public.booking_types_aktiv('booking')$$, '42501', null,
    'booking_types_aktiv: ohne Anmeldung nicht aufrufbar');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_app_stornofenster()
returns setof text language plpgsql as $f$
declare a record; r record; v integer;
begin
  select * into a from tests.fixture_user(null, 'Durst') limit 1;
  select * into r from tests.fixture_user(null, 'Gesperrt') limit 1;
  update public.members set login_disabled_at = now() where id = r.member_id;
  update public.settings set value = '20'::jsonb where key = 'drinks.void_window_minutes';

  perform tests.act_as(a.auth_id);
  v := public.drink_void_window_minutes();
  perform set_config('role', 'postgres', true);
  return next is(v, 20, 'drink_void_window_minutes: der eingestellte Wert');

  perform tests.act_as(r.auth_id);
  v := public.drink_void_window_minutes();
  perform set_config('role', 'postgres', true);
  return next is(v, null, 'drink_void_window_minutes: ohne Zugang null');

  perform tests.act_as_anon();
  return next throws_ok('select public.drink_void_window_minutes()', '42501', null,
    'drink_void_window_minutes: ohne Anmeldung nicht aufrufbar');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_app_push_token_aktiv()
returns setof text language plpgsql as $f$
declare a record; b record; adm record; v_eigen boolean; v_fremd boolean; v_aus boolean; v_admin boolean;
begin
  select * into a from tests.fixture_user(null, 'Telefon') limit 1;
  select * into b from tests.fixture_user(null, 'Tablet') limit 1;
  select * into adm from tests.fixture_user('admin', 'Admin') limit 1;
  insert into public.push_tokens (member_id, token, platform) values
    (a.member_id, 'zz-eigen', 'ios'),
    (b.member_id, 'zz-fremd', 'ios');
  insert into public.push_tokens (member_id, token, platform, disabled_at)
  values (a.member_id, 'zz-aus', 'ios', now());

  perform tests.act_as(a.auth_id);
  v_eigen := public.push_token_aktiv(' zz-eigen ');
  v_fremd := public.push_token_aktiv('zz-fremd');
  v_aus := public.push_token_aktiv('zz-aus');
  perform set_config('role', 'postgres', true);
  perform tests.act_as(adm.auth_id);
  v_admin := public.push_token_aktiv('zz-eigen');
  perform set_config('role', 'postgres', true);

  return next ok(v_eigen, 'push_token_aktiv: eigenes Gerät ist aktiv');
  return next ok(not v_fremd, 'push_token_aktiv: ein fremdes Gerät nie');
  return next ok(not v_aus, 'push_token_aktiv: ein stillgelegtes Gerät nicht');
  return next ok(not v_admin, 'push_token_aktiv: auch für einen Admin ist ein fremdes Gerät nicht aktiv');

  perform tests.act_as_anon();
  return next throws_ok($$select public.push_token_aktiv('zz-eigen')$$, '42501', null,
    'push_token_aktiv: ohne Anmeldung nicht aufrufbar');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_app_events_meine_forderung()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1800); a record; b record; x record; y record;
begin
  select * into a from tests.fixture_user(null, 'Gast') limit 1;
  select * into b from tests.fixture_user(null, 'Zaungast') limit 1;

  perform tests.act_as(a.auth_id);
  perform public.event_anmelden(v_event, 0, null);
  select * into x from public.events_fuer_mitglied() e where e.id = v_event;
  perform set_config('role', 'postgres', true);
  perform tests.act_as(b.auth_id);
  select * into y from public.events_fuer_mitglied() e where e.id = v_event;
  perform set_config('role', 'postgres', true);

  return next is(row(x.meine_forderung_cents, x.meine_forderung_status::text)::text,
                 row(1800, 'open')::text,
    'events_fuer_mitglied: die eigene Forderung');
  return next is(row(x.mein_status::text, x.fee_cents, x.personen)::text,
                 row('registered', 1800, 1)::text,
    'events_fuer_mitglied: die bisherigen Spalten bleiben');
  return next ok(y.id = v_event and y.meine_forderung_cents is null and y.meine_forderung_status is null,
    'events_fuer_mitglied: ohne Anmeldung keine Forderung, auch nicht die fremde');

  update public.charges set status = 'waived' where event_id = v_event and member_id = a.member_id;
  perform tests.act_as(a.auth_id);
  select * into x from public.events_fuer_mitglied() e where e.id = v_event;
  perform set_config('role', 'postgres', true);
  return next is(x.meine_forderung_cents, null, 'events_fuer_mitglied: eine erlassene Forderung zählt nicht');
end; $f$;

create or replace function tests.test_app_push_provider()
returns setof text language plpgsql as $f$
declare a record; b record; v_n1 uuid; v_n2 uuid; v_prov text; z record;
begin
  select * into a from tests.fixture_user(null, 'Expo') limit 1;
  select * into b from tests.fixture_user(null, 'Nativ') limit 1;

  insert into public.push_tokens (member_id, token, platform) values (a.member_id, 'zz-direkt', 'ios');
  return next is((select provider from public.push_tokens where token = 'zz-direkt'), 'expo',
    'provider: Standard ist expo');
  return next throws_ok(
    format($$insert into public.push_tokens (member_id, token, platform, provider) values (%L, 'zz-gcm', 'android', 'gcm')$$,
           a.member_id),
    '23514', null, 'provider: nur expo, apns oder fcm');

  perform tests.act_as(a.auth_id);
  perform public.register_push_token('ExponentPushToken[zz-a]', 'ios');
  perform public.register_push_token(p_token => 'zz-apns-a', p_platform => 'ios',
                                     p_device_name => 'iPhone', p_provider => 'apns');
  return next throws_ok($$select public.register_push_token('zz-x', 'ios', null, 'gcm')$$, '23514',
    'Unbekannter Push-Anbieter "gcm".', 'register_push_token: unbekannter Anbieter abgelehnt');
  perform set_config('role', 'postgres', true);
  return next is((select provider from public.push_tokens where token = 'ExponentPushToken[zz-a]'), 'expo',
    'register_push_token: mit zwei Parametern wie bisher, Anbieter expo');
  return next is((select provider from public.push_tokens where token = 'zz-apns-a'), 'apns',
    'register_push_token: mit p_provider apns');

  perform tests.act_as(b.auth_id);
  perform public.register_push_token('zz-fcm-b', 'android', null, 'fcm');
  perform set_config('role', 'postgres', true);

  -- Die S26-Regel bleibt: eine fremde, noch aktive Marke zieht nicht um.
  perform tests.act_as(b.auth_id);
  return next throws_ok($$select public.register_push_token('zz-apns-a', 'ios', null, 'apns')$$, '23514',
    'Dieses Gerät ist noch für ein anderes Mitglied angemeldet. Bitte dort zuerst abmelden.',
    'register_push_token: fremde Marke zieht weiter nicht um (S26)');
  perform set_config('role', 'postgres', true);

  update public.push_tokens set disabled_at = now() where token = 'zz-direkt';
  insert into public.notifications (member_id, kind, title, body)
  values (a.member_id, 'booking_cancelled', 'ZZPush', 'Text') returning id into v_n1;
  insert into public.notifications (member_id, kind, title, body)
  values (b.member_id, 'booking_cancelled', 'ZZPush', 'Text') returning id into v_n2;

  -- Abholen wie der Versanddienst: ohne angemeldeten Nutzer.
  perform set_config('request.jwt.claims', null, true);
  create temp table zz_claim on commit drop as
    select * from public.claim_notification_pushes(1000) c where c.member_id in (a.member_id, b.member_id);

  select * into z from zz_claim where member_id = a.member_id;
  return next is(z.tokens, array['ExponentPushToken[zz-a]'],
    'claim_notification_pushes: tokens enthält nur Expo-Marken');
  return next is((select jsonb_agg(g order by g->>'token') from jsonb_array_elements(z.geraete) g),
                 '[{"token": "ExponentPushToken[zz-a]", "provider": "expo"},
                   {"token": "zz-apns-a", "provider": "apns"}]'::jsonb,
    'claim_notification_pushes: geraete mit Anbieter, ohne stillgelegte');

  select * into z from zz_claim where member_id = b.member_id;
  return next is(z.tokens, '{}'::text[], 'claim_notification_pushes: ohne Expo-Marke leer, nicht null');
  return next is(z.geraete, '[{"token": "zz-fcm-b", "provider": "fcm"}]'::jsonb,
    'claim_notification_pushes: auch ein Mitglied nur mit FCM bekommt seine Nachricht');
end; $f$;

select extensions.plan(1);
select extensions.pass('Tests der RPCs für die nativen Apps sind eingespielt');
select * from extensions.finish();
