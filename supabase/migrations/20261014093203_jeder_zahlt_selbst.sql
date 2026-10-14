-- ===========================================================================
-- Jeder zahlt selbst
--
-- Bisher konnte ein Mitglied fuer ein anderes zahlen (members.billing_payer_id,
-- Eltern fuer Kinder). Das faellt weg: Jedes Mitglied zahlt fuer sich. Bei
-- Kindern liegt am Kind ein eigenes SEPA-Mandat, dessen Konto den Eltern
-- gehoert - bank_accounts.holder ist dann der Elternteil und steht so auch
-- als Schuldner in der Lastschriftdatei. Drei Kinder einer Familie ergeben
-- drei Lastschriften auf dieselbe IBAN, jede mit eigener Mandatsreferenz.
--
-- Eltern sehen die Daten ihres Kindes nicht mehr. Das Kind sieht sie ueber
-- seinen eigenen Login.
--
-- Abwaertskompatibel: Die Spalte billing_payer_id bleibt vorerst stehen und
-- ist per Check immer leer. Sie faellt in einer spaeteren Migration weg.
-- charges.payer_id bleibt ebenfalls, damit sich die Signaturen von announce_*,
-- debit_* und record_debit_return nicht aendern; er ist kuenftig immer gleich
-- member_id. create_member und accept_membership_application behalten den
-- Parameter p_billing_payer_id und weisen ihn ab, wenn er gesetzt ist.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Zahlerkette und Zuweisung entfernen
--
-- Vor dem Bestand: der Trigger wuerde sonst bei jedem Update mitlaufen.
-- ---------------------------------------------------------------------------
drop trigger if exists members_guard_payer_cycle on public.members;
drop function if exists private.guard_payer_cycle();
drop function if exists public.set_billing_payer(uuid, uuid);
drop function if exists private.zahlerkette_prueft(uuid, uuid);

-- ---------------------------------------------------------------------------
-- Bestand
-- ---------------------------------------------------------------------------
update public.members set billing_payer_id = null where billing_payer_id is not null;

-- Offene Forderungen gehen an das Mitglied selbst. Was schon in einem
-- Lastschriftlauf steckt oder erledigt ist, bleibt, wie es war: dort ist der
-- Zahler Teil des Belegs.
update public.charges c
   set payer_id = c.member_id
 where c.payer_id <> c.member_id
   and c.status in ('open', 'notified')
   and not exists (select 1 from public.debit_items di where di.charge_id = c.id);

alter table public.members
  add constraint members_no_billing_payer check (billing_payer_id is null);

comment on column public.members.billing_payer_id is
  'Veraltet und immer leer: Jedes Mitglied zahlt fuer sich. Faellt in einer spaeteren Migration weg.';

