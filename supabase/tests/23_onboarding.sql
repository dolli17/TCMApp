-- ===========================================================================
-- Onboarding: Pflichtfelder, Schritte, Mandat online und die Sperre
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
-- ===========================================================================

-- Ein Konto, wie es create_member anlegt: Pflicht-Stammdaten da, Passwort
-- gesetzt, Onboarding offen.
create or replace function tests.fixture_neu(p_birthday date default '1990-05-05')
returns table (member_id uuid, auth_id uuid)
language plpgsql as $f$
declare v record;
begin
  select * into v from tests.fixture_user(null, 'Neu') limit 1;
  update public.members set
    onboarding_completed_at = null, birthday = p_birthday, gender = 'female',
    street = 'Weg 1', postcode = '70372', city = 'Stuttgart', mobile = '0170 1'
  where id = v.member_id;
  update auth.users set encrypted_password = 'gesetzt' where id = v.auth_id;
  update public.settings set value = '"DE98ZZZ09999999999"'::jsonb where key = 'sepa.creditor_id';
  return query select v.member_id, v.auth_id;
end; $f$;

create or replace function tests.onboarding_fehlt(p_member_id uuid)
returns text[] language sql as $f$
  select private.onboarding_pflicht_fehlt(p_member_id);
$f$;

-- ---------------------------------------------------------------------------
-- Bestand
-- ---------------------------------------------------------------------------
create or replace function tests.test_onboarding_bestand_ist_freigeschaltet()
returns setof text language plpgsql as $f$
declare v_id uuid := tests.fixture_member();
begin
  return next is(
    (select count(*)::integer from public.members
      where onboarding_completed_at is null
        and email::text not in ('neu@tcm.local', 'kind@tcm.local')),
    0, 'Der Bestand hat kein offenes Onboarding (Migration und Seed setzen das Flag)');
  return next isnt(
    (select onboarding_completed_at from public.members where id = v_id),
    null, 'Direkt eingefuegte Mitglieder (Import, Seed) gelten als eingerichtet');
end; $f$;

create or replace function tests.test_onboarding_create_member_laesst_es_offen()
returns setof text language plpgsql as $f$
declare a record; v_login uuid := tests.fixture_login('ganz.neu@example.org'); v_id uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.act_as(a.auth_id);
  v_id := public.create_member('Ganz', 'Neu', 'ganz.neu@example.org',
    p_birthday => '1999-01-01', p_gender => 'diverse', p_street => 'Weg 1',
    p_postcode => '70372', p_city => 'Stuttgart', p_phone => '0711 1',
    p_auth_user_id => v_login);
  perform set_config('role', 'postgres', true);

  return next is((select onboarding_completed_at from public.members where id = v_id), null,
    'Ein neues Mitglied aus create_member hat ein offenes Onboarding');
  return next is((select salutation::text from public.members where id = v_id), 'none',
    'diverse ergibt die Anrede none');
end; $f$;

-- ---------------------------------------------------------------------------
-- Pflichtfelder
-- ---------------------------------------------------------------------------
create or replace function tests.test_onboarding_create_member_pflichtfelder()
returns setof text language plpgsql as $f$
declare a record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    $q$select public.create_member('Ohne', 'Daten', 'ohne.daten@example.org')$q$,
    '22023', 'Pflichtangaben fehlen: Geburtsdatum, Geschlecht, Straße, PLZ, Ort, Telefon.',
    'create_member nennt alle fehlenden Pflichtangaben');
  return next throws_ok(
    $q$select public.create_member('Ohne', 'Telefon', 'ohne.telefon@example.org',
         p_birthday => '1980-01-01', p_gender => 'male', p_street => 'Weg 1',
         p_postcode => '70372', p_city => 'Stuttgart', p_phone => '  ')$q$,
    '22023', 'Pflichtangaben fehlen: Telefon.',
    'Telefon oder Mobil muss angegeben sein');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_onboarding_antrag_pflichtfelder()
