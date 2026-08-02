-- ===========================================================================
-- Serien-Blockungen mit Verdraengung
--
-- Blockungen setzen sich gegen bestehende Buchungen durch. Damit das niemanden
-- unvorbereitet trifft, laeuft es zweistufig: preview_series zeigt, welche
-- Buchungen wegfallen wuerden und wen es betrifft; erst create_series mit
-- p_displace = true fuehrt es aus - in einer einzigen Transaktion und mit
-- Benachrichtigung an alle Betroffenen.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Benachrichtigungen
-- ---------------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members (id) on delete cascade,
  kind         text not null,
  title        text not null,
  body         text not null,
  read_at      timestamptz,
  mailed_at    timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_member_idx on public.notifications (member_id, created_at desc);
create index notifications_unread_idx on public.notifications (member_id) where (read_at is null);
create index notifications_unmailed_idx on public.notifications (created_at) where (mailed_at is null);

alter table public.notifications enable row level security;

create policy notifications_own on public.notifications
  for select to authenticated
  using (member_id = (select private.current_member_id()));

create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (member_id = (select private.current_member_id()))
  with check (member_id = (select private.current_member_id()));

create policy notifications_board_all on public.notifications
  for all to authenticated
  using ((select private.is_board())) with check ((select private.is_board()));

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Termine einer Serie berechnen
-- ---------------------------------------------------------------------------
create or replace function private.series_occurrences(
  p_weekday    integer,
  p_start_time time,
  p_end_time   time,
  p_valid_from date,
  p_valid_to   date
)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
immutable
as $$
  select
    (d::date + p_start_time) at time zone 'Europe/Berlin',
    (d::date + p_end_time)   at time zone 'Europe/Berlin'
  from generate_series(p_valid_from, p_valid_to, interval '1 day') d
  where extract(dow from d)::integer = p_weekday
  order by 1;
$$;

