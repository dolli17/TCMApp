-- O27: Verwaltungsprotokoll. S29: Notizen nicht mehr ueber change_log lesbar.
--
-- Wer hat in der Verwaltung was getan? Grundlage bleibt public.change_log mit
-- dem Trigger private.log_change, keine zweite Tabelle. Neu:
--  - Spalte kenn: die Kennfelder der Zeile bei jeder Aktion (Name, Betrag,
--    Titel ...), damit das Protokoll eine Zeile in Klartext zeigen kann, ohne
--    die Zeile selbst noch zu brauchen. Beim Loeschen stehen sie wie bisher
--    zusaetzlich im diff.
--  - Spalte ereignis und action 'event': Eintraege, die keine einzelne
--    Tabellenaenderung sind (Einladung erneut, Passwort-Link, Sammeleintrag
--    eines Laufs).
--  - Trigger an den Tabellen der Verwaltung, mit Ausschlussfeldern.
--  - Massenlaeufe (Beitragslauf, Einzug, Serien ...) schreiben je Lauf und
--    Tabelle einen Sammeleintrag statt einer Zeile je Forderung/Buchung.
--  - S29: members.notes und import_notes landen nicht mehr im Protokoll, die
--    vorhandenen werden entfernt, und Mitglieder lesen change_log nicht mehr.
--
-- Abwaertskompatibel: nur neue Spalten, der Check wird weiter, die
-- Triggerfunktion behaelt ihre drei bisherigen Argumente.

-- ---------------------------------------------------------------------------
-- Tabelle
-- ---------------------------------------------------------------------------
alter table public.change_log
  add column if not exists kenn jsonb,
  add column if not exists ereignis text;

comment on column public.change_log.kenn is
  'Kennfelder der Zeile zum Zeitpunkt der Aktion (z. B. Name, Betrag, Titel). '
  'Bei Sammeleintraegen Anzahl, Summe und die Angaben des Laufs.';
comment on column public.change_log.ereignis is
  'Bei action = ''event'': was geschah, als Kennung (z. B. einladung_erneut, '
  'beitragslauf). Sonst leer.';

alter table public.change_log drop constraint if exists change_log_action_known;
alter table public.change_log add constraint change_log_action_known
  check (action in ('insert', 'update', 'delete', 'read', 'event'));

create index if not exists change_log_zeit_tabelle_person_idx
  on public.change_log (changed_at desc, table_name, changed_by);

-- ---------------------------------------------------------------------------
-- S29: Das Protokoll ist nur fuer volle Rechte. Ueber die Policy fuer das eigene
-- Mitglied liessen sich bisher alte und neue Notizen lesen, an S17 vorbei.
-- ---------------------------------------------------------------------------
drop policy if exists change_log_own_select on public.change_log;

-- Was nur aus Notizen bestand, wird ganz entfernt, sonst nur die Notizfelder.
delete from public.change_log
 where table_name = 'members'
   and action = 'update'
   and diff - 'notes' - 'import_notes' = '{}'::jsonb;

update public.change_log
   set diff = diff - 'notes' - 'import_notes'
 where table_name = 'members'
   and diff ?| array['notes', 'import_notes'];

