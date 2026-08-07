-- ===========================================================================
-- Ruecklaeufer und Abschluss
--
-- Der letzte Schritt der Kette. Die Bank meldet dem Verein nichts - es gibt
-- keine Anbindung, keinen camt-Import, und das ist eine bewusste Entscheidung:
-- fuer dreizehn Laeufe im Jahr steht der Aufwand in keinem Verhaeltnis. Was
-- hier passiert, ist deshalb die Erklaerung eines Menschen, der auf seinen
-- Kontoauszug schaut, und keine Beobachtung.
--
--   ... -> Lastschriftlauf -> Datei -> eingereicht -> Ruecklaeufer
--                                                     ^^^^^^^^^^^^
--
-- Erfasst wird ueber die end_to_end_id - genau das Feld, das ein spaeterer
-- camt-Import liefern wuerde. Damit ist die Automatisierung nicht verbaut,
-- sie muesste nur record_debit_return fuettern.
--
-- Ein Ruecklaeufer trifft ALLE Forderungen seiner Kennung. Das ist richtig:
-- fuer die Familienlastschrift ueber 270 Euro kam kein Geld, also fuer keines
-- der drei Kinder. Danach ist jede dieser Forderungen wieder aufnehmbar - der
-- Teilindex debit_items_one_active_per_charge deckt nur 'pending' und
-- 'settled' ab und gibt sie mit dem Ruecklaeufer frei.
-- ===========================================================================

/**
 * Eine Lastschrift kam zurueck.
 *
 * Der Grund wandert unveraendert in den Datensatz und in die Nachricht an den
 * Zahler: "Konto nicht gedeckt" und "Widerspruch" fuehren zu voellig
 * verschiedenen naechsten Schritten, und nur der Zahler weiss, welcher gilt.
 */
create or replace function public.record_debit_return(
  p_end_to_end_id text, p_reason text, p_returned_on date default null
)
returns table (forderungen integer, summe_cents integer, payer_name text)
language plpgsql security definer set search_path = '' as $$
declare
  v_tag date := coalesce(p_returned_on, (now() at time zone 'Europe/Berlin')::date);
  v_payer uuid;
  v_name text;
  v_anzahl integer;
  v_summe integer;
begin
  if not private.is_admin() then
    raise exception 'Ruecklaeufer erfassen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Bitte den Grund der Ruecklastschrift angeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  select c.payer_id into v_payer
  from public.debit_items i
  join public.charges c on c.id = i.charge_id
  where i.end_to_end_id = p_end_to_end_id
  limit 1;

  if v_payer is null then
    raise exception 'Zu dieser Kennung gibt es keine Lastschrift.'
      using errcode = 'no_data_found';
  end if;

  if exists (select 1 from public.debit_items
              where end_to_end_id = p_end_to_end_id and result = 'returned') then
    raise exception 'Diese Lastschrift ist bereits als zurueckgebucht vermerkt.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.debit_items
     set result = 'returned', return_reason = btrim(p_reason), returned_on = v_tag
   where end_to_end_id = p_end_to_end_id;

  update public.charges c
     set status = 'returned'
   where c.id in (select charge_id from public.debit_items
                   where end_to_end_id = p_end_to_end_id);

  select count(*)::integer, coalesce(sum(c.amount_cents), 0)::integer
    into v_anzahl, v_summe
  from public.debit_items i
  join public.charges c on c.id = i.charge_id
  where i.end_to_end_id = p_end_to_end_id;

  v_name := private.member_label(v_payer);

  -- Der Zahler muss handeln: das Geld ist zurueck, die Forderung steht wieder
  -- offen. Ohne Nachricht erfaehrt er es erst bei der Mahnung.
  insert into public.notifications (member_id, kind, title, body)
  values (v_payer, 'charge_returned', 'Lastschrift zurueckgebucht',
          'Die Lastschrift ueber ' || private.cent_text(v_summe) ||
          ' Euro vom ' || to_char(v_tag, 'DD.MM.YYYY') ||
          ' kam zurueck: ' || btrim(p_reason) ||
          '. Bitte melde dich beim Verein, damit wir das klaeren koennen.');

  return query select v_anzahl, v_summe, v_name;
end; $$;

revoke execute on function public.record_debit_return(text, text, date) from public, anon;
grant  execute on function public.record_debit_return(text, text, date) to authenticated;

/**
 * Der Lauf ist durch.
 *
 * Alles, was nicht zurueckkam, gilt als eingezogen. Bewusst erst hier und
 * nicht schon beim Einreichen: zwischen Einreichung und Faelligkeit liegen
 * Tage, und eine Ruecklastschrift kann noch acht Wochen danach kommen. Wer zu
 * frueh abschliesst, haelt Geld fuer da, das noch unterwegs ist.
 */
create or replace function public.complete_debit_batch(p_batch_id uuid)
returns table (eingezogen integer, zurueck integer, summe_cents integer)
language plpgsql security definer set search_path = '' as $$
declare v_status public.debit_batch_status; v_ein integer; v_zurueck integer; v_summe integer;
begin
  if not private.is_admin() then
    raise exception 'Lastschriftlaeufe abschliessen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from public.debit_batches where id = p_batch_id;
  if v_status is null then
    raise exception 'Diesen Lastschriftlauf gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'submitted' then
    raise exception
      'Nur ein eingereichter Lauf laesst sich abschliessen. Vorher steht noch nicht fest, was ankommt.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.debit_items
     set result = 'settled'
   where batch_id = p_batch_id and result = 'pending';

  update public.charges c
     set status = 'settled'
   where c.id in (select charge_id from public.debit_items
                   where batch_id = p_batch_id and result = 'settled');

  update public.debit_batches set status = 'completed' where id = p_batch_id;

  select
    count(*) filter (where i.result = 'settled')::integer,
    count(*) filter (where i.result = 'returned')::integer,
    coalesce(sum(i.amount_cents) filter (where i.result = 'settled'), 0)::integer
    into v_ein, v_zurueck, v_summe
  from public.debit_items i where i.batch_id = p_batch_id;

  return query select v_ein, v_zurueck, v_summe;
end; $$;

revoke execute on function public.complete_debit_batch(uuid) from public, anon;
grant  execute on function public.complete_debit_batch(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Auch der Ruecklaeufer geht per Mail raus
--
-- Von allen Nachrichten dieser App ist es die dringendste: das Geld ist
-- zurueck, die Bank hat eine Gebuehr berechnet, und der Zahler muss etwas tun.
-- ---------------------------------------------------------------------------
update public.settings
   set value = to_jsonb(
     'booking_displaced,booking_cancelled,booking_removed,application_new,'
     'charge_announced,charge_returned'::text)
 where key = 'notifications.mail_kinds'
   and value #>> '{}' not like '%charge_returned%';

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
     '"booking_displaced,booking_cancelled,booking_removed,application_new,charge_announced,charge_returned"'::jsonb,
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

select public.ensure_default_settings();
