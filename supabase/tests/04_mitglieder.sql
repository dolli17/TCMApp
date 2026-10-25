-- ===========================================================================
-- Mitgliederverwaltung: Selbstpflege, Aenderungsprotokoll, Kern-RPCs
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
--
-- Merke fuer alle Tests: nach tests.act_as() besteht kein Zugriff mehr auf das
-- Schema tests. Alle Helferaufrufe muessen deshalb vorher passieren, und am
-- Ende steht immer set_config('role', 'postgres', true).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Selbstpflege: die Erlaubnisliste
-- ---------------------------------------------------------------------------

create or replace function tests.test_mitglied_darf_notfallkontakt_aendern()
returns setof text language plpgsql as $f$
declare a record;
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);

  return next lives_ok(
    format($q$update public.members
             set emergency_contact_name = 'Erika Mustermann',
                 emergency_contact_phone = '0170 1234567',
                 emergency_contact_relation = 'Mutter'
             where id = %L$q$, a.member_id),
    'Mitglied darf seinen Notfallkontakt selbst pflegen');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_mitglied_darf_trainerflag_nicht_setzen()
returns setof text language plpgsql as $f$
declare a record;
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format('update public.members set is_trainer = true where id = %L', a.member_id),
    '42501', null,
    'Niemand macht sich selbst zum Trainer');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_mitglied_darf_lk_nicht_setzen()
returns setof text language plpgsql as $f$
declare a record;
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format($q$update public.members set tennis_lk = 'LK1.0' where id = %L$q$, a.member_id),
    '42501', null,
    'Die Leistungsklasse setzt der Verein, nicht das Mitglied');

  return next throws_ok(
    format($q$update public.members set playing_right = 'own_club' where id = %L$q$, a.member_id),
    '42501', null,
    'Die Spielberechtigung setzt der Verein');

  perform set_config('role', 'postgres', true);
end; $f$;

-- Auch ein Admin kommt an diese Spalten nur ueber eine RPC. Die Policy
-- members_admin_all erlaubt ihm zwar jede Zeile, aber authenticated hat auf
-- public.members ausschliesslich einen Spalten-Grant - und is_trainer steht
-- nicht darin. Das ist kein Versehen, sondern die zweite Schranke: selbst wenn
-- jemand den Wachtrigger umbaut, bleibt die Spalte unerreichbar.
create or replace function tests.test_admin_braucht_rpc_fuer_trainerflag()
returns setof text language plpgsql as $f$
declare a record; b record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format('update public.members set is_trainer = true where id = %L', b.member_id),
    '42501', null,
    'Auch ein Admin setzt das Trainer-Flag nur ueber eine RPC, nicht direkt');

  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Aenderungsprotokoll
-- ---------------------------------------------------------------------------

create or replace function tests.test_aenderungsprotokoll_erfasst_selbstpflege()
returns setof text language plpgsql as $f$
declare a record; v_eintrag record;
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  update public.members set mobile = '0170 9999999' where id = a.member_id;
  perform set_config('role', 'postgres', true);

  select * into v_eintrag
  from public.change_log
  where member_id = a.member_id and table_name = 'members' and action = 'update'
  order by changed_at desc limit 1;

  return next isnt(v_eintrag.id, null, 'Selbstpflege erzeugt einen Protokolleintrag');
  return next is(v_eintrag.changed_by, a.member_id,
    'Das Protokoll haelt fest, wer geaendert hat');
  return next is(v_eintrag.diff -> 'mobile' ->> 'neu', '0170 9999999',
    'Der neue Wert steht im Protokoll');
  return next ok(not (v_eintrag.diff ? 'updated_at'),
    'Der Zeitstempel selbst wird nicht protokolliert');
end; $f$;

create or replace function tests.test_aenderungsprotokoll_erfasst_adminaenderung()
returns setof text language plpgsql as $f$
declare a record; b record; v_eintrag record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);
  -- first_name steht im Spalten-Grant, deshalb kommt der Admin hier auch ohne
  -- RPC durch. Fuer alles ausserhalb des Grants gibt es update_member.
  update public.members set first_name = 'Umbenannt' where id = b.member_id;
  perform set_config('role', 'postgres', true);

  select * into v_eintrag
  from public.change_log
  where member_id = b.member_id and table_name = 'members' and action = 'update'
  order by changed_at desc limit 1;

  return next is(v_eintrag.changed_by, a.member_id,
    'Auch Admin-Aenderungen landen im Protokoll, mit Urheber');
end; $f$;

create or replace function tests.test_moddatetime_erzeugt_keinen_leereintrag()
returns setof text language plpgsql as $f$
declare a record; v_vorher integer; v_nachher integer;
begin
  select * into a from tests.fixture_user() limit 1;

  select count(*) into v_vorher from public.change_log where member_id = a.member_id;
  -- Setzt denselben Wert erneut: moddatetime schreibt updated_at, fachlich
  -- aendert sich nichts.
  update public.members set first_name = first_name where id = a.member_id;
  select count(*) into v_nachher from public.change_log where member_id = a.member_id;

  return next is(v_nachher, v_vorher,
    'Eine Aenderung ohne fachlichen Inhalt erzeugt keinen Protokolleintrag');
end; $f$;

create or replace function tests.test_aenderungsprotokoll_ohne_iban()
returns setof text language plpgsql as $f$
declare a record; v_eintrag record;
begin
  select * into a from tests.fixture_user() limit 1;

  insert into public.bank_accounts (member_id, iban_encrypted, iban_last4, holder)
  values (a.member_id, private.encrypt_iban('DE89370400440532013000'), '3000', 'Test Tester');

  select * into v_eintrag
  from public.change_log
  where member_id = a.member_id and table_name = 'bank_accounts'
  order by changed_at desc limit 1;

  return next isnt(v_eintrag.id, null, 'Eine neue Bankverbindung wird protokolliert');
  return next ok(not (v_eintrag.diff ? 'iban_encrypted'),
    'Der verschluesselte IBAN-Wert steht nicht im Protokoll');
  return next is(v_eintrag.diff -> 'iban_last4' ->> 'neu', '3000',
    'Die letzten vier Stellen genuegen zur Nachvollziehbarkeit');
end; $f$;

create or replace function tests.test_protokoll_ist_fuer_mitglieder_nicht_schreibbar()
returns setof text language plpgsql as $f$
declare a record;
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format($q$insert into public.change_log (table_name, member_id, action, diff)
              values ('members', %L, 'update', '{}'::jsonb)$q$, a.member_id),
    '42501', null,
    'Das Protokoll laesst sich nicht von Hand beschreiben');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_protokoll_fuer_mitglieder_gesperrt()
returns setof text language plpgsql as $f$
declare a record; b record; v_fremd integer; v_eigen integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;

  update public.members set mobile = '0170 1111111' where id = a.member_id;
  update public.members set mobile = '0170 2222222' where id = b.member_id;

  perform tests.act_as(a.auth_id);
  select count(*) into v_fremd from public.change_log where member_id = b.member_id;
  select count(*) into v_eigen from public.change_log where member_id = a.member_id;
  perform set_config('role', 'postgres', true);

  return next is(v_fremd, 0, 'Mitglied A sieht die Protokolleintraege von B nicht');
  -- S29: Auch die eigenen nicht mehr, sonst waeren Notizen ueber das
  -- Protokoll lesbar. Das Protokoll ist fuer volle Rechte.
  return next is(v_eigen, 0, 'Mitglied A sieht auch seine eigenen Eintraege nicht');
end; $f$;

-- ---------------------------------------------------------------------------
-- Startwerte
--
-- Der Seed leert settings ueber den CASCADE von members und baut sie mit
-- ensure_default_settings() wieder auf. Fehlt dort ein Schluessel, ist er nach
-- jedem Reset weg - und booking_settings() reisst den ganzen Belegungsplan
-- mit. Genau das ist passiert, als display_minutes nur per INSERT in seiner
-- Migration stand.
-- ---------------------------------------------------------------------------

create or replace function tests.test_startwerte_ueberleben_das_zuruecksetzen()
returns setof text language plpgsql as $f$
declare v_fehlend text;
begin
  -- Den Seed-Fall nachstellen: alles weg, dann wieder aufbauen.
  delete from public.settings;
  perform public.ensure_default_settings();

  select string_agg(k, ', ') into v_fehlend
  from unnest(array[
    'booking.max_open_bookings', 'booking.lead_days', 'booking.opening_time',
    'booking.closing_time', 'booking.slot_minutes', 'booking.display_minutes',
    'booking.guest_fee_cents', 'notifications.mail_kinds',
    'drinks.min_debit_cents', 'drinks.void_window_minutes',
    'sepa.creditor_id', 'sepa.pain_version', 'sepa.prenotification_days',
    'sepa.creditor_name', 'fees.annual_run_month', 'fees.annual_run_day',
    'work_duty.hourly_rate_cents', 'privacy.change_log_days'
  ]) as k
  where not exists (select 1 from public.settings s where s.key = k);

  return next is(v_fehlend, null,
    'ensure_default_settings kennt alle Schluessel, die die App braucht');

  return next lives_ok(
    $q$select public.setting_int('booking.display_minutes')$q$,
    'Das Anzeigeraster steht nach dem Wiederaufbau bereit');
