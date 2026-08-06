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

create or replace function tests.test_protokoll_zeigt_nur_eigene_eintraege()
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
  return next cmp_ok(v_eigen, '>', 0, 'Mitglied A sieht seine eigenen Eintraege');
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
    'booking.guest_fee_cents', 'drinks.min_debit_cents', 'drinks.void_window_minutes',
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
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Max', 'Mustermann', 'max.mustermann@example.org',
                                '1990-05-17'::date);

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
  perform tests.act_as(a.auth_id);

  v_a := public.create_member('Anna', 'Erste');
  v_b := public.create_member('Bert', 'Zweiter');

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
  v_ohne := tests.fixture_member('Kind ohne Login');
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
-- Zahlerbeziehung
-- ---------------------------------------------------------------------------

create or replace function tests.test_zahler_zyklus_wird_verhindert()
returns setof text language plpgsql as $f$
declare a record; b record; c record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);

  perform public.set_billing_payer(b.member_id, c.member_id);

  return next throws_ok(
    format($q$select public.set_billing_payer(%L, %L)$q$, c.member_id, b.member_id),
    '23514', null, 'B zahlt fuer C, also darf C nicht fuer B zahlen');

  return next throws_ok(
    format($q$select public.set_billing_payer(%L, %L)$q$, b.member_id, b.member_id),
    '23514', null, 'Niemand ist sein eigener Zahler');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_zahler_kette_max_zwei_stufen()
returns setof text language plpgsql as $f$
declare a record; b record; c record; d record;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  select * into d from tests.fixture_user() limit 1;
  perform tests.act_as(a.auth_id);

  perform public.set_billing_payer(b.member_id, c.member_id);

  return next throws_ok(
    format($q$select public.set_billing_payer(%L, %L)$q$, c.member_id, d.member_id),
    '23514', null, 'Eine dritte Stufe in der Zahlerkette wird abgewiesen');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_zahler_trigger_greift_auch_ohne_rpc()
returns setof text language plpgsql as $f$
declare b record; c record;
begin
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;

  -- Als Eigentuemer, also ohne jede Policy und ohne RPC: der Trigger ist die
  -- letzte Schranke und muss auch hier greifen.
  update public.members set billing_payer_id = c.member_id where id = b.member_id;

  return next throws_ok(
    format('update public.members set billing_payer_id = %L where id = %L',
           b.member_id, c.member_id),
    '23514', null, 'Auch ein direktes Update kann keinen Kreis anlegen');
end; $f$;

-- ---------------------------------------------------------------------------
-- Beenden, Archivieren
-- ---------------------------------------------------------------------------

create or replace function tests.test_mitgliedschaft_beenden_und_wieder_aufnehmen()
returns setof text language plpgsql as $f$
declare a record; v_neu uuid; v_nummer text; v_offen integer;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Rita', 'Rueckkehr');
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
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Doppel', 'Mitglied');

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
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Alfred', 'Archiv');
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
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Sonja', 'Schuldig');
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

create or replace function tests.test_archivieren_loest_zahlerbeziehungen()
returns setof text language plpgsql as $f$
declare a record; v_eltern uuid; v_kind uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.act_as(a.auth_id);
  v_eltern := public.create_member('Petra', 'Zahler');
  v_kind   := public.create_member('Paul', 'Zahler');
  perform public.set_billing_payer(v_kind, v_eltern);
  perform public.archive_member(v_eltern);
  perform set_config('role', 'postgres', true);

  return next is((select billing_payer_id from public.members where id = v_kind), null,
    'Wer vom Archivierten bezahlt wurde, zahlt danach selbst');
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
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Tipp', 'Fehler');
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
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Vor', 'Sicht');

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
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Bleibt', 'Bestehen');
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
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Spur', 'Nachweis');
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
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Klara', 'Klarname', 'klara@example.org', '1980-01-01'::date);
  perform set_config('role', 'postgres', true);

  insert into public.charges (member_id, payer_id, kind, period_label, amount_cents, description)
  values (v_neu, v_neu, 'fee', '2026', 19000, 'Jahresbeitrag 2026');
  insert into public.bank_accounts (member_id, iban_encrypted, iban_last4, holder)
  values (v_neu, private.encrypt_iban('DE89370400440532013000'), '3000', 'Klara Klarname');

  perform tests.act_as(a.auth_id);
  perform public.anonymize_member(v_neu, 'Auskunftsersuchen');
  perform set_config('role', 'postgres', true);

  select * into v_m from public.members where id = v_neu;

  return next is(v_m.first_name, 'Geloescht', 'Der Vorname ist ersetzt');
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
    format($q$select public.set_billing_payer(%L, %L)$q$, a.member_id, b.member_id),
    '42501', null, 'set_billing_payer ist Admins vorbehalten');
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

