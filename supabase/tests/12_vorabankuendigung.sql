-- ===========================================================================
-- Die Vorabankuendigung
--
-- Der wichtigste Test steht ganz oben: ein Zahler mit drei Kindern bekommt
-- EINE Nachricht ueber den Gesamtbetrag, nicht drei ueber Teilbetraege. Genau
-- so wird spaeter auch eingezogen - eine Lastschrift je Zahler -, und wer
-- vorher drei Ankuendigungen ueber je 90 Euro liest, rechnet mit drei
-- Abbuchungen und ruft beim Kassenwart an.
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
-- ===========================================================================

/** Eine offene Forderung fuer ein Mitglied. */
create or replace function tests.fixture_forderung(
  p_member_id uuid, p_cents integer, p_text text default 'ZZTest Forderung'
)
returns uuid language plpgsql as $f$
declare adm record; v_id uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  perform tests.act_as(adm.auth_id);
  select public.create_manual_charge(p_member_id, 'misc', p_cents, p_text) into v_id;
  perform set_config('role', 'postgres', true);
  return v_id;
end; $f$;

/**
 * Ein Datum, das die Frist sicher einhaelt.
 *
 * Wird immer VOR dem Rollenwechsel ausgerechnet: unter der Rolle
 * authenticated ist das Schema tests nicht zugaenglich, und ein Aufruf
 * mitten im Test scheitert an der Berechtigung, nicht an der Fachlichkeit.
 */
create or replace function tests.fixture_faellig()
returns date language sql stable as $f$
  select (now() at time zone 'Europe/Berlin')::date
       + public.setting_int('sepa.prenotification_days') + 1;
$f$;

/**
 * Der Kern: eine Nachricht je Zahler, nicht je Forderung.
 */
create or replace function tests.test_ankuendigung_buendelt_je_zahler()
returns setof text language plpgsql as $f$
declare adm record; eltern record; k1 record; k2 record; k3 record;
        v record; v_anzahl integer; v_text text; v_faellig date;
begin
  v_faellig := tests.fixture_faellig();
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into eltern from tests.fixture_user() limit 1;
  select * into k1 from tests.fixture_user() limit 1;
  select * into k2 from tests.fixture_user() limit 1;
  select * into k3 from tests.fixture_user() limit 1;

  update public.members set billing_payer_id = eltern.member_id
   where id in (k1.member_id, k2.member_id, k3.member_id);

  perform tests.fixture_forderung(k1.member_id, 9000, 'ZZTest Beitrag Kind 1');
  perform tests.fixture_forderung(k2.member_id, 9000, 'ZZTest Beitrag Kind 2');
  perform tests.fixture_forderung(k3.member_id, 9000, 'ZZTest Beitrag Kind 3');

  perform tests.act_as(adm.auth_id);
  select * into v from public.announce_charges(v_faellig, 'misc');
  perform set_config('role', 'postgres', true);

  select count(*)::integer, max(body) into v_anzahl, v_text
  from public.notifications
  where member_id = eltern.member_id and kind = 'charge_announced';

  return next is(v.angekuendigt, 3, 'Alle drei Forderungen sind angekuendigt');
  return next is(v_anzahl, 1, 'Der Zahler bekommt genau eine Nachricht');
  return next ok(v_text like '%270,00 Euro%',
    'und darin den Gesamtbetrag, nicht den Teilbetrag');
  return next is(v.empfaenger, 1, 'Die Funktion nennt einen Empfaenger');
  return next is(v.summe_cents, 27000, 'und die volle Summe');
end; $f$;

/**
 * Ein zu frueher Faelligkeitstag wird abgewiesen.
 *
 * Die Frist ist der ganze Zweck dieser Stufe. Wird sie hier nicht durchgesetzt,
 * traegt sie spaeter niemand nach.
 */
create or replace function tests.test_zu_frueher_einzug_abgewiesen()
returns setof text language plpgsql as $f$
declare adm record; u record; v_morgen date;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  perform tests.fixture_forderung(u.member_id, 5000);
  v_morgen := (now() at time zone 'Europe/Berlin')::date + 1;

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select public.announce_charges(%L, ''misc'')', v_morgen),
    '22023', null,
    'Ein Faelligkeitstag innerhalb der Frist wird abgewiesen');
  perform set_config('role', 'postgres', true);

  return next is(
    (select status::text from public.charges where member_id = u.member_id),
    'open', 'und die Forderung bleibt unangetastet offen');
end; $f$;

/**
 * Ein zweiter Aufruf startet die Frist nicht neu.
 *
 * Sonst verschoebe ein versehentlicher Klick den Einzug um zwei Wochen, ohne
 * dass es jemandem auffiele.
 */
