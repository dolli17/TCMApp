-- ===========================================================================
-- Direkte Tests fuer RPCs, die bisher nur nebenbei liefen (T4)
--
--   1. remove_charge_from_debit_batch: nimmt einen Posten aus einem Entwurf,
--      rechnet Summe und Anzahl neu, die Forderung ist wieder einzugsfaehig.
--      Nicht aus einem erzeugten Lauf, nur fuer Admins.
--   2. debit_batch_items: eine Zeile je Lastschrift, nur fuer Admins.
--   3. fee_run_preview: Betrag nach dem gueltigen Preis oder dem
--      Abweichungsbetrag, Mandat und schon berechnet, nur aktive Mitglieder,
--      nur fuer Admins.
--   4. event_veroeffentlichen und event_loeschen: nur Entwuerfe, loeschen nur
--      ohne Anmeldungen, nur fuer Admins.
--   5. update_membership: nur die freigegebenen Felder, leere Werte leeren,
--      eine leere Nummer behaelt die alte. Nur fuer Admins.
--   6. my_booking_quota: offene Buchungen, auch als Mitspieler, gegen das
--      Kontingent. Ohne Mitgliedschaft nichts.
--   7. remove_push_token: nur das eigene Geraet.
--   8. guard_member_self_update: Mitglieder aendern nur die freigegebenen
--      Felder. Die Umgehung ueber tcm.selbstpflege_rpc gilt nur innerhalb der
--      Onboarding-RPCs: jede setzt sie wieder zurueck, und keine Funktion in
--      public setzt eine Einstellung mit einem Namen, den der Aufrufer
--      bestimmt.
--
-- Fixtures aus 01_constraints.sql (fixture_court), 02_rls.sql (fixture_user,
-- act_as, act_as_anon), 03_rpc_bookings.sql (naechster_slot,
-- setze_kontingent), 11_forderungen.sql (fixture_beitragsart,
-- fixture_beitragszahler), 13_lastschrift.sql (fixture_mandat,
-- fixture_angekuendigt, fixture_einzugstag), 16_benachrichtigungs_pushes.sql
-- (fixture_user_mit_geraet), 25_veranstaltungen.sql (fixture_event).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1., 2. Lastschriftlauf: Posten herausnehmen, Posten lesen
-- ---------------------------------------------------------------------------

/** Ein Lauf im Entwurf mit zwei Forderungen von a und einer von b. */
create or replace function tests.fixture_lauf_mit_posten(
  out batch_id uuid, out a_id uuid, out b_id uuid, out tag date
)
language plpgsql as $f$
declare adm record; a record; b record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user(null, 'Zahlerin') limit 1;
  select * into b from tests.fixture_user(null, 'Zahler') limit 1;
  perform tests.fixture_mandat(a.member_id);
  perform tests.fixture_mandat(b.member_id);
  perform tests.fixture_angekuendigt(a.member_id, 12000, 'fee');
  perform tests.fixture_angekuendigt(a.member_id, 2500, 'drinks');
  perform tests.fixture_angekuendigt(b.member_id, 8000, 'fee');
  tag := tests.fixture_einzugstag();

  perform tests.act_as(adm.auth_id);
  select public.create_debit_batch('ZZTest Lauf', tag) into batch_id;
  perform public.add_charges_to_debit_batch(batch_id, array[a.member_id, b.member_id]);
  perform set_config('role', 'postgres', true);
  a_id := a.member_id;
  b_id := b.member_id;
end; $f$;

