-- ===========================================================================
-- Forderungen entstehen
--
-- Bis hierher konnte die App kein Geld verlangen. Es gab eine Vorschau auf den
-- Beitragslauf (fee_run_preview), aber keine Funktion, die daraus Forderungen
-- macht. Die Getraenke schrieben in billing_periods, aber kein Monat wurde je
-- geschlossen - "am Monatsende wird zusammengezaehlt" passierte nie.
--
-- Und die Grundlage fehlte ganz: auf fee_types und fee_prices liegt nur
-- "grant select". Beitragsarten und Preise liessen sich ueberhaupt nicht
-- pflegen, ein Beitragslauf waere an fehlenden Preisen gescheitert.
--
-- Diese Migration baut die erste Haelfte der Kette:
--
--   Forderung entsteht -> [Vorabankuendigung] -> [Lastschriftlauf] -> [Datei]
--   ^^^^^^^^^^^^^^^^^^
--
-- Die Idempotenz traegt der vorhandene Teilindex
-- charges_one_per_member_kind_period: ein zweiter Beitragslauf kann keine
-- doppelte Forderung erzeugen, egal wie oft jemand auf den Knopf drueckt.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Beitragsarten und Preise
-- ---------------------------------------------------------------------------

/**
 * Eine Beitragsart anlegen oder aendern.
 *
 * Der Code bleibt nach dem Anlegen fest - er steht in member_fees und in
 * Auswertungen. Wer ihn aendern will, legt eine neue Art an und stellt die
 * alte still, genau wie bei den Buchungsarten.
 */
