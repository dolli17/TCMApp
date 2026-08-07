-- ===========================================================================
-- Serien aendern, und day_schedule verraet die Serie
--
-- Bisher liessen sich Serien anlegen und beenden, aber nicht aendern.
-- Verschiebt sich das Dienstagstraining von 18:30 auf 18:00, musste der
-- Vorstand die Serie beenden und eine neue anlegen - danach stehen zwei
-- Eintraege in der Liste, und niemand sieht mehr, dass es dasselbe Training
-- ist.
--
-- Dazu liefert day_schedule ab jetzt die series_id mit. Ohne sie kann die
-- Oberflaeche einen Serientermin nicht von einer einmaligen Sperrung
-- unterscheiden - und genau diese Unterscheidung entscheidet, ob "Faellt diese
-- Woche aus" angeboten wird oder nur "Aufheben".
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Serie aendern
-- ---------------------------------------------------------------------------

/**
 * Uhrzeit, Titel oder Enddatum einer bestehenden Serie aendern.
 *
 * Platz und Wochentag bleiben fest. Wer die aendert, meint keine Aenderung
 * mehr, sondern eine andere Serie - und die legt er besser neu an, statt die
 * Historie der alten mitzuschleppen.
 *
 * Vergangene Termine bleiben unangetastet: sie haben stattgefunden. Geaendert
 * wird ab heute, und zwar durch Absagen und Neuanlegen statt durch Verschieben
 * der Zeitspanne - der Ausschluss-Constraint auf bookings arbeitet ueber alle
 * Buchungen eines Platzes, und ein Update Zeile fuer Zeile wuerde je nach
 * Reihenfolge an der eigenen Serie scheitern.
 *
 * Zweistufig wie create_series: ohne p_displace bricht der Aufruf mit der Zahl
 * der Kollisionen ab, damit die Oberflaeche fragen kann.
 */
