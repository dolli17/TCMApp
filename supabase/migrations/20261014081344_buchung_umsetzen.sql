-- ===========================================================================
-- Buchung umsetzen: auf einen anderen Platz oder eine andere Zeit
--
-- Regnet es auf Platz 3 durch, soll der Platzwart die Buchung dort auf einen
-- freien Platz legen koennen, statt sie zu stornieren und die Leute neu buchen
-- zu lassen. Bisher ging das nur per SQL.
--
-- Bewusst eng gefasst:
-- - Nur normale Buchungen. Sperrungen und Serientermine gehoeren dem Verein
--   und werden ueber ihre eigenen Wege geaendert.
-- - Nur auf freie Plaetze. Wer dort steht, wird nicht verdraengt.
-- - Eine laufende Buchung wechselt nur den Platz. Die Zeit laesst sich nur vor
--   Beginn aendern, und nie in die Vergangenheit.
-- - Die Dauer bleibt. Raster, Oeffnungs- und Schliesszeit gelten wie in
--   create_booking; der Buchungsvorlauf (lead_days) nicht - die
--   Platzverwaltung darf auch weiter vorne planen.
--
-- Die Doppelbelegung pro Person prueft der Trigger bookings_spielt_schon, der
-- bei jeder Aenderung des Zeitraums anspringt. Ein reiner Platzwechsel aendert
-- den Zeitraum nicht und belegt deshalb auch niemanden neu.
-- ===========================================================================

/**
 * Setzt eine Buchung auf einen anderen Platz und/oder eine andere Startzeit.
 *
 * Darf nur, wer die Plaetze verwaltet (private.darf_plaetze). Bucher und
 * Mitspieler werden benachrichtigt, nicht aber der, der umsetzt. p_reason ist
 * hier optional; die Oberflaeche verlangt ihn bei fremden Buchungen.
 */
