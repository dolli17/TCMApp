-- ===========================================================================
-- Platzwart: Rechte fuer das, was kurzfristig an den Plaetzen passiert
--
-- Bisher war der Platzwart ('groundskeeper') vergebbar, durfte aber nichts.
-- Jetzt darf er, was am Platz anfaellt: Sperren und aufheben, Serien anlegen,
-- aendern und beenden, einzelne Serientermine absagen, fremde Buchungen
-- stornieren, Mitspieler aendern und "Mitspieler gesucht" setzen.
--
-- Nicht dazu gehoeren Plaetze anlegen, aktivieren oder sortieren,
-- Buchungsarten, Einstellungen, Kasse, Mitglieder und Rollen. Auch die
-- beschraenkten Buchungsarten (allowed_roles in create_booking) bleiben bei
-- private.is_admin().
--
-- Die RPCs unten sind die jeweils neueste Fassung mit unveraendertem Body;
-- nur private.is_admin() ist durch private.darf_plaetze() ersetzt. Einzige
-- inhaltliche Aenderung: create_series erlaesst beim Verdraengen kuenftig die
-- Gastgebuehren und setzt partner_wanted zurueck, wie update_series und
-- create_blocking es schon tun.
--
-- RLS bleibt, wie es ist: Lesen duerfen alle Mitglieder, Schreiben geht nur
-- ueber diese RPCs.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Helfer
-- ---------------------------------------------------------------------------

/** Darf die angemeldete Person die Plaetze verwalten? App Admin, Vorstand, Platzwart. */
create or replace function private.darf_plaetze()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_roles mr
    join public.members m on m.id = mr.member_id
    where m.auth_user_id = (select auth.uid())
      and mr.role in ('admin'::public.app_role, 'board'::public.app_role,
                      'groundskeeper'::public.app_role)
  );
$$;

revoke execute on function private.darf_plaetze() from public, anon;
grant  execute on function private.darf_plaetze() to authenticated;

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
  if not private.darf_plaetze() then
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
  if not private.darf_plaetze() then
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
  if not private.darf_plaetze() then
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
  if not private.darf_plaetze() then
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
-- Serien anlegen: Vorschau und Anlage. create_series erlaesst beim Verdraengen
-- jetzt die Gastgebuehr und setzt partner_wanted zurueck
-- ---------------------------------------------------------------------------

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
  where private.darf_plaetze()
  order by o.starts_at;
$$;
revoke execute on function public.preview_series(uuid, integer, time, time, date, date) from public, anon;
grant execute on function public.preview_series(uuid, integer, time, time, date, date) to authenticated;

