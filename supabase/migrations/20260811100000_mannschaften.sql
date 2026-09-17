-- ===========================================================================
-- Mannschaften
--
-- Der Verein spielt Verbandsspiele. Der Vorstand will je Mitglied wissen, ob
-- es in einer Mannschaft spielt, in welcher, und ob es dort Mannschaftsfuehrer
-- ist. Die meisten Mitglieder spielen in keiner - die Spalten sind deshalb
-- optional. Ein Spieler gehoert zu hoechstens einer Mannschaft.
--
-- Warum eine eigene Tabelle und kein Merkmal: die Merkmale sind Notizen ohne
-- Zusatzangabe je Wert - dort gaebe es keinen Platz fuer "Mannschaftsfuehrer".
-- Und Mannschaften kommen und gehen, der Vorstand legt sie selbst an; das ist
-- eine Stammtabelle wie fee_types, keine Werteliste.
--
-- Die Zuordnung liegt direkt am Mitglied (team_id, is_team_captain), so wie
-- is_trainer und playing_right. Eine Zuordnungstabelle braeuchte es erst, wenn
-- ein Spieler in mehreren Mannschaften stehen duerfte - das ist ausgeschlossen.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Mannschaften
-- ---------------------------------------------------------------------------
create table public.teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- Aufgeloeste Mannschaften werden stillgelegt, nicht geloescht, wenn noch
  -- jemand drinsteht: dann bleibt die Zuordnung im Protokoll nachvollziehbar.
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint teams_name_set check (length(btrim(name)) > 0)
);

-- Unique ueber lower(): "Herren 30" und "herren 30" sind dieselbe Mannschaft.
create unique index teams_name_lower_key on public.teams (lower(btrim(name)));

comment on table public.teams is
  'Mannschaften fuer den Verbandsspielbetrieb. Legt der Vorstand im '
  'Admin-Dashboard an; ein Mitglied gehoert zu hoechstens einer.';

create trigger teams_set_updated_at
  before update on public.teams
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- Zuordnung am Mitglied
-- ---------------------------------------------------------------------------
alter table public.members
  add column if not exists team_id         uuid references public.teams (id) on delete set null,
  add column if not exists is_team_captain boolean not null default false;

-- Mannschaftsfuehrer ohne Mannschaft gibt es nicht.
alter table public.members
  add constraint members_captain_needs_team
    check (not is_team_captain or team_id is not null);

-- Hoechstens ein Mannschaftsfuehrer je Mannschaft. Ein Teilindex statt eines
-- Triggers: die Datenbank haelt die Regel auch dann, wenn zwei Admins
-- gleichzeitig klicken.
create unique index members_one_captain_per_team
  on public.members (team_id) where is_team_captain;

create index members_team_id_idx on public.members (team_id);

comment on column public.members.team_id is
  'Mannschaft, in der das Mitglied spielt. Null = keine - das ist der '
  'Normalfall. Geschrieben nur ueber set_member_team.';

comment on column public.members.is_team_captain is
  'Mannschaftsfuehrer der Mannschaft in team_id. Eigenschaft der Person, '
  'keine Berechtigungsstufe - das Rollenmodell bleibt zweistufig.';

-- Der Selbstpflege-Trigger guard_member_self_update arbeitet mit einer
-- Erlaubnisliste; die neuen Spalten sind damit automatisch admin-only. Ein
-- Spalten-Grant fuer update wird bewusst NICHT erteilt.

-- ---------------------------------------------------------------------------
-- Archivierung
--
-- archive_member und anonymize_member wuerden beide die Zuordnung loeschen
-- muessen. Statt zwei lange Funktionen zu kopieren, haengt die Regel an der
-- Tabelle: wer archiviert wird, verlaesst seine Mannschaft. Das gilt fuer
-- jeden Codepfad, auch fuer den Import.
-- ---------------------------------------------------------------------------
create or replace function private.leave_team_on_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'archived' and old.status is distinct from 'archived' then
    new.team_id := null;
    new.is_team_captain := false;
  end if;
  return new;
end;
$$;

comment on function private.leave_team_on_archive() is
  'Ein archiviertes Mitglied steht in keiner Mannschaft mehr. Before-Trigger, '
  'damit der Protokoll-Trigger den Abgang in derselben Aenderung sieht.';

create trigger members_leave_team_on_archive
  before update of status on public.members
  for each row execute function private.leave_team_on_archive();

-- ---------------------------------------------------------------------------
-- Rechte
--
-- Die Mannschaftsnamen darf jedes angemeldete Mitglied lesen - sonst liesse
-- sich im Konto nicht anzeigen, wo man spielt. Geaendert werden sie nur von
-- Admins, und zwar ueber die RPCs unten; deshalb kein Schreib-Grant.
--
-- Die Spalten am Mitglied folgen der bestehenden members_select-Policy:
-- eigene Zeile, die der Personen, fuer die ich zahle, und alles fuer Admins.
-- ---------------------------------------------------------------------------
alter table public.teams enable row level security;

