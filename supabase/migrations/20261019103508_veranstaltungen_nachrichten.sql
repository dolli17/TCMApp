-- ===========================================================================
-- Veranstaltungen, Schritt 3: Benachrichtigungen
--
-- Derselbe Weg wie bei den Buchungen: eine Zeile in public.notifications,
-- die Glocke in Web und App zeigt sie, claim_notification_mails und
-- claim_notification_pushes holen sie fuer Mail und Push ab. Neu ist nur der
-- Verweis event_id, damit Glocke, Push und Mail auf die Veranstaltung fuehren.
--
-- Die Anlaesse:
--   event_published  Veroeffentlicht - an alle aktiven Mitglieder, wenn der
--                    Vorstand es beim Veroeffentlichen so will
--                    (event_mitglieder_benachrichtigen, einmal je Veranstaltung)
--   event_promoted   Von der Warteliste nachgerueckt, mit dem Betrag
--   event_cancelled  Abgesagt - an Angemeldete und Wartende
--   event_changed    Tag, Uhrzeit oder Ort geaendert - an Angemeldete und
--                    Wartende
--
-- Die letzten drei sind Trigger: sie greifen, egal welche RPC die Aenderung
-- macht (Mitglied meldet sich ab, Vorstand korrigiert, mehr Plaetze …).
-- Doppelte Nachrichten entstehen nicht, weil nur ein echter Uebergang
-- ausloest - wer dasselbe noch einmal speichert, aendert nichts.
--
-- Abwaertskompatibel: neue Spalten sind nullable, my_notifications liefert
-- eine Spalte mehr, die Claim-Funktionen einen Schluessel mehr je Posten.
-- ===========================================================================

alter table public.notifications
  add column if not exists event_id uuid references public.events (id) on delete set null;

create index if not exists notifications_event_idx
  on public.notifications (event_id, kind) where event_id is not null;

comment on column public.notifications.event_id is
  'Veranstaltung, um die es geht - Glocke, Push und Mail verlinken dorthin.';

alter table public.events
  add column if not exists members_notified_at timestamptz;

comment on column public.events.members_notified_at is
  'Wann alle Mitglieder ueber die Veroeffentlichung benachrichtigt wurden. null = nie.';

-- ---------------------------------------------------------------------------
-- Texte
-- ---------------------------------------------------------------------------

/** "am 06.11.2026, 19:00-23:30 Uhr, Clubhaus" - Tag, Zeit und Ort fuer Nachrichten. */
create or replace function private.event_wann(
  p_starts_at timestamptz, p_ends_at timestamptz, p_location text
)
returns text language sql stable set search_path = '' as $$
  select 'am ' || to_char(p_starts_at at time zone 'Europe/Berlin', 'DD.MM.YYYY') || ', '
      || to_char(p_starts_at at time zone 'Europe/Berlin', 'HH24:MI')
      || case
           when p_ends_at is null then ' Uhr'
           when (p_ends_at at time zone 'Europe/Berlin')::date = (p_starts_at at time zone 'Europe/Berlin')::date
             then '-' || to_char(p_ends_at at time zone 'Europe/Berlin', 'HH24:MI') || ' Uhr'
           else ' Uhr bis ' || to_char(p_ends_at at time zone 'Europe/Berlin', 'DD.MM.YYYY, HH24:MI') || ' Uhr'
         end
      || coalesce(', ' || p_location, '');
$$;

-- ---------------------------------------------------------------------------
-- 1. Veroeffentlicht: alle aktiven Mitglieder
-- ---------------------------------------------------------------------------

/**
 * Alle aktiven Mitglieder ueber eine veroeffentlichte Veranstaltung
 * benachrichtigen. Rueckgabe: wie viele Nachrichten entstanden sind.
 *
 * Genau einmal je Veranstaltung (members_notified_at): ein zweiter Aufruf,
 * etwa nach erneutem Speichern, tut nichts und meldet 0. Vorbei oder
 * abgesagt: ebenfalls nichts. Der Vorstand selbst bekommt keine Nachricht.
 */
