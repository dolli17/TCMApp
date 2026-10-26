-- ===========================================================================
-- Alte Benachrichtigungen aufraeumen
--
-- Benachrichtigungen bleiben drei Monate, gelesen oder nicht. Danach loescht
-- sie ein taeglicher Job. Die Startseite zeigt ohnehin nur Ungelesenes und
-- die letzte Woche (startseitenNeuigkeiten in @tcm/core), Glocke und
-- Nachrichtenliste die 30 neuesten.
--
-- Auf public.notifications zeigt kein Fremdschluessel. Mail- und Pushversand
-- merken sich ihren Stand in der Zeile selbst (mailed_at, pushed_at); die Ids in den Stapeln von
-- claim_notification_mails und claim_notification_pushes leben nur fuer einen
-- Lauf.
-- ===========================================================================

/** Loescht Benachrichtigungen, die aelter als drei Monate sind. Rueckgabe: wie viele. */
create or replace function private.alte_benachrichtigungen_loeschen()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_anzahl integer;
begin
  delete from public.notifications
   where created_at < now() - interval '3 months';
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke execute on function private.alte_benachrichtigungen_loeschen() from public, anon, authenticated;

-- Taeglich um 03:41 UTC, nachts und abseits der vollen Stunde. Ein Name, den
-- es schon gibt, ersetzt den Job.
select cron.schedule(
  'alte-benachrichtigungen',
  '41 3 * * *',
  'select private.alte_benachrichtigungen_loeschen()'
);
