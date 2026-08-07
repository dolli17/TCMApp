-- ===========================================================================
-- Benachrichtigungen per E-Mail
--
-- Bisher erreicht eine Benachrichtigung nur, wer die App aufschlaegt. Wer aus
-- einer Buchung ausgetragen oder von einer Platzsperrung verdraengt wird,
-- erfaehrt es womoeglich erst am Platz. notifications.mailed_at und der
-- Teilindex notifications_unmailed_idx liegen seit dem ersten Tag bereit - sie
-- waren fuer genau das gedacht.
--
-- Diese Migration baut die Datenbankseite: was verschickt werden soll, an wen,
-- und wie verhindert wird, dass es zweimal rausgeht. Der Versand selbst laeuft
-- in der Edge Function notification-mails; der Zeitgeber steht als Snippet in
-- supabase/snippets/, weil er umgebungsabhaengig ist und kein Schema.
-- ===========================================================================

comment on column public.notifications.mailed_at is
  'Abgehakt, nicht zwingend verschickt. Auch eine Nachricht ohne Empfaenger, '
  'ohne Einwilligung oder aelter als einen Tag wird abgehakt - sonst bliebe sie '
  'ewig im Teilindex und jeder Lauf wuerde sie erneut ansehen.';

-- ---------------------------------------------------------------------------
-- Was verschickt wird, steht in den Einstellungen
-- ---------------------------------------------------------------------------

/**
 * Die Arten, die eine Mail wert sind.
 *
 * Verschickt wird, was dem Empfaenger etwas wegnimmt und wozu er handeln muss:
 * verdraengt, storniert, ausgetragen. Nicht verschickt werden booking_added,
 * player_joined und player_left - erfreulich, aber nichts, wofuer jemand eine
 * E-Mail bekommen will. application_new geht mit, weil ein Antrag sonst liegen
 * bleibt, bis zufaellig jemand die App oeffnet.
 *
 * Als Einstellung und nicht als Liste im Code, weil in diesem Projekt alle
 * Regelwerte in settings stehen.
 */
create or replace function private.notification_mail_kinds()
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(
    string_to_array(
      nullif(btrim(public.setting_text('notifications.mail_kinds')), ''), ','),
    '{}'::text[]);
$$;

/**
 * Was hat das Mitglied gewaehlt: alle, wichtige oder keine?
 *
 * Ohne gesetzten Wert gilt 'wichtige'. Das Merkmal ist eine Liste und kein
 * Ja/Nein, weil bei den Ja/Nein-Merkmalen allein die Existenz der Zeile
 * "eingewilligt" bedeutet - ein Widerspruchs-Datensatz in einer Tabelle mit
 * dieser Semantik waere eine Falle fuer den naechsten Leser.
 */
create or replace function private.notification_mail_preference(p_member_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select o.value
     from public.member_attribute_values v
     join public.member_attribute_types t on t.id = v.attribute_type_id
     join public.member_attribute_options o on o.id = v.option_id
     where v.member_id = p_member_id and t.code = 'booking_mail'
     limit 1),
    'wichtige');
$$;

-- ---------------------------------------------------------------------------
-- Abholen und abhaken - in einem Zug
-- ---------------------------------------------------------------------------