-- ---------------------------------------------------------------------------
-- Sichtrechte: nur noch das eigene Mitglied
--
-- darf_merkmal_setzen, member_finances, member_attributes und die Policies auf
-- Bankverbindungen, Mandaten und Merkmalen laufen ueber diese Funktion mit.
-- ---------------------------------------------------------------------------
create or replace function private.can_view_member(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_member_id = private.current_member_id();
$$;

comment on function private.can_view_member(uuid) is
  'Nur die eigenen Daten. Eltern sehen die Daten ihres Kindes nicht, das Kind hat einen eigenen Login.';

-- Forderungen: nicht mehr ueber payer_id. Alte, schon eingezogene Forderungen
-- eines Kindes tragen noch den Elternteil als Zahler; auch die sieht nur das
-- Kind.
drop policy if exists charges_select on public.charges;
create policy charges_select on public.charges for select to authenticated
  using ((select private.can_view_member(member_id)) or (select private.is_admin()));

create or replace function public.my_charges()
returns table (id uuid, member_name text, kind public.charge_kind, period_label text,
               amount_cents integer, description text, status public.charge_status,
               due_date date, is_for_other boolean)
language sql stable security definer set search_path = '' as $$
  select c.id,
         btrim(coalesce(m.first_name,'') || ' ' || coalesce(m.last_name,'')),
         c.kind, c.period_label, c.amount_cents, c.description, c.status, c.due_date,
         false
  from public.charges c
  join public.members m on m.id = c.member_id
  where c.member_id = private.current_member_id()
  order by c.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Abrechnung: die Forderung geht an das Mitglied selbst
-- ---------------------------------------------------------------------------
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
           m.id as payer_id,
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
    group by m.id
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
           p.member_id as payer_id,
           sum(p.total_cents)::integer as betrag,
           count(*)::integer as posten
    from public.drink_purchases p
    where p.billing_period_id = v_id and p.voided_at is null
    group by p.member_id
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

  select id into v_payer
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

create or replace function public.fee_run_preview(p_year integer)
returns table (member_id uuid, member_name text, payer_name text, fee_types text,
               amount_cents integer, has_mandate boolean, already_charged boolean)
language sql stable security definer set search_path = '' as $$
  select m.id,
         btrim(coalesce(m.first_name,'') || ' ' || coalesce(m.last_name,'')),
         -- payer_name bleibt fuer die Signatur, ist aber immer leer.
         ''::text,
         string_agg(ft.name, ', ' order by ft.name),
         sum(coalesce(mf.override_amount_cents, fp.amount_cents))::integer,
         exists (select 1 from public.sepa_mandates sm
                  where sm.member_id = m.id and sm.status = 'active'),
         exists (select 1 from public.charges c
                  where c.member_id = m.id and c.kind = 'fee'
                    and c.period_label = p_year::text and c.status <> 'waived')
  from public.members m
  join public.member_fees mf on mf.member_id = m.id and mf.year = p_year
  join public.fee_types ft on ft.id = mf.fee_type_id
  left join lateral (
    select fpx.amount_cents from public.fee_prices fpx
    where fpx.fee_type_id = mf.fee_type_id and fpx.valid_from_year <= p_year
    order by fpx.valid_from_year desc limit 1
  ) fp on true
  where m.status = 'active' and private.is_admin()
  group by m.id, m.first_name, m.last_name
  order by 2;
$$;

create or replace function private.sync_guest_charges(
  p_booking_id uuid, p_member_id uuid, p_anzahl integer
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_gebuehr integer := public.setting_int('booking.guest_fee_cents');
  v_ist integer;
  v_payer uuid;
  v_text text;
begin
  if v_gebuehr <= 0 then return; end if;

  select count(*)::integer into v_ist
  from public.charges
  where booking_id = p_booking_id and kind = 'guest' and status = 'open';

  if v_ist = p_anzahl then return; end if;

  if v_ist > p_anzahl then
    delete from public.charges
    where id in (
      select id from public.charges
      where booking_id = p_booking_id and kind = 'guest' and status = 'open'
      order by created_at desc
      limit v_ist - p_anzahl
    );
    return;
  end if;

  -- Jedes Mitglied zahlt selbst.
  v_payer := p_member_id;

  v_text := 'Gastgebuehr ' || private.booking_label(p_booking_id);

  insert into public.charges (member_id, payer_id, kind, amount_cents, description, booking_id)
  select p_member_id, v_payer, 'guest', v_gebuehr, v_text, p_booking_id
  from generate_series(1, p_anzahl - v_ist);
end; $$;

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
             where sm.member_id = o.member_id
               and sm.status = 'active'),
    o.abgerechnet
  from public.work_duty_overview(p_year) o
  order by o.betrag_cents desc, o.member_name;
$$;

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
           o.betrag_cents, o.member_id as payer_id
    from public.work_duty_overview(p_year) o
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

create or replace function public.debit_batch_candidates(
  p_collection_date date,
  p_kinds public.charge_kind[] default null
)
returns table (
  payer_id uuid, payer_name text, charge_ids uuid[], positionen integer,
  arten text, kinds public.charge_kind[], amount_cents integer,
  mandate_id uuid, mandate_reference text,
  einzugsfaehig boolean, grund text
)
language sql stable security definer set search_path = '' as $$
  with frist as (
    select public.setting_int('sepa.prenotification_days') as tage,
           public.setting_int('drinks.min_debit_cents') as mindest
  ), offen as (
    select c.*
    from public.charges c
    where private.is_admin()
      and c.status = 'notified'
      and (p_kinds is null or c.kind = any (p_kinds))
      and not exists (
        select 1 from public.debit_items di
        where di.charge_id = c.id and di.result in ('pending', 'settled')
      )
  ), mit_mandat as (
    -- Je Mitglied gibt es hoechstens ein aktives Mandat; es traegt jede Art.
    select o.*, sm.id as mandat_id, sm.reference, sm.signed_on, sm.last_used_on
    from offen o
    left join lateral (
      select s.* from public.sepa_mandates s
      where s.member_id = o.payer_id and s.status = 'active'
      order by s.signed_on desc
      limit 1
    ) sm on true
  )
  select
    x.payer_id,
    btrim(coalesce(z.first_name, '') || ' ' || coalesce(z.last_name, '')),
    x.charge_ids,
    x.positionen,
    x.arten,
    x.kinds,
    x.betrag,
    x.mandat_id,
    x.reference,
    x.grund is null,
    x.grund
  from (
    select
      m.payer_id,
      array_agg(m.id) as charge_ids,
      count(*)::integer as positionen,
      string_agg(distinct m.description, '; ') as arten,
      array_agg(distinct m.kind order by m.kind) as kinds,
      sum(m.amount_cents)::integer as betrag,
      max(m.mandat_id::text)::uuid as mandat_id,
      max(m.reference) as reference,
      case
        when bool_or(m.mandat_id is null) then
          'Fuer dieses Mitglied ist kein Mandat hinterlegt.'
        when max(m.signed_on) > p_collection_date then
          'Das Mandat ist erst nach dem Faelligkeitstag unterschrieben.'
        when coalesce(max(m.last_used_on), max(m.signed_on)) + interval '36 months'
             < (now() at time zone 'Europe/Berlin')::date then
          'Das Mandat ist seit ueber 36 Monaten ungenutzt und damit erloschen. '
          'Es muss neu eingeholt werden.'
        when p_collection_date < max((m.notified_at at time zone 'Europe/Berlin')::date)
                                 + (select tage from frist) then
          'Die Vorabankuendigung ist noch nicht ' || (select tage from frist) ||
          ' Tage her.'
        when p_collection_date < max(m.due_date) then
          'Angekuendigt war der ' || to_char(max(m.due_date), 'DD.MM.YYYY') ||
          '. Frueher darf nicht eingezogen werden.'
        when sum(m.amount_cents) < (select mindest from frist) then
          'Unter dem Mindestbetrag. Der Betrag geht beim naechsten Lauf mit.'
        else null
      end as grund
    from mit_mandat m
    group by m.payer_id
  ) x
  join public.members z on z.id = x.payer_id
  order by x.grund is null desc, 2;
$$;

-- ---------------------------------------------------------------------------
-- SEPA: Schuldner ist der Kontoinhaber
--
-- Bei Kindern ist das der Elternteil, dem das Konto gehoert. Fehlt der Inhaber,
-- bleibt es beim Namen des Mitglieds.
-- ---------------------------------------------------------------------------
create or replace function public.debit_batch_payload(p_batch_id uuid)
returns table (
  creditor_name text, creditor_id text, creditor_iban text, creditor_bic text,
  collection_date date, pain_version text, title text,
  end_to_end_id text, debtor_name text, debtor_iban text,
  amount_cents integer, remittance_info text, kind public.charge_kind,
  mandate_reference text, mandate_signed_on date, mandate_last_used_on date,
  sequence_type public.mandate_sequence
)
language plpgsql security definer set search_path = '' as $$
declare v_status public.debit_batch_status;
begin
  if not private.is_admin() then
    raise exception 'Lastschriftdateien erzeugen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select b.status into v_status from public.debit_batches b where b.id = p_batch_id;
  if v_status is null then
    raise exception 'Diesen Lastschriftlauf gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'draft' then
    raise exception
      'Dieser Lauf ist bereits erzeugt. Die Datei liegt beim Lauf und laesst sich dort herunterladen.'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.change_log
    (table_name, row_id, action, diff, changed_by, changed_by_auth)
  values ('debit_batches', p_batch_id, 'read',
          jsonb_build_object('_aktion', 'lastschriftdatei_erzeugt'),
          private.current_member_id(), auth.uid());

  return query
    select
      public.setting_text('sepa.creditor_name'),
      public.setting_text('sepa.creditor_id'),
      public.setting_text('sepa.creditor_iban'),
      nullif(public.setting_text('sepa.creditor_bic'), ''),
      b.collection_date,
      public.setting_text('sepa.pain_version'),
      b.title,
      i.end_to_end_id,
      coalesce(nullif(btrim(ba.holder), ''),
               btrim(coalesce(z.first_name, '') || ' ' || coalesce(z.last_name, ''))),
      private.decrypt_iban(ba.iban_encrypted),
      i.amount_cents,
      c.description,
      c.kind,
      i.mandate_reference,
      i.mandate_signed_on,
      -- Aus dem Mandat und nicht aus der Kopie: die 36-Monats-Frist bemisst
      -- sich am heutigen Stand. validateBatch rechnet ohne diesen Wert ab dem
      -- Unterschriftsdatum und haelt dann jedes aeltere Mandat fuer erloschen -
      -- auch eines, das letztes Jahr benutzt wurde.
      sm.last_used_on,
      i.sequence_type
    from public.debit_items i
    join public.debit_batches b   on b.id = i.batch_id
    join public.charges c         on c.id = i.charge_id
    join public.sepa_mandates sm  on sm.id = i.mandate_id
    join public.bank_accounts ba  on ba.id = sm.bank_account_id
    join public.members z         on z.id = c.payer_id
    where i.batch_id = p_batch_id
    order by i.end_to_end_id, c.description;
end; $$;

-- ---------------------------------------------------------------------------
-- Mitglieder anlegen: p_billing_payer_id bleibt in der Signatur, wird aber abgewiesen
-- ---------------------------------------------------------------------------
create or replace function public.create_member(
  p_first_name       text,
  p_last_name        text,
  p_email            text default null,
  p_birthday         date default null,
  p_gender           public.gender default null,
  p_salutation       public.salutation default null,
  p_title            text default null,
  p_phone            text default null,
  p_mobile           text default null,
  p_street           text default null,
  p_postcode         text default null,
  p_city             text default null,
  p_country_code     text default 'DE',
  p_billing_payer_id uuid default null,
  p_notes            text default null,
  p_number           text default null,
  p_started_on       date default null,
  p_fee_type_ids     uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_nummer text;
  v_fee    uuid;
begin
  if not private.is_admin() then
    raise exception 'Mitglieder anlegen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if length(btrim(coalesce(p_first_name, ''))) = 0
     or length(btrim(coalesce(p_last_name, ''))) = 0 then
    raise exception 'Vor- und Nachname sind Pflicht.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_billing_payer_id is not null then
    raise exception 'Jedes Mitglied zahlt selbst. Einen Zahler gibt es nicht mehr.'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.members (
    first_name, last_name, title, gender, salutation, birthday,
    email, phone, mobile, street, postcode, city, country_code,
    notes
  ) values (
    btrim(p_first_name), btrim(p_last_name), nullif(btrim(coalesce(p_title, '')), ''),
    p_gender, p_salutation, p_birthday,
    nullif(lower(btrim(coalesce(p_email, ''))), '')::extensions.citext,
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_mobile, '')), ''),
    nullif(btrim(coalesce(p_street, '')), ''),
    nullif(btrim(coalesce(p_postcode, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    coalesce(nullif(btrim(coalesce(p_country_code, '')), ''), 'DE'),
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_id;

  v_nummer := coalesce(nullif(btrim(coalesce(p_number, '')), ''),
                       private.next_membership_number());

  insert into public.memberships (member_id, number, started_on, status)
  values (v_id, v_nummer, coalesce(p_started_on, current_date), 'active');

  insert into public.member_roles (member_id, role) values (v_id, 'member');

  foreach v_fee in array coalesce(p_fee_type_ids, '{}') loop
    insert into public.member_fees (member_id, fee_type_id, year)
    values (v_id, v_fee, extract(year from current_date)::integer)
    on conflict do nothing;
  end loop;

  return v_id;
end;
$$;

create or replace function public.accept_membership_application(
  p_application_id  uuid,
  p_number          text default null,
  p_fee_type_ids    uuid[] default '{}',
  p_started_on      date default null,
  p_billing_payer_id uuid default null)
returns table (member_id uuid, membership_number text, needs_invite boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a      public.membership_applications;
  v_id     uuid;
  v_nummer text;
  v_arten  uuid[];
  v_code   text;
  v_wert   jsonb;
begin
  if not private.is_admin() then
    raise exception 'Antraege bearbeiten duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_billing_payer_id is not null then
    raise exception 'Jedes Mitglied zahlt selbst. Einen Zahler gibt es nicht mehr.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_a from public.membership_applications where id = p_application_id;
  if not found then
    raise exception 'Diesen Antrag gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if v_a.status <> 'new' then
    raise exception 'Dieser Antrag wurde bereits bearbeitet.'
      using errcode = 'check_violation';
  end if;

  -- Ohne ausdrueckliche Wahl die im Antrag gewuenschte Beitragsart.
  v_arten := case
    when coalesce(array_length(p_fee_type_ids, 1), 0) > 0 then p_fee_type_ids
    when v_a.desired_fee_type_id is not null then array[v_a.desired_fee_type_id]
    else '{}'::uuid[]
  end;

  v_id := public.create_member(
    p_first_name       => v_a.first_name,
    p_last_name        => v_a.last_name,
    p_email            => v_a.email::text,
    p_birthday         => v_a.birthday,
    p_gender           => v_a.gender,
    p_salutation       => v_a.salutation,
    p_title            => v_a.title,
    p_phone            => v_a.phone,
    p_mobile           => v_a.mobile,
    p_street           => v_a.street,
    p_postcode         => v_a.postcode,
    p_city             => v_a.city,
    p_country_code     => coalesce(v_a.country_code, 'DE'),
    p_notes            => v_a.message,
    p_number           => p_number,
    p_started_on       => coalesce(p_started_on, current_date),
    p_fee_type_ids     => v_arten
  );

  update public.members set
    emergency_contact_name     = v_a.emergency_contact_name,
    emergency_contact_phone    = v_a.emergency_contact_phone,
    emergency_contact_relation = v_a.emergency_contact_relation
  where id = v_id;

  -- Die im Antrag erteilten Einwilligungen uebernehmen. Erteilt wurden sie
  -- beim Absenden; set_at haelt hier den Zeitpunkt der Annahme fest, was der
  -- naechstbeste nachweisbare Zeitpunkt ist.
  for v_code, v_wert in select * from jsonb_each(coalesce(v_a.attribute_choices, '{}'::jsonb)) loop
    if v_wert = 'true'::jsonb then
      begin
        perform public.set_member_attribute(v_id, v_code);
      exception when others then
        -- Ein zwischenzeitlich stillgelegtes Merkmal soll die Aufnahme nicht
        -- aufhalten.
        null;
      end;
    end if;
  end loop;

  select s.number into v_nummer from public.memberships s
  where s.member_id = v_id and s.ended_on is null;

  update public.membership_applications set
    status = 'accepted',
    decided_at = now(),
    decided_by = private.current_member_id(),
    created_member_id = v_id
  where id = p_application_id;

  return query select v_id, v_nummer, (v_a.email is not null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Archivieren, Loeschen, Anonymisieren: keine Zahlerbeziehung mehr zu loesen
--
-- released_payees und payees bleiben fuer die Signatur und sind immer 0.
-- ---------------------------------------------------------------------------
create or replace function public.archive_member(
  p_member_id uuid, p_force boolean default false, p_reason text default null)
returns table (cancelled_bookings integer, open_charges integer,
               open_amount_cents integer, released_payees integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ich      uuid := private.current_member_id();
  v_offen    integer;
  v_betrag   integer;
  v_gecancelt integer := 0;
  v_buchung  record;
begin
  if not private.is_admin() then
    raise exception 'Mitglieder archivieren duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_member_id = v_ich then
    raise exception 'Du kannst dich nicht selbst archivieren.'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  select count(*)::integer, coalesce(sum(amount_cents), 0)::integer
    into v_offen, v_betrag
  from public.charges
  where member_id = p_member_id and status in ('open', 'notified');

  if v_offen > 0 and not p_force then
    raise exception 'Es sind noch % Forderungen ueber % Euro offen. Zum Archivieren ausdruecklich bestaetigen.',
      v_offen, to_char(v_betrag / 100.0, 'FM999G999D00')
      using errcode = 'check_violation';
  end if;

  -- Kuenftige Buchungen stornieren und alle Mitspieler benachrichtigen.
  for v_buchung in
    select b.id, b.court_id, b.slot
    from public.bookings b
    where b.member_id = p_member_id and b.status = 'active' and lower(b.slot) > now()
  loop
    update public.bookings set
      status = 'cancelled', cancelled_at = now(), cancelled_by = v_ich,
      cancellation_reason = 'Mitglied archiviert'
    where id = v_buchung.id;

    insert into public.notifications (member_id, kind, title, body)
    select bp.member_id, 'booking_cancelled', 'Buchung abgesagt',
           'Eine Buchung am ' ||
           to_char(lower(v_buchung.slot) at time zone 'Europe/Berlin', 'DD.MM.YYYY "um" HH24:MI') ||
           ' wurde abgesagt, weil das buchende Mitglied ausgetreten ist.'
    from public.booking_players bp
    where bp.booking_id = v_buchung.id and bp.member_id <> p_member_id;

    v_gecancelt := v_gecancelt + 1;
  end loop;

  -- Laufende Mitgliedschaft beenden, sofern noch offen.
  update public.memberships set
    ended_on = coalesce(ended_on, current_date),
    cancellation_date = coalesce(cancellation_date, current_date),
    cancellation_reason = coalesce(cancellation_reason, nullif(btrim(coalesce(p_reason, '')), '')),
    status = 'ended'
  where member_id = p_member_id and ended_on is null;

  -- Mandate widerrufen, Bankverbindungen stilllegen.
  update public.sepa_mandates
     set status = 'revoked', revoked_on = coalesce(revoked_on, current_date)
   where member_id = p_member_id and status = 'active';
  update public.bank_accounts set active = false
   where member_id = p_member_id and active;

  -- Adminrechte enden mit der Mitgliedschaft.
  delete from public.member_roles where member_id = p_member_id and role = 'admin';

  update public.members set
    status = 'archived',
    notes = case when nullif(btrim(coalesce(p_reason, '')), '') is null then notes
                 else coalesce(notes || E'\n', '') || 'Archiviert: ' || btrim(p_reason) end
  where id = p_member_id;

  return query select v_gecancelt, v_offen, v_betrag, 0;
end;
$$;

create or replace function public.member_delete_impact(p_member_id uuid)
returns table (
  charges integer, drink_purchases integer, bookings integer,
  booking_players integer, work_duty_entries integer,
  mandates integer, bank_accounts integer, payees integer,
  can_delete boolean, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_charges integer; v_drinks integer; v_bookings integer; v_player integer;
  v_duty integer; v_mandate integer; v_konten integer;
begin
  if not private.is_admin() then
    raise exception 'Diese Auskunft ist Administratoren vorbehalten.'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*)::integer into v_charges from public.charges
   where member_id = p_member_id or payer_id = p_member_id;
  select count(*)::integer into v_drinks from public.drink_purchases where member_id = p_member_id;
  select count(*)::integer into v_bookings from public.bookings where member_id = p_member_id;
  select count(*)::integer into v_player from public.booking_players where member_id = p_member_id;
  select count(*)::integer into v_duty from public.work_duty_entries where member_id = p_member_id;
  select count(*)::integer into v_mandate from public.sepa_mandates where member_id = p_member_id;
  select count(*)::integer into v_konten from public.bank_accounts where member_id = p_member_id;

  return query select
    v_charges, v_drinks, v_bookings, v_player, v_duty, v_mandate, v_konten, 0,
    (v_charges + v_drinks + v_bookings + v_player = 0),
    case
      when v_charges + v_drinks + v_bookings + v_player = 0 then null::text
      else 'Zu diesem Mitglied gehoeren bereits Forderungen, Getraenke oder Buchungen. '
        || 'Loeschen wuerde die Buchhaltung zerreissen.'
    end;
end;
$$;

create or replace function public.delete_member(p_member_id uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m      public.members;
  v_impact record;
begin
  if not private.is_admin() then
    raise exception 'Mitglieder loeschen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_member_id = private.current_member_id() then
    raise exception 'Du kannst dich nicht selbst loeschen.'
      using errcode = 'check_violation';
  end if;

  select * into v_m from public.members where id = p_member_id;
  if not found then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if lower(btrim(coalesce(p_confirm_name, ''))) is distinct from lower(btrim(v_m.last_name)) then
    raise exception 'Zum Loeschen bitte den Nachnamen zur Bestaetigung eingeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_impact from public.member_delete_impact(p_member_id);

  if not v_impact.can_delete then
    raise exception 'Zu diesem Mitglied gibt es % Forderungen, % Getraenkebuchungen und % Platzbuchungen. '
                    'Ein Loeschen wuerde die Buchhaltung zerreissen - bitte archivieren oder anonymisieren.',
      v_impact.charges, v_impact.drink_purchases, v_impact.bookings
      using errcode = 'check_violation';
  end if;

  delete from public.members where id = p_member_id;
end;
$$;

create or replace function public.anonymize_member(p_member_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lauf integer;
begin
  if not private.is_admin() then
    raise exception 'Mitglieder anonymisieren duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_member_id = private.current_member_id() then
    raise exception 'Du kannst dich nicht selbst anonymisieren.'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  select count(*)::integer + 1 into v_lauf
  from public.members where last_name like 'Mitglied #%';

  update public.sepa_mandates
     set status = 'revoked', revoked_on = coalesce(revoked_on, current_date)
   where member_id = p_member_id and status = 'active';
  delete from public.bank_accounts where member_id = p_member_id;
  delete from public.member_attribute_values where member_id = p_member_id;

  update public.members set
    first_name = 'Geloescht',
    last_name  = 'Mitglied #' || v_lauf,
    title = null, gender = null, salutation = null, birthday = null,
    email = null, phone = null, mobile = null,
    street = null, postcode = null, city = null,
    emergency_contact_name = null, emergency_contact_phone = null,
    emergency_contact_relation = null,
    nationality_code = null, tennis_lk = null, nuliga_id = null,
    playing_right = 'none', playing_right_since = null,
    legacy_data = null, ebusy_person_id = null,
    auth_user_id = null, invited_at = null, login_disabled_at = now(),
    is_trainer = false,
    status = 'archived',
    notes = 'Anonymisiert am ' || to_char(current_date, 'DD.MM.YYYY')
            || coalesce(': ' || nullif(btrim(coalesce(p_reason, '')), ''), '')
  where id = p_member_id;

  delete from public.member_roles where member_id = p_member_id and role = 'admin';
end;
$$;

-- ---------------------------------------------------------------------------
-- Mitgliederliste: is_paid_by bleibt fuer die Signatur und ist immer false
-- ---------------------------------------------------------------------------
create or replace function public.member_overview(
  p_filter text default 'aktiv',
  p_query  text default null,
  p_limit  integer default 500)
returns table (
  id             uuid,
  first_name     text,
  last_name      text,
  email          text,
  birthday       date,
  status         public.member_status,
  is_trainer     boolean,
  has_login      boolean,
  is_admin       boolean,
  is_paid_by     boolean,
  number         text,
  started_on     date,
  ended_on       date,
  roles          public.app_role[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with sichtbar as (
    select m.*
    from public.members m
    where private.is_admin()
      and case p_filter
            when 'aktiv'       then m.status = 'active'
            when 'archiviert'  then m.status = 'archived'
            when 'ohne-login'  then m.auth_user_id is null and m.status <> 'archived'
            when 'trainer'     then m.is_trainer
            when 'admins'      then private.has_full_rights(m.id)
            when 'vorstand'    then exists (select 1 from public.member_roles r
                                             where r.member_id = m.id and r.role = 'board')
            when 'platzwart'   then exists (select 1 from public.member_roles r
                                             where r.member_id = m.id and r.role = 'groundskeeper')
            else true
          end
      and (
        p_query is null or btrim(p_query) = ''
        or m.first_name ilike '%' || btrim(p_query) || '%'
        or m.last_name  ilike '%' || btrim(p_query) || '%'
        or (m.first_name || ' ' || m.last_name) ilike '%' || btrim(p_query) || '%'
        or (m.last_name || ' ' || m.first_name) ilike '%' || btrim(p_query) || '%'
      )
  ),
  -- Die laufende Mitgliedschaft, sonst die zuletzt beendete. "distinct on"
  -- liefert genau eine Zeile je Mitglied, ohne Unterabfrage je Zeile.
  aktuelle as (
    select distinct on (s.member_id)
           s.member_id, s.number, s.started_on, s.ended_on
    from public.memberships s
    where s.member_id in (select id from sichtbar)
    order by s.member_id, (s.ended_on is null) desc, s.started_on desc
  )
  select
    m.id, m.first_name, m.last_name, m.email::text, m.birthday, m.status,
    m.is_trainer,
    m.auth_user_id is not null,
    private.has_full_rights(m.id),
    false,
    a.number, a.started_on, a.ended_on,
    coalesce((select array_agg(r.role order by r.role) from public.member_roles r
               where r.member_id = m.id), '{}')
  from sichtbar m
  left join aktuelle a on a.member_id = m.id
  order by lower(m.last_name), lower(m.first_name)
  limit least(coalesce(p_limit, 500), 1000);
$$;