create or replace function public.update_series(
  p_series_id uuid,
  p_start_time time, p_end_time time, p_title text,
  p_valid_to date default null, p_displace boolean default false
)
returns table (created_count integer, cancelled_count integer, displaced_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_series public.booking_series%rowtype;
  v_type public.booking_types%rowtype;
  v_ab date := (now() at time zone 'Europe/Berlin')::date;
  v_bis date;
  v_created integer := 0; v_cancelled integer := 0; v_displaced integer := 0;
  v_conflicts integer;
  v_occ record; v_conflict record; v_court_name text;
begin
  if not private.is_admin() then
    raise exception 'Serien koennen nur Administratoren aendern.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_series from public.booking_series where id = p_series_id;
  if not found then
    raise exception 'Diese Serie gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if p_end_time <= p_start_time then
    raise exception 'Die Endzeit muss nach der Startzeit liegen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'Bitte einen Titel angeben.' using errcode = 'invalid_parameter_value';
  end if;

  v_bis := coalesce(p_valid_to, v_series.valid_to);
  if v_bis < v_series.valid_from then
    raise exception 'Das Ende darf nicht vor dem Beginn der Serie liegen.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_type from public.booking_types where id = v_series.booking_type_id;
  select name into v_court_name from public.courts where id = v_series.court_id;

  -- Kollisionen zaehlen: alles, was der neuen Lage im Weg steht und nicht zu
  -- dieser Serie selbst gehoert. Die eigenen Termine werden ohnehin abgesagt.
  select count(*) into v_conflicts
  from private.series_occurrences(v_series.weekday, p_start_time, p_end_time,
                                  greatest(v_series.valid_from, v_ab), v_bis) o
  join public.bookings b
    on b.court_id = v_series.court_id and b.status = 'active'
   and b.slot && tstzrange(o.starts_at, o.ends_at, '[)')
   and b.series_id is distinct from p_series_id;

  if v_conflicts > 0 and not p_displace then
    raise exception
      '% Termine kollidieren mit bestehenden Buchungen. Vorschau ansehen und Verdraengen bestaetigen.',
      v_conflicts using errcode = 'exclusion_violation';
  end if;

  -- Erst die kuenftigen Termine der Serie raeumen, dann neu legen. Sonst
  -- stolpert die neue Lage ueber die alte.
  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me,
         cancellation_reason = 'Serie geaendert'
   where series_id = p_series_id
     and status = 'active'
     and lower(slot) >= (v_ab::timestamp) at time zone 'Europe/Berlin';
  get diagnostics v_cancelled = row_count;

  update public.booking_series
     set start_time = p_start_time, end_time = p_end_time,
         title = btrim(p_title), valid_to = v_bis
   where id = p_series_id;

  for v_occ in
    select * from private.series_occurrences(v_series.weekday, p_start_time, p_end_time,
                                             greatest(v_series.valid_from, v_ab), v_bis)
  loop
    for v_conflict in
      select b.id, b.member_id, b.slot from public.bookings b
      where b.court_id = v_series.court_id and b.status = 'active'
        and b.slot && tstzrange(v_occ.starts_at, v_occ.ends_at, '[)')
    loop
      update public.bookings
         set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me,
             cancellation_reason = 'Verdraengt durch Blockung: ' || btrim(p_title),
             partner_wanted = false
       where id = v_conflict.id;
      v_displaced := v_displaced + 1;

      if lower(v_conflict.slot) > now() then
        perform private.waive_guest_charges(v_conflict.id);
      end if;

      insert into public.notifications (member_id, kind, title, body)
      select distinct p.member_id, 'booking_displaced',
             'Deine Platzbuchung wurde aufgehoben',
             format('Die Buchung am %s auf %s wurde durch "%s" ersetzt.',
                    to_char(lower(v_conflict.slot) at time zone 'Europe/Berlin',
                            'DD.MM.YYYY HH24:MI'),
                    coalesce(v_court_name, 'dem Platz'), btrim(p_title))
      from (
        select v_conflict.member_id as member_id
        union
        select bp.member_id from public.booking_players bp
        where bp.booking_id = v_conflict.id and bp.member_id is not null
      ) p where p.member_id is not null;
    end loop;

    insert into public.bookings (court_id, slot, kind, booking_type_id, series_id, title, created_by)
    values (v_series.court_id, tstzrange(v_occ.starts_at, v_occ.ends_at, '[)'),
            'blocking', v_type.id, p_series_id, btrim(p_title), v_me);
    v_created := v_created + 1;
  end loop;

  return query select v_created, v_cancelled, v_displaced;
end; $$;

revoke execute on function public.update_series(uuid, time, time, text, date, boolean)
  from public, anon;
grant execute on function public.update_series(uuid, time, time, text, date, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_series_occurrence: der Kommentar stimmte nicht
-- ---------------------------------------------------------------------------

/**
 * Ein einzelner Termin einer Serie faellt aus - "Training ist diese Woche".
 *
 * Der frueher hier stehende Grund ("cancel_booking weist Blockungen ohne
 * member_id ab") war falsch: cancel_booking prueft nur, ob der Aufrufer
 * Mitglied ist, und laesst Admins jede Buchung stornieren. Die echten Gruende
 * fuer diese Funktion sind zwei:
 *
 *   1. Sie verlangt, dass der Termin zu einer Serie gehoert. Wer "Faellt diese
 *      Woche aus" drueckt, soll nicht versehentlich eine fremde Platzbuchung
 *      abraeumen, weil er eine Zeile daneben getroffen hat.
 *   2. Sie setzt einen sprechenden Stornogrund, statt das Feld leer zu lassen.
 */
create or replace function public.cancel_series_occurrence(
  p_booking_id uuid, p_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Nur Administratoren koennen Serientermine absagen.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Diesen Termin gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.series_id is null then
    raise exception 'Dieser Termin gehoert zu keiner Serie.'
      using errcode = 'invalid_parameter_value';
  end if;
  if v_booking.status = 'cancelled' then return; end if;

  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me,
         cancellation_reason = coalesce(nullif(btrim(p_reason), ''), 'Faellt aus')
   where id = p_booking_id;
end; $$;

revoke execute on function public.cancel_series_occurrence(uuid, text) from public, anon;
grant  execute on function public.cancel_series_occurrence(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- day_schedule liefert die Serie mit
-- ---------------------------------------------------------------------------
drop function if exists public.day_schedule(date);

create function public.day_schedule(p_date date)
returns table (
  booking_id uuid, court_id uuid, starts_at timestamptz, ends_at timestamptz,
  kind public.booking_kind, type_code text, type_name text, title text,
  owner_name text, owner_member_id uuid, is_own boolean, players text[],
  player_member_ids uuid[], guest_names text[],
  partner_wanted boolean, frei integer, bin_dabei boolean, series_id uuid
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
    ),
    b.partner_wanted,
    greatest(bt.max_players - 1 - count(bp.id)::integer, 0),
    bool_or(bp.member_id = private.current_member_id()) is true,
    b.series_id
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
  group by b.id, b.court_id, b.slot, b.kind, bt.code, bt.name, bt.max_players, b.title,
           m.first_name, m.last_name, b.member_id, b.series_id
  order by lower(b.slot);
$$;

revoke execute on function public.day_schedule(date) from public, anon;
grant  execute on function public.day_schedule(date) to authenticated;
