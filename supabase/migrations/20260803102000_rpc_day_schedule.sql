-- Belegungsplan eines Tages, fertig aufbereitet.
-- Liefert Start und Ende getrennt, damit der Client keinen tstzrange parsen
-- muss, und blendet Namen nur so weit ein, wie sie im Verein ohnehin bekannt
-- sind: wer den Platz hat. Keine Kontaktdaten, keine Beitragsdaten.
create or replace function public.day_schedule(p_date date)
returns table (
  booking_id   uuid,
  court_id     uuid,
  starts_at    timestamptz,
  ends_at      timestamptz,
  kind         public.booking_kind,
  type_code    text,
  type_name    text,
  title        text,
  owner_name   text,
  is_own       boolean,
  players      text[]
)
language sql
stable
security definer
set search_path = ''
as $$
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

-- Regelwerte gebuendelt, damit die Oberflaeche nicht fuenf Einzelabfragen
-- machen muss.
create or replace function public.booking_settings()
returns table (
  max_open_bookings integer,
  lead_days         integer,
  opening_time      time,
  closing_time      time,
  slot_minutes      integer,
  guest_fee_cents   integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.setting_int('booking.max_open_bookings'),
    public.setting_int('booking.lead_days'),
    public.setting_time('booking.opening_time'),
    public.setting_time('booking.closing_time'),
    public.setting_int('booking.slot_minutes'),
    public.setting_int('booking.guest_fee_cents')
  where private.is_member() or private.is_kiosk();
$$;

revoke execute on function public.booking_settings() from public, anon;
grant  execute on function public.booking_settings() to authenticated;