returns setof text language plpgsql as $f$
begin
  perform tests.act_as_anon();

  return next throws_ok(
    $q$select public.submit_membership_application(jsonb_build_object(
         'first_name','Ohne','last_name','Geschlecht','email','ohne.g@example.org',
         'birthday','1990-01-01','street','Weg 1','postcode','70372','city','Stuttgart',
         'phone','0711 1'))$q$,
    '22023', 'Bitte noch angeben: Geschlecht.', 'Ohne Geschlecht kein Antrag');
  return next throws_ok(
    $q$select public.submit_membership_application(jsonb_build_object(
         'first_name','Ohne','last_name','Adresse','email','ohne.a@example.org',
         'birthday','1990-01-01','gender','male'))$q$,
    '22023', 'Bitte noch angeben: Straße, PLZ, Ort, Telefon.', 'Adresse und Telefon sind Pflicht');
  return next lives_ok(
    $q$select public.submit_membership_application(jsonb_build_object(
         'first_name','Mit','last_name','Allem','email','mit.allem@example.org',
         'birthday','1990-01-01','gender','male','street','Weg 1','postcode','70372',
         'city','Stuttgart','phone','0711 1','message','Hallo Vorstand'))$q$,
    'Mit allen Pflichtangaben geht der Antrag durch');

  perform set_config('role', 'postgres', true);

  return next is(
    (select salutation::text || '/' || message from public.membership_applications
      where email = 'mit.allem@example.org'),
    'male/Hallo Vorstand', 'Anrede aus dem Geschlecht, Nachricht bleibt');
end; $f$;

-- Leeres Array = spaeter festlegen, null = Wunsch aus dem Antrag.
create or replace function tests.test_onboarding_antrag_beitragswahl()
returns setof text language plpgsql as $f$
declare admin record; v_art uuid; v_andere uuid; v_a1 uuid; v_a2 uuid; v_a3 uuid;
        v_e1 record; v_e2 record; v_e3 record;
        v_l1 uuid := gen_random_uuid(); v_l2 uuid := gen_random_uuid(); v_l3 uuid := gen_random_uuid();
begin
  insert into public.fee_types (code, name) values ('t_wunsch', 'Wunsch') returning id into v_art;
  insert into public.fee_types (code, name) values ('t_andere', 'Andere') returning id into v_andere;

  perform public.submit_membership_application(
    tests.antrag_daten('wahl.leer@example.org') || jsonb_build_object('desired_fee_type_id', v_art));
  perform public.submit_membership_application(
    tests.antrag_daten('wahl.null@example.org') || jsonb_build_object('desired_fee_type_id', v_art));
  perform public.submit_membership_application(
    tests.antrag_daten('wahl.andere@example.org') || jsonb_build_object('desired_fee_type_id', v_art));
  select id into v_a1 from public.membership_applications where email = 'wahl.leer@example.org';
  select id into v_a2 from public.membership_applications where email = 'wahl.null@example.org';
  select id into v_a3 from public.membership_applications where email = 'wahl.andere@example.org';
  perform tests.fixture_login('wahl.leer@example.org', v_l1);
  perform tests.fixture_login('wahl.null@example.org', v_l2);
  perform tests.fixture_login('wahl.andere@example.org', v_l3);

  select * into admin from tests.fixture_user('admin') limit 1;
  perform tests.act_as(admin.auth_id);
  select * into v_e1 from public.accept_membership_application(v_a1, p_fee_type_ids => '{}', p_auth_user_id => v_l1);
  select * into v_e2 from public.accept_membership_application(v_a2, p_auth_user_id => v_l2);
  select * into v_e3 from public.accept_membership_application(v_a3, p_fee_type_ids => array[v_andere], p_auth_user_id => v_l3);
  perform set_config('role', 'postgres', true);

  return next is((select count(*)::integer from public.member_fees where member_id = v_e1.member_id), 0,
    'Ein leeres Array ordnet keine Beitragsart zu');
  return next is((select fee_type_id from public.member_fees where member_id = v_e2.member_id), v_art,
    'Ohne Angabe gilt der Wunsch aus dem Antrag');
  return next is((select fee_type_id from public.member_fees where member_id = v_e3.member_id), v_andere,
    'Eine ausdrueckliche Wahl gewinnt');