end; $f$;

-- ---------------------------------------------------------------------------
-- Anlegen und Aendern
-- ---------------------------------------------------------------------------

create or replace function tests.test_mitglied_anlegen_erzeugt_mitgliedschaft_und_rolle()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid; v_nummer text; v_rollen integer;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('max.mustermann@example.org', 'c8fd0a49-76d6-5ff2-ab66-f6ba321f7986');
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Max', 'Mustermann', 'max.mustermann@example.org',
                                '1990-05-17'::date, p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => 'c8fd0a49-76d6-5ff2-ab66-f6ba321f7986');

  perform set_config('role', 'postgres', true);

  select number into v_nummer from public.memberships
   where member_id = v_neu and ended_on is null;
  select count(*)::integer into v_rollen from public.member_roles where member_id = v_neu;

  return next isnt(v_neu, null, 'create_member liefert die Id des neuen Mitglieds');
  return next isnt(v_nummer, null, 'Es entsteht eine laufende Mitgliedschaft mit Nummer');
  return next is(v_rollen, 1, 'Das neue Mitglied hat genau die Rolle Mitglied');
end; $f$;

create or replace function tests.test_mitgliedsnummer_ist_eindeutig()
returns setof text language plpgsql as $f$
declare a record; v_a uuid; v_b uuid; v_na text; v_nb text;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('anna.erste.2@example.org', 'e0ae2cfd-1fa8-50df-a59a-0115bb733054');
  perform tests.fixture_login('bert.zweiter.3@example.org', '38ecdb31-f1cf-574d-b6a3-0fdbe8637349');
  perform tests.act_as(a.auth_id);

  v_a := public.create_member('Anna', 'Erste', 'anna.erste.2@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => 'e0ae2cfd-1fa8-50df-a59a-0115bb733054');
  v_b := public.create_member('Bert', 'Zweiter', 'bert.zweiter.3@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => '38ecdb31-f1cf-574d-b6a3-0fdbe8637349');

  perform set_config('role', 'postgres', true);

  select number into v_na from public.memberships where member_id = v_a;
  select number into v_nb from public.memberships where member_id = v_b;

  return next isnt(v_na, v_nb, 'Zwei Anlagen hintereinander bekommen verschiedene Nummern');
end; $f$;

create or replace function tests.test_mitglied_anlegen_braucht_namen()
returns setof text language plpgsql as $f$
declare a record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    $q$select public.create_member('   ', 'Nachname')$q$,
    '22023', null, 'Ein leerer Vorname wird abgewiesen');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_mitglied_anlegen_nur_admin()
returns setof text language plpgsql as $f$
declare a record;
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    $q$select public.create_member('Max', 'Mustermann')$q$,
    '42501', null, 'Ein normales Mitglied kann niemanden anlegen');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_update_member_lehnt_unbekanntes_feld_ab()
returns setof text language plpgsql as $f$
declare a record; b record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format($q$select public.update_member(%L, '{"auth_user_id":"%s"}'::jsonb)$q$,
           b.member_id, b.auth_id),
    '22023', null, 'Ein Feld ausserhalb der Whitelist wird abgewiesen');

  return next lives_ok(
    format($q$select public.update_member(%L, '{"tennis_lk":"LK14.2","is_trainer":true}'::jsonb)$q$,
           b.member_id),
    'Der Admin setzt Leistungsklasse und Trainer-Flag ueber die RPC');

  perform set_config('role', 'postgres', true);

  return next is((select tennis_lk from public.members where id = b.member_id), 'LK14.2',
    'Die Leistungsklasse steht danach in der Tabelle');
  return next ok((select is_trainer from public.members where id = b.member_id),
    'Das Trainer-Flag ist gesetzt');
end; $f$;

create or replace function tests.test_update_member_leert_bei_leerem_text()
returns setof text language plpgsql as $f$
declare a record; b record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;

  update public.members set tennis_lk = 'LK9.0' where id = b.member_id;
  perform tests.act_as(a.auth_id);
  perform public.update_member(b.member_id, '{"tennis_lk":""}'::jsonb);
  perform set_config('role', 'postgres', true);

  return next is((select tennis_lk from public.members where id = b.member_id), null,
    'Ein leergeraeumtes Feld wird null, nicht ein leerer Text');
end; $f$;

-- ---------------------------------------------------------------------------
-- Rollen
-- ---------------------------------------------------------------------------

create or replace function tests.test_letzter_admin_behaelt_rolle()
returns setof text language plpgsql as $f$
declare a record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  -- Alle anderen Admins entfernen, damit a wirklich der letzte ist.
  delete from public.member_roles where role = 'admin' and member_id <> a.member_id;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format($q$select public.set_member_role(%L, 'admin', false)$q$, a.member_id),
    '23514', null, 'Der letzte Administrator kann die Rolle nicht abgeben');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_vorletzter_admin_darf_abgeben()
returns setof text language plpgsql as $f$
declare a record; b record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user('admin') limit 1;
  perform tests.act_as(a.auth_id);

  return next lives_ok(
    format($q$select public.set_member_role(%L, 'admin', false)$q$, b.member_id),
    'Solange ein zweiter Admin bleibt, laesst sich die Rolle entziehen');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_admin_ohne_login_nicht_moeglich()
returns setof text language plpgsql as $f$
declare a record; v_ohne uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  -- Ohne Login sind nur Archivierte.
  insert into public.members (first_name, last_name, status)
  values ('Ohne', 'Login', 'archived') returning id into v_ohne;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format($q$select public.set_member_role(%L, 'admin', true)$q$, v_ohne),
    '22023', null, 'Ohne Login kann niemand Administrator werden');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_rolle_mitglied_nicht_entziehbar()
returns setof text language plpgsql as $f$
declare a record; b record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format($q$select public.set_member_role(%L, 'member', false)$q$, b.member_id),
    '22023', null, 'Die Grundrolle Mitglied laesst sich nicht entziehen');

  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Keine Zahlerbeziehung mehr: jedes Mitglied zahlt selbst
-- ---------------------------------------------------------------------------

create or replace function tests.test_zahler_zuweisen_gibt_es_nicht_mehr()
returns setof text language plpgsql as $f$
begin
  return next hasnt_function('public', 'set_billing_payer', array['uuid', 'uuid'],
    'set_billing_payer ist entfernt');
  return next hasnt_trigger('public', 'members', 'members_guard_payer_cycle',
    'Der Trigger zur Zahlerkette ist entfernt');
end; $f$;

-- ---------------------------------------------------------------------------
-- Beenden, Archivieren
-- ---------------------------------------------------------------------------

create or replace function tests.test_mitgliedschaft_beenden_und_wieder_aufnehmen()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid; v_nummer text; v_offen integer;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('rita.rueckkehr.4@example.org', 'f963df7d-cfed-5987-a3af-bbd96fd3694b');
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Rita', 'Rueckkehr', 'rita.rueckkehr.4@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => 'f963df7d-cfed-5987-a3af-bbd96fd3694b');
  perform public.end_membership(v_neu, current_date, current_date, 'Umzug');

  perform set_config('role', 'postgres', true);
  select count(*)::integer into v_offen from public.memberships
   where member_id = v_neu and ended_on is null;
  return next is(v_offen, 0, 'Nach dem Austritt gibt es keine laufende Mitgliedschaft');
  return next is((select status::text from public.members where id = v_neu), 'inactive',
    'Das Mitglied steht auf inaktiv');

  perform tests.act_as(a.auth_id);
  v_nummer := public.reactivate_membership(v_neu);
  perform set_config('role', 'postgres', true);

  return next isnt(v_nummer, null, 'Der Wiedereintritt vergibt eine neue Nummer');
  return next is((select status::text from public.members where id = v_neu), 'active',
    'Das Mitglied ist wieder aktiv');
end; $f$;

