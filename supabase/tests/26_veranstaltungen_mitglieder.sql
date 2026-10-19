-- ===========================================================================
-- Veranstaltungen fuer Mitglieder: der eigene Platz auf der Warteliste
--
-- Wer wartet, erfaehrt seinen Platz in der Reihenfolge des Nachrueckens; wer
-- angemeldet ist oder gar nicht, bekommt null. Fixtures aus 02_rls.sql und
-- 25_veranstaltungen.sql (fixture_event).
-- ===========================================================================

create or replace function tests.test_event_mein_wartelistenplatz()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1800, 1); a record; b record; c record; d record;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  select * into d from tests.fixture_user() limit 1;

  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  perform public.event_anmelden(v_event, 0, null);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(b.auth_id);
  perform public.event_anmelden(v_event, 0, null);
  perform set_config('role', 'postgres', true);
  -- Gleiche Uhrzeit innerhalb der Transaktion: die Reihenfolge haengt dann an
  -- registered_at, das hier ausdruecklich spaeter liegt.
  update public.event_registrations set waitlisted_at = now() - interval '2 minutes'
   where event_id = v_event and member_id = b.member_id;
  perform tests.act_as(c.auth_id);
  perform public.event_anmelden(v_event, 0, null);
  perform set_config('role', 'postgres', true);
  update public.event_registrations set waitlisted_at = now() - interval '1 minute'
   where event_id = v_event and member_id = c.member_id;

  perform tests.act_as(a.auth_id);
  return next is(public.event_mein_wartelistenplatz(v_event), null, 'Angemeldet: kein Wartelistenplatz');
  perform set_config('role', 'postgres', true);
  perform tests.act_as(b.auth_id);
  return next is(public.event_mein_wartelistenplatz(v_event), 1, 'Wer zuerst wartet, hat Platz 1');
  perform set_config('role', 'postgres', true);
  perform tests.act_as(c.auth_id);
  return next is(public.event_mein_wartelistenplatz(v_event), 2, 'Der Naechste hat Platz 2');
  perform set_config('role', 'postgres', true);
  perform tests.act_as(d.auth_id);
  return next is(public.event_mein_wartelistenplatz(v_event), null, 'Nicht angemeldet: null');

  -- Rueckt b nach, ist c vorne.
  perform set_config('role', 'postgres', true);
  perform tests.act_as(a.auth_id);
  perform public.event_abmelden(v_event);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(c.auth_id);
  return next is(public.event_mein_wartelistenplatz(v_event), 1, 'Nach dem Nachruecken rueckt man vor');
  perform set_config('role', 'postgres', true);
end; $f$;

select extensions.plan(1);
select extensions.pass('Tests fuer Veranstaltungen (Mitglieder) sind eingespielt');
