-- ===========================================================================
-- ensure_default_settings() vervollstaendigen
--
-- Die Funktion stammt aus 20260803101700 und kennt nur die Schluessel, die es
-- damals gab. Seither sind zwei dazugekommen: booking.display_minutes
-- (20260803102300) und privacy.change_log_days (20260806100100). Beide wurden
-- per INSERT in ihrer jeweiligen Migration angelegt - aber nicht in die
-- Funktion aufgenommen.
--
-- Das faellt nur beim Zuruecksetzen auf: der Seed leert settings ueber den
-- CASCADE von members (settings.updated_by), ruft danach
-- ensure_default_settings() auf - und die Werte, die die Funktion nicht kennt,
-- bleiben verschwunden. booking_settings() bricht dann mit "Unbekannte
-- Einstellung: booking.display_minutes" ab, und mit ihr der gesamte
-- Belegungsplan.
--
-- Aufgefallen ist es, als die E2E-Tests zum ersten Mal gegen eine frisch
-- zurueckgesetzte lokale Datenbank liefen statt gegen die Cloud.
--
-- Damit sich das nicht wiederholt, sammelt die Funktion die Startwerte jetzt
-- aus einer einzigen Liste, und ein Test in 04_mitglieder.sql vergleicht sie
-- mit dem, was nach einem Reset tatsaechlich in der Tabelle steht.
-- ===========================================================================

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
    ('booking.guest_fee_cents', '0'::jsonb, 'integer', 'Gastgebuehr in Cent',
     '0 = keine Gebuehr. Sonst wird sie dem buchenden Mitglied berechnet.'),
    ('drinks.min_debit_cents', '500'::jsonb, 'integer', 'Mindestbetrag Lastschrift',
     'Betraege darunter werden nicht eingezogen, sondern vorgetragen.'),
    ('drinks.void_window_minutes', '15'::jsonb, 'integer', 'Storno-Fenster Getraenke',
     'So lange darf ein Mitglied eine eigene Fehlbuchung selbst zuruecknehmen.'),
    ('sepa.creditor_id', '""'::jsonb, 'text', 'Glaeubiger-Identifikationsnummer',
     'Aus dem eBuSy-Backend uebernehmen. Muss unveraendert bleiben, damit die '
     'Bestandsmandate gueltig bleiben.'),
    ('sepa.pain_version', '"pain.008.001.08"'::jsonb, 'text', 'Format der Lastschriftdatei',
     'Mit der Hausbank abklaeren.'),
    ('sepa.prenotification_days', '14'::jsonb, 'integer', 'Vorabankuendigung in Tagen',
     'Pflicht vor jedem Einzug.'),
    ('sepa.creditor_name', '"TC Muckensturm e.V."'::jsonb, 'text', 'Name des Zahlungsempfaengers',
     'Erscheint auf dem Kontoauszug der Mitglieder.'),
    ('fees.annual_run_month', '1'::jsonb, 'integer', 'Monat des Beitragslaufs',
     'Der Lauf wird trotzdem manuell gestartet.'),
    ('fees.annual_run_day', '15'::jsonb, 'integer', 'Tag des Beitragslaufs',
     'Faelligkeitsdatum der Jahresbeitrags-Lastschrift.'),
    ('work_duty.hourly_rate_cents', '1500'::jsonb, 'integer', 'Stundensatz Arbeitsdienst',
     'Womit nicht geleistete Stunden zum Jahresende abgerechnet werden. Platzhalter.'),
    ('privacy.change_log_days', '1095'::jsonb, 'integer',
     'Aufbewahrung des Aenderungsprotokolls in Tagen',
     'Aeltere Eintraege werden beim Aufraeumlauf entfernt. 1095 Tage sind drei Jahre.')
  on conflict (key) do nothing;

  select count(*) into v_after from public.settings;
  return v_after - v_before;
end;
$$;

comment on function public.ensure_default_settings() is
  'Startwerte aller Einstellungen. Wird von Migration und Seed aufgerufen und '
  'ergaenzt nur Fehlendes - bestehende Werte bleiben unangetastet. Jede neue '
  'Einstellung gehoert hier hinein, sonst fehlt sie nach dem naechsten Reset.';

revoke execute on function public.ensure_default_settings() from public, anon, authenticated;

select public.ensure_default_settings();
