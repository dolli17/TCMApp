-- ===========================================================================
-- Arbeitsdienst
--
-- Drei Tabellen und eine getestete Rechenlogik in packages/core/src/workDuty.ts
-- liegen seit dem ersten Tag bereit, und es gibt genau eine lesende Funktion.
-- Niemand konnte je eine geleistete Stunde eintragen - der Stand jedes
-- Mitglieds stand dauerhaft auf null, und der Jahresausgleich, den das
-- Datenmodell vorsieht, war unerreichbar.
--
-- Nur der Vorstand traegt ein. Das steht schon im Kommentar der Tabelle ("Das
-- Mitglied sieht seinen Stand, kann ihn aber nicht selbst hochsetzen") und ist
-- ein Ablauf statt zwei: eine Selbstmeldung braucht eine Bestaetigungsliste,
-- und was dort liegen bleibt, zaehlt nicht - completedHoursFor zaehlt
-- ausschliesslich bestaetigte Stunden. Die Bestaetigungsfelder bleiben im
-- Schema, damit eine spaetere Selbstmeldung nichts umbauen muss.
--
-- Der Jahresausgleich friert alles ein, was in die Rechnung eingeht: Soll,
-- Ist und Stundensatz. Eine spaetere Aenderung der Regeln oder des Satzes darf
-- ein abgeschlossenes Jahr nicht umschreiben - dafuer ist
-- work_duty_settlements gebaut.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Kein Weg an den RPCs vorbei
--
-- Auf work_duty_entries lagen direkte Schreibrechte. Damit haette die
-- Oberflaeche an jeder Pruefung vorbei eintragen koennen - auch fuer ein Jahr,
-- das laengst abgerechnet ist.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.work_duty_entries from authenticated;

/**
 * Stunden als deutscher Text: 8.00 -> "8", 2.50 -> "2,5".
 *
 * numeric(6,2) schreibt sich als "8.00" - mit Punkt und zwei Nullen. In einer
 * Forderung, die das Mitglied liest, steht "8 von 8 Stunden", nicht
 * "8.00 von 8.00".
 */
create or replace function private.stunden_text(p_stunden numeric)
returns text language sql immutable set search_path = '' as $$
  -- rtrim vor dem Ersetzen: FM laesst bei glatten Werten den Trenner stehen,
  -- aus "8.00" wird sonst "8," statt "8".
  select replace(rtrim(trim(to_char(coalesce(p_stunden, 0), 'FM999990.99')), '.'), '.', ',');
$$;

-- ---------------------------------------------------------------------------
-- Die Regeln
-- ---------------------------------------------------------------------------

/**
 * Wie viele Stunden schuldet eine Beitragsart in diesem Jahr?
 *
 * Hat ein Mitglied mehrere Arten, zaehlt spaeter die hoechste - nicht die
 * Summe. Sonst muesste jemand mit Beitrag plus Schluesselpfand doppelt
 * arbeiten. Dieselbe Regel wie in requiredHoursFor.
 */
create or replace function public.upsert_work_duty_rule(
  p_fee_type_id uuid, p_year integer, p_required_hours numeric
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Arbeitsdienst-Regeln pflegen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.fee_types where id = p_fee_type_id) then
    raise exception 'Diese Beitragsart gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if p_required_hours is null or p_required_hours < 0 or p_required_hours > 200 then
    raise exception 'Die Stundenzahl muss zwischen 0 und 200 liegen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.work_duty_settlements where year = p_year) then
    raise exception
      'Fuer % ist der Arbeitsdienst bereits abgerechnet. Die Regeln lassen sich nicht mehr aendern.',
      p_year using errcode = 'invalid_parameter_value';
  end if;

  insert into public.work_duty_rules (fee_type_id, year, required_hours)
  values (p_fee_type_id, p_year, p_required_hours)
  on conflict (fee_type_id, year) do update
    set required_hours = excluded.required_hours;
end; $$;

revoke execute on function public.upsert_work_duty_rule(uuid, integer, numeric)
  from public, anon;
grant execute on function public.upsert_work_duty_rule(uuid, integer, numeric)
  to authenticated;

create or replace function public.remove_work_duty_rule(p_fee_type_id uuid, p_year integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Arbeitsdienst-Regeln pflegen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.work_duty_settlements where year = p_year) then
    raise exception
      'Fuer % ist der Arbeitsdienst bereits abgerechnet. Die Regeln lassen sich nicht mehr aendern.',
      p_year using errcode = 'invalid_parameter_value';
  end if;

  delete from public.work_duty_rules
   where fee_type_id = p_fee_type_id and year = p_year;
end; $$;

revoke execute on function public.remove_work_duty_rule(uuid, integer) from public, anon;
grant  execute on function public.remove_work_duty_rule(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Geleistete Stunden
-- ---------------------------------------------------------------------------

/**
 * Einen Einsatz eintragen.
 *
 * Das Jahr kommt aus dem Einsatztag und ist kein Parameter: sonst landet der
 * Platzaufbau vom 30. Dezember im Januar unter dem falschen Jahr, und das
 * faellt erst bei der Abrechnung auf.
 *
 * Eingetragen gilt als bestaetigt - der Vorstand traegt ein, was er gesehen
 * hat. Die Bestaetigungsfelder werden trotzdem gefuellt, weil
 * completedHoursFor und my_work_duty ausschliesslich bestaetigte Stunden
 * zaehlen.
 */
create or replace function public.record_work_duty(
  p_member_id uuid, p_hours numeric, p_worked_on date, p_description text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_jahr integer; v_id uuid; v_heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  if not private.is_admin() then
    raise exception 'Arbeitsstunden eintragen darf nur der Vorstand.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_hours is null or p_hours <= 0 or p_hours > 24 then
    raise exception 'Die Stundenzahl muss zwischen 0,25 und 24 liegen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_worked_on is null then
    raise exception 'Ohne Einsatztag laesst sich nichts eintragen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_worked_on > v_heute then
    raise exception 'Ein Einsatz in der Zukunft laesst sich nicht eintragen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  v_jahr := extract(year from p_worked_on)::integer;

  if exists (select 1 from public.work_duty_settlements
              where member_id = p_member_id and year = v_jahr) then
    raise exception
      'Fuer % ist der Arbeitsdienst dieses Mitglieds bereits abgerechnet. Eine Nachmeldung ginge ins Leere.',
      v_jahr using errcode = 'invalid_parameter_value';
  end if;

  insert into public.work_duty_entries
    (member_id, year, hours, worked_on, description,
     confirmed_by, confirmed_at, created_by)
  values (p_member_id, v_jahr, p_hours, p_worked_on,
          nullif(btrim(coalesce(p_description, '')), ''),
          private.current_member_id(), now(), private.current_member_id())
  returning id into v_id;

  return v_id;
end; $$;

revoke execute on function public.record_work_duty(uuid, numeric, date, text)
  from public, anon;
grant execute on function public.record_work_duty(uuid, numeric, date, text)
  to authenticated;

/** Einen Eintrag wieder entfernen - solange das Jahr nicht abgerechnet ist. */
create or replace function public.delete_work_duty(p_entry_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_member uuid; v_jahr integer;
begin
  if not private.is_admin() then
    raise exception 'Arbeitsstunden entfernen darf nur der Vorstand.'
      using errcode = 'insufficient_privilege';
  end if;

  select member_id, year into v_member, v_jahr
  from public.work_duty_entries where id = p_entry_id;

  if v_member is null then
    raise exception 'Diesen Eintrag gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.work_duty_settlements
              where member_id = v_member and year = v_jahr) then
    raise exception
      'Fuer % ist bereits abgerechnet. Der Eintrag steckt in der Abrechnung und bleibt stehen.',
      v_jahr using errcode = 'invalid_parameter_value';
  end if;

  delete from public.work_duty_entries where id = p_entry_id;
end; $$;

revoke execute on function public.delete_work_duty(uuid) from public, anon;
grant  execute on function public.delete_work_duty(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Uebersichten
-- ---------------------------------------------------------------------------

/**
 * Wer schuldet wie viele Stunden?
 *
 * Nur wer tatsaechlich Dienst leistet: eine Regel mit 0 Stunden ist die
 * ausdrueckliche Aussage "diese Beitragsart nicht", und wer nur solche hat,
 * gehoert nicht in eine Liste, die "dienstpflichtig" ueberschrieben ist.
 *
 * Das Soll ist die HOECHSTE Regel ueber alle Beitragsarten, nicht die Summe.
 */
create or replace function public.work_duty_overview(p_year integer default null)
returns table (
  member_id uuid, member_name text, arten text,
  required_hours numeric, completed_hours numeric, missing_hours numeric,
  eintraege integer, betrag_cents integer, abgerechnet boolean
)
language sql stable security definer set search_path = '' as $$
  with jahr as (
    select coalesce(p_year, extract(year from (now() at time zone 'Europe/Berlin'))::integer) as j
  ), satz as (
    select public.setting_int('work_duty.hourly_rate_cents') as cents
  ), soll as (
    select mf.member_id,
           max(wr.required_hours) as h,
           string_agg(distinct ft.name, ', ') as arten
    from public.member_fees mf
    join public.work_duty_rules wr
      on wr.fee_type_id = mf.fee_type_id and wr.year = mf.year
    join public.fee_types ft on ft.id = mf.fee_type_id
    where mf.year = (select j from jahr)
    group by mf.member_id
    having max(wr.required_hours) > 0
  )
  select
    s.member_id,
    btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')),
    s.arten,
    s.h,
    coalesce(ist.h, 0),
    greatest(s.h - coalesce(ist.h, 0), 0),
    coalesce(ist.anzahl, 0),
    round(greatest(s.h - coalesce(ist.h, 0), 0) * (select cents from satz))::integer,
    exists (select 1 from public.work_duty_settlements w
             where w.member_id = s.member_id and w.year = (select j from jahr))
  from soll s
  join public.members m on m.id = s.member_id
  left join lateral (
    select sum(we.hours) as h, count(*)::integer as anzahl
    from public.work_duty_entries we
    where we.member_id = s.member_id and we.year = (select j from jahr)
      and we.confirmed_at is not null
  ) ist on true
  where private.is_admin() and m.status = 'active'
  order by greatest(s.h - coalesce(ist.h, 0), 0) desc, 2;
$$;

revoke execute on function public.work_duty_overview(integer) from public, anon;
grant  execute on function public.work_duty_overview(integer) to authenticated;

/** Die Einsaetze eines Mitglieds - fuer die Detailseite und fuer das Konto. */
create or replace function public.work_duty_entries_for(
  p_member_id uuid, p_year integer default null
)
returns table (
  id uuid, hours numeric, worked_on date, description text,
  bestaetigt boolean, erfasst_von text, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    we.id, we.hours, we.worked_on, we.description,
    we.confirmed_at is not null,
    private.member_label(we.confirmed_by),
    we.created_at
  from public.work_duty_entries we
  where we.member_id = p_member_id
    and (p_year is null or we.year = p_year)
    -- Der Vorstand sieht alle, das Mitglied nur die eigenen.
    and (private.is_admin() or we.member_id = private.current_member_id())
  order by we.worked_on desc;
$$;

revoke execute on function public.work_duty_entries_for(uuid, integer) from public, anon;
grant  execute on function public.work_duty_entries_for(uuid, integer) to authenticated;

/** Die eigenen Einsaetze, ohne die eigene Id zu kennen. */
create or replace function public.my_work_duty_entries(p_year integer default null)
returns table (
  id uuid, hours numeric, worked_on date, description text,
  bestaetigt boolean, erfasst_von text, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select we.id, we.hours, we.worked_on, we.description,
         we.confirmed_at is not null,
         private.member_label(we.confirmed_by),
         we.created_at
  from public.work_duty_entries we
  where we.member_id = private.current_member_id()
    and (p_year is null or we.year = p_year)
  order by we.worked_on desc;
$$;

revoke execute on function public.my_work_duty_entries(integer) from public, anon;
grant  execute on function public.my_work_duty_entries(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Der Jahresausgleich
-- ---------------------------------------------------------------------------

/** Was wuerde die Abrechnung kosten, und wen traefe sie? */
create or replace function public.work_duty_settlement_preview(p_year integer)
returns table (
  member_id uuid, member_name text,
  required_hours numeric, completed_hours numeric, missing_hours numeric,
  hourly_rate_cents integer, amount_cents integer,
  has_mandate boolean, schon_abgerechnet boolean
)
language sql stable security definer set search_path = '' as $$
  select
    o.member_id, o.member_name,
    o.required_hours, o.completed_hours, o.missing_hours,
    public.setting_int('work_duty.hourly_rate_cents'),
    o.betrag_cents,
    exists (select 1 from public.sepa_mandates sm
             join public.members m on m.id = o.member_id
             where sm.member_id = coalesce(m.billing_payer_id, m.id)
               and sm.status = 'active'),
    o.abgerechnet
  from public.work_duty_overview(p_year) o
  order by o.betrag_cents desc, o.member_name;
$$;

revoke execute on function public.work_duty_settlement_preview(integer) from public, anon;
grant  execute on function public.work_duty_settlement_preview(integer) to authenticated;

/**
 * Das Jahr abrechnen.
 *
 * Schreibt je Mitglied eine Zeile - auch bei null fehlenden Stunden. Die ist
 * kein Ballast, sondern zweierlei: der Beleg "geprueft, nichts offen" und die
 * Sperre des Jahres. Ohne sie liesse sich nicht unterscheiden, ob jemand sein
 * Soll erfuellt hat oder ob er schlicht vergessen wurde.
 *
 * Soll, Ist und Stundensatz werden eingefroren. Eine spaetere Aenderung der
 * Regeln oder des Satzes darf ein abgeschlossenes Jahr nicht umschreiben.
 *
 * Nur abgeschlossene Jahre: solange das Jahr laeuft, koennen noch Stunden
 * dazukommen.
 */
create or replace function public.work_duty_settle_year(
  p_year integer, p_due_date date default null
)
returns table (abgerechnet integer, forderungen integer, summe_cents integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_jahr_jetzt integer := extract(year from (now() at time zone 'Europe/Berlin'))::integer;
  v_satz integer := public.setting_int('work_duty.hourly_rate_cents');
  v_zeilen integer;
  v_forderungen integer;
  v_summe integer;
begin
  if not private.is_admin() then
    raise exception 'Den Arbeitsdienst abrechnen darf nur der Vorstand.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_year is null or p_year >= v_jahr_jetzt then
    raise exception
      'Nur ein abgeschlossenes Jahr laesst sich abrechnen. Solange % laeuft, koennen noch Stunden dazukommen.',
      coalesce(p_year, v_jahr_jetzt) using errcode = 'invalid_parameter_value';
  end if;

  with stand as (
    select o.member_id, o.required_hours, o.completed_hours, o.missing_hours,
           o.betrag_cents, coalesce(m.billing_payer_id, m.id) as payer_id
    from public.work_duty_overview(p_year) o
    join public.members m on m.id = o.member_id
    where not o.abgerechnet
  ), forderung as (
    insert into public.charges
      (member_id, payer_id, kind, period_label, amount_cents, description, due_date)
    select s.member_id, s.payer_id, 'work_duty', p_year::text, s.betrag_cents,
           'Arbeitsdienst ' || p_year || ': ' || private.stunden_text(s.missing_hours) ||
           ' von ' || private.stunden_text(s.required_hours) || ' Stunden nicht geleistet',
           p_due_date
    from stand s
    where s.betrag_cents > 0
    on conflict do nothing
    returning id, member_id, amount_cents
  ), abschluss as (
    insert into public.work_duty_settlements
      (member_id, year, required_hours, completed_hours, missing_hours,
       hourly_rate_cents, amount_cents, charge_id, settled_by)
    select s.member_id, p_year, s.required_hours, s.completed_hours, s.missing_hours,
           v_satz, s.betrag_cents, f.id, private.current_member_id()
    from stand s
    left join forderung f on f.member_id = s.member_id
    on conflict (member_id, year) do nothing
    returning amount_cents
  )
  select count(*)::integer,
         count(*) filter (where amount_cents > 0)::integer,
         coalesce(sum(amount_cents), 0)::integer
    into v_zeilen, v_forderungen, v_summe
  from abschluss;

  return query select v_zeilen, v_forderungen, v_summe;
end; $$;

revoke execute on function public.work_duty_settle_year(integer, date) from public, anon;
grant  execute on function public.work_duty_settle_year(integer, date) to authenticated;