create or replace function public.create_series(
  p_court_id uuid, p_booking_type_code text, p_weekday integer,
  p_start_time time, p_end_time time, p_valid_from date, p_valid_to date,
  p_title text, p_displace boolean default false
)
returns table (series_id uuid, created_count integer, displaced_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_type public.booking_types%rowtype;
  v_series_id uuid; v_created integer := 0; v_displaced integer := 0; v_conflicts integer;
  v_occ record; v_conflict record; v_court_name text;
begin
  if not private.darf_plaetze() then
    raise exception 'Serien koennen nur Administratoren anlegen.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_type from public.booking_types where code = p_booking_type_code and active;
  if not found then
    raise exception 'Unbekannte Buchungsart: %', p_booking_type_code
      using errcode = 'invalid_parameter_value';
  end if;
  if v_type.applies_to <> 'blocking' then
    raise exception '"%" ist keine Blockungsart.', v_type.name using errcode = 'invalid_parameter_value';
  end if;
  if p_end_time <= p_start_time then
    raise exception 'Die Endzeit muss nach der Startzeit liegen.' using errcode = 'invalid_parameter_value';
  end if;

  select count(*) into v_conflicts
  from private.series_occurrences(p_weekday, p_start_time, p_end_time, p_valid_from, p_valid_to) o
  join public.bookings b on b.court_id = p_court_id and b.status = 'active'
   and b.slot && tstzrange(o.starts_at, o.ends_at, '[)');

  if v_conflicts > 0 and not p_displace then
    raise exception
      '% Termine kollidieren mit bestehenden Buchungen. Vorschau ansehen und Verdraengen bestaetigen.',
      v_conflicts using errcode = 'exclusion_violation';
  end if;

  select name into v_court_name from public.courts where id = p_court_id;

  insert into public.booking_series
    (court_id, booking_type_id, weekday, start_time, end_time, valid_from, valid_to, title, created_by)
  values (p_court_id, v_type.id, p_weekday, p_start_time, p_end_time, p_valid_from, p_valid_to, p_title, v_me)
  returning id into v_series_id;

  for v_occ in
    select * from private.series_occurrences(p_weekday, p_start_time, p_end_time, p_valid_from, p_valid_to)
  loop
    for v_conflict in
      select b.id, b.member_id, b.slot from public.bookings b
      where b.court_id = p_court_id and b.status = 'active'
        and b.slot && tstzrange(v_occ.starts_at, v_occ.ends_at, '[)')
    loop
      update public.bookings
         set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me,
             cancellation_reason = 'Verdraengt durch Blockung: ' || p_title,
             partner_wanted = false
       where id = v_conflict.id;
      v_displaced := v_displaced + 1;

      -- Wie bei create_blocking und update_series: wer vor Spielbeginn
      -- verdraengt wird, zahlt nicht fuer den Gast.
      if lower(v_conflict.slot) > now() then
        perform private.waive_guest_charges(v_conflict.id);
      end if;

      insert into public.notifications (member_id, kind, title, body)
      select distinct p.member_id, 'booking_displaced',
             'Deine Platzbuchung wurde aufgehoben',
             format('Die Buchung am %s auf %s wurde durch "%s" ersetzt.',
                    to_char(lower(v_conflict.slot) at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI'),
                    coalesce(v_court_name, 'dem Platz'), p_title)
      from (
        select v_conflict.member_id as member_id
        union
        select bp.member_id from public.booking_players bp
        where bp.booking_id = v_conflict.id and bp.member_id is not null
      ) p where p.member_id is not null;
    end loop;

    insert into public.bookings (court_id, slot, kind, booking_type_id, series_id, title, created_by)
    values (p_court_id, tstzrange(v_occ.starts_at, v_occ.ends_at, '[)'),
            'blocking', v_type.id, v_series_id, p_title, v_me);
    v_created := v_created + 1;
  end loop;

  return query select v_series_id, v_created, v_displaced;
end; $$;
revoke execute on function
  public.create_series(uuid, text, integer, time, time, date, date, text, boolean) from public, anon;
grant execute on function
  public.create_series(uuid, text, integer, time, time, date, date, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Uebersichten fuer die Verwaltungsseite
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
  where private.darf_plaetze()
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
  where private.darf_plaetze()
  group by s.id, c.name, bt.name, s.title, s.weekday, s.start_time, s.end_time,
           s.valid_from, s.valid_to
  order by s.valid_to desc, s.weekday, s.start_time;
$$;

revoke execute on function public.series_overview() from public, anon;
grant  execute on function public.series_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_booking: Gastgebuehr erlassen, solange nicht gespielt wurde
-- ---------------------------------------------------------------------------
create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_text text;
begin
  if v_me is null then
    raise exception 'Nur Mitglieder koennen stornieren.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.status = 'cancelled' then return; end if;

  if v_booking.member_id is distinct from v_me and not private.darf_plaetze() then
    raise exception 'Du kannst nur deine eigenen Buchungen stornieren.'
      using errcode = 'insufficient_privilege';
  end if;
  -- Admins raeumen auch waehrend der Spielzeit auf, etwa bei Platzsperrung.
  if lower(v_booking.slot) <= now() and not private.darf_plaetze() then
    raise exception 'Die Spielzeit hat bereits begonnen.' using errcode = 'check_violation';
  end if;

  -- Der Text wird vor dem Storno gebildet: booking_label liest die Buchung,
  -- und die soll den Zeitpunkt nennen, nicht den Status.
  v_text := format('Die Buchung am %s wurde storniert.', private.booking_label(p_booking_id));
  if p_reason is not null and btrim(p_reason) <> '' then
    v_text := v_text || ' Grund: ' || btrim(p_reason);
  end if;

  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me,
         cancellation_reason = p_reason, partner_wanted = false
   where id = p_booking_id;

  -- Vor Spielbeginn wird die Gastgebuehr erlassen, danach bleibt sie stehen.
  if lower(v_booking.slot) > now() then
    perform private.waive_guest_charges(p_booking_id);
  end if;

  -- Alle Betroffenen ausser dem, der storniert hat: der weiss es bereits.
  insert into public.notifications (member_id, kind, title, body)
  select distinct p.member_id, 'booking_cancelled', 'Eine Buchung wurde storniert', v_text
  from (
    select v_booking.member_id as member_id
    union
    select bp.member_id from public.booking_players bp
    where bp.booking_id = p_booking_id and bp.member_id is not null
  ) p
  where p.member_id is not null and p.member_id <> v_me;
end; $$;
revoke execute on function public.cancel_booking(uuid, text) from public, anon;
grant  execute on function public.cancel_booking(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- set_partner_wanted: auch fuer fremde Buchungen
-- ---------------------------------------------------------------------------

create or replace function public.set_partner_wanted(p_booking_id uuid, p_wanted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_type public.booking_types%rowtype;
  v_besetzt integer;
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.member_id is distinct from v_me and not private.darf_plaetze() then
    raise exception 'Nur der Bucher kann Mitspieler suchen.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_booking.status <> 'active' then
    raise exception 'Diese Buchung ist storniert.' using errcode = 'check_violation';
  end if;

  if p_wanted then
    select * into v_type from public.booking_types where id = v_booking.booking_type_id;
    select 1 + count(*)::integer into v_besetzt
    from public.booking_players bp where bp.booking_id = p_booking_id;
    if v_besetzt >= v_type.max_players then
      raise exception 'Die Buchung ist voll - es ist kein Platz mehr frei.'
        using errcode = 'check_violation';
    end if;
  end if;

  update public.bookings set partner_wanted = coalesce(p_wanted, false)
   where id = p_booking_id;
end; $$;

revoke execute on function public.set_partner_wanted(uuid, boolean) from public, anon;
grant  execute on function public.set_partner_wanted(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- update_booking_players: neu hinzukommende Mitspieler pruefen
-- ---------------------------------------------------------------------------
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
  v_ist_admin boolean := private.darf_plaetze();
  v_vorher uuid[];
  v_label text;
  v_gaeste integer := coalesce(array_length(p_guest_names, 1), 0);
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

  v_players := 1 + coalesce(array_length(p_member_ids, 1), 0) + v_gaeste;

  -- Solange Mitspieler gesucht werden, darf die Buchung unterbesetzt sein.
  if not v_booking.partner_wanted then
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

  -- Nur wer neu dazukommt, wird auf Doppelbelegung geprueft. Bucher und
  -- bisherige Mitspieler stehen schon in dieser Buchung; sie erneut zu pruefen,
  -- wuerde nur Altbestand aus der Zeit vor dieser Regel zur Huerde machen.
  perform private.pruefe_spielt_schon(
    array(select neu from unnest(coalesce(p_member_ids, '{}')) with ordinality as t(neu, i)
           where not exists (select 1 from public.booking_players bp
                              where bp.booking_id = p_booking_id and bp.member_id = neu)
           order by i),
    v_booking.slot, p_booking_id);

  -- Die alte Besetzung merken, bevor sie geloescht wird: nur so laesst sich
  -- danach sagen, wer neu dazukam und wer gehen musste. Die Funktion tauscht
  -- vollstaendig aus, kennt also von sich aus keinen Unterschied.
  select coalesce(array_agg(bp.member_id), '{}')
    into v_vorher
  from public.booking_players bp
  where bp.booking_id = p_booking_id and bp.member_id is not null;

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

  -- Die Gebuehr traegt immer der Bucher, auch wenn ein Admin die Besetzung
  -- aendert: er hat den Gast mitgebracht, nicht der Verwalter.
  perform private.sync_guest_charges(p_booking_id, v_booking.member_id, v_gaeste);

  -- Voll ist voll: die Buchung verschwindet aus den offenen Spielen.
  if v_booking.partner_wanted and v_players >= v_type.max_players then
    update public.bookings set partner_wanted = false where id = p_booking_id;
  end if;

  v_label := private.booking_label(p_booking_id);

  insert into public.notifications (member_id, kind, title, body)
  select neu, 'booking_added', 'Du bist als Mitspieler eingetragen',
         format('%s hat dich fuer %s eingetragen.', private.member_label(v_me), v_label)
  from unnest(coalesce(p_member_ids, '{}')) as neu
  where not (neu = any (v_vorher)) and neu <> v_me;

  insert into public.notifications (member_id, kind, title, body)
  select alt, 'booking_removed', 'Du bist nicht mehr dabei',
         format('%s hat dich von %s ausgetragen.', private.member_label(v_me), v_label)
  from unnest(v_vorher) as alt
  where not (alt = any (coalesce(p_member_ids, '{}'))) and alt <> v_me;
end; $$;
revoke execute on function public.update_booking_players(uuid, uuid[], text[]) from public, anon;
grant  execute on function public.update_booking_players(uuid, uuid[], text[]) to authenticated;
