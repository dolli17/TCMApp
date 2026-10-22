-- ===========================================================================
-- Haertung Welle 5: Datum, Erinnerung, Rechtstexte, Reaktivieren, Admins
-- (B15, B16, B17, S18a, S23, B26)
--
--   1. B15: current_drink_price nimmt das Berliner Datum, nicht das der
--      Sitzungszeitzone. Getestet mit zwei Zeitzonen weit weg von Berlin:
--      eine davon liegt zu jeder Uhrzeit auf einem anderen Tag.
--   2. B16: Keine Funktion, kein Standardwert und keine Pruefung nimmt
--      current_date als "heute".
--   3. B17: Wird der Anmeldeschluss nach hinten verschoben, wird erneut
--      erinnert. Nach vorne verschoben nicht.
--   4. S18a: Die letzte Person mit vollen Rechten zaehlt nur, wenn sie sie
--      auch ausueben kann: Login, nicht gesperrt, Zugang (wie is_admin).
--   5. S23: Der Text einer Fassung, der jemand zugestimmt hat, bleibt.
--   6. B26: reactivate_member holt ein archiviertes Mitglied zurueck, ohne
--      Zugang und mit offenem Onboarding.
--
-- Fixtures aus 02_rls.sql (fixture_user, act_as), 10_getraenkekarte.sql
-- (fixture_getraenk), 25_veranstaltungen.sql (fixture_event).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- B15: Preis nach Berliner Datum
-- ---------------------------------------------------------------------------

create or replace function tests.test_getraenkepreis_berliner_datum()
returns setof text language plpgsql as $f$
declare v_item uuid := tests.fixture_getraenk('ZZ Datumstest', 100); v_tz text;
begin
  insert into public.drink_prices (drink_item_id, valid_from, price_cents) values
    (v_item, private.heute(), 200),
    (v_item, private.heute() + 1, 300)
  on conflict (drink_item_id, valid_from) do update set price_cents = excluded.price_cents;

  -- UTC+14 ist ab Berliner Mittag schon morgen, UTC-12 bis Berliner 14 Uhr
  -- noch gestern. Zusammen fallen sie zu jeder Uhrzeit auf.
  foreach v_tz in array array['Etc/GMT-14', 'Etc/GMT+12'] loop
    perform set_config('timezone', v_tz, true);
    return next is(private.current_drink_price(v_item), 200,
      'Es gilt der Preis ab dem Berliner Heute (' || v_tz || ')');
  end loop;
  perform set_config('timezone', 'UTC', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- B16: heute heisst Berlin
-- ---------------------------------------------------------------------------

create or replace function tests.test_kein_current_date_als_heute()
returns setof text language plpgsql as $f$
begin
  return next is(
    (select array_agg(p.oid::regprocedure::text order by 1)
       from pg_proc p
      where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
        and (p.prosrc ~* '\mcurrent_date\M|\mnow\(\)\s*::\s*date|\mlocaltimestamp\M'
             or pg_get_expr(p.proargdefaults, 0) ~* '\mcurrent_date\M')),
    null, 'Keine Funktion nimmt current_date');
  return next is(
    (select array_agg(c.relname || '.' || a.attname order by 1)
       from pg_attrdef d
       join pg_class c on c.oid = d.adrelid
       join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
      where c.relnamespace in ('public'::regnamespace, 'private'::regnamespace)
        and pg_get_expr(d.adbin, d.adrelid) ~* '\mcurrent_date\M'),
    null, 'Kein Standardwert');
  return next is(
    (select array_agg(conname::text order by 1)
       from pg_constraint
      where connamespace in ('public'::regnamespace, 'private'::regnamespace)
        and pg_get_constraintdef(oid) ~* '\mcurrent_date\M'),
    null, 'Keine Pruefung');
end; $f$;

-- ---------------------------------------------------------------------------
-- B17: Schluss verschoben, neue Erinnerung
-- ---------------------------------------------------------------------------

create or replace function tests.test_event_erinnerung_nach_verschieben()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1800); v_schluss timestamptz; frei record;
begin
  select * into frei from tests.fixture_user() limit 1;
  select private.event_schluss(e) into v_schluss from public.events e where e.id = v_event;

  perform private.event_erinnerungen(v_schluss - interval '47 hours');
  return next ok((select reminder_sent_at is not null from public.events where id = v_event),
    'Erinnert');

  update public.events set registration_deadline = v_schluss - interval '1 hour' where id = v_event;
  return next ok((select reminder_sent_at is not null from public.events where id = v_event),
    'Schluss nach vorne: bleibt erinnert');

  update public.events set title = 'ZZTest Fest neu' where id = v_event;
  return next ok((select reminder_sent_at is not null from public.events where id = v_event),
    'Andere Aenderung: bleibt erinnert');

  update public.events set registration_deadline = v_schluss + interval '12 hours' where id = v_event;
  return next ok((select reminder_sent_at is null from public.events where id = v_event),
    'Schluss nach hinten: wieder offen');

  perform private.event_erinnerungen(v_schluss + interval '12 hours' - interval '47 hours');
  return next is((select count(*)::integer from tests.event_nachrichten(v_event, frei.member_id, 'event_reminder')), 2,
    'und es kommt eine zweite Erinnerung');

  -- Ohne eigenen Schluss gilt der Beginn.
  update public.events set registration_deadline = null where id = v_event;
  update public.events set reminder_sent_at = now() where id = v_event;
  update public.events set starts_at = starts_at + interval '1 week',
                           ends_at = ends_at + interval '1 week' where id = v_event;
  return next ok((select reminder_sent_at is null from public.events where id = v_event),
    'Beginn spaeter ohne eigenen Schluss: wieder offen');