create or replace function tests.test_posten_aus_lauf_nehmen()
returns setof text language plpgsql as $f$
declare l record; adm record; v_item uuid; v_charge uuid;
begin
  select * into l from tests.fixture_lauf_mit_posten();
  select * into adm from tests.fixture_user('admin') limit 1;

  return next is((select array[total_cents, item_count] from public.debit_batches where id = l.batch_id),
    array[22500, 2], 'Vorher: 225 Euro in zwei Lastschriften');

  select i.id, i.charge_id into v_item, v_charge
    from public.debit_items i join public.charges c on c.id = i.charge_id
   where i.batch_id = l.batch_id and c.member_id = l.a_id and c.kind = 'drinks';

  perform tests.act_as(adm.auth_id);
  perform public.remove_charge_from_debit_batch(v_item);
  perform set_config('role', 'postgres', true);

  return next is((select array[total_cents, item_count] from public.debit_batches where id = l.batch_id),
    array[20000, 2], 'Ein Posten weniger: Summe neu, die Lastschrift von a bleibt');
  return next ok(not exists (select 1 from public.debit_items where id = v_item), 'Der Posten ist weg');
  return next ok(exists (select 1 from public.debit_batch_candidates(l.tag) k
                         where k.payer_id = l.a_id and v_charge = any (k.charge_ids)),
    'Die Forderung ist wieder einzugsfaehig');

  select i.id into v_item from public.debit_items i join public.charges c on c.id = i.charge_id
   where i.batch_id = l.batch_id and c.member_id = l.a_id;
  perform tests.act_as(adm.auth_id);
  perform public.remove_charge_from_debit_batch(v_item);
  perform set_config('role', 'postgres', true);
  return next is((select array[total_cents, item_count] from public.debit_batches where id = l.batch_id),
    array[8000, 1], 'Letzter Posten von a: eine Lastschrift weniger');
end; $f$;

create or replace function tests.test_posten_aus_lauf_nur_entwurf_und_admin()
returns setof text language plpgsql as $f$
declare l record; adm record; x record; v_item uuid;
begin
  select * into l from tests.fixture_lauf_mit_posten();
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into x from tests.fixture_user() limit 1;
  select id into v_item from public.debit_items where batch_id = l.batch_id limit 1;

  perform tests.act_as(x.auth_id);
  return next throws_ok(format('select public.remove_charge_from_debit_batch(%L)', v_item),
    '42501', null, 'Nur Admins');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  return next throws_ok(format('select public.remove_charge_from_debit_batch(%L)', gen_random_uuid()),
    'P0002', null, 'Unbekannter Posten');
  perform set_config('role', 'postgres', true);

  update public.debit_batches set status = 'generated' where id = l.batch_id;
  perform tests.act_as(adm.auth_id);
  return next throws_ok(format('select public.remove_charge_from_debit_batch(%L)', v_item),
    '22023', null, 'Aus einem erzeugten Lauf nicht');
  perform set_config('role', 'postgres', true);
  return next ok(exists (select 1 from public.debit_items where id = v_item), 'Der Posten bleibt');
end; $f$;

create or replace function tests.test_lastschrift_posten_lesen()
returns setof text language plpgsql as $f$
declare l record; adm record; x record; z record;
begin
  select * into l from tests.fixture_lauf_mit_posten();
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into x from tests.fixture_user() limit 1;

  perform tests.act_as(adm.auth_id);
  return next is((select count(*)::integer from public.debit_batch_items(l.batch_id)), 2,
    'Eine Zeile je Lastschrift');
  select * into z from public.debit_batch_items(l.batch_id) i where i.payer_name like 'Zahlerin %';
  return next is(array[z.positionen, z.amount_cents], array[2, 14500],
    'Die Lastschrift von a fasst zwei Posten zusammen');
  return next is(z.kinds, array['fee', 'drinks']::public.charge_kind[], 'mit beiden Arten');
  return next is(z.result, 'pending'::public.debit_item_result, 'noch ohne Ergebnis');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(x.auth_id);
  return next is((select count(*)::integer from public.debit_batch_items(l.batch_id)), 0,
    'Mitglieder sehen nichts');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- 3. Vorschau Beitragslauf
-- ---------------------------------------------------------------------------

