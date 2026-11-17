-- ===========================================================================
-- Funktionen, die bisher kein Test im Normalfall aufrief
--
-- Gemessen über pg_stat_user_functions: ein Aufruf zählt dort nur, wenn die
-- Funktion ohne Fehler zurückkehrt. Was die Suite nur über throws_ok kannte,
-- stand deshalb bei 0.
--
--   1. deactivate_bank_account: Konto stilllegen, nicht mit aktivem Mandat.
--   2. disable_push_token: Gerät stilllegen, nur Versanddienst oder Admin.
--   3. release_notification_pushes: Push wieder freigeben, nur Versanddienst
--      oder Admin; der Mailversand bleibt unberührt.
--   4. event_admin_abmelden: Abmelden durch den Vorstand löscht die Forderung
--      und lässt nachrücken; nicht doppelt, nicht nach gutgeschriebenen
--      Stunden.
--   5. remove_work_duty_rule: Soll-Regel entfernen, nicht nach der Abrechnung.
--   6. set_fee_type_active: Beitragsart stilllegen und zurückholen, nennt die
--      Zuordnungen des laufenden Jahres.
--   7. submit_membership_application: die alte Einreichung nimmt nichts mehr
--      an, für niemanden.
--   8. guard_closed_billing_period: ergänzt den Test zur geschlossenen
--      Periode aus 01_constraints.sql um offene Monate, „abgerechnet“, das
--      Verschieben in einen anderen Monat und die Rücknahme über die RPC.
--      Das Herausschieben aus einem geschlossenen Monat steht als todo: der
--      Trigger lässt es zu (siehe dort).
--   9. Lesefunktionen: drink_price_history, my_drink_summary,
--      work_duty_settlement_preview, iban_check_digits.
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgeführt
-- werden sie in 99_runtests.sql.
--
-- Fixtures aus 01_constraints.sql (fixture_login, fixture_member), 02_rls.sql
-- (fixture_user, act_as, act_as_anon), 10_getraenkekarte.sql
-- (fixture_getraenk), 11_forderungen.sql (fixture_beitragsart,
-- fixture_beitragszahler), 13_lastschrift.sql (fixture_mandat),
-- 15_arbeitsdienst.sql (fixture_dienstpflichtig),
-- 16_benachrichtigungs_pushes.sql (fixture_user_mit_geraet,
-- lege_push_nachricht_an), 25_veranstaltungen.sql (fixture_event,
-- schluss_vorbei, event_forderung).
--
-- Merke: nach tests.act_as() besteht kein Zugriff mehr auf das Schema tests.
-- Die Rolle wird deshalb inline mit set_config zurückgesetzt.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Bankverbindung stilllegen
-- ---------------------------------------------------------------------------

create or replace function tests.test_konto_stilllegen()
returns setof text language plpgsql as $f$
declare adm record; a record; v_konto uuid; v_zweit uuid; v_mandat uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;

  perform tests.act_as(adm.auth_id);
  v_konto := public.add_bank_account(a.member_id, 'DE89370400440532013000');
  v_zweit := public.add_bank_account(a.member_id, 'DE02120300000000202051');
  perform public.deactivate_bank_account(v_konto);
  perform set_config('role', 'postgres', true);

  return next is((select active from public.bank_accounts where id = v_konto), false,
    'Das Konto ist stillgelegt');
  return next is((select active from public.bank_accounts where id = v_zweit), true,
    'Das zweite Konto des Mitglieds bleibt aktiv');
  return next is((select count(*)::integer from public.bank_accounts where member_id = a.member_id), 2,
    'Gelöscht wird nichts');

  perform tests.act_as(adm.auth_id);
  return next lives_ok(format('select public.deactivate_bank_account(%L)', v_konto),
    'Ein zweites Stilllegen ist folgenlos');

  -- Mit aktivem Mandat nicht, nach dem Widerruf schon.
  perform public.create_sepa_mandate(a.member_id, v_zweit);
  return next throws_ok(format('select public.deactivate_bank_account(%L)', v_zweit),
    '23514', null, 'Mit aktivem Mandat bleibt das Konto bestehen');
  perform set_config('role', 'postgres', true);
  return next is((select active from public.bank_accounts where id = v_zweit), true,
    'und ist weiter aktiv');
  select id into v_mandat from public.sepa_mandates
   where bank_account_id = v_zweit and status = 'active';

  perform tests.act_as(adm.auth_id);
  perform public.revoke_sepa_mandate(v_mandat);
  return next lives_ok(format('select public.deactivate_bank_account(%L)', v_zweit),
    'Nach dem Widerruf des Mandats lässt es sich stilllegen');
  perform set_config('role', 'postgres', true);
  return next is((select active from public.bank_accounts where id = v_zweit), false,
    'und ist dann stillgelegt');
end; $f$;

create or replace function tests.test_konto_stilllegen_rechte_und_fehler()
returns setof text language plpgsql as $f$
declare adm record; vorstand record; platzwart record; a record; v_konto uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into vorstand from tests.fixture_user('board', 'Vorstand') limit 1;
  select * into platzwart from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into a from tests.fixture_user() limit 1;

  perform tests.act_as(adm.auth_id);
  v_konto := public.add_bank_account(a.member_id, 'DE89370400440532013000');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(a.auth_id);
  return next throws_ok(format('select public.deactivate_bank_account(%L)', v_konto),
    '42501', null, 'Ein Mitglied legt auch das eigene Konto nicht still');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(platzwart.auth_id);
  return next throws_ok(format('select public.deactivate_bank_account(%L)', v_konto),
    '42501', null, 'Der Platzwart nicht');
  perform set_config('role', 'postgres', true);

  perform tests.act_as_anon();
  return next throws_ok(format('select public.deactivate_bank_account(%L)', v_konto),
    '42501', null, 'Ohne Anmeldung nicht');
  perform set_config('role', 'postgres', true);

  return next is((select active from public.bank_accounts where id = v_konto), true,
    'Das Konto ist nach allen Versuchen aktiv');

  perform tests.act_as(adm.auth_id);
  return next throws_ok(format('select public.deactivate_bank_account(%L)', gen_random_uuid()),
    'P0002', null, 'Ein unbekanntes Konto wird gemeldet');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(vorstand.auth_id);
  return next lives_ok(format('select public.deactivate_bank_account(%L)', v_konto),
    'Der Vorstand darf');
  perform set_config('role', 'postgres', true);
  return next is((select active from public.bank_accounts where id = v_konto), false,
    'und das Konto ist stillgelegt');
end; $f$;

-- ---------------------------------------------------------------------------
-- 2. Push-Gerät stilllegen
-- ---------------------------------------------------------------------------

