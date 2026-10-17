-- ===========================================================================
-- Der Einzug: Ankuendigung und Lastschriftlauf in einem Schritt
--
-- Bisher waren das zwei getrennte Vorgaenge mit je einem eigenen Datum:
-- Forderungen ankuendigen (announce_charges, Faelligkeit) und spaeter einen
-- leeren Lauf anlegen (create_debit_batch, Faelligkeitstag), der sich dann
-- aus allen passend angekuendigten Forderungen fuellte. Passten die beiden
-- Daten nicht, blieb der Lauf leer, und was ein Lauf eigentlich einzieht, war
-- nicht zu erkennen.
--
-- Jetzt gibt es einen Vorgang:
--
--   einzug_vorbereiten(Abbuchungstag, Gruppen)
--     -> kuendigt genau diese Forderungen an (announce_charges)
--     -> legt den Lauf an und nimmt genau diese Forderungen auf
--
-- Die Frist bleibt, wo sie war: announce_charges verlangt den Abbuchungstag
-- mindestens sepa.prenotification_days nach heute, guard_prenotification
-- prueft jeden Posten. Die Datei darf sofort erzeugt werden; die Bank bucht
-- erst am Abbuchungstag ab.
--
-- Angekuendigt wird nur, wer eingezogen werden kann. Ein Mitglied ohne
-- gueltiges Mandat bekaeme sonst eine Nachricht "wir buchen ab", auf die
-- keine Abbuchung folgt. Seine Forderungen bleiben offen und stehen in der
-- Vorschau als Ausnahme mit Grund.
--
-- Was eingezogen werden kann: offene Forderungen, Ruecklaeufer (sie werden neu
-- angekuendigt und noch einmal eingezogen) und angekuendigte Forderungen, die
-- in keinem Lauf stecken - etwa aus der Zeit vor dieser Migration oder nach
-- dem Herausnehmen. Auch diese werden neu angekuendigt, mit dem neuen Tag.
--
-- Abwaertskompatibel: create_debit_batch, add_charges_to_debit_batch und
-- debit_batch_candidates bleiben unveraendert.
-- ===========================================================================

/**
 * Forderungen, die in einen Einzug koennen.
 *
 * Offen, zurueckgebucht oder angekuendigt ohne aktiven Posten. Der Teilindex
 * debit_items_one_active_per_charge kennt nur pending und settled; eine
 * zurueckgebuchte Forderung ist damit wieder frei.
 */
create or replace function private.einziehbar(c public.charges)
returns boolean language sql stable set search_path = '' as $$
  select c.status in ('open', 'returned', 'notified')
     and c.amount_cents > 0
     and not exists (
       select 1 from public.debit_items di
       where di.charge_id = c.id and di.result in ('pending', 'settled')
     );
$$;

/**
 * Die Gruppen, aus denen ein Einzug zusammengestellt wird.
 *
 * Je Art und Zeitraum eine Zeile, Ruecklaeufer gesondert - sie brauchen einen
 * eigenen Blick, bevor sie noch einmal abgebucht werden.
 */
create or replace function public.einzug_gruppen()
returns table (
  kind public.charge_kind, period_label text, ruecklaeufer boolean,
  anzahl integer, mitglieder integer, summe_cents integer
)
language sql stable security definer set search_path = '' as $$
  select c.kind, c.period_label, c.status = 'returned',
         count(*)::integer,
         count(distinct c.payer_id)::integer,
         sum(c.amount_cents)::integer
  from public.charges c
  where private.is_admin() and private.einziehbar(c)
  group by c.kind, c.period_label, c.status = 'returned'
  order by c.status = 'returned', c.kind, c.period_label desc nulls last;
$$;

revoke execute on function public.einzug_gruppen() from public, anon;
grant  execute on function public.einzug_gruppen() to authenticated;

/**
 * Die Forderungen hinter einer Auswahl von Gruppen.
 *
 * p_gruppen: [{"kind": "fee", "period": "2027", "returned": false}, ...];
 * period null heisst "ohne Zeitraum", nicht "alle".
 */