create or replace function tests.test_zweite_laufende_mitgliedschaft_abgewiesen()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('doppel.mitglied.5@example.org', '82c3b98f-4cdf-5213-94d6-42bb8b9d982e');
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Doppel', 'Mitglied', 'doppel.mitglied.5@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => '82c3b98f-4cdf-5213-94d6-42bb8b9d982e');

  return next throws_ok(
    format('select public.reactivate_membership(%L)', v_neu),
    '23514', null, 'Ein Mitglied kann nicht zweimal gleichzeitig eintreten');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_archivieren_beendet_und_widerruft_mandat()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid; v_konto uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('alfred.archiv.6@example.org', '01c5654f-0bbd-595e-b0c9-25506c90f607');
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Alfred', 'Archiv', 'alfred.archiv.6@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => '01c5654f-0bbd-595e-b0c9-25506c90f607');
  perform set_config('role', 'postgres', true);

  insert into public.bank_accounts (member_id, iban_encrypted, iban_last4, holder)
  values (v_neu, private.encrypt_iban('DE89370400440532013000'), '3000', 'Alfred Archiv')
  returning id into v_konto;
  insert into public.sepa_mandates (member_id, bank_account_id, reference, signed_on)
  values (v_neu, v_konto, 'TCM-TEST-ARCHIV', current_date);

  perform tests.act_as(a.auth_id);
  perform public.archive_member(v_neu);
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.members where id = v_neu), 'archived',
    'Das Mitglied ist archiviert');
  return next is((select status::text from public.sepa_mandates where member_id = v_neu),
    'revoked', 'Das Mandat ist widerrufen');
  return next ok(not (select active from public.bank_accounts where id = v_konto),
    'Die Bankverbindung ist stillgelegt');
  return next is((select count(*)::integer from public.memberships
                   where member_id = v_neu and ended_on is null), 0,
    'Die Mitgliedschaft ist beendet');
end; $f$;

create or replace function tests.test_archivieren_laesst_forderungen_stehen()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid; v_vorher integer; v_nachher integer;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('sonja.schuldig.7@example.org', 'acef2163-e200-51d7-80b0-57ea0000aa49');
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Sonja', 'Schuldig', 'sonja.schuldig.7@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => 'acef2163-e200-51d7-80b0-57ea0000aa49');
  perform set_config('role', 'postgres', true);

  insert into public.charges (member_id, payer_id, kind, period_label, amount_cents, description)
  values (v_neu, v_neu, 'fee', '2026', 19000, 'Jahresbeitrag 2026');
  select count(*)::integer into v_vorher from public.charges where member_id = v_neu;

  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format('select * from public.archive_member(%L)', v_neu),
    '23514', null, 'Ohne Bestaetigung bricht das Archivieren bei offenen Forderungen ab');

  perform public.archive_member(v_neu, true);
  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_nachher from public.charges where member_id = v_neu;
  return next is(v_nachher, v_vorher, 'Die Forderung besteht nach dem Archivieren weiter');
end; $f$;

create or replace function tests.test_admin_kann_sich_nicht_selbst_archivieren()
returns setof text language plpgsql as $f$
declare a record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format('select * from public.archive_member(%L)', a.member_id),
    '23514', null, 'Ein Admin archiviert sich nicht selbst');

  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Loeschen und Anonymisieren
-- ---------------------------------------------------------------------------

create or replace function tests.test_loeschen_ohne_historie_funktioniert()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid; v_da integer;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('tipp.fehler.9@example.org', '18552c14-4084-5650-9232-4aa477c63344');
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Tipp', 'Fehler', 'tipp.fehler.9@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => '18552c14-4084-5650-9232-4aa477c63344');
  perform public.delete_member(v_neu, 'Fehler');
  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_da from public.members where id = v_neu;
  return next is(v_da, 0, 'Ein Datensatz ohne Historie laesst sich wirklich loeschen');
  return next is((select count(*)::integer from public.memberships where member_id = v_neu), 0,
    'Die Mitgliedschaft verschwindet mit');
  return next is((select count(*)::integer from public.member_roles where member_id = v_neu), 0,
    'Die Rollen verschwinden mit');
end; $f$;

create or replace function tests.test_loeschen_braucht_richtigen_nachnamen()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('vor.sicht.10@example.org', '87728f59-5e07-53b2-b0c3-07330ee1ad3c');
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Vor', 'Sicht', 'vor.sicht.10@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => '87728f59-5e07-53b2-b0c3-07330ee1ad3c');

  return next throws_ok(
    format($q$select public.delete_member(%L, 'Falsch')$q$, v_neu),
    '22023', null, 'Ohne den richtigen Nachnamen passiert nichts');

  perform set_config('role', 'postgres', true);
  return next is((select count(*)::integer from public.members where id = v_neu), 1,
    'Das Mitglied existiert nach dem Fehlversuch noch');
end; $f$;

create or replace function tests.test_loeschen_mit_forderung_wird_abgewiesen()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('bleibt.bestehen.11@example.org', 'cdae48a0-f7c0-5e5b-90b1-752b7b486a66');
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Bleibt', 'Bestehen', 'bleibt.bestehen.11@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => 'cdae48a0-f7c0-5e5b-90b1-752b7b486a66');
  perform set_config('role', 'postgres', true);

  insert into public.charges (member_id, payer_id, kind, period_label, amount_cents, description)
  values (v_neu, v_neu, 'fee', '2026', 19000, 'Jahresbeitrag 2026');

  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format($q$select public.delete_member(%L, 'Bestehen')$q$, v_neu),
    '23514', null, 'Mit Forderungen im Bestand wird nicht geloescht');
  perform set_config('role', 'postgres', true);

  return next is((select count(*)::integer from public.members where id = v_neu), 1,
    'Das Mitglied ist noch da');
  return next is((select count(*)::integer from public.charges where member_id = v_neu), 1,
    'Die Forderung ist unangetastet');
end; $f$;

create or replace function tests.test_admin_kann_sich_nicht_selbst_loeschen()
returns setof text language plpgsql as $f$
declare a record; v_name text;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select last_name into v_name from public.members where id = a.member_id;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format($q$select public.delete_member(%L, %L)$q$, a.member_id, v_name),
    '23514', null, 'Ein Admin loescht sich nicht selbst');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_loeschen_hinterlaesst_protokolleintrag()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid; v_eintrag record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('spur.nachweis.12@example.org', '78881895-1ed4-5887-ab14-19bf83976dff');
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Spur', 'Nachweis', 'spur.nachweis.12@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => '78881895-1ed4-5887-ab14-19bf83976dff');
  perform public.delete_member(v_neu, 'Nachweis');
  perform set_config('role', 'postgres', true);

  select * into v_eintrag from public.change_log
   where table_name = 'members' and action = 'delete' and row_id = v_neu
   order by changed_at desc limit 1;

  return next isnt(v_eintrag.id, null, 'Das Loeschen steht im Protokoll');
  return next is(v_eintrag.diff ->> '_aktion', 'geloescht', 'Der Eintrag ist als Loeschung erkennbar');
  return next is(v_eintrag.diff -> 'last_name' ->> 'alt', 'Nachweis',
    'Der Name bleibt als Kennfeld erhalten');
  return next ok(not (v_eintrag.diff ? 'birthday'),
    'Der uebrige Datensatz wird nicht ins Protokoll gerettet');
end; $f$;

create or replace function tests.test_anonymisieren_behaelt_forderung()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid; v_m public.members;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('klara@example.org', '303f7a96-e34e-575c-bf29-e03aecf409eb');
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Klara', 'Klarname', 'klara@example.org', '1980-01-01'::date, p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => '303f7a96-e34e-575c-bf29-e03aecf409eb');
  perform set_config('role', 'postgres', true);

  insert into public.charges (member_id, payer_id, kind, period_label, amount_cents, description)
  values (v_neu, v_neu, 'fee', '2026', 19000, 'Jahresbeitrag 2026');
  insert into public.bank_accounts (member_id, iban_encrypted, iban_last4, holder)
  values (v_neu, private.encrypt_iban('DE89370400440532013000'), '3000', 'Klara Klarname');

  perform tests.act_as(a.auth_id);
  perform public.anonymize_member(v_neu, 'Auskunftsersuchen');
  perform set_config('role', 'postgres', true);

  select * into v_m from public.members where id = v_neu;

  return next is(v_m.first_name, 'Gelöscht', 'Der Vorname ist ersetzt');
  return next is(v_m.email, null, 'Die E-Mail ist entfernt');
  return next is(v_m.birthday, null, 'Das Geburtsdatum ist entfernt');
  return next is(v_m.status::text, 'archived', 'Das Mitglied ist archiviert');
  return next is((select count(*)::integer from public.bank_accounts where member_id = v_neu), 0,
    'Die Bankverbindung ist geloescht');
  return next is((select count(*)::integer from public.charges where member_id = v_neu), 1,
    'Die Forderung bleibt fuer die Buchhaltung erhalten');
end; $f$;

-- ---------------------------------------------------------------------------
-- Berechtigungen: nichts davon darf ein normales Mitglied
-- ---------------------------------------------------------------------------

