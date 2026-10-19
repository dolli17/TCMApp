-- ===========================================================================
-- Veranstaltungen: Erinnerung vor dem Anmeldeschluss
--
-- Zwei Tage vor dem Anmeldeschluss bekommen alle aktiven Mitglieder, die
-- sich noch nicht angemeldet haben, eine Nachricht (event_reminder) - auf
-- dem bestehenden Weg ueber public.notifications, Glocke und Push.
--
-- Genau einmal je Veranstaltung (events.reminder_sent_at): wer erst nach
-- der Erinnerung als Mitglied dazukommt, bekommt keine zweite Runde.
--
-- Den Zeitgeber legt diese Migration selbst an (pg_cron, stuendlich). Anders
-- als beim Mail- und Push-Versand (supabase/snippets) ruft er keine Edge
-- Function auf, sondern nur SQL - er braucht weder Adresse noch Schluessel
-- und laeuft in jeder Umgebung gleich, lokal eingeschlossen.
--
-- Abwaertskompatibel: eine neue, nullable Spalte, eine neue Funktion, ein
-- Job und eine Art mehr in den Push-Einstellungen.
-- ===========================================================================

create extension if not exists pg_cron;

alter table public.events
  add column if not exists reminder_sent_at timestamptz;

comment on column public.events.reminder_sent_at is
  'Wann an den Anmeldeschluss erinnert wurde. null = noch nicht.';

/**
 * Erinnert an alle Veranstaltungen, deren Anmeldeschluss in den naechsten
 * zwei Tagen liegt. Rueckgabe: wie viele Nachrichten entstanden sind.
 *
 * Nur veroeffentlicht, mit Anmeldung und noch nicht erinnert. Empfaenger:
 * aktive Mitglieder ohne Anmeldung. Wer angemeldet ist, wartet oder sich
 * schon wieder abgemeldet hat, bekommt nichts - letzteres waere ein
 * Draengeln gegen eine bewusste Entscheidung. Ebenso nicht, wer in den
 * letzten 24 Stunden die Nachricht "Neu im Verein" dazu bekommen hat.
 *
 * p_jetzt nur fuer die Tests; der Zeitgeber ruft ohne Argument auf.
 */
create or replace function private.event_erinnerungen(p_jetzt timestamptz default now())
returns integer language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  v_schluss timestamptz;
  v_anzahl integer := 0;
  v_n integer;
begin
  -- Zwei Laeufe zugleich (etwa von Hand und per Zeitgeber) duerfen nicht
  -- beide erinnern.
  perform pg_advisory_xact_lock(hashtext('event_erinnerungen'));

  for e in
    select * from public.events ev
     where ev.status = 'published'
       and ev.registration_enabled
       and ev.reminder_sent_at is null
       and private.event_schluss(ev) > p_jetzt
       and private.event_schluss(ev) <= p_jetzt + interval '2 days'
     for update
  loop
    v_schluss := private.event_schluss(e);

    insert into public.notifications (member_id, kind, title, body, event_id)
    select m.id, 'event_reminder', 'Anmeldeschluss naht: ' || e.title,
           format('%s %s. Anmeldung noch bis %s Uhr.', e.title,
                  private.event_wann(e.starts_at, e.ends_at, e.location),
                  to_char(v_schluss at time zone 'Europe/Berlin', 'DD.MM.YYYY, HH24:MI'))
           || case
                when e.max_participants is not null
                     and private.event_belegt(e.id) >= e.max_participants
                  then ' Gerade ausgebucht - du kaemst auf die Warteliste.'
                else ''
              end,
           e.id
    from public.members m
    where m.status = 'active'
      and not exists (
        select 1 from public.event_registrations r
         where r.event_id = e.id and r.member_id = m.id)
      and not exists (
        select 1 from public.notifications n
         where n.event_id = e.id and n.member_id = m.id
           and n.kind = 'event_published'
           and n.created_at > p_jetzt - interval '1 day');
    get diagnostics v_n = row_count;
    v_anzahl := v_anzahl + v_n;

    update public.events set reminder_sent_at = p_jetzt where id = e.id;
  end loop;

  return v_anzahl;
end; $$;

revoke execute on function private.event_erinnerungen(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Zeitgeber: stuendlich, zur siebten Minute (nicht zur vollen Stunde, wo sich
-- andere Laeufe draengeln). cron.schedule mit einem Namen, den es schon
-- gibt, ersetzt den Job - die Migration laesst sich also wiederholen, ohne
-- dass ein zweiter entsteht.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'veranstaltungs-erinnerungen',
  '7 * * * *',
  'select private.event_erinnerungen()'
);

