-- ===========================================================================
-- Berechtigungen: RLS, Rollen, Kiosk-Abgrenzung
--
-- Der Rollenwechsel laeuft ueber request.jwt.claims - genau so, wie PostgREST
-- es zur Laufzeit macht. Nach einem Wechsel auf authenticated darf keine
-- Funktion aus dem Schema tests mehr aufgerufen werden (dort fehlt das
-- USAGE-Recht), deshalb wird die Rolle mit set_config inline zurueckgesetzt.
-- ===========================================================================

create or replace function tests.fixture_user(
  p_role public.app_role default null,
  p_first text default 'RLS'
)
returns table (member_id uuid, auth_id uuid)
language plpgsql as $f$
declare v_auth uuid := gen_random_uuid(); v_mem uuid;
begin
  insert into auth.users (id, email, aud, role)
  values (v_auth, 'rls-' || substr(v_auth::text, 1, 8) || '@example.org',
          'authenticated', 'authenticated');
  insert into public.members (first_name, last_name, auth_user_id)
  values (p_first, 'Tester ' || substr(v_auth::text, 1, 8), v_auth)
  returning id into v_mem;
  insert into public.member_roles (member_id, role) values (v_mem, 'member');
  if p_role is not null then
    insert into public.member_roles (member_id, role) values (v_mem, p_role)
    on conflict do nothing;
  end if;
  return query select v_mem, v_auth;
end; $f$;

create or replace function tests.act_as(p_auth_id uuid)
returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_auth_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end; $f$;

