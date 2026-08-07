-- ===========================================================================
-- Die Vorabankuendigung
--
-- Vor jedem SEPA-Einzug muss der Zahler wissen, wie viel wann von seinem Konto
-- abgeht. Ohne diese Ankuendigung ist der Einzug angreifbar - und praktisch
-- gesehen ist eine unangekuendigte Abbuchung der haeufigste Grund fuer eine
-- Ruecklastschrift.
--
-- Diese Migration baut den zweiten Schritt der Kette:
--
--   Forderung entsteht -> Vorabankuendigung -> [Lastschriftlauf] -> [Datei]
--                         ^^^^^^^^^^^^^^^^^
--
-- Die Frist haengt danach an der Forderung, nicht am Lauf: notified_at ist der
-- Startpunkt, ab dem sepa.prenotification_days zaehlen. Der Lastschriftlauf
-- prueft das spaeter Forderung fuer Forderung.
--
-- Angekuendigt wird je ZAHLER, nicht je Forderung. Ein Vater mit drei Kindern
-- bekommt eine Nachricht ueber den Gesamtbetrag - genau das, was spaeter auch
-- als eine Buchung auf seinem Kontoauszug erscheint.
-- ===========================================================================

/**
 * Cent als deutscher Betrag: 12345 -> "123,45".
 *
 * Nicht ueber to_char mit Gruppentrennung: das Format haengt an lc_numeric der
 * Verbindung, und in einer Benachrichtigung soll nicht mal "1,234.50" und mal
 * "1.234,50" stehen.
 */
create or replace function private.cent_text(p_cents integer)
returns text language sql immutable set search_path = '' as $$
  select replace(to_char(coalesce(p_cents, 0) / 100.0, 'FM999999990.00'), '.', ',');
$$;

/**
 * Forderungen ankuendigen.
 *
 * Entweder p_charge_ids ODER p_kind mit p_period_label - beides zusammen waere
 * mehrdeutig und wird abgewiesen.
 *
 * Angekuendigt werden nur offene Forderungen. Eine bereits angekuendigte wird
 * uebersprungen und behaelt ihr notified_at: ein zweiter Aufruf darf die Frist
 * nicht neu starten, sonst verschoebe ein versehentlicher Klick den Einzug um
 * zwei Wochen.
 *
 * Rueckgabe: was angekuendigt wurde, an wie viele Zahler, ueber welche Summe.
 */
create or replace function public.announce_charges(
  p_due_date date,
  p_kind public.charge_kind default null,
  p_period_label text default null,
  p_charge_ids uuid[] default null
)
returns table (angekuendigt integer, empfaenger integer, summe_cents integer, faellig_am date)
language plpgsql security definer set search_path = '' as $$
declare
  v_heute date := (now() at time zone 'Europe/Berlin')::date;
  v_frist integer := public.setting_int('sepa.prenotification_days');
  v_anzahl integer;
  v_summe integer;
  v_empfaenger integer;
begin
  if not private.is_admin() then
    raise exception 'Forderungen ankuendigen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_charge_ids is not null and (p_kind is not null or p_period_label is not null) then
    raise exception
      'Entweder einzelne Forderungen oder Art und Zeitraum angeben, nicht beides.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_charge_ids is null and p_kind is null then
    raise exception 'Bitte angeben, was angekuendigt werden soll.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_due_date is null then
    raise exception 'Ohne Faelligkeitsdatum laesst sich nichts ankuendigen.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Der Kern: die Frist wird hier gesetzt, nicht spaeter geprueft und
  -- nachgebessert. Wer heute ankuendigt, kann fruehestens in 14 Tagen
  -- einziehen - also muss das Faelligkeitsdatum schon jetzt weit genug weg
  -- sein.
  if p_due_date < v_heute + v_frist then
    raise exception
      'Die Vorabankuendigung braucht % Tage Vorlauf. Frueheste Faelligkeit ist der %.',
      v_frist, to_char(v_heute + v_frist, 'DD.MM.YYYY')
      using errcode = 'invalid_parameter_value';
  end if;

  -- Alles in einer Anweisung: eine temporaere Tabelle waere hier eine Falle,
  -- weil mehrere Aufrufe in derselben Transaktion (etwa im Test) auf eine
  -- bereits bestehende Tabelle traefen. Die schreibende CTE laeuft genau
  -- einmal, ihr returning laesst sich mehrfach lesen.
  with aktualisiert as (
    update public.charges c
       set status = 'notified', notified_at = now(), due_date = p_due_date
     where c.status = 'open'
       and (p_charge_ids is null or c.id = any (p_charge_ids))
       and (p_kind is null or c.kind = p_kind)
       and (p_period_label is null or c.period_label = p_period_label)
    returning c.id, c.payer_id, c.member_id, c.amount_cents, c.description
  ), beschriftet as (
    -- Wessen Forderung ist das? Bei einem Vater mit zwei Kindern stuende sonst
    -- zweimal "Mitgliedsbeitrag 2026" untereinander, ohne dass erkennbar
    -- waere, fuer wen - und genau danach fragt der Anruf beim Kassenwart.
    select a.payer_id, a.amount_cents, a.description ||
           case when a.member_id <> a.payer_id
                then ' fuer ' || private.member_label(a.member_id)
                else '' end as text
    from aktualisiert a
  ), nachricht as (
    -- Eine Nachricht je Zahler, nicht je Forderung: der Vater soll einmal
    -- lesen, was insgesamt abgeht, nicht dreimal einen Teilbetrag.
    insert into public.notifications (member_id, kind, title, body)
    select
      b.payer_id,
      'charge_announced',
      'Lastschrift am ' || to_char(p_due_date, 'DD.MM.YYYY'),
      'Am ' || to_char(p_due_date, 'DD.MM.YYYY') || ' ziehen wir ' ||
      private.cent_text(sum(b.amount_cents)::integer) || ' Euro von deinem Konto ein: ' ||
      string_agg(b.text, '; ' order by b.text) ||
      '. Bitte sorge fuer Deckung.'
    from beschriftet b
    group by b.payer_id
    returning member_id
  )
  select count(*)::integer,
         (select count(*)::integer from nachricht),
         coalesce(sum(a.amount_cents), 0)::integer
    into v_anzahl, v_empfaenger, v_summe
  from aktualisiert a;

  return query select v_anzahl, v_empfaenger, v_summe, p_due_date;
