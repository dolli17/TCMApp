-- ===========================================================================
-- Keine doppelte Belastung (B1, B2)
--
-- B1: waive_charge und settle_charge_manually sperrten nur 'submitted' bzw.
-- 'settled'. Eine Forderung im Einzugsentwurf ('notified', Posten im Lauf)
-- liess sich erlassen oder abhaken und stand trotzdem weiter im Lauf.
-- mark_debit_batch_generated setzte sie danach auf 'submitted' - das Mitglied
-- wurde belastet, und der Vermerk war weg.
--
-- Jetzt:
--   - Im Entwurf: die Forderung geht aus dem Lauf heraus (Summe und Anzahl
--     ziehen nach, wie bei einzug_mitglied_entfernen), dann wird sie erlassen
--     bzw. abgehakt.
--   - In einem Lauf mit erzeugter oder eingereichter Datei: abgewiesen. Die
--     Datei wird eingezogen; erst ein Ruecklaeufer gibt die Forderung frei.
--   - Datei erzeugen bricht ab, sobald im Lauf eine Forderung steht, die nicht
--     mehr angekuendigt ist (Altfaelle von vor diesem Fix). Schon beim Bauen
--     der Datei, nicht erst beim Vermerken - sonst laege sie schon im Speicher.
--
-- B2: sync_guest_charges und waive_guest_charges zaehlten nur 'open'. War die
-- Gastgebuehr angekuendigt, entstand beim naechsten Speichern der Besetzung
-- eine zweite, und ein Storno erliess sie nicht.
--
-- Jetzt zaehlt jede Gastgebuehr ausser 'waived'. Faellt eine weg (Storno vor
-- Spielbeginn, weniger Gaeste), gelten die Regeln von B1: offen wird sie
-- geloescht bzw. erlassen, im Entwurf herausgenommen und erlassen. Steckt sie
-- in einer erzeugten Datei, bleibt sie stehen und wird genau einmal
-- eingezogen; weniger Gaeste eintragen wird dann abgewiesen.
--
-- Damit es dazu praktisch nicht kommt: eine Gastgebuehr ist erst ab
-- Spielbeginn einziehbar. Vorher kann sie noch wegfallen.
--
-- Abwaertskompatibel: gleiche Signaturen, nur neue private Helfer.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Helfer
-- ---------------------------------------------------------------------------

/**
 * Eine Forderung aus einem Einzugsentwurf nehmen, bevor sie erlassen oder
 * abgehakt wird.
 *
 * Sperrt zuerst den Lauf: mark_debit_batch_generated sperrt ihn ebenfalls,
 * also kann die Datei nicht gleichzeitig entstehen. Steckt die Forderung in
 * einem Lauf mit Datei, bricht der Vorgang mit p_meldung ab.
 *
 * Die Forderung selbst bleibt unangetastet; den neuen Status setzt der
 * Aufrufer.
 */
