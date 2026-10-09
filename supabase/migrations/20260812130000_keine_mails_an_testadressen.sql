-- ===========================================================================
-- Keine Mails an Testadressen
--
-- Die Cloud enthaelt synthetische Mitglieder mit Adressen wie
-- vorname.name123@example.org, dazu Seed-Konten unter @tcm.local. Eine Mail
-- dorthin kommt garantiert als unzustellbar zurueck - und eine hohe
-- Ruecklaufquote fuehrt bei Resend schnell zur Sperre des Kontos. Danach
-- landen auch die echten Mails eher im Spam.
--
-- Gesperrt sind nur Adressen, die es per Definition nicht geben kann:
--   * example.org, example.com, example.net und ihre Unterdomains
--     (RFC 2606, fuer Beispiele reserviert)
--   * die Endungen .test, .example, .invalid, .localhost (RFC 2606) und
--     .local (mDNS, nie im oeffentlichen DNS)
-- Alles andere - gmail.com, web.de, tennisclub-muckensturm.de - bleibt offen.
--
-- Eine Regel, zwei Nutzer: claim_notification_mails (Benachrichtigungen) und
-- die Edge Function member-login (Einladung, Passwort zuruecksetzen).
-- ===========================================================================

create or replace function public.ist_testadresse(p_email text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    lower(split_part(p_email, '@', 2)) ~ '(^|[.])example[.](org|com|net)$'
    or lower(split_part(p_email, '@', 2)) ~ '[.](test|example|invalid|localhost|local)$',
    false);
$$;

comment on function public.ist_testadresse(text) is
  'Reservierte Test-Domain (example.org/com/net, .test, .example, .invalid, .localhost, .local)? Dorthin geht keine Mail.';

revoke execute on function public.ist_testadresse(text) from public, anon;
grant  execute on function public.ist_testadresse(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Benachrichtigungen einsammeln: wie in 20260808100100, plus die Sperre
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