create or replace function tests.test_push_geraet_stilllegen()
returns setof text language plpgsql as $f$
declare u record; x record; v_zeilen integer; v_anzahl integer;
begin
  select * into u from tests.fixture_user_mit_geraet() limit 1;
  select * into x from tests.fixture_user_mit_geraet() limit 1;
  select count(*)::integer into v_anzahl from public.push_tokens where disabled_at is not null;

  -- Der Versanddienst ruft ohne angemeldeten Nutzer, mit dem Dienstschlüssel.
  perform set_config('request.jwt.claims', null, true);
  perform set_config('role', 'service_role', true);
  perform public.disable_push_token('  ' || u.token || ' ');
  perform set_config('role', 'postgres', true);

  return next isnt((select disabled_at from public.push_tokens where token = u.token), null,
    'Das Gerät ist stillgelegt, Leerraum um die Marke stört nicht');
  return next is((select disabled_at from public.push_tokens where token = x.token), null,
    'Ein anderes Gerät bleibt aktiv');
  return next is((select count(*)::integer from public.push_tokens where disabled_at is not null),
    v_anzahl + 1, 'Genau ein Gerät ist dazugekommen');

  perform tests.lege_push_nachricht_an(u.member_id, 'booking_cancelled');
  select count(*)::integer into v_zeilen
  from public.claim_notification_pushes() c where c.member_id = u.member_id;
  return next is(v_zeilen, 0, 'An das stillgelegte Gerät geht nichts mehr');

  -- Der Zeitpunkt des ersten Stilllegens bleibt stehen.
  update public.push_tokens set disabled_at = '2020-01-01 12:00+00' where token = u.token;
  perform set_config('role', 'service_role', true);
  perform public.disable_push_token(u.token);
  return next lives_ok($q$select public.disable_push_token('zz-gibt-es-nicht')$q$,
    'Eine unbekannte Marke ist kein Fehler');
  return next lives_ok('select public.disable_push_token(null)', 'Eine leere auch nicht');
  perform set_config('role', 'postgres', true);
  return next is((select disabled_at from public.push_tokens where token = u.token),
    '2020-01-01 12:00+00'::timestamptz, 'Ein zweites Stilllegen überschreibt den Zeitpunkt nicht');
end; $f$;

create or replace function tests.test_push_geraet_stilllegen_nur_dienst_oder_admin()
returns setof text language plpgsql as $f$
declare u record; adm record; platzwart record;
begin
  select * into u from tests.fixture_user_mit_geraet() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into platzwart from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;

  perform tests.act_as(u.auth_id);
  return next throws_ok(format('select public.disable_push_token(%L)', u.token),
    '42501', null, 'Ein Mitglied legt über diese Funktion kein Gerät still, auch nicht das eigene');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(platzwart.auth_id);
  return next throws_ok(format('select public.disable_push_token(%L)', u.token),
    '42501', null, 'Der Platzwart nicht');
  perform set_config('role', 'postgres', true);

  perform tests.act_as_anon();
  return next throws_ok(format('select public.disable_push_token(%L)', u.token),
    '42501', null, 'Ohne Anmeldung nicht');
  perform set_config('role', 'postgres', true);

  return next is((select disabled_at from public.push_tokens where token = u.token), null,
    'Das Gerät ist nach allen Versuchen aktiv');

  perform tests.act_as(adm.auth_id);
  return next lives_ok(format('select public.disable_push_token(%L)', u.token),
    'Ein Admin darf');
  perform set_config('role', 'postgres', true);
  return next isnt((select disabled_at from public.push_tokens where token = u.token), null,
    'und das Gerät ist stillgelegt');
end; $f$;

-- ---------------------------------------------------------------------------
-- 3. Push-Benachrichtigungen freigeben
-- ---------------------------------------------------------------------------

create or replace function tests.test_push_freigeben_erlaubt_neuen_versuch()
returns setof text language plpgsql as $f$
declare u record; x record; v_id uuid; v_fremd uuid; v_zeilen integer; v_anzahl integer;
begin
  select * into u from tests.fixture_user_mit_geraet() limit 1;
  select * into x from tests.fixture_user_mit_geraet() limit 1;
  v_id := tests.lege_push_nachricht_an(u.member_id, 'booking_cancelled');
  v_fremd := tests.lege_push_nachricht_an(x.member_id, 'booking_cancelled');
  -- Die Mail ist schon raus: das Freigeben des Pushs darf sie nicht anfassen.
  update public.notifications set mailed_at = '2020-01-01 12:00+00' where id = v_id;

  perform public.claim_notification_pushes();
  return next isnt((select pushed_at from public.notifications where id = v_id), null,
    'Vorher: die Nachricht ist abgehakt');

  -- Der Versanddienst ruft ohne angemeldeten Nutzer, mit dem Dienstschlüssel.
  perform set_config('request.jwt.claims', null, true);
  perform set_config('role', 'service_role', true);
  v_anzahl := public.release_notification_pushes(array[v_id, gen_random_uuid()]);
  perform set_config('role', 'postgres', true);

  return next is(v_anzahl, 1, 'Eine Nachricht wird freigegeben, die unbekannte Id zählt nicht');
  return next is((select pushed_at from public.notifications where id = v_id), null,
    'Der Haken ist wieder weg');
  return next is((select mailed_at from public.notifications where id = v_id),
    '2020-01-01 12:00+00'::timestamptz, 'Der Haken der Mail bleibt');
  return next isnt((select pushed_at from public.notifications where id = v_fremd), null,
    'Eine nicht genannte Nachricht bleibt abgehakt');

  select count(*)::integer into v_zeilen
  from public.claim_notification_pushes() c where c.member_id = u.member_id;
  return next is(v_zeilen, 1, 'und der nächste Lauf nimmt sie wieder mit');

  perform set_config('role', 'service_role', true);
  return next is(public.release_notification_pushes('{}'::uuid[]), 0, 'Eine leere Liste gibt nichts frei');
  return next is(public.release_notification_pushes(null), 0, 'Keine Liste auch nicht');
  perform set_config('role', 'postgres', true);
  return next isnt((select pushed_at from public.notifications where id = v_fremd), null,
    'und die übrigen Nachrichten bleiben abgehakt');
end; $f$;

