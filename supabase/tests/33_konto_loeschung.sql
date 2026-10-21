-- ===========================================================================
-- Kontoloeschung beantragen (O9, Apple-Regel 5.1.1(v))
--
--   1. Ein Mitglied mit Zugang beantragt die Loeschung seines Kontos in der
--      App. Admins und Vorstand mit Zugang bekommen eine Benachrichtigung,
--      per Mail und Push. Ausgeschiedene Admins, Platzwarte und Mitglieder
--      nicht, der Antragsteller selbst auch nicht.
--   2. Mehrfachklicks: hoechstens ein Antrag je Mitglied in 24 Stunden. Der
--      zweite Aufruf ist kein Fehler, er meldet nur false.
--   3. Ohne Zugang (anon, gesperrt) geht es nicht.
--   4. Den Antrag sieht das Mitglied selbst und der Vorstand, sonst niemand.
--
-- Fixtures aus 02_rls.sql (fixture_user, act_as, act_as_anon).
-- ===========================================================================

create or replace function tests.test_konto_loeschung_benachrichtigt_vorstand()
returns setof text language plpgsql as $f$
declare m record; adm record; brd record; alt record; pw record; x record; v_ok boolean;
begin
  select * into m   from tests.fixture_user(null, 'Antrag') limit 1;
  select * into adm from tests.fixture_user('admin', 'Admin') limit 1;
  select * into brd from tests.fixture_user('board', 'Vorstand') limit 1;
  select * into alt from tests.fixture_user('admin', 'Ehemals') limit 1;
  select * into pw  from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into x   from tests.fixture_user(null, 'Fremd') limit 1;
  update public.members set status = 'archived' where id = alt.member_id;

  perform tests.act_as(m.auth_id);
  select public.konto_loeschung_beantragen('  Bitte alles loeschen.  ') into v_ok;
  perform set_config('role', 'postgres', true);

  return next is(v_ok, true, 'Der Antrag geht ein');
  return next is((select count(*)::integer from public.notifications
                   where kind = 'account_deletion_requested'
                     and member_id in (adm.member_id, brd.member_id)), 2,
    'Admin und Vorstand werden benachrichtigt');
  return next is((select count(*)::integer from public.notifications
                   where kind = 'account_deletion_requested'
                     and member_id in (alt.member_id, pw.member_id, x.member_id, m.member_id)), 0,
    'Ausgeschiedene, Platzwart, Mitglieder und der Antragsteller nicht');
  return next ok((select body from public.notifications
                   where kind = 'account_deletion_requested' and member_id = adm.member_id)
                 ~ 'Bitte alles loeschen\.',
    'Die Nachricht steht in der Benachrichtigung');
  return next is((select message from public.account_deletion_requests
                   where member_id = m.member_id), 'Bitte alles loeschen.',
    'und im Antrag, ohne Leerraum');
  return next ok('account_deletion_requested' = any (private.notification_mail_kinds()),
    'Geht per Mail');
  return next ok('account_deletion_requested' = any (private.notification_push_kinds()),
    'und als Push');
end; $f$;

create or replace function tests.test_konto_loeschung_einmal_je_tag()
returns setof text language plpgsql as $f$
declare m record; adm record; v_ok boolean;
begin
  select * into m   from tests.fixture_user(null, 'Antrag') limit 1;
  select * into adm from tests.fixture_user('admin', 'Admin') limit 1;

  perform tests.act_as(m.auth_id);
  perform public.konto_loeschung_beantragen();
  select public.konto_loeschung_beantragen('Noch einmal') into v_ok;
  perform set_config('role', 'postgres', true);

  return next is(v_ok, false, 'Ein zweiter Klick am selben Tag legt nichts an');
  return next is((select count(*)::integer from public.notifications
                   where kind = 'account_deletion_requested' and member_id = adm.member_id), 1,
    'Der Vorstand bekommt es nur einmal');

  update public.account_deletion_requests set created_at = now() - interval '25 hours'
   where member_id = m.member_id;
  perform tests.act_as(m.auth_id);
  select public.konto_loeschung_beantragen() into v_ok;
  perform set_config('role', 'postgres', true);
  return next is(v_ok, true, 'Nach 24 Stunden geht es wieder');
end; $f$;

create or replace function tests.test_konto_loeschung_nur_mit_zugang()
returns setof text language plpgsql as $f$
declare s record;
begin
  select * into s from tests.fixture_user(null, 'Gesperrt') limit 1;
  update public.members set login_disabled_at = now() where id = s.member_id;

  perform tests.act_as_anon();
  return next throws_ok('select public.konto_loeschung_beantragen()', '42501', null,
    'Ohne Anmeldung nicht');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(s.auth_id);
  return next throws_ok('select public.konto_loeschung_beantragen()', '42501', null,
    'Gesperrt auch nicht');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_konto_loeschung_sichtbarkeit()
returns setof text language plpgsql as $f$
declare m record; x record; adm record;
begin
  select * into m   from tests.fixture_user(null, 'Antrag') limit 1;
  select * into x   from tests.fixture_user(null, 'Fremd') limit 1;
  select * into adm from tests.fixture_user('admin', 'Admin') limit 1;

  perform tests.act_as(m.auth_id);
  perform public.konto_loeschung_beantragen();
  return next is((select count(*)::integer from public.account_deletion_requests), 1,
    'Das Mitglied sieht seinen Antrag');
  return next throws_ok(
    format($q$insert into public.account_deletion_requests (member_id) values (%L)$q$, m.member_id),
    '42501', null, 'Anlegen nur ueber die RPC');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(x.auth_id);
  return next is((select count(*)::integer from public.account_deletion_requests
                   where member_id = m.member_id), 0, 'Ein anderes Mitglied nicht');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  return next is((select count(*)::integer from public.account_deletion_requests
                   where member_id = m.member_id), 1, 'Der Vorstand schon');
  perform set_config('role', 'postgres', true);
end; $f$;

select plan(1);
select pass('Kontoloeschung: Testfunktionen definiert');
