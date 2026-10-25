-- ===========================================================================
-- Mitgliedsantrag mit Bestaetigungsmail (S22)
--
-- Unbestaetigte Antraege sieht die Verwaltung nicht, sie zaehlen nicht fuer
-- den globalen Deckel und verschwinden nach 24 Stunden. Bestaetigt wird
-- einmal, je Adresse gibt es einen offenen Antrag und begrenzt viele Mails.
--
-- Braucht tests.antrag_daten und tests.antrag_stellen (04_mitglieder.sql).
-- ===========================================================================

/** Reicht ein und gibt die Zeile mit dem Token zurueck (wie die Function). */
create or replace function tests.antrag_eingang(p_email text, p_ip text default null)
returns table (application_id uuid, email text, first_name text, token text)
language sql as $f$
  select * from public.begin_membership_application(tests.antrag_daten(p_email), p_ip);
$f$;

create or replace function tests.test_s22_unbestaetigt_unsichtbar()
returns setof text language plpgsql as $f$
declare adm record; v record; v_sichtbar integer; v_nachrichten integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select count(*)::integer into v_nachrichten from public.notifications where kind = 'application_new';

  select * into v from tests.antrag_eingang('unbestaetigt@example.org');

  return next is(
    (select confirmed_at from public.membership_applications where id = v.application_id), null,
    'Ein neuer Antrag ist unbestaetigt');
  return next is(
    (select confirmation_token_hash from public.membership_applications where id = v.application_id),
    encode(extensions.digest(v.token, 'sha256'), 'hex'),
    'In der Datenbank steht nur der Hash des Tokens');
  return next is(
    (select count(*)::integer from public.notifications where kind = 'application_new'), v_nachrichten,
    'Der Vorstand erfaehrt noch nichts');

  perform tests.act_as(adm.auth_id);
  select count(*)::integer into v_sichtbar from public.membership_applications
   where email = 'unbestaetigt@example.org';
  return next is(v_sichtbar, 0, 'Die Verwaltung sieht ihn nicht');
  return next throws_ok(
    format('select public.decline_membership_application(%L)', v.application_id),
    '23514', null, 'Und kann ihn nicht ablehnen');
  perform public.mark_application_spam(v.application_id);
  perform set_config('role', 'postgres', true);
  return next is(
    (select status::text from public.membership_applications where id = v.application_id), 'new',
    'Und nicht als Spam kennzeichnen');

  perform public.confirm_membership_application(v.token);

  perform tests.act_as(adm.auth_id);
  select count(*)::integer into v_sichtbar from public.membership_applications
   where email = 'unbestaetigt@example.org';
  return next is(v_sichtbar, 1, 'Nach dem Bestaetigen sieht die Verwaltung ihn');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_s22_bestaetigen_einmalig()
returns setof text language plpgsql as $f$
declare v record; v_vorher integer;
begin
  perform tests.fixture_user('admin');
  select count(*)::integer into v_vorher from public.notifications where kind = 'application_new';
  select * into v from tests.antrag_eingang('einmal.bestaetigt@example.org');

  perform tests.act_as_anon();
  return next is(public.membership_application_confirmation_state(v.token), 'pending',
    'Vor dem Klick: offen');
  return next is(public.confirm_membership_application(v.token), 'confirmed',
    'anon bestaetigt mit dem Token aus der Mail');
  return next is(public.confirm_membership_application(v.token), 'already_confirmed',
    'Ein zweiter Klick aendert nichts');
  return next is(public.membership_application_confirmation_state(v.token), 'already_confirmed',
    'Und die Seite sagt das auch');
  return next is(public.confirm_membership_application('falsch'), 'expired',
    'Ein unbekanntes Token bestaetigt nichts');
  return next is(public.confirm_membership_application(null), 'expired', 'Keins auch nicht');
  perform set_config('role', 'postgres', true);

  return next ok(
    (select count(*)::integer from public.notifications where kind = 'application_new') > v_vorher,
    'Erst mit dem Bestaetigen erfaehrt der Vorstand davon');
  return next is(
    (select count(*)::integer from public.notifications where kind = 'application_new') - v_vorher,
    (select count(distinct member_id)::integer from public.member_roles where role in ('admin', 'board')),
    'Genau einmal je Vorstandsmitglied, auch beim zweiten Klick');
end; $f$;

create or replace function tests.test_s22_ablauf()
returns setof text language plpgsql as $f$
declare v record; w record; b uuid; v_geloescht integer;
begin
  select * into v from tests.antrag_eingang('abgelaufen@example.org');
  select * into w from tests.antrag_eingang('frisch@example.org');
  b := tests.antrag_stellen(tests.antrag_daten('alt.bestaetigt@example.org'));

  -- 25 Stunden zurueckdrehen.
  update public.membership_applications
     set confirmation_sent_at = now() - interval '25 hours',
         submitted_at = now() - interval '25 hours'
   where id in (v.application_id, b);

  return next is(public.membership_application_confirmation_state(v.token), 'expired',
    'Nach 24 Stunden gilt der Link nicht mehr');
  return next is(public.confirm_membership_application(v.token), 'expired',
    'Und bestaetigt nichts mehr');
  return next is(
    (select confirmed_at from public.membership_applications where id = v.application_id), null,
    'Der Antrag bleibt unbestaetigt');

  v_geloescht := private.unbestaetigte_antraege_loeschen();
  return next is(v_geloescht, 1, 'Der Aufraeumjob loescht genau den abgelaufenen');
  return next ok(not exists (select 1 from public.membership_applications where id = v.application_id),
    'Er ist weg');
  return next ok(exists (select 1 from public.membership_applications where id = w.application_id),
    'Der frische bleibt');
  return next ok(exists (select 1 from public.membership_applications where id = b),
    'Ein bestaetigter bleibt, egal wie alt');

  return next ok(exists (select 1 from cron.job
                          where jobname = 'unbestaetigte-antraege'
                            and command like '%unbestaetigte_antraege_loeschen%'),
    'Der Job laeuft ueber pg_cron');
