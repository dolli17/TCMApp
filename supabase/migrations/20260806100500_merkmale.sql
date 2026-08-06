-- ===========================================================================
-- Merkmale
--
-- eBuSy loest alles, wofuer es kein Feld hat, ueber frei definierbare
-- Attribute mit Wertelisten: Trainer, Beitragsstatus, Ehrungen. Das ist der
-- Mechanismus, den wir hier nachbauen - fuer alles, was der Vorstand kuenftig
-- am Mitglied festhalten will, ohne dass jemand eine Migration schreibt.
--
-- Fachlich Wichtiges bleibt dagegen eine echte Spalte: Trainer, Leistungs-
-- klasse und Spielberechtigung stehen in members, weil man danach filtert,
-- sortiert und meldet. Ein Merkmal ist fuer das gedacht, was der Verein
-- notiert, nicht fuer das, worauf die App Entscheidungen stuetzt.
--
-- Der Dreiklang Definition / Werteliste / Zuordnung spiegelt bewusst
-- fee_types / fee_prices / member_fees - dasselbe Muster, keine neue Idee.
-- ===========================================================================

do $$ begin
  create type public.attribute_kind as enum ('list', 'text', 'date', 'boolean', 'number');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Definitionen
-- ---------------------------------------------------------------------------
create table public.member_attribute_types (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  -- Pflichtfeld, und zwar mit Absicht: wer ein Merkmal anlegt, soll den Zweck
  -- benennen. Das ist die einfachste Form der Zweckbindung - und es haelt
  -- davon ab, aus Bequemlichkeit Gesundheits- oder Herkunftsdaten zu erfassen.
  description    text not null,
  value_kind     public.attribute_kind not null default 'list',
  -- Darf ein Mitglied mehrere Werte gleichzeitig haben?
  multiple       boolean not null default false,
  -- Darf das Mitglied es selbst setzen? Fuer Einwilligungen: ja.
  self_editable  boolean not null default false,
  -- Erscheint es im oeffentlichen Mitgliedsantrag?
  in_application boolean not null default false,
  active         boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint member_attribute_types_code_format check (code ~ '^[a-z0-9_]+$'),
  constraint member_attribute_types_name_set    check (length(btrim(name)) > 0),
  constraint member_attribute_types_beschreibung_set
    check (length(btrim(description)) > 0)
);

comment on table public.member_attribute_types is
  'Frei definierbare Merkmale am Mitglied. Der Vorstand legt sie im '
  'Admin-Dashboard an, ohne dass jemand Code anfasst.';

create trigger member_attribute_types_set_updated_at
  before update on public.member_attribute_types
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- Werteliste
-- ---------------------------------------------------------------------------
create table public.member_attribute_options (
  id                uuid primary key default gen_random_uuid(),
  attribute_type_id uuid not null references public.member_attribute_types (id) on delete cascade,
  value             text not null,
  label             text not null,
  sort_order        integer not null default 0,
  active            boolean not null default true,

  unique (attribute_type_id, value),
  constraint member_attribute_options_value_set check (length(btrim(value)) > 0)
);

create index member_attribute_options_type_idx
  on public.member_attribute_options (attribute_type_id, sort_order);

-- ---------------------------------------------------------------------------
-- Zuordnung
--
-- Entweder ein Wert aus der Liste oder ein Freitext, nie beides. Bei
-- Einwilligungen (value_kind = 'boolean') ist allein die Existenz der Zeile
-- die Aussage: sie steht fuer "erteilt", und set_at haelt fest, wann. Ein
-- Widerruf loescht sie. Damit ist der Nachweis genau so gefuehrt, wie ihn die
-- Datenschutz-Grundverordnung erwartet.
-- ---------------------------------------------------------------------------
create table public.member_attribute_values (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references public.members (id) on delete cascade,
  attribute_type_id uuid not null references public.member_attribute_types (id) on delete restrict,
  option_id         uuid references public.member_attribute_options (id) on delete restrict,
  text_value        text,
  set_at            timestamptz not null default now(),
  set_by            uuid references public.members (id) on delete set null,

  constraint member_attribute_values_one_value
    check (num_nonnulls(option_id, text_value) = 1),
  constraint member_attribute_values_text_length
    check (text_value is null or length(text_value) <= 500)
);

create unique index member_attribute_values_unique
  on public.member_attribute_values
     (member_id, attribute_type_id, coalesce(option_id::text, text_value));

create index member_attribute_values_member_idx on public.member_attribute_values (member_id);
create index member_attribute_values_type_idx
  on public.member_attribute_values (attribute_type_id, option_id);
create index member_attribute_values_set_by_idx on public.member_attribute_values (set_by);

