-- ===========================================================================
-- Arbeitsdienst
--
-- Soll-Stunden haengen an der Beitragsart: Erwachsene bis 65 leisten Dienst,
-- Jugendliche und Senioren nicht. Nicht geleistete Stunden werden zum
-- Jahresende in eine Forderung umgerechnet und mit dem Beitrag eingezogen.
--
-- Stunden als numeric, nicht integer: halbe Stunden sind ueblich.
-- ===========================================================================

create table public.work_duty_rules (
  fee_type_id    uuid not null references public.fee_types (id) on delete cascade,
  year           integer not null,
  required_hours numeric(6, 2) not null,
  created_at     timestamptz not null default now(),

  primary key (fee_type_id, year),
  constraint work_duty_rules_hours_not_negative check (required_hours >= 0),
  constraint work_duty_rules_year_plausible     check (year between 1970 and 2200)
);

comment on table public.work_duty_rules is
  'Soll-Stunden je Beitragsart und Jahr. Fehlt ein Eintrag, gilt 0.';

-- ---------------------------------------------------------------------------
-- Geleistete Stunden
--
-- Wird vom Vorstand oder Sportwart bestaetigt. Das Mitglied sieht seinen
-- Stand, kann ihn aber nicht selbst hochsetzen.
-- ---------------------------------------------------------------------------
create table public.work_duty_entries (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members (id) on delete cascade,
  year         integer not null,
  hours        numeric(6, 2) not null,
  worked_on    date not null,
  description  text,

  confirmed_by uuid references public.members (id) on delete set null,
  confirmed_at timestamptz,

  created_by   uuid references public.members (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint work_duty_entries_hours_positive check (hours > 0),
  constraint work_duty_entries_year_plausible check (year between 1970 and 2200),
  constraint work_duty_entries_confirm_consistent
    check ((confirmed_at is null) = (confirmed_by is null))
);

create index work_duty_entries_member_year_idx on public.work_duty_entries (member_id, year);
create index work_duty_entries_confirmed_idx   on public.work_duty_entries (confirmed_at);
create index work_duty_entries_created_by_idx  on public.work_duty_entries (created_by);
create index work_duty_entries_confirmed_by_idx on public.work_duty_entries (confirmed_by);

create trigger work_duty_entries_set_updated_at
  before update on public.work_duty_entries
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- Jahresabrechnung
--
-- Friert Soll, Ist und Stundensatz zum Abrechnungszeitpunkt ein. Eine spaetere
-- Aenderung der Regeln darf abgeschlossene Jahre nicht ruecklaufend veraendern.
-- ---------------------------------------------------------------------------
create table public.work_duty_settlements (
  member_id        uuid not null references public.members (id) on delete cascade,
  year             integer not null,

  required_hours   numeric(6, 2) not null,
  completed_hours  numeric(6, 2) not null,
  missing_hours    numeric(6, 2) not null,
  hourly_rate_cents integer not null,
  amount_cents     integer not null,

  charge_id        uuid references public.charges (id) on delete set null,
  settled_at       timestamptz not null default now(),
  settled_by       uuid references public.members (id) on delete set null,

  primary key (member_id, year),
  constraint work_duty_settlements_hours_not_negative
    check (required_hours >= 0 and completed_hours >= 0 and missing_hours >= 0),
  -- Mehr geleistet als gefordert ergibt keine negative Forderung, sondern null.
  constraint work_duty_settlements_missing_consistent
    check (missing_hours = greatest(required_hours - completed_hours, 0)),
  constraint work_duty_settlements_amount_not_negative check (amount_cents >= 0)
);

create index work_duty_settlements_charge_idx    on public.work_duty_settlements (charge_id);
create index work_duty_settlements_year_idx      on public.work_duty_settlements (year);
create index work_duty_settlements_settled_by_idx on public.work_duty_settlements (settled_by);