end; $f$;

-- ---------------------------------------------------------------------------
-- Die Sperre ueber is_member()
-- ---------------------------------------------------------------------------
create or replace function tests.test_onboarding_offen_sperrt()
returns setof text language plpgsql as $f$
declare n record; v_court uuid := tests.fixture_court(); v_start timestamptz := tests.naechster_slot(2, 10);
        v_drink uuid := tests.fixture_getraenk('Onboarding-Wasser');
begin
  select * into n from tests.fixture_neu() limit 1;
  insert into public.notifications (member_id, kind, title, body)
  values (n.member_id, 'application_new', 'Hallo', 'Test');
  perform tests.act_as(n.auth_id);

  return next ok(not private.is_member(), 'is_member() ist false, solange das Onboarding offen ist');
  return next is((select count(*)::integer from public.courts), 0, 'Keine Plaetze sichtbar');
  return next is((select count(*)::integer from public.bookings), 0, 'Kein Belegungsplan');
  return next is((select count(*)::integer from public.drink_items), 0, 'Keine Getraenkekarte');
  return next is((select count(*)::integer from public.member_directory()), 0, 'Kein Verzeichnis');
  return next throws_ok(
    format($q$select public.create_booking(%L, %L, 'einzel', array[]::uuid[], array['Gast'])$q$, v_court, v_start),
    '42501', 'Bitte schließe zuerst die Einrichtung deines Kontos ab.', 'Buchen ist gesperrt');
  return next throws_ok(
    format($q$select public.record_drink_purchase(%L)$q$, v_drink),
    '42501', 'Bitte schließe zuerst die Einrichtung deines Kontos ab.', 'Getraenke buchen ist gesperrt');

  -- Was offen bleibt
  return next is((select count(*)::integer from public.members), 1, 'Die eigenen Stammdaten sind lesbar');
  return next is((select count(*)::integer from public.member_roles), 1, 'Die eigenen Rollen auch');
  return next is((select count(*)::integer from public.my_notifications()), 1, 'Benachrichtigungen kommen an');
  return next isnt(public.my_onboarding(), null, 'my_onboarding() antwortet');
  return next lives_ok(
    format($q$select public.set_member_attribute(%L, 'foto')$q$, n.member_id),
    'Eigene Merkmale lassen sich setzen');
  return next is((select count(*)::integer from public.legal_documents), 3, 'Die Rechtstexte sind lesbar');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_onboarding_abgeschlossen_schaltet_frei()
returns setof text language plpgsql as $f$
declare n record; v_court uuid := tests.fixture_court(); v_start timestamptz := tests.naechster_slot(2, 10);
begin
  select * into n from tests.fixture_neu() limit 1;
  update public.members set onboarding_completed_at = now() where id = n.member_id;
  perform tests.act_as(n.auth_id);

  return next ok(private.is_member(), 'Nach dem Abschluss ist is_member() true');
  return next ok((select count(*)::integer from public.courts) > 0, 'Plaetze sind sichtbar');
  return next ok((select count(*)::integer from public.member_directory()) > 0, 'Das Verzeichnis auch');
  return next lives_ok(
    format($q$select public.create_booking(%L, %L, 'einzel', array[]::uuid[], array['Gast'])$q$, v_court, v_start),
    'Buchen geht');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_onboarding_admin_und_kiosk_unberuehrt()
returns setof text language plpgsql as $f$
declare a record; v_kiosk uuid := tests.fixture_login('kiosk-onb@example.org');
        v_login uuid := tests.fixture_login('vom.admin@example.org');