-- ---------------------------------------------------------------------------
-- Push ja, Mail nur fuer wer "Alle" gewaehlt hat - wie bei "Neu im Verein":
-- an jedes Mitglied waere das sonst eine Rundmail.
-- ---------------------------------------------------------------------------
update public.settings
   set value = to_jsonb(concat_ws(',', nullif(btrim(value #>> '{}'), ''), 'event_reminder'))
 where key = 'notifications.push_kinds'
   and not ('event_reminder' = any (string_to_array(coalesce(value #>> '{}', ''), ',')));

create or replace function public.ensure_default_settings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before integer;
  v_after  integer;
begin
  select count(*) into v_before from public.settings;

  insert into public.settings (key, value, value_type, label, description) values
    ('booking.max_open_bookings', '0'::jsonb, 'integer', 'Maximale offene Buchungen',
     'Wie viele kuenftige Buchungen ein Mitglied gleichzeitig haben darf. '
     'Mitspieler zaehlen mit. 0 bedeutet unbegrenzt.'),
    ('booking.lead_days', '7'::jsonb, 'integer', 'Buchungsvorlauf in Tagen',
     'Rollierend: buchbar ist alles innerhalb der naechsten X Tage.'),
    ('booking.opening_time', '"08:00"'::jsonb, 'time', 'Oeffnungszeit',
     'Frueheste Startzeit einer Buchung.'),
    ('booking.closing_time', '"21:00"'::jsonb, 'time', 'Schliesszeit',
     'Spaeteste Endzeit einer Buchung.'),
    ('booking.slot_minutes', '30'::jsonb, 'integer', 'Raster in Minuten',
     'Startzeiten muessen auf dieses Raster fallen (30 = :00 und :30).'),
    ('booking.display_minutes', '60'::jsonb, 'integer', 'Raster der Plananzeige',
     'In welchen Schritten der Belegungsplan Zeilen zeigt. Gebucht wird im '
     'feineren Raster aus booking.slot_minutes.'),
    ('booking.guest_fee_cents', '1000'::jsonb, 'integer', 'Gastgebuehr in Cent',
     '0 = keine Gebuehr. Sonst wird sie je Gast dem buchenden Mitglied '
     'berechnet und mit der naechsten Lastschrift eingezogen.'),
    ('notifications.mail_kinds',
     '"booking_displaced,booking_cancelled,booking_removed,application_new,charge_announced,charge_returned,booking_moved,event_promoted,event_cancelled,event_changed"'::jsonb,
     'text', 'Benachrichtigungen, die auch per E-Mail gehen',
     'Kommagetrennte Liste. Wer bei "E-Mails zu Buchungen" auf "Alle" steht, '
     'bekommt jede Art; alle anderen nur diese hier.'),
    ('drinks.min_debit_cents', '500'::jsonb, 'integer', 'Mindestbetrag Lastschrift',
     'Betraege darunter werden nicht eingezogen, sondern beim naechsten Lauf '
     'mitgenommen. Die Schwelle gilt je Zahler ueber alle offenen Forderungen.'),
    ('drinks.void_window_minutes', '15'::jsonb, 'integer', 'Storno-Fenster Getraenke',
     'So lange darf ein Mitglied eine eigene Fehlbuchung selbst zuruecknehmen.'),
    ('sepa.creditor_id', '""'::jsonb, 'text', 'Glaeubiger-Identifikationsnummer',
     'Aus dem eBuSy-Backend uebernehmen. Muss unveraendert bleiben, damit die '
     'Bestandsmandate gueltig bleiben.'),
    ('sepa.creditor_iban', '""'::jsonb, 'text', 'IBAN des Vereinskontos',
     'Auf dieses Konto werden die Lastschriften gutgeschrieben. Ohne sie laesst '
     'sich keine Datei erzeugen.'),
    ('sepa.creditor_bic', '""'::jsonb, 'text', 'BIC des Vereinskontos',
     'Optional. Fehlt sie, traegt die Datei NOTPROVIDED - das reicht innerhalb '
     'des SEPA-Raums.'),
    ('sepa.pain_version', '"pain.008.001.08"'::jsonb, 'text', 'Format der Lastschriftdatei',
     'Mit der Hausbank abklaeren.'),
    ('sepa.prenotification_days', '14'::jsonb, 'integer', 'Vorabankuendigung in Tagen',
     'Pflicht vor jedem Einzug. So viele Tage muessen zwischen Ankuendigung '
     'und Faelligkeit liegen.'),
    ('sepa.creditor_name', '"TC Muckensturm e.V."'::jsonb, 'text', 'Name des Zahlungsempfaengers',
     'Erscheint auf dem Kontoauszug der Mitglieder.'),
    ('sepa.mandate_text_version', '1'::jsonb, 'integer', 'Version des Mandatstexts',
     'Fassung des Textes, mit dem Mitglieder ihr SEPA-Mandat online erteilen. '
     'Wird hochgezaehlt, wenn sich der Text in private.sepa_mandatstext aendert.'),
    ('fees.annual_run_month', '1'::jsonb, 'integer', 'Monat des Beitragslaufs',
     'Der Lauf wird trotzdem manuell gestartet.'),
    ('fees.annual_run_day', '15'::jsonb, 'integer', 'Tag des Beitragslaufs',
     'Faelligkeitsdatum der Jahresbeitrags-Lastschrift.'),
    ('work_duty.hourly_rate_cents', '1500'::jsonb, 'integer', 'Stundensatz Arbeitsdienst',
     'Womit nicht geleistete Stunden zum Jahresende abgerechnet werden. Platzhalter.'),
    ('privacy.change_log_days', '1095'::jsonb, 'integer',
     'Aufbewahrung des Aenderungsprotokolls in Tagen',
     'Aeltere Eintraege werden beim Aufraeumlauf entfernt. 1095 Tage sind drei Jahre.'),
    ('notifications.push_kinds',
     '"booking_displaced,booking_cancelled,booking_removed,booking_added,player_joined,player_left,application_new,booking_moved,event_published,event_promoted,event_cancelled,event_changed,event_reminder"'::jsonb,
     'text', 'Benachrichtigungen, die auch als Push gehen',
     'Kommagetrennte Liste. Getrennt von den E-Mail-Arten, weil ein Push sofort '
     'da ist und auch Erfreuliches melden darf, das als Mail nur Laerm waere.')
  on conflict (key) do nothing;

  select count(*) into v_after from public.settings;
  return v_after - v_before;
end;
$$;

revoke execute on function public.ensure_default_settings() from public, anon, authenticated;

select public.ensure_default_settings();
