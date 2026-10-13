-- ===========================================================================
-- Rollen erweitern: Vorstand darf alles, Platzwart vorerst nichts Besonderes
--
-- Bisher hiess "volle Rechte" genau die Rolle 'admin'. Jetzt haben App Admin
-- ('admin') und Vorstand ('board') beide volle Rechte. Weil alle Policies und
-- RPCs ueber private.is_admin() pruefen, genuegt es, diesen Helfer zu
-- erweitern. Nur wenige Stellen fragen 'admin' direkt ab, die werden hier
-- nachgezogen.
--
-- Der Platzwart ('groundskeeper') ist vergebbar und sichtbar, bekommt aber
-- erst in einem spaeteren Schritt eigene Rechte.
-- ===========================================================================

-- --- 1. Helfer --------------------------------------------------------------

/** Volle Rechte fuer die angemeldete Person: App Admin oder Vorstand. */
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_roles mr
    join public.members m on m.id = mr.member_id
    where m.auth_user_id = (select auth.uid())
      and mr.role in ('admin'::public.app_role, 'board'::public.app_role)
  );
$$;

/** Hat ein bestimmtes Mitglied volle Rechte? */
create or replace function private.has_full_rights(p_member_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_roles r
    where r.member_id = p_member_id
      and r.role in ('admin'::public.app_role, 'board'::public.app_role)
  );
$$;

revoke execute on function private.has_full_rights(uuid) from public, anon;
grant  execute on function private.has_full_rights(uuid) to authenticated;

