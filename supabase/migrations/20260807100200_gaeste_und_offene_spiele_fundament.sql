-- ===========================================================================
-- Fundament fuer "Mitspieler gesucht" und die Gastgebuehr
--
-- Eigene Datei, weil "alter type ... add value" den neuen Enum-Wert erst nach
-- der Transaktion benutzbar macht. Stuende die Gebuehrenlogik hier daneben,
-- schluege sie beim Einspielen fehl - der Wert existiert zwar schon, ist aber
-- in derselben Transaktion noch nicht referenzierbar.
-- ===========================================================================

alter type public.charge_kind add value if not exists 'guest';

-- ---------------------------------------------------------------------------
-- Die Buchung ist fuer andere offen
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists partner_wanted boolean not null default false;

comment on column public.bookings.partner_wanted is
  'Der Bucher sucht Mitspieler. Wird automatisch zurueckgesetzt, sobald die '
  'Buchung voll ist.';

-- Fuer die Uebersicht der offenen Spiele: nur die wenigen offenen Buchungen,
-- nicht der ganze Bestand.
create index if not exists bookings_partner_wanted_idx
  on public.bookings (lower(slot))
  where partner_wanted and status = 'active';

-- ---------------------------------------------------------------------------
-- Eine Forderung kann zu einer Buchung gehoeren
-- ---------------------------------------------------------------------------

-- on delete set null statt cascade: eine bereits eingezogene Gastgebuehr darf
-- nicht verschwinden, nur weil die Buchung irgendwann geloescht wird. Die
-- Zuordnung geht verloren, der Betrag bleibt.
alter table public.charges
  add column if not exists booking_id uuid references public.bookings (id) on delete set null;

create index if not exists charges_booking_idx on public.charges (booking_id)
  where booking_id is not null;

comment on column public.charges.booking_id is
  'Gesetzt bei Gastgebuehren: zu welcher Buchung gehoert die Forderung.';

-- ---------------------------------------------------------------------------
-- Gastgebuehr: 10 Euro
--
-- Zwei Stellen, weil es zwei Wege in die Tabelle gibt: der Bestand wird hier
-- umgestellt, der Startwert in ensure_default_settings(). Ohne den zweiten
-- stuende nach jedem Zuruecksetzen wieder 0 da - der Seed leert settings ueber
-- den CASCADE von members und laesst die Funktion neu befuellen.
-- ---------------------------------------------------------------------------
update public.settings set value = to_jsonb(1000)
 where key = 'booking.guest_fee_cents' and value = to_jsonb(0);

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

revoke execute on function public.ensure_default_settings() from public, anon, authenticated;
