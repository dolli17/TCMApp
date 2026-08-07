-- ===========================================================================
-- Platzverwaltung: Sperrungen, Serien, Plaetze, Buchungsarten
--
-- Auf courts, booking_types, booking_series und bookings gibt es
-- ausschliesslich "grant select" - auch fuer Admins. Die *_admin_all-Policies
-- laufen ueber PostgREST deshalb ins Leere: die Policy erlaubt die Zeile, aber
-- das fehlende Tabellenrecht verbietet die Anweisung. Alles Schreibende muss
-- ueber SECURITY-DEFINER-RPCs gehen, so wie in der Mitgliederverwaltung auch.
--
-- Bis heute konnte der Vorstand einen Platz nur sperren, indem er eine Serie
-- ueber einen einzigen Tag legte (valid_from = valid_to). Das funktioniert,
-- hinterlaesst aber fuer jeden Regentag eine Serie im Bestand.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Einmalige Sperrung
-- ---------------------------------------------------------------------------

/**
 * Regen, Turnier, Platzpflege: mehrere Plaetze fuer einen Zeitraum sperren.
 *
 * Zweistufig wie create_series: ohne p_force bricht der Aufruf mit der Zahl der
 * Kollisionen ab, damit die Oberflaeche fragen kann. Erst mit p_force werden
 * bestehende Buchungen verdraengt - und alle Betroffenen benachrichtigt.
 *
 * Die Blockung entsteht je Platz als eigene Buchung. Ein gemeinsamer Datensatz
 * fuer acht Plaetze waere kompakter, aber der Ausschluss-Constraint arbeitet je
 * Platz und Zeitraum; alles andere muesste ihn umgehen.
 */
