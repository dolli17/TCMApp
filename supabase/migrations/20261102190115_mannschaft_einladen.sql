-- ===========================================================================
-- Mannschaftsführer lädt in seine Mannschaft ein
--
-- Entscheidung des Vereins (02.11.2026): Ein Mannschaftsführer (MF) ist ein
-- Mitglied mit is_team_captain = true und team_id = X. Er darf Mitglieder in
-- seine Mannschaft X einladen und Spieler aus X austragen, nur für X. Keine
-- neue Rolle: das Recht hängt allein am MF-Häkchen, das der Vorstand setzt.
--
-- - private.ist_mannschaftsfuehrer(team) ist die eine Prüfung dafür.
-- - public.team_invitations hält die Einladungen. Erst mit dem Annehmen steht
--   das Mitglied in der Mannschaft. Einladungen verfallen nach 30 Tagen:
--   expires_at < now() gilt als verfallen, ein Cron ist nicht nötig.
-- - members.team_phone_visible: Zustimmung, dass der MF die Telefonnummer
--   sieht. Ein Trigger setzt sie zurück, sobald sich team_id ändert, egal auf
--   welchem Weg (Austragen, Wechsel, Admin, Archivieren, Mannschaft gelöscht).
--   Derselbe Trigger schließt offene Einladungen in die Mannschaft, in der
--   das Mitglied nun steht (z. B. wenn der Vorstand es per set_member_team
--   zuordnet).
-- - RPCs für Konto und MF: meine_mannschaft, mannschaft_kandidaten,
--   mannschaft_einladen, mannschaft_einladung_zurueckziehen,
--   meine_mannschaft_einladungen, mannschaft_einladung_beantworten,
--   mannschaft_austragen, set_team_phone_visible.
-- - Benachrichtigungen team_invited, team_invitation_answered, team_removed,
--   team_left gehen per Push, nicht per Mail.
--
-- Alle Kaderänderungen laufen über members.team_id und stehen damit im
-- Änderungsprotokoll (members_log_change).
--
-- Telefonnummern: members_select lässt nur die eigene Zeile (und Admins)
-- lesen, can_view_member prüft nur "ich selbst". Der MF sieht fremde Nummern
-- also nicht über die Tabelle, sondern nur über meine_mannschaft() und nur bei
-- Zustimmung.
--
-- Abwärtskompatibel: neue Tabelle, neue Spalte mit Default, neue Funktionen.
-- Keine bestehende Signatur ändert sich.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Zustimmung zum Telefon
-- ---------------------------------------------------------------------------

alter table public.members
  add column if not exists team_phone_visible boolean not null default false;

comment on column public.members.team_phone_visible is
  'Der Mannschaftsführer darf Mobil- bzw. Telefonnummer sehen (nur über '
  'meine_mannschaft). Geschrieben über mannschaft_einladung_beantworten und '
  'set_team_phone_visible; wird bei jedem Wechsel von team_id auf false gesetzt.';

-- Kein Spalten-Grant: guard_member_self_update arbeitet mit einer
-- Erlaubnisliste, die Spalte ist damit nur über die RPCs schreibbar.

-- ---------------------------------------------------------------------------
-- Die Prüfung
-- ---------------------------------------------------------------------------

create or replace function private.ist_mannschaftsfuehrer(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.members m
      join public.teams t on t.id = m.team_id
     where m.auth_user_id = (select auth.uid())
       and m.team_id = p_team_id
       and m.is_team_captain
       and t.active
       and private.hat_zugang(m)
  );
$$;

comment on function private.ist_mannschaftsfuehrer(uuid) is
  'Ist der angemeldete Nutzer Mannschaftsführer dieser aktiven Mannschaft '
  'und hat Zugang? Gibt nur Auskunft über den Aufrufer selbst.';