create or replace function tests.test_kern_rpcs_nur_fuer_admins()
returns setof text language plpgsql as $f$
declare a record; b record;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format($q$select public.update_member(%L, '{"city":"Woanders"}'::jsonb)$q$, b.member_id),
    '42501', null, 'update_member ist Admins vorbehalten');
  return next throws_ok(
    format($q$select public.set_member_role(%L, 'admin', true)$q$, a.member_id),
    '42501', null, 'set_member_role ist Admins vorbehalten');
  return next throws_ok(
    format($q$select * from public.archive_member(%L)$q$, b.member_id),
    '42501', null, 'archive_member ist Admins vorbehalten');
  return next throws_ok(
    format($q$select public.delete_member(%L, 'egal')$q$, b.member_id),
    '42501', null, 'delete_member ist Admins vorbehalten');
  return next throws_ok(
    format($q$select public.anonymize_member(%L)$q$, b.member_id),
    '42501', null, 'anonymize_member ist Admins vorbehalten');
  return next throws_ok(
    format($q$select * from public.member_delete_impact(%L)$q$, b.member_id),
    '42501', null, 'Selbst die Vorschau ist Admins vorbehalten');

  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Merkmale
-- ---------------------------------------------------------------------------

/** Legt ein Merkmal an und gibt seinen Schluessel zurueck. */
create or replace function tests.fixture_merkmal(
  p_code text, p_kind public.attribute_kind default 'list',
  p_self boolean default false, p_multiple boolean default false)
returns text language plpgsql as $f$
begin
  insert into public.member_attribute_types
    (code, name, description, value_kind, self_editable, multiple)
  values (p_code, 'Test ' || p_code, 'Nur fuer Tests.', p_kind, p_self, p_multiple)
  on conflict (code) do update set
    value_kind = excluded.value_kind,
    self_editable = excluded.self_editable,
    multiple = excluded.multiple;

  if p_kind = 'list' then
    insert into public.member_attribute_options (attribute_type_id, value, label)
    select t.id, v.value, v.value
    from public.member_attribute_types t,
         (values ('rot'), ('blau')) as v(value)
    where t.code = p_code
    on conflict do nothing;
  end if;

  return p_code;
end; $f$;

create or replace function tests.test_admin_kann_merkmal_setzen()
returns setof text language plpgsql as $f$
declare a record; b record; v_code text;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  v_code := tests.fixture_merkmal('t_farbe');
  perform tests.act_as(a.auth_id);

  perform public.set_member_attribute(b.member_id, 't_farbe', 'rot');
  perform set_config('role', 'postgres', true);

  return next is(
    (select o.value from public.member_attribute_values v
      join public.member_attribute_options o on o.id = v.option_id
     where v.member_id = b.member_id),
    'rot', 'Der Admin setzt einen Wert aus der Liste');
end; $f$;

create or replace function tests.test_merkmal_ungueltiger_wert_wird_abgewiesen()
returns setof text language plpgsql as $f$
declare a record; b record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.fixture_merkmal('t_farbe2');
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format($q$select public.set_member_attribute(%L, 't_farbe2', 'gruen')$q$, b.member_id),
    '22023', null, 'Ein Wert ausserhalb der Liste wird abgewiesen');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_mitglied_kann_fremdes_merkmal_nicht_setzen()
returns setof text language plpgsql as $f$
declare a record; b record;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.fixture_merkmal('t_intern');
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format($q$select public.set_member_attribute(%L, 't_intern', 'rot')$q$, b.member_id),
    '42501', null, 'Ein Mitglied setzt keine Merkmale bei anderen');

  return next throws_ok(
    format($q$select public.set_member_attribute(%L, 't_intern', 'rot')$q$, a.member_id),
    '42501', null, 'Und auch bei sich selbst nicht, solange das Merkmal intern ist');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_mitglied_darf_einwilligung_selbst_setzen()
returns setof text language plpgsql as $f$
declare a record; v_da integer;
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.fixture_merkmal('t_foto', 'boolean', true);
  perform tests.act_as(a.auth_id);

  return next lives_ok(
    format($q$select public.set_member_attribute(%L, 't_foto')$q$, a.member_id),
    'Eine Einwilligung setzt das Mitglied selbst');

  return next lives_ok(
    format($q$select public.remove_member_attribute(%L, 't_foto')$q$, a.member_id),
    'Und widerruft sie auch selbst');

  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_da from public.member_attribute_values
   where member_id = a.member_id;
  return next is(v_da, 0, 'Nach dem Widerruf ist die Zeile weg');
end; $f$;

-- Jeder zahlt selbst: ein Elternteil hat keinen Zugriff mehr auf das Kind.
-- Das Kind setzt die Einwilligung ueber seinen eigenen Login.
create or replace function tests.test_eltern_duerfen_merkmal_fuers_kind_nicht_setzen()
returns setof text language plpgsql as $f$
declare eltern record; kind uuid;
begin
  select * into eltern from tests.fixture_user() limit 1;
  kind := tests.fixture_member('Kind');
  perform tests.fixture_merkmal('t_foto2', 'boolean', true);
  perform tests.act_as(eltern.auth_id);

  return next throws_ok(
    format($q$select public.set_member_attribute(%L, 't_foto2')$q$, kind),
    '42501', null, 'Ein Elternteil setzt kein Merkmal fuer das Kind');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_merkmal_mit_multiple_false_ersetzt_wert()
returns setof text language plpgsql as $f$
declare a record; b record; v_anzahl integer; v_wert text;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.fixture_merkmal('t_einzeln', 'list', false, false);
  perform tests.act_as(a.auth_id);

  perform public.set_member_attribute(b.member_id, 't_einzeln', 'rot');
  perform public.set_member_attribute(b.member_id, 't_einzeln', 'blau');
  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_anzahl from public.member_attribute_values
   where member_id = b.member_id;
  select o.value into v_wert from public.member_attribute_values v
    join public.member_attribute_options o on o.id = v.option_id
   where v.member_id = b.member_id;

  return next is(v_anzahl, 1, 'Ohne Mehrfachauswahl bleibt genau ein Wert');
  return next is(v_wert, 'blau', 'Und zwar der zuletzt gesetzte');
end; $f$;

create or replace function tests.test_merkmal_mit_multiple_haelt_beide()
returns setof text language plpgsql as $f$
declare a record; b record; v_anzahl integer;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.fixture_merkmal('t_mehrfach', 'list', false, true);
  perform tests.act_as(a.auth_id);

  perform public.set_member_attribute(b.member_id, 't_mehrfach', 'rot');
  perform public.set_member_attribute(b.member_id, 't_mehrfach', 'blau');
  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_anzahl from public.member_attribute_values
   where member_id = b.member_id;
  return next is(v_anzahl, 2, 'Mit Mehrfachauswahl bleiben beide Werte stehen');
end; $f$;

create or replace function tests.test_benutzte_option_wird_deaktiviert_nicht_geloescht()
returns setof text language plpgsql as $f$
declare a record; b record; v_typ uuid; v_aktiv boolean; v_da integer;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.fixture_merkmal('t_bestand');
  select id into v_typ from public.member_attribute_types where code = 't_bestand';
  perform tests.act_as(a.auth_id);

  perform public.set_member_attribute(b.member_id, 't_bestand', 'rot');
  -- Neue Liste ohne "rot"
  perform public.set_member_attribute_options(v_typ, '[{"value":"blau","label":"Blau"}]'::jsonb);
  perform set_config('role', 'postgres', true);

  select o.active into v_aktiv from public.member_attribute_options o
   where o.attribute_type_id = v_typ and o.value = 'rot';
  select count(*)::integer into v_da from public.member_attribute_values
   where member_id = b.member_id;

  return next is(v_aktiv, false, 'Eine benutzte Option wird stillgelegt statt geloescht');
  return next is(v_da, 1, 'Der Wert des Mitglieds bleibt erhalten');
end; $f$;

create or replace function tests.test_merkmalsart_nicht_aenderbar_wenn_benutzt()
returns setof text language plpgsql as $f$
declare a record; b record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.fixture_merkmal('t_fest');
  perform tests.act_as(a.auth_id);
  perform public.set_member_attribute(b.member_id, 't_fest', 'rot');

  return next throws_ok(
    $q$select public.upsert_member_attribute_type('t_fest', 'Test', 'Beschreibung', 'date')$q$,
    '23514', null, 'Die Art eines benutzten Merkmals bleibt, wie sie ist');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_merkmal_braucht_beschreibung()
returns setof text language plpgsql as $f$
declare a record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    $q$select public.upsert_member_attribute_type('t_ohne', 'Ohne Beschreibung', '  ')$q$,
    '22023', null, 'Wer ein Merkmal anlegt, muss den Zweck benennen');

  return next throws_ok(
    $q$select public.upsert_member_attribute_type('Gross Falsch', 'Name', 'Zweck')$q$,
    '22023', null, 'Der Schluessel folgt einer festen Form');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_merkmale_nur_fuer_admins_pflegbar()
returns setof text language plpgsql as $f$
declare a record;
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    $q$select public.upsert_member_attribute_type('t_verboten', 'Name', 'Zweck')$q$,
    '42501', null, 'Merkmale definiert nur der Vorstand');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_anonymisieren_loescht_merkmale()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid; v_da integer;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_merkmal('t_anon', 'boolean', false);
  perform tests.fixture_login('merkmal.traeger.14@example.org', 'd4dd3a26-4b85-5f03-b58e-417598495eec');
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Merkmal', 'Traeger', 'merkmal.traeger.14@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => 'd4dd3a26-4b85-5f03-b58e-417598495eec');
  perform public.set_member_attribute(v_neu, 't_anon');
  perform public.anonymize_member(v_neu, 'Test');
  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_da from public.member_attribute_values
   where member_id = v_neu;
  return next is(v_da, 0, 'Beim Anonymisieren verschwinden auch die Merkmale');