create or replace function tests.test_push_freigeben_nur_dienst_oder_admin()
returns setof text language plpgsql as $f$
declare u record; adm record; platzwart record; v_id uuid; v_anzahl integer;
begin
  select * into u from tests.fixture_user_mit_geraet() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into platzwart from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  v_id := tests.lege_push_nachricht_an(u.member_id, 'booking_cancelled');
  update public.notifications set pushed_at = now() where id = v_id;

  perform tests.act_as(u.auth_id);
  return next throws_ok(format('select public.release_notification_pushes(array[%L]::uuid[])', v_id),
    '42501', null, 'Ein Mitglied gibt keine Pushes frei, auch nicht die eigenen');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(platzwart.auth_id);
  return next throws_ok(format('select public.release_notification_pushes(array[%L]::uuid[])', v_id),
    '42501', null, 'Der Platzwart nicht');
  perform set_config('role', 'postgres', true);

  perform tests.act_as_anon();
  return next throws_ok(format('select public.release_notification_pushes(array[%L]::uuid[])', v_id),
    '42501', null, 'Ohne Anmeldung nicht');
  perform set_config('role', 'postgres', true);

  return next isnt((select pushed_at from public.notifications where id = v_id), null,
    'Die Nachricht ist nach allen Versuchen abgehakt');

  perform tests.act_as(adm.auth_id);
  v_anzahl := public.release_notification_pushes(array[v_id]);
  perform set_config('role', 'postgres', true);
  return next is(v_anzahl, 1, 'Ein Admin darf den Versand neu anstoßen');
end; $f$;

-- ---------------------------------------------------------------------------
-- 4. Abmelden durch den Vorstand
-- ---------------------------------------------------------------------------

create or replace function tests.test_event_admin_abmelden()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1800, 1); adm record; a record; b record;
        v_reg uuid; r public.event_registrations;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;

  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  perform public.event_anmelden(v_event, 0);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(b.auth_id);
  perform public.event_anmelden(v_event, 0);
  perform set_config('role', 'postgres', true);

  select id into v_reg from public.event_registrations where event_id = v_event and member_id = a.member_id;
  return next is((tests.event_forderung(v_event, a.member_id)).amount_cents, 1800,
    'Vorher: a ist angemeldet und hat die Forderung');
  return next is((select status::text from public.event_registrations
                   where event_id = v_event and member_id = b.member_id), 'waitlisted',
    'und b steht auf der Warteliste');

  perform tests.act_as(adm.auth_id);
  perform public.event_admin_abmelden(v_reg);
  perform set_config('role', 'postgres', true);

  select * into r from public.event_registrations where id = v_reg;
  return next is(r.status::text, 'cancelled', 'a ist abgemeldet');
  return next isnt(r.cancelled_at, null, 'mit Zeitpunkt');
  return next is((tests.event_forderung(v_event, a.member_id)).id, null,
    'Die Forderung von a ist weg');
  return next is((select status::text from public.event_registrations
                   where event_id = v_event and member_id = b.member_id), 'registered',
    'b rückt nach');
  return next is((tests.event_forderung(v_event, b.member_id)).amount_cents, 1800,
    'und bekommt die Forderung');
end; $f$;

/**
 * Nach dem Anmeldeschluss kostet die eigene Abmeldung weiter. Meldet der
 * Vorstand ab, fällt die Forderung weg (solange sie in keinem Einzug steckt,
 * siehe test_event_im_einzug… in 25_veranstaltungen.sql). Nachgerückt wird
 * dann nicht mehr.
 */
create or replace function tests.test_event_admin_abmelden_nach_schluss()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1800, 1); adm record; a record; b record; v_reg uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;

  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  perform public.event_anmelden(v_event, 0);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(b.auth_id);
  perform public.event_anmelden(v_event, 0);
  perform set_config('role', 'postgres', true);
  select id into v_reg from public.event_registrations where event_id = v_event and member_id = a.member_id;
  perform tests.schluss_vorbei(v_event);

  perform tests.act_as(adm.auth_id);
  perform public.event_admin_abmelden(v_reg);
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.event_registrations where id = v_reg), 'cancelled',
    'Der Vorstand meldet auch nach dem Schluss ab');
  return next is((tests.event_forderung(v_event, a.member_id)).id, null,
    'Die Forderung fällt dabei weg');
  return next is((select status::text from public.event_registrations
                   where event_id = v_event and member_id = b.member_id), 'waitlisted',
    'Nach dem Schluss rückt niemand mehr nach');
  return next is((tests.event_forderung(v_event, b.member_id)).id, null,
    'und die Warteliste kostet weiter nichts');
end; $f$;

create or replace function tests.test_event_admin_abmelden_rechte_und_fehler()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1800); v_dienst uuid := tests.fixture_event(0, null, 10, 'arbeitsdienst', 3);
        adm record; vorstand record; platzwart record; a record; b record;
        v_reg uuid; v_reg_b uuid; v_reg_dienst uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into vorstand from tests.fixture_user('board', 'Vorstand') limit 1;
  select * into platzwart from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;

  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  perform public.event_anmelden(v_event, 0);
  perform public.event_anmelden(v_dienst, 0);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(b.auth_id);
  perform public.event_anmelden(v_event, 0);
  perform set_config('role', 'postgres', true);
  select id into v_reg from public.event_registrations where event_id = v_event and member_id = a.member_id;
  select id into v_reg_b from public.event_registrations where event_id = v_event and member_id = b.member_id;
  select id into v_reg_dienst from public.event_registrations where event_id = v_dienst and member_id = a.member_id;

  perform tests.act_as(a.auth_id);
  return next throws_ok(format('select public.event_admin_abmelden(%L::uuid)', v_reg),
    '42501', null, 'Ein Mitglied meldet über diese Funktion niemanden ab, auch nicht sich selbst');
  return next throws_ok(format('select public.event_admin_abmelden(%L::uuid)', v_reg_b),
    '42501', null, 'und keinen anderen');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(platzwart.auth_id);
  return next throws_ok(format('select public.event_admin_abmelden(%L::uuid)', v_reg),
    '42501', null, 'Der Platzwart nicht');
  perform set_config('role', 'postgres', true);

  perform tests.act_as_anon();
  return next throws_ok(format('select public.event_admin_abmelden(%L::uuid)', v_reg),
    '42501', null, 'Ohne Anmeldung nicht');
  perform set_config('role', 'postgres', true);

  return next is((select count(*)::integer from public.event_registrations
                   where id in (v_reg, v_reg_b) and status = 'registered'), 2,
    'Beide Anmeldungen stehen nach allen Versuchen');

  perform tests.act_as(adm.auth_id);
  return next throws_ok(format('select public.event_admin_abmelden(%L::uuid)', gen_random_uuid()),
    'P0002', null, 'Eine unbekannte Anmeldung wird gemeldet');
  perform set_config('role', 'postgres', true);

  -- Sind die Stunden gutgeschrieben, muss erst der Eintrag im Arbeitsdienst weg.
  insert into public.work_duty_entries (member_id, year, hours, worked_on, description, event_id)
  values (a.member_id, 2090, 3, '2090-05-01', 'ZZTest Arbeitsdienst', v_dienst);
  perform tests.act_as(adm.auth_id);
  return next throws_ok(format('select public.event_admin_abmelden(%L::uuid)', v_reg_dienst),
    '22023', null, 'Mit gutgeschriebenen Stunden nicht');
  perform set_config('role', 'postgres', true);
  return next is((select status::text from public.event_registrations where id = v_reg_dienst), 'registered',
    'Die Anmeldung zum Arbeitsdienst bleibt');

  perform tests.act_as(vorstand.auth_id);
  return next lives_ok(format('select public.event_admin_abmelden(%L::uuid)', v_reg),
    'Der Vorstand darf');
  return next throws_ok(format('select public.event_admin_abmelden(%L::uuid)', v_reg),
    '22023', null, 'Ein zweites Mal nicht: schon abgemeldet');
  perform set_config('role', 'postgres', true);
  return next is((tests.event_forderung(v_event, b.member_id)).amount_cents, 1800,
    'Die Forderung des anderen Mitglieds ist unverändert');