-- --- 2. Rollen vergeben ----------------------------------------------------
create or replace function public.set_member_role(
  p_member_id uuid, p_role public.app_role, p_granted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_voll   boolean := p_role in ('admin', 'board');
  v_uebrig integer;
begin
  if not private.is_admin() then
    raise exception 'Rollen vergeben duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_role = 'member' and not p_granted then
    raise exception 'Die Rolle Mitglied kann nicht entzogen werden.'
      using errcode = 'invalid_parameter_value';
  end if;

  if not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if p_granted then
    if v_voll
       and not exists (select 1 from public.members
                        where id = p_member_id and auth_user_id is not null) then
      raise exception 'Nur Mitglieder mit Login koennen Administrator oder Vorstand werden.'
        using errcode = 'invalid_parameter_value';
    end if;

    insert into public.member_roles (member_id, role, granted_by)
    values (p_member_id, p_role, private.current_member_id())
    on conflict do nothing;
  else
    -- Es muss immer jemand mit vollen Rechten uebrig bleiben. Wer Admin und
    -- Vorstand zugleich ist, darf eine der beiden Rollen abgeben.
    if v_voll then
      select count(distinct r.member_id) into v_uebrig
      from public.member_roles r
      where r.role in ('admin', 'board')
        and not (r.member_id = p_member_id and r.role = p_role);

      if v_uebrig = 0 then
        raise exception 'Die letzte Person mit vollen Rechten kann die Rolle nicht abgeben. '
                        'Bitte zuerst eine weitere Person zum Administrator oder Vorstand machen.'
          using errcode = 'check_violation';
      end if;
    end if;

    delete from public.member_roles where member_id = p_member_id and role = p_role;
  end if;
end;
$$;

revoke execute on function public.set_member_role(uuid, public.app_role, boolean) from public, anon;
grant  execute on function public.set_member_role(uuid, public.app_role, boolean) to authenticated;

-- --- 3. Rollen enden mit Login und Mitgliedschaft --------------------------
-- Vier Funktionen (Austritt, Anonymisieren, Login entziehen) loeschen bisher
-- nur 'admin'. Statt sie alle zu kopieren, raeumt ein Trigger die uebrigen
-- Rollen ab: ohne Login keine vollen Rechte, archiviert gar keine Zusatzrolle.
create or replace function private.rollen_bei_aenderung_entziehen()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'archived' and old.status is distinct from 'archived' then
    delete from public.member_roles where member_id = new.id and role <> 'member';
  elsif new.auth_user_id is null and old.auth_user_id is not null then
    delete from public.member_roles where member_id = new.id and role in ('admin', 'board');
  end if;
  return null;
end;
$$;

drop trigger if exists members_rollen_entziehen on public.members;
create trigger members_rollen_entziehen
  after update of status, auth_user_id on public.members
  for each row execute function private.rollen_bei_aenderung_entziehen();

-- --- 4. Mitgliederliste ----------------------------------------------------
-- Neue Spalte roles; der Rueckgabetyp aendert sich, deshalb drop und create.
-- is_admin bedeutet ab jetzt "volle Rechte" (Admin oder Vorstand).
drop function if exists public.member_overview(text, text, integer);

create or replace function public.member_overview(
  p_filter text default 'aktiv',
  p_query  text default null,
  p_limit  integer default 500)
returns table (
  id             uuid,
  first_name     text,
  last_name      text,
  email          text,
  birthday       date,
  status         public.member_status,
  is_trainer     boolean,
  has_login      boolean,
  is_admin       boolean,
  is_paid_by     boolean,
  number         text,
  started_on     date,
  ended_on       date,
  roles          public.app_role[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with sichtbar as (
    select m.*
    from public.members m
    where private.is_admin()
      and case p_filter
            when 'aktiv'       then m.status = 'active'
            when 'archiviert'  then m.status = 'archived'
            when 'ohne-login'  then m.auth_user_id is null and m.status <> 'archived'
            when 'trainer'     then m.is_trainer
            when 'admins'      then private.has_full_rights(m.id)
            when 'vorstand'    then exists (select 1 from public.member_roles r
                                             where r.member_id = m.id and r.role = 'board')
            when 'platzwart'   then exists (select 1 from public.member_roles r
                                             where r.member_id = m.id and r.role = 'groundskeeper')
            else true
          end
      and (
        p_query is null or btrim(p_query) = ''
        or m.first_name ilike '%' || btrim(p_query) || '%'
        or m.last_name  ilike '%' || btrim(p_query) || '%'
        or (m.first_name || ' ' || m.last_name) ilike '%' || btrim(p_query) || '%'
        or (m.last_name || ' ' || m.first_name) ilike '%' || btrim(p_query) || '%'
      )
  ),
  -- Die laufende Mitgliedschaft, sonst die zuletzt beendete. "distinct on"
  -- liefert genau eine Zeile je Mitglied, ohne Unterabfrage je Zeile.
  aktuelle as (
    select distinct on (s.member_id)
           s.member_id, s.number, s.started_on, s.ended_on
    from public.memberships s
    where s.member_id in (select id from sichtbar)
    order by s.member_id, (s.ended_on is null) desc, s.started_on desc
  )
  select
    m.id, m.first_name, m.last_name, m.email::text, m.birthday, m.status,
    m.is_trainer,
    m.auth_user_id is not null,
    private.has_full_rights(m.id),
    m.billing_payer_id is not null,
    a.number, a.started_on, a.ended_on,
    coalesce((select array_agg(r.role order by r.role) from public.member_roles r
               where r.member_id = m.id), '{}')
  from sichtbar m
  left join aktuelle a on a.member_id = m.id
  order by lower(m.last_name), lower(m.first_name)
  limit least(coalesce(p_limit, 500), 1000);
$$;

comment on function public.member_overview(text, text, integer) is
  'Mitgliederliste fuer das Admin-Dashboard, fertig gefiltert und sortiert. '
  'Der Suchbegriff wird als Parameter uebergeben und nicht in einen '
  'Filterausdruck eingesetzt - Sonderzeichen koennen ihn deshalb nicht zerlegen.';

revoke execute on function public.member_overview(text, text, integer) from public, anon;
grant  execute on function public.member_overview(text, text, integer) to authenticated;

-- --- 5. Login-Status: ist_admin heisst volle Rechte ----------------------
create or replace function public.member_login_state(p_member_id uuid)
returns table (
  hat_zugang     boolean,
  email          text,
  invited_at     timestamptz,
  disabled_at    timestamptz,
  last_sign_in   timestamptz,
  ist_admin      boolean,
  einladbar      boolean,
  grund          text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.auth_user_id is not null,
    m.email::text,
    m.invited_at,
    m.login_disabled_at,
    u.last_sign_in_at,
    private.has_full_rights(m.id),
    m.auth_user_id is null and m.email is not null and m.status <> 'archived',
    case
      when m.auth_user_id is not null then null::text
      when m.email is null then
        'Ohne E-Mail-Adresse ist keine Einladung moeglich. Bei Kindern uebernimmt das der Zahler.'
      when m.status = 'archived' then 'Archivierte Mitglieder bekommen keinen Zugang.'
      else null::text
    end
  from public.members m
  left join auth.users u on u.id = m.auth_user_id
  where m.id = p_member_id
    and private.is_admin();
$$;

revoke execute on function public.member_login_state(uuid) from public, anon;
grant  execute on function public.member_login_state(uuid) to authenticated;

-- --- 6. Mitgliedsantrag: Admins und Vorstand benachrichtigen -------------
create or replace function public.submit_membership_application(
  p_data       jsonb,
  p_ip         text default null,
  p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_erlaubt constant text[] := array[
    'first_name', 'last_name', 'title', 'gender', 'salutation', 'birthday',
    'email', 'phone', 'mobile', 'street', 'postcode', 'city',
    'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
    'guardian_name', 'guardian_email', 'desired_fee_type_id',
    'attribute_choices', 'message'
  ];
  v_d       jsonb := '{}'::jsonb;
  v_schl    text;
  v_ip      text := private.hash_ip(p_ip);
  v_email   extensions.citext;
  v_anzahl  integer;
begin
  -- Unbekannte Schluessel werden still uebergangen, nicht abgewiesen: eine
  -- Fehlermeldung waere eine Auskunft ueber die Feldstruktur.
  for v_schl in select jsonb_object_keys(coalesce(p_data, '{}'::jsonb)) loop
    if v_schl = any (v_erlaubt) then
      v_d := v_d || jsonb_build_object(v_schl, p_data -> v_schl);
    end if;
  end loop;

  if length(btrim(coalesce(v_d ->> 'first_name', ''))) = 0
     or length(btrim(coalesce(v_d ->> 'last_name', ''))) = 0 then
    raise exception 'Bitte Vor- und Nachnamen angeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_email := lower(btrim(coalesce(v_d ->> 'email', '')))::extensions.citext;
  if v_email is null or position('@' in v_email::text) = 0 then
    raise exception 'Bitte eine gueltige E-Mail-Adresse angeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  if (v_d ->> 'birthday') is null then
    raise exception 'Bitte das Geburtsdatum angeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Sperre 1: dieselbe Herkunft, zehnmal in einer Stunde.
  --
  -- Die Zahl war zuerst drei und damit zu streng: hinter einem Anschluss
  -- sitzt oft mehr als eine Person. Beim Schnuppertag melden sich mehrere aus
  -- dem WLAN des Clubheims an, eine Familie fuellt vier Antraege nacheinander
  -- aus - alles voellig gewoehnliche Faelle, die an einer Sperre von drei
  -- gescheitert waeren. Zehn je Stunde bremst Massenzusendungen immer noch
  -- wirksam und trifft niemanden, der wirklich beitreten will.
  if v_ip is not null then
    select count(*)::integer into v_anzahl
    from public.membership_applications
    where ip_hash = v_ip and submitted_at > now() - interval '1 hour';

    if v_anzahl >= 10 then
      raise exception 'Es sind gerade zu viele Antraege eingegangen. Bitte spaeter erneut versuchen.'
        using errcode = 'too_many_rows';
    end if;
  end if;

  -- Sperre 2: zwanzig Antraege in einer Stunde ueberhaupt. Der Verein hat
  -- dreihundert Mitglieder; das ist mit Sicherheit kein echter Andrang.
  select count(*)::integer into v_anzahl
  from public.membership_applications
  where submitted_at > now() - interval '1 hour';

  if v_anzahl >= 20 then
    raise exception 'Es sind gerade zu viele Antraege eingegangen. Bitte spaeter erneut versuchen.'
      using errcode = 'too_many_rows';
  end if;

  -- Sperre 3: schon ein offener Antrag zu dieser Adresse. Das ist ein stiller
  -- Ausstieg mit Erfolgsmeldung - wer hier eine Fehlermeldung bekaeme, wuesste,
  -- dass die Adresse bereits eingereicht hat.
  if exists (select 1 from public.membership_applications
              where email = v_email and status = 'new') then
    return;
  end if;

  insert into public.membership_applications (
    first_name, last_name, title, gender, salutation, birthday,
    email, phone, mobile, street, postcode, city,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    guardian_name, guardian_email, desired_fee_type_id,
    attribute_choices, message, possible_duplicate, ip_hash, user_agent
  ) values (
    btrim(v_d ->> 'first_name'),
    btrim(v_d ->> 'last_name'),
    nullif(btrim(coalesce(v_d ->> 'title', '')), ''),
    (nullif(v_d ->> 'gender', ''))::public.gender,
    (nullif(v_d ->> 'salutation', ''))::public.salutation,
    (v_d ->> 'birthday')::date,
    v_email,
    nullif(btrim(coalesce(v_d ->> 'phone', '')), ''),
    nullif(btrim(coalesce(v_d ->> 'mobile', '')), ''),
    nullif(btrim(coalesce(v_d ->> 'street', '')), ''),
    nullif(btrim(coalesce(v_d ->> 'postcode', '')), ''),
    nullif(btrim(coalesce(v_d ->> 'city', '')), ''),
    nullif(btrim(coalesce(v_d ->> 'emergency_contact_name', '')), ''),
    nullif(btrim(coalesce(v_d ->> 'emergency_contact_phone', '')), ''),
    nullif(btrim(coalesce(v_d ->> 'emergency_contact_relation', '')), ''),
    nullif(btrim(coalesce(v_d ->> 'guardian_name', '')), ''),
    nullif(lower(btrim(coalesce(v_d ->> 'guardian_email', ''))), '')::extensions.citext,
    (nullif(v_d ->> 'desired_fee_type_id', ''))::uuid,
    coalesce(v_d -> 'attribute_choices', '{}'::jsonb),
    nullif(btrim(coalesce(v_d ->> 'message', '')), ''),
    -- Nur ein Vermerk fuer den Vorstand. Nach aussen aendert er nichts.
    exists (select 1 from public.members m where m.email = v_email),
    v_ip,
    left(coalesce(p_user_agent, ''), 300)
  );

  -- Den Vorstand benachrichtigen. Geht aus anon heraus nur, weil diese
  -- Funktion security definer ist.
  insert into public.notifications (member_id, kind, title, body)
  select distinct r.member_id, 'application_new', 'Neuer Mitgliedsantrag',
         btrim(v_d ->> 'first_name') || ' ' || btrim(v_d ->> 'last_name')
         || ' moechte dem Verein beitreten.'
  from public.member_roles r
  where r.role in ('admin', 'board');
end;
$$;

revoke execute on function public.submit_membership_application(jsonb, text, text) from public;
grant  execute on function public.submit_membership_application(jsonb, text, text) to anon, authenticated;