end; $f$;

-- ---------------------------------------------------------------------------
-- Bankverbindung und SEPA-Mandat
--
-- Eine formal gueltige IBAN mit korrekter Pruefziffer, die zu keinem realen
-- Konto gehoert - dieselbe, die auch der Seed benutzt.
-- ---------------------------------------------------------------------------

create or replace function tests.test_bankverbindung_anlegen()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid; v_konto uuid; v_k public.bank_accounts;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('konto.inhaber.15@example.org', 'd2b4d5cf-6fc0-5ce8-884d-6100eb32005f');
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Konto', 'Inhaber', 'konto.inhaber.15@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => 'd2b4d5cf-6fc0-5ce8-884d-6100eb32005f');
  v_konto := public.add_bank_account(v_neu, 'DE89 3704 0044 0532 0130 00');
  perform set_config('role', 'postgres', true);

  select * into v_k from public.bank_accounts where id = v_konto;

  return next is(v_k.iban_last4, '3000', 'Die letzten vier Stellen werden gespeichert');
  return next is(v_k.holder, 'Konto Inhaber', 'Ohne Angabe wird der Mitgliedsname eingesetzt');
  return next isnt(v_k.iban_encrypted, null, 'Die IBAN liegt verschluesselt vor');
  return next isnt(v_k.iban_fingerprint, null, 'Der Fingerabdruck ist gesetzt');
  return next is(private.decrypt_iban(v_k.iban_encrypted), 'DE89370400440532013000',
    'Entschluesselt kommt die IBAN ohne Leerzeichen zurueck');
end; $f$;

create or replace function tests.test_ungueltige_iban_wird_abgewiesen()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('falsche.ziffern.16@example.org', '032cd240-41bd-5fb4-bea2-98f9cdde62b8');
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Falsche', 'Ziffern', 'falsche.ziffern.16@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => '032cd240-41bd-5fb4-bea2-98f9cdde62b8');

  return next throws_ok(
    format($q$select public.add_bank_account(%L, 'DE89370400440532013001')$q$, v_neu),
    '22023', null, 'Eine IBAN mit falscher Pruefziffer wird abgewiesen');

  return next throws_ok(
    format($q$select public.add_bank_account(%L, 'Unsinn')$q$, v_neu),
    '22023', null, 'Und Unsinn erst recht');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_gleiche_iban_zweimal_wird_erkannt()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('doppelt.erfasst.17@example.org', 'e0f6ec51-42d6-5769-ad53-93c910035419');
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Doppelt', 'Erfasst', 'doppelt.erfasst.17@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => 'e0f6ec51-42d6-5769-ad53-93c910035419');
  perform public.add_bank_account(v_neu, 'DE89370400440532013000');

  -- Der Chiffretext ist jedes Mal ein anderer; ohne Fingerabdruck fiele die
  -- Dublette nicht auf.
  return next throws_ok(
    format($q$select public.add_bank_account(%L, 'DE89 3704 0044 0532 0130 00')$q$, v_neu),
    '23505', null, 'Dieselbe IBAN wird beim zweiten Mal erkannt');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_familienkonto_bei_zwei_mitgliedern_erlaubt()
returns setof text language plpgsql as $f$
declare a record; v_eins uuid; v_zwei uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('familie.eins.18@example.org', 'd759fa45-1188-59a9-b28f-944a1bc7cecb');
  perform tests.fixture_login('familie.zwei.19@example.org', '23224ea4-00ab-550b-b94c-e3a239b2e986');
  perform tests.act_as(a.auth_id);
  v_eins := public.create_member('Familie', 'Eins', 'familie.eins.18@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => 'd759fa45-1188-59a9-b28f-944a1bc7cecb');
  v_zwei := public.create_member('Familie', 'Zwei', 'familie.zwei.19@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => '23224ea4-00ab-550b-b94c-e3a239b2e986');
  perform public.add_bank_account(v_eins, 'DE89370400440532013000');

  return next lives_ok(
    format($q$select public.add_bank_account(%L, 'DE89370400440532013000')$q$, v_zwei),
    'Dasselbe Konto darf bei einem zweiten Mitglied stehen - Familien teilen es sich');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_mandat_erteilen_und_widerrufen()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid; v_konto uuid; v_ref text; v_m public.sepa_mandates;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('mandat.traeger.20@example.org', '370118ee-b070-5159-9d1a-995ef470ca40');
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Mandat', 'Traeger', 'mandat.traeger.20@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => '370118ee-b070-5159-9d1a-995ef470ca40');
  v_konto := public.add_bank_account(v_neu, 'DE89370400440532013000');
  v_ref := public.create_sepa_mandate(v_neu, v_konto);
  perform set_config('role', 'postgres', true);

  select * into v_m from public.sepa_mandates where member_id = v_neu;

  return next matches(v_ref, '^TCM-', 'Die Referenz folgt der Vereinsform');
  return next is(v_m.status::text, 'active', 'Das Mandat ist aktiv');
  return next is(v_m.sequence_type::text, 'FRST', 'Der erste Einzug ist eine Erstlastschrift');

  perform tests.act_as(a.auth_id);
  perform public.revoke_sepa_mandate(v_m.id);
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.sepa_mandates where id = v_m.id),
    'revoked', 'Nach dem Widerruf ist es widerrufen');
  return next isnt((select revoked_on from public.sepa_mandates where id = v_m.id), null,
    'Und das Datum steht fest');
end; $f$;

create or replace function tests.test_zweites_aktives_mandat_wird_abgewiesen()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid; v_konto uuid; v_erstes uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('zwei.mandate.21@example.org', '0f8b66a3-d84a-5d75-803b-20da27455a55');
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Zwei', 'Mandate', 'zwei.mandate.21@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => '0f8b66a3-d84a-5d75-803b-20da27455a55');
  v_konto := public.add_bank_account(v_neu, 'DE89370400440532013000');
  perform public.create_sepa_mandate(v_neu, v_konto);

  return next throws_ok(
    format('select public.create_sepa_mandate(%L, %L)', v_neu, v_konto),
    '23514', null, 'Ein Mitglied hat hoechstens ein aktives Mandat');

  -- Nach dem Widerruf geht ein neues.
  select id into v_erstes from public.sepa_mandates
   where member_id = v_neu and status = 'active';
  perform public.revoke_sepa_mandate(v_erstes);
  return next lives_ok(
    format('select public.create_sepa_mandate(%L, %L)', v_neu, v_konto),
    'Nach dem Widerruf laesst sich ein neues Mandat erteilen');

  perform set_config('role', 'postgres', true);
end; $f$;

/** Der Index haelt auch Schreibwege an create_sepa_mandate vorbei auf. */
create or replace function tests.test_zweites_aktives_mandat_per_insert_abgewiesen()
returns setof text language plpgsql as $f$
declare u record; v_konto uuid; v_ref text;
begin
  select * into u from tests.fixture_user() limit 1;
  v_ref := tests.fixture_mandat(u.member_id);
  select bank_account_id into v_konto from public.sepa_mandates where reference = v_ref;

  return next throws_ok(
    format($q$insert into public.sepa_mandates
                (member_id, bank_account_id, reference, signed_on, sequence_type, status)
              values (%L, %L, 'ZZTEST-ZWEI', current_date, 'FRST', 'active')$q$,
           u.member_id, v_konto),
    '23505', null, 'Ein zweites aktives Mandat scheitert am Index');
end; $f$;

