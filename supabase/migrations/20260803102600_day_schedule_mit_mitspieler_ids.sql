-- Der Plan braucht zum Verwalten die Mitspieler getrennt nach Mitglied und
-- Gast: die Anzeige zeigt Namen, das Bearbeitungsfenster muss aber dieselben
-- Werte zurueckschicken koennen, die create_booking erwartet.
drop function if exists public.day_schedule(date);

create function public.day_schedule(p_date date)
returns table (
  booking_id uuid, court_id uuid, starts_at timestamptz, ends_at timestamptz,
  kind public.booking_kind, type_code text, type_name text, title text,
  owner_name text, is_own boolean, players text[],
  player_member_ids uuid[], guest_names text[]
)
language sql stable security definer set search_path = '' as $$
  select
    b.id,
    b.court_id,
    lower(b.slot),
    upper(b.slot),
    b.kind,
    bt.code,
    bt.name,
    b.title,
    nullif(btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')), ''),
    b.member_id = private.current_member_id(),
    coalesce(
      array_agg(
        coalesce(
          nullif(btrim(coalesce(pm.first_name, '') || ' ' || coalesce(pm.last_name, '')), ''),
          bp.guest_name
        )
        order by pm.last_name nulls last, bp.guest_name
      ) filter (where bp.id is not null),
      '{}'::text[]
    ),
    coalesce(
      array_agg(bp.member_id order by pm.last_name nulls last)
        filter (where bp.member_id is not null),
      '{}'::uuid[]
    ),
    coalesce(
      array_agg(bp.guest_name order by bp.guest_name)
        filter (where bp.guest_name is not null),
      '{}'::text[]
    )
  from public.bookings b
  join public.booking_types bt on bt.id = b.booking_type_id
  left join public.members m on m.id = b.member_id
  left join public.booking_players bp on bp.booking_id = b.id
  left join public.members pm on pm.id = bp.member_id
  where b.status = 'active'
    and private.is_member()
    and b.slot && tstzrange(
          (p_date::timestamp) at time zone 'Europe/Berlin',
          ((p_date + 1)::timestamp) at time zone 'Europe/Berlin', '[)')
  group by b.id, b.court_id, b.slot, b.kind, bt.code, bt.name, b.title,
           m.first_name, m.last_name, b.member_id
  order by lower(b.slot);
$$;

revoke execute on function public.day_schedule(date) from public, anon;
grant  execute on function public.day_schedule(date) to authenticated;
