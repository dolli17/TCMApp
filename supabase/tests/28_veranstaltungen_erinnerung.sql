-- ===========================================================================
-- Veranstaltungen: Erinnerung vor dem Anmeldeschluss
--
--   - Erst zwei Tage vor dem Schluss, nicht frueher und nicht danach.
--   - An aktive Mitglieder ohne Anmeldung; nicht an Angemeldete, Wartende,
--     Abgemeldete oder wer gerade "Neu im Verein" bekommen hat.
--   - Genau einmal je Veranstaltung: wer spaeter dazukommt, bekommt keine.
--   - Nicht fuer Entwuerfe, Abgesagtes oder Veranstaltungen ohne Anmeldung.
--   - Der Zeitgeber steht als pg_cron-Job.
--
-- private.event_erinnerungen nimmt den Zeitpunkt als Parameter, damit die
-- Tests nicht auf den Kalender warten. fixture_event legt den Schluss neun
-- Tage in die Zukunft.
-- Fixtures aus 02_rls.sql, 25_veranstaltungen.sql und 27_….
-- ===========================================================================

create or replace function tests.test_event_erinnerung_empfaenger()
returns setof text language plpgsql as $f$
declare
  v_event uuid := tests.fixture_event(1800, 1);
  v_schluss timestamptz;
  frei record; dabei record; wartet record; weg record; still record; neu record;
begin
  select private.event_schluss(e) into v_schluss from public.events e where e.id = v_event;
  select * into frei   from tests.fixture_user() limit 1;
  select * into dabei  from tests.fixture_user() limit 1;
  select * into wartet from tests.fixture_user() limit 1;
  select * into weg    from tests.fixture_user() limit 1;
  select * into still  from tests.fixture_user() limit 1;
  update public.members set status = 'inactive' where id = still.member_id;

  perform set_config('role', 'postgres', true);
  perform tests.act_as(dabei.auth_id);
  perform public.event_anmelden(v_event, 0, null);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(wartet.auth_id);
  perform public.event_anmelden(v_event, 0, null);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(weg.auth_id);
  perform public.event_anmelden(v_event, 0, null);
  perform public.event_abmelden(v_event);
  perform set_config('role', 'postgres', true);

  perform private.event_erinnerungen(v_schluss - interval '3 days');
  return next is((select count(*)::integer from tests.event_nachrichten(v_event, frei.member_id, 'event_reminder')), 0,
    'Drei Tage vorher: noch nichts');
  return next ok((select reminder_sent_at is null from public.events where id = v_event),
    'und die Veranstaltung gilt nicht als erinnert');

  perform private.event_erinnerungen(v_schluss - interval '47 hours');
  return next is((select count(*)::integer from tests.event_nachrichten(v_event, frei.member_id, 'event_reminder')), 1,
    'Zwei Tage vorher: wer nicht angemeldet ist, bekommt eine');
  return next ok((select title from tests.event_nachrichten(v_event, frei.member_id, 'event_reminder'))
                   = 'Anmeldeschluss naht: ZZTest Fest', 'Titel nennt die Veranstaltung');
  return next ok((select body from tests.event_nachrichten(v_event, frei.member_id, 'event_reminder'))
                   like 'ZZTest Fest am %Clubhaus. Anmeldung noch bis %Uhr. Gerade ausgebucht - %',
    'Text mit Tag, Ort, Schluss und dem Hinweis auf die Warteliste');
  return next is((select count(*)::integer from tests.event_nachrichten(v_event, dabei.member_id, 'event_reminder')), 0,
    'Angemeldete nicht');
  return next is((select count(*)::integer from tests.event_nachrichten(v_event, wartet.member_id, 'event_reminder')), 0,
    'Wartende nicht');
  return next is((select count(*)::integer from tests.event_nachrichten(v_event, weg.member_id, 'event_reminder')), 0,
    'Wer sich abgemeldet hat, nicht');
  return next is((select count(*)::integer from tests.event_nachrichten(v_event, still.member_id, 'event_reminder')), 0,
    'Inaktive nicht');
  return next ok((select reminder_sent_at is not null from public.events where id = v_event),
    'Die Veranstaltung gilt als erinnert');

  select * into neu from tests.fixture_user() limit 1;
  perform private.event_erinnerungen(v_schluss - interval '46 hours');
  perform private.event_erinnerungen(v_schluss - interval '2 hours');
  return next is((select count(*)::integer from tests.event_nachrichten(v_event, frei.member_id, 'event_reminder')), 1,
    'Weitere Laeufe: keine zweite Erinnerung');
  return next is((select count(*)::integer from tests.event_nachrichten(v_event, neu.member_id, 'event_reminder')), 0,
    'Wer erst danach dazukommt, bekommt keine');
