-- ===========================================================================
-- Zeitgeber fuer die Push-Benachrichtigungen
--
-- Bewusst KEINE Migration, sondern ein Schnipsel, der je Umgebung einmal von
-- Hand ausgefuehrt wird - aus denselben Gruenden wie beim Mailversand: Adresse
-- und Schluessel sind umgebungsabhaengig, und ein Zeitplan ist Betriebszustand,
-- kein Schema.
--
-- Reihenfolge der Inbetriebnahme:
--
--   1. Ein Expo-Projekt anlegen (eas init) und die Kennung in app.json unter
--      extra.eas.projectId eintragen. Ohne sie bekommt die App gar keine Marke
--   2. Fuer iOS einen APNs-Schluessel im Apple-Entwicklerkonto erzeugen und im
--      Expo-Konto hinterlegen. Das ist der Schritt mit Vorlauf - er dauert
--      Tage, nicht Minuten
--   3. Einen Development Build erzeugen und auf einem echten Geraet
--      installieren. In Expo Go kommt kein Remote-Push an, und der Simulator
--      liefert ueberhaupt keine Marke
--   4. supabase secrets set PUSH_AKTIV=true
--      (optional EXPO_ACCESS_TOKEN=..., falls im Expo-Konto die erhoehte
--      Sicherheit fuer Push eingeschaltet ist)
--   5. Erst von Hand pruefen: als Admin die Funktion aufrufen und die Antwort
--      lesen. Ohne PUSH_AKTIV zeigt sie im Trockenlauf die fertigen
--      Nachrichten, ohne etwas zu senden
--   6. Dann dieses Schnipsel ausfuehren
--
-- Die Regel "nichts aelter als 24 Stunden" in claim_notification_pushes macht
-- den ersten scharfen Lauf von selbst harmlos: der Altbestand wird abgehakt,
-- aber nicht gesendet.
-- ===========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Adresse und Schluessel gehoeren in den Vault, nicht in den Auftrag: was in
-- cron.job steht, liest jeder mit Leserecht auf das Schema.
select vault.create_secret(
  'https://DEIN-PROJEKT.supabase.co/functions/v1/notification-pushes',
  'notification_pushes_url',
  'Adresse der Edge Function fuer die Push-Benachrichtigungen');

select vault.create_secret(
  'DEIN-SERVICE-ROLE-KEY',
  'notification_pushes_key',
  'Dienstschluessel, mit dem sich der Zeitgeber ausweist');

-- Jede Minute, nicht alle fuenf wie bei den Mails: ein Push, der eine Absage
-- fuenf Minuten verspaetet meldet, verliert seinen Zweck - dann steht das
-- Mitglied schon auf dem Platz. Gegen die Serienanlage schuetzt bereits die
-- Buendelung in claim_notification_pushes, die sechzig Termine zu einer
-- Meldung zusammenfasst.
select cron.schedule(
  'benachrichtigungs-pushes',
  '* * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets
               where name = 'notification_pushes_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                        where name = 'notification_pushes_key')),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000);
  $job$);

-- Zum Nachsehen:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;
--
-- Zum Abschalten:
--   select cron.unschedule('benachrichtigungs-pushes');