create or replace function private.einzug_forderungen(p_gruppen jsonb)
returns setof uuid language sql stable set search_path = '' as $$
  select c.id
  from public.charges c
  join jsonb_to_recordset(coalesce(p_gruppen, '[]'::jsonb))
         as g(kind public.charge_kind, period text, returned boolean)
    on c.kind = g.kind
   and c.period_label is not distinct from g.period
   and (c.status = 'returned') = coalesce(g.returned, false)
  where private.einziehbar(c);
$$;

/**
 * Wer mit welchem Betrag mitgeht - und wer nicht, und warum.
 *
 * Je Mitglied eine Zeile: eine Lastschrift je Mitglied, wie auf dem
 * Kontoauszug. Die Gruende sind dieselben wie in debit_batch_candidates,
 * bis auf die Frist: die beginnt erst mit der Ankuendigung, die dieser
 * Einzug selbst verschickt.
 */
create or replace function private.einzug_pruefung(p_charge_ids uuid[], p_collection_date date)
returns table (
  member_id uuid, member_name text, charge_ids uuid[], positionen integer,
  arten text, kinds public.charge_kind[], amount_cents integer,
  mandate_id uuid, mandate_reference text, einzugsfaehig boolean, grund text
)
language sql stable set search_path = '' as $$
  with posten as (
    select c.*, sm.id as mandat_id, sm.reference, sm.signed_on, sm.last_used_on
    from public.charges c
    left join lateral (
      select s.* from public.sepa_mandates s
      where s.member_id = c.payer_id and s.status = 'active'
      order by s.signed_on desc
      limit 1
    ) sm on true
    where c.id = any (p_charge_ids)
  ), je_mitglied as (
    select
      p.payer_id,
      array_agg(p.id order by p.id) as charge_ids,
      count(*)::integer as positionen,
      string_agg(distinct p.description, '; ') as arten,
      array_agg(distinct p.kind order by p.kind) as kinds,
      sum(p.amount_cents)::integer as betrag,
      max(p.mandat_id::text)::uuid as mandat_id,
      max(p.reference) as reference,
      case
        when bool_or(p.mandat_id is null) then
          'Kein gueltiges Mandat hinterlegt.'
        when max(p.signed_on) > p_collection_date then
          'Das Mandat ist erst nach dem Abbuchungstag unterschrieben.'
        when coalesce(max(p.last_used_on), max(p.signed_on)) + interval '36 months'
             < (now() at time zone 'Europe/Berlin')::date then
          'Das Mandat ist seit ueber 36 Monaten ungenutzt und damit erloschen. '
          'Es muss neu eingeholt werden.'
        when sum(p.amount_cents) < public.setting_int('drinks.min_debit_cents') then
          'Unter dem Mindestbetrag. Der Betrag geht beim naechsten Einzug mit.'
        else null
      end as grund
    from posten p
    group by p.payer_id
  )
  select j.payer_id,
         btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')),
         j.charge_ids, j.positionen, j.arten, j.kinds, j.betrag,
         j.mandat_id, j.reference, j.grund is null, j.grund
  from je_mitglied j
  join public.members m on m.id = j.payer_id
  order by j.grund is null, 2;
$$;

