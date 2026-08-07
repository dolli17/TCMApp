-- ===========================================================================
-- Zeitgeber fuer den Mailversand
--
-- Bewusst KEINE Migration, sondern ein Schnipsel, der je Umgebung einmal von
-- Hand ausgefuehrt wird. Zwei Gruende:
--
--   1. Adresse und Schluessel sind umgebungsabhaengig. Eine Migration muesste
--      sie fest eintragen oder raten - beides falsch.
--   2. Ein Zeitplan ist Betriebszustand, kein Schema. Lokal wuerde "supabase db
--      reset" sonst einen Job anlegen, der ins Leere zeigt und alle fuenf
--      Minuten scheitert.
--
-- Reihenfolge der Inbetriebnahme:
--
--   1. Merkmal "E-Mails zu Buchungen" pruefen (legt die Migration
--      20260808100100 an; im Admin-Dashboard unter Einstellungen sichtbar)
--   2. Absenderdomain bei Resend verifizieren - SPF, DKIM, DMARC. Ohne das
--      landen die Mails im Spam-Ordner, und niemand merkt es
--   3. supabase secrets set RESEND_API_KEY=... MAIL_FROM=... SITE_URL=...
--   4. Erst von Hand pruefen: als Admin die Funktion aufrufen und die Antwort
--      lesen. Ohne RESEND_API_KEY zeigt sie im Trockenlauf den fertigen
--      Mailtext, ohne etwas zu verschicken
--   5. Dann dieses Schnipsel ausfuehren
--
-- Die Regel "nichts aelter als 24 Stunden" in claim_notification_mails macht
-- den ersten scharfen Lauf von selbst harmlos: der Altbestand wird abgehakt,
-- aber nicht verschickt.
-- ===========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Die Werte einmalig eintragen. Der Dienstschluessel steht im Vault und nicht
-- im Auftragstext, damit er nicht in cron.job fuer jeden lesbar ist, der die
-- Tabelle sehen darf.
select vault.create_secret(
  'https://DEINE-PROJEKT-REF.supabase.co/functions/v1/notification-mails',
  'notification_mails_url',
  'Adresse der Versandfunktion');

select vault.create_secret(
  'DEIN-SERVICE-ROLE-KEY',
  'notification_mails_key',
  'Dienstschluessel, mit dem sich der Zeitgeber ausweist');

-- Alle fuenf Minuten. Nicht sofort bei jeder Benachrichtigung: eine
-- Serienanlage mit sechzig Terminen wuerde sonst sechzig Aufrufe ausloesen,
-- und der Empfaenger bekaeme sechzig Mails statt einer.
select cron.schedule(
  'benachrichtigungs-mails',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets
               where name = 'notification_mails_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                        where name = 'notification_mails_key')),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000);
  $job$);

-- Zum Nachsehen:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;
--
-- Zum Abschalten:
--   select cron.unschedule('benachrichtigungs-mails');
