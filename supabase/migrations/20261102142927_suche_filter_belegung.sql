-- ===========================================================================
-- Eingeschraenkte Suche auch im Belegungsplan nur fuer Passende
--
-- Seit 20261102122426_suche_filter zeigt open_matches eine eingeschraenkte
-- Suche nur Mitgliedern, die passen. day_schedule lieferte partner_wanted
-- und die Filter aber jedem Mitglied. Web und Apps zeigten im Platzplan
-- deshalb "sucht" und den Mitspielen-Knopf auch Nicht-Passenden; der
-- Beitritt scheiterte erst in join_booking.
--
-- day_schedule liefert jetzt partner_wanted = true und die Filterspalten nur
-- an Bucher, Eingetragene, Platzverwalter (darf_plaetze) und wer zur Suche
-- passt - dieselbe Regel wie open_matches. Alle anderen bekommen
-- partner_wanted = false und null in den Filterspalten. Die Buchung selbst
-- bleibt im Plan, wie bisher (frei, bin_dabei usw. unveraendert).
--
-- Gleiche Signatur und Spalten, deshalb create or replace; Rechte bleiben.
-- Andere RPCs liefern partner_wanted nur an Beteiligte (my_bookings) oder
-- filtern schon (open_matches).
-- ===========================================================================

create or replace function public.day_schedule(p_date date)
returns table (booking_id uuid, court_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, kind public.booking_kind, type_code text, type_name text, title text, owner_name text, owner_member_id uuid, is_own boolean, players text[], player_member_ids uuid[], guest_names text[], partner_wanted boolean, frei integer, bin_dabei boolean, series_id uuid, partner_lk_von numeric, partner_lk_bis numeric, partner_fuer text)
language sql
stable
security definer
set search_path = ''
as $function$
  with ich as (select private.current_member_id() as id)
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
    s.suche_sichtbar,
    greatest(bt.max_players - 1 - count(bp.id)::integer, 0),
    bool_or(bp.member_id = private.current_member_id()) is true,
    b.series_id,
    case when s.suche_sichtbar then b.partner_lk_von end,
    case when s.suche_sichtbar then b.partner_lk_bis end,
    case when s.suche_sichtbar then b.partner_fuer end
  from public.bookings b
  cross join ich
  -- Eingeschraenkte Suche wie in open_matches: sehen nur Bucher,
  -- Eingetragene, Platzverwalter und wer passt.
  cross join lateral (
    select (b.partner_wanted
            and (b.member_id = ich.id
                 or exists (select 1 from public.booking_players ich_bp
                             where ich_bp.booking_id = b.id
                               and ich_bp.member_id = ich.id)
                 or private.darf_plaetze()
                 or private.passt_zur_suche(ich.id, b.partner_lk_von,
                                            b.partner_lk_bis, b.partner_fuer))) is true
             as suche_sichtbar
  ) s
  join public.booking_types bt on bt.id = b.booking_type_id
  left join public.members m on m.id = b.member_id
  left join public.booking_players bp on bp.booking_id = b.id
  left join public.members pm on pm.id = bp.member_id
  where b.status = 'active'
    and private.is_member()
    and b.slot && tstzrange(
          (p_date::timestamp) at time zone 'Europe/Berlin',
          ((p_date + 1)::timestamp) at time zone 'Europe/Berlin', '[)')
    -- S15: Was laenger als eine Woche vorbei ist, sehen nur Beteiligte.
    and private.buchung_sichtbar(b.id)
  group by b.id, b.court_id, b.slot, b.kind, bt.code, bt.name, bt.max_players, b.title,
           m.first_name, m.last_name, b.member_id, b.series_id, s.suche_sichtbar
  order by lower(b.slot);
$function$;
