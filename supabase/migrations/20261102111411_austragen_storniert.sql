-- ===========================================================================
-- Austragen storniert die ganze Buchung
--
-- Entscheidung des Vereins (02.11.2026): Traegt sich ein Mitspieler aus,
-- wird die Buchung storniert. Das ersetzt die Regel aus dem Security-Audit
-- (20261029233448_security_audit_welle.sql, 3.2), nach der die Buchung bei
-- Unterbesetzung Mitspieler suchte.
--
-- - private.buchung_stornieren enthaelt, was cancel_booking nach seinen
--   Pruefungen tut: Status, Gastgebuehren erlassen, Benachrichtigungen.
--   cancel_booking und leave_booking nutzen sie beide; cancel_booking
--   verhaelt sich unveraendert.
-- - leave_booking prueft wie bisher (angemeldet, Buchung aktiv, nicht der
--   Bucher, eingetragen, vor Spielbeginn) und storniert dann. Bucher und
--   uebrige Mitspieler erfahren, wer sich ausgetragen hat, in einer einzigen
--   Nachricht (booking_cancelled). Der Austragende bekommt keine.
-- - Die Art player_left bleibt: archive_member nutzt sie weiter.
--
-- Abwaertskompatibel: Signaturen, Rueckgaben, Fehlertexte und Rechte bleiben
-- (create or replace). Alte Clients rufen leave_booking wie bisher auf.
-- ===========================================================================

/**
 * Storniert eine Buchung und benachrichtigt alle Beteiligten ausser p_by.
 * Die Pruefungen (wer darf, ob schon storniert) macht der Aufrufer, ebenso
 * den Text: er muss vor dem Storno gebildet werden, siehe cancel_booking.
 */
create or replace function private.buchung_stornieren(
  p_booking_id uuid, p_by uuid, p_reason text, p_text text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking from public.bookings where id = p_booking_id;

  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = p_by,
         cancellation_reason = p_reason, partner_wanted = false
   where id = p_booking_id;

  -- Vor Spielbeginn wird die Gastgebuehr erlassen, danach bleibt sie stehen.
  if lower(v_booking.slot) > now() then
    perform private.waive_guest_charges(p_booking_id);
  end if;

  -- Alle Betroffenen ausser dem, der storniert hat: der weiss es bereits.
  insert into public.notifications (member_id, kind, title, body)
  select distinct p.member_id, 'booking_cancelled', 'Eine Buchung wurde storniert', p_text
  from (
    select v_booking.member_id as member_id
    union
    select bp.member_id from public.booking_players bp
    where bp.booking_id = p_booking_id and bp.member_id is not null
  ) p
  where p.member_id is not null and p.member_id <> p_by;
end;
$$;

revoke execute on function private.buchung_stornieren(uuid, uuid, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- cancel_booking: dieselben Pruefungen und Texte, das Storno macht die Hilfe
-- ---------------------------------------------------------------------------

create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_text text;
begin
  if v_me is null then
    raise exception 'Nur Mitglieder können stornieren.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.status = 'cancelled' then return; end if;

  if v_booking.member_id is distinct from v_me and not private.darf_plaetze() then
    raise exception 'Du kannst nur deine eigenen Buchungen stornieren.'
      using errcode = 'insufficient_privilege';
  end if;
  -- Admins raeumen auch waehrend der Spielzeit auf, etwa bei Platzsperrung.
  if lower(v_booking.slot) <= now() and not private.darf_plaetze() then
    raise exception 'Die Spielzeit hat bereits begonnen.' using errcode = 'check_violation';
  end if;

  -- Der Text wird vor dem Storno gebildet: booking_label liest die Buchung,
  -- und die soll den Zeitpunkt nennen, nicht den Status.
  v_text := format('Die Buchung am %s wurde storniert.', private.booking_label(p_booking_id));
  if p_reason is not null and btrim(p_reason) <> '' then
    v_text := v_text || ' Grund: ' || btrim(p_reason);
  end if;

  perform private.buchung_stornieren(p_booking_id, v_me, p_reason, v_text);
end;
$$;

revoke execute on function public.cancel_booking(uuid, text) from public, anon;
grant  execute on function public.cancel_booking(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- leave_booking: wer sich austraegt, storniert die Buchung
-- ---------------------------------------------------------------------------

create or replace function public.leave_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_text text;
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;

  -- Gesperrt wie in join_booking (B6): wer gleichzeitig beitritt oder die
  -- Besetzung aendert, wartet, bis das Storno durch ist.
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.status <> 'active' then
    raise exception 'Diese Buchung ist storniert.' using errcode = 'check_violation';
  end if;
  if v_booking.member_id = v_me then
    raise exception 'Als Bucher kannst du dich nicht austragen. Storniere die Buchung stattdessen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.booking_players bp
                  where bp.booking_id = p_booking_id and bp.member_id = v_me) then
    raise exception 'Du bist bei dieser Buchung nicht als Mitspieler eingetragen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if lower(v_booking.slot) <= now() then
    raise exception 'Die Spielzeit hat bereits begonnen.' using errcode = 'check_violation';
  end if;

  -- Eine Nachricht statt zwei: wer sich ausgetragen hat und dass die Buchung
  -- deshalb storniert ist. Vor dem Storno gebildet, wie in cancel_booking.
  v_text := format('%s hat sich ausgetragen. Die Buchung am %s ist storniert.',
                   private.member_label(v_me), private.booking_label(p_booking_id));

  -- Noch nicht verschickte "Du bist eingetragen" zu dieser Buchung sind mit
  -- dem Storno hinfaellig; die Storno-Nachricht sagt alles Noetige. Noch nicht
  -- verschickt heisst wie beim Zusammenfassen: weder gemailt noch gepusht noch
  -- gelesen. Ein offenes "Du bist nicht mehr dabei" bleibt: es stimmt weiter.
  delete from public.notifications n
   where n.booking_id = p_booking_id
     and n.kind = 'booking_added'
     and n.mailed_at is null and n.pushed_at is null and n.read_at is null;

  -- Der Austragende bleibt in der Besetzung stehen, wie bei jedem Storno:
  -- so bleibt nachvollziehbar, wer dabei war. Benachrichtigt wird er nicht.
  perform private.buchung_stornieren(
    p_booking_id, v_me,
    format('%s hat sich ausgetragen.', private.member_label(v_me)),
    v_text);
end;
$$;

revoke execute on function public.leave_booking(uuid) from public, anon;
grant  execute on function public.leave_booking(uuid) to authenticated;
