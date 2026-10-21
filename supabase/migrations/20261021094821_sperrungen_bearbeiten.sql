-- ===========================================================================
-- Sperrungen: Grund freiwillig (B25), bearbeiten (B24)
--
-- Bisher liess sich eine Sperrung nur anlegen und aufheben. Wer sich bei Zeit,
-- Platz oder Kategorie vertan hatte, musste aufheben und neu sperren. Jetzt
-- aendert update_blocking Zeit, Plaetze, Kategorie (Buchungsart mit
-- applies_to = 'blocking') und Grund in einem Zug.
--
-- Der Grund ist freiwillig. Was eine Sperrung ist, sagt ihre Kategorie
-- ("Platzpflege", "Verbandsspiel"); der Grund ergaenzt sie nur. Ohne Grund
-- steht title = null an der Sperrung, und Storno und Nachricht an Verdraengte
-- nennen die Kategorie.
--
-- Abwaertskompatibel: Der Check bookings_owner_present wird nur gelockert.
-- Alte App-Versionen schicken weiter einen Grund und zeigen eine Sperrung
-- ohne Titel als "gesperrt / ohne Grund" (App) bzw. mit dem Namen der
-- Buchungsart (Web). create_blocking behaelt seine Signatur.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Sperrungen ohne Titel zulassen
-- ---------------------------------------------------------------------------

-- Vorher: kind = 'blocking' verlangte title is not null. Eine Buchung braucht
-- weiter ihren Bucher.
alter table public.bookings drop constraint bookings_owner_present;
alter table public.bookings add constraint bookings_owner_present
  check (kind = 'blocking'::public.booking_kind
         or (kind = 'booking'::public.booking_kind and member_id is not null));

-- ---------------------------------------------------------------------------
-- Einmalige Sperrung: Grund freiwillig
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
 *
 * Fassung aus 20261014075926_platzwart_rechte.sql; neu ist nur, dass p_title
 * leer sein darf. Dann nennen Storno und Nachricht die Kategorie.
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
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_grund text;
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

  select * into v_type from public.booking_types where code = p_type_code and active;
  if not found then
    raise exception 'Unbekannte Buchungsart: %', p_type_code
      using errcode = 'invalid_parameter_value';
  end if;
  if v_type.applies_to <> 'blocking' then
    raise exception '"%" ist keine Blockungsart.', v_type.name
      using errcode = 'invalid_parameter_value';
  end if;
  v_grund := coalesce(v_title, v_type.name);

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
             cancellation_reason = 'Platzsperrung: ' || v_grund,
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
                    coalesce(v_court_name, 'dem Platz'), v_grund)
      from (
        select v_conflict.member_id as member_id
        union
        select bp.member_id from public.booking_players bp
        where bp.booking_id = v_conflict.id and bp.member_id is not null
      ) p where p.member_id is not null;
    end loop;

    insert into public.bookings (court_id, slot, kind, booking_type_id, title, created_by)
    values (v_court, tstzrange(p_von, p_bis, '[)'), 'blocking', v_type.id,
            v_title, v_me);
    v_created := v_created + 1;
  end loop;

  return query select v_created, v_displaced;
end; $$;

revoke execute on function
  public.create_blocking(uuid[], timestamptz, timestamptz, text, text, boolean) from public, anon;
