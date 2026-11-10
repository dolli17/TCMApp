-- ===========================================================================
-- Push ohne Expo
--
-- Die Expo-App (apps/mobile) ist abgeloest und aus dem Repo entfernt. Push
-- laeuft nur noch direkt ueber APNs (iOS) und FCM (Android), siehe
-- docs/native-apps.md, Abschnitt Push. Was dafuer in der Datenbank wegfaellt:
--
--   1. Die Expo-Marken in push_tokens. Kein Client meldet sie mehr an, und
--      die Edge Function verschickt nichts mehr ueber exp.host. Geloescht
--      statt stillgelegt: eine tote Marke hat keinen Nutzen, und der neue
--      Check unten liesse sie nicht stehen.
--   2. Der Standard 'expo' der Spalte provider. Ohne Standard muss jeder,
--      der ein Geraet anlegt, den Anbieter nennen; erlaubt sind nur noch
--      'apns' und 'fcm'.
--   3. register_push_token verlangt p_provider. Die Signatur bleibt (vier
--      Parameter, der letzte mit Standard), weil Postgres nach einem
--      Parameter mit Standard (p_device_name) keinen ohne mehr zulaesst; ohne
--      Angabe lehnt die Funktion ab. Ein Aufruf wie von der alten Expo-App
--      (zwei Parameter) scheitert also mit einer klaren Meldung.
--   4. claim_notification_pushes liefert tokens nicht mehr. Das waren nur die
--      Expo-Marken; die Geraete stehen seit app_rpcs in geraete. Die
--      Rueckgabe aendert sich, deshalb drop und create samt Rechten.
--
-- Abwaertskompatibel fuer alles, was noch laeuft: Die nativen Apps schicken
-- p_provider immer mit, und die Edge Function liest seit app_rpcs geraete
-- (tokens nur als Rueckfall ohne geraete). Der Deploy spielt erst diese
-- Migration ein und danach die Function ohne Expo-Zweig; dazwischen findet
-- die alte Function schlicht keine Expo-Geraete mehr.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1./2. push_tokens: nur noch APNs und FCM
-- ---------------------------------------------------------------------------
delete from public.push_tokens where provider = 'expo';

alter table public.push_tokens
  alter column provider drop default;

alter table public.push_tokens
  drop constraint push_tokens_provider_check;

alter table public.push_tokens
  add constraint push_tokens_provider_check check (provider in ('apns', 'fcm'));

-- ---------------------------------------------------------------------------
-- 3. register_push_token: Anbieter ist Pflicht
--
-- Inhalt wie in app_rpcs (S26), nur ohne Standard 'expo'.
-- ---------------------------------------------------------------------------
create or replace function public.register_push_token(
  p_token text,
  p_platform text,
  p_device_name text default null,
  p_provider text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid; v_alt public.push_tokens; v_alt_zugang boolean;
  v_provider text := nullif(btrim(p_provider), '');
begin
  v_member := (select private.current_member_id());
  if v_member is null then
    raise exception 'Nur Mitglieder können ein Gerät anmelden.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(p_token), '') = '' then
    raise exception 'Ohne Marke lässt sich kein Gerät anmelden.'
      using errcode = 'check_violation';
  end if;

  if v_provider is null then
    raise exception 'Ohne Push-Anbieter (apns oder fcm) lässt sich kein Gerät anmelden.'
      using errcode = 'check_violation';
  end if;

  if v_provider not in ('apns', 'fcm') then
    raise exception 'Unbekannter Push-Anbieter "%".', v_provider
      using errcode = 'check_violation';
  end if;

  -- Umziehen nur, wenn das Geraet frei ist (S26): stillgelegt, oder der
  -- bisherige Besitzer hat keinen Zugang mehr. Sonst koennte jeder, der eine
  -- fremde Marke kennt, dessen Nachrichten auf sein Konto umleiten. Auf dem
  -- Familientelefon meldet die App beim Abmelden ab (remove_push_token), dann
  -- ist die Marke ohnehin frei.
  select pt.* into v_alt from public.push_tokens pt where pt.token = btrim(p_token) for update;
  if found and v_alt.member_id <> v_member and v_alt.disabled_at is null then
    select private.hat_zugang(m) into v_alt_zugang from public.members m where m.id = v_alt.member_id;
    if coalesce(v_alt_zugang, false) then
      raise exception 'Dieses Gerät ist noch für ein anderes Mitglied angemeldet. Bitte dort zuerst abmelden.'
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.push_tokens (member_id, token, platform, device_name, provider)
  values (v_member, btrim(p_token), p_platform, nullif(btrim(p_device_name), ''), v_provider)
  on conflict (token) do update
    set member_id    = v_member,
        platform     = excluded.platform,
        device_name  = excluded.device_name,
        provider     = excluded.provider,
        last_seen_at = now(),
        disabled_at  = null;
end; $$;

-- ---------------------------------------------------------------------------
-- 4. claim_notification_pushes: ohne tokens
--
-- Inhalt wie in security_audit_welle, nur die Spalte tokens faellt weg.
-- ---------------------------------------------------------------------------
drop function public.claim_notification_pushes(integer);

create function public.claim_notification_pushes(p_limit integer default 200)
returns table (member_id uuid, notification_ids uuid[], items jsonb, geraete jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_je_empfaenger constant integer := 20;
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Push-Benachrichtigungen darf nur der Versanddienst abholen.'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext('notification_pushes'));

  -- Wie bei den Mails: Unzustellbares vorher abhaken und als verworfen
  -- markieren.
  update public.notifications n
     set pushed_at = now(), push_discarded_at = now()
   where n.pushed_at is null
     and not private.push_zustellbar(n.member_id, n.kind, n.created_at);

  return query
  with offen as (
    select n.id, n.created_at, private.benachrichtigung_rang(n.kind) as rang,
           row_number() over (partition by n.member_id
                              order by private.benachrichtigung_rang(n.kind), n.created_at, n.id) as nr
    from public.notifications n
    where n.pushed_at is null
      and private.push_zustellbar(n.member_id, n.kind, n.created_at)
  ),
  kandidaten as (
    select n.id from public.notifications n
    where n.id in (
      select o.id from offen o
      where o.nr <= c_je_empfaenger
      order by o.rang, o.created_at, o.id
      limit greatest(coalesce(p_limit, 200), 1)
    )
    for update skip locked
  ),
  abgehakt as (
    update public.notifications n
       set pushed_at = now()
      from kandidaten k
     where n.id = k.id
    returning n.id, n.member_id, n.kind, n.title, n.body, n.created_at, n.event_id
  )
  -- Die Geraete als Unterabfrage und nicht als Join: bei zwei Geraeten
  -- verdoppelte der Join jede Nachricht, und ein distinct darueber haette die
  -- Sortierung nach Zeitpunkt gekostet.
  select
    m.id,
    array_agg(a.id order by a.created_at),
    jsonb_agg(jsonb_build_object(
      'kind', a.kind, 'title', a.title, 'body', a.body, 'created_at', a.created_at,
      'event_id', a.event_id
    ) order by a.created_at),
    (select jsonb_agg(jsonb_build_object('token', p.token, 'provider', p.provider)
                      order by p.last_seen_at desc)
       from public.push_tokens p
      where p.member_id = m.id and p.disabled_at is null)
  from abgehakt a
  join public.members m on m.id = a.member_id
  group by m.id;
end;
$$;

revoke all on function public.claim_notification_pushes(integer) from public, anon;
grant execute on function public.claim_notification_pushes(integer) to authenticated, service_role;