end; $f$;

create or replace function tests.test_s22_deckel_je_adresse()
returns setof text language plpgsql as $f$
declare v record; w record; v_zeilen integer; i integer;
begin
  select * into v from tests.antrag_eingang('je.adresse@example.org');

  select count(*)::integer into v_zeilen from tests.antrag_eingang('je.adresse@example.org');
  return next is(v_zeilen, 0, 'Dieselbe Adresse gleich noch einmal: keine zweite Mail');
  return next is(
    (select count(*)::integer from public.membership_applications where email = 'je.adresse@example.org'), 1,
    'Und kein zweiter Antrag');

  -- Nach der Sperrfrist kommt dieselbe Mail mit neuem Link.
  update public.membership_applications set confirmation_sent_at = now() - interval '11 minutes'
   where id = v.application_id;
  select * into w from tests.antrag_eingang('je.adresse@example.org');
  return next is(w.application_id, v.application_id, 'Nach zehn Minuten geht die Mail noch einmal');
  return next isnt(w.token, v.token, 'mit neuem Link');
  return next is(public.membership_application_confirmation_state(v.token), 'expired',
    'Der alte Link gilt dann nicht mehr');

  -- Hoechstens fuenf Mails insgesamt.
  for i in 3..6 loop
    update public.membership_applications set confirmation_sent_at = now() - interval '11 minutes'
     where id = v.application_id;
    select count(*)::integer into v_zeilen from tests.antrag_eingang('je.adresse@example.org');
  end loop;
  return next is(v_zeilen, 0, 'Nach fuenf Mails kommt keine sechste');
  return next is(
    (select confirmation_mails::integer from public.membership_applications where id = v.application_id), 5,
    'Gezaehlt sind fuenf');

  -- Scheitert der Versand, nimmt die Function Frist und Zaehler zurueck.
  perform public.release_membership_application_mail(v.application_id);
  select count(*)::integer into v_zeilen from tests.antrag_eingang('je.adresse@example.org');
  return next is(v_zeilen, 1, 'Nach einem gescheiterten Versand geht die Mail sofort wieder');

  -- Nur die Function mit dem Dienstschluessel darf einreichen und freigeben.
  perform tests.act_as_anon();
  return next throws_ok(
    format('select public.release_membership_application_mail(%L)', v.application_id),
    '42501', null, 'anon kann keine Mail freigeben');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_s22_deckel_je_herkunft_zaehlt_unbestaetigte()
returns setof text language plpgsql as $f$
declare i integer;
begin
  delete from public.membership_applications;
  for i in 1..10 loop
    perform tests.antrag_eingang('herkunft' || i || '@example.org', '203.0.113.77');
  end loop;
  return next throws_ok(
    $q$select * from tests.antrag_eingang('herkunft11@example.org', '203.0.113.77')$q$,
    'P0003', null, 'Zehn unbestaetigte aus einer Herkunft, der elfte faellt durch');
end; $f$;

create or replace function tests.test_s22_fake_flut_blockiert_keinen_echten()
returns setof text language plpgsql as $f$
declare v record; i integer;
begin
  delete from public.membership_applications;

  -- Fuenfzig erfundene Antraege aus fuenfzig Herkuenften in einer Stunde.
  -- Bisher war nach zwanzig Schluss, fuer alle.
  for i in 1..50 loop
    perform tests.antrag_eingang('fake' || i || '@example.org', '198.51.100.' || i);
  end loop;

  return next lives_ok(
    $q$select * from tests.antrag_eingang('echt@example.org', '203.0.113.200')$q$,
    'Ein echter Antrag kommt trotzdem durch');
  select * into v from public.membership_applications where email = 'echt@example.org';
  return next isnt(v.id, null, 'Er ist angelegt');

  -- Der globale Deckel zaehlt nur Bestaetigtes: zwanzig echte in einer
  -- Stunde, dann ist Schluss.
  for i in 1..20 loop
    perform tests.antrag_stellen(tests.antrag_daten('confirmed' || i || '@example.org'),
                                 '192.0.2.' || i);
  end loop;
  return next throws_ok(
    $q$select * from tests.antrag_eingang('einundzwanzig@example.org', '192.0.2.99')$q$,
    'P0003', null, 'Nach zwanzig bestaetigten in einer Stunde greift der globale Deckel');
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql.
select extensions.plan(1);
select extensions.pass('Tests zur Bestaetigungsmail sind eingespielt');
select * from extensions.finish();