-- Nur intern aus den SECURITY-DEFINER-RPCs gerufen, keine Freigabe nach außen.
revoke execute on function private.ist_mannschaftsfuehrer(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Einladungen
-- ---------------------------------------------------------------------------

create table public.team_invitations (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  member_id   uuid not null references public.members (id) on delete cascade,
  invited_by  uuid references public.members (id) on delete set null,
  status      text not null default 'offen',
  created_at  timestamptz not null default now(),
  answered_at timestamptz,
  expires_at  timestamptz not null default now() + interval '30 days',

  constraint team_invitations_status_werte
    check (status in ('offen', 'angenommen', 'abgelehnt', 'zurueckgezogen'))
);

-- Höchstens eine offene Einladung je Mannschaft und Mitglied. Auch eine
-- verfallene zählt, bis sie erneuert wird: mannschaft_einladen frischt sie auf.
create unique index team_invitations_eine_offene
  on public.team_invitations (team_id, member_id) where status = 'offen';

create index team_invitations_member_offen_idx
  on public.team_invitations (member_id) where status = 'offen';
create index team_invitations_invited_by_idx
  on public.team_invitations (invited_by);

comment on table public.team_invitations is
  'Einladungen eines Mannschaftsführers in seine Mannschaft. Lesen: '
  'Eingeladener, MF der Mannschaft, Admin. Schreiben nur über die RPCs. '
  'Offene Einladungen mit expires_at < now() gelten als verfallen.';

alter table public.team_invitations enable row level security;

-- Die Policy läuft mit den Rechten des Aufrufers. ist_mannschaftsfuehrer ist
-- für authenticated nicht freigegeben, deshalb steht dieselbe Regel hier als
-- Abfrage: eigene members-Zeile (current_member_id prüft den Zugang) mit
-- MF-Häkchen in dieser Mannschaft, und die Mannschaft ist aktiv.
create policy team_invitations_select on public.team_invitations
  for select to authenticated
  using (
    member_id = (select private.current_member_id())
    or exists (
      select 1
        from public.members m
        join public.teams t on t.id = m.team_id
       where m.id = (select private.current_member_id())
         and m.team_id = team_invitations.team_id
         and m.is_team_captain
         and t.active
    )
    or (select private.is_admin())
  );

grant select on public.team_invitations to authenticated;

-- ---------------------------------------------------------------------------
-- Wechsel von team_id: Zustimmung zurücksetzen, Einladungen schließen
--
-- Ein Before-Trigger ohne Spaltenliste, damit er auch greift, wenn ein
-- anderer Before-Trigger team_id ändert (leave_team_on_archive) oder der
-- Fremdschlüssel beim Löschen der Mannschaft auf null setzt. Der Name sortiert
-- hinter members_leave_team_on_archive. SECURITY DEFINER, weil Admins
-- members auch direkt ändern und dann keinen Schreib-Grant auf
-- team_invitations haben.
-- ---------------------------------------------------------------------------

create or replace function private.mannschaftswechsel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.team_id is distinct from old.team_id then
    new.team_phone_visible := false;

    if new.team_id is not null then
      update public.team_invitations
         set status = 'zurueckgezogen', answered_at = now()
       where member_id = new.id and team_id = new.team_id and status = 'offen';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.mannschaftswechsel() from public, anon, authenticated;

create trigger members_team_wechsel
  before update on public.members
  for each row execute function private.mannschaftswechsel();

-- ---------------------------------------------------------------------------
-- Hilfen
-- ---------------------------------------------------------------------------

/** Name der Mannschaft. */
create or replace function private.team_label(p_team_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select t.name from public.teams t where t.id = p_team_id), 'eine Mannschaft');
$$;

revoke execute on function private.team_label(uuid) from public, anon, authenticated;