grant execute on function
  public.create_blocking(uuid[], timestamptz, timestamptz, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Sperrung bearbeiten
-- ---------------------------------------------------------------------------

/**
 * Zeit, Plaetze, Kategorie und Grund einer Sperrung aendern.
 *
 * Eine Sperrung ist je Platz eine eigene Buchung (siehe create_blocking).
 * Bearbeitet wird genau die eine, p_court_ids sind die Plaetze danach: Liegt
 * ihr Platz in der Auswahl, bleibt sie dort, sonst wandert sie auf den ersten.
 * Fuer jeden weiteren Platz entsteht eine Sperrung mit denselben Angaben.
 * Andere Sperrungen, auch gleichzeitig angelegte, bleiben unberuehrt.
 *
 * Ueberschneidungen wie bei create_blocking: ohne p_force Abbruch mit der
 * Zahl, mit p_force verdraengen, Gastgebuehr erlassen, Betroffene
 * benachrichtigen. Die Sperrung selbst zaehlt nicht mit.
 *
 * Serientermine sind auch Blockungen, gehoeren aber zur Serie und werden
 * ueber update_series geaendert.
 */
create or replace function public.update_blocking(
  p_booking_id uuid, p_court_ids uuid[], p_von timestamptz, p_bis timestamptz,
  p_type_code text, p_title text, p_force boolean default false
)
returns table (created_count integer, displaced_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_member_id();
  v_sperre public.bookings%rowtype;
  v_type public.booking_types%rowtype;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_grund text;
  v_plaetze uuid[];
  v_platz uuid;
  v_created integer := 0; v_displaced integer := 0; v_conflicts integer;
  v_court uuid; v_conflict record;
begin
  if not private.darf_plaetze() then
    raise exception 'Sperrungen koennen nur Platzwart, Vorstand und Administratoren bearbeiten.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_sperre from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Diese Sperrung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_sperre.kind <> 'blocking' then
    raise exception 'Das ist keine Sperrung.' using errcode = 'invalid_parameter_value';
  end if;
  if v_sperre.series_id is not null then
    raise exception 'Serientermine aenderst du ueber die Serie.'
      using errcode = 'invalid_parameter_value';
  end if;
  if v_sperre.status <> 'active' then
    raise exception 'Diese Sperrung ist schon aufgehoben.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_court_ids is null or array_length(p_court_ids, 1) is null then
    raise exception 'Bitte mindestens einen Platz auswaehlen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_bis <= p_von then
    raise exception 'Das Ende muss nach dem Beginn liegen.'
      using errcode = 'invalid_parameter_value';
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
  v_grund := coalesce(v_title, v_type.name);

  -- Doppelt gewaehlte Plaetze nur einmal; die Reihenfolge bleibt.
  select array_agg(c order by i) into v_plaetze
  from (select distinct on (c) c, i from unnest(p_court_ids) with ordinality u(c, i)
        order by c, i) d;
  v_platz := case when v_sperre.court_id = any (v_plaetze)
                  then v_sperre.court_id else v_plaetze[1] end;

  select count(*) into v_conflicts
  from public.bookings b
  where b.court_id = any (v_plaetze)
    and b.status = 'active'
    and b.id <> p_booking_id
    and b.slot && tstzrange(p_von, p_bis, '[)');

  if v_conflicts > 0 and not p_force then
    raise exception
      '% Buchungen liegen in diesem Zeitraum. Bestaetige das Verdraengen.',
      v_conflicts using errcode = 'exclusion_violation';
  end if;

  for v_conflict in
    select b.id, b.member_id, b.slot, c.name as court_name
    from public.bookings b join public.courts c on c.id = b.court_id
    where b.court_id = any (v_plaetze) and b.status = 'active'
      and b.id <> p_booking_id
      and b.slot && tstzrange(p_von, p_bis, '[)')
  loop
    update public.bookings
       set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me,
           cancellation_reason = 'Platzsperrung: ' || v_grund,
           partner_wanted = false
     where id = v_conflict.id;
    v_displaced := v_displaced + 1;

    -- Wie in create_blocking: vor Spielbeginn faellt die Gastgebuehr weg.
    if lower(v_conflict.slot) > now() then
      perform private.waive_guest_charges(v_conflict.id);
    end if;

    insert into public.notifications (member_id, kind, title, body)
    select distinct p.member_id, 'booking_displaced',
           'Deine Platzbuchung wurde aufgehoben',
           format('Die Buchung am %s auf %s faellt aus: %s.',
                  to_char(lower(v_conflict.slot) at time zone 'Europe/Berlin',
                          'DD.MM.YYYY HH24:MI'),
                  coalesce(v_conflict.court_name, 'dem Platz'), v_grund)
    from (
      select v_conflict.member_id as member_id
      union
      select bp.member_id from public.booking_players bp
      where bp.booking_id = v_conflict.id and bp.member_id is not null
    ) p where p.member_id is not null;
  end loop;

  update public.bookings
     set court_id = v_platz, slot = tstzrange(p_von, p_bis, '[)'),
         booking_type_id = v_type.id, title = v_title
   where id = p_booking_id;

  foreach v_court in array v_plaetze loop
    continue when v_court = v_platz;
    insert into public.bookings (court_id, slot, kind, booking_type_id, title, created_by)
    values (v_court, tstzrange(p_von, p_bis, '[)'), 'blocking', v_type.id, v_title, v_me);
    v_created := v_created + 1;
  end loop;

  return query select v_created, v_displaced;
end; $$;

revoke execute on function
  public.update_blocking(uuid, uuid[], timestamptz, timestamptz, text, text, boolean)
  from public, anon;
grant execute on function
  public.update_blocking(uuid, uuid[], timestamptz, timestamptz, text, text, boolean)
  to authenticated;