begin
  select * into a from tests.fixture_user('admin') limit 1;
  update public.members set onboarding_completed_at = null where id = a.member_id;
  insert into public.kiosk_devices (auth_user_id, name) values (v_kiosk, 'Testkiosk');

  perform tests.act_as(a.auth_id);
  return next ok(private.is_admin(), 'Ein Admin mit offenem Onboarding bleibt Admin');
  return next lives_ok(
    format($q$select public.create_member('Vom', 'Admin', 'vom.admin@example.org',
      p_birthday => '1980-01-01', p_gender => 'male', p_street => 'Weg 1', p_postcode => '70372',
      p_city => 'Stuttgart', p_mobile => '0170 1', p_auth_user_id => %L)$q$, v_login),
    'und darf weiter Mitglieder anlegen');

  perform set_config('role', 'postgres', true);
  perform tests.act_as(v_kiosk);
  return next ok((select count(*)::integer from public.drink_items) > 0, 'Der Kiosk sieht die Getraenkekarte');
  return next ok((select count(*)::integer from public.member_directory()) > 0, 'und das Verzeichnis');

  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Schritte
-- ---------------------------------------------------------------------------
create or replace function tests.test_onboarding_stammdaten()
returns setof text language plpgsql as $f$
declare n record; v_m public.members;
begin
  select * into n from tests.fixture_neu() limit 1;
  perform tests.act_as(n.auth_id);

  return next throws_ok(
    $q$select public.onboarding_save_stammdaten('Neu', 'Person', '1991-02-03', 'male', '', '70372', 'Stuttgart', '0711 1')$q$,
    '22023', 'Pflichtangaben fehlen: Straße.', 'Pflichtfelder werden geprueft');
  return next throws_ok(
    $q$select public.onboarding_save_stammdaten('Neu', 'Person', '2999-02-03', 'male', 'Weg 2', '70372', 'Stuttgart', '0711 1')$q$,
    '22023', null, 'Ein Geburtsdatum in der Zukunft wird abgewiesen');
  return next lives_ok(
    $q$select public.onboarding_save_stammdaten('Neu', 'Person', '1991-02-03', 'male', 'Weg 2', '70372', 'Stuttgart', '0711 1')$q$,
    'Geburtsdatum und Geschlecht lassen sich im offenen Onboarding korrigieren');

  perform set_config('role', 'postgres', true);
  select * into v_m from public.members where id = n.member_id;
  return next is(v_m.birthday, '1991-02-03'::date, 'Das Geburtsdatum ist korrigiert');
  return next is(v_m.salutation::text, 'male', 'Die Anrede folgt dem Geschlecht');
  return next isnt(v_m.onboarding_stammdaten_at, null, 'Die Bestaetigung ist vermerkt');
  return next ok((private.onboarding_status(n.member_id) ->> 'stammdaten')::boolean, 'Schritt erledigt');

  perform set_config('request.jwt.claims', null, true);
  update public.members set onboarding_completed_at = now() where id = n.member_id;
  perform tests.act_as(n.auth_id);
  return next throws_ok(
    $q$select public.onboarding_save_stammdaten('Neu', 'Person', '1970-02-03', 'male', 'Weg 2', '70372', 'Stuttgart', '0711 1')$q$,
    '23514', null, 'Nach dem Abschluss nicht mehr');
  return next throws_ok(
    $q$update public.members set birthday = '1970-01-01' where id = private.current_member_id()$q$,
    '42501', null, 'Und direkt auch nicht');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_onboarding_rechtstexte()
