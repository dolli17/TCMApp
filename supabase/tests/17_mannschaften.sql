-- ===========================================================================
-- Mannschaften: Stammtabelle, Zuordnung am Mitglied, Mannschaftsfuehrer
--
-- Die Regeln liegen in der Datenbank (Teilindex, Check, Trigger) - hier wird
-- geprueft, dass sie auch dann halten, wenn die RPC umgangen wird.
-- ===========================================================================

create or replace function tests.fixture_team(p_name text)
returns uuid language plpgsql as $f$
declare v_id uuid;
begin
  insert into public.teams (name) values (p_name) returning id into v_id;
  return v_id;
end; $f$;

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------

create or replace function tests.test_mitglied_liest_mannschaften_schreibt_sie_aber_nicht()
returns setof text language plpgsql as $f$
declare a record;
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.fixture_team('T Lesen');
  perform tests.act_as(a.auth_id);

  return next ok(
    exists (select 1 from public.teams where name = 'T Lesen'),
    'Ein Mitglied sieht die Mannschaftsnamen');

  return next throws_ok(
    $q$insert into public.teams (name) values ('T Schreiben')$q$,
    '42501', null, 'Ein Mitglied legt keine Mannschaft an');

  return next throws_ok(
    $q$select public.upsert_team('T Schreiben')$q$,
    '42501', null, 'Auch nicht ueber die RPC');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_mitglied_aendert_seine_mannschaft_nicht_selbst()
returns setof text language plpgsql as $f$
declare a record; v_team uuid;
begin
  select * into a from tests.fixture_user() limit 1;
  v_team := tests.fixture_team('T Selbst');
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format($q$update public.members set team_id = %L where id = %L$q$, v_team, a.member_id),
    '42501', null, 'team_id steht nicht auf der Erlaubnisliste der Selbstpflege');

  return next throws_ok(
    format($q$select public.set_member_team(%L, %L)$q$, a.member_id, v_team),
    '42501', null, 'Und set_member_team ist Admins vorbehalten');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_mitglied_sieht_fremde_zuordnung_nicht()
returns setof text language plpgsql as $f$
declare a record; b record; v_team uuid;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  v_team := tests.fixture_team('T Fremd');
  update public.members set team_id = v_team where id = b.member_id;
  perform tests.act_as(a.auth_id);

  return next is(
    (select count(*) from public.members where team_id = v_team),
    0::bigint, 'Die Zeile des anderen Mitglieds bleibt unsichtbar');

  return next throws_ok(
    format($q$select * from public.team_roster(%L)$q$, v_team),
    '42501', null, 'Die Aufstellung sehen nur Administratoren');

  return next throws_ok(
    $q$select * from public.team_overview()$q$,
    '42501', null, 'Die Uebersicht ebenso');

  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Pflege durch den Admin
-- ---------------------------------------------------------------------------

create or replace function tests.test_admin_legt_mannschaft_an_und_ordnet_zu()
returns setof text language plpgsql as $f$
declare a record; b record; v_team uuid; r record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);

  v_team := public.upsert_team('  T Herren 30  ');
  perform public.set_member_team(b.member_id, v_team, true);

  select * into r from public.team_overview() where id = v_team;
  perform set_config('role', 'postgres', true);

  return next is(r.name, 'T Herren 30', 'Der Name wird getrimmt gespeichert');
  return next is(r.member_count, 1, 'Die Uebersicht zaehlt den Spieler');
  return next is(r.captain_name, (select first_name || ' ' || last_name
                                    from public.members where id = b.member_id),
                 'und nennt den Mannschaftsfuehrer');
  return next ok(
    (select is_team_captain from public.members where id = b.member_id),
    'Das Kennzeichen steht am Mitglied');
end; $f$;

create or replace function tests.test_zuordnung_landet_im_protokoll()
returns setof text language plpgsql as $f$
declare a record; b record; v_team uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  v_team := tests.fixture_team('T Protokoll');
  perform tests.act_as(a.auth_id);
  perform public.set_member_team(b.member_id, v_team);
  perform set_config('role', 'postgres', true);

  return next ok(
    exists (select 1 from public.change_log
             where member_id = b.member_id
               and table_name = 'members'
               and diff ? 'team_id'),
    'Der Wechsel der Mannschaft steht im Aenderungsprotokoll');
end; $f$;