create or replace function tests.test_beitragslauf_vorschau()
returns setof text language plpgsql as $f$
declare v_art uuid := tests.fixture_beitragsart('ZZTest Vorschau', 2090, 10000);
        adm record; x record; a record; b record; still record; z record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into x from tests.fixture_user() limit 1;
  perform tests.act_as(adm.auth_id);
  -- Ein spaeterer Preis gilt ab seinem Jahr, ein frueherer bis dahin.
  perform public.set_fee_price(v_art, 2092, 13000);
  perform set_config('role', 'postgres', true);

  select * into a from tests.fixture_beitragszahler(v_art, 2091);
  select * into b from tests.fixture_beitragszahler(v_art, 2091);
  select * into still from tests.fixture_beitragszahler(v_art, 2091);
  perform tests.act_as(adm.auth_id);
  perform public.set_member_fee(b.member_id, v_art, 2091, 4000);
  perform set_config('role', 'postgres', true);
  perform tests.fixture_mandat(b.member_id);
  perform set_config('request.jwt.claims', null, true);
  update public.members set status = 'inactive' where id = still.member_id;
  insert into public.charges (member_id, payer_id, kind, amount_cents, description, period_label)
  values (b.member_id, b.member_id, 'fee', 4000, 'ZZTest Beitrag 2091', '2091');

  perform tests.act_as(adm.auth_id);
  select * into z from public.fee_run_preview(2091) p where p.member_id = a.member_id;
  return next is(array[z.amount_cents::text, z.has_mandate::text, z.already_charged::text, z.fee_types],
    array['10000', 'false', 'false', 'ZZTest Vorschau'], 'Preis des Jahres 2090 gilt 2091 noch');
  select * into z from public.fee_run_preview(2091) p where p.member_id = b.member_id;
  return next is(array[z.amount_cents::text, z.has_mandate::text, z.already_charged::text],
    array['4000', 'true', 'true'], 'Abweichender Betrag, mit Mandat, schon berechnet');
  return next ok(not exists (select 1 from public.fee_run_preview(2091) p where p.member_id = still.member_id),
    'Inaktive nicht');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(x.auth_id);
  return next is((select count(*)::integer from public.fee_run_preview(2091)), 0, 'Mitglieder sehen nichts');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- 4. Veranstaltung veroeffentlichen und loeschen
-- ---------------------------------------------------------------------------

/** Ein Entwurf, ueber die RPC angelegt. */
create or replace function tests.fixture_entwurf()
returns uuid language plpgsql as $f$
declare adm record; v_id uuid; v_start timestamptz := now() + interval '10 days';
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  perform tests.act_as(adm.auth_id);
  v_id := public.event_speichern(
    null, 'fest', 'ZZTest Entwurf', null, 'Clubhaus', v_start, v_start + interval '2 hours',
    true, v_start - interval '1 day', null, false, null, null, false);
  perform set_config('role', 'postgres', true);
  return v_id;
end; $f$;

create or replace function tests.test_event_veroeffentlichen()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_entwurf(); adm record; x record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into x from tests.fixture_user() limit 1;
  return next is((select status::text from public.events where id = v_event), 'draft', 'Ein Entwurf');

  perform tests.act_as(x.auth_id);
  return next throws_ok(format('select public.event_veroeffentlichen(%L)', v_event),
    '42501', null, 'Nur Admins');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  return next lives_ok(format('select public.event_veroeffentlichen(%L)', v_event), 'Veroeffentlichen');
  perform set_config('role', 'postgres', true);
  return next ok((select status = 'published' and published_at is not null from public.events where id = v_event),
    'Veroeffentlicht mit Zeitpunkt');

  perform tests.act_as(adm.auth_id);
  return next throws_ok(format('select public.event_veroeffentlichen(%L)', v_event),
    '22023', null, 'Nicht zweimal');
  return next throws_ok(format('select public.event_veroeffentlichen(%L)', gen_random_uuid()),
    '22023', null, 'Unbekannte Veranstaltung');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_event_loeschen()
returns setof text language plpgsql as $f$
declare v_leer uuid := tests.fixture_entwurf(); v_belegt uuid := tests.fixture_entwurf();
        v_offen uuid := tests.fixture_event(); adm record; x record; m record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into x from tests.fixture_user() limit 1;
  select * into m from tests.fixture_user() limit 1;
  insert into public.event_registrations (event_id, member_id) values (v_belegt, m.member_id);

  perform tests.act_as(x.auth_id);
  return next throws_ok(format('select public.event_loeschen(%L)', v_leer),
    '42501', null, 'Nur Admins');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  return next throws_ok(format('select public.event_loeschen(%L)', v_offen),
    '22023', null, 'Keine veroeffentlichte Veranstaltung');
  return next throws_ok(format('select public.event_loeschen(%L)', v_belegt),
    '22023', null, 'Keinen Entwurf mit Anmeldungen');
  return next lives_ok(format('select public.event_loeschen(%L)', v_leer), 'Einen leeren Entwurf schon');
  perform set_config('role', 'postgres', true);

  return next is((select array_agg(id order by id) from public.events where id in (v_leer, v_belegt, v_offen)),
    (select array_agg(i order by i) from unnest(array[v_belegt, v_offen]) i), 'Nur der leere Entwurf ist weg');