revoke execute on function private.series_occurrences(integer, time, time, date, date)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Vorschau: was wuerde diese Serie kosten?
--
-- Reine Leseoperation. Veraendert nichts, auch nicht bei Konflikten.
-- ---------------------------------------------------------------------------
create or replace function public.preview_series(
  p_court_id   uuid,
  p_weekday    integer,
  p_start_time time,
  p_end_time   time,
  p_valid_from date,
  p_valid_to   date
)
returns table (
  starts_at            timestamptz,
  ends_at              timestamptz,
  conflict_booking_id  uuid,
  conflict_member_name text,
  conflict_kind        public.booking_kind
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.starts_at,
    o.ends_at,
    b.id,
    nullif(btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')), ''),
    b.kind
  from private.series_occurrences(p_weekday, p_start_time, p_end_time, p_valid_from, p_valid_to) o
  left join public.bookings b
    on b.court_id = p_court_id
   and b.status = 'active'
   and b.slot && tstzrange(o.starts_at, o.ends_at, '[)')
  left join public.members m on m.id = b.member_id
  where private.is_trainer()
  order by o.starts_at;
$$;

comment on function public.preview_series(uuid, integer, time, time, date, date) is
  'Zeigt alle Termine der Serie und die Buchungen, die verdraengt wuerden. '
  'Aendert nichts.';

revoke execute on function public.preview_series(uuid, integer, time, time, date, date)
  from public, anon;
grant execute on function public.preview_series(uuid, integer, time, time, date, date)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Serie anlegen
--
-- Ohne p_displace bricht der Aufruf ab, sobald auch nur ein Termin kollidiert.
-- Der Sportwart muss das Verdraengen also ausdruecklich bestaetigen, nachdem
-- er die Vorschau gesehen hat.
-- ---------------------------------------------------------------------------
create or replace function public.create_series(
  p_court_id          uuid,
  p_booking_type_code text,
  p_weekday           integer,
  p_start_time        time,
  p_end_time          time,
  p_valid_from        date,
  p_valid_to          date,
  p_title             text,
  p_displace          boolean default false
)
returns table (series_id uuid, created_count integer, displaced_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me         uuid := private.current_member_id();
  v_type       public.booking_types%rowtype;
  v_series_id  uuid;
  v_created    integer := 0;
  v_displaced  integer := 0;
  v_conflicts  integer;
  v_occ        record;
  v_conflict   record;
  v_court_name text;
begin
  if not private.is_trainer() then
    raise exception 'Nur Trainer, Sportwart oder Vorstand koennen Serien anlegen.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_type
  from public.booking_types
  where code = p_booking_type_code and active;

  if not found then
    raise exception 'Unbekannte Buchungsart: %', p_booking_type_code
      using errcode = 'invalid_parameter_value';
  end if;

  if v_type.applies_to <> 'blocking' then
    raise exception '"%" ist keine Blockungsart.', v_type.name
      using errcode = 'invalid_parameter_value';
  end if;

  -- Ein reiner Trainer darf nur Trainingszeiten blocken, keine Verbandsspiele
  -- oder Platzsperrungen.
  if not private.is_sports_officer() and v_type.code <> 'training' then
    raise exception 'Als Trainer kannst du nur Trainingszeiten blocken.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'Die Endzeit muss nach der Startzeit liegen.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Wie viele Termine kollidieren?
  select count(*) into v_conflicts
  from private.series_occurrences(p_weekday, p_start_time, p_end_time, p_valid_from, p_valid_to) o
  join public.bookings b
    on b.court_id = p_court_id
   and b.status = 'active'
   and b.slot && tstzrange(o.starts_at, o.ends_at, '[)');

  if v_conflicts > 0 and not p_displace then
    raise exception
      '% Termine kollidieren mit bestehenden Buchungen. Vorschau ansehen und Verdraengen bestaetigen.',
      v_conflicts
      using errcode = 'exclusion_violation';
  end if;

  select name into v_court_name from public.courts where id = p_court_id;

  insert into public.booking_series
    (court_id, booking_type_id, weekday, start_time, end_time, valid_from, valid_to, title, created_by)
  values
    (p_court_id, v_type.id, p_weekday, p_start_time, p_end_time, p_valid_from, p_valid_to, p_title, v_me)
  returning id into v_series_id;

  for v_occ in
    select * from private.series_occurrences(p_weekday, p_start_time, p_end_time, p_valid_from, p_valid_to)
  loop
    -- Kollidierende Buchungen stornieren und die Betroffenen informieren.
    for v_conflict in
      select b.id, b.member_id, b.slot
      from public.bookings b
      where b.court_id = p_court_id
        and b.status = 'active'
        and b.slot && tstzrange(v_occ.starts_at, v_occ.ends_at, '[)')
    loop
      update public.bookings
         set status = 'cancelled',
             cancelled_at = now(),
             cancelled_by = v_me,
             cancellation_reason = 'Verdraengt durch Blockung: ' || p_title
       where id = v_conflict.id;

      v_displaced := v_displaced + 1;

      -- Bucher und alle Mitspieler benachrichtigen.
      insert into public.notifications (member_id, kind, title, body)
      select distinct p.member_id,
             'booking_displaced',
             'Deine Platzbuchung wurde aufgehoben',
             format('Die Buchung am %s auf %s wurde durch "%s" ersetzt.',
                    to_char(lower(v_conflict.slot) at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI'),
                    coalesce(v_court_name, 'dem Platz'),
                    p_title)
      from (
        select v_conflict.member_id as member_id
        union
        select bp.member_id from public.booking_players bp
        where bp.booking_id = v_conflict.id and bp.member_id is not null
      ) p
      where p.member_id is not null;
    end loop;

    insert into public.bookings
      (court_id, slot, kind, booking_type_id, series_id, title, created_by)
    values
      (p_court_id, tstzrange(v_occ.starts_at, v_occ.ends_at, '[)'),
       'blocking', v_type.id, v_series_id, p_title, v_me);

    v_created := v_created + 1;
  end loop;

  return query select v_series_id, v_created, v_displaced;
end;
$$;

revoke execute on function
  public.create_series(uuid, text, integer, time, time, date, date, text, boolean)
  from public, anon;
grant execute on function
  public.create_series(uuid, text, integer, time, time, date, date, text, boolean)
  to authenticated;
