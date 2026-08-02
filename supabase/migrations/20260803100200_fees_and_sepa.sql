-- ===========================================================================
-- Beitraege, Bankverbindungen, SEPA-Mandate, Forderungen und Lastschriftlaeufe
--
-- Geldbetraege durchgehend als integer in Cent. Niemals float: bei einem
-- Beitragslauf ueber 400 Mitglieder summieren sich Rundungsfehler zu echten
-- Differenzen auf dem Vereinskonto.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Beitragsarten und ihre Preishistorie
-- ---------------------------------------------------------------------------
create table public.fee_types (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.fee_types is
  'Beitragsarten wie Erwachsener, Jugend, Passiv, Student, Schluesselpfand. '
  'Der Betrag steht nicht hier, sondern jahresweise in fee_prices.';

create trigger fee_types_set_updated_at
  before update on public.fee_types
  for each row execute function extensions.moddatetime (updated_at);

-- Preise gelten ab einem Jahr und bleiben historisch erhalten. Eine
-- Beitragserhoehung darf zurueckliegende Jahre nicht veraendern.
create table public.fee_prices (
  fee_type_id     uuid not null references public.fee_types (id) on delete cascade,
  valid_from_year integer not null,
  amount_cents    integer not null,
  created_at      timestamptz not null default now(),

  primary key (fee_type_id, valid_from_year),
  constraint fee_prices_amount_not_negative check (amount_cents >= 0),
  constraint fee_prices_year_plausible      check (valid_from_year between 1970 and 2200)
);

-- ---------------------------------------------------------------------------
-- Zuordnung Mitglied -> Beitragsart, jahresweise
--
-- Bewusst n:m: 67 der 398 Mitgliedschaften in eBuSy haben zwei Beitragsarten,
-- typischerweise Beitrag plus Schluesselpfand. Ein einzelnes Feld am Mitglied
-- koennte das nicht abbilden.
-- ---------------------------------------------------------------------------
create table public.member_fees (
  member_id             uuid not null references public.members (id) on delete cascade,
  fee_type_id           uuid not null references public.fee_types (id) on delete restrict,
  year                  integer not null,
  -- Ueberschreibt den Preis der Beitragsart fuer Sonderfaelle (Ehrenmitglied,
  -- anteiliger Beitrag bei Eintritt mitten im Jahr).
  override_amount_cents integer,
  note                  text,
  created_at            timestamptz not null default now(),

  primary key (member_id, fee_type_id, year),
  constraint member_fees_override_not_negative
    check (override_amount_cents is null or override_amount_cents >= 0),
  constraint member_fees_year_plausible check (year between 1970 and 2200)
);

create index member_fees_member_id_idx on public.member_fees (member_id);
create index member_fees_year_idx      on public.member_fees (year);
create index member_fees_fee_type_idx  on public.member_fees (fee_type_id);

-- ---------------------------------------------------------------------------
-- Bankverbindungen
--
-- Eigene Tabelle statt Spalten an members: die IBAN ist das sensibelste Datum
-- im System und bekommt eine eigene, engere RLS-Policy. Gespeichert wird nur
-- der verschluesselte Wert; iban_last4 dient der Anzeige ("DE.. 1234").
-- ---------------------------------------------------------------------------
create table public.bank_accounts (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.members (id) on delete cascade,
  iban_encrypted bytea not null,
  iban_last4     text not null,
  holder         text not null,
  bank_name      text,
  active         boolean not null default true,

  ebusy_id       bigint unique,
  source         public.record_source not null default 'app',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint bank_accounts_last4_format check (iban_last4 ~ '^[0-9]{4}$')
);

comment on table public.bank_accounts is
  'IBAN nur verschluesselt. 76 Mitglieder teilen sich ein Konto (Familien) - '
  'das ist zulaessig, solange die Mandatsreferenzen unterschiedlich sind.';

create index bank_accounts_member_id_idx on public.bank_accounts (member_id);

create trigger bank_accounts_set_updated_at
  before update on public.bank_accounts
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- SEPA-Mandate
--
-- Gehoeren dem Verein, nicht der Software: Glaeubiger-ID und Mandatsreferenz
-- werden beim Umzug unveraendert uebernommen, damit alle 375 Bestandsmandate
-- gueltig bleiben und niemand neu unterschreiben muss.
-- ---------------------------------------------------------------------------
create table public.sepa_mandates (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references public.members (id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts (id) on delete restrict,

  reference       text not null,
  signed_on       date not null,
  -- Fuer die 36-Monats-Regel: ein Mandat verfaellt, wenn es 36 Monate lang
  -- nicht benutzt wurde. Null = noch nie eingesetzt, Frist laeuft ab signed_on.
  last_used_on    date,
  sequence_type   public.mandate_sequence not null default 'RCUR',
  scope           public.mandate_scope not null default 'fees_only',
  status          public.mandate_status not null default 'active',
  revoked_on      date,

  -- Markiert die 113 aus eBuSy stammenden Mandate mit mehrfach vergebener
  -- Referenz. Blockiert den Import nicht, macht die Altlast aber sichtbar.
  reference_conflict boolean not null default false,

  ebusy_id        bigint unique,
  source          public.record_source not null default 'app',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint sepa_mandates_reference_set  check (length(btrim(reference)) > 0),
  constraint sepa_mandates_used_after_signed
    check (last_used_on is null or last_used_on >= signed_on),
  constraint sepa_mandates_signed_not_future check (signed_on <= current_date)
);

comment on column public.sepa_mandates.scope is
  'fees_only = Mandatstext deckt nur Beitraege. Der monatliche Getraenkeeinzug '
  'braucht dann ein eigenes Mandat.';

-- Die Referenz muss laut SEPA zusammen mit der Glaeubiger-ID eindeutig sein.
-- Fuer selbst angelegte Mandate wird das erzwungen; importierte Altbestaende
-- duerfen die bekannten Dubletten behalten, sonst waere der Import blockiert.
create unique index sepa_mandates_reference_unique_for_app
  on public.sepa_mandates (reference)
  where (source = 'app');

create index sepa_mandates_member_id_idx  on public.sepa_mandates (member_id);
create index sepa_mandates_bank_acc_idx   on public.sepa_mandates (bank_account_id);
create index sepa_mandates_status_idx     on public.sepa_mandates (status);
create index sepa_mandates_conflict_idx   on public.sepa_mandates (reference_conflict)
  where (reference_conflict);

create trigger sepa_mandates_set_updated_at
  before update on public.sepa_mandates
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- Forderungen
--
-- Zentrale Tabelle fuer alles Abrechenbare: Jahresbeitrag, Getraenke-Monats-
-- summe, Schluesselpfand, nicht geleisteter Arbeitsdienst.
-- ---------------------------------------------------------------------------
create table public.charges (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members (id) on delete restrict,
  -- Wer tatsaechlich zahlt. Bei Kindern der Elternteil aus billing_payer_id.
  payer_id     uuid not null references public.members (id) on delete restrict,

  kind         public.charge_kind not null,
  -- Fachlicher Zeitraum, z.B. '2026' fuer den Jahresbeitrag oder '2026-07'
  -- fuer eine Getraenkeabrechnung. Traegt die Idempotenz des Laufs.
  period_label text,
  amount_cents integer not null,
  description  text not null,
  status       public.charge_status not null default 'open',
  due_date     date,
  notified_at  timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint charges_amount_not_negative check (amount_cents >= 0)
);

comment on table public.charges is
  'Offene und abgerechnete Forderungen. payer_id kann von member_id abweichen '
  '(Familienzahler).';

-- Idempotenz-Garantie: ein Beitragslauf oder Monatsabschluss kann versehentlich
-- zweimal gestartet werden, ohne dass doppelte Forderungen entstehen.
create unique index charges_one_per_member_kind_period
  on public.charges (member_id, kind, period_label)
  where (period_label is not null and status <> 'waived');

create index charges_member_id_idx on public.charges (member_id);
create index charges_payer_id_idx  on public.charges (payer_id);
create index charges_status_idx    on public.charges (status);
create index charges_kind_period_idx on public.charges (kind, period_label);

create trigger charges_set_updated_at
  before update on public.charges
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- Lastschriftlaeufe
-- ---------------------------------------------------------------------------
create table public.debit_batches (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  collection_date date not null,
  status          public.debit_batch_status not null default 'draft',
  -- Kopie der Glaeubiger-ID zum Zeitpunkt des Laufs: eine spaetere Aenderung
  -- in den Einstellungen darf vergangene Laeufe nicht umschreiben.
  creditor_id     text,
  pain_version    text,
  total_cents     integer not null default 0,
  item_count      integer not null default 0,
  storage_path    text,
  created_by      uuid references public.members (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint debit_batches_total_not_negative check (total_cents >= 0)
);

create index debit_batches_status_idx on public.debit_batches (status);
create index debit_batches_created_by_idx on public.debit_batches (created_by);

create trigger debit_batches_set_updated_at
  before update on public.debit_batches
  for each row execute function extensions.moddatetime (updated_at);

create table public.debit_items (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.debit_batches (id) on delete cascade,
  charge_id     uuid not null references public.charges (id) on delete restrict,
  mandate_id    uuid not null references public.sepa_mandates (id) on delete restrict,

  amount_cents  integer not null,
  -- Kopien aus dem Mandat: die Lastschriftdatei muss reproduzierbar bleiben,
  -- auch wenn das Mandat spaeter geaendert oder widerrufen wird.
  mandate_reference text not null,
  mandate_signed_on date not null,
  sequence_type public.mandate_sequence not null,

  result        public.debit_item_result not null default 'pending',
  return_reason text,
  returned_on   date,

  created_at    timestamptz not null default now(),

  constraint debit_items_amount_positive check (amount_cents > 0)
);

-- Eine Forderung darf nicht zweimal gleichzeitig eingezogen werden. Nach einer
-- Ruecklastschrift ist eine Wiedervorlage aber ausdruecklich erlaubt.
create unique index debit_items_one_active_per_charge
  on public.debit_items (charge_id)
  where (result in ('pending', 'settled'));

create index debit_items_batch_id_idx   on public.debit_items (batch_id);
create index debit_items_charge_id_idx  on public.debit_items (charge_id);
create index debit_items_mandate_id_idx on public.debit_items (mandate_id);
create index debit_items_result_idx     on public.debit_items (result);