end; $f$;

-- ---------------------------------------------------------------------------
-- 5. Mitgliedschaft aendern
-- ---------------------------------------------------------------------------

create or replace function tests.test_mitgliedschaft_aendern()
returns setof text language plpgsql as $f$
declare adm record; x record; m record; v_id uuid; s public.memberships;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into x from tests.fixture_user() limit 1;
  select * into m from tests.fixture_user() limit 1;
  insert into public.memberships (member_id, number, started_on, notes, cancellation_reason)
  values (m.member_id, 'ZZ-0815', date '2020-04-01', 'Alte Notiz', 'Umzug')
  returning id into v_id;

  perform tests.act_as(x.auth_id);
  return next throws_ok(format($q$select public.update_membership(%L, '{"notes": "x"}')$q$, v_id),
    '42501', null, 'Nur Admins');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  return next throws_ok(format($q$select public.update_membership(%L, '{"ended_on": "2021-01-01"}')$q$, v_id),
    '22023', null, 'Nur freigegebene Felder: ended_on nicht');
  return next throws_ok(format($q$select public.update_membership(%L, '{"notes": "x"}')$q$, gen_random_uuid()),
    'P0002', null, 'Unbekannte Mitgliedschaft');

  perform public.update_membership(v_id, jsonb_build_object(
    'number', '  ', 'started_on', '2019-03-01', 'notes', '  Neue Notiz ',
    'cancellation_date', '2025-12-31', 'cancellation_reason', ''));
  perform set_config('role', 'postgres', true);
  select * into s from public.memberships where id = v_id;
  return next is(s.number, 'ZZ-0815', 'Eine leere Nummer behaelt die alte');
  return next is(s.started_on, date '2019-03-01', 'Eintritt geaendert');
  return next is(s.notes, 'Neue Notiz', 'Notiz ohne Leerraum');
  return next is(s.cancellation_date, date '2025-12-31', 'Kuendigungsdatum gesetzt');
  return next is(s.cancellation_reason, null, 'Ein leerer Grund leert das Feld');

  perform tests.act_as(adm.auth_id);
  perform public.update_membership(v_id, '{"cancellation_date": ""}');
  perform public.update_membership(v_id, '{}');
  perform set_config('role', 'postgres', true);
  select * into s from public.memberships where id = v_id;
  return next is(s.cancellation_date, null, 'Ein leeres Kuendigungsdatum leert das Feld');
  return next is(s.notes, 'Neue Notiz', 'Was nicht im Patch steht, bleibt');
end; $f$;

-- ---------------------------------------------------------------------------
-- 6. Kontingent
-- ---------------------------------------------------------------------------

create or replace function tests.test_mein_kontingent()
returns setof text language plpgsql as $f$
declare a record; b record; c record; v_court uuid := tests.fixture_court(); q record;
        s1 timestamptz := tests.naechster_slot(2, 10); s2 timestamptz := tests.naechster_slot(2, 12);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  perform tests.setze_kontingent(3);

  perform tests.act_as(a.auth_id);
  perform public.create_booking(v_court, s1, 'einzel', array[b.member_id]);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(b.auth_id);
  perform public.create_booking(v_court, s2, 'einzel', array[c.member_id]);
  select * into q from public.my_booking_quota();
  perform set_config('role', 'postgres', true);
  return next is(array[q.used, q.allowed], array[2, 3], 'Eigene Buchung und als Mitspieler zaehlen');

  perform tests.act_as(c.auth_id);
  select * into q from public.my_booking_quota();
  perform set_config('role', 'postgres', true);
  return next is(q.used, 1, 'Wer nur mitspielt, hat eine');

  -- Angemeldet, aber ohne Mitgliedsdatensatz.
  perform tests.act_as(gen_random_uuid());
  return next is((select count(*)::integer from public.my_booking_quota()), 0, 'Ohne Mitglied nichts');
  perform set_config('role', 'postgres', true);

  perform tests.act_as_anon();
  return next throws_ok('select * from public.my_booking_quota()', '42501', null, 'Ohne Anmeldung nicht');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- 7. Geraet abmelden
-- ---------------------------------------------------------------------------

