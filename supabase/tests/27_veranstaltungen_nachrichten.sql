-- ===========================================================================
-- Veranstaltungen: Benachrichtigungen
--
--   1. Veroeffentlicht: alle aktiven Mitglieder, genau einmal, nicht der
--      Vorstand selbst.
--   2. Nachgerueckt: das Mitglied, mit dem Betrag der Forderung.
--   3. Abgesagt: Angemeldete und Wartende, nicht wer abgemeldet ist.
--   4. Verlegt: nur bei echter Aenderung von Tag, Zeit oder Ort - erneutes
--      Speichern loest nichts aus.
--   Jede Nachricht traegt event_id, my_notifications liefert sie mit.
--
-- Fixtures aus 02_rls.sql und 25_veranstaltungen.sql (fixture_event).
-- ===========================================================================

create or replace function tests.event_nachrichten(p_event_id uuid, p_member_id uuid, p_kind text)
returns setof public.notifications language sql stable as $f$
  select * from public.notifications
   where event_id = p_event_id and member_id = p_member_id and kind = p_kind;
$f$;

/** Als Admin speichern, alles wie gehabt ausser Beginn und Ort. */
create or replace function tests.event_umspeichern(
  p_admin uuid, p_id uuid, p_location text, p_verschieben interval default '0'
)
returns void language plpgsql as $f$
declare e public.events;
begin
  select * into e from public.events where id = p_id;
  perform set_config('role', 'postgres', true);
  perform tests.act_as(p_admin);
  perform public.event_speichern(
    e.id, e.kind, e.title, e.description, p_location,
    e.starts_at + p_verschieben, e.ends_at + p_verschieben,
    e.registration_enabled, e.registration_deadline, e.max_participants, e.companions_allowed,
    e.fee_cents, e.work_hours, false);
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_event_nachricht_veroeffentlicht()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1800); adm record; a record; v_n integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;

  perform set_config('role', 'postgres', true);
  perform tests.act_as(adm.auth_id);
  v_n := public.event_mitglieder_benachrichtigen(v_event);
  perform set_config('role', 'postgres', true);

  return next ok(v_n > 0, 'Es entstehen Nachrichten');
  return next is((select count(*)::integer from tests.event_nachrichten(v_event, a.member_id, 'event_published')), 1,
    'Jedes aktive Mitglied bekommt eine');
  return next is((select count(*)::integer from tests.event_nachrichten(v_event, adm.member_id, 'event_published')), 0,
    'Der Vorstand, der veroeffentlicht, nicht');
  return next ok((select title from tests.event_nachrichten(v_event, a.member_id, 'event_published')) = 'Neu im Verein: ZZTest Fest',
    'Titel nennt die Veranstaltung');
  return next ok((select body from tests.event_nachrichten(v_event, a.member_id, 'event_published')) like 'Fest am %Clubhaus. Anmeldung bis %',
    'Text mit Art, Tag, Ort und Anmeldeschluss');

  perform tests.act_as(adm.auth_id);
  return next is(public.event_mitglieder_benachrichtigen(v_event), 0, 'Ein zweites Mal: nichts');
  perform set_config('role', 'postgres', true);
  return next is((select count(*)::integer from tests.event_nachrichten(v_event, a.member_id, 'event_published')), 1,
    'und keine doppelte Nachricht');

  update public.members set status = 'inactive' where id = a.member_id;
  v_event := tests.fixture_event(0);
  perform tests.act_as(adm.auth_id);
  perform public.event_mitglieder_benachrichtigen(v_event);
  perform set_config('role', 'postgres', true);
  return next is((select count(*)::integer from tests.event_nachrichten(v_event, a.member_id, 'event_published')), 0,
    'Inaktive Mitglieder bekommen nichts');

  perform tests.act_as(a.auth_id);
  return next throws_ok(format('select public.event_mitglieder_benachrichtigen(%L)', v_event),
    '42501', null, 'Mitglieder duerfen nicht an alle schreiben');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_event_nachricht_entwurf_nicht()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(0); adm record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  update public.events set status = 'draft', published_at = null where id = v_event;
  perform set_config('role', 'postgres', true);
  perform tests.act_as(adm.auth_id);
  return next is(public.event_mitglieder_benachrichtigen(v_event), 0, 'Ein Entwurf meldet nichts');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_event_nachricht_nachgerueckt()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1800, 3); a record; b record; n public.notifications;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;

  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  perform public.event_anmelden(v_event, 2, null);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(b.auth_id);
  perform public.event_anmelden(v_event, 1, null);
  perform set_config('role', 'postgres', true);

  -- a meldet sich ab, b rueckt nach.
  perform tests.act_as(a.auth_id);
  perform public.event_abmelden(v_event);
  perform set_config('role', 'postgres', true);

  select * into n from tests.event_nachrichten(v_event, b.member_id, 'event_promoted');
  return next is(n.title, 'Du bist nachgerueckt', 'Das Mitglied erfaehrt es');
  return next ok(n.body like 'Fuer ZZTest Fest am % ist ein Platz frei geworden%', 'mit Veranstaltung und Tag');
  return next ok(n.body like '%Die Gebuehr von 36,00 Euro steht in deinem Konto.', 'und dem Betrag fuer zwei Personen');
  return next is((select amount_cents from public.charges where event_id = v_event and member_id = b.member_id
                   and status <> 'waived'), 3600, 'Betrag und Forderung stimmen ueberein');
  return next is(n.event_id, v_event, 'Die Nachricht verweist auf die Veranstaltung');
  return next is((select count(*)::integer from tests.event_nachrichten(v_event, a.member_id, 'event_promoted')), 0,
    'Wer sich abmeldet, bekommt nichts');
