-- ===========================================================================
-- RLS: Getraenke, Buchungen, Arbeitsdienst, Einstellungen, Kiosk
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Ist der Aufrufer ueberhaupt ein Mitglied?
--
-- Wichtig zur Abgrenzung vom Kiosk-Geraet: das ist zwar angemeldet und traegt
-- die Rolle authenticated, hat aber keinen Mitgliedsdatensatz. Ueberall dort,
-- wo "alle duerfen lesen" gemeint ist, ist "alle Mitglieder" gemeint - nicht
-- das Tablet an der Theke.
-- ---------------------------------------------------------------------------
create or replace function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_member_id() is not null;
$$;

revoke execute on function private.is_member() from public, anon, authenticated;

-- Nachziehen: die drei Policies aus der vorigen Migration standen auf "true"
-- und haetten damit auch dem Kiosk-Geraet Lesezugriff gegeben.
drop policy if exists member_roles_select on public.member_roles;
create policy member_roles_select on public.member_roles
  for select to authenticated using ((select private.is_member()));

drop policy if exists fee_types_select on public.fee_types;
create policy fee_types_select on public.fee_types
  for select to authenticated using ((select private.is_member()));

drop policy if exists fee_prices_select on public.fee_prices;
create policy fee_prices_select on public.fee_prices
  for select to authenticated using ((select private.is_member()));

-- ---------------------------------------------------------------------------
-- Getraenkeliste: fuer Mitglieder lesbar, gepflegt vom Vorstand.
-- ---------------------------------------------------------------------------
alter table public.drink_items  enable row level security;
alter table public.drink_prices enable row level security;

create policy drink_items_select on public.drink_items
  for select to authenticated using ((select private.is_member()) or (select private.is_kiosk()));
create policy drink_items_board_all on public.drink_items
  for all to authenticated
  using ((select private.is_board())) with check ((select private.is_board()));

create policy drink_prices_select on public.drink_prices
  for select to authenticated using ((select private.is_member()) or (select private.is_kiosk()));
create policy drink_prices_board_all on public.drink_prices
  for all to authenticated
  using ((select private.is_board())) with check ((select private.is_board()));

grant select on public.drink_items, public.drink_prices to authenticated;

-- ---------------------------------------------------------------------------
-- Abrechnungsperioden
-- ---------------------------------------------------------------------------
alter table public.billing_periods enable row level security;

create policy billing_periods_select on public.billing_periods
  for select to authenticated using ((select private.is_member()));
create policy billing_periods_treasurer_all on public.billing_periods
  for all to authenticated
  using ((select private.is_treasurer())) with check ((select private.is_treasurer()));

grant select on public.billing_periods to authenticated;

-- ---------------------------------------------------------------------------
-- Getraenkebuchungen
--
-- Lesen: eigene und die der Personen, fuer die man zahlt. Schreiben laeuft
-- ausschliesslich ueber die RPCs weiter unten - es gibt bewusst keine
-- INSERT-Policy, damit niemand am Regelwerk vorbei buchen kann.
-- ---------------------------------------------------------------------------
alter table public.drink_purchases enable row level security;

create policy drink_purchases_select on public.drink_purchases
  for select to authenticated
  using ((select private.can_view_member(member_id)) or (select private.is_treasurer()));

create policy drink_purchases_board_all on public.drink_purchases
  for all to authenticated
  using ((select private.is_board())) with check ((select private.is_board()));

grant select on public.drink_purchases to authenticated;

-- ---------------------------------------------------------------------------
-- Plaetze und Buchungsarten: fuer Mitglieder lesbar, gepflegt vom Sportwart.
-- ---------------------------------------------------------------------------
alter table public.courts        enable row level security;
alter table public.booking_types enable row level security;

create policy courts_select on public.courts
  for select to authenticated using ((select private.is_member()));
create policy courts_sports_all on public.courts
  for all to authenticated
  using ((select private.is_sports_officer())) with check ((select private.is_sports_officer()));

create policy booking_types_select on public.booking_types
  for select to authenticated using ((select private.is_member()));
create policy booking_types_sports_all on public.booking_types
  for all to authenticated
  using ((select private.is_sports_officer())) with check ((select private.is_sports_officer()));