create or replace function tests.test_umhaengen_in_andere_mannschaft()
returns setof text language plpgsql as $f$
declare a record; b record; v_alt uuid; v_neu uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  v_alt := tests.fixture_team('T Alt');
  v_neu := tests.fixture_team('T Neu');
  perform tests.act_as(a.auth_id);

  perform public.set_member_team(b.member_id, v_alt, true);
  perform public.set_member_team(b.member_id, v_neu);
  perform set_config('role', 'postgres', true);

  return next is(
    (select team_id from public.members where id = b.member_id),
    v_neu, 'Ein Spieler hat genau eine Mannschaft - die neue ersetzt die alte');
  return next ok(
    not (select is_team_captain from public.members where id = b.member_id),
    'Das Kennzeichen wandert nicht mit');
end; $f$;

create or replace function tests.test_austragen_setzt_kennzeichen_zurueck()
returns setof text language plpgsql as $f$
declare a record; b record; v_team uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  v_team := tests.fixture_team('T Austritt');
  perform tests.act_as(a.auth_id);

  perform public.set_member_team(b.member_id, v_team, true);
  perform public.set_member_team(b.member_id, null);
  perform set_config('role', 'postgres', true);

  return next ok(
    (select team_id is null and not is_team_captain
       from public.members where id = b.member_id),
    'Ohne Mannschaft kein Mannschaftsfuehrer');
end; $f$;

-- ---------------------------------------------------------------------------
-- Regeln, die die Datenbank haelt
-- ---------------------------------------------------------------------------

create or replace function tests.test_nur_ein_mannschaftsfuehrer_je_mannschaft()
returns setof text language plpgsql as $f$
declare a record; b record; c record; v_team uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  v_team := tests.fixture_team('T Zwei Fuehrer');
  perform tests.act_as(a.auth_id);
  perform public.set_member_team(b.member_id, v_team, true);

  return next throws_ok(
    format($q$select public.set_member_team(%L, %L, true)$q$, c.member_id, v_team),
    '23505', null, 'Ein zweiter Mannschaftsfuehrer wird abgewiesen');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_kennzeichen_ohne_mannschaft_wird_abgewiesen()
returns setof text language plpgsql as $f$
declare b record;
begin
  select * into b from tests.fixture_user() limit 1;

  return next throws_ok(
    format($q$update public.members set is_team_captain = true where id = %L$q$, b.member_id),
    '23514', null, 'Mannschaftsfuehrer ohne Mannschaft scheitert am Check');
end; $f$;

create or replace function tests.test_mannschaftsname_ist_eindeutig()
returns setof text language plpgsql as $f$
declare a record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_team('T Doppelt');
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    $q$select public.upsert_team('t doppelt')$q$,
    '23505', null, 'Gross-/Kleinschreibung macht keinen zweiten Namen');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_nur_aktive_mitglieder_in_mannschaft()
returns setof text language plpgsql as $f$
declare a record; b record; v_team uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  v_team := tests.fixture_team('T Inaktiv');
  update public.members set status = 'inactive' where id = b.member_id;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format($q$select public.set_member_team(%L, %L)$q$, b.member_id, v_team),
    '23514', null, 'Ein inaktives Mitglied spielt in keiner Mannschaft');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_stillgelegte_mannschaft_nimmt_niemanden_auf()
returns setof text language plpgsql as $f$
declare a record; b record; v_team uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  v_team := tests.fixture_team('T Still');
  update public.teams set active = false where id = v_team;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format($q$select public.set_member_team(%L, %L)$q$, b.member_id, v_team),
    'P0002', null, 'Eine stillgelegte Mannschaft nimmt niemanden auf');

  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Archivieren und Loeschen
-- ---------------------------------------------------------------------------

create or replace function tests.test_archivierung_verlaesst_die_mannschaft()
returns setof text language plpgsql as $f$
declare b record; v_team uuid;
begin
  select * into b from tests.fixture_user() limit 1;
  v_team := tests.fixture_team('T Archiv');
  update public.members set team_id = v_team, is_team_captain = true where id = b.member_id;

  update public.members set status = 'archived' where id = b.member_id;

  return next ok(
    (select team_id is null and not is_team_captain
       from public.members where id = b.member_id),
    'Wer archiviert wird, steht in keiner Mannschaft mehr');
end; $f$;

create or replace function tests.test_mannschaft_loeschen_nimmt_spieler_heraus()
returns setof text language plpgsql as $f$
declare a record; b record; v_team uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  v_team := tests.fixture_team('T Loeschen');
  update public.members set team_id = v_team, is_team_captain = true where id = b.member_id;
  perform tests.act_as(a.auth_id);

  perform public.delete_team(v_team);
  perform set_config('role', 'postgres', true);

  return next ok(
    not exists (select 1 from public.teams where id = v_team),
    'Die Mannschaft ist weg');
  return next ok(
    (select team_id is null and not is_team_captain
       from public.members where id = b.member_id),
    'und der Spieler samt Kennzeichen ausgetragen');
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer die Mannschaften sind eingespielt');
select * from extensions.finish();