create or replace function tests.act_as_anon()
returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', null, true);
  perform set_config('role', 'anon', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Vollstaendigkeit
--
-- Der wichtigste Test der Suite: er schlaegt fehl, sobald irgendwann eine
-- Tabelle ohne RLS oder ohne Policy dazukommt. Ein vergessener Schutz faellt
-- damit sofort auf, statt still Daten freizugeben.
-- ---------------------------------------------------------------------------
create or replace function tests.test_rls_auf_allen_tabellen() returns setof text language plpgsql as $f$
declare v_ohne text; v_ohne_policy text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_ohne
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  return next is(v_ohne, null,
    'Alle Tabellen in public haben RLS aktiviert' || coalesce(' (ohne: ' || v_ohne || ')', ''));

  select string_agg(c.relname, ', ' order by c.relname) into v_ohne_policy
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

  return next is(v_ohne_policy, null,
    'Keine Tabelle hat RLS ohne Policy' || coalesce(' (betroffen: ' || v_ohne_policy || ')', ''));
end; $f$;

-- ---------------------------------------------------------------------------
-- Trennung zwischen Mitgliedern
-- ---------------------------------------------------------------------------
create or replace function tests.test_rls_fremde_mitgliedsdaten_unsichtbar() returns setof text language plpgsql as $f$
declare a record; b record; v_count integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  select count(*) into v_count from public.members where id = b.member_id;
  return next is(v_count, 0, 'Mitglied A sieht Mitglied B nicht in members');
  select count(*) into v_count from public.members where id = a.member_id;
  return next is(v_count, 1, 'Mitglied A sieht sich selbst');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_rls_zahler_sieht_kind() returns setof text language plpgsql as $f$
declare eltern record; kind_id uuid; v_count integer;
begin
  select * into eltern from tests.fixture_user() limit 1;
  insert into public.members (first_name, last_name, billing_payer_id)
  values ('Kind', 'Tester', eltern.member_id) returning id into kind_id;
  perform tests.act_as(eltern.auth_id);
  select count(*) into v_count from public.members where id = kind_id;
  return next is(v_count, 1, 'Zahler sieht die Daten des Kindes');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_rls_fremde_getraenke_unsichtbar() returns setof text language plpgsql as $f$
declare a record; b record; v_item uuid; v_count integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  insert into public.drink_items (name) values ('RLS-Test ' || gen_random_uuid()::text)
  returning id into v_item;
  insert into public.drink_purchases (member_id, drink_item_id, quantity, unit_price_cents)
  values (b.member_id, v_item, 1, 250);
  perform tests.act_as(a.auth_id);
  select count(*) into v_count from public.drink_purchases where member_id = b.member_id;
  return next is(v_count, 0, 'Mitglied A sieht die Getraenkebuchungen von B nicht');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Bankdaten
-- ---------------------------------------------------------------------------
create or replace function tests.test_rls_kassenwart_sieht_bankdaten() returns setof text language plpgsql as $f$
declare kw record; normal record; opfer record; v_ba uuid; v_count integer;
begin
  select * into kw from tests.fixture_user('treasurer') limit 1;
  select * into normal from tests.fixture_user() limit 1;
  select * into opfer from tests.fixture_user() limit 1;
  insert into public.bank_accounts (member_id, iban_encrypted, iban_last4, holder)
  values (opfer.member_id, '\x00'::bytea, '9999', 'Opfer') returning id into v_ba;
  perform tests.act_as(normal.auth_id);
  select count(*) into v_count from public.bank_accounts where id = v_ba;
  return next is(v_count, 0, 'Normales Mitglied sieht fremde Bankverbindung nicht');
  perform set_config('role', 'postgres', true);
  perform tests.act_as(kw.auth_id);
  select count(*) into v_count from public.bank_accounts where id = v_ba;
  return next is(v_count, 1, 'Kassenwart sieht die Bankverbindung');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_rls_iban_spalte_gesperrt() returns setof text language plpgsql as $f$
declare kw record;
begin
  select * into kw from tests.fixture_user('treasurer') limit 1;
  perform tests.act_as(kw.auth_id);
  return next throws_ok(
    'select iban_encrypted from public.bank_accounts limit 1', '42501', null,
    'Auch der Kassenwart kann iban_encrypted nicht lesen - Spalten-Grant fehlt bewusst');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_rls_decrypt_iban_nicht_aufrufbar() returns setof text language plpgsql as $f$
declare kw record;
begin
  select * into kw from tests.fixture_user('treasurer') limit 1;
  perform tests.act_as(kw.auth_id);
  return next throws_ok(
    'select private.decrypt_iban(''\x00''::bytea)', '42501', null,
    'private.decrypt_iban ist fuer angemeldete Nutzer gesperrt');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
create or replace function tests.test_rls_anon_sieht_nichts() returns setof text language plpgsql as $f$
declare v_count integer;
begin
  perform tests.act_as_anon();
  begin
    select count(*) into v_count from public.members;
    return next is(v_count, 0, 'anon sieht keine Mitglieder');
  exception when insufficient_privilege then
    return next pass('anon hat kein Leserecht auf members');
  end;
  begin
    select count(*) into v_count from public.bookings;
    return next is(v_count, 0, 'anon sieht keine Buchungen');
  exception when insufficient_privilege then
    return next pass('anon hat kein Leserecht auf bookings');
  end;
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Kiosk: buchen ja, lesen nein
-- ---------------------------------------------------------------------------
create or replace function tests.test_kiosk_kann_buchen_aber_nichts_lesen() returns setof text language plpgsql as $f$
declare
  v_auth uuid := gen_random_uuid();
  opfer record; v_item uuid; v_count integer; v_purchase uuid;
begin
  insert into auth.users (id, email, aud, role)
  values (v_auth, 'kiosk-' || substr(v_auth::text,1,8) || '@example.org',
          'authenticated', 'authenticated');
  insert into public.kiosk_devices (auth_user_id, name) values (v_auth, 'Theke Test');
  select * into opfer from tests.fixture_user() limit 1;
  insert into public.drink_items (name) values ('Kiosk-Test ' || gen_random_uuid()::text)
  returning id into v_item;
  insert into public.drink_prices (drink_item_id, valid_from, price_cents)
  values (v_item, current_date - 1, 250);

  perform tests.act_as(v_auth);
  select count(*) into v_count from public.members;
  return next is(v_count, 0, 'Kiosk sieht keine Mitgliederdaten');
  select count(*) into v_count from public.drink_purchases;
  return next is(v_count, 0, 'Kiosk sieht keine Getraenkebuchungen');
  select count(*) into v_count from public.bookings;
  return next is(v_count, 0, 'Kiosk sieht keine Platzbuchungen');
  select count(*) into v_count from public.member_directory();
  return next cmp_ok(v_count, '>', 0, 'Kiosk sieht das Namensverzeichnis');
  select public.record_drink_purchase_for(opfer.member_id, v_item, 2) into v_purchase;
  return next isnt(v_purchase, null, 'Kiosk kann eine Getraenkebuchung anlegen');

  perform set_config('role', 'postgres', true);
  select count(*) into v_count from public.drink_purchases
   where id = v_purchase and source = 'kiosk' and unit_price_cents = 250;
  return next is(v_count, 1, 'Buchung ist als Kiosk markiert und hat den Preis aus der Liste');
end; $f$;

-- ---------------------------------------------------------------------------
-- Rechteausweitung durch das Mitglied selbst
-- ---------------------------------------------------------------------------
create or replace function tests.test_mitglied_kann_sich_keine_rolle_geben() returns setof text language plpgsql as $f$
declare a record;
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format('insert into public.member_roles (member_id, role) values (%L, ''board'')', a.member_id),
    null, null, 'Mitglied kann sich selbst keine Vorstandsrolle geben');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_mitglied_kann_zahler_nicht_aendern() returns setof text language plpgsql as $f$
declare a record; b record;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format('update public.members set billing_payer_id = %L where id = %L', b.member_id, a.member_id),
    null, null, 'Mitglied kann sich keinen fremden Zahler zuweisen');
  perform set_config('role', 'postgres', true);
end; $f$;
