-- ===========================================================================
-- Veranstaltungen: Anmeldung, Warteliste, Forderungen, Arbeitsdienst
--
-- Die wichtigsten Zusagen:
--
--   1. Mit der Anmeldung entsteht sofort die Forderung (Preis x Personen), und
--      sie zieht bis zum Anmeldeschluss mit. Die Warteliste kostet nichts.
--   2. Ab dem Anmeldeschluss steht sie fest: Abmelden kostet trotzdem, und
--      erst dann erscheint die Veranstaltung unter "Einzug vorbereiten".
--   3. Steckt sie in einem Einzug, aendert keine Korrektur sie mehr.
--   4. Mitglieder sehen nur Zahlen, keine Namen.
--   5. Stunden aus einem Arbeitsdienst werden genau einmal gutgeschrieben.
--
-- Fixtures aus 02_rls.sql (fixture_user, act_as) und 13_lastschrift.sql
-- (fixture_mandat).
-- ===========================================================================

/** Eine veroeffentlichte Veranstaltung mit Anmeldung, Beginn in p_tage Tagen. */
create or replace function tests.fixture_event(
  p_fee_cents integer default 1800,
  p_max integer default null,
  p_tage integer default 10,
  p_kind public.event_kind default 'fest',
  p_hours numeric default null
)
returns uuid language plpgsql as $f$
declare adm record; v_id uuid; v_start timestamptz := now() + make_interval(days => p_tage);
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  perform set_config('role', 'postgres', true);
  perform tests.act_as(adm.auth_id);
  v_id := public.event_speichern(
    null, p_kind, 'ZZTest Fest', 'Beschreibung', 'Clubhaus',
    v_start, v_start + interval '4 hours',
    true, v_start - interval '1 day', p_max, true, p_fee_cents, p_hours, true);
  perform set_config('role', 'postgres', true);
  return v_id;
end; $f$;

/** Den Anmeldeschluss in die Vergangenheit legen, ohne auf ihn zu warten. */
create or replace function tests.schluss_vorbei(p_event_id uuid)
returns void language sql as $f$
  update public.events set registration_deadline = now() - interval '1 minute' where id = p_event_id;
$f$;

create or replace function tests.event_forderung(p_event_id uuid, p_member_id uuid)
returns public.charges language sql stable as $f$
  select * from public.charges
   where event_id = p_event_id and member_id = p_member_id and status <> 'waived';
$f$;

create or replace function tests.test_event_anmeldung_erzeugt_forderung()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1800); a record; v_status text; c public.charges;
begin
  select * into a from tests.fixture_user() limit 1;

  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  v_status := public.event_anmelden(v_event, 2, 'vegetarisch');
  perform set_config('role', 'postgres', true);

  c := tests.event_forderung(v_event, a.member_id);
  return next is(v_status, 'registered', 'Mit freien Plaetzen ist man angemeldet');
  return next is(c.amount_cents, 5400, 'Forderung: 18 Euro mal drei Personen');
  return next is(c.kind::text, 'event', 'Art Veranstaltung');
  return next is(c.payer_id, a.member_id, 'Das Mitglied zahlt selbst');
  return next is(c.status::text, 'open', 'und sie steht offen im Konto');
  return next ok(c.description like 'ZZTest Fest am %(3 Personen)', 'Beschreibung mit Personenzahl');

  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  perform public.event_anmeldung_aendern(v_event, 0, null);
  perform set_config('role', 'postgres', true);
  return next is((tests.event_forderung(v_event, a.member_id)).amount_cents, 1800,
    'Weniger Begleitpersonen vor dem Schluss: die Forderung passt sich an');

  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format('select public.event_anmelden(%L::uuid)', v_event),
    '23505', null, 'Zweimal anmelden geht nicht');
  perform public.event_abmelden(v_event);
  perform set_config('role', 'postgres', true);
  return next is((tests.event_forderung(v_event, a.member_id)).id, null,
    'Abmelden vor dem Schluss loescht die Forderung');

  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  perform public.event_anmelden(v_event, 1);
  perform set_config('role', 'postgres', true);
  return next is((tests.event_forderung(v_event, a.member_id)).amount_cents, 3600,
    'Wieder angemeldet: neue Forderung');