end; $f$;

-- ---------------------------------------------------------------------------
-- S18a: nur wer die Rechte ausueben kann, zaehlt
-- ---------------------------------------------------------------------------

create or replace function tests.test_letzter_admin_zaehlt_nur_mit_zugang()
returns setof text language plpgsql as $f$
declare v record; gesperrt record; ohne record; aus record; ok record;
begin
  select * into v        from tests.fixture_user('board', 'Vorstand') limit 1;
  select * into gesperrt from tests.fixture_user('admin', 'Gesperrt') limit 1;
  select * into ohne     from tests.fixture_user('admin', 'Ohne') limit 1;
  select * into aus      from tests.fixture_user('admin', 'Ausgeschieden') limit 1;
  delete from public.member_roles
   where role in ('admin', 'board')
     and member_id not in (v.member_id, gesperrt.member_id, ohne.member_id, aus.member_id);

  perform set_config('request.jwt.claims', null, true);
  update public.members set login_disabled_at = now() where id = gesperrt.member_id;
  -- Ohne Login gibt es nur im Archiv, und dort nimmt der Trigger die Rolle.
  -- Hier steht sie trotzdem, etwa aus Altbestand.
  update public.members set auth_user_id = null, status = 'archived' where id = ohne.member_id;
  insert into public.member_roles (member_id, role) values (ohne.member_id, 'admin');
  -- Inaktiv und die Mitgliedschaft ist vorbei: kein Zugang.
  update public.members set status = 'inactive' where id = aus.member_id;

  perform tests.act_as(v.auth_id);
  return next throws_ok(
    format($q$select public.set_member_role(%L, 'board', false)$q$, v.member_id),
    '23514', null, 'Der letzte Vorstand mit Zugang bleibt');
  perform set_config('role', 'postgres', true);

  return next is(private.aktive_admins_ohne(v.member_id), 0,
    'Gesperrt, ohne Login, ausgeschieden: niemand zaehlt');
  return next is(private.aktive_admins_ohne(null), 1, 'nur der Vorstand selbst');

  select * into ok from tests.fixture_user('admin', 'Neu') limit 1;
  return next is(private.aktive_admins_ohne(v.member_id), 1, 'Ein Admin mit Zugang zaehlt');
  perform tests.act_as(v.auth_id);
  return next lives_ok(
    format($q$select public.set_member_role(%L, 'board', false)$q$, v.member_id),
    'dann darf der Vorstand gehen');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- S23: zugestimmte Fassungen bleiben
