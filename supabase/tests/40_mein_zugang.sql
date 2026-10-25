-- ===========================================================================
-- Kein Zugang mehr (B22)
--
-- public.mein_zugang() sagt dem eigenen Konto, ob es noch Zugang hat und
-- warum nicht. Die Zusagen:
--
--   1. Aktiv, Austritt heute oder morgen: Zugang. Die Sperre greift erst ab
--      dem Tag nach dem Austritt.
--   2. Austritt gestern, archiviert, gesperrt: kein Zugang, mit Grund.
--   3. Kiosk-Geraete und offene Onboardings fliegen nicht heraus; das
--      Onboarding wird gemeldet.
--   4. Nur fuer angemeldete Konten.
--
-- Fixtures aus 02_rls.sql (fixture_user, act_as) und
-- 29_zugang_ausgeschiedene.sql (fixture_ausgetreten).
-- ===========================================================================

/** mein_zugang() aus Sicht eines Kontos, als Text (zugang, grund, onboarding_offen). */
create or replace function tests.zugang_von(p_auth_id uuid)
returns text language plpgsql as $f$
declare v text;
begin
  perform tests.act_as(p_auth_id);
  select row(z.zugang, z.grund, z.onboarding_offen)::text into v from public.mein_zugang() z;
  perform set_config('role', 'postgres', true);
  return v;
end; $f$;

create or replace function tests.test_mein_zugang()
returns setof text language plpgsql as $f$
declare
  a record; g record; h record; m record; r record; s record; o record;
  v_kiosk uuid := gen_random_uuid();
  v_heute date := private.heute();
begin
  select * into a from tests.fixture_user(null, 'Aktiv') limit 1;
  select * into g from tests.fixture_user('board', 'Gestern') limit 1;
  select * into h from tests.fixture_user(null, 'Heute') limit 1;
  select * into m from tests.fixture_user(null, 'Morgen') limit 1;
  select * into r from tests.fixture_user(null, 'Archiv') limit 1;
  select * into s from tests.fixture_user(null, 'Gesperrt') limit 1;
  select * into o from tests.fixture_user(null, 'Neu') limit 1;

  perform tests.fixture_ausgetreten(g.member_id, v_heute - 1);
  perform tests.fixture_ausgetreten(h.member_id, v_heute);
  perform tests.fixture_ausgetreten(m.member_id, v_heute + 1);
  update public.members set status = 'archived', login_disabled_at = now() where id = r.member_id;
  update public.members set login_disabled_at = now() where id = s.member_id;
  update public.members set onboarding_completed_at = null where id = o.member_id;

  insert into auth.users (id, email, aud, role)
  values (v_kiosk, 'kiosk-' || substr(v_kiosk::text, 1, 8) || '@example.org',
          'authenticated', 'authenticated');
  insert into public.kiosk_devices (auth_user_id, name) values (v_kiosk, 'Testkiosk');

  return next is(tests.zugang_von(a.auth_id), row(true, null::text, false)::text,
    'Aktiv: Zugang');
  return next is(tests.zugang_von(m.auth_id), row(true, null::text, false)::text,
    'Austritt morgen: noch Zugang');
  return next is(tests.zugang_von(h.auth_id), row(true, null::text, false)::text,
    'Austritt heute: Zugang bis einschliesslich heute');
  return next is(tests.zugang_von(g.auth_id), row(false, 'ausgetreten', false)::text,
    'Austritt gestern: kein Zugang, ausgetreten');
  return next is(tests.zugang_von(r.auth_id), row(false, 'archiviert', false)::text,
    'Archiviert: kein Zugang, auch mit Sperrvermerk archiviert');
  return next is(tests.zugang_von(s.auth_id), row(false, 'gesperrt', false)::text,
    'Gesperrt: kein Zugang');
  return next is(tests.zugang_von(o.auth_id), row(true, null::text, true)::text,
    'Onboarding offen: Zugang, Onboarding gemeldet');
  return next is(tests.zugang_von(v_kiosk), row(true, null::text, false)::text,
    'Kiosk: Zugang');

  perform tests.act_as_anon();
  return next throws_ok('select * from public.mein_zugang()', '42501', null,
    'Ohne Anmeldung nicht aufrufbar');

  perform set_config('role', 'postgres', true);
end; $f$;

select extensions.plan(1);
select extensions.pass('Tests zu mein_zugang sind eingespielt');
select * from extensions.finish();
