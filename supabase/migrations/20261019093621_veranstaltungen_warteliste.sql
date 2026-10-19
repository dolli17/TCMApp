-- ===========================================================================
-- Veranstaltungen, Schritt 2: der eigene Platz auf der Warteliste
--
-- Mitglieder sehen von der Warteliste nur die Laenge (events_fuer_mitglied).
-- Wer selbst wartet, soll seinen Platz kennen ("Platz 2 von 3"), ohne dass
-- Namen oder fremde Anmeldungen sichtbar werden. Die Reihenfolge ist dieselbe,
-- in der private.event_nachruecken nachholt.
--
-- Nur neu, nichts geaendert: abwaertskompatibel.
-- ===========================================================================

/** Der eigene Platz auf der Warteliste (ab 1), null wenn man nicht wartet. */
create or replace function public.event_mein_wartelistenplatz(p_event_id uuid)
returns integer
language sql stable security definer set search_path = '' as $$
  select (
    select count(*)::integer from public.event_registrations w
     where w.event_id = mine.event_id and w.status = 'waitlisted'
       and (w.waitlisted_at, w.registered_at) <= (mine.waitlisted_at, mine.registered_at)
  )
  from public.event_registrations mine
  where private.is_member()
    and mine.event_id = p_event_id
    and mine.member_id = private.current_member_id()
    and mine.status = 'waitlisted';
$$;

revoke execute on function public.event_mein_wartelistenplatz(uuid) from public, anon;
grant  execute on function public.event_mein_wartelistenplatz(uuid) to authenticated;