end; $f$;

-- ---------------------------------------------------------------------------
-- 5. Soll-Regel im Arbeitsdienst entfernen
-- ---------------------------------------------------------------------------

create or replace function tests.test_dienstregel_entfernen()
returns setof text language plpgsql as $f$
declare adm record; f record; v_anzahl integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_dienstpflichtig(2093, 8) limit 1;

  perform tests.act_as(adm.auth_id);
  -- Dieselbe Beitragsart mit einer Regel für ein anderes Jahr.
  perform public.upsert_work_duty_rule(f.art, 2094, 6);
  select count(*)::integer into v_anzahl from public.work_duty_overview(2093) o where o.member_id = f.mitglied;
  perform set_config('role', 'postgres', true);
  return next is(v_anzahl, 1, 'Vorher: das Mitglied hat ein Soll');

  perform tests.act_as(adm.auth_id);
  perform public.remove_work_duty_rule(f.art, 2093);
  select count(*)::integer into v_anzahl from public.work_duty_overview(2093) o where o.member_id = f.mitglied;
  perform set_config('role', 'postgres', true);

  return next is((select count(*)::integer from public.work_duty_rules
                   where fee_type_id = f.art and year = 2093), 0, 'Die Regel ist weg');
  return next is(v_anzahl, 0, 'und das Mitglied hat kein Soll mehr');
  return next is((select required_hours from public.work_duty_rules
                   where fee_type_id = f.art and year = 2094), 6::numeric,
    'Die Regel des anderen Jahres bleibt');
  return next ok(exists (select 1 from public.member_fees
                          where member_id = f.mitglied and fee_type_id = f.art and year = 2093),
    'Die Beitragsart bleibt dem Mitglied zugeordnet');

  perform tests.act_as(adm.auth_id);
  return next lives_ok(format('select public.remove_work_duty_rule(%L, 2093)', f.art),
    'Eine Regel, die es nicht gibt, ist kein Fehler');
  return next lives_ok(format('select public.remove_work_duty_rule(%L, 2093)', gen_random_uuid()),
    'auch nicht bei unbekannter Beitragsart');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_dienstregel_entfernen_rechte_und_sperre()
returns setof text language plpgsql as $f$
declare adm record; vorstand record; platzwart record; x record; f record; g record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into vorstand from tests.fixture_user('board', 'Vorstand') limit 1;
  select * into platzwart from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into x from tests.fixture_user() limit 1;
  select * into f from tests.fixture_dienstpflichtig(2093, 8) limit 1;
  select * into g from tests.fixture_dienstpflichtig(2016, 5) limit 1;

  perform tests.act_as(x.auth_id);
  return next throws_ok(format('select public.remove_work_duty_rule(%L, 2093)', f.art),
    '42501', null, 'Ein Mitglied entfernt keine Regel');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(platzwart.auth_id);
  return next throws_ok(format('select public.remove_work_duty_rule(%L, 2093)', f.art),
    '42501', null, 'Der Platzwart nicht');
  perform set_config('role', 'postgres', true);

  perform tests.act_as_anon();
  return next throws_ok(format('select public.remove_work_duty_rule(%L, 2093)', f.art),
    '42501', null, 'Ohne Anmeldung nicht');
  perform set_config('role', 'postgres', true);

  return next is((select required_hours from public.work_duty_rules
                   where fee_type_id = f.art and year = 2093), 8::numeric,
    'Die Regel steht nach allen Versuchen');

  -- Nach der Abrechnung sind die Regeln des Jahres gesperrt.
  perform tests.act_as(adm.auth_id);
  perform public.work_duty_settle_year(2016);
  return next throws_ok(format('select public.remove_work_duty_rule(%L, 2016)', g.art),
    '22023', null, 'Nach der Abrechnung lässt sich die Regel nicht mehr entfernen');
  perform set_config('role', 'postgres', true);
  return next is((select required_hours from public.work_duty_rules
                   where fee_type_id = g.art and year = 2016), 5::numeric,
    'Die Regel des abgerechneten Jahres bleibt');

  perform tests.act_as(vorstand.auth_id);
  return next lives_ok(format('select public.remove_work_duty_rule(%L, 2093)', f.art),
    'Der Vorstand darf, ein anderes Jahr ist nicht gesperrt');
  perform set_config('role', 'postgres', true);
  return next is((select count(*)::integer from public.work_duty_rules
                   where fee_type_id = f.art and year = 2093), 0, 'und die Regel ist weg');
end; $f$;

-- ---------------------------------------------------------------------------
-- 6. Beitragsart stilllegen und zurückholen
-- ---------------------------------------------------------------------------