-- ---------------------------------------------------------------------------
-- Triggerfunktion
--
-- Argumente:
--  0  Spalte mit dem betroffenen Mitglied ('' = keins)
--  1  Ausschlussfelder, kommagetrennt; beginnt die Liste mit '=', sind es
--     umgekehrt die einzigen Felder, die protokolliert werden
--  2  Kennfelder, kommagetrennt
--  3  Modus: ''                  alles protokollieren
--            'fremd'             nur, wenn jemand mit einer Rolle ueber
--                                'member' hinaus fuer ein anderes Mitglied
--                                handelt, oder ein Konto ohne Mitglied (Kiosk);
--                                ohne jedes Konto nicht (Seed, Wartung)
--            'fremd_oder_sperre' wie 'fremd', Sperrungen (kind = 'blocking')
--                                aber immer
--
-- Sammeln: Setzt eine RPC tcm.protokoll_sammel (nur fuer ihre Transaktion,
-- set_config(..., true)), werden Zeilen der Massentabellen nicht einzeln
-- protokolliert, sondern je Transaktion, Tabelle und Aktion in einem Eintrag
-- gezaehlt. Der Wert ist ein JSON-Objekt mit dem Schluessel ereignis und den
-- Angaben des Laufs. Ueber PostgREST kann ein Client set_config nicht
-- aufrufen; auch sonst gingen nur Einzelzeilen in einem Sammeleintrag mit
-- derselben handelnden Person auf, verborgen wuerde nichts.
-- ---------------------------------------------------------------------------
create or replace function private.log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alt    jsonb := case when TG_OP = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_neu    jsonb := case when TG_OP = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_zeile  jsonb := case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_liste  text  := case when TG_NARGS > 1 then TG_ARGV[1] else '' end;
  v_nur    boolean := left(v_liste, 1) = '=';
  v_aus    text[] := case when ltrim(v_liste, '=') <> ''
                          then string_to_array(ltrim(v_liste, '='), ',') else '{}'::text[] end;
  v_kenn   text[] := case when TG_NARGS > 2 and TG_ARGV[2] <> ''
                          then string_to_array(TG_ARGV[2], ',') else '{}'::text[] end;
  v_modus  text  := case when TG_NARGS > 3 then TG_ARGV[3] else '' end;
  v_member uuid  := case when TG_ARGV[0] <> ''
                         then nullif(v_zeile ->> TG_ARGV[0], '')::uuid end;
  v_ich    uuid  := (select private.current_member_id());
  v_sammel text  := nullif(current_setting('tcm.protokoll_sammel', true), '');
  v_kennw  jsonb;
  v_diff   jsonb := '{}'::jsonb;
  v_feld   text;
  v_lauf   jsonb;
  v_id     bigint;
