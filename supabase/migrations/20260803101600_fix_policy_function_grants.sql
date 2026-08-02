-- ===========================================================================
-- Korrektur: Policy-Funktionen brauchen EXECUTE fuer authenticated
--
-- Gefunden durch die RLS-Testsuite. Vorher war EXECUTE auf allen Funktionen im
-- Schema private entzogen. RLS-Policies werden aber mit den Rechten des
-- aufrufenden Nutzers ausgewertet - eine Policy, die private.can_view_member()
-- aufruft, scheitert dann mit "permission denied for function". Betroffen war
-- damit jede Leseabfrage jedes angemeldeten Mitglieds: die App waere
-- vollstaendig unbenutzbar gewesen.
--
-- Freigegeben wird nur, was tatsaechlich in Policies vorkommt. Alle diese
-- Funktionen leiten die Identitaet intern aus auth.uid() ab und geben
-- ausschliesslich Auskunft ueber den Aufrufer selbst - ein Mitglied kann damit
-- hoechstens herausfinden, ob eine ihm bereits bekannte Id zu ihm gehoert.
--
-- Gesperrt bleiben die Funktionen, die echte Daten herausgeben oder Zustand
-- veraendern: decrypt_iban und encrypt_iban (Bankdaten), open_booking_count
-- (fremde Buchungsstaende), record_purchase, current_drink_price und
-- series_occurrences. Sie werden ausschliesslich aus SECURITY-DEFINER-RPCs
-- gerufen, die mit Eigentuemerrechten laufen und deshalb kein Grant brauchen.
-- ===========================================================================

grant execute on function private.current_member_id()              to authenticated;
grant execute on function private.is_member()                      to authenticated;
grant execute on function private.is_board()                       to authenticated;
grant execute on function private.is_treasurer()                   to authenticated;
grant execute on function private.is_sports_officer()              to authenticated;
grant execute on function private.is_trainer()                     to authenticated;
grant execute on function private.is_bar_duty()                    to authenticated;
grant execute on function private.is_kiosk()                       to authenticated;
grant execute on function private.can_view_member(uuid)            to authenticated;
grant execute on function private.has_role(public.app_role)        to authenticated;
grant execute on function private.has_any_role(public.app_role[])  to authenticated;

-- Das Schema selbst muss betretbar sein, sonst greift kein Grant darin.
grant usage on schema private to authenticated;

-- Ausdruecklich gesperrt bleiben:
revoke execute on function private.encrypt_iban(text)   from anon, authenticated;
revoke execute on function private.decrypt_iban(bytea)  from anon, authenticated;
revoke execute on function private.open_booking_count(uuid) from anon, authenticated;
revoke execute on function private.current_drink_price(uuid) from anon, authenticated;
revoke execute on function private.record_purchase(uuid, uuid, integer, public.purchase_source, uuid)
  from anon, authenticated;
revoke execute on function private.series_occurrences(integer, time, time, date, date)
  from anon, authenticated;

-- anon bekommt nichts davon.
revoke execute on all functions in schema private from anon;
revoke usage   on schema private from anon;