create or replace function tests.test_zweite_ankuendigung_ist_folgenlos()
returns setof text language plpgsql as $f$
declare adm record; u record; v_id uuid; v_erst timestamptz; v_dann timestamptz;
        v record; v_faellig date;
begin
  v_faellig := tests.fixture_faellig();
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  v_id := tests.fixture_forderung(u.member_id, 4200);

  perform tests.act_as(adm.auth_id);
  perform public.announce_charges(v_faellig, 'misc');
  select notified_at into v_erst from public.charges where id = v_id;

  select * into v from public.announce_charges(v_faellig + 7, 'misc');
  select notified_at into v_dann from public.charges where id = v_id;
  perform set_config('role', 'postgres', true);

  return next is(v.angekuendigt, 0, 'Der zweite Aufruf kuendigt nichts mehr an');
  return next is(v_dann, v_erst, 'notified_at bleibt stehen - die Frist laeuft weiter');
  return next is(
    (select count(*)::integer from public.notifications
      where member_id = u.member_id and kind = 'charge_announced'),
    1, 'und es geht keine zweite Nachricht raus');
end; $f$;

/** Die Ankuendigung setzt Stand, Faelligkeit und Zeitpunkt. */
create or replace function tests.test_ankuendigung_setzt_die_felder()
returns setof text language plpgsql as $f$
declare adm record; u record; v_id uuid; c record; v_faellig date;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  v_id := tests.fixture_forderung(u.member_id, 12000);
  v_faellig := tests.fixture_faellig();

  perform tests.act_as(adm.auth_id);
  perform public.announce_charges(v_faellig, 'misc');
  perform set_config('role', 'postgres', true);

  select * into c from public.charges where id = v_id;

  return next is(c.status::text, 'notified', 'Die Forderung gilt als angekuendigt');
  return next is(c.due_date, v_faellig, 'mit dem angekuendigten Faelligkeitstag');
  return next ok(c.notified_at is not null, 'und einem Zeitpunkt, ab dem die Frist laeuft');
end; $f$;

/** Beides zugleich anzugeben ist mehrdeutig. */
create or replace function tests.test_ankuendigung_braucht_eine_auswahl()
returns setof text language plpgsql as $f$
declare adm record; u record; v_id uuid; v_faellig date;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  v_id := tests.fixture_forderung(u.member_id, 3000);
  v_faellig := tests.fixture_faellig();

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select public.announce_charges(%L, ''misc'', null, array[%L]::uuid[])',
           v_faellig, v_id),
    '22023', null,
    'Einzelne Forderungen und Art zugleich sind mehrdeutig');
  return next throws_ok(
    format('select public.announce_charges(%L)', v_faellig),
    '22023', null,
    'Ohne Auswahl wird gar nichts angekuendigt');
  perform set_config('role', 'postgres', true);
end; $f$;

/** Nur Administratoren kuendigen an. */
create or replace function tests.test_ankuendigung_nur_admin()
returns setof text language plpgsql as $f$
declare u record; v_faellig date;
begin
  select * into u from tests.fixture_user() limit 1;
  v_faellig := tests.fixture_faellig();
  perform tests.act_as(u.auth_id);
  return next throws_ok(
    format('select public.announce_charges(%L, ''misc'')', v_faellig),
    '42501', null,
    'Ein normales Mitglied kuendigt keine Lastschrift an');
  perform set_config('role', 'postgres', true);
end; $f$;

/**
 * Die Ankuendigung geht auch per Mail raus.
 *
 * Anders als bei Buchungshinweisen ist das keine Bequemlichkeit: wer die App
 * wochenlang nicht oeffnet, soll trotzdem wissen, dass Geld abgeht.
 */
create or replace function tests.test_ankuendigung_ist_eine_mailart()
returns setof text language plpgsql as $f$
begin
  return next ok(
    'charge_announced' = any (private.notification_mail_kinds()),
    'charge_announced steht in der Liste der Mailarten');
end; $f$;

/** Nur offene Forderungen werden angekuendigt. */
create or replace function tests.test_bezahlte_forderung_wird_nicht_angekuendigt()
returns setof text language plpgsql as $f$
declare adm record; u record; v_id uuid; v record; v_faellig date;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  v_id := tests.fixture_forderung(u.member_id, 800);
  v_faellig := tests.fixture_faellig();

  perform tests.act_as(adm.auth_id);
  perform public.settle_charge_manually(v_id, 'bar bezahlt');
  select * into v from public.announce_charges(v_faellig, 'misc');
  perform set_config('role', 'postgres', true);

  return next is(v.angekuendigt, 0, 'Was bezahlt ist, wird nicht mehr angekuendigt');
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer die Vorabankuendigung sind eingespielt');
select * from extensions.finish();