begin
  -- Nur Verwaltung: was ein Mitglied fuer sich selbst tut, nicht; ebenso
  -- wenig, was ein Mitglied ohne Verwaltungsrolle nebenbei an fremden Zeilen
  -- aendert (Einstieg ins offene Spiel, Nachruecken nach einer Abmeldung);
  -- und keine reinen Systemaenderungen ohne jedes Konto (Seed, Wartung).
  -- Ein Konto ohne Mitglied (Kiosk) handelt immer fuer jemand anderen.
  if v_modus in ('fremd', 'fremd_oder_sperre')
     and not (v_modus = 'fremd_oder_sperre' and v_zeile ->> 'kind' = 'blocking') then
    if v_ich is null then
      if (select auth.uid()) is null then
        return null;
      end if;
    elsif v_member = v_ich
       or not exists (select 1 from public.member_roles r
                       where r.member_id = v_ich and r.role <> 'member') then
      return null;
    end if;
  end if;

  v_kennw := (select jsonb_object_agg(k, v_zeile -> k) from unnest(v_kenn) as k where v_zeile ? k);

  -- Beim Loeschen bleibt nur uebrig, was ausdruecklich als Kennfeld benannt
  -- ist - genug, um nachzuvollziehen wen es traf, zu wenig, um die Person
  -- daraus wiederherzustellen.
  if TG_OP = 'DELETE' then
    v_alt := coalesce(v_kennw, '{}'::jsonb);
  end if;

  for v_feld in select jsonb_object_keys(v_alt || v_neu) loop
    if TG_OP <> 'DELETE' and (v_feld = any (v_aus)) <> v_nur then continue; end if;
    if v_alt -> v_feld is distinct from v_neu -> v_feld then
      v_diff := v_diff || jsonb_build_object(
        v_feld, jsonb_build_object('alt', v_alt -> v_feld, 'neu', v_neu -> v_feld));
    end if;
  end loop;

  -- Hinterlegte IBANs in den Einstellungen (Glaeubigerkonto): dass sie sich
  -- geaendert haben, ja, der Wert selbst nicht.
  if TG_TABLE_NAME = 'settings' and v_zeile ->> 'key' ilike '%iban%' and v_diff ? 'value' then
    v_diff := v_diff || '{"value": {"alt": "***", "neu": "***"}}'::jsonb;
  end if;

  if TG_OP = 'DELETE' then
    v_diff := v_diff || jsonb_build_object('_aktion', to_jsonb('geloescht'::text));
  elsif v_diff = '{}'::jsonb then
    -- Nichts Protokollierbares geaendert. Ohne diesen Ausstieg wuerde jeder
    -- Lauf des moddatetime-Triggers einen leeren Eintrag erzeugen.
    return null;
  end if;

  if v_sammel is not null
     and TG_TABLE_NAME in ('charges', 'debit_items', 'bookings',
                           'work_duty_settlements', 'sepa_mandates') then
    v_lauf := case when left(v_sammel, 1) = '{' then v_sammel::jsonb
                   else jsonb_build_object('ereignis', v_sammel) end;

    update public.change_log c
       set kenn = c.kenn || jsonb_build_object(
             'anzahl', (c.kenn ->> 'anzahl')::integer + 1,
             'betrag_cents', (c.kenn ->> 'betrag_cents')::bigint
                             + coalesce((v_zeile ->> 'amount_cents')::bigint, 0))
     where c.changed_at = now()
       and c.table_name = TG_TABLE_NAME
       and c.action = 'event'
       and c.ereignis = v_lauf ->> 'ereignis'
       and c.kenn ->> 'txid' = txid_current()::text
       and c.kenn ->> 'aktion' = lower(TG_OP)
    returning c.id into v_id;

    if v_id is null then
      insert into public.change_log
        (table_name, action, ereignis, diff, kenn, changed_by, changed_by_auth)
      values (
        TG_TABLE_NAME, 'event', v_lauf ->> 'ereignis', '{}'::jsonb,
        (v_lauf - 'ereignis') || jsonb_build_object(
          'aktion', lower(TG_OP),
          'anzahl', 1,
          'betrag_cents', coalesce((v_zeile ->> 'amount_cents')::bigint, 0),
          'txid', txid_current()::text),
        v_ich,
        (select auth.uid()));
    end if;
    return null;
  end if;

  insert into public.change_log
    (table_name, row_id, member_id, action, diff, kenn, changed_by, changed_by_auth)
  values (
    TG_TABLE_NAME,
    case when v_zeile ? 'id' then nullif(v_zeile ->> 'id', '')::uuid end,
    v_member,
    lower(TG_OP),
    v_diff,
    v_kennw,
    v_ich,
    (select auth.uid())
  );

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
-- S29: Notizen nicht mehr ins Protokoll.
drop trigger if exists members_log_change on public.members;
create trigger members_log_change
  after insert or update or delete on public.members
  for each row execute function private.log_change(
    'id', 'updated_at,legacy_data,notes,import_notes', 'first_name,last_name');

-- Finanzen
create trigger charges_log_change
  after insert or update or delete on public.charges
  for each row execute function private.log_change(
    'member_id', 'created_at,updated_at', 'description,amount_cents,period_label', 'fremd');

create trigger debit_batches_log_change
  after insert or update or delete on public.debit_batches
  for each row execute function private.log_change(
    '', 'created_at,updated_at', 'title,collection_date');

create trigger debit_items_log_change
  after insert or update or delete on public.debit_items
  for each row execute function private.log_change(
    '', 'created_at', 'amount_cents,mandate_reference');

create trigger fee_types_log_change
  after insert or update or delete on public.fee_types
  for each row execute function private.log_change(
    '', 'created_at,updated_at', 'name');

create trigger fee_prices_log_change
  after insert or update or delete on public.fee_prices
  for each row execute function private.log_change(
    '', 'created_at', 'fee_type_id,valid_from_year,amount_cents');

create trigger billing_periods_log_change
  after insert or update or delete on public.billing_periods
  for each row execute function private.log_change(
    '', 'created_at', 'year,month');

-- Plaetze. Eigene Buchungen nicht; der Buchungscode und Begruendungen als
-- Freitext bleiben draussen.
create trigger bookings_log_change
  after insert or update or delete on public.bookings
  for each row execute function private.log_change(
    'member_id', 'created_at,booking_code,cancellation_reason',
    'court_id,slot,kind,title', 'fremd_oder_sperre');

