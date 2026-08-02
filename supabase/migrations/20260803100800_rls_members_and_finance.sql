-- ===========================================================================
-- RLS: Mitglieder, Beitraege, Bankverbindungen, Forderungen
--
-- Grundsatz: Ein Mitglied sieht seine eigenen Daten und die der Personen, fuer
-- die es bezahlt. Der Vorstand sieht alles. Bankverbindungen und Mandate sind
-- zusaetzlich auf den Kassenwart eingeschraenkt.
--
-- In allen Policies steht auth.uid() in einem Subselect. Ohne das wuerde die
-- Funktion pro Zeile statt einmal pro Abfrage ausgewertet.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- members
-- ---------------------------------------------------------------------------
alter table public.members enable row level security;

create policy members_select on public.members
  for select to authenticated
  using ((select private.can_view_member(id)) or (select private.is_board()));

-- Selbstpflege der Kontaktdaten. Welche Spalten tabu sind, regelt der Trigger
-- weiter unten - RLS kann nicht auf Spaltenebene unterscheiden.
create policy members_update_own on public.members
  for update to authenticated
  using (id = (select private.current_member_id()))
  with check (id = (select private.current_member_id()));

create policy members_board_all on public.members
  for all to authenticated
  using ((select private.is_board()))
  with check ((select private.is_board()));

grant select on public.members to authenticated;
grant update (first_name, last_name, title, phone, mobile, street, postcode, city, country_code)
  on public.members to authenticated;

-- Schutz der Felder, die ein Mitglied nicht selbst setzen darf. Ohne diese
-- Sperre koennte sich jemand einem fremden Zahler zuordnen oder seinen Status
-- auf aktiv setzen.
create or replace function public.guard_member_self_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.is_board()) then
    return new;
  end if;

  if new.status         is distinct from old.status
     or new.billing_payer_id is distinct from old.billing_payer_id
     or new.auth_user_id     is distinct from old.auth_user_id
     or new.email            is distinct from old.email
     or new.birthday         is distinct from old.birthday
     or new.ebusy_person_id  is distinct from old.ebusy_person_id
     or new.source           is distinct from old.source
     or new.notes            is distinct from old.notes
  then
    raise exception 'Dieses Feld kann nur der Vorstand aendern.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger members_guard_self_update
  before update on public.members
  for each row execute function public.guard_member_self_update();

-- ---------------------------------------------------------------------------
-- Mitgliederverzeichnis
--
-- Fuer die Mitspielerauswahl und den Belegungsplan werden die Namen aller
-- aktiven Mitglieder gebraucht - aber nichts weiter. Diese View gibt genau
-- drei Spalten heraus und umgeht bewusst die RLS von members; deshalb enthaelt
-- sie ausschliesslich Daten, die im Verein ohnehin bekannt sind.
-- ---------------------------------------------------------------------------
create view public.member_directory as
  select m.id, m.first_name, m.last_name
  from public.members m
  where m.status = 'active';

comment on view public.member_directory is
  'Nur Id und Name aktiver Mitglieder. Bewusst ohne security_invoker, damit die '
  'Mitspielerauswahl funktioniert, ohne members fuer alle zu oeffnen.';

grant select on public.member_directory to authenticated;

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------
alter table public.memberships enable row level security;

create policy memberships_select on public.memberships
  for select to authenticated
  using ((select private.can_view_member(member_id)) or (select private.is_board()));

create policy memberships_board_all on public.memberships
  for all to authenticated
  using ((select private.is_board()))
  with check ((select private.is_board()));

grant select on public.memberships to authenticated;

-- ---------------------------------------------------------------------------
-- member_roles
--
-- Jeder darf sehen, wer welche Funktion im Verein hat - das steht ohnehin auf
-- der Vereinsseite. Vergeben darf Rollen nur der Vorstand.
-- ---------------------------------------------------------------------------
alter table public.member_roles enable row level security;

create policy member_roles_select on public.member_roles
  for select to authenticated
  using (true);

create policy member_roles_board_all on public.member_roles
  for all to authenticated
  using ((select private.is_board()))
  with check ((select private.is_board()));

grant select on public.member_roles to authenticated;