create or replace function public.event_mitglieder_benachrichtigen(p_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  v_body text;
  v_anzahl integer;
begin
  perform private.pruefe_event_admin();

  select * into e from public.events where id = p_id for update;
  if e.id is null then
    raise exception 'Diese Veranstaltung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if e.status <> 'published' or e.members_notified_at is not null
     or coalesce(e.ends_at, e.starts_at) < now() then
    return 0;
  end if;

  v_body := case e.kind
              when 'arbeitsdienst' then 'Arbeitsdienst'
              when 'fest' then 'Fest'
              else 'Termin'
            end || ' ' || private.event_wann(e.starts_at, e.ends_at, e.location) || '.'
         || case
              when e.registration_enabled and now() < private.event_schluss(e) then
                ' Anmeldung bis '
                || to_char(private.event_schluss(e) at time zone 'Europe/Berlin', 'DD.MM.YYYY') || '.'
              else ''
            end;

  insert into public.notifications (member_id, kind, title, body, event_id)
  select m.id, 'event_published', 'Neu im Verein: ' || e.title, v_body, e.id
  from public.members m
  where m.status = 'active'
    and m.id is distinct from private.current_member_id();
  get diagnostics v_anzahl = row_count;

  update public.events set members_notified_at = now() where id = p_id;
  return v_anzahl;
end; $$;

revoke execute on function public.event_mitglieder_benachrichtigen(uuid) from public, anon;
grant  execute on function public.event_mitglieder_benachrichtigen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Nachgerueckt: von der Warteliste auf einen Platz
-- ---------------------------------------------------------------------------

/**
 * Aus "waitlisted" wird "registered" - durch private.event_nachruecken oder
 * weil der Vorstand jemanden aufnimmt. Der Betrag ist der der Forderung:
 * Preis mal Personen (private.event_forderung_abgleichen rechnet genauso).
 * Wer sich selbst nachrueckt (weniger Begleitpersonen), sieht es ohnehin.
 */
create or replace function private.event_nachgerueckt_melden()
returns trigger language plpgsql security definer set search_path = '' as $$
declare e public.events; v_betrag integer;
begin
  if new.member_id is not distinct from private.current_member_id() then
    return null;
  end if;
  select * into e from public.events where id = new.event_id;
  if e.status <> 'published' then
    return null;
  end if;
  v_betrag := coalesce(e.fee_cents, 0) * (1 + new.companions);

  insert into public.notifications (member_id, kind, title, body, event_id)
  values (
    new.member_id, 'event_promoted', 'Du bist nachgerueckt',
    format('Fuer %s %s ist ein Platz frei geworden - du bist jetzt angemeldet.',
           e.title, private.event_wann(e.starts_at, e.ends_at, e.location))
    || case when v_betrag > 0
         then format(' Die Gebuehr von %s Euro steht in deinem Konto.', private.cent_text(v_betrag))
         else '' end,
    e.id
  );
  return null;
end; $$;

drop trigger if exists event_registrations_nachgerueckt on public.event_registrations;
create trigger event_registrations_nachgerueckt
  after update of status on public.event_registrations
  for each row
  when (old.status = 'waitlisted' and new.status = 'registered')
  execute function private.event_nachgerueckt_melden();

-- ---------------------------------------------------------------------------
-- 3. Abgesagt und 4. verlegt: Angemeldete und Wartende
-- ---------------------------------------------------------------------------

/**
 * Absage: an alle, die angemeldet sind oder warten. Der Trigger laeuft, bevor
 * event_absagen die offenen Forderungen loescht - so laesst sich je Mitglied
 * sagen, ob die Gebuehr entfaellt oder schon im Einzug steckt.
 *
 * Verlegt: nur wenn sich Beginn, Ende oder Ort wirklich aendern und die
 * Veranstaltung noch bevorsteht. Titel, Beschreibung oder Preis loesen
 * nichts aus; dasselbe noch einmal speichern auch nicht.
 */
create or replace function private.event_aenderung_melden()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'published' and new.status = 'cancelled' then
    insert into public.notifications (member_id, kind, title, body, event_id)
    select r.member_id, 'event_cancelled', 'Abgesagt: ' || new.title,
           format('%s %s faellt aus.', new.title,
                  private.event_wann(new.starts_at, new.ends_at, new.location))
           || case
                when c.id is null then ''
                when private.forderung_gesperrt(c) then
                  ' Die Gebuehr ist schon im Einzug - der Verein meldet sich wegen der Erstattung.'
                else ' Die Gebuehr entfaellt.'
              end,
           new.id
    from public.event_registrations r
    left join public.charges c
      on c.event_id = r.event_id and c.member_id = r.member_id and c.status <> 'waived'
    where r.event_id = new.id
      and r.status in ('registered', 'waitlisted')
      and r.member_id is distinct from private.current_member_id();

  elsif old.status = 'published' and new.status = 'published'
        and (old.starts_at, old.ends_at, old.location)
            is distinct from (new.starts_at, new.ends_at, new.location)
        and coalesce(new.ends_at, new.starts_at) > now() then
    insert into public.notifications (member_id, kind, title, body, event_id)
    select r.member_id, 'event_changed', 'Geaendert: ' || new.title,
           format('%s findet jetzt %s statt (bisher %s).', new.title,
                  private.event_wann(new.starts_at, new.ends_at, new.location),
                  private.event_wann(old.starts_at, old.ends_at, old.location)),
           new.id
    from public.event_registrations r
    where r.event_id = new.id
      and r.status in ('registered', 'waitlisted')
      and r.member_id is distinct from private.current_member_id();
  end if;
  return null;
end; $$;

drop trigger if exists events_aenderung_melden on public.events;
create trigger events_aenderung_melden
  after update of status, starts_at, ends_at, location on public.events
  for each row
  execute function private.event_aenderung_melden();

-- ---------------------------------------------------------------------------
-- Lesen: my_notifications mit dem Verweis
-- ---------------------------------------------------------------------------
drop function if exists public.my_notifications(integer);

create function public.my_notifications(p_limit integer default 30)
returns table (
  id uuid, kind text, title text, body text,
  read_at timestamptz, created_at timestamptz, event_id uuid
)
language sql stable security definer set search_path = '' as $$
  select n.id, n.kind, n.title, n.body, n.read_at, n.created_at, n.event_id
  from public.notifications n
  where n.member_id = private.current_member_id()
  order by (n.read_at is null) desc, n.created_at desc
  limit greatest(coalesce(p_limit, 30), 1);
$$;

revoke execute on function public.my_notifications(integer) from public, anon;
grant  execute on function public.my_notifications(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Mail und Push: event_id je Posten, damit der Link stimmt
-- ---------------------------------------------------------------------------
create or replace function public.claim_notification_mails(p_limit integer default 200)
returns table (
  member_id uuid, email text, first_name text,
  notification_ids uuid[], items jsonb
)
language plpgsql security definer set search_path = '' as $$
begin
  -- Angemeldete Menschen haben hier nichts zu suchen; der Aufrufer ist der
  -- Versanddienst mit Dienstschluessel (auth.uid() ist dann null) oder ein
  -- Admin, der von Hand anstoesst.
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Benachrichtigungs-Mails darf nur der Versanddienst abholen.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Zwei Laeufe duerfen sich nicht ueberholen.
  perform pg_advisory_xact_lock(hashtext('notification_mails'));

  return query
  with kandidaten as (
    select n.id from public.notifications n
    where n.mailed_at is null
    order by n.created_at
    limit greatest(coalesce(p_limit, 200), 1)
    for update skip locked
  ),
  abgehakt as (
    update public.notifications n
       set mailed_at = now()
      from kandidaten k
     where n.id = k.id
    returning n.id, n.member_id, n.kind, n.title, n.body, n.created_at, n.event_id
  )
  select
    m.id,
    m.email::text,
    m.first_name,
    array_agg(a.id order by a.created_at),
    jsonb_agg(jsonb_build_object(
      'kind', a.kind, 'title', a.title, 'body', a.body, 'created_at', a.created_at,
      'event_id', a.event_id
    ) order by a.created_at)
  from abgehakt a
  join public.members m on m.id = a.member_id
  cross join lateral (select private.notification_mail_preference(m.id) as wahl) w
  where m.status = 'active'
    and m.email is not null
    -- Grobe Formpruefung: der Stapelversand lehnt sonst wegen einer kaputten
    -- Adresse die ganze Anfrage ab.
    and m.email::text ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
    -- Reservierte Testadressen nie anschreiben (siehe ist_testadresse): die
    -- Mitteilung ist abgehakt und steht unter der Glocke, verschickt wird sie
    -- nicht.
    and not public.ist_testadresse(m.email::text)
    and a.created_at > now() - interval '1 day'
    and w.wahl <> 'keine'
    and (w.wahl = 'alle' or a.kind = any (private.notification_mail_kinds()))
  group by m.id, m.email, m.first_name;
end; $$;

revoke execute on function public.claim_notification_mails(integer) from public, anon;
grant  execute on function public.claim_notification_mails(integer) to authenticated, service_role;

create or replace function public.claim_notification_pushes(p_limit integer default 200)
returns table (
  member_id uuid, tokens text[], notification_ids uuid[], items jsonb
)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Push-Benachrichtigungen darf nur der Versanddienst abholen.'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext('notification_pushes'));

  return query
  with kandidaten as (
    select n.id from public.notifications n
    where n.pushed_at is null
    order by n.created_at
    limit greatest(coalesce(p_limit, 200), 1)
    for update skip locked
  ),
  abgehakt as (
    update public.notifications n
       set pushed_at = now()
      from kandidaten k
     where n.id = k.id
    returning n.id, n.member_id, n.kind, n.title, n.body, n.created_at, n.event_id
  )
  -- Die Marken als Unterabfrage und nicht als Join: bei zwei Geraeten
  -- verdoppelte der Join jede Nachricht, und ein distinct darueber haette die
  -- Sortierung nach Zeitpunkt gekostet.
  select
    m.id,
    (select array_agg(p.token order by p.last_seen_at desc)
       from public.push_tokens p
      where p.member_id = m.id and p.disabled_at is null),
    array_agg(a.id order by a.created_at),
    jsonb_agg(jsonb_build_object(
      'kind', a.kind, 'title', a.title, 'body', a.body, 'created_at', a.created_at,
      'event_id', a.event_id
    ) order by a.created_at)
  from abgehakt a
  join public.members m on m.id = a.member_id
  where m.status = 'active'
    and a.created_at > now() - interval '1 day'
    and a.kind = any (private.notification_push_kinds())
    and exists (
      select 1 from public.push_tokens p
       where p.member_id = m.id and p.disabled_at is null
    )
  group by m.id;
end; $$;

revoke execute on function public.claim_notification_pushes(integer) from public, anon;
grant  execute on function public.claim_notification_pushes(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Welche Arten per Mail und Push gehen
--
-- Push: alle vier. Mail: was etwas verlangt oder kostet (nachgerueckt,
-- abgesagt, verlegt). "Neu im Verein" bekommt per Mail nur, wer bei "E-Mails
-- zu Buchungen" auf "Alle" steht - an jedes Mitglied waere das eine Rundmail.
-- ---------------------------------------------------------------------------
update public.settings
   set value = to_jsonb(concat_ws(',', nullif(btrim(value #>> '{}'), ''), 'event_promoted,event_cancelled,event_changed'))
 where key = 'notifications.mail_kinds'
   and not ('event_promoted' = any (string_to_array(coalesce(value #>> '{}', ''), ',')));

update public.settings
   set value = to_jsonb(concat_ws(',', nullif(btrim(value #>> '{}'), ''), 'event_published,event_promoted,event_cancelled,event_changed'))
 where key = 'notifications.push_kinds'
   and not ('event_published' = any (string_to_array(coalesce(value #>> '{}', ''), ',')));

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
     '"booking_displaced,booking_cancelled,booking_removed,booking_added,player_joined,player_left,application_new,booking_moved,event_published,event_promoted,event_cancelled,event_changed"'::jsonb,
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