/**
 * Holt die noch nicht bearbeiteten Benachrichtigungen und markiert sie im
 * selben Zug als abgehakt.
 *
 * Erst markieren, dann senden - nicht umgekehrt. Ueber einen HTTP-Aufruf hinweg
 * gibt es keine Transaktionsklammer: wer erst sendet und danach markiert,
 * verschickt bei einem Absturz dazwischen beim naechsten Lauf alles noch
 * einmal. Bei 300 Mitgliedern ist das der Unterschied zwischen einer verlorenen
 * Mail und dreihundert doppelten. Die verlorene ist der bessere Fehler - die
 * Nachricht steht ja weiterhin in der App.
 *
 * Gebuendelt je Empfaenger: eine Serienanlage mit sechzig Terminen erzeugt
 * sechzig Benachrichtigungen in Sekunden. Als sechzig Einzelmails waere das ein
 * Grund, den Absender zu sperren.
 *
 * Nichts, was aelter als einen Tag ist: eine Mail ueber eine Platzsperrung von
 * vorgestern nuetzt niemandem. Das macht nebenbei den allerersten Lauf nach der
 * Inbetriebnahme von selbst harmlos.
 */
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
    returning n.id, n.member_id, n.kind, n.title, n.body, n.created_at
  )
  select
    m.id,
    m.email::text,
    m.first_name,
    array_agg(a.id order by a.created_at),
    jsonb_agg(jsonb_build_object(
      'kind', a.kind, 'title', a.title, 'body', a.body, 'created_at', a.created_at
    ) order by a.created_at)
  from abgehakt a
  join public.members m on m.id = a.member_id
  cross join lateral (select private.notification_mail_preference(m.id) as wahl) w
  where m.status = 'active'
    and m.email is not null
    -- Grobe Formpruefung: der Stapelversand lehnt sonst wegen einer kaputten
    -- Adresse die ganze Anfrage ab.
    and m.email::text ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
    and a.created_at > now() - interval '1 day'
    and w.wahl <> 'keine'
    and (w.wahl = 'alle' or a.kind = any (private.notification_mail_kinds()))
  group by m.id, m.email, m.first_name;
end; $$;

revoke execute on function public.claim_notification_mails(integer) from public, anon;
grant  execute on function public.claim_notification_mails(integer) to authenticated, service_role;

/**
 * Gibt abgehakte Benachrichtigungen wieder frei.
 *
 * Fuer den Fall, dass der Versanddienst nicht antwortet oder mit einem Fehler
 * abbricht: dann war das Abhaken verfrueht, und der naechste Lauf soll es noch
 * einmal versuchen. Bewusst kein Wiederholen innerhalb eines Laufs - fuenf
 * Minuten spaeter ist frueh genug.
 */
create or replace function public.release_notification_mails(p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_anzahl integer;
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Benachrichtigungs-Mails darf nur der Versanddienst freigeben.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.notifications
     set mailed_at = null
   where id = any (coalesce(p_ids, '{}'::uuid[]));
  get diagnostics v_anzahl = row_count;

  return v_anzahl;
end; $$;

revoke execute on function public.release_notification_mails(uuid[]) from public, anon;
grant  execute on function public.release_notification_mails(uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Startwerte
-- ---------------------------------------------------------------------------

/**
 * Das Merkmal fuer die Abmeldung.
 *
 * Merkmalstypen stehen sonst im Seed - das sind Vereinsdaten, keine Struktur.
 * Dieses hier braucht die Versandfunktion aber, um ueberhaupt zu wissen, wen
 * sie fragen soll. Deshalb legt es die Migration an, wenn es fehlt: einmal
 * produktiv, und lokal faengt es der Seed ohnehin ab.
 */
insert into public.member_attribute_types
  (code, name, description, value_kind, multiple, self_editable, in_application, sort_order)
values
  ('booking_mail', 'E-Mails zu Buchungen',
   'Ob Aenderungen an deinen Platzbuchungen zusaetzlich per E-Mail kommen. '
   'In der App siehst du sie in jedem Fall.',
   'list', false, true, false, 25)
on conflict (code) do nothing;

insert into public.member_attribute_options (attribute_type_id, value, label, sort_order)
select t.id, v.value, v.label, v.sort_order
from public.member_attribute_types t
cross join (values
  ('alle',     'Alle Benachrichtigungen', 1),
  ('wichtige', 'Nur Wichtiges',           2),
  ('keine',    'Keine E-Mails',           3)
) as v(value, label, sort_order)
where t.code = 'booking_mail'
on conflict (attribute_type_id, value) do nothing;

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
     '"booking_displaced,booking_cancelled,booking_removed,application_new"'::jsonb,
     'text', 'Benachrichtigungen, die auch per E-Mail gehen',
     'Kommagetrennte Liste. Wer bei "E-Mails zu Buchungen" auf "Alle" steht, '
     'bekommt jede Art; alle anderen nur diese hier.'),
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

select public.ensure_default_settings();
