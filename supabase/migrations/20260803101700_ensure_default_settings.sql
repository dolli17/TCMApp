-- ===========================================================================
-- Standardeinstellungen als wiederherstellbare Funktion
--
-- Gefunden durch die RPC-Testsuite: der Seed leert die fachlichen Tabellen mit
-- "truncate ... cascade". Weil settings.updated_by einen Fremdschluessel auf
-- members hat, wurde settings dabei mit geleert - und ohne
-- booking.opening_time bricht create_booking sofort ab.
--
-- Die Startwerte liegen deshalb jetzt in einer Funktion statt nur in einem
-- einmaligen INSERT. Migration und Seed rufen sie beide auf; bestehende Werte
-- bleiben unangetastet, es werden nur fehlende Schluessel ergaenzt.
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
    ('booking.max_open_bookings', '2'::jsonb, 'integer', 'Maximale offene Buchungen',
     'Wie viele kuenftige Buchungen ein Mitglied gleichzeitig haben darf. Mitspieler zaehlen mit.'),
    ('booking.lead_days', '7'::jsonb, 'integer', 'Buchungsvorlauf in Tagen',
     'Rollierend: buchbar ist alles innerhalb der naechsten X Tage.'),
    ('booking.opening_time', '"08:00"'::jsonb, 'time', 'Oeffnungszeit',
     'Frueheste Startzeit einer Buchung.'),
    ('booking.closing_time', '"21:00"'::jsonb, 'time', 'Schliesszeit',
     'Spaeteste Endzeit einer Buchung.'),
    ('booking.slot_minutes', '30'::jsonb, 'integer', 'Raster in Minuten',
     'Startzeiten muessen auf dieses Raster fallen (30 = :00 und :30).'),
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
     'Womit nicht geleistete Stunden zum Jahresende abgerechnet werden. Platzhalter.')
  on conflict (key) do nothing;

  select count(*) into v_after from public.settings;
  return v_after - v_before;
end;
$$;

revoke execute on function public.ensure_default_settings() from public, anon, authenticated;

select public.ensure_default_settings();