create or replace function tests.test_mandat_fuer_fremdes_konto_abgewiesen()
returns setof text language plpgsql as $f$
declare a record; v_eins uuid; v_zwei uuid; v_konto uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('konto.besitzer.22@example.org', '4d9ca82e-6cda-5a4e-9055-6a9f319d9fba');
  perform tests.fixture_login('fremder.dritter.23@example.org', 'c277449a-2964-5916-8bbc-78446254862a');
  perform tests.act_as(a.auth_id);

  v_eins := public.create_member('Konto', 'Besitzer', 'konto.besitzer.22@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => '4d9ca82e-6cda-5a4e-9055-6a9f319d9fba');
  v_zwei := public.create_member('Fremder', 'Dritter', 'fremder.dritter.23@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => 'c277449a-2964-5916-8bbc-78446254862a');
  v_konto := public.add_bank_account(v_eins, 'DE89370400440532013000');

  return next throws_ok(
    format('select public.create_sepa_mandate(%L, %L)', v_zwei, v_konto),
    '22023', null, 'Ein Mandat braucht ein Konto, das dem Mitglied gehoert');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_konto_mit_aktivem_mandat_nicht_stilllegbar()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid; v_konto uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('stilllegen.versuch.24@example.org', '7cc3eb30-b0ea-524c-99fa-2a49fff85aa0');
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Stilllegen', 'Versuch', 'stilllegen.versuch.24@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => '7cc3eb30-b0ea-524c-99fa-2a49fff85aa0');
  v_konto := public.add_bank_account(v_neu, 'DE89370400440532013000');
  perform public.create_sepa_mandate(v_neu, v_konto);

  return next throws_ok(
    format('select public.deactivate_bank_account(%L)', v_konto),
    '23514', null, 'Solange ein Mandat aktiv ist, bleibt das Konto bestehen');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_bank_rpcs_nur_fuer_admins()
returns setof text language plpgsql as $f$
declare admin record; a record; b record; v_fremd integer;
begin
  select * into admin from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;

  -- B bekommt eine Bankverbindung, damit es ueberhaupt etwas zu sehen gaebe.
  perform tests.act_as(admin.auth_id);
  perform public.add_bank_account(b.member_id, 'DE89370400440532013000');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format($q$select public.add_bank_account(%L, 'DE89370400440532013000')$q$, a.member_id),
    '42501', null, 'Ein Mitglied traegt seine Bankverbindung nicht selbst ein');

  -- member_finances wirft nicht, sondern liefert nichts: die Sichtbarkeit
  -- steckt als Bedingung in der Abfrage. Fuer den Aufrufer ist das Ergebnis
  -- dasselbe - er sieht die fremden Daten nicht.
  select count(*)::integer into v_fremd from public.member_finances(b.member_id);
  return next is(v_fremd, 0, 'Fremde Finanzdaten bleiben unsichtbar');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_mitglied_sieht_eigene_finanzen()
returns setof text language plpgsql as $f$
declare admin record; a record; v_zeilen integer;
begin
  select * into admin from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;

  perform tests.act_as(admin.auth_id);
  perform public.add_bank_account(a.member_id, 'DE89370400440532013000');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(a.auth_id);
  select count(*)::integer into v_zeilen from public.member_finances(a.member_id);
  perform set_config('role', 'postgres', true);

  return next is(v_zeilen, 1, 'Die eigene Bankverbindung darf man sehen');
end; $f$;

-- ---------------------------------------------------------------------------
-- Beitragsarten
-- ---------------------------------------------------------------------------

create or replace function tests.test_beitragsart_zuordnen_mit_preis()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid; v_typ uuid; v_zeile record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select id into v_typ from public.fee_types where code = 'erwachsener';
  perform tests.fixture_login('beitrag.zahler.25@example.org', 'dd662798-87a5-591b-9b28-9cbdeec7e4b0');
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Beitrag', 'Zahler', 'beitrag.zahler.25@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => 'dd662798-87a5-591b-9b28-9cbdeec7e4b0');
  perform public.set_member_fee(v_neu, v_typ, 2026);

  select * into v_zeile from public.member_fee_overview(v_neu, 2026)
   where code = 'erwachsener';
  perform set_config('role', 'postgres', true);

  return next ok(v_zeile.zugeordnet, 'Die Beitragsart ist zugeordnet');
  return next is(v_zeile.effektiv_cents, v_zeile.preis_cents,
    'Ohne Sonderbetrag gilt der Preis der Beitragsart');
end; $f$;

create or replace function tests.test_sonderbetrag_ueberschreibt_preis()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid; v_typ uuid; v_zeile record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select id into v_typ from public.fee_types where code = 'erwachsener';
  perform tests.fixture_login('ehren.mitglied.26@example.org', '1f694517-2560-5430-b678-1f6e3e78c150');
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Ehren', 'Mitglied', 'ehren.mitglied.26@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => '1f694517-2560-5430-b678-1f6e3e78c150');
  perform public.set_member_fee(v_neu, v_typ, 2026, 0, 'Ehrenmitglied');

  select * into v_zeile from public.member_fee_overview(v_neu, 2026)
   where code = 'erwachsener';
  perform set_config('role', 'postgres', true);

  return next is(v_zeile.effektiv_cents, 0, 'Der Sonderbetrag setzt den Preis ausser Kraft');
  return next is(v_zeile.note, 'Ehrenmitglied', 'Die Begruendung steht dabei');
end; $f$;

create or replace function tests.test_beitragsart_entfernen()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid; v_typ uuid; v_zeile record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select id into v_typ from public.fee_types where code = 'jugend';
  perform tests.fixture_login('weg.damit.27@example.org', 'ca41526c-b1a3-54bc-bb46-90025c89dd4a');
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Weg', 'Damit', 'weg.damit.27@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => 'ca41526c-b1a3-54bc-bb46-90025c89dd4a');
  perform public.set_member_fee(v_neu, v_typ, 2026);
  perform public.remove_member_fee(v_neu, v_typ, 2026);

  select * into v_zeile from public.member_fee_overview(v_neu, 2026) where code = 'jugend';
  perform set_config('role', 'postgres', true);

  return next ok(not v_zeile.zugeordnet, 'Nach dem Entfernen ist sie nicht mehr zugeordnet');
end; $f$;

-- ---------------------------------------------------------------------------
-- Zugaenge
--
-- Die Edge Function ruft diese Funktionen ohne angemeldeten Nutzer auf - sie
-- arbeitet mit dem Service-Schluessel. Genau dieser Pfad wird hier
-- mitgeprueft: als Eigentuemer ist auth.uid() ebenfalls null.
-- ---------------------------------------------------------------------------

create or replace function tests.test_zugang_verbinden()
returns setof text language plpgsql as $f$
declare v_arch uuid; v_auth uuid := tests.fixture_login('zugang.traeger@example.org');
begin
  -- Ohne Login sind nur Archivierte; verknuepfen laesst sich trotzdem.
  insert into public.members (first_name, last_name, status)
  values ('Zugang', 'Traeger', 'archived') returning id into v_arch;

  -- So ruft die Edge Function auf: ohne angemeldeten Nutzer.
  perform public.link_auth_user(v_arch, v_auth);

  return next is((select auth_user_id from public.members where id = v_arch), v_auth,
    'Der Zugang ist mit dem Mitglied verbunden');
  return next isnt((select invited_at from public.members where id = v_arch), null,
    'Der Zeitpunkt der Einladung steht fest');
end; $f$;

create or replace function tests.test_zugang_nicht_zweimal_vergeben()
returns setof text language plpgsql as $f$
declare v_eins uuid := tests.fixture_member('Erster'); v_zwei uuid; v_auth uuid;
begin
  insert into public.members (first_name, last_name, status)
  values ('Zweiter', 'Nutzer', 'archived') returning id into v_zwei;
  select auth_user_id into v_auth from public.members where id = v_eins;

  return next throws_ok(
    format('select public.link_auth_user(%L, %L)', v_zwei, v_auth),
    '23514', null, 'Ein Zugang gehoert immer genau einer Person');
  return next throws_ok(
    format('select public.link_auth_user(%L, %L)', v_eins, tests.fixture_login()),
    '23514', null, 'Und ein Mitglied hat genau einen Zugang');
end; $f$;

create or replace function tests.test_zugang_nicht_selbst_sperren()
returns setof text language plpgsql as $f$
declare admin record;
begin
  select * into admin from tests.fixture_user('admin') limit 1;
  perform tests.act_as(admin.auth_id);

  return next throws_ok(
    format('select public.set_login_disabled(%L, true)', admin.member_id),
    '23514', null, 'Niemand sperrt sich selbst aus');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_login_verwaltung_nur_fuer_admins()
returns setof text language plpgsql as $f$
declare a record; b record;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);

  return next throws_ok(
    format('select public.link_auth_user(%L, %L)', b.member_id, a.auth_id),
    '42501', null, 'Ein Mitglied verbindet keine Zugaenge');
  return next throws_ok(
    format('select public.set_login_disabled(%L, true)', b.member_id),
    '42501', null, 'Und sperrt niemanden aus');
  return next throws_ok(
    format('select * from public.member_for_login_admin(%L)', b.member_id),
    '42501', null, 'Selbst die Auskunft bleibt dem Vorstand vorbehalten');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_login_state_erklaert_warum_nicht()
returns setof text language plpgsql as $f$
declare admin record; v_ohne uuid; v_zeile record;
begin
  select * into admin from tests.fixture_user('admin') limit 1;
  insert into public.members (first_name, last_name, status)
  values ('Ohne', 'Login', 'archived') returning id into v_ohne;
  perform tests.act_as(admin.auth_id);

  select * into v_zeile from public.member_login_state(v_ohne);
  perform set_config('role', 'postgres', true);

  return next ok(not v_zeile.hat_zugang, 'Ohne Login sind nur Archivierte');
  return next is(v_zeile.grund, 'Archivierte Mitglieder bekommen keinen Zugang.',
    'Und die Oberflaeche bekommt den Grund gleich mitgeliefert');