create policy teams_select on public.teams
  for select to authenticated using (true);
create policy teams_admin_all on public.teams
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

grant select on public.teams to authenticated;

-- ---------------------------------------------------------------------------
-- Mannschaft anlegen oder umbenennen
-- ---------------------------------------------------------------------------
create or replace function public.upsert_team(
  p_name       text,
  p_id         uuid    default null,
  p_active     boolean default true,
  p_sort_order integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not private.is_admin() then
    raise exception 'Mannschaften pflegen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_name = '' then
    raise exception 'Die Mannschaft braucht einen Namen.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_id is null then
    insert into public.teams (name, active, sort_order)
    values (v_name, coalesce(p_active, true), coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    update public.teams
       set name = v_name,
           active = coalesce(p_active, active),
           sort_order = coalesce(p_sort_order, sort_order)
     where id = p_id
     returning id into v_id;

    if v_id is null then
      raise exception 'Diese Mannschaft gibt es nicht.' using errcode = 'no_data_found';
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.upsert_team(text, uuid, boolean, integer) from public, anon;
grant  execute on function public.upsert_team(text, uuid, boolean, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Mannschaft loeschen
--
-- Nimmt die Spieler mit heraus - eine aufgeloeste Mannschaft hat keine
-- Aufstellung mehr. Der Fremdschluessel setzt team_id auf null; das
-- Kennzeichen muss vorher weg, sonst greift members_captain_needs_team.
-- Die Oberflaeche fragt mit der Spielerzahl nach.
-- ---------------------------------------------------------------------------
create or replace function public.delete_team(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Mannschaften loeschen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.teams where id = p_id) then
    raise exception 'Diese Mannschaft gibt es nicht.' using errcode = 'no_data_found';
  end if;

  update public.members
     set team_id = null, is_team_captain = false
   where team_id = p_id;

  delete from public.teams where id = p_id;
end;
$$;

revoke execute on function public.delete_team(uuid) from public, anon;
grant  execute on function public.delete_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Mitglied einer Mannschaft zuordnen
--
-- p_team_id null (oder weggelassen) traegt aus. Wer schon in einer anderen Mannschaft steht,
-- wird umgehaengt - ein Spieler hat genau eine.
-- ---------------------------------------------------------------------------
create or replace function public.set_member_team(
  p_member_id  uuid,
  p_team_id    uuid    default null,
  p_is_captain boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.member_status;
begin
  if not private.is_admin() then
    raise exception 'Mannschaften zuordnen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from public.members where id = p_member_id;
  if not found then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if p_team_id is null then
    update public.members
       set team_id = null, is_team_captain = false
     where id = p_member_id;
    return;
  end if;

  if v_status <> 'active' then
    raise exception 'Nur aktive Mitglieder spielen in einer Mannschaft.'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.teams where id = p_team_id and active) then
    raise exception 'Diese Mannschaft gibt es nicht oder sie ist stillgelegt.'
      using errcode = 'no_data_found';
  end if;

  update public.members
     set team_id = p_team_id,
         is_team_captain = coalesce(p_is_captain, false)
   where id = p_member_id;
end;
$$;

revoke execute on function public.set_member_team(uuid, uuid, boolean) from public, anon;
grant  execute on function public.set_member_team(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Uebersicht fuer die Verwaltung
-- ---------------------------------------------------------------------------
create or replace function public.team_overview()
returns table (
  id           uuid,
  name         text,
  active       boolean,
  sort_order   integer,
  member_count integer,
  captain_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Die Mannschaftsuebersicht sehen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select t.id, t.name, t.active, t.sort_order,
         (select count(*)::integer from public.members m where m.team_id = t.id),
         (select c.first_name || ' ' || c.last_name
            from public.members c
           where c.team_id = t.id and c.is_team_captain
           limit 1)
    from public.teams t
   order by t.active desc, t.sort_order, lower(t.name);
end;
$$;

revoke execute on function public.team_overview() from public, anon;
grant  execute on function public.team_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- Aufstellung einer Mannschaft
-- ---------------------------------------------------------------------------
create or replace function public.team_roster(p_team_id uuid)
returns table (
  member_id       uuid,
  first_name      text,
  last_name       text,
  is_team_captain boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Die Aufstellung sehen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select m.id, m.first_name, m.last_name, m.is_team_captain
    from public.members m
   where m.team_id = p_team_id
   order by m.is_team_captain desc, m.last_name, m.first_name;
end;
$$;

revoke execute on function public.team_roster(uuid) from public, anon;
grant  execute on function public.team_roster(uuid) to authenticated;