create or replace function tests.test_zahler_darf_merkmal_fuers_kind_setzen()
returns setof text language plpgsql as $f$
declare eltern record; kind uuid;
begin
  select * into eltern from tests.fixture_user() limit 1;
  kind := tests.fixture_member('Kind');
  update public.members set billing_payer_id = eltern.member_id where id = kind;
  perform tests.fixture_merkmal('t_foto2', 'boolean', true);
  perform tests.act_as(eltern.auth_id);

  return next lives_ok(
    format($q$select public.set_member_attribute(%L, 't_foto2')$q$, kind),
    'Ein Elternteil erteilt die Einwilligung fuer das Kind');

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
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Merkmal', 'Traeger');
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
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Konto', 'Inhaber');
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
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Falsche', 'Ziffern');

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
  perform tests.act_as(a.auth_id);
  v_neu := public.create_member('Doppelt', 'Erfasst');
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
  perform tests.act_as(a.auth_id);
  v_eins := public.create_member('Familie', 'Eins');
  v_zwei := public.create_member('Familie', 'Zwei');
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
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Mandat', 'Traeger');
  v_konto := public.add_bank_account(v_neu, 'DE89370400440532013000');
  v_ref := public.create_sepa_mandate(v_neu, v_konto);
  perform set_config('role', 'postgres', true);

  select * into v_m from public.sepa_mandates where member_id = v_neu;

  return next matches(v_ref, '^TCM-', 'Die Referenz folgt der Vereinsform');
  return next is(v_m.status::text, 'active', 'Das Mandat ist aktiv');
  return next is(v_m.sequence_type::text, 'FRST', 'Der erste Einzug ist eine Erstlastschrift');
  return next is(v_m.scope::text, 'fees_only', 'Standardmaessig deckt es nur Beitraege ab');

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
declare a record; v_neu uuid; v_konto uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Zwei', 'Mandate');
  v_konto := public.add_bank_account(v_neu, 'DE89370400440532013000');
  perform public.create_sepa_mandate(v_neu, v_konto);

  return next throws_ok(
    format('select public.create_sepa_mandate(%L, %L)', v_neu, v_konto),
    '23514', null, 'Zwei aktive Mandate fuer denselben Zweck gibt es nicht');

  -- Fuer einen anderen Zweck dagegen schon.
  return next lives_ok(
    format($q$select public.create_sepa_mandate(%L, %L, null, null, 'all_payments')$q$,
           v_neu, v_konto),
    'Ein Mandat fuer alle Zahlungen darf danebenstehen');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_mandat_fuer_fremdes_konto_abgewiesen()
returns setof text language plpgsql as $f$
declare a record; v_eins uuid; v_zwei uuid; v_konto uuid;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  perform tests.act_as(a.auth_id);

  v_eins := public.create_member('Konto', 'Besitzer');
  v_zwei := public.create_member('Fremder', 'Dritter');
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
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Stilllegen', 'Versuch');
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
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Beitrag', 'Zahler');
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
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Ehren', 'Mitglied');
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
  perform tests.act_as(a.auth_id);

  v_neu := public.create_member('Weg', 'Damit');
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

create or replace function tests.test_zugang_verbinden_und_loesen()
returns setof text language plpgsql as $f$
declare admin record; v_neu uuid; v_auth uuid := extensions.gen_random_uuid();
begin
  select * into admin from tests.fixture_user('admin') limit 1;
  perform tests.act_as(admin.auth_id);
  v_neu := public.create_member('Zugang', 'Traeger', 'zugang.traeger@example.org');
  perform set_config('role', 'postgres', true);

  insert into auth.users (id, email, aud, role)
  values (v_auth, 'zugang.traeger@example.org', 'authenticated', 'authenticated');

  -- So ruft die Edge Function auf: ohne angemeldeten Nutzer.
  perform public.link_auth_user(v_neu, v_auth);

  return next is((select auth_user_id from public.members where id = v_neu), v_auth,
    'Der Zugang ist mit dem Mitglied verbunden');
  return next isnt((select invited_at from public.members where id = v_neu), null,
    'Der Zeitpunkt der Einladung steht fest');

  return next is(public.unlink_auth_user(v_neu), v_auth,
    'Beim Loesen kommt die bisherige Kennung zurueck');
  return next is((select auth_user_id from public.members where id = v_neu), null,
    'Danach hat das Mitglied keinen Zugang mehr');