end; $f$;

-- ---------------------------------------------------------------------------
-- Mitgliedsantrag
--
-- Der einzige Weg von aussen in die Datenbank. Diese Tests pruefen vor allem,
-- was er NICHT preisgibt.
-- ---------------------------------------------------------------------------

/** Ein Antragsdatensatz mit den Pflichtfeldern. */
create or replace function tests.antrag_daten(p_email text, p_name text default 'Neu')
returns jsonb language sql immutable as $f$
  select jsonb_build_object(
    'first_name', p_name, 'last_name', 'Interessent',
    'email', p_email, 'birthday', '1990-06-15',
    'gender', 'female', 'street', 'Teststr. 1', 'postcode', '70372', 'city', 'Stuttgart',
    'mobile', '0170 1234567');
$f$;

/**
 * Ein Antrag, wie ihn die Edge Function mitgliedsantrag stellt, gleich
 * bestaetigt - so, als haette der Absender den Link aus der Mail geklickt
 * (S22). Gibt die Id zurueck.
 */
create or replace function tests.antrag_stellen(p_data jsonb, p_ip text default null)
returns uuid language plpgsql as $f$
declare v record;
begin
  select * into v from public.begin_membership_application(p_data, p_ip);
  if v.token is not null then
    perform public.confirm_membership_application(v.token);
  end if;
  return v.application_id;
end; $f$;

create or replace function tests.test_anon_kann_antrag_stellen()
returns setof text language plpgsql as $f$
declare v_anzahl integer; v_daten jsonb := tests.antrag_daten('nina.neu@example.org', 'Nina');
begin
  -- Eingereicht wird ueber die Edge Function mit dem Dienstschluessel (S22).
  -- anon direkt bekaeme sonst das Token und koennte ohne Postfach bestaetigen.
  perform tests.act_as_anon();
  return next throws_ok(
    format($q$select public.begin_membership_application(%L::jsonb)$q$, v_daten),
    '42501', null, 'anon kann nicht direkt einreichen');
  -- Die alte Einreichung legt nichts mehr an, sie bittet um einen neuen
  -- Versuch (das alte Web waehrend des Deploys).
  return next throws_ok(
    format($q$select public.submit_membership_application(%L::jsonb)$q$, v_daten),
    '0A000', null, 'Die alte Einreichung nimmt nichts mehr an');
  perform set_config('role', 'postgres', true);

  perform tests.antrag_stellen(v_daten);
  select count(*)::integer into v_anzahl from public.membership_applications
   where email = 'nina.neu@example.org';
  return next is(v_anzahl, 1, 'Ueber die Function landet er in der Tabelle');
end; $f$;

create or replace function tests.test_anon_kommt_nicht_an_die_tabelle()
returns setof text language plpgsql as $f$
declare v_anzahl integer; v_daten jsonb := tests.antrag_daten('sichtbar@example.org');
begin
  perform tests.antrag_stellen(v_daten);
  perform tests.act_as_anon();

  return next throws_ok(
    $q$insert into public.membership_applications (first_name, last_name, email, birthday)
       values ('Direkt', 'Eingetragen', 'direkt@example.org', '1990-01-01')$q$,
    '42501', null, 'Direkt schreiben kann anon nicht');

  -- Lesen scheitert schon am Tabellenrecht, nicht erst an der Policy: anon
  -- hat auf membership_applications ueberhaupt keinen Grant. Das ist die
  -- staerkere der beiden Schranken - es gibt gar nichts zu filtern.
  return next throws_ok(
    'select count(*) from public.membership_applications',
    '42501', null, 'Und lesen auch nicht');

  perform set_config('role', 'postgres', true);
  select count(*)::integer into v_anzahl from public.membership_applications
   where email = 'direkt@example.org';
  return next is(v_anzahl, 0, 'Der Direkteintrag ist nirgends gelandet');
end; $f$;

create or replace function tests.test_antrag_verraet_keine_bestehende_mail()
returns setof text language plpgsql as $f$
declare admin record; v_neu uuid; v_zeilen integer;
begin
  select * into admin from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('schon.mitglied@example.org', 'a8230f75-56a7-505e-b762-6171b3f850e6');
  perform tests.act_as(admin.auth_id);
  v_neu := public.create_member('Schon', 'Mitglied', 'schon.mitglied@example.org', p_birthday => '1980-01-01', p_gender => 'female', p_street => 'Teststr. 1', p_postcode => '70372', p_city => 'Stuttgart', p_mobile => '0170 1234567', p_auth_user_id => 'a8230f75-56a7-505e-b762-6171b3f850e6');
  perform set_config('role', 'postgres', true);

  -- Genau derselbe Ausgang wie bei einer unbekannten Adresse: eine Mail mit
  -- Link, kein Fehler.
  select count(*)::integer into v_zeilen
  from public.begin_membership_application(tests.antrag_daten('schon.mitglied@example.org', 'Schon'));
  return next is(v_zeilen, 1, 'Eine Adresse, die schon Mitglied ist, wird nicht verraten');

  return next ok(
    (select possible_duplicate from public.membership_applications
      where email = 'schon.mitglied@example.org'),
    'Der Vorstand sieht den Verdacht dagegen sehr wohl');
end; $f$;

create or replace function tests.test_zweiter_antrag_gleicher_mail_still()
returns setof text language plpgsql as $f$
declare v_anzahl integer; v_zeilen integer; v_daten jsonb := tests.antrag_daten('doppelt@example.org');
begin
  perform tests.antrag_stellen(v_daten);

  select count(*)::integer into v_zeilen from public.begin_membership_application(v_daten);
  return next is(v_zeilen, 0, 'Ein zweiter Antrag zu einer bestaetigten Adresse laeuft still ins Leere');

  select count(*)::integer into v_anzahl from public.membership_applications
   where email = 'doppelt@example.org';
  return next is(v_anzahl, 1, 'Angelegt wird er nicht');
end; $f$;

create or replace function tests.test_ratelimit_greift_bei_gleicher_herkunft()
returns setof text language plpgsql as $f$
declare
  i integer;
begin
  -- Zehn Antraege je Herkunft und Stunde sind erlaubt, bestaetigt oder nicht;
  -- der elfte faellt durch.
  --
  -- Von einem leeren Stand ausgehen. Der Test zaehlt Antraege der letzten
  -- Stunde; was ein E2E-Lauf oder die Entwicklung hinterlassen hat, wuerde
  -- ihn sonst verfaelschen. Die Loeschung faellt mit der Transaktion des
  -- Tests wieder weg.
  delete from public.membership_applications;

  for i in 1..10 loop
    perform public.begin_membership_application(
      tests.antrag_daten('r' || i || '@example.org'), '203.0.113.7');
  end loop;

  return next throws_ok(
    format($q$select public.begin_membership_application(%L::jsonb, '203.0.113.7')$q$,
           tests.antrag_daten('r11@example.org')),
    'P0003', null, 'Der elfte Antrag aus derselben Herkunft wird abgewiesen');

  -- Aus einer anderen Herkunft geht es weiter.
  return next lives_ok(
    format($q$select public.begin_membership_application(%L::jsonb, '198.51.100.4')$q$,
           tests.antrag_daten('r12@example.org')),
    'Von woanders her ist weiterhin ein Antrag moeglich');
end; $f$;

create or replace function tests.test_ip_wird_nur_gehasht_abgelegt()
returns setof text language plpgsql as $f$
declare v_hash text;
begin
  perform public.begin_membership_application(tests.antrag_daten('hash@example.org'), '203.0.113.9');

  select ip_hash into v_hash from public.membership_applications where email = 'hash@example.org';

  return next isnt(v_hash, null, 'Die Herkunft wird vermerkt');
  return next isnt(v_hash, '203.0.113.9', 'Aber nicht im Klartext');
  return next is(length(v_hash), 64, 'Sondern als Pruefsumme');
end; $f$;

create or replace function tests.test_antrag_braucht_pflichtangaben()
returns setof text language plpgsql as $f$
begin
  return next throws_ok(
    $q$select public.begin_membership_application(
        jsonb_build_object('first_name','','last_name','Ohne','email','a@example.org',
                           'birthday','1990-01-01',
                           'gender','female','street','Teststr. 1','postcode','70372','city','Stuttgart','mobile','0170 1234567'))$q$,
    '22023', null, 'Ohne Vornamen geht es nicht');

  return next throws_ok(
    $q$select public.begin_membership_application(
        jsonb_build_object('first_name','Ohne','last_name','Mail','email','keine-mail',
                           'birthday','1990-01-01',
                           'gender','female','street','Teststr. 1','postcode','70372','city','Stuttgart','mobile','0170 1234567'))$q$,
    '22023', null, 'Und ohne gueltige Adresse auch nicht');

end; $f$;