create or replace function tests.test_beitragsart_stilllegen()
returns setof text language plpgsql as $f$
declare adm record; x record; v_art uuid; v_andere uuid; v_anzahl integer;
        v_jahr integer := extract(year from (now() at time zone 'Europe/Berlin'))::integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into x from tests.fixture_user() limit 1;
  v_art := tests.fixture_beitragsart('ZZTest Stilllegen', v_jahr, 10000);
  v_andere := tests.fixture_beitragsart('ZZTest Bleibt', v_jahr, 5000);
  -- Zwei Zuordnungen im laufenden Jahr, eine im nächsten: gezählt wird nur das laufende.
  perform tests.fixture_beitragszahler(v_art, v_jahr);
  perform tests.fixture_beitragszahler(v_art, v_jahr);
  perform tests.fixture_beitragszahler(v_art, v_jahr + 1);

  perform tests.act_as(adm.auth_id);
  v_anzahl := public.set_fee_type_active(v_art, false);
  perform set_config('role', 'postgres', true);

  return next is(v_anzahl, 2, 'Die Funktion nennt die Zuordnungen des laufenden Jahres');
  return next is((select active from public.fee_types where id = v_art), false, 'Die Beitragsart ist stillgelegt');
  return next is((select active from public.fee_types where id = v_andere), true, 'Eine andere bleibt aktiv');
  return next is((select count(*)::integer from public.member_fees where fee_type_id = v_art), 3,
    'Die bestehenden Zuordnungen bleiben');

  perform tests.act_as(adm.auth_id);
  return next throws_ok(format('select public.set_member_fee(%L, %L, %L)', x.member_id, v_art, v_jahr),
    'P0002', null, 'Eine stillgelegte Beitragsart lässt sich nicht mehr zuordnen');
  v_anzahl := public.set_fee_type_active(v_art, true);
  perform set_config('role', 'postgres', true);

  return next is(v_anzahl, 2, 'Zurückholen nennt dieselbe Zahl');
  return next is((select active from public.fee_types where id = v_art), true, 'und die Beitragsart ist wieder aktiv');

  perform tests.act_as(adm.auth_id);
  return next lives_ok(format('select public.set_member_fee(%L, %L, %L)', x.member_id, v_art, v_jahr),
    'Danach lässt sie sich wieder zuordnen');
  perform public.set_fee_type_active(v_art, false);
  perform public.set_fee_type_active(v_art, null);
  perform set_config('role', 'postgres', true);
  return next is((select active from public.fee_types where id = v_art), true,
    'Ohne Angabe gilt die Beitragsart als aktiv');
end; $f$;

create or replace function tests.test_beitragsart_stilllegen_rechte_und_fehler()
returns setof text language plpgsql as $f$
declare adm record; vorstand record; platzwart record; x record; v_art uuid;
        v_jahr integer := extract(year from (now() at time zone 'Europe/Berlin'))::integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into vorstand from tests.fixture_user('board', 'Vorstand') limit 1;
  select * into platzwart from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into x from tests.fixture_user() limit 1;
  v_art := tests.fixture_beitragsart('ZZTest Rechte', v_jahr, 10000);

  perform tests.act_as(x.auth_id);
  return next throws_ok(format('select public.set_fee_type_active(%L, false)', v_art),
    '42501', null, 'Ein Mitglied legt keine Beitragsart still');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(platzwart.auth_id);
  return next throws_ok(format('select public.set_fee_type_active(%L, false)', v_art),
    '42501', null, 'Der Platzwart nicht');
  perform set_config('role', 'postgres', true);

  perform tests.act_as_anon();
  return next throws_ok(format('select public.set_fee_type_active(%L, false)', v_art),
    '42501', null, 'Ohne Anmeldung nicht');
  perform set_config('role', 'postgres', true);

  return next is((select active from public.fee_types where id = v_art), true,
    'Die Beitragsart ist nach allen Versuchen aktiv');

  perform tests.act_as(adm.auth_id);
  return next throws_ok(format('select public.set_fee_type_active(%L, false)', gen_random_uuid()),
    'P0002', null, 'Eine unbekannte Beitragsart wird gemeldet');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(vorstand.auth_id);
  return next is(public.set_fee_type_active(v_art, false), 0, 'Der Vorstand darf, ohne Zuordnung ist die Zahl 0');
  perform set_config('role', 'postgres', true);
  return next is((select active from public.fee_types where id = v_art), false, 'und die Beitragsart ist stillgelegt');
end; $f$;

-- ---------------------------------------------------------------------------
-- 7. Die alte Einreichung des Mitgliedsantrags
--
-- submit_membership_application wirft seit S22 immer (das alte Web während
-- eines Deploys). In pg_stat_user_functions bleibt sie deshalb bei 0: dort
-- zählt nur, was ohne Fehler zurückkehrt. anon ohne weitere Angaben prüft
-- test_anon_kann_antrag_stellen in 04_mitglieder.sql.
-- ---------------------------------------------------------------------------

create or replace function tests.test_alte_antragseinreichung_nimmt_nichts_an()
returns setof text language plpgsql as $f$
declare a record; adm record; v_vorher integer;
        v_daten jsonb := tests.antrag_daten('zz.alt.eingereicht@example.org', 'Alt');
begin
  select * into a from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;
  select count(*)::integer into v_vorher from public.membership_applications;

  perform tests.act_as_anon();
  return next throws_ok(
    format($q$select public.submit_membership_application(%L::jsonb, '203.0.113.7', 'ZZTest Browser')$q$, v_daten),
    '0A000', 'Das Formular wurde gerade erneuert. Bitte lade die Seite neu und sende den Antrag noch einmal.',
    'anon: auch mit Herkunft und Browser, mit der Bitte neu zu laden');
  return next throws_ok('select public.submit_membership_application(null)',
    '0A000', null, 'anon: ohne Daten dieselbe Antwort, kein anderer Fehler');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format($q$select public.submit_membership_application(%L::jsonb)$q$, v_daten),
    '0A000', null, 'Ein angemeldetes Mitglied ebenso');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format($q$select public.submit_membership_application(%L::jsonb)$q$, v_daten),
    '0A000', null, 'Ein Admin ebenso');
  perform set_config('role', 'postgres', true);

  return next is((select count(*)::integer from public.membership_applications), v_vorher,
    'Es ist kein Antrag entstanden');
  return next ok(not exists (select 1 from public.membership_applications
                              where email = 'zz.alt.eingereicht@example.org'),
    'auch keiner mit dieser Adresse');
end; $f$;

-- ---------------------------------------------------------------------------
-- 8. Abgeschlossener Abrechnungszeitraum (guard_closed_billing_period)
-- ---------------------------------------------------------------------------

/** Ein Abrechnungszeitraum in ferner Zukunft, den sonst niemand benutzt. */
create or replace function tests.fixture_zeitraum(
  p_monat integer, p_status public.billing_period_status default 'open'
)
returns uuid language sql as $f$
  insert into public.billing_periods (year, month, status, closed_at, charged_at)
  values (2190, p_monat, p_status,
          case when p_status <> 'open' then now() end,
          case when p_status = 'charged' then now() end)
  returning id;
$f$;

