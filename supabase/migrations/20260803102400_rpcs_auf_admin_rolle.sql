-- RPCs auf das zweistufige Rollenmodell umstellen.
-- Alle bisherigen Rollenpruefungen werden zu is_admin().

update public.booking_types set duration_minutes = 60 where applies_to = 'booking';

update public.settings set value = '0'::jsonb,
  description = 'Wie viele kuenftige Buchungen ein Mitglied gleichzeitig haben darf. '
             || 'Mitspieler zaehlen mit. 0 bedeutet unbegrenzt.'
where key = 'booking.max_open_bookings';

create or replace function public.guard_member_self_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if (select private.is_admin()) then return new; end if;
  if new.status is distinct from old.status
     or new.billing_payer_id is distinct from old.billing_payer_id
     or new.auth_user_id    is distinct from old.auth_user_id
     or new.email           is distinct from old.email
     or new.birthday        is distinct from old.birthday
     or new.ebusy_person_id is distinct from old.ebusy_person_id
     or new.source          is distinct from old.source
     or new.notes           is distinct from old.notes
  then
    raise exception 'Dieses Feld kann nur ein Administrator aendern.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end; $$;
revoke execute on function public.guard_member_self_update() from public, anon, authenticated;

create or replace function public.record_drink_purchase_for(
  p_member_id uuid, p_item_id uuid, p_quantity integer default 1
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.current_member_id(); v_source public.purchase_source;
begin
  if private.is_kiosk() then
    v_source := 'kiosk';
    update public.kiosk_devices set last_seen_at = now() where auth_user_id = (select auth.uid());
  elsif private.is_admin() then
    -- Der Thekendienst als eigene Rolle ist entfallen; am Tresen laeuft das
    -- ueber das Kiosk-Geraet, ausserdem koennen Admins nachtragen.
    v_source := 'bar_duty';
  else
    raise exception 'Dafuer brauchst du Administratorrechte oder ein Kiosk-Geraet.'
      using errcode = 'insufficient_privilege';
  end if;
  return private.record_purchase(p_member_id, p_item_id, p_quantity, v_source, v_me);
end; $$;
revoke execute on function public.record_drink_purchase_for(uuid, uuid, integer) from public, anon;
grant  execute on function public.record_drink_purchase_for(uuid, uuid, integer) to authenticated;

create or replace function public.void_drink_purchase(p_purchase_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_purchase public.drink_purchases%rowtype;
  v_window integer := public.setting_int('drinks.void_window_minutes');
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_purchase from public.drink_purchases where id = p_purchase_id;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_purchase.voided_at is not null then return; end if;

  if private.is_admin() then
    null;
  elsif v_purchase.member_id = v_me then
    if v_purchase.created_at < now() - make_interval(mins => v_window) then
      raise exception
        'Eigene Buchungen koennen nur innerhalb von % Minuten zurueckgenommen werden. Bitte beim Vorstand melden.',
        v_window using errcode = 'check_violation';
    end if;
  else
    raise exception 'Du kannst nur eigene Buchungen zurueckgeben.' using errcode = 'insufficient_privilege';
  end if;

  update public.drink_purchases
     set voided_at = now(), voided_by = v_me, void_reason = p_reason
   where id = p_purchase_id;
end; $$;
revoke execute on function public.void_drink_purchase(uuid, text) from public, anon;
grant  execute on function public.void_drink_purchase(uuid, text) to authenticated;

create or replace function public.fee_run_preview(p_year integer)
returns table (member_id uuid, member_name text, payer_name text, fee_types text,
               amount_cents integer, has_mandate boolean,
               mandate_scope public.mandate_scope, already_charged boolean)
language sql stable security definer set search_path = '' as $$
  select m.id,
         btrim(coalesce(m.first_name,'') || ' ' || coalesce(m.last_name,'')),
         btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')),
         string_agg(ft.name, ', ' order by ft.name),
         sum(coalesce(mf.override_amount_cents, fp.amount_cents))::integer,
         exists (select 1 from public.sepa_mandates sm
                  where sm.member_id = coalesce(m.billing_payer_id, m.id) and sm.status = 'active'),
         (select sm.scope from public.sepa_mandates sm
           where sm.member_id = coalesce(m.billing_payer_id, m.id) and sm.status = 'active' limit 1),
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
  where m.status = 'active' and private.is_admin()
  group by m.id, m.first_name, m.last_name, p.first_name, p.last_name, m.billing_payer_id
  order by 2;
$$;
revoke execute on function public.fee_run_preview(integer) from public, anon;
grant  execute on function public.fee_run_preview(integer) to authenticated;

create or replace function public.preview_series(
  p_court_id uuid, p_weekday integer, p_start_time time, p_end_time time,
  p_valid_from date, p_valid_to date
)
returns table (starts_at timestamptz, ends_at timestamptz, conflict_booking_id uuid,
               conflict_member_name text, conflict_kind public.booking_kind)
language sql stable security definer set search_path = '' as $$
  select o.starts_at, o.ends_at, b.id,
         nullif(btrim(coalesce(m.first_name,'') || ' ' || coalesce(m.last_name,'')), ''), b.kind
  from private.series_occurrences(p_weekday, p_start_time, p_end_time, p_valid_from, p_valid_to) o
  left join public.bookings b
    on b.court_id = p_court_id and b.status = 'active'
   and b.slot && tstzrange(o.starts_at, o.ends_at, '[)')
  left join public.members m on m.id = b.member_id
  where private.is_admin()
  order by o.starts_at;
$$;
revoke execute on function public.preview_series(uuid, integer, time, time, date, date) from public, anon;
grant execute on function public.preview_series(uuid, integer, time, time, date, date) to authenticated;
