-- ===========================================================================
-- Benachrichtigungen als Push
--
-- Eine Mail erreicht das Mitglied, wenn es sein Postfach oeffnet; eine
-- Benachrichtigung in der App, wenn es die App oeffnet. Beides taugt nicht
-- fuer die Nachricht, die zaehlt: der Platz ist gesperrt, das Spiel in einer
-- Stunde faellt aus.
--
-- Der Push ist der zweite Verbraucher derselben Warteschlange, die schon der
-- Mailversand nutzt - gleiche Bauform, eigene Abhak-Spalte. Der Versand selbst
-- laeuft in der Edge Function notification-pushes; der Zeitgeber steht als
-- Snippet in supabase/snippets/, weil er umgebungsabhaengig ist und kein
-- Schema.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Die Geraete
-- ---------------------------------------------------------------------------

create table public.push_tokens (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members (id) on delete cascade,
  token        text not null unique,
  platform     text not null check (platform in ('ios', 'android')),
  device_name  text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at  timestamptz
);

comment on table public.push_tokens is
  'Geraete, die Benachrichtigungen empfangen. Ein Mitglied kann mehrere haben.';

comment on column public.push_tokens.token is
  'Global eindeutig, nicht je Mitglied: meldet sich auf einem Familientelefon '
  'ein anderes Mitglied an, muss die Marke umziehen statt doppelt zu '
  'existieren - sonst bekaeme der Vorbesitzer weiterhin die Nachrichten des '
  'Nachfolgers.';

comment on column public.push_tokens.disabled_at is
  'Gesetzt, wenn Expo das Geraet als abgemeldet meldet (DeviceNotRegistered). '
  'Nicht geloescht, damit dieselbe Marke bei einer Neuanmeldung wieder '
  'auflebt statt eine zweite Zeile zu erzeugen.';

create index push_tokens_member_idx
  on public.push_tokens (member_id) where (disabled_at is null);

alter table public.push_tokens enable row level security;

-- Sehen darf jeder seine eigenen Geraete; schreiben niemand direkt - das
-- laeuft ueber die RPCs weiter unten, wie alles Schreibende in diesem Projekt.
create policy push_tokens_own on public.push_tokens
  for select to authenticated
  using (member_id = (select private.current_member_id()));

create policy push_tokens_admin_all on public.push_tokens
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

grant select on public.push_tokens to authenticated;

-- ---------------------------------------------------------------------------
-- An- und abmelden
-- ---------------------------------------------------------------------------

/**
 * Meldet das Geraet des angemeldeten Mitglieds an.
 *
 * Der Umzugsfall steckt im on conflict: dieselbe Marke, neues Mitglied. Das
 * passiert auf jedem geteilten Geraet und bei jedem Mitgliedswechsel in einer
 * Familie. Ohne diesen Zweig blieben die Nachrichten beim Vorbesitzer.
 */