end; $f$;

create or replace function tests.test_event_nachricht_abgesagt()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1800, 1); adm record; a record; b record; c record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;

  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  perform public.event_anmelden(v_event, 0, null);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(b.auth_id);
  perform public.event_anmelden(v_event, 0, null); -- Warteliste
  perform set_config('role', 'postgres', true);
  perform tests.act_as(c.auth_id);
  perform public.event_anmelden(v_event, 0, null); -- Warteliste
  perform public.event_abmelden(v_event);
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  perform public.event_absagen(v_event);
  perform set_config('role', 'postgres', true);

  return next is((select body from tests.event_nachrichten(v_event, a.member_id, 'event_cancelled')),
    format('ZZTest Fest %s faellt aus. Die Gebuehr entfaellt.',
           (select private.event_wann(starts_at, ends_at, location) from public.events where id = v_event)),
    'Angemeldete: abgesagt, die Gebuehr entfaellt');
  return next is((select title from tests.event_nachrichten(v_event, b.member_id, 'event_cancelled')),
    'Abgesagt: ZZTest Fest', 'Wartende erfahren es auch');
  return next ok((select body from tests.event_nachrichten(v_event, b.member_id, 'event_cancelled')) not like '%Gebuehr%',
    'ohne Satz zur Gebuehr - sie hatten keine');
  return next is((select count(*)::integer from tests.event_nachrichten(v_event, c.member_id, 'event_cancelled')), 0,
    'Wer schon abgemeldet ist, nicht');
  return next is((select count(*)::integer from public.notifications
                   where event_id = v_event and kind = 'event_cancelled'), 2, 'Genau zwei Nachrichten');
end; $f$;

create or replace function tests.test_event_nachricht_verlegt()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(0); adm record; a record; n public.notifications;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  perform public.event_anmelden(v_event, 0, null);
  perform set_config('role', 'postgres', true);

  perform tests.event_umspeichern(adm.auth_id, v_event, 'Clubhaus');
  return next is((select count(*)::integer from tests.event_nachrichten(v_event, a.member_id, 'event_changed')), 0,
    'Unveraendert gespeichert: keine Nachricht');

  perform tests.event_umspeichern(adm.auth_id, v_event, 'Halle');
  select * into n from tests.event_nachrichten(v_event, a.member_id, 'event_changed');
  return next is(n.title, 'Geaendert: ZZTest Fest', 'Ort geaendert: Nachricht');
  return next ok(n.body like 'ZZTest Fest findet jetzt am %, Halle statt (bisher am %, Clubhaus).', 'mit neuem und altem Ort');

  perform tests.event_umspeichern(adm.auth_id, v_event, 'Halle');
  return next is((select count(*)::integer from tests.event_nachrichten(v_event, a.member_id, 'event_changed')), 1,
    'Noch einmal gespeichert: keine zweite');

  perform tests.event_umspeichern(adm.auth_id, v_event, 'Halle', interval '1 hour');
  return next is((select count(*)::integer from tests.event_nachrichten(v_event, a.member_id, 'event_changed')), 2,
    'Uhrzeit verschoben: neue Nachricht');

  perform tests.act_as(a.auth_id);
  return next is((select count(*)::integer from public.my_notifications(50) m where m.event_id = v_event), 2,
    'my_notifications liefert den Verweis mit');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_event_nachrichten_arten_eingestellt()
returns setof text language plpgsql as $f$
begin
  return next ok('event_promoted' = any (private.notification_mail_kinds())
             and 'event_cancelled' = any (private.notification_mail_kinds())
             and 'event_changed' = any (private.notification_mail_kinds()), 'Wichtiges geht per Mail');
  return next ok(not ('event_published' = any (private.notification_mail_kinds())),
    '"Neu im Verein" nicht an alle per Mail');
  return next ok('event_published' = any (private.notification_push_kinds())
             and 'event_promoted' = any (private.notification_push_kinds()), 'Alles geht als Push');
end; $f$;

select extensions.plan(1);
select extensions.pass('Tests fuer Veranstaltungs-Nachrichten sind eingespielt');