create or replace function public.create_blocking(
  p_court_ids uuid[], p_von timestamptz, p_bis timestamptz,
  p_type_code text, p_title text, p_force boolean default false
)
returns table (created_count integer, displaced_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_type public.booking_types%rowtype;
  v_created integer := 0; v_displaced integer := 0; v_conflicts integer;
  v_court uuid; v_conflict record; v_court_name text;
begin
  if not private.is_admin() then
    raise exception 'Sperrungen koennen nur Administratoren anlegen.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_court_ids is null or array_length(p_court_ids, 1) is null then
    raise exception 'Bitte mindestens einen Platz auswaehlen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_bis <= p_von then
    raise exception 'Das Ende muss nach dem Beginn liegen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'Bitte einen Grund angeben.' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_type from public.booking_types where code = p_type_code and active;
  if not found then
    raise exception 'Unbekannte Buchungsart: %', p_type_code
      using errcode = 'invalid_parameter_value';
  end if;
  if v_type.applies_to <> 'blocking' then
    raise exception '"%" ist keine Blockungsart.', v_type.name
      using errcode = 'invalid_parameter_value';
  end if;

  select count(*) into v_conflicts
  from public.bookings b
  where b.court_id = any (p_court_ids)
    and b.status = 'active'
    and b.slot && tstzrange(p_von, p_bis, '[)');

  if v_conflicts > 0 and not p_force then
    raise exception
      '% Buchungen liegen in diesem Zeitraum. Bestaetige das Verdraengen.',
      v_conflicts using errcode = 'exclusion_violation';
  end if;

  foreach v_court in array p_court_ids loop
    select name into v_court_name from public.courts where id = v_court;

    for v_conflict in
      select b.id, b.member_id, b.slot from public.bookings b
      where b.court_id = v_court and b.status = 'active'
        and b.slot && tstzrange(p_von, p_bis, '[)')
    loop
      update public.bookings
         set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me,
             cancellation_reason = 'Platzsperrung: ' || btrim(p_title),
             partner_wanted = false
       where id = v_conflict.id;
      v_displaced := v_displaced + 1;

      -- Gastgebuehren fallen weg, wenn die Sperrung vor Spielbeginn kommt.
      -- Wer nicht spielen konnte, weil der Platz gesperrt wurde, soll nicht
      -- fuer den Gast zahlen.
      if lower(v_conflict.slot) > now() then
        perform private.waive_guest_charges(v_conflict.id);
      end if;

      insert into public.notifications (member_id, kind, title, body)
      select distinct p.member_id, 'booking_displaced',
             'Deine Platzbuchung wurde aufgehoben',
             format('Die Buchung am %s auf %s faellt aus: %s.',
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

    insert into public.bookings (court_id, slot, kind, booking_type_id, title, created_by)
    values (v_court, tstzrange(p_von, p_bis, '[)'), 'blocking', v_type.id,
            btrim(p_title), v_me);
    v_created := v_created + 1;
  end loop;

  return query select v_created, v_displaced;
end; $$;

revoke execute on function
  public.create_blocking(uuid[], timestamptz, timestamptz, text, text, boolean) from public, anon;
grant execute on function
  public.create_blocking(uuid[], timestamptz, timestamptz, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Serien pflegen
-- ---------------------------------------------------------------------------

/**
 * Eine Serie beenden.
 *
 * Kuenftige Termine ab dem Stichtag werden storniert, valid_to wird
 * zurueckgesetzt. Die vergangenen bleiben stehen - sie haben stattgefunden,
 * und wer sie loescht, faelscht die Belegungshistorie.
 */
create or replace function public.end_series(p_series_id uuid, p_ab date default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_series public.booking_series%rowtype;
  v_ab date := coalesce(p_ab, (now() at time zone 'Europe/Berlin')::date);
  v_anzahl integer;
begin
  if not private.is_admin() then
    raise exception 'Serien koennen nur Administratoren aendern.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_series from public.booking_series where id = p_series_id;
  if not found then
    raise exception 'Diese Serie gibt es nicht.' using errcode = 'no_data_found';
  end if;

  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me,
         cancellation_reason = 'Serie beendet'
   where series_id = p_series_id
     and status = 'active'
     and lower(slot) >= (v_ab::timestamp) at time zone 'Europe/Berlin';
  get diagnostics v_anzahl = row_count;

  -- valid_to darf nicht vor valid_from rutschen, sonst schlaegt der Check zu.
  update public.booking_series
     set valid_to = greatest(v_ab - 1, valid_from)
   where id = p_series_id;

  return v_anzahl;
end; $$;

revoke execute on function public.end_series(uuid, date) from public, anon;
grant  execute on function public.end_series(uuid, date) to authenticated;

/**
 * Ein einzelner Termin einer Serie faellt aus - "Training ist diese Woche".
 *
 * Bewusst nicht ueber cancel_booking: die verlangt einen Bucher und weist
 * Blockungen ohne member_id ab. Hier zaehlt allein die Adminrolle.
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
-- Plaetze pflegen
-- ---------------------------------------------------------------------------

create or replace function public.upsert_court(
  p_id uuid, p_name text, p_short_name text,
  p_subline text default null, p_position integer default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_pos integer;
begin
  if not private.is_admin() then
    raise exception 'Plaetze koennen nur Administratoren pflegen.'
      using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_name, '')) = '' or btrim(coalesce(p_short_name, '')) = '' then
    raise exception 'Name und Kurzname sind Pflicht.' using errcode = 'invalid_parameter_value';
  end if;

  if p_id is null then
    -- Neue Plaetze landen hinten, damit die bestehende Reihenfolge bleibt.
    select coalesce(max(position), 0) + 1 into v_pos from public.courts;
    insert into public.courts (name, short_name, subline, position)
    values (btrim(p_name), btrim(p_short_name),
            nullif(btrim(coalesce(p_subline, '')), ''), coalesce(p_position, v_pos))
    returning id into v_id;
  else
    update public.courts
       set name = btrim(p_name),
           short_name = btrim(p_short_name),
           subline = nullif(btrim(coalesce(p_subline, '')), ''),
           position = coalesce(p_position, position)
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Diesen Platz gibt es nicht.' using errcode = 'no_data_found';
    end if;
  end if;

  return v_id;
exception when unique_violation then
  raise exception 'Einen Platz mit diesem Namen gibt es schon.'
    using errcode = 'unique_violation';
end; $$;

revoke execute on function public.upsert_court(uuid, text, text, text, integer) from public, anon;
grant  execute on function public.upsert_court(uuid, text, text, text, integer) to authenticated;

/**
 * Einen Platz stilllegen oder wieder freigeben.
 *
 * Kein Loeschen: bookings verweist mit "on delete restrict" darauf, und die
 * Belegungshistorie soll erhalten bleiben. Ein stillgelegter Platz taucht im
 * Plan nicht mehr auf, seine alten Buchungen bleiben lesbar.
 *
 * Kuenftige Buchungen werden nicht angetastet - wer einen Platz stilllegt, soll
 * vorher sperren und die Betroffenen benachrichtigen; ein stiller Verlust von
 * zwanzig Buchungen waere die schlechtere Ueberraschung.
 */
create or replace function public.set_court_active(p_id uuid, p_active boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_offen integer;
begin
  if not private.is_admin() then
    raise exception 'Plaetze koennen nur Administratoren pflegen.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.courts set active = coalesce(p_active, true) where id = p_id;
  if not found then
    raise exception 'Diesen Platz gibt es nicht.' using errcode = 'no_data_found';
  end if;

  select count(*)::integer into v_offen
  from public.bookings
  where court_id = p_id and status = 'active' and upper(slot) > now();

  return v_offen;
end; $$;

revoke execute on function public.set_court_active(uuid, boolean) from public, anon;
grant  execute on function public.set_court_active(uuid, boolean) to authenticated;

/** Reihenfolge der Plaetze im Plan: die Liste gibt sie von links nach rechts. */
create or replace function public.reorder_courts(p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_anzahl integer;
begin
  if not private.is_admin() then
    raise exception 'Plaetze koennen nur Administratoren pflegen.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  update public.courts c
     set position = x.ord
  from (select id, ord from unnest(p_ids) with ordinality as t(id, ord)) x
  where c.id = x.id;
  get diagnostics v_anzahl = row_count;

  return v_anzahl;
end; $$;

revoke execute on function public.reorder_courts(uuid[]) from public, anon;
grant  execute on function public.reorder_courts(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Buchungsarten pflegen
-- ---------------------------------------------------------------------------

/**
 * Buchungsarten anlegen und aendern.
 *
 * Der Code bleibt nach dem Anlegen fest: er steht in Bestandsbuchungen, in den
 * Tests und in der Oberflaeche. Wer ihn aendern will, legt eine neue Art an und
 * stellt die alte still.
 */
create or replace function public.upsert_booking_type(
  p_code text, p_name text, p_applies_to public.booking_kind,
  p_duration_minutes integer, p_min_players integer, p_max_players integer,
  p_requires_partner boolean, p_counts_towards_quota boolean,
  p_active boolean default true, p_sort_order integer default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_pos integer;
begin
  if not private.is_admin() then
    raise exception 'Buchungsarten koennen nur Administratoren pflegen.'
      using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_code, '')) = '' or btrim(coalesce(p_name, '')) = '' then
    raise exception 'Code und Name sind Pflicht.' using errcode = 'invalid_parameter_value';
  end if;
  if p_max_players < p_min_players then
    raise exception 'Die Obergrenze darf nicht unter der Untergrenze liegen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_duration_minutes < 15 or p_duration_minutes > 1440 then
    raise exception 'Die Dauer muss zwischen 15 und 1440 Minuten liegen.'
      using errcode = 'invalid_parameter_value';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_pos from public.booking_types;

  insert into public.booking_types
    (code, name, applies_to, duration_minutes, min_players, max_players,
     requires_partner, counts_towards_quota, active, sort_order)
  values
    (btrim(p_code), btrim(p_name), p_applies_to, p_duration_minutes,
     p_min_players, p_max_players, p_requires_partner, p_counts_towards_quota,
     coalesce(p_active, true), coalesce(p_sort_order, v_pos))
  on conflict (code) do update set
    name = excluded.name,
    applies_to = excluded.applies_to,
    duration_minutes = excluded.duration_minutes,
    min_players = excluded.min_players,
    max_players = excluded.max_players,
    requires_partner = excluded.requires_partner,
    counts_towards_quota = excluded.counts_towards_quota,
    active = excluded.active,
    sort_order = coalesce(p_sort_order, public.booking_types.sort_order)
  returning id into v_id;

  return v_id;
end; $$;

revoke execute on function public.upsert_booking_type(
  text, text, public.booking_kind, integer, integer, integer,
  boolean, boolean, boolean, integer) from public, anon;
grant execute on function public.upsert_booking_type(
  text, text, public.booking_kind, integer, integer, integer,
  boolean, boolean, boolean, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Uebersicht fuer die Verwaltungsseite
-- ---------------------------------------------------------------------------

/**
 * Plaetze samt Belastung.
 *
 * Die Zahl der kuenftigen Buchungen steht dabei, weil sie die eine Frage
 * beantwortet, die vor dem Stilllegen zaehlt: haengt da noch etwas dran?
 */
create or replace function public.court_overview()
-- "position" laesst sich nicht als Spaltenname einer returns-table-Liste
-- schreiben: Postgres liest es dort als den Funktionsaufruf position(x in y).
-- Deshalb heisst die Spalte hier sort_position.
returns table (
  id uuid, name text, short_name text, subline text,
  sort_position integer, active boolean, offene_buchungen integer
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.short_name, c.subline, c.position, c.active,
         count(b.id) filter (where b.status = 'active' and upper(b.slot) > now())::integer
  from public.courts c
  left join public.bookings b on b.court_id = c.id
  where private.is_admin()
  group by c.id, c.name, c.short_name, c.subline, c.position, c.active
  order by c.position, c.name;
$$;

revoke execute on function public.court_overview() from public, anon;
grant  execute on function public.court_overview() to authenticated;

/** Serien mit Zahl der noch anstehenden Termine - fuer /admin/serien. */
create or replace function public.series_overview()
returns table (
  id uuid, court_name text, type_name text, title text,
  weekday integer, start_time time, end_time time,
  valid_from date, valid_to date, kuenftige integer
)
language sql stable security definer set search_path = '' as $$
  select s.id, c.name, bt.name, s.title, s.weekday, s.start_time, s.end_time,
         s.valid_from, s.valid_to,
         count(b.id) filter (where b.status = 'active' and lower(b.slot) > now())::integer
  from public.booking_series s
  join public.courts c on c.id = s.court_id
  join public.booking_types bt on bt.id = s.booking_type_id
  left join public.bookings b on b.series_id = s.id
  where private.is_admin()
  group by s.id, c.name, bt.name, s.title, s.weekday, s.start_time, s.end_time,
           s.valid_from, s.valid_to
  order by s.valid_to desc, s.weekday, s.start_time;
$$;

revoke execute on function public.series_overview() from public, anon;
grant  execute on function public.series_overview() to authenticated;