end; $f$;

create or replace function tests.test_event_erinnerung_nicht()
returns setof text language plpgsql as $f$
declare
  v_entwurf uuid := tests.fixture_event(0);
  v_abgesagt uuid := tests.fixture_event(0);
  v_ohne uuid := tests.fixture_event(0);
  v_vorbei uuid := tests.fixture_event(0);
  v_frisch uuid := tests.fixture_event(0);
  v_schluss timestamptz;
  adm record; a record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select private.event_schluss(e) into v_schluss from public.events e where e.id = v_entwurf;

  update public.events set status = 'draft' where id = v_entwurf;
  update public.events set status = 'cancelled' where id = v_abgesagt;
  -- Ohne Anmeldung gilt der Beginn als Schluss; der liegt hier im Fenster.
  update public.events
     set registration_enabled = false, registration_deadline = null, max_participants = null,
         fee_cents = null, companions_allowed = false, starts_at = v_schluss
   where id = v_ohne;
  perform set_config('role', 'postgres', true);
  perform tests.act_as(adm.auth_id);
  perform public.event_mitglieder_benachrichtigen(v_frisch);
  perform set_config('role', 'postgres', true);
  -- Veroeffentlicht zwei Stunden vor dem simulierten Lauf.
  update public.notifications set created_at = v_schluss - interval '49 hours'
   where event_id = v_frisch and kind = 'event_published';

  -- Fuenf Minuten nach dem Schluss von v_vorbei - alle anderen liegen gleich.
  update public.events set registration_deadline = v_schluss - interval '2 days' where id = v_vorbei;
  perform private.event_erinnerungen(v_schluss - interval '47 hours' + interval '5 minutes');

  return next is((select count(*)::integer from tests.event_nachrichten(v_entwurf, a.member_id, 'event_reminder')), 0,
    'Entwurf: nichts');
  return next is((select count(*)::integer from tests.event_nachrichten(v_abgesagt, a.member_id, 'event_reminder')), 0,
    'Abgesagt: nichts');
  return next is((select count(*)::integer from tests.event_nachrichten(v_ohne, a.member_id, 'event_reminder')), 0,
    'Ohne Anmeldung: nichts');
  return next is((select count(*)::integer from tests.event_nachrichten(v_vorbei, a.member_id, 'event_reminder')), 0,
    'Schluss schon vorbei: nichts');
  return next is((select count(*)::integer from tests.event_nachrichten(v_frisch, a.member_id, 'event_reminder')), 0,
    'Gerade "Neu im Verein" bekommen: keine Erinnerung obendrauf');
end; $f$;

create or replace function tests.test_event_erinnerung_zeitgeber()
returns setof text language plpgsql as $f$
begin
  return next is(
    (select count(*)::integer from cron.job
      where jobname = 'veranstaltungs-erinnerungen'
        and schedule = '7 * * * *'
        and command = 'select private.event_erinnerungen()'
        and active),
    1, 'Der Zeitgeber laeuft stuendlich');
  return next ok('event_reminder' = any (private.notification_push_kinds()), 'Die Erinnerung geht als Push');
  return next ok(not ('event_reminder' = any (private.notification_mail_kinds())),
    'aber nicht an alle per Mail');
  return next ok(not has_function_privilege('authenticated', 'private.event_erinnerungen(timestamptz)', 'execute'),
    'Mitglieder koennen die Erinnerung nicht selbst ausloesen');
end; $f$;

select extensions.plan(1);
select extensions.pass('Tests fuer die Veranstaltungs-Erinnerung sind eingespielt');