end; $f$;

create or replace function tests.test_zugang_nicht_zweimal_vergeben()
returns setof text language plpgsql as $f$
declare admin record; v_eins uuid; v_zwei uuid; v_auth uuid := extensions.gen_random_uuid();
begin
  select * into admin from tests.fixture_user('admin') limit 1;
  perform tests.act_as(admin.auth_id);
  v_eins := public.create_member('Erster', 'Nutzer');
  v_zwei := public.create_member('Zweiter', 'Nutzer');
  perform set_config('role', 'postgres', true);

  insert into auth.users (id, email, aud, role)
  values (v_auth, 'geteilt@example.org', 'authenticated', 'authenticated');
  perform public.link_auth_user(v_eins, v_auth);

  return next throws_ok(
    format('select public.link_auth_user(%L, %L)', v_zwei, v_auth),
    '23514', null, 'Ein Zugang gehoert immer genau einer Person');
end; $f$;

create or replace function tests.test_zugang_nicht_selbst_entziehen()
returns setof text language plpgsql as $f$
declare admin record;
begin
  select * into admin from tests.fixture_user('admin') limit 1;
  perform tests.act_as(admin.auth_id);

  return next throws_ok(
    format('select public.unlink_auth_user(%L)', admin.member_id),
    '23514', null, 'Niemand entzieht sich selbst den Zugang');
  return next throws_ok(
    format('select public.set_login_disabled(%L, true)', admin.member_id),
    '23514', null, 'Und sperrt sich auch nicht selbst aus');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_zugang_entfernen_nimmt_adminrolle()
returns setof text language plpgsql as $f$
declare a record; b record; v_rollen integer;
begin
  select * into a from tests.fixture_user('admin') limit 1;
  select * into b from tests.fixture_user('admin') limit 1;

  perform public.unlink_auth_user(b.member_id);

  select count(*)::integer into v_rollen
  from public.member_roles where member_id = b.member_id and role = 'admin';

  return next is(v_rollen, 0, 'Mit dem Zugang enden auch die Verwaltungsrechte');
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
    format('select public.unlink_auth_user(%L)', b.member_id),
    '42501', null, 'Und loest auch keine');
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
  v_ohne := tests.fixture_member('Kind ohne Mail');
  perform tests.act_as(admin.auth_id);

  select * into v_zeile from public.member_login_state(v_ohne);
  perform set_config('role', 'postgres', true);

  return next ok(not v_zeile.einladbar, 'Ohne E-Mail ist niemand einladbar');
  return next matches(v_zeile.grund, 'E-Mail',
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
    'email', p_email, 'birthday', '1990-06-15');
$f$;

create or replace function tests.test_anon_kann_antrag_stellen()
returns setof text language plpgsql as $f$
declare v_anzahl integer;
begin
  perform tests.act_as_anon();

  return next lives_ok(
    $q$select public.submit_membership_application(
        jsonb_build_object('first_name','Nina','last_name','Neu',
                           'email','nina.neu@example.org','birthday','1995-03-02'))$q$,
    'Ein Antrag laesst sich ohne Anmeldung stellen');

  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_anzahl from public.membership_applications
   where email = 'nina.neu@example.org';
  return next is(v_anzahl, 1, 'Er landet in der Tabelle');
end; $f$;

create or replace function tests.test_anon_kommt_nicht_an_die_tabelle()
returns setof text language plpgsql as $f$
declare v_anzahl integer; v_daten jsonb := tests.antrag_daten('sichtbar@example.org');
begin
  perform public.submit_membership_application(v_daten);
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
declare admin record; v_neu uuid;
begin
  select * into admin from tests.fixture_user('admin') limit 1;
  perform tests.act_as(admin.auth_id);
  v_neu := public.create_member('Schon', 'Mitglied', 'schon.mitglied@example.org');
  perform set_config('role', 'postgres', true);

  perform tests.act_as_anon();

  -- Genau derselbe Ausgang wie bei einer unbekannten Adresse: kein Fehler,
  -- keine abweichende Meldung.
  return next lives_ok(
    $q$select public.submit_membership_application(
        jsonb_build_object('first_name','Schon','last_name','Mitglied',
                           'email','schon.mitglied@example.org','birthday','1990-01-01'))$q$,
    'Eine Adresse, die schon Mitglied ist, wird nicht verraten');

  perform set_config('role', 'postgres', true);

  return next ok(
    (select possible_duplicate from public.membership_applications
      where email = 'schon.mitglied@example.org'),
    'Der Vorstand sieht den Verdacht dagegen sehr wohl');