create trigger booking_series_log_change
  after insert or update or delete on public.booking_series
  for each row execute function private.log_change(
    '', 'created_at', 'title,court_id,weekday,start_time,end_time');

create trigger courts_log_change
  after insert or update or delete on public.courts
  for each row execute function private.log_change(
    '', 'created_at,updated_at', 'name');

create trigger booking_types_log_change
  after insert or update or delete on public.booking_types
  for each row execute function private.log_change(
    '', 'created_at,updated_at', 'name');

-- Mitglieder. Beim Antrag nur die Entscheidung: die Angaben des Antrags,
-- Nachricht, Begruendung und Herkunftsdaten bleiben draussen.
create trigger membership_applications_log_change
  after update on public.membership_applications
  for each row execute function private.log_change(
    'created_member_id', '=status,decided_at,decided_by,created_member_id',
    'first_name,last_name');

create trigger account_deletion_requests_log_change
  after insert or update or delete on public.account_deletion_requests
  for each row execute function private.log_change(
    'member_id', 'created_at,message', '');

-- Verein
create trigger events_log_change
  after insert or update or delete on public.events
  for each row execute function private.log_change(
    '', 'created_at,updated_at,members_notified_at,reminder_sent_at', 'title,starts_at');

create trigger teams_log_change
  after insert or update or delete on public.teams
  for each row execute function private.log_change(
    '', 'created_at,updated_at', 'name');

create trigger work_duty_rules_log_change
  after insert or update or delete on public.work_duty_rules
  for each row execute function private.log_change(
    '', 'created_at', 'fee_type_id,year,required_hours');

create trigger work_duty_settlements_log_change
  after insert or update or delete on public.work_duty_settlements
  for each row execute function private.log_change(
    'member_id', '', 'year,amount_cents');

create trigger work_duty_entries_log_change
  after insert or update or delete on public.work_duty_entries
  for each row execute function private.log_change(
    'member_id', 'created_at,updated_at', 'year,hours,worked_on', 'fremd');

create trigger drink_items_log_change
  after insert or update or delete on public.drink_items
  for each row execute function private.log_change(
    '', 'created_at,updated_at', 'name');

create trigger drink_prices_log_change
  after insert or update or delete on public.drink_prices
  for each row execute function private.log_change(
    '', 'created_at', 'drink_item_id,valid_from,price_cents');

create trigger kiosk_devices_log_change
  after insert or update or delete on public.kiosk_devices
  for each row execute function private.log_change(
    '', 'created_at,last_seen_at,auth_user_id', 'name');

create trigger member_attribute_types_log_change
  after insert or update or delete on public.member_attribute_types
  for each row execute function private.log_change(
    '', 'created_at,updated_at', 'name');

create trigger member_attribute_options_log_change
  after insert or update or delete on public.member_attribute_options
  for each row execute function private.log_change(
    '', '', 'label,attribute_type_id');

-- System. Rechtstexte ohne den Text selbst (gross, und jede Fassung bleibt
-- ohnehin als eigene Zeile erhalten).
create trigger settings_log_change
  after insert or update or delete on public.settings
  for each row execute function private.log_change(
    '', 'updated_at,updated_by,description,value_type', 'key,label');

create trigger legal_documents_log_change
  after insert or update or delete on public.legal_documents
  for each row execute function private.log_change(
    '', 'created_at,body_md', 'code,version,title');