-- ---------------------------------------------------------------------------
-- Beitragsarten und Preise: fuer alle lesbar, denn jedes Mitglied soll
-- nachvollziehen koennen, wie sein Beitrag zustande kommt.
-- ---------------------------------------------------------------------------
alter table public.fee_types  enable row level security;
alter table public.fee_prices enable row level security;

create policy fee_types_select on public.fee_types
  for select to authenticated using (true);
create policy fee_types_treasurer_all on public.fee_types
  for all to authenticated
  using ((select private.is_treasurer())) with check ((select private.is_treasurer()));

create policy fee_prices_select on public.fee_prices
  for select to authenticated using (true);
create policy fee_prices_treasurer_all on public.fee_prices
  for all to authenticated
  using ((select private.is_treasurer())) with check ((select private.is_treasurer()));

grant select on public.fee_types, public.fee_prices to authenticated;

-- ---------------------------------------------------------------------------
-- member_fees: welche Beitragsart jemand hat, ist seine Sache.
-- ---------------------------------------------------------------------------
alter table public.member_fees enable row level security;

create policy member_fees_select on public.member_fees
  for select to authenticated
  using ((select private.can_view_member(member_id)) or (select private.is_treasurer()));

create policy member_fees_treasurer_all on public.member_fees
  for all to authenticated
  using ((select private.is_treasurer())) with check ((select private.is_treasurer()));

grant select on public.member_fees to authenticated;

-- ---------------------------------------------------------------------------
-- bank_accounts
--
-- Das sensibelste Datum im System. Zwei Schutzschichten:
--   1. RLS: nur eigene Konten oder Kassenwart.
--   2. Spalten-Grant: iban_encrypted wird ueberhaupt nicht herausgegeben.
--      Selbst der Kassenwart bekommt ueber die Tabelle nur die letzten vier
--      Stellen; der Klartext existiert nur innerhalb von private.decrypt_iban,
--      das niemand aufrufen darf.
-- ---------------------------------------------------------------------------
alter table public.bank_accounts enable row level security;

create policy bank_accounts_select on public.bank_accounts
  for select to authenticated
  using ((select private.can_view_member(member_id)) or (select private.is_treasurer()));

create policy bank_accounts_treasurer_all on public.bank_accounts
  for all to authenticated
  using ((select private.is_treasurer())) with check ((select private.is_treasurer()));

grant select (id, member_id, iban_last4, holder, bank_name, active, created_at, updated_at)
  on public.bank_accounts to authenticated;

-- ---------------------------------------------------------------------------
-- sepa_mandates
-- ---------------------------------------------------------------------------
alter table public.sepa_mandates enable row level security;

create policy sepa_mandates_select on public.sepa_mandates
  for select to authenticated
  using ((select private.can_view_member(member_id)) or (select private.is_treasurer()));

create policy sepa_mandates_treasurer_all on public.sepa_mandates
  for all to authenticated
  using ((select private.is_treasurer())) with check ((select private.is_treasurer()));

grant select on public.sepa_mandates to authenticated;

-- ---------------------------------------------------------------------------
-- charges: jeder sieht seine Forderungen und die, die er bezahlt.
-- ---------------------------------------------------------------------------
alter table public.charges enable row level security;

create policy charges_select on public.charges
  for select to authenticated
  using (
    (select private.can_view_member(member_id))
    or payer_id = (select private.current_member_id())
    or (select private.is_treasurer())
  );

create policy charges_treasurer_all on public.charges
  for all to authenticated
  using ((select private.is_treasurer())) with check ((select private.is_treasurer()));

grant select on public.charges to authenticated;

-- ---------------------------------------------------------------------------
-- Lastschriftlaeufe: ausschliesslich Kassenwart und Vorstand.
-- ---------------------------------------------------------------------------
alter table public.debit_batches enable row level security;
alter table public.debit_items   enable row level security;

create policy debit_batches_treasurer on public.debit_batches
  for all to authenticated
  using ((select private.is_treasurer())) with check ((select private.is_treasurer()));

create policy debit_items_treasurer on public.debit_items
  for all to authenticated
  using ((select private.is_treasurer())) with check ((select private.is_treasurer()));

grant select, insert, update on public.debit_batches to authenticated;
grant select, insert, update on public.debit_items   to authenticated;