/** Eine Entnahme in einem bestimmten Zeitraum, direkt in die Tabelle. */
create or replace function tests.fixture_entnahme(
  p_member_id uuid, p_item_id uuid, p_period_id uuid, p_menge integer default 1
)
returns uuid language sql as $f$
  insert into public.drink_purchases (member_id, drink_item_id, quantity, unit_price_cents, billing_period_id)
  values (p_member_id, p_item_id, p_menge, 200, p_period_id)
  returning id;
$f$;

create or replace function tests.test_offene_periode_laesst_aenderungen_zu()
returns setof text language plpgsql as $f$
declare v_mem uuid := tests.fixture_member(); v_item uuid := tests.fixture_getraenk('ZZTest Offen', 200);
        v_offen uuid; v_ziel uuid; v_id uuid;
begin
  perform set_config('request.jwt.claims', null, true);
  v_offen := tests.fixture_zeitraum(1);
  v_ziel := tests.fixture_zeitraum(2);
  v_id := tests.fixture_entnahme(v_mem, v_item, v_offen);

  return next lives_ok(format('update public.drink_purchases set quantity = 3 where id = %L', v_id),
    'Im offenen Zeitraum lässt sich eine Entnahme ändern');
  return next is((select total_cents from public.drink_purchases where id = v_id), 600, 'und die Summe zieht mit');
  return next lives_ok(
    format('update public.drink_purchases set billing_period_id = %L where id = %L', v_ziel, v_id),
    'Verschieben in einen anderen offenen Zeitraum geht');
  return next lives_ok(format('delete from public.drink_purchases where id = %L', v_id),
    'Löschen auch');
  return next ok(not exists (select 1 from public.drink_purchases where id = v_id), 'Die Entnahme ist weg');
end; $f$;

create or replace function tests.test_abgerechnete_periode_sperrt_wie_geschlossene()
returns setof text language plpgsql as $f$
declare v_mem uuid := tests.fixture_member(); v_item uuid := tests.fixture_getraenk('ZZTest Abgerechnet', 200);
        v_period uuid; v_id uuid;
