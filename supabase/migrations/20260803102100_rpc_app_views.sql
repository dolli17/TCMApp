-- Getraenkekarte mit dem aktuell gueltigen Preis
create or replace function public.drink_menu()
returns table (id uuid, name text, description text, category public.drink_category,
               price_cents integer, sort_order integer)
language sql stable security definer set search_path = '' as $$
  select di.id, di.name, di.description, di.category,
         private.current_drink_price(di.id), di.sort_order
  from public.drink_items di
  where di.active
    and (private.is_member() or private.is_kiosk())
    and private.current_drink_price(di.id) is not null
  order by di.sort_order, di.name;
$$;
revoke execute on function public.drink_menu() from public, anon;
grant  execute on function public.drink_menu() to authenticated;

-- Eigene Getraenkebuchungen des laufenden Monats
create or replace function public.my_drink_purchases()
returns table (id uuid, item_name text, quantity integer, unit_price_cents integer,
               total_cents integer, source public.purchase_source,
               created_at timestamptz, voided_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select dp.id, di.name, dp.quantity, dp.unit_price_cents, dp.total_cents,
         dp.source, dp.created_at, dp.voided_at
  from public.drink_purchases dp
  join public.drink_items di on di.id = dp.drink_item_id
  join public.billing_periods bp on bp.id = dp.billing_period_id
  where dp.member_id = private.current_member_id()
    and bp.status = 'open'
  order by dp.created_at desc;
$$;
revoke execute on function public.my_drink_purchases() from public, anon;
grant  execute on function public.my_drink_purchases() to authenticated;

-- Eigene Forderungen, einschliesslich derer, die man fuer andere bezahlt
create or replace function public.my_charges()
returns table (id uuid, member_name text, kind public.charge_kind, period_label text,
               amount_cents integer, description text, status public.charge_status,
               due_date date, is_for_other boolean)
language sql stable security definer set search_path = '' as $$
  select c.id,
         btrim(coalesce(m.first_name,'') || ' ' || coalesce(m.last_name,'')),
         c.kind, c.period_label, c.amount_cents, c.description, c.status, c.due_date,
         c.member_id <> private.current_member_id()
  from public.charges c
  join public.members m on m.id = c.member_id
  where c.payer_id = private.current_member_id()
     or c.member_id = private.current_member_id()
  order by c.created_at desc;
$$;
revoke execute on function public.my_charges() from public, anon;
grant  execute on function public.my_charges() to authenticated;

-- Eigener Arbeitsdienst-Stand
create or replace function public.my_work_duty(p_year integer default null)
returns table (year integer, required_hours numeric, completed_hours numeric,
               missing_hours numeric)
language sql stable security definer set search_path = '' as $$
  with jahr as (
    select coalesce(p_year, extract(year from (now() at time zone 'Europe/Berlin'))::integer) as y
  ), soll as (
    select coalesce(max(wr.required_hours), 0) as h
    from public.member_fees mf
    join public.work_duty_rules wr
      on wr.fee_type_id = mf.fee_type_id and wr.year = mf.year
    where mf.member_id = private.current_member_id()
      and mf.year = (select y from jahr)
  ), ist as (
    select coalesce(sum(we.hours), 0) as h
    from public.work_duty_entries we
    where we.member_id = private.current_member_id()
      and we.year = (select y from jahr)
      and we.confirmed_at is not null
  )
  select (select y from jahr), (select h from soll), (select h from ist),
         greatest((select h from soll) - (select h from ist), 0)
  where private.is_member();
$$;
revoke execute on function public.my_work_duty(integer) from public, anon;
grant  execute on function public.my_work_duty(integer) to authenticated;

-- Vorschau des Jahresbeitragslaufs: was wuerde berechnet, wer hat kein Mandat
create or replace function public.fee_run_preview(p_year integer)
returns table (member_id uuid, member_name text, payer_name text,
               fee_types text, amount_cents integer,
               has_mandate boolean, mandate_scope public.mandate_scope,
               already_charged boolean)
language sql stable security definer set search_path = '' as $$
  select
    m.id,
    btrim(coalesce(m.first_name,'') || ' ' || coalesce(m.last_name,'')),
    btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')),
    string_agg(ft.name, ', ' order by ft.name),
    sum(coalesce(mf.override_amount_cents, fp.amount_cents))::integer,
    exists (select 1 from public.sepa_mandates sm
             where sm.member_id = coalesce(m.billing_payer_id, m.id)
               and sm.status = 'active'),
    (select sm.scope from public.sepa_mandates sm
      where sm.member_id = coalesce(m.billing_payer_id, m.id)
        and sm.status = 'active' limit 1),
    exists (select 1 from public.charges c
             where c.member_id = m.id and c.kind = 'fee'
               and c.period_label = p_year::text and c.status <> 'waived')
  from public.members m
  join public.member_fees mf on mf.member_id = m.id and mf.year = p_year
  join public.fee_types ft on ft.id = mf.fee_type_id
  left join public.members p on p.id = m.billing_payer_id
  left join lateral (
    select fpx.amount_cents from public.fee_prices fpx
    where fpx.fee_type_id = mf.fee_type_id and fpx.valid_from_year <= p_year
    order by fpx.valid_from_year desc limit 1
  ) fp on true
  where m.status = 'active' and private.is_treasurer()
  group by m.id, m.first_name, m.last_name, p.first_name, p.last_name, m.billing_payer_id
  order by 2;
$$;
revoke execute on function public.fee_run_preview(integer) from public, anon;
grant  execute on function public.fee_run_preview(integer) to authenticated;