end; $f$;

create or replace function tests.test_event_warteliste_rueckt_nach()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1000, 4); a record; b record; c record;
        v_b text; v_c text;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;

  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  perform public.event_anmelden(v_event, 3);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(b.auth_id);
  v_b := public.event_anmelden(v_event, 2);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(c.auth_id);
  v_c := public.event_anmelden(v_event, 0);
  perform set_config('role', 'postgres', true);

  return next is(v_b, 'waitlisted', 'Voll: B kommt auf die Warteliste');
  return next is(v_c, 'waitlisted', 'C ebenso');
  return next is((tests.event_forderung(v_event, b.member_id)).id, null,
    'Die Warteliste erzeugt keine Forderung');

  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format('select public.event_anmeldung_aendern(%L::uuid, 4)', v_event),
    '22023', null, 'Mehr Begleitpersonen als Plaetze frei sind gehen nicht');
  -- Zwei Plaetze werden frei: B (3 Personen) passt nicht, C (1 Person) schon.
  perform public.event_anmeldung_aendern(v_event, 1);
  perform set_config('role', 'postgres', true);

  return next is(
    (select status::text from public.event_registrations where event_id = v_event and member_id = c.member_id),
    'registered', 'Nachgerueckt ist, wer passt');
  return next is((tests.event_forderung(v_event, c.member_id)).amount_cents, 1000,
    'und hat jetzt seine Forderung');
  return next is(
    (select status::text from public.event_registrations where event_id = v_event and member_id = b.member_id),
    'waitlisted', 'Die grosse Gruppe wartet weiter');

  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  perform public.event_abmelden(v_event);
  perform set_config('role', 'postgres', true);
  return next is(
    (select status::text from public.event_registrations where event_id = v_event and member_id = b.member_id),
    'registered', 'Bei der Abmeldung rueckt B nach');
  return next is((tests.event_forderung(v_event, b.member_id)).amount_cents, 3000,
    'mit Forderung fuer drei Personen');
end; $f$;

create or replace function tests.test_event_nach_dem_schluss_fest()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1500); adm record; a record; b record;
        v_gruppe record; v_vorher integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;

  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  perform public.event_anmelden(v_event, 1);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(b.auth_id);
  perform public.event_anmelden(v_event, 0);

  perform set_config('role', 'postgres', true);
  perform tests.act_as(adm.auth_id);
  select count(*)::integer into v_vorher from public.einzug_gruppen() g where g.event_id = v_event;
  perform set_config('role', 'postgres', true);
  return next is(v_vorher, 0, 'Vor dem Schluss steht die Veranstaltung nicht im Einzug');

  perform tests.schluss_vorbei(v_event);

  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format('select public.event_anmeldung_aendern(%L::uuid, 0)', v_event),
    '22023', null, 'Nach dem Schluss aendert das Mitglied nichts mehr');
  perform public.event_abmelden(v_event);
  perform set_config('role', 'postgres', true);
  return next is((tests.event_forderung(v_event, a.member_id)).amount_cents, 3000,
    'Abmelden nach dem Schluss: die Forderung bleibt');

  perform set_config('role', 'postgres', true);
  perform tests.act_as(b.auth_id);
  return next throws_ok(
    format('select public.event_anmelden(%L::uuid)', gen_random_uuid()),
    'P0002', null, 'Eine unbekannte Veranstaltung gibt es nicht');
  perform set_config('role', 'postgres', true);

  perform set_config('role', 'postgres', true);
  perform tests.act_as(adm.auth_id);
  select * into v_gruppe from public.einzug_gruppen() g where g.event_id = v_event;
  return next throws_ok(
    format($q$select public.event_speichern(%L::uuid, 'fest', 'ZZTest Fest', null, null,
             now() + interval '10 days', null, true, null, null, true, 2000, null)$q$, v_event),
    '22023', null, 'Nach dem Schluss ist die Gebuehr fest');
  perform set_config('role', 'postgres', true);

  return next is(v_gruppe.anzahl, 2, 'Danach stehen beide Forderungen unter Einzug vorbereiten');
  return next is(v_gruppe.summe_cents, 4500, 'mit der Summe');
  return next is(v_gruppe.titel, 'ZZTest Fest', 'als Gruppe mit dem Titel der Veranstaltung');