begin
  perform set_config('request.jwt.claims', null, true);
  v_period := tests.fixture_zeitraum(3);
  v_id := tests.fixture_entnahme(v_mem, v_item, v_period);
  update public.billing_periods set status = 'charged', closed_at = now(), charged_at = now() where id = v_period;

  return next throws_ok(format('update public.drink_purchases set quantity = 5 where id = %L', v_id),
    '23514', 'Abrechnungszeitraum 2190-03 ist abgeschlossen (charged). Buchungen können nicht mehr geändert werden.',
    'Ändern im abgerechneten Zeitraum wird abgewiesen, die Meldung nennt Monat und Stand');
  return next throws_ok(format('delete from public.drink_purchases where id = %L', v_id),
    '23514', null, 'Löschen auch');
  return next throws_ok(
    format('insert into public.drink_purchases (member_id, drink_item_id, quantity, unit_price_cents, billing_period_id)
            values (%L, %L, 1, 200, %L)', v_mem, v_item, v_period),
    '23514', null, 'und eine neue Entnahme');
  return next is((select quantity from public.drink_purchases where id = v_id), 1, 'Die Entnahme ist unverändert');

  -- Die Sperre hängt am Stand des Zeitraums, nicht an der Entnahme.
  update public.billing_periods set status = 'open', closed_at = null, charged_at = null where id = v_period;
  return next lives_ok(format('update public.drink_purchases set quantity = 5 where id = %L', v_id),
    'Ist der Zeitraum wieder offen, geht die Änderung');
end; $f$;

create or replace function tests.test_verschieben_in_geschlossene_periode_abgewiesen()
returns setof text language plpgsql as $f$
declare v_mem uuid := tests.fixture_member(); v_item uuid := tests.fixture_getraenk('ZZTest Verschieben', 200);
        v_offen uuid; v_zu uuid; v_id uuid;
begin
  perform set_config('request.jwt.claims', null, true);
  v_offen := tests.fixture_zeitraum(4);
  v_zu := tests.fixture_zeitraum(5, 'closed');
  v_id := tests.fixture_entnahme(v_mem, v_item, v_offen);

  return next throws_ok(
    format('update public.drink_purchases set billing_period_id = %L where id = %L', v_zu, v_id),
    '23514', null, 'Eine Entnahme lässt sich nicht in einen geschlossenen Zeitraum schieben');
  return next is((select billing_period_id from public.drink_purchases where id = v_id), v_offen,
    'Sie bleibt, wo sie war');
end; $f$;

/**
 * TODO, echter Fehler im Trigger: bei einem UPDATE prüft er zuerst
 * coalesce(new.billing_period_id, old.billing_period_id), also den NEUEN
 * Zeitraum. Der alte wird nie geprüft. Eine Entnahme lässt sich deshalb aus
 * einem geschlossenen oder abgerechneten Monat in einen offenen schieben und
 * dort ändern oder löschen. Der Zweig „Zielzeitraum ist abgeschlossen“ ist
 * aus demselben Grund unerreichbar.
 *
 * Über die API geht das nicht: authenticated hat auf drink_purchases nur
 * SELECT, und keine Funktion ändert billing_period_id. Betroffen ist, wer
 * direkt schreibt (Dienstschlüssel, SQL).
 *
 * Die Prüfungen stehen als todo, bis eine Migration den Trigger korrigiert
 * (bei UPDATE zuerst old.billing_period_id prüfen). Danach todo_start und
 * todo_end entfernen.
 */
create or replace function tests.test_verschieben_aus_geschlossener_periode_abgewiesen()
returns setof text language plpgsql as $f$
declare v_mem uuid := tests.fixture_member(); v_item uuid := tests.fixture_getraenk('ZZTest Herausschieben', 200);
        v_offen uuid; v_zu uuid; v_ab uuid; v_alt uuid; v_abgerechnet uuid;
begin
  perform set_config('request.jwt.claims', null, true);
  v_offen := tests.fixture_zeitraum(9);
  v_zu := tests.fixture_zeitraum(10);
  v_ab := tests.fixture_zeitraum(11);
  v_alt := tests.fixture_entnahme(v_mem, v_item, v_zu);
  v_abgerechnet := tests.fixture_entnahme(v_mem, v_item, v_ab);
  update public.billing_periods set status = 'closed', closed_at = now() where id = v_zu;
  update public.billing_periods set status = 'charged', closed_at = now(), charged_at = now() where id = v_ab;

  perform todo_start('guard_closed_billing_period prüft bei UPDATE nur den neuen Zeitraum, nicht den alten');
  return next throws_ok(
    format('update public.drink_purchases set billing_period_id = %L where id = %L', v_offen, v_alt),
    '23514', null, 'Eine Entnahme lässt sich nicht aus einem geschlossenen Zeitraum herausschieben');
  return next throws_ok(
    format('update public.drink_purchases set billing_period_id = %L where id = %L', v_offen, v_abgerechnet),
    '23514', null, 'und nicht aus einem abgerechneten');
  return next is((select billing_period_id from public.drink_purchases where id = v_alt), v_zu,
    'Die Entnahme des geschlossenen Monats bleibt dort');
  return next is((select billing_period_id from public.drink_purchases where id = v_abgerechnet), v_ab,
    'die des abgerechneten auch');
  perform todo_end();
end; $f$;

/**
 * Die Sperre gilt auch für die RPC: weder das Mitglied noch ein Admin nimmt
 * eine Entnahme aus einem geschlossenen Monat zurück.
 */
create or replace function tests.test_ruecknahme_in_geschlossener_periode_abgewiesen()
returns setof text language plpgsql as $f$
declare a record; adm record; v_item uuid := tests.fixture_getraenk('ZZTest Rücknahme', 200);
        v_period uuid; v_id uuid;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;
  perform set_config('request.jwt.claims', null, true);
  v_period := tests.fixture_zeitraum(6);
  v_id := tests.fixture_entnahme(a.member_id, v_item, v_period);
  update public.billing_periods set status = 'closed', closed_at = now() where id = v_period;

  perform tests.act_as(a.auth_id);
  return next throws_ok(format('select public.void_drink_purchase(%L)', v_id),
    '23514', null, 'Das Mitglied nimmt im geschlossenen Monat nichts zurück');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  return next throws_ok(format('select public.void_drink_purchase(%L, %L)', v_id, 'ZZTest'),
    '23514', null, 'Ein Admin auch nicht');
  perform set_config('role', 'postgres', true);

  return next is((select voided_at from public.drink_purchases where id = v_id), null,
    'Die Entnahme ist nicht zurückgenommen');
  return next ok(not has_function_privilege('authenticated', 'public.guard_closed_billing_period()', 'execute')
             and not has_function_privilege('anon', 'public.guard_closed_billing_period()', 'execute'),
    'Die Triggerfunktion selbst ist für authenticated und anon nicht ausführbar');
end; $f$;

-- ---------------------------------------------------------------------------
-- 9. Lesefunktionen
-- ---------------------------------------------------------------------------

create or replace function tests.test_getraenk_preishistorie()
returns setof text language plpgsql as $f$
declare adm record; x record; v_id uuid := tests.fixture_getraenk('ZZTest Historie', 200);
        v_heute date := (now() at time zone 'Europe/Berlin')::date;
        v_zeilen text[]; v_anzahl integer; v_aelteste date;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into x from tests.fixture_user() limit 1;
  insert into public.drink_prices (drink_item_id, valid_from, price_cents)
  values (v_id, v_heute - 30, 150);

  perform tests.act_as(adm.auth_id);
  perform public.set_drink_price(v_id, 250, v_heute + 1);
  select array_agg(h.valid_from || ' ' || h.price_cents || ' ' || h.ist_aktuell || ' ' || h.geplant)
    into v_zeilen
  from public.drink_price_history(v_id) h;
  perform set_config('role', 'postgres', true);

  return next is(v_zeilen, array[
      (v_heute + 1) || ' 250 false true',
      v_heute || ' 200 true false',
      (v_heute - 30) || ' 150 false false'],
    'Neueste zuerst: geplant, aktuell, früher');

  -- Höchstens die zehn jüngsten Preise.
  insert into public.drink_prices (drink_item_id, valid_from, price_cents)
  select v_id, v_heute - 100 - n, 100 + n from generate_series(1, 10) n;
  perform tests.act_as(adm.auth_id);
  select count(*)::integer, min(h.valid_from) into v_anzahl, v_aelteste from public.drink_price_history(v_id) h;
  return next is(v_anzahl, 10, 'Von dreizehn Preisen kommen zehn');
  return next is(v_aelteste, v_heute - 107, 'und zwar die jüngsten');
  return next is((select count(*)::integer from public.drink_price_history(gen_random_uuid())), 0,
    'Ein unbekanntes Getränk hat keine Historie');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(x.auth_id);
  return next is((select count(*)::integer from public.drink_price_history(v_id)), 0,
    'Mitglieder sehen die Historie nicht');
  perform set_config('role', 'postgres', true);

  perform tests.act_as_anon();
  return next throws_ok(format('select * from public.drink_price_history(%L)', v_id),
    '42501', null, 'Ohne Anmeldung nicht aufrufbar');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_meine_getraenke_zusammenfassung()
returns setof text language plpgsql as $f$
declare a record; b record; v_ohne uuid := tests.fixture_login();
        v_bier uuid := tests.fixture_getraenk('ZZTest Bier', 200);
        v_wasser uuid := tests.fixture_getraenk('ZZTest Wasser', 150);
        v_storno uuid; v_alt uuid; v_zeilen text[];
        v_jahr integer := extract(year from (now() at time zone 'Europe/Berlin'))::integer;
        v_monat integer := extract(month from (now() at time zone 'Europe/Berlin'))::integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform set_config('request.jwt.claims', null, true);
  -- Eine Entnahme aus einem anderen Monat.
  v_alt := tests.fixture_zeitraum(7);
  perform tests.fixture_entnahme(a.member_id, v_bier, v_alt, 4);

  perform tests.act_as(a.auth_id);
  perform public.record_drink_purchase(v_bier, 2);
  perform public.record_drink_purchase(v_bier, 1);
  perform public.record_drink_purchase(v_wasser, 1);
  select public.record_drink_purchase(v_wasser, 5) into v_storno;
  perform public.void_drink_purchase(v_storno);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(b.auth_id);
  perform public.record_drink_purchase(v_bier, 7);
  perform set_config('role', 'postgres', true);

  perform tests.act_as(a.auth_id);
  select array_agg(s.item_name || ' ' || s.quantity || ' ' || s.total_cents) into v_zeilen
  from public.my_drink_summary() s;
  return next is(v_zeilen, array['ZZTest Bier 3 600', 'ZZTest Wasser 1 150'],
    'Der laufende Monat: je Getränk eine Zeile, nach Name, ohne Zurückgenommenes und ohne fremde Entnahmen');
  select array_agg(s.item_name || ' ' || s.quantity || ' ' || s.total_cents) into v_zeilen
  from public.my_drink_summary(v_jahr, v_monat) s;
  return next is(v_zeilen, array['ZZTest Bier 3 600', 'ZZTest Wasser 1 150'],
    'Mit Jahr und Monat dasselbe');
  select array_agg(s.item_name || ' ' || s.quantity || ' ' || s.total_cents) into v_zeilen
  from public.my_drink_summary(2190, 7) s;
  return next is(v_zeilen, array['ZZTest Bier 4 800'], 'Ein anderer Monat zeigt nur dessen Entnahmen');
  return next is((select count(*)::integer from public.my_drink_summary(2190, 8)), 0,
    'Ein Monat ohne Entnahmen ist leer');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(b.auth_id);
  select array_agg(s.item_name || ' ' || s.quantity || ' ' || s.total_cents) into v_zeilen
  from public.my_drink_summary() s;
  return next is(v_zeilen, array['ZZTest Bier 7 1400'], 'Das andere Mitglied sieht nur die eigenen');
  return next is((select count(*)::integer from public.my_drink_summary(2190, 7)), 0,
    'und nichts aus dem Monat des ersten');
  perform set_config('role', 'postgres', true);

  -- Ein Login ohne Mitglied (etwa ein Kiosk-Gerät) hat keine Zusammenfassung.
  perform tests.act_as(v_ohne);
  return next is((select count(*)::integer from public.my_drink_summary()), 0,
    'Ohne Mitgliedschaft nichts');
  perform set_config('role', 'postgres', true);

  perform tests.act_as_anon();
  return next throws_ok('select * from public.my_drink_summary()',
    '42501', null, 'Ohne Anmeldung nicht aufrufbar');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_arbeitsdienst_abrechnung_vorschau()
returns setof text language plpgsql as $f$
declare adm record; x record; f record; g record; z record; v_erste uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into x from tests.fixture_user() limit 1;
  select * into f from tests.fixture_dienstpflichtig(2015, 10) limit 1;
  select * into g from tests.fixture_dienstpflichtig(2015, 5) limit 1;
  perform tests.fixture_mandat(g.mitglied);
  perform set_config('request.jwt.claims', null, true);
  update public.settings set value = '1500'::jsonb where key = 'work_duty.hourly_rate_cents';

  perform tests.act_as(adm.auth_id);
  perform public.record_work_duty(f.mitglied, 4, '2015-05-01');
  perform public.record_work_duty(g.mitglied, 6, '2015-05-01');

  select * into z from public.work_duty_settlement_preview(2015) p where p.member_id = f.mitglied;
  return next is(array[z.required_hours, z.completed_hours, z.missing_hours], array[10, 4, 6]::numeric[],
    'Soll, Ist und Fehlstunden');
  return next is(array[z.hourly_rate_cents, z.amount_cents], array[1500, 9000],
    'Sechs Stunden zum geltenden Satz von 15,00 Euro');
  return next is(array[z.has_mandate, z.schon_abgerechnet], array[false, false],
    'ohne Mandat, noch nicht abgerechnet');

  select * into z from public.work_duty_settlement_preview(2015) p where p.member_id = g.mitglied;
  return next is(array[z.missing_hours::integer, z.amount_cents], array[0, 0],
    'Wer sein Soll erfüllt hat, steht mit 0 in der Vorschau');
  return next is(z.has_mandate, true, 'mit Mandat');

  select p.member_id into v_erste from public.work_duty_settlement_preview(2015) p
   where p.member_id in (f.mitglied, g.mitglied) limit 1;
  return next is(v_erste, f.mitglied, 'Der höchste Betrag steht oben');
  return next is((select count(*)::integer from public.work_duty_settlement_preview(2015) p
                   where p.member_id in (f.mitglied, g.mitglied)), 2, 'Je Mitglied eine Zeile');
  return next is((select count(*)::integer from public.work_duty_settlement_preview(2014) p
                   where p.member_id in (f.mitglied, g.mitglied)), 0, 'Ein anderes Jahr zeigt sie nicht');

  -- Die Vorschau schreibt nichts, die Abrechnung danach findet alles vor.
  return next is((select count(*)::integer from public.work_duty_settlements where year = 2015
                   and member_id in (f.mitglied, g.mitglied)), 0, 'Die Vorschau rechnet nicht ab');
  perform public.work_duty_settle_year(2015);
  select * into z from public.work_duty_settlement_preview(2015) p where p.member_id = f.mitglied;
  return next is(z.schon_abgerechnet, true, 'Nach der Abrechnung ist das Mitglied als abgerechnet markiert');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(x.auth_id);
  return next is((select count(*)::integer from public.work_duty_settlement_preview(2015)), 0,
    'Mitglieder sehen nichts');
  perform set_config('role', 'postgres', true);
  perform tests.act_as(f.auth);
  return next is((select count(*)::integer from public.work_duty_settlement_preview(2015)), 0,
    'auch nicht die eigene Zeile');
  perform set_config('role', 'postgres', true);

  perform tests.act_as_anon();
  return next throws_ok('select * from public.work_duty_settlement_preview(2015)',
    '42501', null, 'Ohne Anmeldung nicht aufrufbar');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_iban_pruefziffern()
returns setof text language plpgsql as $f$
declare a record;
begin
  select * into a from tests.fixture_user() limit 1;

  return next is(public.iban_check_digits('370400440532013000'), '89',
    'DE89 3704 0044 0532 0130 00: Deutschland ist die Vorgabe');
  return next is(public.iban_check_digits('120300000000202051', 'DE'), '02',
    'DE02 1203 0000 0000 2020 51: einstellige Prüfziffer mit führender Null');
  return next is(public.iban_check_digits('WEST12345698765432', 'GB'), '82',
    'GB82 WEST 1234 5698 7654 32: Buchstaben in der Kontonummer, anderes Land');
  return next is(public.iban_check_digits('west12345698765432', 'gb'), '82',
    'Kleinschreibung ändert nichts');
  return next ok(public.iban_is_valid('DE' || public.iban_check_digits('500105175407324931') || '500105175407324931'),
    'Eine damit gebaute IBAN besteht die Prüfung');

  -- Ein Helfer für Importe und Tests, kein Teil der API.
  perform tests.act_as(a.auth_id);
  return next throws_ok($q$select public.iban_check_digits('370400440532013000')$q$,
    '42501', null, 'Für authenticated nicht aufrufbar');
  perform set_config('role', 'postgres', true);
  perform tests.act_as_anon();
  return next throws_ok($q$select public.iban_check_digits('370400440532013000')$q$,
    '42501', null, 'Für anon auch nicht');
  perform set_config('role', 'postgres', true);
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgeführt werden sie in
-- 99_runtests.sql. Ohne Plan hält pg_prove die Datei für kaputt.
select extensions.plan(1);
select extensions.pass('Tests für bisher ungetestete Funktionen sind eingespielt');
select * from extensions.finish();