grant select on public.courts, public.booking_types to authenticated;

-- ---------------------------------------------------------------------------
-- Serien: sichtbar fuer alle Mitglieder, angelegt vom Sportwart oder Trainer.
-- ---------------------------------------------------------------------------
alter table public.booking_series enable row level security;

create policy booking_series_select on public.booking_series
  for select to authenticated using ((select private.is_member()));
create policy booking_series_trainer_all on public.booking_series
  for all to authenticated
  using ((select private.is_trainer())) with check ((select private.is_trainer()));

grant select on public.booking_series to authenticated;

-- ---------------------------------------------------------------------------
-- Buchungen
--
-- Der Belegungsplan ist vereinsoeffentlich: jedes Mitglied sieht, wer wann
-- welchen Platz hat. Geschrieben wird nur ueber die RPCs.
-- ---------------------------------------------------------------------------
alter table public.bookings        enable row level security;
alter table public.booking_players enable row level security;

create policy bookings_select on public.bookings
  for select to authenticated using ((select private.is_member()));

create policy bookings_sports_all on public.bookings
  for all to authenticated
  using ((select private.is_sports_officer())) with check ((select private.is_sports_officer()));

create policy booking_players_select on public.booking_players
  for select to authenticated using ((select private.is_member()));

create policy booking_players_sports_all on public.booking_players
  for all to authenticated
  using ((select private.is_sports_officer())) with check ((select private.is_sports_officer()));

grant select on public.bookings, public.booking_players to authenticated;

-- ---------------------------------------------------------------------------
-- Arbeitsdienst
--
-- Das Mitglied sieht seinen Stand, kann ihn aber nicht selbst hochsetzen:
-- Eintraege legt der Vorstand oder Sportwart an und bestaetigt sie.
-- ---------------------------------------------------------------------------
alter table public.work_duty_rules       enable row level security;
alter table public.work_duty_entries     enable row level security;
alter table public.work_duty_settlements enable row level security;

create policy work_duty_rules_select on public.work_duty_rules
  for select to authenticated using ((select private.is_member()));
create policy work_duty_rules_board_all on public.work_duty_rules
  for all to authenticated
  using ((select private.is_board())) with check ((select private.is_board()));

create policy work_duty_entries_select on public.work_duty_entries
  for select to authenticated
  using ((select private.can_view_member(member_id)) or (select private.is_sports_officer()));
create policy work_duty_entries_manage on public.work_duty_entries
  for all to authenticated
  using ((select private.is_sports_officer())) with check ((select private.is_sports_officer()));

create policy work_duty_settlements_select on public.work_duty_settlements
  for select to authenticated
  using ((select private.can_view_member(member_id)) or (select private.is_treasurer()));
create policy work_duty_settlements_manage on public.work_duty_settlements
  for all to authenticated
  using ((select private.is_treasurer())) with check ((select private.is_treasurer()));

grant select on public.work_duty_rules, public.work_duty_entries,
                public.work_duty_settlements to authenticated;
grant insert, update, delete on public.work_duty_entries to authenticated;

-- ---------------------------------------------------------------------------
-- Einstellungen: lesbar fuer Mitglieder (die App braucht die Regeln),
-- aenderbar nur vom Vorstand.
-- ---------------------------------------------------------------------------
alter table public.settings enable row level security;

create policy settings_select on public.settings
  for select to authenticated using ((select private.is_member()) or (select private.is_kiosk()));
create policy settings_board_all on public.settings
  for all to authenticated
  using ((select private.is_board())) with check ((select private.is_board()));

grant select on public.settings to authenticated;
grant update (value, updated_by) on public.settings to authenticated;

-- ---------------------------------------------------------------------------
-- Kiosk-Geraete: verwaltet ausschliesslich der Vorstand. Ein Geraet darf sich
-- selbst sehen (fuer den Namen auf dem Bildschirm), sonst nichts.
-- ---------------------------------------------------------------------------
alter table public.kiosk_devices enable row level security;

create policy kiosk_devices_self on public.kiosk_devices
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

create policy kiosk_devices_board_all on public.kiosk_devices
  for all to authenticated
  using ((select private.is_board())) with check ((select private.is_board()));

grant select on public.kiosk_devices to authenticated;