end; $f$;

create or replace function tests.test_zweiter_antrag_gleicher_mail_still()
returns setof text language plpgsql as $f$
declare v_anzahl integer; v_daten jsonb := tests.antrag_daten('doppelt@example.org');
begin
  -- Testdaten vor dem Rollenwechsel holen: als anon ist das Schema tests
  -- nicht mehr erreichbar.
  perform tests.act_as_anon();
  perform public.submit_membership_application(v_daten);

  return next lives_ok(
    $q$select public.submit_membership_application(
        jsonb_build_object('first_name','Doppelt','last_name','Interessent',
                           'email','doppelt@example.org','birthday','1990-06-15'))$q$,
    'Ein zweiter Antrag derselben Adresse laeuft ohne Fehler durch');

  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_anzahl from public.membership_applications
   where email = 'doppelt@example.org';
  return next is(v_anzahl, 1, 'Angelegt wird er aber nicht');
end; $f$;

create or replace function tests.test_ratelimit_greift_bei_gleicher_herkunft()
returns setof text language plpgsql as $f$
declare
  v_daten jsonb[];
  i integer;
begin
  -- Zehn Antraege je Herkunft und Stunde sind erlaubt; der elfte faellt
  -- durch. Alle Testdaten vor dem Rollenwechsel holen, danach ist das Schema
  -- tests nicht mehr erreichbar.
  v_daten := array(select tests.antrag_daten('r' || g || '@example.org')
                   from generate_series(1, 12) g);

  -- Von einem leeren Stand ausgehen. Der Test zaehlt Antraege der letzten
  -- Stunde; was ein E2E-Lauf oder die Entwicklung hinterlassen hat, wuerde
  -- ihn sonst verfaelschen. Die Loeschung faellt mit der Transaktion des
  -- Tests wieder weg.
  delete from public.membership_applications;

  perform tests.act_as_anon();

  for i in 1..10 loop
    perform public.submit_membership_application(v_daten[i], '203.0.113.7');
  end loop;

  return next throws_ok(
    format($q$select public.submit_membership_application(%L::jsonb, '203.0.113.7')$q$,
           v_daten[11]),
    'P0003', null, 'Der elfte Antrag aus derselben Herkunft wird abgewiesen');

  -- Aus einer anderen Herkunft geht es weiter.
  return next lives_ok(
    format($q$select public.submit_membership_application(%L::jsonb, '198.51.100.4')$q$,
           v_daten[12]),
    'Von woanders her ist weiterhin ein Antrag moeglich');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_ip_wird_nur_gehasht_abgelegt()
returns setof text language plpgsql as $f$
declare v_hash text; v_daten jsonb := tests.antrag_daten('hash@example.org');
begin
  perform tests.act_as_anon();
  perform public.submit_membership_application(v_daten, '203.0.113.9');
  perform set_config('role', 'postgres', true);

  select ip_hash into v_hash from public.membership_applications where email = 'hash@example.org';

  return next isnt(v_hash, null, 'Die Herkunft wird vermerkt');
  return next isnt(v_hash, '203.0.113.9', 'Aber nicht im Klartext');
  return next is(length(v_hash), 64, 'Sondern als Pruefsumme');
end; $f$;

create or replace function tests.test_antrag_braucht_pflichtangaben()
returns setof text language plpgsql as $f$
begin
  perform tests.act_as_anon();

  return next throws_ok(
    $q$select public.submit_membership_application(
        jsonb_build_object('first_name','','last_name','Ohne','email','a@example.org',
                           'birthday','1990-01-01'))$q$,
    '22023', null, 'Ohne Vornamen geht es nicht');

  return next throws_ok(
    $q$select public.submit_membership_application(
        jsonb_build_object('first_name','Ohne','last_name','Mail','email','keine-mail',
                           'birthday','1990-01-01'))$q$,
    '22023', null, 'Und ohne gueltige Adresse auch nicht');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_antrag_ignoriert_fremde_felder()
