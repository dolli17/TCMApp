-- ===========================================================================
-- Rollen: Vorstand und App Admin haben volle Rechte, Platzwart vorerst keine
--
-- Alle Policies pruefen ueber private.is_admin(). Hier wird geprueft, dass der
-- Vorstand dort mitzaehlt, der Platzwart nicht, und dass die Regeln fuer die
-- letzte Person mit vollen Rechten beide Rollen zusammen betrachten.
-- ===========================================================================

create or replace function tests.test_rollen_vorstand_darf_alles()
returns setof text language plpgsql as $f$
declare v record; x record;
begin
  select * into v from tests.fixture_user('board', 'Vorstand') limit 1;
  select * into x from tests.fixture_user(null, 'Fremd') limit 1;
  perform tests.act_as(v.auth_id);

  return next ok(public.am_i_admin(), 'Der Vorstand gilt als Admin');

  return next ok(
    exists (select 1 from public.members where id = x.member_id),
    'Der Vorstand sieht fremde Mitglieder');

  return next lives_ok(
    format($q$update public.members set city = 'Vorstandsdorf' where id = %L$q$, x.member_id),
    'Der Vorstand aendert fremde Mitglieder');

  return next lives_ok(
    format($q$select public.set_member_role(%L, 'groundskeeper', true)$q$, x.member_id),
    'Der Vorstand vergibt Rollen');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_rollen_platzwart_hat_keine_verwaltungsrechte()
returns setof text language plpgsql as $f$
declare p record; x record;
begin
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into x from tests.fixture_user(null, 'Fremd') limit 1;
  perform tests.act_as(p.auth_id);

  return next ok(not public.am_i_admin(), 'Der Platzwart ist kein Admin');

  return next ok(
    not exists (select 1 from public.members where id = x.member_id),
    'Der Platzwart sieht keine fremden Mitglieder');

  return next throws_ok(
    format($q$select public.set_member_role(%L, 'groundskeeper', true)$q$, x.member_id),
    '42501', null, 'Der Platzwart vergibt keine Rollen');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_rollen_vorstand_braucht_login()
returns setof text language plpgsql as $f$
declare a record; v_ohne uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  insert into public.members (first_name, last_name) values ('Ohne', 'Login')
  returning id into v_ohne;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format($q$select public.set_member_role(%L, 'board', true)$q$, v_ohne),
    '22023', null, 'Ohne Login wird niemand Vorstand');

  return next lives_ok(
    format($q$select public.set_member_role(%L, 'groundskeeper', true)$q$, v_ohne),
    'Platzwart geht auch ohne Login');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_rollen_letzte_person_mit_vollen_rechten()
returns setof text language plpgsql as $f$
declare v record; a record;
begin
  select * into v from tests.fixture_user('board', 'Vorstand') limit 1;
  select * into a from tests.fixture_user('admin', 'Admin') limit 1;
  delete from public.member_roles
   where role in ('admin', 'board') and member_id not in (v.member_id, a.member_id);
  perform tests.act_as(v.auth_id);

  return next lives_ok(
    format($q$select public.set_member_role(%L, 'admin', false)$q$, a.member_id),
    'Der App Admin darf gehen, solange ein Vorstand bleibt');

  return next throws_ok(
    format($q$select public.set_member_role(%L, 'board', false)$q$, v.member_id),
    '23514', null, 'Der letzte Vorstand ohne Admin daneben bleibt');

  -- Wer beides ist, darf eine der beiden Rollen abgeben.
  perform set_config('role', 'postgres', true);
  insert into public.member_roles (member_id, role) values (v.member_id, 'admin');
  perform tests.act_as(v.auth_id);

  return next lives_ok(
    format($q$select public.set_member_role(%L, 'board', false)$q$, v.member_id),
    'Wer Vorstand und Admin ist, gibt eine der Rollen ab');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_rollen_enden_mit_login_und_archiv()
returns setof text language plpgsql as $f$
declare v record; p record;
begin
  select * into v from tests.fixture_user('board', 'Vorstand') limit 1;
  insert into public.member_roles (member_id, role) values (v.member_id, 'groundskeeper');
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;

  update public.members set auth_user_id = null where id = v.member_id;

  return next is(
    (select array_agg(role::text order by role) from public.member_roles where member_id = v.member_id),
    array['member', 'groundskeeper'],
    'Ohne Login endet der Vorstand, der Platzwart bleibt');

  update public.members set status = 'archived' where id = p.member_id;

  return next is(
    (select array_agg(role::text) from public.member_roles where member_id = p.member_id),
    array['member'],
    'Archiviert bleibt nur die Rolle Mitglied');
end; $f$;

create or replace function tests.test_rollen_in_der_mitgliederliste()
returns setof text language plpgsql as $f$
declare a record; v record; p record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into v from tests.fixture_user('board', 'Vorstand') limit 1;
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  perform tests.act_as(a.auth_id);

  return next is(
    (select roles::text[] from public.member_overview('alle') where id = v.member_id),
    array['member', 'board'],
    'Die Liste liefert die Rollen');

  return next ok(
    (select is_admin from public.member_overview('alle') where id = v.member_id),
    'is_admin heisst volle Rechte, auch fuer den Vorstand');

  return next ok(
    exists (select 1 from public.member_overview('vorstand') where id = v.member_id)
    and not exists (select 1 from public.member_overview('vorstand') where id = p.member_id),
    'Filter Vorstand');

  return next ok(
    exists (select 1 from public.member_overview('platzwart') where id = p.member_id),
    'Filter Platzwart');

  return next ok(
    exists (select 1 from public.member_overview('admins') where id = v.member_id)
    and exists (select 1 from public.member_overview('admins') where id = a.member_id),
    'Filter volle Rechte umfasst Vorstand und Admin');

  perform set_config('role', 'postgres', true);
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer die Rollen sind eingespielt');
select * from extensions.finish();
