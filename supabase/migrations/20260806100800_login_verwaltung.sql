-- ===========================================================================
-- Login-Verwaltung
--
-- Ein Mitglied und ein Login sind zwei verschiedene Dinge: Kinder haben einen
-- vollwertigen Datensatz ohne Zugang, und ein Zugang gehoert immer genau einer
-- Person. Diese Funktionen verbinden beide - mehr nicht.
--
-- Das eigentliche Anlegen und Sperren von Konten passiert in auth.users und
-- damit ausserhalb der Reichweite von SQL: dafuer braucht es die Admin-API,
-- die nur die Edge Function mit dem Service-Schluessel erreicht. Hier steht
-- nur, was danach in unserer Tabelle vermerkt wird.
--
-- Deshalb duerfen diese drei Funktionen auch von der Service-Rolle aufgerufen
-- werden - sie ist der einzige Weg, auf dem die Function zurueckmeldet, was
-- sie getan hat.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Zugang mit Mitglied verbinden
-- ---------------------------------------------------------------------------
create or replace function public.link_auth_user(p_member_id uuid, p_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.members;
begin
  -- Entweder ein Administrator, oder ein Aufruf ohne angemeldeten Nutzer:
  -- Letzteres ist die Edge Function mit dem Service-Schluessel. Dieselbe
  -- Unterscheidung benutzt guard_member_self_update seit jeher.
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Zugaenge verwalten duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_m from public.members where id = p_member_id;
  if not found then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if v_m.auth_user_id is not null and v_m.auth_user_id <> p_auth_user_id then
    raise exception 'Dieses Mitglied hat bereits einen Zugang.'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.members
              where auth_user_id = p_auth_user_id and id <> p_member_id) then
    raise exception 'Dieser Zugang gehoert bereits zu einem anderen Mitglied.'
      using errcode = 'check_violation';
  end if;

  update public.members
     set auth_user_id = p_auth_user_id,
         invited_at = coalesce(invited_at, now()),
         login_disabled_at = null
   where id = p_member_id;
end;
$$;

revoke execute on function public.link_auth_user(uuid, uuid) from public, anon;
grant  execute on function public.link_auth_user(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Zugang loesen
--
-- Gibt die bisherige Kennung zurueck, damit die Edge Function das Konto
-- danach in auth.users entfernen kann. Ohne diese Rueckgabe muesste sie es
-- vorher lesen - und haette dann eine Kennung in der Hand, die in unserer
-- Tabelle schon nicht mehr steht.
-- ---------------------------------------------------------------------------
create or replace function public.unlink_auth_user(p_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alt uuid;
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Zugaenge verwalten duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_member_id = private.current_member_id() then
    raise exception 'Du kannst dir nicht selbst den Zugang entziehen.'
      using errcode = 'check_violation';
  end if;

  select auth_user_id into v_alt from public.members where id = p_member_id;
  if not found then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  -- Ohne Zugang gibt es auch keine Verwaltungsrechte.
  delete from public.member_roles where member_id = p_member_id and role = 'admin';

  update public.members
     set auth_user_id = null, invited_at = null, login_disabled_at = null
   where id = p_member_id;

  return v_alt;
end;
$$;

revoke execute on function public.unlink_auth_user(uuid) from public, anon;
grant  execute on function public.unlink_auth_user(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Sperrvermerk setzen
--
-- Die Sperre selbst sitzt in auth.users; diese Spalte macht sie in der
-- Oberflaeche sichtbar. Beides auseinanderlaufen zu lassen waere schlimmer
-- als keine Anzeige - deshalb setzt die Edge Function immer beides.
-- ---------------------------------------------------------------------------
create or replace function public.set_login_disabled(p_member_id uuid, p_disabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Zugaenge verwalten duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_disabled and p_member_id = private.current_member_id() then
    raise exception 'Du kannst dich nicht selbst aussperren.'
      using errcode = 'check_violation';
  end if;

  update public.members
     set login_disabled_at = case when p_disabled then now() else null end
   where id = p_member_id;
end;
$$;

revoke execute on function public.set_login_disabled(uuid, boolean) from public, anon;
grant  execute on function public.set_login_disabled(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Was die Oberflaeche ueber den Zugang wissen muss
--
-- Die E-Mail steht in members und ist ueber die Detailseite ohnehin sichtbar;
-- interessant ist hier, ob ueberhaupt eingeladen werden kann und was zuletzt
-- passiert ist.
-- ---------------------------------------------------------------------------
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
    exists (select 1 from public.member_roles r
             where r.member_id = m.id and r.role = 'admin'),
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

-- ---------------------------------------------------------------------------
-- Was die Edge Function ueber ein Mitglied wissen muss
--
-- Die Function laeuft mit dem Service-Schluessel - und der hat auf
-- public.members bewusst kein SELECT: die Rechtehaertung aus der ersten
-- Migration entzieht neuen Tabellen jedes Recht, und nachgetragen wurde es nur
-- fuer authenticated. Das ist die sichere Richtung und soll so bleiben.
--
-- Statt die Tabelle zu oeffnen, bekommt die Function genau diese vier Felder.
-- Sie braucht nicht mehr, und mehr soll sie auch nicht sehen koennen.
-- ---------------------------------------------------------------------------
create or replace function public.member_for_login_admin(p_member_id uuid)
returns table (id uuid, email text, auth_user_id uuid, status public.member_status, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Entweder ein Administrator, oder der Aufruf ohne angemeldeten Nutzer:
  -- Letzteres ist die Edge Function mit dem Service-Schluessel.
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Diese Auskunft ist Administratoren vorbehalten.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select m.id, m.email::text, m.auth_user_id, m.status,
           m.first_name || ' ' || m.last_name
    from public.members m
    where m.id = p_member_id;
end;
$$;

revoke execute on function public.member_for_login_admin(uuid) from public, anon;
grant  execute on function public.member_for_login_admin(uuid) to authenticated, service_role;
