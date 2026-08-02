-- ===========================================================================
-- Mitglieder, Mitgliedschaften, Rollen
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- members
--
-- Ein Mitglied ist NICHT dasselbe wie ein Login. auth_user_id darf null sein:
-- Kinder (das juengste Mitglied ist 6) bekommen einen vollwertigen Datensatz,
-- aber keinen Account. Die Verbindung zum zahlenden Elternteil laeuft ueber
-- billing_payer_id, nicht ueber einen geteilten Login.
-- ---------------------------------------------------------------------------
create table public.members (
  id                uuid primary key default gen_random_uuid(),
  auth_user_id      uuid unique references auth.users (id) on delete set null,

  first_name        text not null,
  last_name         text not null,
  title             text,
  gender            public.gender,
  salutation        public.salutation,
  birthday          date,

  email             extensions.citext unique,
  phone             text,
  mobile            text,

  street            text,
  postcode          text,
  city              text,
  country_code      text,

  -- Wer bezahlt fuer dieses Mitglied? Null = zahlt selbst.
  billing_payer_id  uuid references public.members (id) on delete set null,

  notes             text,
  status            public.member_status not null default 'active',

  -- Migrationspfad: bleibt bis zum Cutover leer, existiert aber ab Tag eins.
  ebusy_person_id   bigint unique,
  source            public.record_source not null default 'app',
  imported_at       timestamptz,
  import_notes      text,
  legacy_data       jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint members_no_self_payer   check (billing_payer_id is null or billing_payer_id <> id),
  constraint members_birthday_past   check (birthday is null or birthday <= current_date),
  constraint members_first_name_set  check (length(btrim(first_name)) > 0),
  constraint members_last_name_set   check (length(btrim(last_name)) > 0)
);

comment on column public.members.auth_user_id is
  'Null = Mitglied ohne Login (z.B. Kinder). Ein Account gehoert immer genau einer Person.';
comment on column public.members.billing_payer_id is
  'Zahler-Beziehung fuer SEPA und Familien. Ersetzt eBuSy paidByInfo.';
comment on column public.members.email is
  'Unique erzwungen: auth.users.email ist ebenfalls unique. Mehrfach genutzte '
  'Adressen muessen vor dem Import bereinigt werden.';

-- Indizes: auth_user_id und billing_payer_id werden in RLS-Policies benutzt.
create index members_billing_payer_id_idx on public.members (billing_payer_id);
create index members_status_idx           on public.members (status);
create index members_last_name_idx        on public.members (lower(last_name), lower(first_name));

create trigger members_set_updated_at
  before update on public.members
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- memberships
--
-- Eigene Tabelle statt Feldern am Mitglied, damit Aus- und Wiedereintritt
-- historisch nachvollziehbar bleiben.
-- ---------------------------------------------------------------------------
create table public.memberships (
  id                  uuid primary key default gen_random_uuid(),
  member_id           uuid not null references public.members (id) on delete cascade,

  number              text not null unique,
  started_on          date not null,
  ended_on            date,
  cancellation_date   date,
  cancellation_reason text,
  status              public.membership_status not null default 'active',
  notes               text,

  ebusy_id            bigint unique,
  source              public.record_source not null default 'app',
  imported_at         timestamptz,
  import_notes        text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint memberships_period_valid check (ended_on is null or ended_on >= started_on)
);

comment on table public.memberships is
  'Mitgliedschaft mit Nummer und Zeitraum. Eine Person kann nacheinander mehrere haben.';

create index memberships_member_id_idx on public.memberships (member_id);
create index memberships_status_idx    on public.memberships (status);

-- Pro Mitglied darf hoechstens eine Mitgliedschaft offen sein.
create unique index memberships_one_open_per_member
  on public.memberships (member_id)
  where (ended_on is null);

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- member_roles
--
-- Mehrfachrollen sind moeglich: jemand kann gleichzeitig Vorstand und Trainer
-- sein. Die Rollen landen spaeter als JWT-Claim im Token, damit RLS-Policies
-- keinen Subselect pro Zeile brauchen.
-- ---------------------------------------------------------------------------
create table public.member_roles (
  member_id  uuid not null references public.members (id) on delete cascade,
  role       public.app_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.members (id) on delete set null,

  primary key (member_id, role)
);

comment on table public.member_roles is
  'Rollenzuweisung. Die Rolle "member" hat jedes aktive Mitglied; alles darueber '
  'hinaus wird vom Vorstand vergeben.';

create index member_roles_role_idx       on public.member_roles (role);
create index member_roles_granted_by_idx on public.member_roles (granted_by);
