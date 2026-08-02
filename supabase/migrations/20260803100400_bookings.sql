-- ===========================================================================
-- Platzbuchung
--
-- Kernanforderung: Doppelbuchungen desselben Platzes zur selben Zeit muessen
-- zuverlaessig verhindert werden. Das loest hier ein EXCLUDE-Constraint auf
-- Datenbankebene - keine Anwendungslogik, kein "erst pruefen, dann schreiben".
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Plaetze
-- ---------------------------------------------------------------------------
create table public.courts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  short_name  text not null,
  subline     text,
  position    integer not null default 0,
  active      boolean not null default true,

  ebusy_id    bigint unique,
  source      public.record_source not null default 'app',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index courts_name_unique on public.courts (lower(name));

create trigger courts_set_updated_at
  before update on public.courts
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- Buchungsarten
--
-- Traegt die Regeln, die je Art unterschiedlich sind: feste Dauer, ob
-- Mitspieler Pflicht sind, ob die Buchung aufs Kontingent zaehlt und wer sie
-- ueberhaupt anlegen darf.
-- ---------------------------------------------------------------------------
create table public.booking_types (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,
  name                 text not null,
  applies_to           public.booking_kind not null default 'booking',

  duration_minutes     integer not null,
  min_players          integer not null default 2,
  max_players          integer not null default 2,
  requires_partner     boolean not null default true,
  counts_towards_quota boolean not null default true,
  -- Null = jedes Mitglied darf. Sonst nur die genannten Rollen.
  allowed_roles        public.app_role[],

  active               boolean not null default true,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint booking_types_duration_valid check (duration_minutes between 15 and 1440),
  constraint booking_types_players_valid  check (min_players >= 0 and max_players >= min_players)
);

create trigger booking_types_set_updated_at
  before update on public.booking_types
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- Serien (wiederkehrende Blockungen)
--
-- In eBuSy existieren 134 Trainings-Blockungen als lauter Einzeldatensaetze.
-- Hier wird die Regel einmal beschrieben und in echte Buchungen ausmaterialisiert.
-- ---------------------------------------------------------------------------
create table public.booking_series (
  id              uuid primary key default gen_random_uuid(),
  court_id        uuid not null references public.courts (id) on delete cascade,
  booking_type_id uuid not null references public.booking_types (id) on delete restrict,

  -- 0 = Sonntag, 1 = Montag ... entspricht extract(dow).
  weekday         integer not null,
  start_time      time not null,
  end_time        time not null,
  valid_from      date not null,
  valid_to        date not null,

  title           text not null,
  created_by      uuid references public.members (id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint booking_series_weekday_valid check (weekday between 0 and 6),
  constraint booking_series_time_order    check (end_time > start_time),
  constraint booking_series_date_order    check (valid_to >= valid_from)
);

create index booking_series_court_idx      on public.booking_series (court_id);
create index booking_series_created_by_idx on public.booking_series (created_by);
create index booking_series_type_idx       on public.booking_series (booking_type_id);

-- ---------------------------------------------------------------------------
-- Buchungen
-- ---------------------------------------------------------------------------
create table public.bookings (
  id                  uuid primary key default gen_random_uuid(),
  court_id            uuid not null references public.courts (id) on delete restrict,

  -- Der belegte Zeitraum als Bereich. Halboffen [), damit 10-11 Uhr und
  -- 11-12 Uhr NICHT als Ueberlappung gelten.
  slot                tstzrange not null,

  kind                public.booking_kind not null default 'booking',
  booking_type_id     uuid not null references public.booking_types (id) on delete restrict,
  -- Null bei Blockungen: die gehoeren dem Verein, nicht einer Person.
  member_id           uuid references public.members (id) on delete restrict,
  series_id           uuid references public.booking_series (id) on delete set null,

  title               text,
  booking_code        text,
  status              public.booking_status not null default 'active',

  created_by          uuid references public.members (id) on delete set null,
  created_at          timestamptz not null default now(),
  cancelled_at        timestamptz,
  cancelled_by        uuid references public.members (id) on delete set null,
  cancellation_reason text,

  ebusy_id            bigint unique,
  source              public.record_source not null default 'app',

  -- Ein leerer oder verkehrt herum liegender Zeitraum ist keine Buchung.
  constraint bookings_slot_not_empty check (not isempty(slot)),
  -- Erzwingt die halboffene Form. Ohne das koennten zwei Buchungen an der
  -- gemeinsamen Grenze als Konflikt gelten - oder schlimmer: nicht.
  constraint bookings_slot_half_open
    check (lower_inc(slot) and not upper_inc(slot)),
  constraint bookings_slot_bounded
    check (lower(slot) is not null and upper(slot) is not null),
  -- Eine Buchung braucht ein Mitglied, eine Blockung einen Titel.
  constraint bookings_owner_present
    check ((kind = 'booking' and member_id is not null)
        or (kind = 'blocking' and title is not null)),
  constraint bookings_cancel_consistent
    check ((status = 'cancelled') = (cancelled_at is not null))
);

-- ---------------------------------------------------------------------------
-- DER Doppelbuchungsschutz
--
-- Zwei aktive Buchungen koennen sich auf demselben Platz nicht zeitlich
-- ueberlappen. Das gilt auch bei zwei gleichzeitigen Transaktionen: Postgres
-- serialisiert die Pruefung ueber den GiST-Index, eine der beiden bekommt
-- zwingend einen exclusion_violation. Kein Client kann das umgehen.
--
-- Stornierte Buchungen sind ausgenommen, damit ein freigegebener Slot sofort
-- wieder buchbar ist.
-- ---------------------------------------------------------------------------
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (court_id with =, slot with &&)
  where (status = 'active');

create index bookings_member_id_idx  on public.bookings (member_id);
create index bookings_court_idx      on public.bookings (court_id);
create index bookings_series_idx     on public.bookings (series_id);
create index bookings_created_by_idx on public.bookings (created_by);
create index bookings_type_idx       on public.bookings (booking_type_id);
-- Fuer die Kontingentpruefung: kuenftige, aktive Buchungen eines Mitglieds.
create index bookings_active_future_idx
  on public.bookings (member_id, slot)
  where (status = 'active');
-- Fuer den Belegungsplan eines Tages.
create index bookings_slot_idx on public.bookings using gist (slot);

-- ---------------------------------------------------------------------------
-- Mitspieler
--
-- Mitspieler sind Pflicht (408 von 460 Buchungen in eBuSy haben sie bereits).
-- Ein Eintrag verweist entweder auf ein Mitglied oder traegt einen Gastnamen -
-- niemals beides und niemals keines von beidem.
-- ---------------------------------------------------------------------------
create table public.booking_players (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  member_id  uuid references public.members (id) on delete restrict,
  guest_name text,
  created_at timestamptz not null default now(),

  constraint booking_players_member_xor_guest
    check ((member_id is null) <> (guest_name is null))
);

-- Dasselbe Mitglied darf nicht zweimal in derselben Buchung stehen.
create unique index booking_players_unique_member
  on public.booking_players (booking_id, member_id)
  where (member_id is not null);

create index booking_players_booking_idx on public.booking_players (booking_id);
create index booking_players_member_idx  on public.booking_players (member_id);