end; $f$;

create or replace function tests.test_event_im_einzug_gesperrt()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(2000); adm record; a record; v_reg uuid; r record;
        v_tag date := (now() at time zone 'Europe/Berlin')::date
                      + public.setting_int('sepa.prenotification_days') + 1;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(a.member_id);

  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  perform public.event_anmelden(v_event, 0);
  perform set_config('role', 'postgres', true);
  select id into v_reg from public.event_registrations where event_id = v_event and member_id = a.member_id;
  perform tests.schluss_vorbei(v_event);

  perform set_config('role', 'postgres', true);
  perform tests.act_as(adm.auth_id);
  -- Der Vorstand darf nach dem Schluss korrigieren, solange nichts eingezogen wird.
  perform public.event_admin_aendern(v_reg, 1, null);
  perform set_config('role', 'postgres', true);
  return next is((tests.event_forderung(v_event, a.member_id)).amount_cents, 4000,
    'Admin-Korrektur nach dem Schluss aendert die Forderung');

  perform set_config('role', 'postgres', true);
  perform tests.act_as(adm.auth_id);
  select * into r from public.einzug_vorbereiten(
    v_tag,
    jsonb_build_array(jsonb_build_object('kind', 'event', 'period', null, 'returned', false, 'event', v_event)),
    'ZZTest Fest');
  return next is(r.summe_cents, 4000, 'Die Gruppe geht in den Einzug');
  return next throws_ok(
    format('select public.event_admin_aendern(%L::uuid, 0)', v_reg),
    '22023', null, 'Im Einzug laesst sich die Forderung nicht mehr aendern');
  return next throws_ok(
    format('select public.event_admin_abmelden(%L::uuid)', v_reg),
    '22023', null, 'und auch nicht durch Abmelden loeschen');
  perform set_config('role', 'postgres', true);
  return next is((tests.event_forderung(v_event, a.member_id)).amount_cents, 4000,
    'Die Forderung ist unveraendert');
end; $f$;

create or replace function tests.test_event_gebuehr_und_absage()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1000); adm record; a record; e public.events; r record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  perform public.event_anmelden(v_event, 1);
  perform set_config('role', 'postgres', true);
  select * into e from public.events where id = v_event;

  perform set_config('role', 'postgres', true);
  perform tests.act_as(adm.auth_id);
  perform public.event_speichern(v_event, e.kind, 'ZZTest Sommerfest', e.description, e.location,
    e.starts_at, e.ends_at, true, e.registration_deadline, e.max_participants, true, 1250, null);
  perform set_config('role', 'postgres', true);
  return next is((tests.event_forderung(v_event, a.member_id)).amount_cents, 2500,
    'Neue Gebuehr vor dem Schluss: die Forderung zieht mit');
  return next ok((tests.event_forderung(v_event, a.member_id)).description like 'ZZTest Sommerfest%',
    'ebenso der neue Titel');

  perform set_config('role', 'postgres', true);
  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format($q$select public.event_speichern(%L::uuid, 'fest', 'x', null, null, %L::timestamptz,
             null, true, null, 1, false, 1250, null)$q$, v_event, e.starts_at),
    '22023', null, 'Weniger Plaetze als Angemeldete gehen nicht');
  select * into r from public.event_absagen(v_event);
  perform set_config('role', 'postgres', true);
  return next is(r.geloescht, 1, 'Die Absage loescht die offene Forderung');
  return next is((tests.event_forderung(v_event, a.member_id)).id, null, 'Sie ist weg');
  return next is((select status::text from public.events where id = v_event), 'cancelled', 'Abgesagt');

  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format('select public.event_anmelden(%L::uuid)', v_event),
    '22023', null, 'Zu einer abgesagten Veranstaltung meldet sich niemand an');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_event_sichtbarkeit_und_rechte()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(0, 10); adm record; a record; b record; v_entwurf uuid;
        v_personen integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;

  perform set_config('role', 'postgres', true);
  perform tests.act_as(adm.auth_id);
  v_entwurf := public.event_speichern(null, 'termin', 'ZZTest Entwurf', null, null,
    now() + interval '5 days', null, false, null, null, false, null, null);

  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  perform public.event_anmelden(v_event, 2);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(b.auth_id);
  return next is(
    (select count(*)::integer from public.event_registrations where event_id = v_event), 0,
    'B sieht die Anmeldung von A nicht');
  select f.personen into v_personen from public.events_fuer_mitglied() f where f.id = v_event;
  return next is(v_personen, 3, 'aber die Zahl der Personen');
  return next is(
    (select count(*)::integer from public.events where id = v_entwurf), 0,
    'Entwuerfe sehen Mitglieder nicht');
  perform set_config('role', 'postgres', true);
  perform tests.act_as(adm.auth_id);
  return next is(
    (select count(*)::integer from public.event_teilnehmer(v_event)), 1,
    'Der Vorstand sieht die Teilnehmer');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_event_rechte_nur_admin()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(0); a record;