-- ---------------------------------------------------------------------------

create or replace function tests.test_rechtstext_mit_zustimmung_unveraenderlich()
returns setof text language plpgsql as $f$
declare m record; adm record;
begin
  select * into m   from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin', 'Admin') limit 1;
  insert into public.legal_documents (code, version, title, body_md, active) values
    ('satzung', 90, 'Satzung alt', 'Alter Text', false),
    ('satzung', 91, 'Satzung Entwurf', 'Entwurf', false);
  insert into public.member_consents (member_id, document_code, version)
  values (m.member_id, 'satzung', 90);

  return next throws_ok(
    $q$update public.legal_documents set body_md = 'Neuer Text' where code = 'satzung' and version = 90$q$,
    '23514', null, 'Text einer zugestimmten Fassung bleibt');
  return next throws_ok(
    $q$update public.legal_documents set title = 'Satzung neu' where code = 'satzung' and version = 90$q$,
    '23514', null, 'Titel auch');

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    $q$update public.legal_documents set body_md = 'Neuer Text' where code = 'satzung' and version = 90$q$,
    '23514', null, 'auch fuer Admins');
  return next lives_ok(
    $q$update public.legal_documents set valid_from = valid_from where code = 'satzung' and version = 90$q$,
    'Anderes darf sich aendern');
  return next lives_ok(
    $q$update public.legal_documents set body_md = 'Entwurf 2', title = 'Satzung' where code = 'satzung' and version = 91$q$,
    'Ohne Zustimmung bleibt der Text bearbeitbar');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- B26: Reaktivieren
-- ---------------------------------------------------------------------------

create or replace function tests.test_reaktivieren()
returns setof text language plpgsql as $f$
declare adm record; m record; x record; a record; v_m public.members;
begin
  select * into adm from tests.fixture_user('admin', 'Admin') limit 1;
  select * into m   from tests.fixture_user('groundskeeper', 'Zurueck') limit 1;
  select * into x   from tests.fixture_user(null, 'Fremd') limit 1;
  select * into a   from tests.fixture_user(null, 'Anonym') limit 1;
  perform set_config('request.jwt.claims', null, true);
  update public.members set onboarding_completed_at = now(), onboarding_stammdaten_at = now()
   where id = m.member_id;

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select public.reactivate_member(%L)', m.member_id),
    '23514', null, 'Nur Archivierte');
  perform public.archive_member(m.member_id, true, 'Austritt');
  perform public.anonymize_member(a.member_id, null);
  perform set_config('role', 'postgres', true);

  perform tests.act_as(x.auth_id);
  return next throws_ok(
    format('select public.reactivate_member(%L)', m.member_id),
    '42501', null, 'Nur Admins');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select public.reactivate_member(%L)', a.member_id),
    '23514', null, 'Anonymisierte nicht');
  return next lives_ok(
    format('select public.reactivate_member(%L)', m.member_id), 'Archiviertes Mitglied zurueckholen');
  perform set_config('role', 'postgres', true);

  select * into v_m from public.members where id = m.member_id;
  return next is(v_m.status, 'active'::public.member_status, 'wieder aktiv');
  return next ok(v_m.login_disabled_at is not null and not private.hat_zugang(v_m),
    'aber ohne Zugang: der Admin laedt neu ein');
  return next ok(v_m.onboarding_completed_at is null and v_m.onboarding_stammdaten_at is null,
    'und das Onboarding mit den Stammdaten ist wieder offen');
  return next is((select array_agg(role::text) from public.member_roles where member_id = m.member_id),
    array['member'], 'Rollen kommen nicht zurueck');

  perform tests.act_as(adm.auth_id);
  return next lives_ok(
    format('select public.reactivate_membership(%L)', m.member_id),
    'Danach geht der Wiedereintritt');
  perform set_config('role', 'postgres', true);
end; $f$;

select plan(1);
select pass('Haertung Welle 5: Testfunktionen definiert');
