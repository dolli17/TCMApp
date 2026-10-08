-- ===========================================================================
-- Kasse: Forderungsarten sichtbar machen und einen Lauf auf Arten beschraenken
--
-- In der Kasse war nicht zu erkennen, was ein Lastschriftlauf eigentlich
-- einzieht: Beitraege, Getraenke, Arbeitsdienst und Gastgebuehren liefen
-- gemischt, und die Art stand nur im Detailblatt einer Forderung.
--
--   * debit_batches.kinds: Ein Lauf kann auf Arten beschraenkt werden, etwa
--     ein reiner Beitragslauf im Maerz. null heisst wie bisher: alle Arten.
--   * Kandidaten, Posten und Uebersicht liefern die Arten mit, damit die
--     Oberflaeche sie als Marken zeigen kann.
--   * debit_batch_kinds: Summe je Art in einem Lauf.
-- ===========================================================================

alter table public.debit_batches add column kinds public.charge_kind[];

comment on column public.debit_batches.kinds is
  'Welche Forderungsarten der Lauf einzieht. null = alle.';

-- ---------------------------------------------------------------------------
-- Lauf anlegen, optional nur fuer bestimmte Arten
-- ---------------------------------------------------------------------------
drop function public.create_debit_batch(text, date);

create function public.create_debit_batch(
  p_title text, p_collection_date date, p_kinds public.charge_kind[] default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Lastschriftlaeufe anlegen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'Der Lauf braucht einen Namen.' using errcode = 'invalid_parameter_value';
  end if;
  if p_collection_date is null
     or p_collection_date < (now() at time zone 'Europe/Berlin')::date then
    raise exception 'Der Faelligkeitstag darf nicht in der Vergangenheit liegen.'
      using errcode = 'invalid_parameter_value';
  end if;
  -- Eine leere Auswahl wuerde nichts einziehen - das ist sicher ein Versehen.
  if p_kinds is not null and cardinality(p_kinds) = 0 then
    raise exception 'Bitte mindestens eine Art waehlen.' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.debit_batches (title, collection_date, kinds, created_by)
  values (btrim(p_title), p_collection_date, p_kinds, private.current_member_id())
  returning id into v_id;

  return v_id;
end; $$;

revoke execute on function public.create_debit_batch(text, date, public.charge_kind[])
  from public, anon;
grant  execute on function public.create_debit_batch(text, date, public.charge_kind[])
  to authenticated;

-- ---------------------------------------------------------------------------
-- Kandidaten: wie zuletzt (20260812110000), zusaetzlich die Arten je Zahler
-- ---------------------------------------------------------------------------
drop function public.debit_batch_candidates(date, public.charge_kind[]);

create function public.debit_batch_candidates(
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
-- Aufnehmen: wie bisher, aber nur die Arten des Laufs
-- ---------------------------------------------------------------------------
create or replace function public.add_charges_to_debit_batch(
  p_batch_id uuid, p_payer_ids uuid[] default null
)
returns table (aufgenommen integer, uebersprungen integer, summe_cents integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_faellig date;
  v_status public.debit_batch_status;
  v_kinds public.charge_kind[];
  v_auf integer;
  v_summe integer;
  v_moeglich integer;
begin
  if not private.is_admin() then
    raise exception 'Lastschriftlaeufe fuellen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select collection_date, status, kinds into v_faellig, v_status, v_kinds
  from public.debit_batches where id = p_batch_id;

  if v_faellig is null then
    raise exception 'Diesen Lastschriftlauf gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'draft' then
    raise exception 'Dieser Lauf ist bereits erzeugt und laesst sich nicht mehr aendern.'
      using errcode = 'invalid_parameter_value';
  end if;

  with kandidat as (
    select k.* from public.debit_batch_candidates(v_faellig, v_kinds) k
    where k.einzugsfaehig
      and (p_payer_ids is null or k.payer_id = any (p_payer_ids))
  ), posten as (
    select
      k.payer_id, k.mandate_id,
      -- Die Kennung muss ueber Laeufe hinweg eindeutig sein und darf 35
      -- Zeichen nicht ueberschreiten - buildPain008 kuerzt sonst stillschweigend,
      -- und zwar am Ende, wo der Zahler steht: alle Posten bekaemen dieselbe
      -- Kennung, die Bank koennte eine Rueckgabe niemandem zuordnen, und
      -- record_debit_return traefe den ganzen Lauf statt einer Lastschrift.
      -- 4 + 8 + 1 + 12 = 25 Zeichen, mit reichlich Luft.
      'TCM-' || substr(replace(p_batch_id::text, '-', ''), 1, 8) || '-' ||
        substr(replace(k.payer_id::text, '-', ''), 1, 12) as e2e,
      c.id as charge_id, c.amount_cents
    from kandidat k
    join public.charges c on c.id = any (k.charge_ids)
  ), neu as (
    insert into public.debit_items
      (batch_id, charge_id, mandate_id, amount_cents, end_to_end_id,
       mandate_reference, mandate_signed_on, sequence_type)
    select p_batch_id, p.charge_id, p.mandate_id, p.amount_cents, p.e2e,
           sm.reference, sm.signed_on,
           -- Seit 2016 kann durchgehend RCUR verwendet werden; FRST/RCUR zu
           -- unterscheiden bringt nichts mehr und erzeugt nur Fehlerquellen.
           'RCUR'::public.mandate_sequence
    from posten p
    join public.sepa_mandates sm on sm.id = p.mandate_id
    returning amount_cents
  )
  select count(*)::integer, coalesce(sum(amount_cents), 0)::integer
    into v_auf, v_summe
  from neu;

  update public.debit_batches b
     set total_cents = (select coalesce(sum(amount_cents), 0)::integer
                        from public.debit_items where batch_id = p_batch_id),
         item_count  = (select count(distinct end_to_end_id)::integer
                        from public.debit_items where batch_id = p_batch_id)
   where b.id = p_batch_id;

  select count(*)::integer into v_moeglich
  from public.debit_batch_candidates(v_faellig, v_kinds) k
  where not k.einzugsfaehig;

  return query select v_auf, coalesce(v_moeglich, 0), v_summe;
end; $$;

-- ---------------------------------------------------------------------------
-- Posten eines Laufs: zusaetzlich die Arten je Lastschrift
-- ---------------------------------------------------------------------------
drop function public.debit_batch_items(uuid);

create function public.debit_batch_items(p_batch_id uuid)
returns table (
  end_to_end_id text, payer_name text, mitglieder text, positionen integer,
  kinds public.charge_kind[], amount_cents integer, mandate_reference text,
  result public.debit_item_result, return_reason text, returned_on date
)
language sql stable security definer set search_path = '' as $$
  select
    i.end_to_end_id,
    max(btrim(coalesce(z.first_name, '') || ' ' || coalesce(z.last_name, ''))),
    string_agg(distinct btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')), ', '),
    count(*)::integer,
    array_agg(distinct c.kind order by c.kind),
    sum(i.amount_cents)::integer,
    max(i.mandate_reference),
    max(i.result::text)::public.debit_item_result,
    max(i.return_reason),
    max(i.returned_on)
  from public.debit_items i
  join public.charges c on c.id = i.charge_id
  join public.members z on z.id = c.payer_id
  join public.members m on m.id = c.member_id
  where i.batch_id = p_batch_id and private.is_admin()
  group by i.end_to_end_id
  order by 2;
$$;

revoke execute on function public.debit_batch_items(uuid) from public, anon;
grant  execute on function public.debit_batch_items(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Summe je Art in einem Lauf
-- ---------------------------------------------------------------------------
create function public.debit_batch_kinds(p_batch_id uuid)
returns table (kind public.charge_kind, positionen integer, summe_cents integer)
language sql stable security definer set search_path = '' as $$
  select c.kind, count(*)::integer, sum(i.amount_cents)::integer
  from public.debit_items i
  join public.charges c on c.id = i.charge_id
  where i.batch_id = p_batch_id and private.is_admin()
  group by c.kind
  order by c.kind;
$$;

revoke execute on function public.debit_batch_kinds(uuid) from public, anon;
grant  execute on function public.debit_batch_kinds(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Uebersicht der Laeufe: zusaetzlich die gewaehlten Arten
-- ---------------------------------------------------------------------------
drop function public.debit_batch_overview(integer);

create function public.debit_batch_overview(p_limit integer default 24)
returns table (
  id uuid, title text, collection_date date, status public.debit_batch_status,
  kinds public.charge_kind[],
  total_cents integer, item_count integer, positionen integer, zurueck integer,
  hat_datei boolean, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    b.id, b.title, b.collection_date, b.status, b.kinds, b.total_cents, b.item_count,
    (select count(*)::integer from public.debit_items i where i.batch_id = b.id),
    (select count(*)::integer from public.debit_items i
      where i.batch_id = b.id and i.result = 'returned'),
    b.storage_path is not null,
    b.created_at
  from public.debit_batches b
  where private.is_admin()
  order by b.collection_date desc, b.created_at desc
  limit greatest(coalesce(p_limit, 24), 1);
$$;

revoke execute on function public.debit_batch_overview(integer) from public, anon;
grant  execute on function public.debit_batch_overview(integer) to authenticated;
