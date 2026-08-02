-- ===========================================================================
-- Einstellungen
--
-- Alle Regelwerte liegen hier, nicht im Code: Buchungskontingent, Vorlauf,
-- Oeffnungszeiten, Mindestbetrag fuer Lastschriften, SEPA-Parameter. Der
-- Vorstand kann sie aendern, ohne dass jemand eine Zeile Code anfasst.
-- ===========================================================================

create table public.settings (
  key         text primary key,
  value       jsonb not null,
  value_type  text not null,
  label       text not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.members (id) on delete set null,

  constraint settings_value_type_known
    check (value_type in ('integer', 'text', 'boolean', 'time', 'date', 'decimal'))
);

create index settings_updated_by_idx on public.settings (updated_by);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- Typsicherer Lesezugriff
--
-- Ein Tippfehler im Schluessel soll sofort auffallen, statt still einen
-- Standardwert zu benutzen und damit z.B. das Buchungskontingent auszuhebeln.
-- ---------------------------------------------------------------------------
create or replace function public.setting_int(p_key text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  select value into v from public.settings where key = p_key;
  if v is null then
    raise exception 'Unbekannte Einstellung: %', p_key using errcode = 'no_data_found';
  end if;
  return (v #>> '{}')::integer;
end;
$$;

create or replace function public.setting_text(p_key text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  select value into v from public.settings where key = p_key;
  if v is null then
    raise exception 'Unbekannte Einstellung: %', p_key using errcode = 'no_data_found';
  end if;
  return v #>> '{}';
end;
$$;

create or replace function public.setting_time(p_key text)
returns time
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  select value into v from public.settings where key = p_key;
  if v is null then
    raise exception 'Unbekannte Einstellung: %', p_key using errcode = 'no_data_found';
  end if;
  return (v #>> '{}')::time;
end;
$$;

-- ---------------------------------------------------------------------------
-- Startwerte
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, value_type, label, description) values
  ('booking.max_open_bookings', '2'::jsonb, 'integer',
   'Maximale offene Buchungen',
   'Wie viele kuenftige Buchungen ein Mitglied gleichzeitig haben darf. Mitspieler zaehlen mit.'),

  ('booking.lead_days', '7'::jsonb, 'integer',
   'Buchungsvorlauf in Tagen',
   'Rollierend: buchbar ist alles innerhalb der naechsten X Tage.'),

  ('booking.opening_time', '"08:00"'::jsonb, 'time',
   'Oeffnungszeit', 'Frueheste Startzeit einer Buchung.'),

  ('booking.closing_time', '"21:00"'::jsonb, 'time',
   'Schliesszeit', 'Spaeteste Endzeit einer Buchung.'),

  ('booking.slot_minutes', '30'::jsonb, 'integer',
   'Raster in Minuten',
   'Startzeiten muessen auf dieses Raster fallen (30 = :00 und :30).'),

  ('booking.guest_fee_cents', '0'::jsonb, 'integer',
   'Gastgebuehr in Cent',
   '0 = keine Gebuehr. Sonst wird sie dem buchenden Mitglied berechnet.'),

  ('drinks.min_debit_cents', '500'::jsonb, 'integer',
   'Mindestbetrag Lastschrift',
   'Betraege darunter werden nicht eingezogen, sondern auf den Folgemonat vorgetragen. '
   'Verhindert Lastschriften ueber Kleinstbetraege.'),

  ('drinks.void_window_minutes', '15'::jsonb, 'integer',
   'Storno-Fenster Getraenke',
   'So lange darf ein Mitglied eine eigene Fehlbuchung selbst zuruecknehmen.'),

  ('sepa.creditor_id', '""'::jsonb, 'text',
   'Glaeubiger-Identifikationsnummer',
   'Aus dem eBuSy-Backend uebernehmen. Ohne sie ist keine gueltige Lastschriftdatei moeglich. '
   'Muss unveraendert bleiben, damit die Bestandsmandate gueltig bleiben.'),

  ('sepa.pain_version', '"pain.008.001.08"'::jsonb, 'text',
   'Format der Lastschriftdatei',
   'Mit der Hausbank abklaeren. In Deutschland laeuft die Umstellung von .02 auf .08.'),

  ('sepa.prenotification_days', '14'::jsonb, 'integer',
   'Vorabankuendigung in Tagen',
   'Pflicht vor jedem Einzug. Per Vereinbarung verkuerzbar, dann hier anpassen.'),

  ('sepa.creditor_name', '"TC Muckensturm e.V."'::jsonb, 'text',
   'Name des Zahlungsempfaengers', 'Erscheint auf dem Kontoauszug der Mitglieder.'),

  ('fees.annual_run_month', '1'::jsonb, 'integer',
   'Monat des Beitragslaufs', 'Der Lauf wird trotzdem manuell gestartet.'),

  ('fees.annual_run_day', '15'::jsonb, 'integer',
   'Tag des Beitragslaufs', 'Faelligkeitsdatum der Jahresbeitrags-Lastschrift.'),

  ('work_duty.hourly_rate_cents', '1500'::jsonb, 'integer',
   'Stundensatz Arbeitsdienst',
   'Womit nicht geleistete Stunden zum Jahresende abgerechnet werden. Platzhalter.')
on conflict (key) do nothing;
