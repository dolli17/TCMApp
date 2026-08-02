-- ===========================================================================
-- Getraenkeabrechnung
--
-- Kein Guthabenmodell: jede Entnahme ist eine einzelne Buchung, am Monatsende
-- wird pro Mitglied summiert. Der Preis wird beim Buchen eingefroren, damit
-- eine spaetere Preisaenderung abgeschlossene Abrechnungen nicht verfaelscht.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Abrechnungsperioden
-- ---------------------------------------------------------------------------
create table public.billing_periods (
  id         uuid primary key default gen_random_uuid(),
  year       integer not null,
  month      integer not null,
  status     public.billing_period_status not null default 'open',
  closed_at  timestamptz,
  charged_at timestamptz,
  closed_by  uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),

  unique (year, month),
  constraint billing_periods_month_valid check (month between 1 and 12),
  constraint billing_periods_year_valid  check (year between 1970 and 2200)
);

comment on table public.billing_periods is
  'Ein Monat. Nach dem Schliessen sind die Buchungen dieses Zeitraums unveraenderlich.';

create index billing_periods_status_idx on public.billing_periods (status);

-- ---------------------------------------------------------------------------
-- Getraenkeliste mit Preishistorie
-- ---------------------------------------------------------------------------
create table public.drink_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  category    public.drink_category not null default 'drink',
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint drink_items_name_set check (length(btrim(name)) > 0)
);

create unique index drink_items_name_unique on public.drink_items (lower(name));

create trigger drink_items_set_updated_at
  before update on public.drink_items
  for each row execute function extensions.moddatetime (updated_at);

create table public.drink_prices (
  drink_item_id uuid not null references public.drink_items (id) on delete cascade,
  valid_from    date not null,
  price_cents   integer not null,
  created_at    timestamptz not null default now(),

  primary key (drink_item_id, valid_from),
  constraint drink_prices_positive check (price_cents > 0)
);

-- ---------------------------------------------------------------------------
-- Entnahmen
-- ---------------------------------------------------------------------------
create table public.drink_purchases (
  id               uuid primary key default gen_random_uuid(),
  member_id        uuid not null references public.members (id) on delete restrict,
  drink_item_id    uuid not null references public.drink_items (id) on delete restrict,

  quantity         integer not null,
  -- Eingefrorener Preis. Nicht aus drink_prices nachschlagen, sondern beim
  -- Buchen kopieren - sonst aendert eine Preispflege rueckwirkend alte Monate.
  unit_price_cents integer not null,
  total_cents      integer generated always as (quantity * unit_price_cents) stored,

  source           public.purchase_source not null default 'app',
  -- Wer hat gebucht? Bei Selbstbuchung = member_id, am Kiosk das Geraet bzw.
  -- die Person im Thekendienst.
  recorded_by      uuid references public.members (id) on delete set null,

  billing_period_id uuid not null references public.billing_periods (id) on delete restrict,

  voided_at        timestamptz,
  voided_by        uuid references public.members (id) on delete set null,
  void_reason      text,

  created_at       timestamptz not null default now(),

  constraint drink_purchases_quantity_positive check (quantity > 0),
  constraint drink_purchases_price_positive    check (unit_price_cents > 0),
  constraint drink_purchases_void_consistent
    check ((voided_at is null) = (voided_by is null))
);

create index drink_purchases_member_id_idx  on public.drink_purchases (member_id);
create index drink_purchases_period_idx     on public.drink_purchases (billing_period_id);
create index drink_purchases_item_idx       on public.drink_purchases (drink_item_id);
create index drink_purchases_recorded_by_idx on public.drink_purchases (recorded_by);
create index drink_purchases_source_idx     on public.drink_purchases (source);
-- Fuer die Monatssumme: nur nicht stornierte Buchungen zaehlen.
create index drink_purchases_open_idx
  on public.drink_purchases (billing_period_id, member_id)
  where (voided_at is null);

-- ---------------------------------------------------------------------------
-- Periode automatisch zuordnen
--
-- Die Periode ergibt sich aus dem Buchungszeitpunkt in lokaler Zeit. Fehlt sie
-- noch, wird sie angelegt. So kann keine Buchung ohne Periode entstehen, egal
-- ob sie aus der App, vom Kiosk oder aus dem Seed kommt.
-- ---------------------------------------------------------------------------
create or replace function public.assign_billing_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local   timestamptz := coalesce(new.created_at, now());
  v_year    integer;
  v_month   integer;
  v_period  uuid;
begin
  if new.billing_period_id is not null then
    return new;
  end if;

  v_year  := extract(year  from (v_local at time zone 'Europe/Berlin'))::integer;
  v_month := extract(month from (v_local at time zone 'Europe/Berlin'))::integer;

  select id into v_period
  from public.billing_periods
  where year = v_year and month = v_month;

  if v_period is null then
    insert into public.billing_periods (year, month)
    values (v_year, v_month)
    on conflict (year, month) do nothing
    returning id into v_period;

    if v_period is null then
      select id into v_period
      from public.billing_periods
      where year = v_year and month = v_month;
    end if;
  end if;

  new.billing_period_id := v_period;
  return new;
end;
$$;

create trigger drink_purchases_assign_period
  before insert on public.drink_purchases
  for each row execute function public.assign_billing_period();

-- ---------------------------------------------------------------------------
-- Abgeschlossene Perioden sind unveraenderlich
--
-- Sobald ein Monat geschlossen oder abgerechnet ist, darf keine Buchung dieses
-- Zeitraums mehr entstehen, sich aendern oder verschwinden. Eine Abrechnung,
-- die sich nachtraeglich verschiebt, waere gegenueber den Mitgliedern nicht
-- vertretbar - deshalb steht die Regel in der Datenbank, nicht in der App.
-- ---------------------------------------------------------------------------
create or replace function public.guard_closed_billing_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period uuid := coalesce(new.billing_period_id, old.billing_period_id);
  v_status public.billing_period_status;
  v_label  text;
begin
  select bp.status, bp.year || '-' || lpad(bp.month::text, 2, '0')
    into v_status, v_label
  from public.billing_periods bp
  where bp.id = v_period;

  if v_status is distinct from 'open' then
    raise exception
      'Abrechnungszeitraum % ist abgeschlossen (%). Buchungen koennen nicht mehr geaendert werden.',
      v_label, v_status
      using errcode = 'check_violation';
  end if;

  -- Beim Verschieben in eine andere Periode muss auch die Zielperiode offen sein.
  if tg_op = 'UPDATE'
     and new.billing_period_id is distinct from old.billing_period_id then
    select bp.status into v_status
    from public.billing_periods bp
    where bp.id = new.billing_period_id;

    if v_status is distinct from 'open' then
      raise exception 'Zielzeitraum ist abgeschlossen.'
        using errcode = 'check_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger drink_purchases_guard_closed
  before insert or update or delete on public.drink_purchases
  for each row execute function public.guard_closed_billing_period();