create or replace function private.forderung_aus_entwurf(p_charge_id uuid, p_meldung text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_posten record;
begin
  for v_posten in
    select di.id, b.id as batch_id, b.status
    from public.debit_items di
    join public.debit_batches b on b.id = di.batch_id
    where di.charge_id = p_charge_id and di.result = 'pending'
    order by b.id
    for update of b
  loop
    if v_posten.status <> 'draft' then
      raise exception '%', p_meldung using errcode = 'invalid_parameter_value';
    end if;

    delete from public.debit_items where id = v_posten.id;

    update public.debit_batches b
       set total_cents = (select coalesce(sum(i.amount_cents), 0)::integer
                          from public.debit_items i where i.batch_id = b.id),
           item_count  = (select count(distinct i.end_to_end_id)::integer
                          from public.debit_items i where i.batch_id = b.id)
     where b.id = v_posten.batch_id;
  end loop;
end; $$;

/**
 * Ist der Lauf so, wie er angekuendigt wurde?
 *
 * Jeder Posten im Entwurf traegt eine angekuendigte Forderung
 * (guard_prenotification). Ist eine davon inzwischen erlassen oder bezahlt,
 * darf keine Datei entstehen: sie wuerde einziehen, was niemand mehr schuldet.
 */
create or replace function private.einzug_pruefe_posten(p_batch_id uuid)
returns void language plpgsql stable set search_path = '' as $$
declare v_namen text;
begin
  select string_agg(distinct btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')), ', ')
    into v_namen
  from public.debit_items i
  join public.charges c on c.id = i.charge_id
  join public.members m on m.id = c.payer_id
  where i.batch_id = p_batch_id and c.status <> 'notified';

  if v_namen is not null then
    raise exception
      'In diesem Einzug stehen Forderungen, die inzwischen erlassen oder als bezahlt vermerkt sind (%). Bitte diese Mitglieder herausnehmen und die Datei dann erzeugen.',
      v_namen using errcode = 'invalid_parameter_value';
  end if;
end; $$;

-- ---------------------------------------------------------------------------
-- B1: Erlassen und abhaken
-- ---------------------------------------------------------------------------

/** Eine Forderung erlassen. Im Einzugsentwurf geht sie dabei heraus. */
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

  if not exists (select 1 from public.charges where id = p_charge_id) then
    raise exception 'Diese Forderung gibt es nicht.' using errcode = 'no_data_found';
  end if;

  -- Erst der Lauf, dann die Forderung: dieselbe Reihenfolge wie beim Erzeugen
  -- der Datei.
  perform private.forderung_aus_entwurf(p_charge_id,
    'Diese Forderung steckt in einem Einzug, dessen Lastschriftdatei schon erzeugt ist, und wird damit eingezogen. '
    'Erlassen geht erst, wenn die Lastschrift zurueckkommt.');

  select status into v_status from public.charges where id = p_charge_id for update;
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

/** Eine Forderung als bezahlt abhaken. Im Einzugsentwurf geht sie dabei heraus. */
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

  perform private.forderung_aus_entwurf(p_charge_id,
    'Diese Forderung steckt in einem Einzug, dessen Lastschriftdatei schon erzeugt ist, und wird damit eingezogen. '
    'Als bezahlt vermerken geht erst, wenn die Lastschrift zurueckkommt.');

  select status into v_status from public.charges where id = p_charge_id for update;
  if v_status = 'submitted' then
    raise exception
      'Diese Forderung steckt in einem eingereichten Lastschriftlauf und wird damit eingezogen.'
      using errcode = 'invalid_parameter_value';
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

-- ---------------------------------------------------------------------------
-- B1: Die Datei
-- ---------------------------------------------------------------------------

/** Wie in 20261014093203_jeder_zahlt_selbst.sql, neu: prueft die Posten. */
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

  perform private.einzug_pruefe_posten(p_batch_id);

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

/**
 * Die Datei ist gebaut und abgelegt.
 *
 * Neu: sperrt den Lauf (siehe private.forderung_aus_entwurf), prueft die
 * Posten und setzt nur angekuendigte Forderungen auf 'submitted'. Eine
 * erlassene oder bezahlte wird nie mehr ueberschrieben.
 */
create or replace function public.mark_debit_batch_generated(
  p_batch_id uuid, p_storage_path text, p_total_cents integer, p_item_count integer
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status public.debit_batch_status; v_summe integer; v_anzahl integer;
begin
  if not private.is_admin() then
    raise exception 'Lastschriftdateien erzeugen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from public.debit_batches where id = p_batch_id for update;
  if v_status is null then
    raise exception 'Diesen Lastschriftlauf gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'draft' then
    raise exception 'Dieser Lauf ist bereits erzeugt.'
      using errcode = 'invalid_parameter_value';
  end if;

  select coalesce(sum(amount_cents), 0)::integer, count(distinct end_to_end_id)::integer
    into v_summe, v_anzahl
  from public.debit_items where batch_id = p_batch_id;

  if v_anzahl = 0 then
    raise exception 'Der Lauf enthaelt keine Posten.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_total_cents is distinct from v_summe or p_item_count is distinct from v_anzahl then
    raise exception
      'Die erzeugte Datei passt nicht zum Lauf: % Lastschriften ueber % Cent stehen hier, gemeldet wurden % ueber %.',
      v_anzahl, v_summe, p_item_count, p_total_cents
      using errcode = 'invalid_parameter_value';
  end if;

  perform private.einzug_pruefe_posten(p_batch_id);

  update public.debit_batches
     set status = 'generated',
         storage_path = p_storage_path,
         creditor_id = public.setting_text('sepa.creditor_id'),
         pain_version = public.setting_text('sepa.pain_version'),
         total_cents = v_summe,
         item_count = v_anzahl
   where id = p_batch_id;

  update public.charges c
     set status = 'submitted'
   where c.id in (select charge_id from public.debit_items where batch_id = p_batch_id)
     and c.status = 'notified';
end; $$;

-- ---------------------------------------------------------------------------
-- B2: Gastgebuehr
-- ---------------------------------------------------------------------------

/**
 * Forderungen, die in einen Einzug koennen.
 *
 * Wie in 20261019085200_veranstaltungen.sql, neu: eine Gastgebuehr erst ab
 * Spielbeginn. Bis dahin kann die Buchung storniert werden oder der Gast
 * wegfallen, und die Gebuehr soll dann nicht schon angekuendigt sein.
 */
create or replace function private.einziehbar(c public.charges)
returns boolean language sql stable set search_path = '' as $$
  select c.status in ('open', 'returned', 'notified')
     and c.amount_cents > 0
     and not exists (
       select 1 from public.debit_items di
       where di.charge_id = c.id and di.result in ('pending', 'settled')
     )
     and (c.event_id is null or exists (
       select 1 from public.events e
       where e.id = c.event_id and coalesce(e.registration_deadline, e.starts_at) <= now()
     ))
     and (c.kind <> 'guest' or c.booking_id is null or exists (
       select 1 from public.bookings b
       where b.id = c.booking_id and lower(b.slot) <= now()
     ));
$$;

/**
 * Eine Gastgebuehr faellt weg.
 *
 * Offen und nie in einem Lauf: loeschen, wie bisher. Angekuendigt oder im
 * Entwurf: aus dem Entwurf nehmen und erlassen - die Ankuendigung ist
 * verschickt und soll nachvollziehbar bleiben.
 *
 * Rueckgabe false, wenn sie sich nicht mehr anfassen laesst: in einer
 * erzeugten Datei, eingereicht, bezahlt oder zurueckgebucht. Dann bleibt sie
 * stehen und wird genau einmal eingezogen.
 */
create or replace function private.gastgebuehr_entfallen(p_charge_id uuid, p_grund text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare c public.charges;
begin
  select * into c from public.charges where id = p_charge_id;
  if c.status not in ('open', 'notified')
     or exists (
       select 1 from public.debit_items di
       join public.debit_batches b on b.id = di.batch_id
       where di.charge_id = c.id and di.result = 'pending' and b.status <> 'draft'
     ) then
    return false;
  end if;

  if c.status = 'open'
     and not exists (select 1 from public.debit_items where charge_id = c.id) then
    delete from public.charges where id = c.id;
    return true;
  end if;

  perform private.forderung_aus_entwurf(c.id,
    'Die Gastgebuehr steckt in einem Einzug, dessen Lastschriftdatei schon erzeugt ist.');

  update public.charges
     set status = 'waived',
         description = description || ' [erlassen: ' || p_grund || ']'
   where id = c.id;
  return true;
end; $$;

/**
 * Die Gastgebuehren einer Buchung auf die Zahl der Gaeste bringen.
 *
 * Wie in 20261014093203_jeder_zahlt_selbst.sql, neu: es zaehlt jede Gebuehr
 * ausser einer erlassenen. Fallen Gaeste weg, gehen zuerst die offenen, dann
 * die angekuendigten, jeweils die juengsten. Steckt die Gebuehr schon in einer
 * Datei, laesst sich der Gast nicht mehr austragen.
 */
create or replace function private.sync_guest_charges(
  p_booking_id uuid, p_member_id uuid, p_anzahl integer
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_gebuehr integer := public.setting_int('booking.guest_fee_cents');
  v_ist integer;
  v_zuviel integer;
  v_payer uuid;
  v_text text;
  v_id uuid;
begin
  if v_gebuehr <= 0 then return; end if;

  select count(*)::integer into v_ist
  from public.charges
  where booking_id = p_booking_id and kind = 'guest' and status <> 'waived';

  if v_ist = p_anzahl then return; end if;

  if v_ist > p_anzahl then
    v_zuviel := v_ist - p_anzahl;
    for v_id in
      select id from public.charges
      where booking_id = p_booking_id and kind = 'guest' and status <> 'waived'
      order by status <> 'open', created_at desc, id desc
      for update
    loop
      exit when v_zuviel = 0;
      if private.gastgebuehr_entfallen(v_id, 'Gast ausgetragen') then
        v_zuviel := v_zuviel - 1;
      end if;
    end loop;

    if v_zuviel > 0 then
      raise exception
        'Die Gastgebuehr ist schon im Lastschrifteinzug und wird eingezogen. Der Gast laesst sich nicht mehr austragen.'
        using errcode = 'invalid_parameter_value';
    end if;
    return;
  end if;

  -- Jedes Mitglied zahlt selbst.
  v_payer := p_member_id;

  v_text := 'Gastgebuehr ' || private.booking_label(p_booking_id);

  insert into public.charges (member_id, payer_id, kind, amount_cents, description, booking_id)
  select p_member_id, v_payer, 'guest', v_gebuehr, v_text, p_booking_id
  from generate_series(1, p_anzahl - v_ist);
end; $$;

/**
 * Die Gastgebuehren einer stornierten Buchung erlassen.
 *
 * Neu: auch angekuendigte, und aus einem Einzugsentwurf heraus. Eine Gebuehr
 * in einer erzeugten Datei bleibt stehen - still erlassen hiesse, sie als
 * erledigt zu zeigen, waehrend die Bank sie einzieht.
 */
create or replace function private.waive_guest_charges(p_booking_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  for v_id in
    select id from public.charges
    where booking_id = p_booking_id and kind = 'guest' and status in ('open', 'notified')
    order by id
    for update
  loop
    if exists (select 1 from public.charges where id = v_id and status = 'open')
       and not exists (select 1 from public.debit_items where charge_id = v_id) then
      -- Wie bisher: eine offene wird erlassen, nicht geloescht.
      update public.charges set status = 'waived' where id = v_id;
    else
      perform private.gastgebuehr_entfallen(v_id, 'Buchung storniert');
    end if;
  end loop;
end; $$;
