-- ===========================================================================
-- Alte Benachrichtigungen aufraeumen
--
-- private.alte_benachrichtigungen_loeschen() loescht, was aelter als drei
-- Monate ist, gelesen oder nicht. Juengeres bleibt, andere Tabellen bleiben
-- unberuehrt. Der Job steht in pg_cron.
--
-- Fixtures aus 02_rls.sql (fixture_user).
-- ===========================================================================

create or replace function tests.test_alte_benachrichtigungen_loeschen()
returns setof text language plpgsql as $f$
declare
  m record;
  v_alt_gelesen uuid; v_alt_ungelesen uuid; v_knapp uuid; v_frisch uuid;
  v_mitglieder integer; v_buchungen integer; v_geloescht integer;
begin
  select * into m from tests.fixture_user(null, 'Aufraeumen') limit 1;

  insert into public.notifications (member_id, kind, title, body, read_at, created_at)
  values (m.member_id, 'test', 'Alt gelesen', '-', now(), now() - interval '3 months' - interval '1 day')
  returning id into v_alt_gelesen;
  insert into public.notifications (member_id, kind, title, body, created_at)
  values (m.member_id, 'test', 'Alt ungelesen', '-', now() - interval '4 months')
  returning id into v_alt_ungelesen;
  insert into public.notifications (member_id, kind, title, body, read_at, created_at)
  values (m.member_id, 'test', 'Knapp', '-', now(), now() - interval '3 months' + interval '1 day')
  returning id into v_knapp;
  insert into public.notifications (member_id, kind, title, body, created_at)
  values (m.member_id, 'test', 'Frisch', '-', now())
  returning id into v_frisch;

  select count(*)::integer into v_mitglieder from public.members;
  select count(*)::integer into v_buchungen from public.bookings;

  v_geloescht := private.alte_benachrichtigungen_loeschen();

  return next cmp_ok(v_geloescht, '>=', 2, 'Der Aufraeumjob loescht die alten');
  return next ok(not exists (select 1 from public.notifications where id = v_alt_gelesen),
    'Gelesen und aelter als drei Monate: weg');
  return next ok(not exists (select 1 from public.notifications where id = v_alt_ungelesen),
    'Ungelesen und aelter als drei Monate: auch weg');
  return next ok(exists (select 1 from public.notifications where id = v_knapp),
    'Drei Monate minus einen Tag: bleibt');
  return next ok(exists (select 1 from public.notifications where id = v_frisch),
    'Frisch: bleibt');
  return next ok(not exists (select 1 from public.notifications
                              where created_at < now() - interval '3 months'),
    'Nichts Aelteres als drei Monate bleibt uebrig');
  return next is((select count(*)::integer from public.members), v_mitglieder,
    'Mitglieder bleiben unberuehrt');
  return next is((select count(*)::integer from public.bookings), v_buchungen,
    'Buchungen bleiben unberuehrt');

  return next ok(exists (select 1 from cron.job
                          where jobname = 'alte-benachrichtigungen'
                            and command like '%alte_benachrichtigungen_loeschen%'),
    'Der Job laeuft ueber pg_cron');
end; $f$;

create or replace function tests.test_alte_benachrichtigungen_nur_intern()
returns setof text language plpgsql as $f$
begin
  return next ok(not has_function_privilege('authenticated', 'private.alte_benachrichtigungen_loeschen()', 'execute'),
    'Angemeldete duerfen nicht aufraeumen');
  return next ok(not has_function_privilege('anon', 'private.alte_benachrichtigungen_loeschen()', 'execute'),
    'Anonyme auch nicht');
end; $f$;

select extensions.plan(1);
select extensions.pass('Tests zum Aufraeumen alter Benachrichtigungen sind eingespielt');
select * from extensions.finish();