returns setof text language plpgsql as $f$
declare n record;
begin
  select * into n from tests.fixture_neu() limit 1;
  perform tests.act_as(n.auth_id);

  return next throws_ok($q$select public.onboarding_accept_documents(array['agb'])$q$,
    '22023', null, 'Unbekannte Texte werden abgewiesen');
  return next lives_ok($q$select public.onboarding_accept_documents(array['satzung', 'beitragsordnung'])$q$,
    'Zustimmen geht');
  return next is((select count(*)::integer from public.member_consents), 2,
    'Das Mitglied liest seine eigenen Zustimmungen');
  perform set_config('role', 'postgres', true);

  return next ok(not (private.onboarding_status(n.member_id) ->> 'rechtliches')::boolean,
    'Ohne Datenschutz ist der Schritt offen');
  perform tests.act_as(n.auth_id);
  perform public.onboarding_accept_documents(array['datenschutz', 'satzung']);
  perform set_config('role', 'postgres', true);
  return next ok((private.onboarding_status(n.member_id) ->> 'rechtliches')::boolean,
    'Mit allen dreien erledigt, doppelt zustimmen schadet nicht');
  return next is((select version from public.member_consents
                   where member_id = n.member_id and document_code = 'satzung'), 1,
    'Gespeichert ist die aktuelle Version');

  -- Eine neue Satzung braucht eine neue Zustimmung.
  update public.legal_documents set active = false where code = 'satzung';
  insert into public.legal_documents (code, version, title, body_md) values ('satzung', 2, 'Satzung', 'neu');
  return next ok(not (private.onboarding_status(n.member_id) ->> 'rechtliches')::boolean,
    'Eine neue Version muss neu bestaetigt werden');
end; $f$;

create or replace function tests.test_onboarding_zustimmungen_nur_eigene()
returns setof text language plpgsql as $f$
declare n record; b record;
begin
  select * into n from tests.fixture_neu() limit 1;
  select * into b from tests.fixture_user() limit 1;
  insert into public.member_consents (member_id, document_code, version) values (n.member_id, 'satzung', 1);
  perform tests.act_as(b.auth_id);
  return next is((select count(*)::integer from public.member_consents), 0, 'Fremde Zustimmungen sind unsichtbar');
  return next throws_ok(
    format($q$insert into public.member_consents (member_id, document_code, version) values (%L, 'datenschutz', 1)$q$, b.member_id),
    '42501', null, 'Direkt schreiben geht nicht');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_onboarding_erziehungsberechtigte()
returns setof text language plpgsql as $f$
declare k record; e record; v_m public.members;
begin
  select * into k from tests.fixture_neu((current_date - interval '12 years')::date) limit 1;
  select * into e from tests.fixture_neu() limit 1;

  perform tests.act_as(k.auth_id);
  return next throws_ok($q$select public.onboarding_save_guardian('', 'mama@example.org', null, true)$q$,
    '22023', 'Bitte den Namen der Erziehungsberechtigten angeben.', 'Minderjaehrig: Name ist Pflicht');
  return next throws_ok($q$select public.onboarding_save_guardian('Mama', null, ' ', true)$q$,
    '22023', null, 'E-Mail oder Telefon ist Pflicht');
  return next throws_ok($q$select public.onboarding_save_guardian('Mama', 'mama@example.org', null, false)$q$,
    '22023', 'Die Erziehungsberechtigten müssen der Mitgliedschaft zustimmen.', 'Die Zustimmung ist Pflicht');
  return next lives_ok($q$select public.onboarding_save_guardian('Mama Kind', null, '0711 2', true)$q$,
    'Name, Telefon und Zustimmung reichen');
  perform set_config('role', 'postgres', true);

  select * into v_m from public.members where id = k.member_id;
  return next is(v_m.guardian_name, 'Mama Kind', 'Der Name ist gespeichert');
  return next isnt(v_m.guardian_consent_at, null, 'Die Zustimmung mit Zeitpunkt');
  return next ok((private.onboarding_status(k.member_id) ->> 'erziehungsberechtigte')::boolean, 'Schritt erledigt');

  perform tests.act_as(e.auth_id);
  return next lives_ok($q$select public.onboarding_save_guardian(null)$q$,
    'Bei Erwachsenen ist nichts Pflicht');
  perform set_config('role', 'postgres', true);
  return next ok(not ('erziehungsberechtigte' = any (tests.onboarding_fehlt(e.member_id))),
    'und der Schritt fehlt nie');
end; $f$;