/** Mannschaftsführer der Mannschaft, oder null. */
create or replace function private.team_captain(p_team_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.members m
   where m.team_id = p_team_id and m.is_team_captain
   limit 1;
$$;

revoke execute on function private.team_captain(uuid) from public, anon, authenticated;

/** Mannschaft, deren MF der Aufrufer ist, oder Fehler. */
create or replace function private.meine_mf_mannschaft()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_team uuid;
begin
  select m.team_id into v_team
    from public.members m
   where m.id = private.current_member_id() and m.is_team_captain;

  if v_team is null or not private.ist_mannschaftsfuehrer(v_team) then
    raise exception 'Das dürfen nur Mannschaftsführer für ihre Mannschaft.'
      using errcode = 'insufficient_privilege';
  end if;
  return v_team;
end;
$$;

revoke execute on function private.meine_mf_mannschaft() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Meine Mannschaft
-- ---------------------------------------------------------------------------

create or replace function public.meine_mannschaft()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me     uuid := private.current_member_id();
  v_team   uuid;
  v_name   text;
  v_tel    boolean;
  v_mf     boolean;
  v_admin  boolean := private.is_admin();
  v_kader  jsonb;
  v_offen  jsonb;
begin
  if v_me is null then
    raise exception 'Nur Mitglieder haben ein Konto.' using errcode = 'insufficient_privilege';
  end if;

  select m.team_id, t.name, m.team_phone_visible
    into v_team, v_name, v_tel
    from public.members m
    join public.teams t on t.id = m.team_id
   where m.id = v_me;

  if v_team is null then
    return null;
  end if;

  v_mf := private.ist_mannschaftsfuehrer(v_team);

  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id', k.id,
           'first_name', k.first_name,
           'last_name', k.last_name,
           'tennis_lk', k.tennis_lk,
           'is_team_captain', k.is_team_captain,
           'telefon', case when (v_mf or v_admin) and k.team_phone_visible
                           then coalesce(nullif(btrim(k.mobile), ''), nullif(btrim(k.phone), ''))
                      end
         ) order by k.is_team_captain desc,
                    private.lk_zahl(k.tennis_lk) nulls last,
                    lower(k.last_name), lower(k.first_name)), '[]'::jsonb)
    into v_kader
    from public.members k
   where k.team_id = v_team;

  if v_mf then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', i.id,
             'member_id', i.member_id,
             'first_name', m.first_name,
             'last_name', m.last_name,
             'created_at', i.created_at,
             'expires_at', i.expires_at
           ) order by i.created_at desc), '[]'::jsonb)
      into v_offen
      from public.team_invitations i
      join public.members m on m.id = i.member_id
     where i.team_id = v_team and i.status = 'offen' and i.expires_at >= now();
  else
    v_offen := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'team_id', v_team,
    'name', v_name,
    'ich_bin_mf', v_mf,
    'telefon_sichtbar', v_tel,
    'kader', v_kader,
    'offene_einladungen', v_offen
  );
end;
$$;

comment on function public.meine_mannschaft() is
  'Eigene Mannschaft mit Kader; null ohne Mannschaft. Telefon nur für MF/Admin '
  'und nur bei Zustimmung des Spielers. offene_einladungen nur für den MF '
  '(sonst leer).';

revoke execute on function public.meine_mannschaft() from public, anon;
grant  execute on function public.meine_mannschaft() to authenticated;

-- ---------------------------------------------------------------------------
-- Kandidaten für die Einladung
-- ---------------------------------------------------------------------------