/** Die Vorschau vor dem Klick: dieselbe Pruefung, die der Einzug nimmt. */
create or replace function public.einzug_vorschau(p_collection_date date, p_gruppen jsonb)
returns table (
  member_id uuid, member_name text, positionen integer, arten text,
  kinds public.charge_kind[], amount_cents integer, mandate_reference text,
  einzugsfaehig boolean, grund text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Einzuege vorbereiten duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select p.member_id, p.member_name, p.positionen, p.arten, p.kinds, p.amount_cents,
         p.mandate_reference, p.einzugsfaehig, p.grund
  from private.einzug_pruefung(
         array(select private.einzug_forderungen(p_gruppen)), p_collection_date) p;
end; $$;

revoke execute on function public.einzug_vorschau(date, jsonb) from public, anon;
grant  execute on function public.einzug_vorschau(date, jsonb) to authenticated;

/**
 * Einen Einzug vorbereiten: ankuendigen und den Lauf anlegen, in einem Zug.
 *
 * Alles oder nichts - schlaegt das Anlegen fehl, ist auch nichts angekuendigt
 * und keine Nachricht verschickt (die Mails gehen aus notifications erst
 * spaeter raus).
 */
create or replace function public.einzug_vorbereiten(
  p_collection_date date, p_gruppen jsonb, p_title text default null
)
returns table (
  batch_id uuid, lastschriften integer, forderungen integer,
  summe_cents integer, ausnahmen integer
)
language plpgsql security definer set search_path = '' as $$
declare
  v_heute date := (now() at time zone 'Europe/Berlin')::date;
  v_frist integer := public.setting_int('sepa.prenotification_days');
  v_alle uuid[];
  v_faehig uuid[];
  v_ausnahmen integer;
  v_kinds public.charge_kind[];
  v_batch uuid;
  v_lastschriften integer;
  v_summe integer;
begin
  if not private.is_admin() then
    raise exception 'Einzuege vorbereiten duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_collection_date is null then
    raise exception 'Bitte einen Abbuchungstag waehlen.' using errcode = 'invalid_parameter_value';
  end if;
  -- Dieselbe Pruefung wie in announce_charges, aber vor allem anderen: ein
  -- zu frueher Tag soll nicht erst nach der Auswahl auffallen.
  if p_collection_date < v_heute + v_frist then
    raise exception
      'Zwischen Ankuendigung und Abbuchung muessen % Tage liegen. Fruehester Abbuchungstag ist der %.',
      v_frist, to_char(v_heute + v_frist, 'DD.MM.YYYY')
      using errcode = 'invalid_parameter_value';
  end if;

  v_alle := array(select private.einzug_forderungen(p_gruppen));
  if cardinality(v_alle) = 0 then
    raise exception 'In der Auswahl ist nichts einzuziehen.' using errcode = 'invalid_parameter_value';
  end if;

  select coalesce(array_agg(x.id), '{}'),
         (select count(*)::integer from private.einzug_pruefung(v_alle, p_collection_date) p
           where not p.einzugsfaehig)
    into v_faehig, v_ausnahmen
  from private.einzug_pruefung(v_alle, p_collection_date) p
  cross join lateral unnest(p.charge_ids) as x(id)
  where p.einzugsfaehig;

  if cardinality(v_faehig) = 0 then
    raise exception 'Niemand in der Auswahl kann eingezogen werden. Die Gruende stehen in der Vorschau.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Ruecklaeufer und verwaiste Ankuendigungen werden neu angekuendigt: das
  -- Mitglied soll den neuen Tag kennen, nicht den alten.
  update public.charges c
     set status = 'open', notified_at = null, due_date = null
   where c.id = any (v_faehig) and c.status in ('returned', 'notified');

  perform public.announce_charges(p_collection_date, null, null, v_faehig);

  select array_agg(distinct c.kind order by c.kind) into v_kinds
  from public.charges c where c.id = any (v_faehig);

  insert into public.debit_batches (title, collection_date, kinds, created_by)
  values (
    coalesce(nullif(btrim(p_title), ''), 'Einzug ' || to_char(p_collection_date, 'DD.MM.YYYY')),
    p_collection_date, v_kinds, private.current_member_id()
  )
  returning id into v_batch;

  -- Wie in add_charges_to_debit_batch: eine Kennung je Mitglied, eindeutig
  -- ueber Laeufe hinweg und kuerzer als 35 Zeichen.
  insert into public.debit_items
    (batch_id, charge_id, mandate_id, amount_cents, end_to_end_id,
     mandate_reference, mandate_signed_on, sequence_type)
  select v_batch, c.id, sm.id, c.amount_cents,
         'TCM-' || substr(replace(v_batch::text, '-', ''), 1, 8) || '-' ||
           substr(replace(c.payer_id::text, '-', ''), 1, 12),
         sm.reference, sm.signed_on, 'RCUR'::public.mandate_sequence
  from public.charges c
  join lateral (
    select s.* from public.sepa_mandates s
    where s.member_id = c.payer_id and s.status = 'active'
    order by s.signed_on desc
    limit 1
  ) sm on true
  where c.id = any (v_faehig);

  update public.debit_batches b
     set total_cents = (select coalesce(sum(amount_cents), 0)::integer
                        from public.debit_items where debit_items.batch_id = v_batch),
         item_count  = (select count(distinct end_to_end_id)::integer
                        from public.debit_items where debit_items.batch_id = v_batch)
   where b.id = v_batch
  returning b.item_count, b.total_cents into v_lastschriften, v_summe;

  return query select v_batch, v_lastschriften, cardinality(v_faehig), v_summe, v_ausnahmen;
end; $$;

revoke execute on function public.einzug_vorbereiten(date, jsonb, text) from public, anon;
grant  execute on function public.einzug_vorbereiten(date, jsonb, text) to authenticated;

/**
 * Ein Mitglied aus einem Einzug herausnehmen, solange die Datei fehlt.
 *
 * Seine Forderungen werden wieder offen: angekuendigt war ein Tag, an dem
 * jetzt nicht abgebucht wird. Ein spaeterer Einzug kuendigt neu an.
 */
create or replace function public.einzug_mitglied_entfernen(p_batch_id uuid, p_end_to_end_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status public.debit_batch_status; v_ids uuid[];
begin
  if not private.is_admin() then
    raise exception 'Einzuege aendern duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from public.debit_batches where id = p_batch_id;
  if v_status is null then
    raise exception 'Diesen Einzug gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'draft' then
    raise exception 'Die Datei ist schon erzeugt. Danach laesst sich niemand mehr herausnehmen.'
      using errcode = 'invalid_parameter_value';
  end if;

  with weg as (
    delete from public.debit_items
     where batch_id = p_batch_id and end_to_end_id = p_end_to_end_id
    returning charge_id
  )
  select array_agg(charge_id) into v_ids from weg;

  if v_ids is null then
    raise exception 'Diese Lastschrift steht nicht in diesem Einzug.' using errcode = 'no_data_found';
  end if;

  update public.charges
     set status = 'open', notified_at = null, due_date = null
   where id = any (v_ids) and status = 'notified';

  update public.debit_batches b
     set total_cents = (select coalesce(sum(amount_cents), 0)::integer
                        from public.debit_items where batch_id = p_batch_id),
         item_count  = (select count(distinct end_to_end_id)::integer
                        from public.debit_items where batch_id = p_batch_id)
   where b.id = p_batch_id;
end; $$;

revoke execute on function public.einzug_mitglied_entfernen(uuid, text) from public, anon;
grant  execute on function public.einzug_mitglied_entfernen(uuid, text) to authenticated;

/**
 * Einen leeren Einzug loeschen.
 *
 * Nur einen Entwurf ohne Posten: alle Mitglieder herausgenommen, oder ein
 * alter Lauf, der nie gefuellt wurde. Alles andere ist ein Beleg.
 */
create or replace function public.einzug_loeschen(p_batch_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status public.debit_batch_status;
begin
  if not private.is_admin() then
    raise exception 'Einzuege loeschen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from public.debit_batches where id = p_batch_id;
  if v_status is null then
    raise exception 'Diesen Einzug gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'draft'
     or exists (select 1 from public.debit_items where batch_id = p_batch_id) then
    raise exception 'Nur ein leerer Einzug ohne Datei laesst sich loeschen.'
      using errcode = 'invalid_parameter_value';
  end if;

  delete from public.debit_batches where id = p_batch_id;
end; $$;

revoke execute on function public.einzug_loeschen(uuid) from public, anon;
grant  execute on function public.einzug_loeschen(uuid) to authenticated;