create or replace function tests.test_onboarding_notfallkontakt()
returns setof text language plpgsql as $f$
declare k record; e record;
begin
  select * into k from tests.fixture_neu((current_date - interval '10 years')::date) limit 1;
  select * into e from tests.fixture_neu() limit 1;

  perform tests.act_as(k.auth_id);
  return next throws_ok($q$select public.onboarding_save_notfallkontakt('', '')$q$,
    '22023', 'Bei Minderjährigen sind Name und Telefonnummer des Notfallkontakts Pflicht.',
    'Minderjaehrig: Notfallkontakt ist Pflicht');
  return next lives_ok($q$select public.onboarding_save_notfallkontakt('Oma', '0711 3', 'Grossmutter')$q$,
    'Mit Name und Telefon geht es');

  perform set_config('role', 'postgres', true);
  perform tests.act_as(e.auth_id);
  return next lives_ok($q$select public.onboarding_save_notfallkontakt(null, null)$q$,
    'Erwachsene duerfen ihn leer lassen');
  return next throws_ok($q$select public.onboarding_save_notfallkontakt('Nur Name', null)$q$,
    '22023', null, 'Aber nicht halb');
  perform set_config('role', 'postgres', true);

  return next ok((private.onboarding_status(k.member_id) ->> 'notfallkontakt')::boolean, 'Beim Kind erledigt');
  return next ok(not ('notfallkontakt' = any (tests.onboarding_fehlt(e.member_id))),
    'Bei Erwachsenen kein Pflichtschritt');
end; $f$;

-- ---------------------------------------------------------------------------
-- SEPA-Mandat online
-- ---------------------------------------------------------------------------
create or replace function tests.test_onboarding_mandatstext()
returns setof text language plpgsql as $f$
begin
  -- Derselbe Text steht in packages/core/src/onboarding.test.ts.
  return next is(
    private.sepa_mandatstext('TC Muckensturm e.V.', 'DE98ZZZ09999999999', 'TCM-0001-2026'),
    'SEPA-Lastschriftmandat (SEPA-Basislastschrift)' || chr(10)
    || chr(10)
    || U&'Zahlungsempf\00e4nger: TC Muckensturm e.V.' || chr(10)
    || U&'Gl\00e4ubiger-Identifikationsnummer: DE98ZZZ09999999999' || chr(10)
    || 'Mandatsreferenz: TCM-0001-2026' || chr(10)
    || 'Zahlungsart: Wiederkehrende Zahlungen' || chr(10)
    || chr(10)
    || U&'Ich erm\00e4chtige TC Muckensturm e.V., Zahlungen von meinem Konto mittels Lastschrift einzuziehen. '
    || U&'Zugleich weise ich mein Kreditinstitut an, die von TC Muckensturm e.V. auf mein Konto gezogenen Lastschriften einzul\00f6sen.' || chr(10)
    || chr(10)
    || 'Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages verlangen. '
    || 'Es gelten dabei die mit meinem Kreditinstitut vereinbarten Bedingungen.',
    'Der Mandatstext ist wortgleich mit mandatstext() in packages/core');
end; $f$;