create or replace function public.move_booking(
  p_booking_id uuid, p_court_id uuid, p_starts_at timestamptz, p_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_court public.courts%rowtype;
  v_dauer interval;
  v_ends_at timestamptz;
  v_slot tstzrange;
  v_zeit_neu boolean;
  v_local_start time; v_local_end time;
  v_opening time := public.setting_time('booking.opening_time');
  v_closing time := public.setting_time('booking.closing_time');
  v_grid integer := public.setting_int('booking.slot_minutes');
  v_alt text; v_neu text; v_text text;
begin
  if v_me is null or not private.darf_plaetze() then
    raise exception 'Buchungen umsetzen kann nur die Platzverwaltung.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Gesperrt, damit niemand gleichzeitig storniert oder dieselbe Buchung
  -- woandershin setzt.
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.status <> 'active' then
    raise exception 'Diese Buchung ist storniert.' using errcode = 'check_violation';
  end if;
  -- Serientermine sind selbst Blockungen; deshalb zuerst, mit eigener Meldung.
  if v_booking.series_id is not null then
    raise exception 'Ein Serientermin laesst sich nicht einzeln umsetzen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if v_booking.kind <> 'booking' then
    raise exception 'Eine Sperrung laesst sich nicht umsetzen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if upper(v_booking.slot) <= now() then
    raise exception 'Die Buchung ist schon vorbei.' using errcode = 'check_violation';
  end if;

  select * into v_court from public.courts where id = p_court_id;
  if not found or not v_court.active then
    raise exception 'Auf diesen Platz kann nicht umgesetzt werden, er ist stillgelegt.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_zeit_neu := p_starts_at is distinct from lower(v_booking.slot);
  if p_court_id = v_booking.court_id and not v_zeit_neu then
    raise exception 'Die Buchung liegt schon dort.' using errcode = 'invalid_parameter_value';
  end if;

  v_dauer   := upper(v_booking.slot) - lower(v_booking.slot);
  v_ends_at := p_starts_at + v_dauer;
  v_slot    := tstzrange(p_starts_at, v_ends_at, '[)');

  -- Die Zeit wird nur geprueft, wenn sie sich aendert: ein reiner Platzwechsel
  -- uebernimmt die Zeit, die schon gilt.
  if v_zeit_neu then
    if lower(v_booking.slot) <= now() then
      raise exception 'Die Buchung laeuft schon - sie kann nur noch den Platz wechseln.'
        using errcode = 'invalid_parameter_value';
    end if;

    -- Raster, Oeffnung und Schluss wie in create_booking.
    if extract(second from p_starts_at) <> 0
       or (extract(minute from p_starts_at)::integer % v_grid) <> 0 then
      raise exception 'Startzeit muss auf ein %-Minuten-Raster fallen.', v_grid
        using errcode = 'invalid_parameter_value';
    end if;

    v_local_start := (p_starts_at at time zone 'Europe/Berlin')::time;
    v_local_end   := (v_ends_at   at time zone 'Europe/Berlin')::time;

    if v_local_start < v_opening then
      raise exception 'Vor % wird nicht gespielt.', to_char(v_opening, 'HH24:MI')
        using errcode = 'invalid_parameter_value';
    end if;
    if v_local_end > v_closing or v_local_end <= v_local_start then
      raise exception 'Die Buchung endet nach % Uhr.', to_char(v_closing, 'HH24:MI')
        using errcode = 'invalid_parameter_value';
    end if;
    if p_starts_at < now() then
      raise exception 'Dieser Zeitpunkt liegt in der Vergangenheit.'
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  -- Erst der Platz, dann die Personen: ist der Platz belegt, ist das die
  -- treffendere Meldung. Die eigene Buchung zaehlt nicht mit - wer eine halbe
  -- Stunde nach hinten rutscht, ueberschneidet sich nur mit sich selbst.
  if exists (
    select 1 from public.bookings b
    where b.court_id = p_court_id and b.status = 'active'
      and b.slot && v_slot and b.id <> p_booking_id
  ) then
    raise exception 'Dieser Platz ist zu der Zeit bereits belegt.'
      using errcode = 'exclusion_violation';
  end if;

  v_alt := private.booking_label(p_booking_id);

  -- Faengt das Rennen mit einer gleichzeitigen Buchung auf dem Zielplatz ab.
  begin
    update public.bookings set court_id = p_court_id, slot = v_slot
     where id = p_booking_id;
  exception when exclusion_violation then
    raise exception 'Dieser Platz ist zu der Zeit bereits belegt.'
      using errcode = 'exclusion_violation';
  end;

  v_neu := private.booking_label(p_booking_id);

  -- Die offene Gastgebuehr nennt Platz und Zeit; sonst stuende auf der
  -- Lastschrift eine Buchung, die es so nie gab.
  update public.charges
     set description = 'Gastgebuehr ' || v_neu
   where booking_id = p_booking_id and kind = 'guest' and status = 'open';

  v_text := format('Die Buchung am %s wurde verlegt: neu am %s.', v_alt, v_neu);
  if p_reason is not null and btrim(p_reason) <> '' then
    v_text := v_text || ' Grund: ' || btrim(p_reason);
  end if;

  insert into public.notifications (member_id, kind, title, body)
  select distinct p.member_id, 'booking_moved', 'Deine Platzbuchung wurde verlegt', v_text
  from (
    select v_booking.member_id as member_id
    union
    select bp.member_id from public.booking_players bp
    where bp.booking_id = p_booking_id and bp.member_id is not null
  ) p
  where p.member_id is not null and p.member_id <> v_me;
end; $$;

revoke execute on function public.move_booking(uuid, uuid, timestamptz, text) from public, anon;
grant  execute on function public.move_booking(uuid, uuid, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Das Verlegen geht per Mail und Push hinaus
--
-- Wer um 18 Uhr auf Platz 3 kommt und dort nichts mehr findet, haette es
-- wissen muessen. Angehaengt wird nur, wenn die Art noch fehlt; eine Liste,
-- die der Vorstand geleert hat, bekommt nur diese eine Art.
-- ---------------------------------------------------------------------------
update public.settings
   set value = to_jsonb(concat_ws(',', nullif(btrim(value #>> '{}'), ''), 'booking_moved'))
 where key in ('notifications.mail_kinds', 'notifications.push_kinds')
   and not ('booking_moved' = any (string_to_array(coalesce(value #>> '{}', ''), ',')));

-- Dieselben Vorgaben fuer eine frische Datenbank.
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
     '"booking_displaced,booking_cancelled,booking_removed,application_new,charge_announced,charge_returned,booking_moved"'::jsonb,
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
     'Aeltere Eintraege werden beim Aufraeumlauf entfernt. 1095 Tage sind drei Jahre.'),
    ('notifications.push_kinds',
     '"booking_displaced,booking_cancelled,booking_removed,booking_added,player_joined,player_left,application_new,booking_moved"'::jsonb,
     'text', 'Benachrichtigungen, die auch als Push gehen',
     'Kommagetrennte Liste. Getrennt von den E-Mail-Arten, weil ein Push sofort '
     'da ist und auch Erfreuliches melden darf, das als Mail nur Laerm waere.')
  on conflict (key) do nothing;

  select count(*) into v_after from public.settings;
  return v_after - v_before;
end;
$$;


revoke execute on function public.ensure_default_settings() from public, anon, authenticated;