-- ---------------------------------------------------------------------------
-- Ein Wert je Merkmal, wo multiple aus ist
--
-- Als Index laesst sich das nicht ausdruecken: die Bedingung steht in einer
-- anderen Tabelle. Deshalb ein Trigger.
-- ---------------------------------------------------------------------------
create or replace function private.guard_single_attribute_value()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_typ public.member_attribute_types;
begin
  select * into v_typ from public.member_attribute_types where id = new.attribute_type_id;

  if not found then
    raise exception 'Dieses Merkmal gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if not v_typ.multiple and exists (
    select 1 from public.member_attribute_values v
    where v.member_id = new.member_id
      and v.attribute_type_id = new.attribute_type_id
      and v.id is distinct from new.id
  ) then
    raise exception 'Fuer "%" ist nur ein Wert vorgesehen.', v_typ.name
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger member_attribute_values_guard_single
  before insert or update on public.member_attribute_values
  for each row execute function private.guard_single_attribute_value();

-- Merkmalsaenderungen gehoeren ins Protokoll wie alles andere auch.
create trigger member_attribute_values_log_change
  after insert or update or delete on public.member_attribute_values
  for each row execute function private.log_change('member_id', '', 'attribute_type_id');

-- ---------------------------------------------------------------------------
-- Rechte
--
-- Definitionen und Wertelisten darf jedes angemeldete Mitglied lesen - ohne
-- sie liesse sich im Konto nicht anzeigen, worum es bei einer Einwilligung
-- geht. Geaendert werden sie nur von Admins.
--
-- Werte folgen der ueblichen Sichtbarkeit: eigene und die der Personen, fuer
-- die ich zahle. Geschrieben wird ausschliesslich ueber set_member_attribute -
-- deshalb hier kein Schreib-Grant.
-- ---------------------------------------------------------------------------
alter table public.member_attribute_types   enable row level security;
alter table public.member_attribute_options enable row level security;
alter table public.member_attribute_values  enable row level security;

create policy member_attribute_types_select on public.member_attribute_types
  for select to authenticated using (true);
create policy member_attribute_types_admin_all on public.member_attribute_types
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy member_attribute_options_select on public.member_attribute_options
  for select to authenticated using (true);
create policy member_attribute_options_admin_all on public.member_attribute_options
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy member_attribute_values_select on public.member_attribute_values
  for select to authenticated
  using ((select private.can_view_member(member_id)) or (select private.is_admin()));
create policy member_attribute_values_admin_all on public.member_attribute_values
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

grant select on public.member_attribute_types   to authenticated;
grant select on public.member_attribute_options to authenticated;
grant select on public.member_attribute_values  to authenticated;

-- ---------------------------------------------------------------------------
-- Anonymisieren erweitern
--
-- Die Funktion aus der Kern-Migration kannte die Merkmale noch nicht. Ein
-- Loeschwunsch muss sie mit erfassen - gerade die Einwilligungen sagen etwas
-- ueber die Person aus.
-- ---------------------------------------------------------------------------
create or replace function public.anonymize_member(p_member_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lauf integer;
begin
  if not private.is_admin() then
    raise exception 'Mitglieder anonymisieren duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_member_id = private.current_member_id() then
    raise exception 'Du kannst dich nicht selbst anonymisieren.'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  select count(*)::integer + 1 into v_lauf
  from public.members where last_name like 'Mitglied #%';

  update public.sepa_mandates
     set status = 'revoked', revoked_on = coalesce(revoked_on, current_date)
   where member_id = p_member_id and status = 'active';
  delete from public.bank_accounts where member_id = p_member_id;
  delete from public.member_attribute_values where member_id = p_member_id;

  update public.members set
    first_name = 'Geloescht',
    last_name  = 'Mitglied #' || v_lauf,
    title = null, gender = null, salutation = null, birthday = null,
    email = null, phone = null, mobile = null,
    street = null, postcode = null, city = null,
    emergency_contact_name = null, emergency_contact_phone = null,
    emergency_contact_relation = null,
    nationality_code = null, tennis_lk = null, nuliga_id = null,
    playing_right = 'none', playing_right_since = null,
    legacy_data = null, ebusy_person_id = null,
    auth_user_id = null, invited_at = null, login_disabled_at = now(),
    is_trainer = false,
    status = 'archived',
    notes = 'Anonymisiert am ' || to_char(current_date, 'DD.MM.YYYY')
            || coalesce(': ' || nullif(btrim(coalesce(p_reason, '')), ''), '')
  where id = p_member_id;

  delete from public.member_roles where member_id = p_member_id and role = 'admin';
  update public.members set billing_payer_id = null where billing_payer_id = p_member_id;
end;
$$;

revoke execute on function public.anonymize_member(uuid, text) from public, anon;
grant  execute on function public.anonymize_member(uuid, text) to authenticated;