create or replace function tests.test_onboarding_mandat_erteilen()
returns setof text language plpgsql as $f$
declare n record; v_ref text; v_s public.sepa_mandates; v_k public.bank_accounts;
begin
  select * into n from tests.fixture_neu() limit 1;
  perform tests.act_as(n.auth_id);

  return next throws_ok($q$select public.create_my_sepa_mandate('DE89370400440532013000', null, false)$q$,
    '22023', 'Bitte bestätige das Mandat ausdrücklich.', 'Ohne ausdrueckliche Zustimmung kein Mandat');
  return next throws_ok($q$select public.create_my_sepa_mandate('DE00370400440532013000', null, true)$q$,
    '22023', 'Diese IBAN ist nicht gültig. Bitte die Ziffern prüfen.', 'Die IBAN wird geprueft');

  v_ref := public.create_my_sepa_mandate('DE89 3704 0044 0532 0130 00', null, true);
  return next isnt(v_ref, null, 'Das Mandat ist erteilt');

  return next throws_ok($q$select public.create_my_sepa_mandate('DE89370400440532013000', null, true)$q$,
    '23514', null, 'Ein zweites aktives Mandat wird abgewiesen');
  return next is((select count(*)::integer from public.sepa_mandates), 1, 'Das Mitglied sieht sein Mandat');
  perform set_config('role', 'postgres', true);

  select * into v_s from public.sepa_mandates where member_id = n.member_id;
  select * into v_k from public.bank_accounts where id = v_s.bank_account_id;
  return next is(v_s.reference, v_ref, 'Mit der vergebenen Referenz');
  return next is(v_s.sequence_type::text || '/' || v_s.source::text || '/' || v_s.status::text,
    'FRST/app/active', 'Erstlastschrift, aus der App, aktiv');
  return next is(v_s.signed_on, private.heute(), 'Unterschrieben heute');
  return next isnt(v_s.granted_online_at, null, 'Nachweis: Zeitpunkt');
  return next is(v_s.mandate_text,
    private.sepa_mandatstext('TC Muckensturm e.V.', 'DE98ZZZ09999999999', v_ref), 'Nachweis: Text');
  return next is(v_s.accepted_holder, v_k.holder, 'Nachweis: Kontoinhaber');
  return next is(v_k.holder, (select first_name || ' ' || last_name from public.members where id = n.member_id),
    'Ohne Angabe ist das Mitglied selbst Kontoinhaber');
  return next is(v_k.iban_last4, '3000', 'Die IBAN liegt verschluesselt mit den letzten Ziffern vor');
  return next ok((private.onboarding_status(n.member_id) ->> 'sepa')::boolean, 'Schritt erledigt');
end; $f$;

create or replace function tests.test_onboarding_mandat_vorhanden_oder_ohne_glaeubiger()
returns setof text language plpgsql as $f$
declare n record; m record; v_konto uuid;
begin
  select * into n from tests.fixture_neu() limit 1;
  select * into m from tests.fixture_neu() limit 1;
  insert into public.bank_accounts (member_id, iban_encrypted, iban_last4, holder)
  values (n.member_id, '\x00'::bytea, '1234', 'Alt') returning id into v_konto;
  insert into public.sepa_mandates (member_id, bank_account_id, reference, signed_on, source)
  values (n.member_id, v_konto, 'ALT-1', current_date, 'ebusy_import');

  perform tests.act_as(n.auth_id);
  return next throws_ok($q$select public.create_my_sepa_mandate('DE89370400440532013000', null, true)$q$,
    '23514', 'Für dich besteht bereits ein aktives SEPA-Mandat. Ändern kann es der Vorstand.',
    'Ein vorhandenes Mandat wird nicht ersetzt');
  perform set_config('role', 'postgres', true);
  return next ok((private.onboarding_status(n.member_id) ->> 'sepa')::boolean,
    'Ein vom Vorstand erfasstes Mandat zaehlt als erledigt');

  update public.settings set value = '""'::jsonb where key = 'sepa.creditor_id';
  perform tests.act_as(m.auth_id);
  return next throws_ok($q$select public.create_my_sepa_mandate('DE89370400440532013000', null, true)$q$,
    '23514', null, 'Ohne Glaeubiger-Id kein Mandat');
  return next ok(not (public.my_onboarding() -> 'mandat' ->> 'moeglich')::boolean,
    'my_onboarding sagt das vorher');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_onboarding_mandat_bei_kindern()
returns setof text language plpgsql as $f$
declare k record;
begin
  select * into k from tests.fixture_neu((current_date - interval '9 years')::date) limit 1;
  perform tests.act_as(k.auth_id);

  return next throws_ok($q$select public.create_my_sepa_mandate('DE89370400440532013000', null, true)$q$,
    '22023', null, 'Ohne Erziehungsberechtigte kein Mandat fuer ein Kind');
  perform public.onboarding_save_guardian('Papa Kind', 'papa@example.org', null, true);
  return next is(public.my_onboarding() -> 'mandat' ->> 'kontoinhaber_vorschlag', 'Papa Kind',
    'Vorgeschlagen wird der Erziehungsberechtigte');
  return next lives_ok($q$select public.create_my_sepa_mandate('DE89370400440532013000', null, true)$q$,
    'Danach geht es');
  perform set_config('role', 'postgres', true);

  return next is((select accepted_holder from public.sepa_mandates where member_id = k.member_id),
    'Papa Kind', 'Kontoinhaber ist der Elternteil');
