-- ===========================================================================
-- Korrektur: guard_member_self_update blockierte administrative Laeufe
--
-- Der Trigger soll verhindern, dass ein Mitglied sich selbst einem fremden
-- Zahler zuordnet oder seinen Status aendert. Er hat aber auch Seed, Import
-- und Wartungsskripte blockiert, weil dort kein Nutzer angemeldet ist und
-- is_board() folglich false liefert.
--
-- Ohne angemeldeten Nutzer laeuft die Aenderung nicht ueber die REST-API,
-- sondern serverseitig - dort greifen die Rechte der Datenbankrolle. anon und
-- authenticated koennen das nicht ausnutzen: anon hat auf members ueberhaupt
-- kein UPDATE-Recht, und wer angemeldet ist, hat eine auth.uid().
-- ===========================================================================

create or replace function public.guard_member_self_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Kein angemeldeter Nutzer: serverseitiger Lauf (Seed, Import, Cron).
  if (select auth.uid()) is null then
    return new;
  end if;

  if (select private.is_board()) then
    return new;
  end if;

  if new.status         is distinct from old.status
     or new.billing_payer_id is distinct from old.billing_payer_id
     or new.auth_user_id     is distinct from old.auth_user_id
     or new.email            is distinct from old.email
     or new.birthday         is distinct from old.birthday
     or new.ebusy_person_id  is distinct from old.ebusy_person_id
     or new.source           is distinct from old.source
     or new.notes            is distinct from old.notes
  then
    raise exception 'Dieses Feld kann nur der Vorstand aendern.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_member_self_update() from public, anon, authenticated;