end; $$;

revoke execute on function public.announce_charges(
  date, public.charge_kind, text, uuid[]) from public, anon;
grant execute on function public.announce_charges(
  date, public.charge_kind, text, uuid[]) to authenticated;

/**
 * Was liesse sich jetzt ankuendigen?
 *
 * Die Oberflaeche braucht drei Zahlen, bevor der Vorstand den Knopf drueckt:
 * wie viele Forderungen, ueber welche Summe, an wie viele Zahler. Die dritte
 * ist die interessanteste - sie ist kleiner als die erste, sobald Familien
 * dabei sind, und macht sichtbar, dass je Zahler eine Nachricht rausgeht.
 */
create or replace function public.announceable_charges(
  p_kind public.charge_kind default null,
  p_period_label text default null
)
returns table (anzahl integer, summe_cents integer, zahler integer)
language sql stable security definer set search_path = '' as $$
  select count(*)::integer,
         coalesce(sum(c.amount_cents), 0)::integer,
         count(distinct c.payer_id)::integer
  from public.charges c
  where private.is_admin()
    and c.status = 'open'
    and (p_kind is null or c.kind = p_kind)
    and (p_period_label is null or c.period_label = p_period_label);
$$;

revoke execute on function public.announceable_charges(public.charge_kind, text)
  from public, anon;
grant execute on function public.announceable_charges(public.charge_kind, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Der Monatsueberblick nennt jetzt auch, was noch anzukuendigen ist
--
-- Ohne diese Spalte muesste die Oberflaeche je Monat einzeln nachfragen, ob
-- der dritte Schritt noch aussteht - und der Vorstand saehe erst nach dem
-- Klick, dass es nichts zu tun gab.
-- ---------------------------------------------------------------------------
drop function if exists public.billing_period_overview(integer);

create function public.billing_period_overview(p_limit integer default 12)
returns table (
  id uuid, year integer, month integer, status public.billing_period_status,
  buchungen integer, mitglieder integer, summe_cents integer,
  forderungen integer, offen integer, offen_cents integer,
  closed_at timestamptz, charged_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    b.id, b.year, b.month, b.status,
    (select count(*)::integer from public.drink_purchases p
      where p.billing_period_id = b.id and p.voided_at is null),
    (select count(distinct p.member_id)::integer from public.drink_purchases p
      where p.billing_period_id = b.id and p.voided_at is null),
    (select coalesce(sum(p.total_cents), 0)::integer from public.drink_purchases p
      where p.billing_period_id = b.id and p.voided_at is null),
    (select count(*)::integer from public.charges c
      where c.kind = 'drinks' and c.status <> 'waived'
        and c.period_label = b.year || '-' || lpad(b.month::text, 2, '0')),
    (select count(*)::integer from public.charges c
      where c.kind = 'drinks' and c.status = 'open'
        and c.period_label = b.year || '-' || lpad(b.month::text, 2, '0')),
    (select coalesce(sum(c.amount_cents), 0)::integer from public.charges c
      where c.kind = 'drinks' and c.status = 'open'
        and c.period_label = b.year || '-' || lpad(b.month::text, 2, '0')),
    b.closed_at, b.charged_at
  from public.billing_periods b
  where private.is_admin()
  order by b.year desc, b.month desc
  limit greatest(coalesce(p_limit, 12), 1);
$$;

revoke execute on function public.billing_period_overview(integer) from public, anon;
grant  execute on function public.billing_period_overview(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Die Ankuendigung geht auch per Mail
--
-- Sie steht in der Liste der Arten, die ueber die App hinaus zugestellt
-- werden. Anders als bei den Buchungshinweisen ist das keine Frage der
-- Bequemlichkeit: wer die App wochenlang nicht oeffnet, soll trotzdem wissen,
-- dass Geld abgeht.
-- ---------------------------------------------------------------------------
update public.settings
   set value = to_jsonb(
     'booking_displaced,booking_cancelled,booking_removed,application_new,charge_announced'::text)
 where key = 'notifications.mail_kinds'
   and value #>> '{}' not like '%charge_announced%';

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
     '"booking_displaced,booking_cancelled,booking_removed,application_new,charge_announced"'::jsonb,
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

update public.settings
   set description = 'Pflicht vor jedem Einzug. So viele Tage muessen zwischen '
                     'Ankuendigung und Faelligkeit liegen.'
 where key = 'sepa.prenotification_days';