end; $f$;

-- ---------------------------------------------------------------------------
-- Abschluss
-- ---------------------------------------------------------------------------
create or replace function tests.test_onboarding_abschluss_erwachsen()
returns setof text language plpgsql as $f$
declare n record;
begin
  select * into n from tests.fixture_neu() limit 1;
  perform tests.act_as(n.auth_id);

  return next throws_ok($q$select public.complete_onboarding()$q$,
    '23514', 'Es fehlt noch: Stammdaten, Satzung, Beitragsordnung und Datenschutz, SEPA-Lastschriftmandat.',
    'Die Meldung nennt jeden fehlenden Schritt');

  perform public.onboarding_save_stammdaten('Neu', 'Person', '1990-05-05', 'female', 'Weg 1', '70372', 'Stuttgart', null, '0170 1');
  perform public.onboarding_accept_documents(array['satzung', 'beitragsordnung', 'datenschutz']);
  return next throws_ok($q$select public.complete_onboarding()$q$,
    '23514', 'Es fehlt noch: SEPA-Lastschriftmandat.', 'Nur noch das Mandat fehlt');

  perform public.create_my_sepa_mandate('DE89370400440532013000', null, true);
  return next lives_ok($q$select public.complete_onboarding()$q$, 'Jetzt geht der Abschluss');
  return next ok(private.is_member(), 'und das Konto ist freigeschaltet');
  return next lives_ok($q$select public.complete_onboarding()$q$, 'Ein zweiter Aufruf schadet nicht');
  return next lives_ok($q$select public.save_my_tennis('LK 12,3', '123456', true)$q$,
    'Die optionalen Schritte gehen danach weiter');
  perform set_config('role', 'postgres', true);

  return next isnt((select onboarding_completed_at from public.members where id = n.member_id), null,
    'onboarding_completed_at ist gesetzt');
  return next ok((private.onboarding_status(n.member_id) ->> 'tennis')::boolean, 'Tennis ist gespeichert');
end; $f$;

create or replace function tests.test_onboarding_abschluss_kind()
returns setof text language plpgsql as $f$
declare k record;
begin
  select * into k from tests.fixture_neu((current_date - interval '14 years')::date) limit 1;
  perform tests.act_as(k.auth_id);

  perform public.onboarding_save_stammdaten('Kind', 'Person', (current_date - interval '14 years')::date,
    'male', 'Weg 1', '70372', 'Stuttgart', '0711 1');
  perform public.onboarding_accept_documents(array['satzung', 'beitragsordnung', 'datenschutz']);
  return next throws_ok($q$select public.complete_onboarding()$q$,
    '23514', 'Es fehlt noch: Erziehungsberechtigte, Notfallkontakt, SEPA-Lastschriftmandat.',
    'Bei Kindern fehlen Erziehungsberechtigte und Notfallkontakt');

  perform public.onboarding_save_guardian('Mama Kind', 'mama.kind@example.org', '0711 2', true);
  perform public.onboarding_save_notfallkontakt('Mama Kind', '0711 2', 'Mutter');
  perform public.create_my_sepa_mandate('DE89370400440532013000', 'Mama Kind', true);
  return next lives_ok($q$select public.complete_onboarding()$q$, 'Danach geht der Abschluss');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_onboarding_passwort_ist_pflicht()
returns setof text language plpgsql as $f$
declare n record;
begin
  select * into n from tests.fixture_neu() limit 1;
  update auth.users set encrypted_password = null where id = n.auth_id;
  return next is((tests.onboarding_fehlt(n.member_id))[1], 'passwort', 'Ohne Passwort fehlt Schritt 1');
end; $f$;

select extensions.plan(1);
select extensions.pass('Tests fuer das Onboarding sind eingespielt');