create or replace function tests.test_antrag_ignoriert_fremde_felder()
returns setof text language plpgsql as $f$
declare v_a public.membership_applications;
begin
  -- Wer versucht, sich den Status gleich mitzugeben, wird nicht abgewiesen -
  -- das Feld wird still uebergangen.
  return next lives_ok(
    $q$select public.begin_membership_application(
        jsonb_build_object('first_name','Schlau','last_name','Versuch',
                           'email','schlau@example.org','birthday','1990-01-01',
                           'gender','female','street','Teststr. 1','postcode','70372','city','Stuttgart','mobile','0170 1234567',
                           'status','accepted','possible_duplicate',false))$q$,
    'Unbekannte Felder fuehren nicht zu einer Fehlermeldung');


  select * into v_a from public.membership_applications where email = 'schlau@example.org';
  return next is(v_a.status::text, 'new', 'Der Status bleibt bei "neu"');
end; $f$;

create or replace function tests.test_antrag_annehmen_erzeugt_mitglied()
returns setof text language plpgsql as $f$
declare admin record; v_a uuid; v_e record; v_m public.members;
begin
  perform tests.antrag_stellen(
    jsonb_build_object('first_name','Anna','last_name','Aufnahme',
                       'email','anna.aufnahme@example.org','birthday','1988-04-11',
                           'gender','female','street','Teststr. 1','postcode','70372','city','Stuttgart','mobile','0170 1234567',
                       'emergency_contact_name','Otto Aufnahme',
                       'emergency_contact_phone','0170 1234567'));

  select id into v_a from public.membership_applications where email = 'anna.aufnahme@example.org';

  select * into admin from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login((select email::text from public.membership_applications where id = v_a), '1cbe874d-4e49-5291-bb8f-4247b27e703e');
  perform tests.act_as(admin.auth_id);
  select * into v_e from public.accept_membership_application(v_a, p_auth_user_id => '1cbe874d-4e49-5291-bb8f-4247b27e703e');
  perform set_config('role', 'postgres', true);

  select * into v_m from public.members where id = v_e.member_id;

  return next is(v_m.first_name, 'Anna', 'Das Mitglied ist angelegt');
  return next is(v_m.emergency_contact_name, null,
    'Den Notfallkontakt nimmt der Antrag nicht mehr an, er kommt im Onboarding');
  return next is(v_m.onboarding_completed_at, null, 'Das neue Mitglied hat ein offenes Onboarding');
  return next is(v_m.salutation::text, 'female', 'Die Anrede folgt aus dem Geschlecht');
  return next isnt(v_e.membership_number, null, 'Es gibt eine Mitgliedsnummer');
  return next isnt(v_m.auth_user_id, null, 'Und einen Login');
  return next is((select status::text from public.membership_applications where id = v_a),
    'accepted', 'Der Antrag gilt als angenommen');
end; $f$;

create or replace function tests.test_antrag_nimmt_einwilligungen_nicht_mehr_an()
returns setof text language plpgsql as $f$
declare v_a public.membership_applications;
begin
  perform tests.fixture_merkmal('t_antrag_foto', 'boolean', true);

  perform tests.antrag_stellen(
    tests.antrag_daten('ein.williger@example.org', 'Ein')
    || jsonb_build_object('attribute_choices', jsonb_build_object('t_antrag_foto', true),
                          'guardian_name', 'Mama Williger',
                          'emergency_contact_name', 'Papa Williger'));

  select * into v_a from public.membership_applications where email = 'ein.williger@example.org';
  return next is(v_a.attribute_choices, '{}'::jsonb, 'Einwilligungen nimmt der Antrag nicht mehr an');
  return next is(v_a.guardian_name, null, 'Erziehungsberechtigte auch nicht');
  return next is(v_a.emergency_contact_name, null, 'Und keinen Notfallkontakt');
end; $f$;

-- Aeltere Antraege haben die Angaben noch. Beim Annehmen gehen sie nicht
-- verloren.
create or replace function tests.test_alter_antrag_uebertraegt_alles()
returns setof text language plpgsql as $f$
declare admin record; v_a uuid; v_e record; v_anzahl integer; v_m public.members;
begin
  perform tests.fixture_merkmal('t_antrag_foto', 'boolean', true);

  insert into public.membership_applications (
    first_name, last_name, gender, birthday, email, mobile, street, postcode, city,
    guardian_name, guardian_email, emergency_contact_name, emergency_contact_phone,
    attribute_choices)
  values ('Alt', 'Antrag', 'male', '2014-02-02', 'alt.antrag@example.org', '0170 1',
          'Weg 1', '70372', 'Stuttgart', 'Mama Antrag', 'mama.antrag@example.org',
          'Oma Antrag', '0711 1', jsonb_build_object('t_antrag_foto', true))
  returning id into v_a;

  select * into admin from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login('alt.antrag@example.org', '9b2d3a51-aafb-5ad5-952e-0efaa8d558a6');
  perform tests.act_as(admin.auth_id);
  select * into v_e from public.accept_membership_application(v_a, p_auth_user_id => '9b2d3a51-aafb-5ad5-952e-0efaa8d558a6');
  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_anzahl
  from public.member_attribute_values v
  join public.member_attribute_types t on t.id = v.attribute_type_id
  where v.member_id = v_e.member_id and t.code = 't_antrag_foto';
  select * into v_m from public.members where id = v_e.member_id;

  return next is(v_anzahl, 1, 'Die im alten Antrag erteilte Einwilligung ist uebernommen');
  return next is(v_m.guardian_name, 'Mama Antrag', 'Die Erziehungsberechtigten auch');
  return next is(v_m.guardian_email::text, 'mama.antrag@example.org', 'Samt Adresse');
  return next is(v_m.emergency_contact_name, 'Oma Antrag', 'Und der Notfallkontakt');
end; $f$;

create or replace function tests.test_antrag_zweimal_annehmen_wird_abgewiesen()
returns setof text language plpgsql as $f$
declare admin record; v_a uuid;
begin
  perform tests.antrag_stellen(tests.antrag_daten('einmal@example.org'));
  select id into v_a from public.membership_applications where email = 'einmal@example.org';

  select * into admin from tests.fixture_user('admin') limit 1;
  perform tests.fixture_login((select email::text from public.membership_applications where id = v_a), '2c70243b-9f98-52c7-905a-d720f2d36684');
  perform tests.act_as(admin.auth_id);
  perform public.accept_membership_application(v_a, p_auth_user_id => '2c70243b-9f98-52c7-905a-d720f2d36684');

  return next throws_ok(
    format('select * from public.accept_membership_application(%L)', v_a),
    '23514', null, 'Ein Antrag laesst sich nicht zweimal annehmen');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_antrag_ablehnen_und_spam()
returns setof text language plpgsql as $f$
declare admin record; v_a uuid; v_b uuid;
begin
  perform tests.antrag_stellen(tests.antrag_daten('absage@example.org'));
  perform tests.antrag_stellen(tests.antrag_daten('spam@example.org'));
  select id into v_a from public.membership_applications where email = 'absage@example.org';
  select id into v_b from public.membership_applications where email = 'spam@example.org';

  select * into admin from tests.fixture_user('admin') limit 1;
  perform tests.act_as(admin.auth_id);
  perform public.decline_membership_application(v_a, 'Kein Platz mehr');
  perform public.mark_application_spam(v_b);
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.membership_applications where id = v_a),
    'declined', 'Der abgelehnte Antrag ist abgelehnt');
  return next is((select decision_note from public.membership_applications where id = v_a),
    'Kein Platz mehr', 'Mit Begruendung fuer die Nachwelt');
  return next is((select status::text from public.membership_applications where id = v_b),
    'spam', 'Der andere gilt als Spam');
  return next is((select count(*)::integer from public.membership_applications where id = v_b), 1,
    'Und bleibt stehen, damit er fuer die Sperren zaehlt');
end; $f$;

create or replace function tests.test_antraege_nur_fuer_admins()
returns setof text language plpgsql as $f$
declare a record; v_a uuid; v_sichtbar integer;
begin
  perform tests.antrag_stellen(tests.antrag_daten('geheim@example.org'));
  select id into v_a from public.membership_applications where email = 'geheim@example.org';

  select * into a from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);

  select count(*)::integer into v_sichtbar from public.membership_applications;
  return next is(v_sichtbar, 0, 'Ein Mitglied sieht keine Antraege');

  return next throws_ok(
    format('select * from public.accept_membership_application(%L)', v_a),
    '42501', null, 'Und kann auch keinen annehmen');
  return next throws_ok(
    format('select public.decline_membership_application(%L)', v_a),
    '42501', null, 'Und keinen ablehnen');

  perform set_config('role', 'postgres', true);
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Der eine Test hier belegt, dass die Definitionen selbst
-- fehlerfrei eingespielt wurden - ohne Plan haelt pg_prove die Datei sonst
-- fuer kaputt.
select extensions.plan(1);
select extensions.pass('Mitglieder-Tests sind eingespielt');
select * from extensions.finish();