create or replace function public.mannschaft_kandidaten(p_suche text default null)
returns table (
  member_id            uuid,
  first_name           text,
  last_name            text,
  tennis_lk            text,
  mannschaft_interesse boolean,
  aktuelle_mannschaft  text,
  eingeladen           boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_team   uuid := private.meine_mf_mannschaft();
  v_suche  text := nullif(btrim(coalesce(p_suche, '')), '');
  v_muster text;
begin
  if v_suche is not null then
    v_muster := '%' || replace(replace(replace(v_suche, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select m.id,
         m.first_name,
         m.last_name,
         m.tennis_lk,
         exists (select 1
                   from public.member_attribute_values v
                   join public.member_attribute_types a on a.id = v.attribute_type_id
                  where v.member_id = m.id and a.code = 'mannschaft_interesse') as interesse,
         t.name,
         exists (select 1 from public.team_invitations i
                  where i.member_id = m.id and i.team_id = v_team
                    and i.status = 'offen' and i.expires_at >= now())
    from public.members m
    left join public.teams t on t.id = m.team_id
   where m.status = 'active'
     and private.hat_zugang(m)
     and m.team_id is distinct from v_team
     and (v_muster is null
          or m.first_name ilike v_muster
          or m.last_name ilike v_muster
          or (m.first_name || ' ' || m.last_name) ilike v_muster)
   order by interesse desc, lower(m.last_name), lower(m.first_name)
   limit 50;
end;
$$;

comment on function public.mannschaft_kandidaten(text) is
  'Nur für den MF: aktive Mitglieder mit Zugang außerhalb des eigenen Kaders, '
  'Interessenten zuerst, höchstens 50, Suche über Vor- und Nachname.';

revoke execute on function public.mannschaft_kandidaten(text) from public, anon;
grant  execute on function public.mannschaft_kandidaten(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Einladen
-- ---------------------------------------------------------------------------

create or replace function public.mannschaft_einladen(p_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team  uuid := private.meine_mf_mannschaft();
  v_me    uuid := private.current_member_id();
  v_ziel  public.members;
  v_id    uuid;
begin
  select * into v_ziel from public.members where id = p_member_id;
  if not found then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if v_ziel.team_id = v_team then
    raise exception 'Dieses Mitglied steht schon im Kader.' using errcode = 'check_violation';
  end if;

  if v_ziel.status <> 'active' or not private.hat_zugang(v_ziel) then
    raise exception 'Nur aktive Mitglieder mit Zugang können eingeladen werden.'
      using errcode = 'check_violation';
  end if;

  -- Eine offene Einladung sperren, damit zwei Klicks nicht doppelt laufen.
  select i.id into v_id
    from public.team_invitations i
   where i.team_id = v_team and i.member_id = p_member_id and i.status = 'offen'
   for update;

  if v_id is not null then
    if (select i.expires_at >= now() from public.team_invitations i where i.id = v_id) then
      raise exception 'Dieses Mitglied ist schon eingeladen.' using errcode = 'check_violation';
    end if;

    -- Verfallen: dieselbe Einladung erneuern statt eine zweite anzulegen.
    update public.team_invitations
       set invited_by = v_me, created_at = now(), expires_at = now() + interval '30 days'
     where id = v_id;
  else
    begin
      insert into public.team_invitations (team_id, member_id, invited_by)
      values (v_team, p_member_id, v_me)
      returning id into v_id;
    exception when unique_violation then
      raise exception 'Dieses Mitglied ist schon eingeladen.' using errcode = 'check_violation';
    end;
  end if;

  insert into public.notifications (member_id, kind, title, body)
  values (p_member_id, 'team_invited', 'Einladung in eine Mannschaft',
          format('%s lädt dich in die Mannschaft %s ein.',
                 private.member_label(v_me), private.team_label(v_team)));

  return v_id;
end;
$$;

revoke execute on function public.mannschaft_einladen(uuid) from public, anon;
grant  execute on function public.mannschaft_einladen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Einladung zurückziehen
-- ---------------------------------------------------------------------------

create or replace function public.mannschaft_einladung_zurueckziehen(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.team_invitations;
begin
  select * into v_inv from public.team_invitations where id = p_invitation_id for update;

  if not found then
    raise exception 'Diese Einladung gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if not (private.ist_mannschaftsfuehrer(v_inv.team_id) or private.is_admin()) then
    raise exception 'Einladungen zurückziehen darf nur der Mannschaftsführer.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_inv.status <> 'offen' then
    raise exception 'Diese Einladung ist nicht mehr offen.' using errcode = 'check_violation';
  end if;

  update public.team_invitations
     set status = 'zurueckgezogen', answered_at = now()
   where id = p_invitation_id;
end;
$$;

revoke execute on function public.mannschaft_einladung_zurueckziehen(uuid) from public, anon;
grant  execute on function public.mannschaft_einladung_zurueckziehen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Meine Einladungen
-- ---------------------------------------------------------------------------

create or replace function public.meine_mannschaft_einladungen()
returns table (
  id                uuid,
  team_id           uuid,
  team_name         text,
  eingeladen_von    text,
  created_at        timestamptz,
  expires_at        timestamptz,
  wechsel_von       text,
  annehmen_moeglich boolean,
  hinweis           text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me      uuid := private.current_member_id();
  v_alt     uuid;
  v_alt_mf  boolean;
  v_alt_nm  text;
begin
  if v_me is null then
    raise exception 'Nur Mitglieder haben ein Konto.' using errcode = 'insufficient_privilege';
  end if;

  select m.team_id, m.is_team_captain, t.name
    into v_alt, v_alt_mf, v_alt_nm
    from public.members m
    left join public.teams t on t.id = m.team_id
   where m.id = v_me;

  return query
  select i.id,
         i.team_id,
         t.name,
         case when i.invited_by is null then 'Der Vorstand'
              else private.member_label(i.invited_by) end,
         i.created_at,
         i.expires_at,
         case when v_alt is not null and v_alt <> i.team_id then v_alt_nm end,
         not (v_alt is not null and v_alt <> i.team_id and v_alt_mf),
         case
           when v_alt is not null and v_alt <> i.team_id and v_alt_mf then
             format('Du bist Mannschaftsführer von %s. Das kann nur der Vorstand ändern.', v_alt_nm)
           when v_alt is not null and v_alt <> i.team_id then
             format('Du wechselst damit aus %s in %s.', v_alt_nm, t.name)
         end
    from public.team_invitations i
    join public.teams t on t.id = i.team_id
   where i.member_id = v_me
     and i.status = 'offen'
     and i.expires_at >= now()
     and t.active
   order by i.created_at desc;
end;
$$;

revoke execute on function public.meine_mannschaft_einladungen() from public, anon;
grant  execute on function public.meine_mannschaft_einladungen() to authenticated;

-- ---------------------------------------------------------------------------
-- Einladung beantworten
-- ---------------------------------------------------------------------------

create or replace function public.mannschaft_einladung_beantworten(
  p_invitation_id    uuid,
  p_annehmen         boolean,
  p_telefon_sichtbar boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me   public.members;
  v_inv  public.team_invitations;
  v_mf   uuid;
  v_alt  uuid;
  v_name text;
  v_team text;
  v_ja   boolean := coalesce(p_annehmen, false);
begin
  select * into v_me from public.members where id = private.current_member_id();
  if not found then
    raise exception 'Nur Mitglieder haben ein Konto.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_inv from public.team_invitations where id = p_invitation_id for update;
  if not found or v_inv.member_id <> v_me.id then
    raise exception 'Diese Einladung gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if v_inv.status <> 'offen' then
    raise exception 'Diese Einladung ist nicht mehr offen.' using errcode = 'check_violation';
  end if;

  if v_inv.expires_at < now() then
    raise exception 'Diese Einladung ist abgelaufen.' using errcode = 'check_violation';
  end if;

  v_name := private.member_label(v_me.id);
  v_team := private.team_label(v_inv.team_id);
  v_alt  := v_me.team_id;

  if v_ja then
    if not exists (select 1 from public.teams t where t.id = v_inv.team_id and t.active) then
      raise exception 'Diese Mannschaft gibt es nicht mehr.' using errcode = 'check_violation';
    end if;

    if v_me.is_team_captain and v_alt is distinct from v_inv.team_id then
      raise exception 'Du bist Mannschaftsführer von %. Das kann nur der Vorstand ändern.',
        private.team_label(v_alt) using errcode = 'check_violation';
    end if;

    if v_me.status <> 'active' then
      raise exception 'Nur aktive Mitglieder spielen in einer Mannschaft.'
        using errcode = 'check_violation';
    end if;

    update public.team_invitations
       set status = 'angenommen', answered_at = now()
     where id = v_inv.id;

    -- Weitere offene Einladungen des Mitglieds sind damit erledigt.
    update public.team_invitations
       set status = 'zurueckgezogen', answered_at = now()
     where member_id = v_me.id and status = 'offen' and id <> v_inv.id;

    perform set_config('tcm.selbstpflege_rpc', 'on', true);
    update public.members
       set team_id = v_inv.team_id, is_team_captain = false
     where id = v_me.id;
    -- Getrennt, weil members_team_wechsel die Zustimmung beim Wechsel löscht.
    update public.members
       set team_phone_visible = coalesce(p_telefon_sichtbar, false)
     where id = v_me.id;
    perform set_config('tcm.selbstpflege_rpc', '', true);

    -- Der MF der alten Mannschaft erfährt vom Wechsel.
    if v_alt is not null and v_alt <> v_inv.team_id then
      v_mf := private.team_captain(v_alt);
      if v_mf is not null then
        insert into public.notifications (member_id, kind, title, body)
        values (v_mf, 'team_left', 'Spieler hat die Mannschaft verlassen',
                format('%s ist aus %s ausgetreten und spielt jetzt in %s.',
                       v_name, private.team_label(v_alt), v_team));
      end if;
    end if;
  else
    update public.team_invitations
       set status = 'abgelehnt', answered_at = now()
     where id = v_inv.id;
  end if;

  v_mf := coalesce(private.team_captain(v_inv.team_id), v_inv.invited_by);
  if v_mf is not null and v_mf <> v_me.id then
    insert into public.notifications (member_id, kind, title, body)
    values (v_mf, 'team_invitation_answered',
            case when v_ja then 'Einladung angenommen' else 'Einladung abgelehnt' end,
            format('%s hat die Einladung in %s %s.', v_name, v_team,
                   case when v_ja then 'angenommen' else 'abgelehnt' end));
  end if;
end;
$$;

revoke execute on function public.mannschaft_einladung_beantworten(uuid, boolean, boolean) from public, anon;
grant  execute on function public.mannschaft_einladung_beantworten(uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Austragen und austreten
-- ---------------------------------------------------------------------------

create or replace function public.mannschaft_austragen(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := private.current_member_id();
  v_ziel  public.members;
  v_mf    uuid;
  v_admin boolean := private.is_admin();
begin
  if v_me is null then
    raise exception 'Nur Mitglieder haben ein Konto.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_ziel from public.members where id = p_member_id for update;
  if not found then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if p_member_id = v_me then
    -- Selbst austreten.
    if v_ziel.team_id is null then
      raise exception 'Du bist in keiner Mannschaft.' using errcode = 'check_violation';
    end if;
    if v_ziel.is_team_captain then
      raise exception 'Als Mannschaftsführer kannst du nicht austreten. Das kann nur der Vorstand ändern.'
        using errcode = 'check_violation';
    end if;
  else
    if v_ziel.team_id is null
       or not (v_admin or private.ist_mannschaftsfuehrer(v_ziel.team_id)) then
      raise exception 'Spieler austragen darf nur der Mannschaftsführer.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  perform set_config('tcm.selbstpflege_rpc', 'on', true);
  update public.members
     set team_id = null, is_team_captain = false, team_phone_visible = false
   where id = p_member_id;
  perform set_config('tcm.selbstpflege_rpc', '', true);

  if p_member_id = v_me then
    v_mf := private.team_captain(v_ziel.team_id);
    if v_mf is not null then
      insert into public.notifications (member_id, kind, title, body)
      values (v_mf, 'team_left', 'Spieler hat die Mannschaft verlassen',
              format('%s ist aus %s ausgetreten.',
                     private.member_label(v_me), private.team_label(v_ziel.team_id)));
    end if;
  else
    insert into public.notifications (member_id, kind, title, body)
    values (p_member_id, 'team_removed', 'Aus der Mannschaft ausgetragen',
            format('Du bist nicht mehr in der Mannschaft %s.',
                   private.team_label(v_ziel.team_id)));
  end if;
end;
$$;

revoke execute on function public.mannschaft_austragen(uuid) from public, anon;
grant  execute on function public.mannschaft_austragen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Zustimmung zum Telefon ändern
-- ---------------------------------------------------------------------------

create or replace function public.set_team_phone_visible(p_visible boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_member_id();
begin
  if v_me is null then
    raise exception 'Nur Mitglieder haben ein Konto.' using errcode = 'insufficient_privilege';
  end if;

  if (select m.team_id from public.members m where m.id = v_me) is null then
    raise exception 'Das geht nur, wenn du in einer Mannschaft bist.'
      using errcode = 'check_violation';
  end if;

  perform set_config('tcm.selbstpflege_rpc', 'on', true);
  update public.members set team_phone_visible = coalesce(p_visible, false) where id = v_me;
  perform set_config('tcm.selbstpflege_rpc', '', true);
end;
$$;

revoke execute on function public.set_team_phone_visible(boolean) from public, anon;
grant  execute on function public.set_team_phone_visible(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Push ja, Mail nein
-- ---------------------------------------------------------------------------

do $$
declare
  v_kind text;
begin
  foreach v_kind in array array['team_invited', 'team_invitation_answered', 'team_removed', 'team_left'] loop
    update public.settings
       set value = to_jsonb(concat_ws(',', nullif(btrim(value #>> '{}'), ''), v_kind))
     where key = 'notifications.push_kinds'
       and not (v_kind = any (string_to_array(coalesce(value #>> '{}', ''), ',')));
  end loop;
end $$;

-- Für frische Datenbanken: Default der Push-Arten um die vier erweitert.
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
     'Wie viele künftige Buchungen ein Mitglied gleichzeitig haben darf. '
     'Mitspieler zählen mit. 0 bedeutet unbegrenzt.'),
    ('booking.lead_days', '7'::jsonb, 'integer', 'Buchungsvorlauf in Tagen',
     'Rollierend: buchbar ist alles innerhalb der nächsten X Tage.'),
    ('booking.opening_time', '"08:00"'::jsonb, 'time', 'Öffnungszeit',
     'Früheste Startzeit einer Buchung.'),
    ('booking.closing_time', '"21:00"'::jsonb, 'time', 'Schließzeit',
     'Späteste Endzeit einer Buchung.'),
    ('booking.slot_minutes', '30'::jsonb, 'integer', 'Raster in Minuten',
     'Startzeiten müssen auf dieses Raster fallen (30 = :00 und :30).'),
    ('booking.display_minutes', '60'::jsonb, 'integer', 'Raster der Plananzeige',
     'In welchen Schritten der Belegungsplan Zeilen zeigt. Gebucht wird im '
     'feineren Raster aus booking.slot_minutes.'),
    ('booking.guest_fee_cents', '1000'::jsonb, 'integer', 'Gastgebühr in Cent',
     '0 = keine Gebühr. Sonst wird sie je Gast dem buchenden Mitglied '
     'berechnet und mit der nächsten Lastschrift eingezogen.'),
    ('notifications.mail_kinds',
     '"booking_displaced,booking_cancelled,booking_removed,application_new,charge_announced,charge_returned,booking_moved,event_promoted,event_cancelled,event_changed,account_deletion_requested"'::jsonb,
     'text', 'Benachrichtigungen, die auch per E-Mail gehen',
     'Kommagetrennte Liste. Wer bei "E-Mails zu Buchungen" auf "Alle" steht, '
     'bekommt jede Art; alle anderen nur diese hier.'),
    ('drinks.min_debit_cents', '500'::jsonb, 'integer', 'Mindestbetrag Lastschrift',
     'Beträge darunter werden nicht eingezogen, sondern beim nächsten Lauf '
     'mitgenommen. Die Schwelle gilt je Zahler über alle offenen Forderungen.'),
    ('drinks.void_window_minutes', '15'::jsonb, 'integer', 'Storno-Fenster Getränke',
     'So lange darf ein Mitglied eine eigene Fehlbuchung selbst zurücknehmen.'),
    ('sepa.creditor_id', '""'::jsonb, 'text', 'Gläubiger-Identifikationsnummer',
     'Aus dem eBuSy-Backend übernehmen. Muss unverändert bleiben, damit die '
     'Bestandsmandate gültig bleiben.'),
    ('sepa.creditor_iban', '""'::jsonb, 'text', 'IBAN des Vereinskontos',
     'Auf dieses Konto werden die Lastschriften gutgeschrieben. Ohne sie lässt '
     'sich keine Datei erzeugen.'),
    ('sepa.creditor_bic', '""'::jsonb, 'text', 'BIC des Vereinskontos',
     'Optional. Fehlt sie, trägt die Datei NOTPROVIDED - das reicht innerhalb '
     'des SEPA-Raums.'),
    ('sepa.pain_version', '"pain.008.001.08"'::jsonb, 'text', 'Format der Lastschriftdatei',
     'Mit der Hausbank abklären.'),
    ('sepa.prenotification_days', '14'::jsonb, 'integer', 'Vorabankündigung in Tagen',
     'Pflicht vor jedem Einzug. So viele Tage müssen zwischen Ankündigung '
     'und Fälligkeit liegen.'),
    ('sepa.creditor_name', '"TC Muckensturm e.V."'::jsonb, 'text', 'Name des Zahlungsempfängers',
     'Erscheint auf dem Kontoauszug der Mitglieder.'),
    ('sepa.mandate_text_version', '1'::jsonb, 'integer', 'Version des Mandatstexts',
     'Fassung des Textes, mit dem Mitglieder ihr SEPA-Mandat online erteilen. '
     'Wird hochgezählt, wenn sich der Text in private.sepa_mandatstext ändert.'),
    ('fees.annual_run_month', '1'::jsonb, 'integer', 'Monat des Beitragslaufs',
     'Der Lauf wird trotzdem manuell gestartet.'),
    ('fees.annual_run_day', '15'::jsonb, 'integer', 'Tag des Beitragslaufs',
     'Fälligkeitsdatum der Jahresbeitrags-Lastschrift.'),
    ('work_duty.hourly_rate_cents', '1500'::jsonb, 'integer', 'Stundensatz Arbeitsdienst',
     'Womit nicht geleistete Stunden zum Jahresende abgerechnet werden. Platzhalter.'),
    ('privacy.change_log_days', '1095'::jsonb, 'integer',
     'Aufbewahrung des Änderungsprotokolls in Tagen',
     'Ältere Einträge werden beim Aufräumlauf entfernt. 1095 Tage sind drei Jahre.'),
    ('notifications.push_kinds',
     '"booking_displaced,booking_cancelled,booking_removed,booking_added,player_joined,player_left,application_new,booking_moved,event_published,event_promoted,event_cancelled,event_changed,event_reminder,account_deletion_requested,team_invited,team_invitation_answered,team_removed,team_left"'::jsonb,
     'text', 'Benachrichtigungen, die auch als Push gehen',
     'Kommagetrennte Liste. Getrennt von den E-Mail-Arten, weil ein Push sofort '
     'da ist und auch Erfreuliches melden darf, das als Mail nur Lärm wäre.')
  on conflict (key) do nothing;

  select count(*) into v_after from public.settings;
  return v_after - v_before;
end;
$$;

revoke execute on function public.ensure_default_settings() from public, anon, authenticated;
