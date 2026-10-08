-- ===========================================================================
-- Mandat ohne Umfang
--
-- Bisher trug jedes Mandat einen Umfang (scope): "nur Beitraege" oder "alle
-- Zahlungen". Ein Beitragsmandat durfte weder Getraenke noch Gastgebuehr
-- einziehen, und je Mitglied konnte es ein aktives Mandat je Umfang geben.
--
-- Der Verein holt nur noch ein Mandat ein, dessen Text alle Zahlungen an den
-- Verein nennt. Damit gilt:
--   * Jedes aktive Mandat traegt jede Forderungsart.
--   * Je Mitglied gibt es hoechstens ein aktives Mandat - jetzt auch als
--     Index, nicht nur als Pruefung in create_sepa_mandate.
--
-- Funktionen, deren Rueckgabe oder Signatur den Umfang enthielt, werden
-- gedroppt und neu angelegt; create or replace kann beides nicht aendern.
-- Erst danach lassen sich Spalte und Typ entfernen.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Mandat erteilen
-- ---------------------------------------------------------------------------
drop function public.create_sepa_mandate(uuid, uuid, text, date, public.mandate_scope);

create function public.create_sepa_mandate(
  p_member_id       uuid,
  p_bank_account_id uuid,
  p_reference       text default null,
  p_signed_on       date default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_konto     public.bank_accounts;
  v_referenz  text;
  v_signed    date := coalesce(p_signed_on, current_date);
begin
  if not private.is_admin() then
    raise exception 'Mandate erteilen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_konto from public.bank_accounts where id = p_bank_account_id;
  if not found then
    raise exception 'Diese Bankverbindung gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if v_konto.member_id <> p_member_id then
    raise exception 'Diese Bankverbindung gehoert zu einem anderen Mitglied.'
      using errcode = 'invalid_parameter_value';
  end if;

  if not v_konto.active then
    raise exception 'Diese Bankverbindung ist stillgelegt.'
      using errcode = 'check_violation';
  end if;

  if v_signed > current_date then
    raise exception 'Ein Mandat kann nicht in der Zukunft unterschrieben worden sein.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Zwei aktive Mandate waeren fuer den Lastschriftlauf nicht zu
  -- unterscheiden. Der Index sepa_mandates_ein_aktives faengt dasselbe ab;
  -- hier steht es mit verstaendlicher Meldung.
  if exists (select 1 from public.sepa_mandates
              where member_id = p_member_id and status = 'active') then
    raise exception 'Fuer dieses Mitglied besteht bereits ein aktives Mandat. Bitte zuerst widerrufen.'
      using errcode = 'check_violation';
  end if;

  v_referenz := coalesce(nullif(btrim(coalesce(p_reference, '')), ''),
                         private.next_mandate_reference(p_member_id));

  insert into public.sepa_mandates
    (member_id, bank_account_id, reference, signed_on, sequence_type, status)
  values (p_member_id, p_bank_account_id, v_referenz, v_signed, 'FRST', 'active');

  return v_referenz;
end;
$$;

revoke execute on function public.create_sepa_mandate(uuid, uuid, text, date) from public, anon;
grant  execute on function public.create_sepa_mandate(uuid, uuid, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Bankverbindungen und Mandate eines Mitglieds
-- ---------------------------------------------------------------------------
drop function public.member_finances(uuid);

create function public.member_finances(p_member_id uuid)
returns table (
  bank_account_id  uuid,
  iban_last4       text,
  holder           text,
  bank_name        text,
  konto_aktiv      boolean,
  mandate_id       uuid,
  reference        text,
  signed_on        date,
  last_used_on     date,
  sequence_type    public.mandate_sequence,
  mandat_status    public.mandate_status,
  revoked_on       date,
  reference_conflict boolean,
  im_einzug        boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    k.id, k.iban_last4, k.holder, k.bank_name, k.active,
    m.id, m.reference, m.signed_on, m.last_used_on, m.sequence_type,
    m.status, m.revoked_on, m.reference_conflict,
    exists (select 1 from public.debit_items d
             where d.mandate_id = m.id and d.result = 'pending')
  from public.bank_accounts k
  left join public.sepa_mandates m on m.bank_account_id = k.id
  where k.member_id = p_member_id
    and (private.is_admin() or private.can_view_member(p_member_id))
  order by k.active desc, k.created_at desc, m.signed_on desc;
$$;

revoke execute on function public.member_finances(uuid) from public, anon;
grant  execute on function public.member_finances(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Vorschau des Beitragslaufs
-- ---------------------------------------------------------------------------
drop function public.fee_run_preview(integer);

create function public.fee_run_preview(p_year integer)
returns table (member_id uuid, member_name text, payer_name text, fee_types text,
               amount_cents integer, has_mandate boolean, already_charged boolean)
language sql stable security definer set search_path = '' as $$
  select m.id,
         btrim(coalesce(m.first_name,'') || ' ' || coalesce(m.last_name,'')),
         btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')),
         string_agg(ft.name, ', ' order by ft.name),
         sum(coalesce(mf.override_amount_cents, fp.amount_cents))::integer,
         exists (select 1 from public.sepa_mandates sm
                  where sm.member_id = coalesce(m.billing_payer_id, m.id) and sm.status = 'active'),
         exists (select 1 from public.charges c
                  where c.member_id = m.id and c.kind = 'fee'
                    and c.period_label = p_year::text and c.status <> 'waived')
  from public.members m
  join public.member_fees mf on mf.member_id = m.id and mf.year = p_year
  join public.fee_types ft on ft.id = mf.fee_type_id
  left join public.members p on p.id = m.billing_payer_id
  left join lateral (
    select fpx.amount_cents from public.fee_prices fpx
    where fpx.fee_type_id = mf.fee_type_id and fpx.valid_from_year <= p_year
    order by fpx.valid_from_year desc limit 1
  ) fp on true
  where m.status = 'active' and private.is_admin()
  group by m.id, m.first_name, m.last_name, p.first_name, p.last_name, m.billing_payer_id
  order by 2;
$$;
revoke execute on function public.fee_run_preview(integer) from public, anon;
grant  execute on function public.fee_run_preview(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Kandidaten fuer einen Lastschriftlauf
--
-- Unveraendert bis auf das Mandat: je Zahler das aktive Mandat, gleich welche
-- Forderungsart. add_charges_to_debit_batch ruft diese Funktion auf und
-- uebernimmt mandate_id und einzugsfaehig; sie bleibt, wie sie ist.
-- ---------------------------------------------------------------------------
drop function public.debit_batch_candidates(date, public.charge_kind[]);

create function public.debit_batch_candidates(
  p_collection_date date,
  p_kinds public.charge_kind[] default null
)
returns table (
  payer_id uuid, payer_name text, charge_ids uuid[], positionen integer,
  arten text, amount_cents integer,
  mandate_id uuid, mandate_reference text,
  einzugsfaehig boolean, grund text
)
language sql stable security definer set search_path = '' as $$
  with frist as (
    select public.setting_int('sepa.prenotification_days') as tage,
           public.setting_int('drinks.min_debit_cents') as mindest
  ), offen as (
    select c.*, coalesce(m.billing_payer_id, m.id) as zahler
    from public.charges c
    join public.members m on m.id = c.member_id
    where private.is_admin()
      and c.status = 'notified'
      and (p_kinds is null or c.kind = any (p_kinds))
      and not exists (
        select 1 from public.debit_items di
        where di.charge_id = c.id and di.result in ('pending', 'settled')
      )
  ), mit_mandat as (
    -- Je Zahler gibt es hoechstens ein aktives Mandat; es traegt jede Art.
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
      sum(m.amount_cents)::integer as betrag,
      max(m.mandat_id::text)::uuid as mandat_id,
      max(m.reference) as reference,
      case
        when bool_or(m.mandat_id is null) then
          'Fuer diesen Zahler ist kein Mandat hinterlegt.'
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

revoke execute on function public.debit_batch_candidates(date, public.charge_kind[])
  from public, anon;
grant execute on function public.debit_batch_candidates(date, public.charge_kind[])
  to authenticated;

-- ---------------------------------------------------------------------------
-- Inhalt der Lastschriftdatei
-- ---------------------------------------------------------------------------
drop function public.debit_batch_payload(uuid);

create function public.debit_batch_payload(p_batch_id uuid)
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
      btrim(coalesce(z.first_name, '') || ' ' || coalesce(z.last_name, '')),
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

revoke execute on function public.debit_batch_payload(uuid) from public, anon;
grant  execute on function public.debit_batch_payload(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Hoechstens ein aktives Mandat je Mitglied - auch fuer Schreibwege an
-- create_sepa_mandate vorbei (Import, Seed, Verwaltung per SQL).
-- ---------------------------------------------------------------------------
create unique index sepa_mandates_ein_aktives
  on public.sepa_mandates (member_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- Spalte und Typ entfernen
-- ---------------------------------------------------------------------------
alter table public.sepa_mandates drop column scope;
drop type public.mandate_scope;