begin
  select * into a from tests.fixture_user() limit 1;
  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  return next throws_ok(
    $q$select public.event_speichern(null, 'fest', 'x', null, null, now(), null, false,
       null, null, false, null, null)$q$,
    '42501', null, 'Mitglieder legen keine Veranstaltungen an');
  return next throws_ok(
    format('select * from public.event_teilnehmer(%L::uuid)', v_event),
    '42501', null, 'und sehen keine Teilnehmerliste');
  return next throws_ok(
    format('select * from public.event_absagen(%L::uuid)', v_event),
    '42501', null, 'und sagen nichts ab');
  return next throws_ok(
    format($q$insert into public.event_registrations (event_id, member_id) values (%L, %L)$q$,
           v_event, a.member_id),
    '42501', null, 'Direkt schreiben geht nicht');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_event_arbeitsdienst_stunden()
returns setof text language plpgsql as $f$
declare adm record; a record; b record; v_event uuid; v_ra uuid; v_rb uuid; r record; r2 record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;

  perform set_config('role', 'postgres', true);
  perform tests.act_as(adm.auth_id);
  v_event := public.event_speichern(null, 'arbeitsdienst', 'ZZTest Plaetze winterfest', null, 'Anlage',
    now() - interval '1 day', now() - interval '20 hours', true, null, null, false, null, 3, true);
  v_ra := public.event_admin_anmelden(v_event, a.member_id);
  v_rb := public.event_admin_anmelden(v_event, b.member_id);
  perform public.event_anwesenheit_setzen(v_ra, true);
  select * into r from public.event_stunden_gutschreiben(v_event);
  select * into r2 from public.event_stunden_gutschreiben(v_event);
  perform set_config('role', 'postgres', true);

  return next is(r.gutgeschrieben, 1, 'Nur die Anwesende bekommt Stunden');
  return next is(r2.gutgeschrieben, 0, 'Ein zweiter Klick schreibt nichts doppelt gut');
  return next is(
    (select hours from public.work_duty_entries where event_id = v_event and member_id = a.member_id),
    3.00::numeric, 'mit den Stunden je Teilnahme');
  return next ok(
    (select confirmed_at is not null from public.work_duty_entries
      where event_id = v_event and member_id = a.member_id),
    'bestaetigt');
  return next is(
    (select count(*)::integer from public.work_duty_entries where event_id = v_event and member_id = b.member_id),
    0, 'B war nicht da');

  perform set_config('role', 'postgres', true);
  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select public.event_anwesenheit_setzen(%L::uuid, false)', v_ra),
    '22023', null, 'Nach der Gutschrift laesst sich der Haken nicht mehr entfernen');
  perform set_config('role', 'postgres', true);
end; $f$;

select extensions.plan(1);
select extensions.pass('Tests fuer Veranstaltungen sind eingespielt');
