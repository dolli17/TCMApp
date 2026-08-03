-- ===========================================================================
-- Rollenmodell auf zwei Stufen: Admin und Mitglied
--
-- Die Zwischenrollen (Kassenwart, Sportwart, Trainer, Thekendienst) waren in
-- der Praxis schwer zu pflegen. Kuenftig gibt es Admins, die alles duerfen,
-- und Mitglieder, die ihre eigenen Daten sehen.
--
-- Postgres kennt kein ALTER TYPE ... DROP VALUE, deshalb ein Typwechsel. Der
-- zieht 35 Policies und alle Rollen-Helfer nach sich - die werden hier
-- geloest und danach gegen is_admin() neu aufgebaut.
-- ===========================================================================

-- --- 1. Daten vorbereiten -------------------------------------------------
insert into public.member_roles (member_id, role)
select m.id, 'member'::public.app_role from public.members m
on conflict do nothing;

-- Traeger behalten 'member' aus dem Schritt davor; wer 'board' hatte, wird Admin.
delete from public.member_roles
where role in ('treasurer', 'sports_officer', 'trainer', 'bar_duty');

-- --- 2. Abhaengige Policies loesen ----------------------------------------
drop policy if exists bank_accounts_select on public.bank_accounts;
drop policy if exists bank_accounts_treasurer_all on public.bank_accounts;
drop policy if exists billing_periods_treasurer_all on public.billing_periods;
drop policy if exists booking_players_sports_all on public.booking_players;
drop policy if exists booking_series_trainer_all on public.booking_series;
drop policy if exists booking_types_sports_all on public.booking_types;
drop policy if exists bookings_sports_all on public.bookings;
drop policy if exists charges_select on public.charges;
drop policy if exists charges_treasurer_all on public.charges;
drop policy if exists courts_sports_all on public.courts;
drop policy if exists debit_batches_treasurer on public.debit_batches;
drop policy if exists debit_items_treasurer on public.debit_items;
drop policy if exists drink_items_board_all on public.drink_items;
drop policy if exists drink_prices_board_all on public.drink_prices;
drop policy if exists drink_purchases_board_all on public.drink_purchases;
drop policy if exists drink_purchases_select on public.drink_purchases;
drop policy if exists fee_prices_treasurer_all on public.fee_prices;
drop policy if exists fee_types_treasurer_all on public.fee_types;
drop policy if exists kiosk_devices_board_all on public.kiosk_devices;
drop policy if exists member_fees_select on public.member_fees;
drop policy if exists member_fees_treasurer_all on public.member_fees;
drop policy if exists member_roles_board_all on public.member_roles;
drop policy if exists members_board_all on public.members;
drop policy if exists members_select on public.members;
drop policy if exists memberships_board_all on public.memberships;
drop policy if exists memberships_select on public.memberships;
drop policy if exists notifications_board_all on public.notifications;
drop policy if exists sepa_mandates_select on public.sepa_mandates;
drop policy if exists sepa_mandates_treasurer_all on public.sepa_mandates;
drop policy if exists settings_board_all on public.settings;
drop policy if exists work_duty_entries_manage on public.work_duty_entries;
drop policy if exists work_duty_entries_select on public.work_duty_entries;
drop policy if exists work_duty_rules_board_all on public.work_duty_rules;
drop policy if exists work_duty_settlements_manage on public.work_duty_settlements;
drop policy if exists work_duty_settlements_select on public.work_duty_settlements;

-- --- 3. Alte Rollen-Helfer loesen -----------------------------------------
drop function if exists private.is_board();
drop function if exists private.is_treasurer();
drop function if exists private.is_sports_officer();
drop function if exists private.is_trainer();
drop function if exists private.is_bar_duty();
drop function if exists private.has_role(public.app_role);
drop function if exists private.has_any_role(public.app_role[]);
drop function if exists tests.fixture_user(public.app_role, text);

-- --- 4. Typwechsel --------------------------------------------------------
create type public.app_role_neu as enum ('member', 'admin');

alter table public.member_roles
  alter column role type public.app_role_neu
  using (case when role = 'board' then 'admin' else 'member' end)::public.app_role_neu;

alter table public.booking_types
  alter column allowed_roles type public.app_role_neu[]
  using (
    case when allowed_roles is null then null
         -- Jede bisherige Beschraenkung wird zur Admin-Beschraenkung:
         -- Training, Verbandsspiel und Platzpflege legt der Vorstand an.
         else array['admin']::public.app_role_neu[] end
  );

drop type public.app_role;
alter type public.app_role_neu rename to app_role;

-- --- 5. Neue Helfer -------------------------------------------------------
create or replace function private.has_role(p_role public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_roles mr
    join public.members m on m.id = mr.member_id
    where m.auth_user_id = (select auth.uid()) and mr.role = p_role
  );
$$;

/** Admins duerfen alles sehen und alles aendern. */
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_role('admin'::public.app_role);
$$;

grant execute on function private.has_role(public.app_role) to authenticated;
grant execute on function private.is_admin() to authenticated;

-- --- 6. Policies neu ------------------------------------------------------
create policy members_select on public.members for select to authenticated
  using ((select private.can_view_member(id)) or (select private.is_admin()));
create policy members_admin_all on public.members for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy memberships_select on public.memberships for select to authenticated
  using ((select private.can_view_member(member_id)) or (select private.is_admin()));
create policy memberships_admin_all on public.memberships for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy member_roles_admin_all on public.member_roles for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy fee_types_admin_all on public.fee_types for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy fee_prices_admin_all on public.fee_prices for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy member_fees_select on public.member_fees for select to authenticated
  using ((select private.can_view_member(member_id)) or (select private.is_admin()));
create policy member_fees_admin_all on public.member_fees for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy bank_accounts_select on public.bank_accounts for select to authenticated
  using ((select private.can_view_member(member_id)) or (select private.is_admin()));
create policy bank_accounts_admin_all on public.bank_accounts for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy sepa_mandates_select on public.sepa_mandates for select to authenticated
  using ((select private.can_view_member(member_id)) or (select private.is_admin()));
create policy sepa_mandates_admin_all on public.sepa_mandates for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy charges_select on public.charges for select to authenticated
  using ((select private.can_view_member(member_id))
      or payer_id = (select private.current_member_id())
      or (select private.is_admin()));
create policy charges_admin_all on public.charges for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy debit_batches_admin on public.debit_batches for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy debit_items_admin on public.debit_items for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy billing_periods_admin_all on public.billing_periods for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy drink_items_admin_all on public.drink_items for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy drink_prices_admin_all on public.drink_prices for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy drink_purchases_select on public.drink_purchases for select to authenticated
  using ((select private.can_view_member(member_id)) or (select private.is_admin()));
create policy drink_purchases_admin_all on public.drink_purchases for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy courts_admin_all on public.courts for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy booking_types_admin_all on public.booking_types for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy booking_series_admin_all on public.booking_series for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy bookings_admin_all on public.bookings for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy booking_players_admin_all on public.booking_players for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy work_duty_rules_admin_all on public.work_duty_rules for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy work_duty_entries_select on public.work_duty_entries for select to authenticated
  using ((select private.can_view_member(member_id)) or (select private.is_admin()));
create policy work_duty_entries_manage on public.work_duty_entries for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy work_duty_settlements_select on public.work_duty_settlements for select to authenticated
  using ((select private.can_view_member(member_id)) or (select private.is_admin()));
create policy work_duty_settlements_manage on public.work_duty_settlements for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy settings_admin_all on public.settings for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy kiosk_devices_admin_all on public.kiosk_devices for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy notifications_admin_all on public.notifications for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