create or replace function public.register_push_token(
  p_token       text,
  p_platform    text,
  p_device_name text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_member uuid;
begin
  v_member := (select private.current_member_id());
  if v_member is null then
    raise exception 'Nur Mitglieder koennen ein Geraet anmelden.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(p_token), '') = '' then
    raise exception 'Ohne Marke laesst sich kein Geraet anmelden.'
      using errcode = 'check_violation';
  end if;

  insert into public.push_tokens (member_id, token, platform, device_name)
  values (v_member, btrim(p_token), p_platform, nullif(btrim(p_device_name), ''))
  on conflict (token) do update
    set member_id    = v_member,
        platform     = excluded.platform,
        device_name  = excluded.device_name,
        last_seen_at = now(),
        disabled_at  = null;
end; $$;

revoke execute on function public.register_push_token(text, text, text) from public, anon;
grant  execute on function public.register_push_token(text, text, text) to authenticated;

/**
 * Meldet das Geraet wieder ab - beim Abmelden aus der App.
 *
 * Loeschen statt stilllegen: wer sich abmeldet, will nichts mehr bekommen, und
 * eine stillgelegte Zeile waere nur Ballast. Die Marke bekommt das Geraet beim
 * naechsten Anmelden ohnehin neu.
 */
create or replace function public.remove_push_token(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_member uuid;
begin
  v_member := (select private.current_member_id());
  if v_member is null then
    raise exception 'Nur Mitglieder koennen ein Geraet abmelden.'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.push_tokens
   where token = btrim(p_token) and member_id = v_member;
end; $$;

revoke execute on function public.remove_push_token(text) from public, anon;
grant  execute on function public.remove_push_token(text) to authenticated;

/**
 * Legt ein Geraet still, das Expo als abgemeldet meldet.
 *
 * Nur fuer den Versanddienst: die Antwort von Expo kennt kein Mitglied, nur
 * die Marke. Ohne diesen Weg wuechse die Tabelle mit jeder Neuinstallation.
 */
create or replace function public.disable_push_token(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Geraete stilllegen darf nur der Versanddienst.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.push_tokens
     set disabled_at = now()
   where token = btrim(p_token) and disabled_at is null;
end; $$;

revoke execute on function public.disable_push_token(text) from public, anon;
grant  execute on function public.disable_push_token(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Die Warteschlange - zweiter Verbraucher neben dem Mailversand
-- ---------------------------------------------------------------------------

/**
 * Eigene Abhak-Spalte, nicht mailed_at mitbenutzt.
 *
 * Zwei Verbraucher, die sich eine Spalte teilen, klauen sich gegenseitig die
 * Nachrichten: wer zuerst laeuft, hakt ab, und der andere schickt nie etwas.
 */
alter table public.notifications add column pushed_at timestamptz;

comment on column public.notifications.pushed_at is
  'Abgehakt, nicht zwingend zugestellt - wie mailed_at. Auch eine Nachricht '
  'ohne angemeldetes Geraet wird abgehakt, sonst bliebe sie ewig im Teilindex.';

create index notifications_unpushed_idx
  on public.notifications (created_at) where (pushed_at is null);

/**
 * Die Arten, die einen Push wert sind.
 *
 * Eigene Liste, nicht die der Mails: ein Push ist billig und sofort da.
 * "Du wurdest zu einer Buchung hinzugefuegt" ist als Push erwuenscht und als
 * E-Mail Laerm - genau dieser Unterschied ist der Grund fuer zwei Listen.
 */
create or replace function private.notification_push_kinds()
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(
    string_to_array(
      nullif(btrim(public.setting_text('notifications.push_kinds')), ''), ','),
    '{}'::text[]);
$$;

/**
 * Holt die noch nicht gepushten Benachrichtigungen und hakt sie im selben Zug
 * ab. Gedanke und Aufbau wie bei claim_notification_mails: erst markieren,
 * dann senden, gebuendelt je Empfaenger, nichts aelter als einen Tag.
 *
 * Der Sperrschluessel ist ein anderer als beim Mailversand - sonst warteten
 * die beiden Laeufe aufeinander, obwohl sie sich nichts zu sagen haben.
 */
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
    returning n.id, n.member_id, n.kind, n.title, n.body, n.created_at
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
      'kind', a.kind, 'title', a.title, 'body', a.body, 'created_at', a.created_at
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

/**
 * Gibt abgehakte Benachrichtigungen wieder frei, wenn der Versand scheiterte.
 */
create or replace function public.release_notification_pushes(p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_anzahl integer;
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Push-Benachrichtigungen darf nur der Versanddienst freigeben.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.notifications
     set pushed_at = null
   where id = any (coalesce(p_ids, '{}'::uuid[]));
  get diagnostics v_anzahl = row_count;

  return v_anzahl;
end; $$;

revoke execute on function public.release_notification_pushes(uuid[]) from public, anon;
grant  execute on function public.release_notification_pushes(uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Startwert
-- ---------------------------------------------------------------------------

/**
 * Kein eigenes Merkmal zum Abbestellen wie bei den Mails.
 *
 * Die Einwilligung ist der Systemdialog des Geraets plus die Anmeldung der
 * Marke; der Widerruf ist "Push abmelden" im Konto oder das Abschalten in den
 * Geraeteeinstellungen. Ein drittes Ja/Nein in der Datenbank, das nichts
 * verhindert, was nicht schon das Geraet verhindert, waere eine Attrappe.
 */
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
     'Aeltere Eintraege werden beim Aufraeumlauf entfernt. 1095 Tage sind drei Jahre.'),
    ('notifications.push_kinds',
     '"booking_displaced,booking_cancelled,booking_removed,booking_added,player_joined,player_left,application_new"'::jsonb,
     'text', 'Benachrichtigungen, die auch als Push gehen',
     'Kommagetrennte Liste. Getrennt von den E-Mail-Arten, weil ein Push sofort '
     'da ist und auch Erfreuliches melden darf, das als Mail nur Laerm waere.')
  on conflict (key) do nothing;

  select count(*) into v_after from public.settings;
  return v_after - v_before;
end;
$$;


revoke execute on function public.ensure_default_settings() from public, anon, authenticated;

-- Ohne diesen Aufruf bliebe notifications.push_kinds ungesetzt, und
-- notification_push_kinds() gaebe eine leere Liste zurueck: es ginge nie ein
-- Push hinaus, ohne dass irgendwo ein Fehler auftauchte. Lokal faengt das der
-- Seed ab, produktiv gibt es keinen.
select public.ensure_default_settings();