-- ---------------------------------------------------------------------------
-- Ereignisse aus der Zugangsverwaltung (member-login), die keine Zeile aendern:
-- Einladung erneut, Link zum Zuruecksetzen des Passworts. Wer handelt, nimmt
-- die Funktion selbst aus dem Token, das ist nicht faelschbar.
-- ---------------------------------------------------------------------------
create or replace function public.protokoll_zugang(p_member_id uuid, p_ereignis text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Zugänge verwalten dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_ereignis not in ('einladung_erneut', 'passwort_zuruecksetzen') then
    raise exception 'Unbekanntes Ereignis: %', p_ereignis
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.change_log
    (table_name, row_id, member_id, action, ereignis, diff, kenn, changed_by, changed_by_auth)
  select 'members', m.id, m.id, 'event', p_ereignis, '{}'::jsonb,
         jsonb_build_object('first_name', m.first_name, 'last_name', m.last_name),
         private.current_member_id(), auth.uid()
    from public.members m
   where m.id = p_member_id;

  if not found then
    raise exception 'Dieses Mitglied gibt es nicht.'
      using errcode = 'no_data_found';
  end if;
end;
$$;

revoke all on function public.protokoll_zugang(uuid, text) from public, anon;
grant execute on function public.protokoll_zugang(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Massenlaeufe: je Lauf ein Sammeleintrag je Tabelle (siehe log_change). Die
-- Funktionen sind unveraendert bis auf die erste Zeile nach begin.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_run_execute(p_year integer, p_due_date date DEFAULT NULL::date)
 RETURNS TABLE(erzeugt integer, uebersprungen integer, summe_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_faellig date := p_due_date;
  v_fehlend text;
  v_erzeugt integer;
  v_summe integer;
  v_gesamt integer;
begin
  perform set_config('tcm.protokoll_sammel', (jsonb_build_object('ereignis', 'beitragslauf', 'jahr', p_year))::text, true);
  if not private.is_admin() then
    raise exception 'Den Beitragslauf starten dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_year is null or p_year < 1970 or p_year > 2200 then
    raise exception 'Das Jahr ist ungültig.' using errcode = 'invalid_parameter_value';
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
      'Für diese Beitragsarten fehlt ein Preis für %: %. Der Lauf wurde nicht gestartet.',
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
end; $function$

;

CREATE OR REPLACE FUNCTION public.charge_billing_period(p_year integer, p_month integer, p_due_date date DEFAULT NULL::date)
 RETURNS TABLE(erzeugt integer, summe_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_status public.billing_period_status;
  v_label text := p_year || '-' || lpad(p_month::text, 2, '0');
  v_erzeugt integer;
  v_summe integer;
begin
  perform set_config('tcm.protokoll_sammel', (jsonb_build_object('ereignis', 'monatsabrechnung', 'jahr', p_year, 'monat', p_month))::text, true);
  if not private.is_admin() then
    raise exception 'Getränke abrechnen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select id, status into v_id, v_status
  from public.billing_periods where year = p_year and month = p_month;

  if v_id is null then
    raise exception 'Für diesen Monat gibt es keinen Abrechnungszeitraum.'
      using errcode = 'no_data_found';
  end if;
  if v_status = 'open' then
    raise exception
      'Der Monat muss erst geschlossen werden. Solange er offen ist, kann sich die Summe noch ändern.'
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
           'Getränke ' || v_label || ' (' || s.posten || ' Entnahmen)', p_due_date
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
end; $function$

;

CREATE OR REPLACE FUNCTION public.work_duty_settle_year(p_year integer, p_due_date date DEFAULT NULL::date)
 RETURNS TABLE(abgerechnet integer, forderungen integer, summe_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_jahr_jetzt integer := extract(year from (now() at time zone 'Europe/Berlin'))::integer;
  v_satz integer := public.setting_int('work_duty.hourly_rate_cents');
  v_zeilen integer;
  v_forderungen integer;
  v_summe integer;
begin
  perform set_config('tcm.protokoll_sammel', (jsonb_build_object('ereignis', 'arbeitsstunden_abrechnung', 'jahr', p_year))::text, true);
  if not private.is_admin() then
    raise exception 'Den Arbeitsdienst abrechnen darf nur der Vorstand.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_year is null or p_year >= v_jahr_jetzt then
    raise exception
      'Nur ein abgeschlossenes Jahr lässt sich abrechnen. Solange % läuft, können noch Stunden dazukommen.',
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
end; $function$

;

CREATE OR REPLACE FUNCTION public.announce_charges(p_due_date date, p_kind charge_kind DEFAULT NULL::charge_kind, p_period_label text DEFAULT NULL::text, p_charge_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(angekuendigt integer, empfaenger integer, summe_cents integer, faellig_am date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_heute date := (now() at time zone 'Europe/Berlin')::date;
  v_frist integer := public.setting_int('sepa.prenotification_days');
  v_anzahl integer;
  v_summe integer;
  v_empfaenger integer;
begin
  perform set_config('tcm.protokoll_sammel', (jsonb_build_object('ereignis', 'ankuendigung', 'faellig', p_due_date))::text, true);
  if not private.is_admin() then
    raise exception 'Forderungen ankündigen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_charge_ids is not null and (p_kind is not null or p_period_label is not null) then
    raise exception
      'Entweder einzelne Forderungen oder Art und Zeitraum angeben, nicht beides.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_charge_ids is null and p_kind is null then
    raise exception 'Bitte angeben, was angekündigt werden soll.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_due_date is null then
    raise exception 'Ohne Fälligkeitsdatum lässt sich nichts ankündigen.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Der Kern: die Frist wird hier gesetzt, nicht spaeter geprueft und
  -- nachgebessert. Wer heute ankuendigt, kann fruehestens in 14 Tagen
  -- einziehen - also muss das Faelligkeitsdatum schon jetzt weit genug weg
  -- sein.
  if p_due_date < v_heute + v_frist then
    raise exception
      'Die Vorabankündigung braucht % Tage Vorlauf. Früheste Fälligkeit ist der %.',
      v_frist, to_char(v_heute + v_frist, 'DD.MM.YYYY')
      using errcode = 'invalid_parameter_value';
  end if;

  -- Alles in einer Anweisung: eine temporaere Tabelle waere hier eine Falle,
  -- weil mehrere Aufrufe in derselben Transaktion (etwa im Test) auf eine
  -- bereits bestehende Tabelle traefen. Die schreibende CTE laeuft genau
  -- einmal, ihr returning laesst sich mehrfach lesen.
  with aktualisiert as (
    update public.charges c
       set status = 'notified', notified_at = now(), due_date = p_due_date
     where c.status = 'open'
       and (p_charge_ids is null or c.id = any (p_charge_ids))
       and (p_kind is null or c.kind = p_kind)
       and (p_period_label is null or c.period_label = p_period_label)
    returning c.id, c.payer_id, c.member_id, c.amount_cents, c.description
  ), beschriftet as (
    -- Wessen Forderung ist das? Bei einem Vater mit zwei Kindern stuende sonst
    -- zweimal "Mitgliedsbeitrag 2026" untereinander, ohne dass erkennbar
    -- waere, fuer wen - und genau danach fragt der Anruf beim Kassenwart.
    select a.payer_id, a.amount_cents, a.description ||
           case when a.member_id <> a.payer_id
                then ' für ' || private.member_label(a.member_id)
                else '' end as text
    from aktualisiert a
  ), nachricht as (
    -- Eine Nachricht je Zahler, nicht je Forderung: der Vater soll einmal
    -- lesen, was insgesamt abgeht, nicht dreimal einen Teilbetrag.
    insert into public.notifications (member_id, kind, title, body)
    select
      b.payer_id,
      'charge_announced',
      'Lastschrift am ' || to_char(p_due_date, 'DD.MM.YYYY'),
      'Am ' || to_char(p_due_date, 'DD.MM.YYYY') || ' ziehen wir ' ||
      private.cent_text(sum(b.amount_cents)::integer) || ' Euro von deinem Konto ein: ' ||
      string_agg(b.text, '; ' order by b.text) ||
      '. Bitte sorge für Deckung.'
    from beschriftet b
    group by b.payer_id
    returning member_id
  )
  select count(*)::integer,
         (select count(*)::integer from nachricht),
         coalesce(sum(a.amount_cents), 0)::integer
    into v_anzahl, v_empfaenger, v_summe
  from aktualisiert a;

  return query select v_anzahl, v_empfaenger, v_summe, p_due_date;
end; $function$

;

CREATE OR REPLACE FUNCTION public.einzug_vorbereiten(p_collection_date date, p_gruppen jsonb, p_title text DEFAULT NULL::text)
 RETURNS TABLE(batch_id uuid, lastschriften integer, forderungen integer, summe_cents integer, ausnahmen integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform set_config('tcm.protokoll_sammel', (jsonb_build_object('ereignis', 'einzug_vorbereiten', 'einzug', p_collection_date))::text, true);
  if not private.is_admin() then
    raise exception 'Einzüge vorbereiten dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_collection_date is null then
    raise exception 'Bitte einen Abbuchungstag wählen.' using errcode = 'invalid_parameter_value';
  end if;
  -- Dieselbe Pruefung wie in announce_charges, aber vor allem anderen: ein
  -- zu frueher Tag soll nicht erst nach der Auswahl auffallen.
  if p_collection_date < v_heute + v_frist then
    raise exception
      'Zwischen Ankündigung und Abbuchung müssen % Tage liegen. Frühester Abbuchungstag ist der %.',
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
    raise exception 'Niemand in der Auswahl kann eingezogen werden. Die Gründe stehen in der Vorschau.'
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
end; $function$

;

CREATE OR REPLACE FUNCTION public.add_charges_to_debit_batch(p_batch_id uuid, p_payer_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(aufgenommen integer, uebersprungen integer, summe_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_faellig date;
  v_status public.debit_batch_status;
  v_kinds public.charge_kind[];
  v_auf integer;
  v_summe integer;
  v_moeglich integer;
begin
  perform set_config('tcm.protokoll_sammel', (jsonb_build_object('ereignis', 'einzug_ergaenzen', 'batch_id', p_batch_id))::text, true);
  if not private.is_admin() then
    raise exception 'Lastschriftläufe füllen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select collection_date, status, kinds into v_faellig, v_status, v_kinds
  from public.debit_batches where id = p_batch_id;

  if v_faellig is null then
    raise exception 'Diesen Lastschriftlauf gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'draft' then
    raise exception 'Dieser Lauf ist bereits erzeugt und lässt sich nicht mehr ändern.'
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
end; $function$

;

CREATE OR REPLACE FUNCTION public.mark_debit_batch_generated(p_batch_id uuid, p_storage_path text, p_total_cents integer, p_item_count integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status public.debit_batch_status; v_summe integer; v_anzahl integer;
begin
  perform set_config('tcm.protokoll_sammel', (jsonb_build_object('ereignis', 'einzug_datei', 'batch_id', p_batch_id))::text, true);
  if not private.is_admin() then
    raise exception 'Lastschriftdateien erzeugen dürfen nur Administratoren.'
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
    raise exception 'Der Lauf enthält keine Posten.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_total_cents is distinct from v_summe or p_item_count is distinct from v_anzahl then
    raise exception
      'Die erzeugte Datei passt nicht zum Lauf: % Lastschriften über % Cent stehen hier, gemeldet wurden % über %.',
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
end; $function$

;

CREATE OR REPLACE FUNCTION public.mark_debit_batch_submitted(p_batch_id uuid, p_submitted_on date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status public.debit_batch_status; v_faellig date;
begin
  perform set_config('tcm.protokoll_sammel', (jsonb_build_object('ereignis', 'einzug_eingereicht', 'batch_id', p_batch_id))::text, true);
  if not private.is_admin() then
    raise exception 'Lastschriftläufe einreichen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select status, collection_date into v_status, v_faellig
  from public.debit_batches where id = p_batch_id;

  if v_status is null then
    raise exception 'Diesen Lastschriftlauf gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'generated' then
    raise exception 'Nur ein erzeugter Lauf lässt sich als eingereicht vermerken.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.debit_batches set status = 'submitted' where id = p_batch_id;

  update public.sepa_mandates sm
     set last_used_on = coalesce(p_submitted_on, v_faellig),
         sequence_type = 'RCUR'
   where sm.id in (select mandate_id from public.debit_items where batch_id = p_batch_id);
end; $function$

;

CREATE OR REPLACE FUNCTION public.complete_debit_batch(p_batch_id uuid)
 RETURNS TABLE(eingezogen integer, zurueck integer, summe_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status public.debit_batch_status; v_ein integer; v_zurueck integer; v_summe integer;
begin
  perform set_config('tcm.protokoll_sammel', (jsonb_build_object('ereignis', 'einzug_abgeschlossen', 'batch_id', p_batch_id))::text, true);
  if not private.is_admin() then
    raise exception 'Lastschriftläufe abschließen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from public.debit_batches where id = p_batch_id;
  if v_status is null then
    raise exception 'Diesen Lastschriftlauf gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'submitted' then
    raise exception
      'Nur ein eingereichter Lauf lässt sich abschließen. Vorher steht noch nicht fest, was ankommt.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.debit_items
     set result = 'settled'
   where batch_id = p_batch_id and result = 'pending';

  update public.charges c
     set status = 'settled'
   where c.id in (select charge_id from public.debit_items
                   where batch_id = p_batch_id and result = 'settled');

  update public.debit_batches set status = 'completed' where id = p_batch_id;

  select
    count(*) filter (where i.result = 'settled')::integer,
    count(*) filter (where i.result = 'returned')::integer,
    coalesce(sum(i.amount_cents) filter (where i.result = 'settled'), 0)::integer
    into v_ein, v_zurueck, v_summe
  from public.debit_items i where i.batch_id = p_batch_id;

  return query select v_ein, v_zurueck, v_summe;
end; $function$

;

CREATE OR REPLACE FUNCTION public.create_series(p_court_id uuid, p_booking_type_code text, p_weekday integer, p_start_time time without time zone, p_end_time time without time zone, p_valid_from date, p_valid_to date, p_title text, p_displace boolean DEFAULT false)
 RETURNS TABLE(series_id uuid, created_count integer, displaced_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := private.current_member_id();
  v_type public.booking_types%rowtype;
  v_series_id uuid; v_created integer := 0; v_displaced integer := 0; v_conflicts integer;
  v_occ record; v_conflict record; v_court_name text;
begin
  perform set_config('tcm.protokoll_sammel', (jsonb_build_object('ereignis', 'serie_anlegen', 'titel', p_title))::text, true);
  if not private.darf_plaetze() then
    raise exception 'Serien können nur Administratoren anlegen.'
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
      '% Termine kollidieren mit bestehenden Buchungen. Vorschau ansehen und Verdrängen bestätigen.',
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
             cancellation_reason = 'Verdrängt durch Blockung: ' || p_title,
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
end; $function$

;

CREATE OR REPLACE FUNCTION public.update_series(p_series_id uuid, p_start_time time without time zone, p_end_time time without time zone, p_title text, p_valid_to date DEFAULT NULL::date, p_displace boolean DEFAULT false)
 RETURNS TABLE(created_count integer, cancelled_count integer, displaced_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform set_config('tcm.protokoll_sammel', (jsonb_build_object('ereignis', 'serie_aendern', 'series_id', p_series_id))::text, true);
  if not private.darf_plaetze() then
    raise exception 'Serien können nur Administratoren ändern.'
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
      '% Termine kollidieren mit bestehenden Buchungen. Vorschau ansehen und Verdrängen bestätigen.',
      v_conflicts using errcode = 'exclusion_violation';
  end if;

  -- Erst die kuenftigen Termine der Serie raeumen, dann neu legen. Sonst
  -- stolpert die neue Lage ueber die alte.
  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me,
         cancellation_reason = 'Serie geändert'
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
             cancellation_reason = 'Verdrängt durch Blockung: ' || btrim(p_title),
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
end; $function$

;

CREATE OR REPLACE FUNCTION public.end_series(p_series_id uuid, p_ab date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := private.current_member_id();
  v_series public.booking_series%rowtype;
  v_ab date := coalesce(p_ab, (now() at time zone 'Europe/Berlin')::date);
  v_anzahl integer;
begin
  perform set_config('tcm.protokoll_sammel', (jsonb_build_object('ereignis', 'serie_beenden', 'series_id', p_series_id))::text, true);
  if not private.darf_plaetze() then
    raise exception 'Serien können nur Administratoren ändern.'
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
end; $function$

;

