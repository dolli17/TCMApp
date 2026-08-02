-- ===========================================================================
-- Getraenke-RPCs
--
-- Auch hier gibt es keine INSERT-Policy: der Preis muss beim Buchen aus der
-- gueltigen Preisliste eingefroren werden, und das darf kein Client selbst
-- bestimmen. Sonst koennte man sich sein Bier zum Preis von null buchen.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Aktuell gueltiger Preis
-- ---------------------------------------------------------------------------
create or replace function private.current_drink_price(p_item_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select dp.price_cents
  from public.drink_prices dp
  where dp.drink_item_id = p_item_id
    and dp.valid_from <= current_date
  order by dp.valid_from desc
  limit 1;
$$;

revoke execute on function private.current_drink_price(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gemeinsame Buchungslogik
-- ---------------------------------------------------------------------------
create or replace function private.record_purchase(
  p_member_id   uuid,
  p_item_id     uuid,
  p_quantity    integer,
  p_source      public.purchase_source,
  p_recorded_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_price integer;
  v_id    uuid;
  v_item  public.drink_items%rowtype;
begin
  if p_quantity < 1 or p_quantity > 50 then
    raise exception 'Menge muss zwischen 1 und 50 liegen.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_item from public.drink_items where id = p_item_id;
  if not found then
    raise exception 'Unbekannter Artikel.' using errcode = 'no_data_found';
  end if;

  if not v_item.active then
    raise exception '"%" wird nicht mehr gefuehrt.', v_item.name
      using errcode = 'invalid_parameter_value';
  end if;

  if not exists (select 1 from public.members
                 where id = p_member_id and status = 'active') then
    raise exception 'Kein aktives Mitglied.' using errcode = 'no_data_found';
  end if;

  v_price := private.current_drink_price(p_item_id);
  if v_price is null then
    raise exception 'Fuer "%" ist kein Preis hinterlegt.', v_item.name
      using errcode = 'no_data_found';
  end if;

  insert into public.drink_purchases
    (member_id, drink_item_id, quantity, unit_price_cents, source, recorded_by)
  values
    (p_member_id, p_item_id, p_quantity, v_price, p_source, p_recorded_by)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function
  private.record_purchase(uuid, uuid, integer, public.purchase_source, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Selbstbuchung in der App
-- ---------------------------------------------------------------------------
create or replace function public.record_drink_purchase(
  p_item_id  uuid,
  p_quantity integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_member_id();
begin
  if v_me is null then
    raise exception 'Nur Mitglieder koennen Getraenke buchen.'
      using errcode = 'insufficient_privilege';
  end if;
  return private.record_purchase(v_me, p_item_id, p_quantity, 'app', v_me);
end;
$$;

revoke execute on function public.record_drink_purchase(uuid, integer) from public, anon;
grant  execute on function public.record_drink_purchase(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Buchung fuer jemand anderen: Kiosk-Tablet oder Thekendienst
--
-- Das Kiosk-Geraet darf hierueber buchen, ohne irgendeine Leseberechtigung auf
-- members zu haben. Es kennt nur Id und Name aus member_directory.
-- ---------------------------------------------------------------------------
create or replace function public.record_drink_purchase_for(
  p_member_id uuid,
  p_item_id   uuid,
  p_quantity  integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := private.current_member_id();
  v_source public.purchase_source;
begin
  if private.is_kiosk() then
    v_source := 'kiosk';

    update public.kiosk_devices
       set last_seen_at = now()
     where auth_user_id = (select auth.uid());

  elsif private.is_bar_duty() then
    v_source := 'bar_duty';
  else
    raise exception 'Dafuer brauchst du Thekendienst-Rechte oder ein Kiosk-Geraet.'
      using errcode = 'insufficient_privilege';
  end if;

  return private.record_purchase(p_member_id, p_item_id, p_quantity, v_source, v_me);
end;
$$;

revoke execute on function public.record_drink_purchase_for(uuid, uuid, integer) from public, anon;
grant  execute on function public.record_drink_purchase_for(uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Fehlbuchung zuruecknehmen
--
-- Das Mitglied selbst nur innerhalb des Zeitfensters aus den Einstellungen,
-- der Vorstand jederzeit - solange die Periode noch offen ist. Danach greift
-- ohnehin der Trigger auf drink_purchases.
-- ---------------------------------------------------------------------------
create or replace function public.void_drink_purchase(
  p_purchase_id uuid,
  p_reason      text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me       uuid := private.current_member_id();
  v_purchase public.drink_purchases%rowtype;
  v_window   integer := public.setting_int('drinks.void_window_minutes');
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_purchase from public.drink_purchases where id = p_purchase_id;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if v_purchase.voided_at is not null then
    return;
  end if;

  if private.is_board() then
    null;
  elsif v_purchase.member_id = v_me then
    if v_purchase.created_at < now() - make_interval(mins => v_window) then
      raise exception
        'Eigene Buchungen koennen nur innerhalb von % Minuten zurueckgenommen werden. Bitte beim Vorstand melden.',
        v_window using errcode = 'check_violation';
    end if;
  else
    raise exception 'Du kannst nur eigene Buchungen zurueckgeben.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.drink_purchases
     set voided_at = now(), voided_by = v_me, void_reason = p_reason
   where id = p_purchase_id;
end;
$$;

revoke execute on function public.void_drink_purchase(uuid, text) from public, anon;
grant  execute on function public.void_drink_purchase(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Eigene Monatsuebersicht
-- ---------------------------------------------------------------------------
create or replace function public.my_drink_summary(
  p_year  integer default null,
  p_month integer default null
)
returns table (
  item_name    text,
  quantity     bigint,
  total_cents  bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    di.name,
    sum(dp.quantity)::bigint,
    sum(dp.total_cents)::bigint
  from public.drink_purchases dp
  join public.drink_items di on di.id = dp.drink_item_id
  join public.billing_periods bp on bp.id = dp.billing_period_id
  where dp.member_id = private.current_member_id()
    and dp.voided_at is null
    and bp.year  = coalesce(p_year,
          extract(year  from (now() at time zone 'Europe/Berlin'))::integer)
    and bp.month = coalesce(p_month,
          extract(month from (now() at time zone 'Europe/Berlin'))::integer)
  group by di.name
  order by di.name;
$$;

revoke execute on function public.my_drink_summary(integer, integer) from public, anon;
grant  execute on function public.my_drink_summary(integer, integer) to authenticated;