create or replace function public.upsert_fee_type(
  p_id uuid, p_code text, p_name text,
  p_description text default null, p_sort_order integer default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_pos integer;
begin
  if not private.is_admin() then
    raise exception 'Beitragsarten pflegen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Der Name ist Pflicht.' using errcode = 'invalid_parameter_value';
  end if;
  if p_id is null and btrim(coalesce(p_code, '')) = '' then
    raise exception 'Der Code ist Pflicht.' using errcode = 'invalid_parameter_value';
  end if;

  if p_id is null then
    select coalesce(max(sort_order), 0) + 1 into v_pos from public.fee_types;
    insert into public.fee_types (code, name, description, sort_order)
    values (btrim(p_code), btrim(p_name),
            nullif(btrim(coalesce(p_description, '')), ''),
            coalesce(p_sort_order, v_pos))
    returning id into v_id;
  else
    -- Der Code wird bewusst nicht mitgeaendert.
    update public.fee_types
       set name = btrim(p_name),
           description = nullif(btrim(coalesce(p_description, '')), ''),
           sort_order = coalesce(p_sort_order, sort_order)
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Diese Beitragsart gibt es nicht.' using errcode = 'no_data_found';
    end if;
  end if;

  return v_id;
exception when unique_violation then
  raise exception 'Eine Beitragsart mit diesem Code gibt es schon.'
    using errcode = 'unique_violation';
end; $$;

revoke execute on function public.upsert_fee_type(uuid, text, text, text, integer)
  from public, anon;
grant execute on function public.upsert_fee_type(uuid, text, text, text, integer)
  to authenticated;

/**
 * Den Preis einer Beitragsart ab einem Jahr setzen.
 *
 * Rueckwirkend gilt dieselbe Regel wie bei den Getraenkepreisen, nur mit
 * anderem Grund: hier gibt es keine eingefrorene Kopie an der Buchung. Wurden
 * fuer das Jahr schon Forderungen erzeugt, wuerde eine Preisaenderung die
 * Historie und die tatsaechlich gestellten Betraege auseinanderlaufen lassen.
 * Wer sich vertan hat, erlaesst die Forderungen und laesst den Lauf neu
 * durchgehen.
 */
create or replace function public.set_fee_price(
  p_fee_type_id uuid, p_valid_from_year integer, p_amount_cents integer
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Beitragsarten pflegen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.fee_types where id = p_fee_type_id) then
    raise exception 'Diese Beitragsart gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if p_amount_cents is null or p_amount_cents < 0 or p_amount_cents > 500000 then
    raise exception 'Der Betrag muss zwischen 0,00 und 5000,00 Euro liegen.'
      using errcode = 'invalid_parameter_value';
  end if;

  if exists (
    select 1 from public.charges
     where kind = 'fee' and period_label = p_valid_from_year::text and status <> 'waived'
  ) then
    raise exception
      'Fuer % wurden bereits Forderungen erzeugt. Ein Preis fuer dieses Jahr laesst sich nicht mehr aendern.',
      p_valid_from_year using errcode = 'invalid_parameter_value';
  end if;

  insert into public.fee_prices (fee_type_id, valid_from_year, amount_cents)
  values (p_fee_type_id, p_valid_from_year, p_amount_cents)
  on conflict (fee_type_id, valid_from_year) do update
    set amount_cents = excluded.amount_cents;
end; $$;

revoke execute on function public.set_fee_price(uuid, integer, integer) from public, anon;
grant  execute on function public.set_fee_price(uuid, integer, integer) to authenticated;

/**
 * Eine Beitragsart stilllegen oder wieder anbieten.
 *
 * Kein Loeschen: member_fees verweist mit "on delete restrict" darauf, und die
 * Zuordnungen vergangener Jahre muessen lesbar bleiben.
 *
 * Rueckgabe: wie viele Mitglieder die Art im laufenden Jahr zugewiesen haben -
 * die Zahl, die der Vorstand vor dem Stilllegen wissen will.
 */
create or replace function public.set_fee_type_active(p_id uuid, p_active boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_jahr integer := extract(year from (now() at time zone 'Europe/Berlin'))::integer;
        v_anzahl integer;
begin
  if not private.is_admin() then
    raise exception 'Beitragsarten pflegen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.fee_types set active = coalesce(p_active, true) where id = p_id;
  if not found then
    raise exception 'Diese Beitragsart gibt es nicht.' using errcode = 'no_data_found';
  end if;

  select count(*)::integer into v_anzahl
  from public.member_fees where fee_type_id = p_id and year = v_jahr;

  return v_anzahl;
end; $$;

revoke execute on function public.set_fee_type_active(uuid, boolean) from public, anon;
grant  execute on function public.set_fee_type_active(uuid, boolean) to authenticated;

/**
 * Die Beitragsarten mit Preis, Folgejahrespreis und Verbreitung.
 *
 * Der Preis des Folgejahrs gehoert dazu: eine beschlossene Erhoehung ist sonst
 * bis zum Jahreswechsel unsichtbar - und wird ein zweites Mal eingetragen.
 * Die Soll-Stunden stehen mit in der Zeile, weil work_duty_rules an der
 * Beitragsart haengt und beides zusammen gepflegt wird.
 */
create or replace function public.fee_type_overview(p_year integer default null)
returns table (
  id uuid, code text, name text, description text, active boolean, sort_order integer,
  preis_cents integer, preis_ab_jahr integer,
  naechster_preis_cents integer, naechster_preis_ab_jahr integer,
  mitglieder integer, soll_stunden numeric
)
language sql stable security definer set search_path = '' as $$
  with jahr as (
    select coalesce(p_year, extract(year from (now() at time zone 'Europe/Berlin'))::integer) as j
  )
  select
    f.id, f.code, f.name, f.description, f.active, f.sort_order,
    aktuell.amount_cents, aktuell.valid_from_year,
    naechst.amount_cents, naechst.valid_from_year,
    (select count(*)::integer from public.member_fees mf
      where mf.fee_type_id = f.id and mf.year = (select j from jahr)),
    (select r.required_hours from public.work_duty_rules r
      where r.fee_type_id = f.id and r.year = (select j from jahr))
  from public.fee_types f
  left join lateral (
    select p.amount_cents, p.valid_from_year from public.fee_prices p
    where p.fee_type_id = f.id and p.valid_from_year <= (select j from jahr)
    order by p.valid_from_year desc limit 1
  ) aktuell on true
  left join lateral (
    select p.amount_cents, p.valid_from_year from public.fee_prices p
    where p.fee_type_id = f.id and p.valid_from_year > (select j from jahr)
    order by p.valid_from_year limit 1
  ) naechst on true
  where private.is_admin()
  order by f.sort_order, f.name;
$$;

revoke execute on function public.fee_type_overview(integer) from public, anon;
grant  execute on function public.fee_type_overview(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Der Beitragslauf
-- ---------------------------------------------------------------------------

/**
 * Aus der Vorschau werden Forderungen.
 *
 * Eine Forderung je Mitglied und Jahr, summiert ueber alle Beitragsarten - so
 * rechnet fee_run_preview schon, und der Teilindex auf charges laesst nichts
 * anderes zu. Der Zahler ist billing_payer_id, sonst das Mitglied selbst.
 *
 * Fehlt zu einer zugewiesenen Beitragsart der Preis fuer das Jahr, bricht der
 * GANZE Lauf ab. Ein Teilergebnis waere hier gefaehrlicher als ein Fehler:
 * wer nicht in der Datei steht, faellt niemandem auf, und das Mitglied waere
 * stillschweigend beitragsfrei gestellt. Dieselbe Entscheidung wie in
 * feeLinesForMember.
 *
 * Mitglieder ohne Mandat bekommen ihre Forderung trotzdem - sie zahlen per
 * Ueberweisung, und ohne Forderung wuesste niemand, dass sie noch offen sind.
 */
create or replace function public.fee_run_execute(
  p_year integer, p_due_date date default null
)
returns table (erzeugt integer, uebersprungen integer, summe_cents integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_faellig date := p_due_date;
  v_fehlend text;
  v_erzeugt integer;
  v_summe integer;
  v_gesamt integer;
begin
  if not private.is_admin() then
    raise exception 'Den Beitragslauf starten duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_year is null or p_year < 1970 or p_year > 2200 then
    raise exception 'Das Jahr ist ungueltig.' using errcode = 'invalid_parameter_value';
  end if;

  if v_faellig is null then
    v_faellig := make_date(p_year,
                           public.setting_int('fees.annual_run_month'),
                           public.setting_int('fees.annual_run_day'));
  end if;

  -- Erst pruefen, dann schreiben: eine Beitragsart ohne Preis darf nicht als
  -- 0 Euro durchrutschen.
  select string_agg(distinct ft.name, ', ' order by ft.name) into v_fehlend
  from public.members m
  join public.member_fees mf on mf.member_id = m.id and mf.year = p_year
  join public.fee_types ft on ft.id = mf.fee_type_id
  where m.status = 'active'
    and mf.override_amount_cents is null
    and not exists (
      select 1 from public.fee_prices fp
      where fp.fee_type_id = mf.fee_type_id and fp.valid_from_year <= p_year
    );

  if v_fehlend is not null then
    raise exception
      'Fuer diese Beitragsarten fehlt ein Preis fuer %: %. Der Lauf wurde nicht gestartet.',
      p_year, v_fehlend using errcode = 'invalid_parameter_value';
  end if;

  with soll as (
    select m.id as member_id,
           coalesce(m.billing_payer_id, m.id) as payer_id,
           sum(coalesce(mf.override_amount_cents, fp.amount_cents))::integer as betrag,
           string_agg(ft.name, ', ' order by ft.name) as arten
    from public.members m
    join public.member_fees mf on mf.member_id = m.id and mf.year = p_year
    join public.fee_types ft on ft.id = mf.fee_type_id
    left join lateral (
      select fpx.amount_cents from public.fee_prices fpx
      where fpx.fee_type_id = mf.fee_type_id and fpx.valid_from_year <= p_year
      order by fpx.valid_from_year desc limit 1
    ) fp on true
    where m.status = 'active'
    group by m.id, m.billing_payer_id
  ), neu as (
    insert into public.charges
      (member_id, payer_id, kind, period_label, amount_cents, description, due_date)
    select s.member_id, s.payer_id, 'fee', p_year::text, s.betrag,
           'Mitgliedsbeitrag ' || p_year || ' (' || s.arten || ')', v_faellig
    from soll s
    where s.betrag > 0
    on conflict do nothing
    returning amount_cents
  )
  select count(*)::integer, coalesce(sum(amount_cents), 0)::integer
    into v_erzeugt, v_summe
  from neu;

  -- Wie viele haetten eine Forderung bekommen koennen. Die Differenz sind die,
  -- die schon eine hatten - beim zweiten Lauf also alle.
  select count(*)::integer into v_gesamt
  from (
    select m.id
    from public.members m
    join public.member_fees mf on mf.member_id = m.id and mf.year = p_year
    where m.status = 'active'
    group by m.id
    having sum(coalesce(mf.override_amount_cents, (
      select fpx.amount_cents from public.fee_prices fpx
      where fpx.fee_type_id = mf.fee_type_id and fpx.valid_from_year <= p_year
      order by fpx.valid_from_year desc limit 1
    ))) > 0
  ) x;

  return query select v_erzeugt, v_gesamt - v_erzeugt, v_summe;
end; $$;

revoke execute on function public.fee_run_execute(integer, date) from public, anon;
grant  execute on function public.fee_run_execute(integer, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Der Getraenkemonat
-- ---------------------------------------------------------------------------

/**
 * Einen Monat schliessen.
 *
 * Ab jetzt greift guard_closed_billing_period: keine Buchung dieses Zeitraums
 * kann mehr entstehen, sich aendern oder verschwinden. Genau das ist der Sinn -
 * der Betrag muss feststehen, bevor er angekuendigt wird.
 *
 * Der laufende Monat laesst sich nicht schliessen, sonst waere der Rest des
 * Monats an der Theke unbuchbar.
 */
create or replace function public.close_billing_period(p_year integer, p_month integer)
returns table (buchungen integer, mitglieder integer, summe_cents integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_heute date := (now() at time zone 'Europe/Berlin')::date;
  v_id uuid;
  v_status public.billing_period_status;
begin
  if not private.is_admin() then
    raise exception 'Abrechnungszeitraeume schliessen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if make_date(p_year, p_month, 1) >= date_trunc('month', v_heute)::date then
    raise exception
      'Der laufende Monat laesst sich nicht schliessen. Danach koennte an der Theke nichts mehr gebucht werden.'
      using errcode = 'invalid_parameter_value';
  end if;

  select id, status into v_id, v_status
  from public.billing_periods where year = p_year and month = p_month;

  if v_id is null then
    raise exception 'Fuer diesen Monat gibt es keinen Abrechnungszeitraum.'
      using errcode = 'no_data_found';
  end if;
  if v_status <> 'open' then
    raise exception 'Dieser Monat ist bereits geschlossen.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.billing_periods
     set status = 'closed', closed_at = now(), closed_by = private.current_member_id()
   where id = v_id;

  return query
    select count(*)::integer,
           count(distinct p.member_id)::integer,
           coalesce(sum(p.total_cents), 0)::integer
    from public.drink_purchases p
    where p.billing_period_id = v_id and p.voided_at is null;
end; $$;

revoke execute on function public.close_billing_period(integer, integer) from public, anon;
grant  execute on function public.close_billing_period(integer, integer) to authenticated;

/**
 * Aus einem geschlossenen Monat werden Forderungen.
 *
 * Eine je Mitglied mit Entnahmen, unabhaengig vom Betrag. Der Mindestbetrag
 * aus drinks.min_debit_cents wirkt bewusst NICHT hier, sondern erst bei der
 * Auswahl im Lastschriftlauf - und dort je Zahler. Sonst wuerde eine Familie
 * mit drei Kindern zu je 3 Euro nie eingezogen, obwohl neun Euro zusammen-
 * kommen. Eine kleine Forderung bleibt einfach offen stehen und geht im
 * Folgemonat mit; das ist der "Vortrag", ohne eine einzige Buchung zwischen
 * Zeitraeumen zu verschieben - was guard_closed_billing_period ohnehin
 * verboete.
 */
create or replace function public.charge_billing_period(
  p_year integer, p_month integer, p_due_date date default null
)
returns table (erzeugt integer, summe_cents integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_status public.billing_period_status;
  v_label text := p_year || '-' || lpad(p_month::text, 2, '0');
  v_erzeugt integer;
  v_summe integer;
begin
  if not private.is_admin() then
    raise exception 'Getraenke abrechnen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select id, status into v_id, v_status
  from public.billing_periods where year = p_year and month = p_month;

  if v_id is null then
    raise exception 'Fuer diesen Monat gibt es keinen Abrechnungszeitraum.'
      using errcode = 'no_data_found';
  end if;
  if v_status = 'open' then
    raise exception
      'Der Monat muss erst geschlossen werden. Solange er offen ist, kann sich die Summe noch aendern.'
      using errcode = 'invalid_parameter_value';
  end if;

  with summe as (
    select p.member_id,
           coalesce(m.billing_payer_id, m.id) as payer_id,
           sum(p.total_cents)::integer as betrag,
           count(*)::integer as posten
    from public.drink_purchases p
    join public.members m on m.id = p.member_id
    where p.billing_period_id = v_id and p.voided_at is null
    group by p.member_id, m.billing_payer_id, m.id
  ), neu as (
    insert into public.charges
      (member_id, payer_id, kind, period_label, amount_cents, description, due_date)
    select s.member_id, s.payer_id, 'drinks', v_label, s.betrag,
           'Getraenke ' || v_label || ' (' || s.posten || ' Entnahmen)', p_due_date
    from summe s
    where s.betrag > 0
    on conflict do nothing
    returning amount_cents
  )
  select count(*)::integer, coalesce(sum(amount_cents), 0)::integer
    into v_erzeugt, v_summe
  from neu;

  update public.billing_periods
     set status = 'charged', charged_at = now()
   where id = v_id and status = 'closed';

  return query select v_erzeugt, v_summe;
end; $$;

revoke execute on function public.charge_billing_period(integer, integer, date)
  from public, anon;
grant execute on function public.charge_billing_period(integer, integer, date)
  to authenticated;

/** Die letzten Monate mit Stand, Summe und erzeugten Forderungen. */
create or replace function public.billing_period_overview(p_limit integer default 12)
returns table (
  id uuid, year integer, month integer, status public.billing_period_status,
  buchungen integer, mitglieder integer, summe_cents integer,
  forderungen integer, closed_at timestamptz, charged_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    b.id, b.year, b.month, b.status,
    (select count(*)::integer from public.drink_purchases p
      where p.billing_period_id = b.id and p.voided_at is null),
    (select count(distinct p.member_id)::integer from public.drink_purchases p
      where p.billing_period_id = b.id and p.voided_at is null),
    (select coalesce(sum(p.total_cents), 0)::integer from public.drink_purchases p
      where p.billing_period_id = b.id and p.voided_at is null),
    (select count(*)::integer from public.charges c
      where c.kind = 'drinks' and c.status <> 'waived'
        and c.period_label = b.year || '-' || lpad(b.month::text, 2, '0')),
    b.closed_at, b.charged_at
  from public.billing_periods b
  where private.is_admin()
  order by b.year desc, b.month desc
  limit greatest(coalesce(p_limit, 12), 1);
$$;

revoke execute on function public.billing_period_overview(integer) from public, anon;
grant  execute on function public.billing_period_overview(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Forderungen einzeln
-- ---------------------------------------------------------------------------

/** Alle Forderungen mit Zahler, wahlweise nach Stand und Art gefiltert. */
create or replace function public.charge_overview(
  p_status public.charge_status default null,
  p_kind public.charge_kind default null,
  p_limit integer default 500
)
returns table (
  id uuid, member_id uuid, member_name text, payer_id uuid, payer_name text,
  kind public.charge_kind, period_label text, amount_cents integer,
  description text, status public.charge_status, due_date date,
  notified_at timestamptz, created_at timestamptz, hat_mandat boolean
)
language sql stable security definer set search_path = '' as $$
  select
    c.id, c.member_id,
    btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')),
    c.payer_id,
    btrim(coalesce(z.first_name, '') || ' ' || coalesce(z.last_name, '')),
    c.kind, c.period_label, c.amount_cents, c.description, c.status,
    c.due_date, c.notified_at, c.created_at,
    exists (select 1 from public.sepa_mandates sm
             where sm.member_id = c.payer_id and sm.status = 'active')
  from public.charges c
  join public.members m on m.id = c.member_id
  join public.members z on z.id = c.payer_id
  where private.is_admin()
    and (p_status is null or c.status = p_status)
    and (p_kind is null or c.kind = p_kind)
  order by c.created_at desc, m.last_name
  limit greatest(coalesce(p_limit, 500), 1);
$$;

revoke execute on function public.charge_overview(public.charge_status, public.charge_kind, integer)
  from public, anon;
grant execute on function public.charge_overview(public.charge_status, public.charge_kind, integer)
  to authenticated;

/**
 * Eine Forderung von Hand anlegen.
 *
 * Fuer alles, was kein Lauf erzeugt: eine weiterberechnete Ruecklastschrift-
 * gebuehr, ein Schluessel, eine Vereinbarung im Einzelfall.
 */
create or replace function public.create_manual_charge(
  p_member_id uuid, p_kind public.charge_kind, p_amount_cents integer,
  p_description text, p_period_label text default null, p_due_date date default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_payer uuid; v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Forderungen anlegen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Der Betrag muss groesser als null sein.'
      using errcode = 'invalid_parameter_value';
  end if;
  if btrim(coalesce(p_description, '')) = '' then
    raise exception 'Ohne Beschreibung weiss spaeter niemand mehr, wofuer die Forderung war.'
      using errcode = 'invalid_parameter_value';
  end if;

  select coalesce(billing_payer_id, id) into v_payer
  from public.members where id = p_member_id;
  if v_payer is null then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  insert into public.charges
    (member_id, payer_id, kind, period_label, amount_cents, description, due_date)
  values (p_member_id, v_payer, p_kind, nullif(btrim(coalesce(p_period_label, '')), ''),
          p_amount_cents, btrim(p_description), p_due_date)
  returning id into v_id;

  return v_id;
exception when unique_violation then
  raise exception 'Fuer diesen Zeitraum gibt es bereits eine Forderung dieser Art.'
    using errcode = 'unique_violation';
end; $$;

revoke execute on function public.create_manual_charge(
  uuid, public.charge_kind, integer, text, text, date) from public, anon;
grant execute on function public.create_manual_charge(
  uuid, public.charge_kind, integer, text, text, date) to authenticated;

/**
 * Eine Forderung erlassen.
 *
 * Kein Loeschen: die Forderung ist entstanden und soll nachvollziehbar
 * bleiben. "waived" nimmt sie aus jeder Auswahl und gibt zugleich den
 * Idempotenz-Index frei, sodass ein korrigierter Lauf sie neu erzeugen kann.
 * Der Grund wandert in die Beschreibung - er ist die einzige Erklaerung, die
 * spaeter noch da ist.
 */
create or replace function public.waive_charge(p_charge_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status public.charge_status;
begin
  if not private.is_admin() then
    raise exception 'Forderungen erlassen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Bitte einen Grund angeben.' using errcode = 'invalid_parameter_value';
  end if;

  select status into v_status from public.charges where id = p_charge_id;
  if v_status is null then
    raise exception 'Diese Forderung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status = 'submitted' then
    raise exception
      'Diese Forderung steckt in einem eingereichten Lastschriftlauf und laesst sich nicht erlassen.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.charges
     set status = 'waived',
         description = description || ' [erlassen: ' || btrim(p_reason) || ']'
   where id = p_charge_id;
end; $$;

revoke execute on function public.waive_charge(uuid, text) from public, anon;
grant  execute on function public.waive_charge(uuid, text) to authenticated;

/**
 * Eine Forderung als bezahlt abhaken.
 *
 * Der Weg fuer Ueberweiser. Ohne ihn haetten Mitglieder ohne Mandat eine ewig
 * offene Forderung, und niemand koennte sehen, wer tatsaechlich noch schuldet.
 */
create or replace function public.settle_charge_manually(
  p_charge_id uuid, p_note text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status public.charge_status;
begin
  if not private.is_admin() then
    raise exception 'Forderungen abhaken duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from public.charges where id = p_charge_id;
  if v_status is null then
    raise exception 'Diese Forderung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status = 'settled' then
    raise exception 'Diese Forderung ist bereits als bezahlt vermerkt.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.charges
     set status = 'settled',
         description = description ||
           coalesce(' [' || nullif(btrim(coalesce(p_note, '')), '') || ']', '')
   where id = p_charge_id;
end; $$;

revoke execute on function public.settle_charge_manually(uuid, text) from public, anon;
grant  execute on function public.settle_charge_manually(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Praezisierung eines Einstellungstextes
--
-- "Betraege darunter werden nicht eingezogen, sondern vorgetragen" stimmt,
-- beschreibt aber nicht, wo die Schwelle wirkt. Sie wirkt beim Einzug und je
-- Zahler, nicht beim Erzeugen der Forderung. Der Unterschied ist der zwischen
-- "die Familie wird nie eingezogen" und "sie wird zusammengezaehlt".
--
-- Der Text steht an zwei Stellen: in ensure_default_settings fuer neue
-- Umgebungen und im Bestand fuer die bestehende. ensure_default_settings
-- schreibt mit "on conflict do nothing" und wuerde einen vorhandenen Wert
-- nicht anfassen - deshalb das Update darunter.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_default_settings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before integer;
  v_after  integer;
begin
  select count(*) into v_before from public.settings;

  insert into public.settings (key, value, value_type, label, description) values
    ('booking.max_open_bookings', '0'::jsonb, 'integer', 'Maximale offene Buchungen',
     'Wie viele kuenftige Buchungen ein Mitglied gleichzeitig haben darf. '
     'Mitspieler zaehlen mit. 0 bedeutet unbegrenzt.'),
    ('booking.lead_days', '7'::jsonb, 'integer', 'Buchungsvorlauf in Tagen',
     'Rollierend: buchbar ist alles innerhalb der naechsten X Tage.'),
    ('booking.opening_time', '"08:00"'::jsonb, 'time', 'Oeffnungszeit',
     'Frueheste Startzeit einer Buchung.'),
    ('booking.closing_time', '"21:00"'::jsonb, 'time', 'Schliesszeit',
     'Spaeteste Endzeit einer Buchung.'),
    ('booking.slot_minutes', '30'::jsonb, 'integer', 'Raster in Minuten',
     'Startzeiten muessen auf dieses Raster fallen (30 = :00 und :30).'),
    ('booking.display_minutes', '60'::jsonb, 'integer', 'Raster der Plananzeige',
     'In welchen Schritten der Belegungsplan Zeilen zeigt. Gebucht wird im '
     'feineren Raster aus booking.slot_minutes.'),
    ('booking.guest_fee_cents', '1000'::jsonb, 'integer', 'Gastgebuehr in Cent',
     '0 = keine Gebuehr. Sonst wird sie je Gast dem buchenden Mitglied '
     'berechnet und mit der naechsten Lastschrift eingezogen.'),
    ('notifications.mail_kinds',
     '"booking_displaced,booking_cancelled,booking_removed,application_new"'::jsonb,
     'text', 'Benachrichtigungen, die auch per E-Mail gehen',
     'Kommagetrennte Liste. Wer bei "E-Mails zu Buchungen" auf "Alle" steht, '
     'bekommt jede Art; alle anderen nur diese hier.'),
    ('drinks.min_debit_cents', '500'::jsonb, 'integer', 'Mindestbetrag Lastschrift',
     'Betraege darunter werden nicht eingezogen, sondern beim naechsten Lauf '
     'mitgenommen. Die Schwelle gilt je Zahler ueber alle offenen Forderungen.'),
    ('drinks.void_window_minutes', '15'::jsonb, 'integer', 'Storno-Fenster Getraenke',
     'So lange darf ein Mitglied eine eigene Fehlbuchung selbst zuruecknehmen.'),
    ('sepa.creditor_id', '""'::jsonb, 'text', 'Glaeubiger-Identifikationsnummer',
     'Aus dem eBuSy-Backend uebernehmen. Muss unveraendert bleiben, damit die '
     'Bestandsmandate gueltig bleiben.'),
    ('sepa.pain_version', '"pain.008.001.08"'::jsonb, 'text', 'Format der Lastschriftdatei',
     'Mit der Hausbank abklaeren.'),
    ('sepa.prenotification_days', '14'::jsonb, 'integer', 'Vorabankuendigung in Tagen',
     'Pflicht vor jedem Einzug.'),
    ('sepa.creditor_name', '"TC Muckensturm e.V."'::jsonb, 'text', 'Name des Zahlungsempfaengers',
     'Erscheint auf dem Kontoauszug der Mitglieder.'),
    ('fees.annual_run_month', '1'::jsonb, 'integer', 'Monat des Beitragslaufs',
     'Der Lauf wird trotzdem manuell gestartet.'),
    ('fees.annual_run_day', '15'::jsonb, 'integer', 'Tag des Beitragslaufs',
     'Faelligkeitsdatum der Jahresbeitrags-Lastschrift.'),
    ('work_duty.hourly_rate_cents', '1500'::jsonb, 'integer', 'Stundensatz Arbeitsdienst',
     'Womit nicht geleistete Stunden zum Jahresende abgerechnet werden. Platzhalter.'),
    ('privacy.change_log_days', '1095'::jsonb, 'integer',
     'Aufbewahrung des Aenderungsprotokolls in Tagen',
     'Aeltere Eintraege werden beim Aufraeumlauf entfernt. 1095 Tage sind drei Jahre.')
  on conflict (key) do nothing;

  select count(*) into v_after from public.settings;
  return v_after - v_before;
end;
$$;

revoke execute on function public.ensure_default_settings() from public, anon, authenticated;

select public.ensure_default_settings();

update public.settings
   set description =
     'Betraege darunter werden nicht eingezogen, sondern beim naechsten Lauf '
     'mitgenommen. Die Schwelle gilt je Zahler ueber alle offenen Forderungen.'
 where key = 'drinks.min_debit_cents';