returns setof text language plpgsql as $f$
declare v_a public.membership_applications;
begin
  perform tests.act_as_anon();

  -- Wer versucht, sich den Status gleich mitzugeben, wird nicht abgewiesen -
  -- das Feld wird still uebergangen.
  return next lives_ok(
    $q$select public.submit_membership_application(
        jsonb_build_object('first_name','Schlau','last_name','Versuch',
                           'email','schlau@example.org','birthday','1990-01-01',
                           'status','accepted','possible_duplicate',false))$q$,
    'Unbekannte Felder fuehren nicht zu einer Fehlermeldung');

  perform set_config('role', 'postgres', true);

  select * into v_a from public.membership_applications where email = 'schlau@example.org';
  return next is(v_a.status::text, 'new', 'Der Status bleibt bei "neu"');
end; $f$;

create or replace function tests.test_antrag_annehmen_erzeugt_mitglied()
returns setof text language plpgsql as $f$
declare admin record; v_a uuid; v_e record; v_m public.members;
begin
  perform public.submit_membership_application(
    jsonb_build_object('first_name','Anna','last_name','Aufnahme',
                       'email','anna.aufnahme@example.org','birthday','1988-04-11',
                       'emergency_contact_name','Otto Aufnahme',
                       'emergency_contact_phone','0170 1234567'));

  select id into v_a from public.membership_applications where email = 'anna.aufnahme@example.org';

  select * into admin from tests.fixture_user('admin') limit 1;
  perform tests.act_as(admin.auth_id);
  select * into v_e from public.accept_membership_application(v_a);
  perform set_config('role', 'postgres', true);

  select * into v_m from public.members where id = v_e.member_id;

  return next is(v_m.first_name, 'Anna', 'Das Mitglied ist angelegt');
  return next is(v_m.emergency_contact_name, 'Otto Aufnahme',
    'Der Notfallkontakt aus dem Antrag steht dabei');
  return next isnt(v_e.membership_number, null, 'Es gibt eine Mitgliedsnummer');
  return next ok(v_e.needs_invite, 'Und eine Adresse, an die sich einladen laesst');
  return next is((select status::text from public.membership_applications where id = v_a),
    'accepted', 'Der Antrag gilt als angenommen');
end; $f$;

create or replace function tests.test_antrag_uebertraegt_einwilligungen()
returns setof text language plpgsql as $f$
declare admin record; v_a uuid; v_e record; v_anzahl integer;
begin
  perform tests.fixture_merkmal('t_antrag_foto', 'boolean', true);

  perform public.submit_membership_application(
    jsonb_build_object('first_name','Ein','last_name','Williger',
                       'email','ein.williger@example.org','birthday','1992-02-02',
                       'attribute_choices', jsonb_build_object('t_antrag_foto', true)));

  select id into v_a from public.membership_applications where email = 'ein.williger@example.org';

  select * into admin from tests.fixture_user('admin') limit 1;
  perform tests.act_as(admin.auth_id);
  select * into v_e from public.accept_membership_application(v_a);
  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_anzahl
  from public.member_attribute_values v
  join public.member_attribute_types t on t.id = v.attribute_type_id
  where v.member_id = v_e.member_id and t.code = 't_antrag_foto';

  return next is(v_anzahl, 1, 'Die im Antrag erteilte Einwilligung ist uebernommen');
end; $f$;

create or replace function tests.test_antrag_zweimal_annehmen_wird_abgewiesen()
returns setof text language plpgsql as $f$
declare admin record; v_a uuid;
begin
  perform public.submit_membership_application(tests.antrag_daten('einmal@example.org'));
  select id into v_a from public.membership_applications where email = 'einmal@example.org';

  select * into admin from tests.fixture_user('admin') limit 1;
  perform tests.act_as(admin.auth_id);
  perform public.accept_membership_application(v_a);

  return next throws_ok(
    format('select * from public.accept_membership_application(%L)', v_a),
    '23514', null, 'Ein Antrag laesst sich nicht zweimal annehmen');

  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_antrag_ablehnen_und_spam()
returns setof text language plpgsql as $f$
declare admin record; v_a uuid; v_b uuid;
begin
  perform public.submit_membership_application(tests.antrag_daten('absage@example.org'));
  perform public.submit_membership_application(tests.antrag_daten('spam@example.org'));
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
  perform public.submit_membership_application(tests.antrag_daten('geheim@example.org'));
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