create or replace function tests.test_geraet_abmelden()
returns setof text language plpgsql as $f$
declare u record; x record;
begin
  select * into u from tests.fixture_user_mit_geraet() limit 1;
  select * into x from tests.fixture_user_mit_geraet() limit 1;

  perform tests.act_as(u.auth_id);
  perform public.remove_push_token(x.token);
  perform set_config('role', 'postgres', true);
  return next ok(exists (select 1 from public.push_tokens where token = x.token),
    'Ein fremdes Geraet bleibt');

  perform tests.act_as(u.auth_id);
  perform public.remove_push_token('  ' || u.token || ' ');
  perform set_config('role', 'postgres', true);
  return next ok(not exists (select 1 from public.push_tokens where token = u.token),
    'Das eigene ist weg, auch mit Leerraum');

  perform tests.act_as_anon();
  return next throws_ok(format('select public.remove_push_token(%L)', x.token),
    '42501', null, 'Ohne Anmeldung nicht');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- 8. Selbstpflege der Stammdaten
-- ---------------------------------------------------------------------------

create or replace function tests.test_selbstpflege_nur_freigegebene_felder()
returns setof text language plpgsql as $f$
declare m record; adm record;
begin
  select * into m from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;

  perform tests.act_as(m.auth_id);
  return next lives_ok(
    format($q$update public.members set phone = '0721 123', city = 'Muckensturm' where id = %L$q$, m.member_id),
    'Telefon und Ort darf das Mitglied selbst aendern');
  return next throws_ok(
    format($q$update public.members set status = 'inactive' where id = %L$q$, m.member_id),
    '42501', null, 'den Status nicht');
  return next throws_ok(
    format($q$update public.members set onboarding_completed_at = now() where id = %L$q$, m.member_id),
    '42501', null, 'das Onboarding nicht abhaken');
  return next throws_ok(
    format($q$update public.members set login_disabled_at = null, birthday = '2000-01-01' where id = %L$q$, m.member_id),
    '42501', null, 'und nichts Geschuetztes, auch nicht gebuendelt');
  perform set_config('role', 'postgres', true);

  -- Admins schreiben ueber update_member, das Feld fuer Feld prueft; der
  -- Riegel laesst sie durch.
  perform tests.act_as(adm.auth_id);
  return next lives_ok(
    format($q$select public.update_member(%L, '{"status": "inactive"}')$q$, m.member_id),
    'Ein Admin schon');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_selbstpflege_umgehung_bleibt_in_der_rpc()
returns setof text language plpgsql as $f$
declare m record;
begin
  select * into m from tests.fixture_user() limit 1;
  perform set_config('request.jwt.claims', null, true);
  update public.members set onboarding_completed_at = null where id = m.member_id;

  -- Eine Onboarding-RPC schaltet die Umgehung ein und wieder aus. Danach
  -- greift der Riegel in derselben Transaktion wieder.
  perform tests.act_as(m.auth_id);
  perform public.onboarding_save_stammdaten('Ruth', 'Tester', date '1990-05-01', 'female',
    'Hauptstr. 1', '77815', 'Buehl', '07223 1234');
  return next is(coalesce(current_setting('tcm.selbstpflege_rpc', true), ''), '',
    'Nach der RPC ist die Umgehung aus');
  return next throws_ok(
    format($q$update public.members set status = 'inactive' where id = %L$q$, m.member_id),
    '42501', null, 'und ein direktes Aendern scheitert wieder');
  perform set_config('role', 'postgres', true);

  -- Jede Funktion, die sie einschaltet, schaltet sie auch aus.
  return next is(
    (select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p
      where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
        and (select count(*) from regexp_matches(p.prosrc, 'selbstpflege_rpc'',\s*''on''', 'g'))
         <> (select count(*) from regexp_matches(p.prosrc, 'selbstpflege_rpc'',\s*''''', 'g'))),
    null, 'Ein und aus kommen paarweise');

  -- Ein Client kommt an set_config nur ueber eine Funktion in public. Keine
  -- setzt eine Einstellung, deren Namen der Aufrufer bestimmt.
  return next is(
    (select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.prosrc ~* 'set_config\s*\(\s*[^''\s]'),
    null, 'Keine Funktion in public setzt eine frei benannte Einstellung');
end; $f$;

select plan(1);
select pass('pgTAP-Luecken (T4): Testfunktionen definiert');
