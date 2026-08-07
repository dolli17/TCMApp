-- Zwei Korrekturen am Bestand.
--
-- 1. day_schedule liefert die Id des Buchers mit. Die Oberflaeche hat den
--    Eigentuemer bisher ueber den angezeigten Namen erkannt - bei zwei
--    Mitgliedern gleichen Namens ist das schlicht falsch, und "Bauer" gibt es
--    im Bestand mehrfach.
--
-- 2. update_booking_players prueft min_players. Bisher liess sich ein Doppel
--    nachtraeglich auf zwei Spieler zusammenstreichen: create_booking hat die
--    Untergrenze geprueft, der Tausch danach nur noch die Obergrenze.

drop function if exists public.day_schedule(date);

create function public.day_schedule(p_date date)
returns table (
  booking_id uuid, court_id uuid, starts_at timestamptz, ends_at timestamptz,
  kind public.booking_kind, type_code text, type_name text, title text,
  owner_name text, owner_member_id uuid, is_own boolean, players text[],
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
    b.member_id,
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


create or replace function public.update_booking_players(
  p_booking_id uuid, p_member_ids uuid[] default '{}', p_guest_names text[] default '{}'
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_type public.booking_types%rowtype;
  v_max_open integer := public.setting_int('booking.max_open_bookings');
  v_players integer; v_player uuid; v_guest text; v_blocker text;
  v_ist_admin boolean := private.is_admin();
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.status <> 'active' then
    raise exception 'Diese Buchung ist storniert.' using errcode = 'check_violation';
  end if;
  if v_booking.member_id is distinct from v_me and not v_ist_admin then
    raise exception 'Du kannst nur deine eigenen Buchungen aendern.'
      using errcode = 'insufficient_privilege';
  end if;
  if lower(v_booking.slot) <= now() and not v_ist_admin then
    raise exception 'Die Spielzeit hat bereits begonnen.' using errcode = 'check_violation';
  end if;

  select * into v_type from public.booking_types where id = v_booking.booking_type_id;

  v_players := 1 + coalesce(array_length(p_member_ids, 1), 0)
                 + coalesce(array_length(p_guest_names, 1), 0);
  if v_type.requires_partner and v_players < 2 then
    raise exception 'Fuer "%" musst du mindestens einen Mitspieler angeben.', v_type.name
      using errcode = 'invalid_parameter_value';
  end if;
  -- Dieselbe Untergrenze wie beim Anlegen. Ohne sie waere die Regel nur eine
  -- Huerde beim ersten Speichern und danach beliebig zu umgehen.
  if v_players < v_type.min_players then
    raise exception '"%" braucht mindestens % Spieler.', v_type.name, v_type.min_players
      using errcode = 'invalid_parameter_value';
  end if;
  if v_players > v_type.max_players then
    raise exception '"%" erlaubt hoechstens % Spieler.', v_type.name, v_type.max_players
      using errcode = 'invalid_parameter_value';
  end if;
  if v_booking.member_id = any (p_member_ids) then
    raise exception 'Der Bucher ist schon dabei und muss nicht als Mitspieler eingetragen werden.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Kontingent nur fuer neu hinzukommende Mitspieler pruefen: wer schon
  -- eingetragen war, zaehlt diese Buchung bereits mit.
  if v_max_open > 0 and v_type.counts_towards_quota then
    foreach v_player in array coalesce(p_member_ids, '{}') loop
      if not exists (select 1 from public.booking_players bp
                      where bp.booking_id = p_booking_id and bp.member_id = v_player)
         and private.open_booking_count(v_player) >= v_max_open then
        select m.first_name || ' ' || m.last_name into v_blocker
        from public.members m where m.id = v_player;
        raise exception '% hat bereits % offene Buchungen und kann nicht mitspielen.',
          coalesce(v_blocker, 'Ein Mitspieler'), v_max_open using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  delete from public.booking_players where booking_id = p_booking_id;

  foreach v_player in array coalesce(p_member_ids, '{}') loop
    insert into public.booking_players (booking_id, member_id) values (p_booking_id, v_player);
  end loop;
  foreach v_guest in array coalesce(p_guest_names, '{}') loop
    if length(btrim(v_guest)) = 0 then
      raise exception 'Gastname darf nicht leer sein.' using errcode = 'invalid_parameter_value';
    end if;
    insert into public.booking_players (booking_id, guest_name) values (p_booking_id, btrim(v_guest));
  end loop;
end; $$;
revoke execute on function public.update_booking_players(uuid, uuid[], text[]) from public, anon;
grant  execute on function public.update_booking_players(uuid, uuid[], text[]) to authenticated;
