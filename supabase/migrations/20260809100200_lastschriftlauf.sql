-- ===========================================================================
-- Der Lastschriftlauf
--
-- Der eigentliche Zweck der ganzen Kette: aus angekuendigten Forderungen wird
-- eine Datei, die der Vorstand bei der Bank einreicht.
--
--   Forderung entsteht -> Vorabankuendigung -> Lastschriftlauf -> Datei
--                                              ^^^^^^^^^^^^^^^^^^^^^^^^
--
-- Der Dateierzeuger steht seit dem ersten Tag in packages/core/src/sepa und
-- war nie angeschlossen. Diese Migration baut das, was er braucht: eine
-- Auswahl, die weiss, wen sie warum nicht mitnimmt, und einen Zustand, der
-- eine eingereichte Datei unveraenderlich macht.
--
-- Drei Entscheidungen tragen den Entwurf:
--
-- 1. EINE LASTSCHRIFT JE ZAHLER. validateBatch bricht ab, sobald eine
--    Mandatsreferenz zweimal in einer Datei steht - zu Recht, denn die Bank
--    kann Rueckgaben sonst nicht zuordnen. Ein Vater mit zwei Kindern hat aber
--    zwei Forderungen ueber dasselbe Mandat. Sie teilen sich deshalb eine
--    end_to_end_id und werden beim Bauen zu einem Posten addiert. Auf dem
--    Kontoauszug steht eine Buchung ueber 240 Euro, nicht drei ueber 80.
--
-- 2. DIE FRIST IST NICHT KONSTRUIERBAR ZU UMGEHEN. Sie haengt an der
--    Forderung (notified_at + sepa.prenotification_days) und wird zweifach
--    durchgesetzt: bei der Auswahl und noch einmal im Trigger auf debit_items.
--    Dazu werden die direkten Schreibrechte auf debit_batches und debit_items
--    entzogen - sonst fuehrte ein Insert an beidem vorbei.
--
-- 3. DIE DATEI IST EIN BELEG. Sie wird einmal gebaut und abgelegt, nicht bei
--    jedem Aufruf neu erzeugt: aendert spaeter jemand einen Nachnamen, laege
--    eine andere Datei vor als die, die die Bank bekommen hat.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Was bisher fehlte: das Konto des Vereins
--
-- buildPain008 verlangt die IBAN des Zahlungsempfaengers. In settings standen
-- bisher nur Glaeubiger-ID und Name - ohne Konto laesst sich keine Datei
-- bauen.
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
     '"booking_displaced,booking_cancelled,booking_removed,application_new,charge_announced"'::jsonb,
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
    ('sepa.creditor_iban', '""'::jsonb, 'text', 'IBAN des Vereinskontos',
     'Auf dieses Konto werden die Lastschriften gutgeschrieben. Ohne sie laesst '
     'sich keine Datei erzeugen.'),
    ('sepa.creditor_bic', '""'::jsonb, 'text', 'BIC des Vereinskontos',
     'Optional. Fehlt sie, traegt die Datei NOTPROVIDED - das reicht innerhalb '
     'des SEPA-Raums.'),
    ('sepa.pain_version', '"pain.008.001.08"'::jsonb, 'text', 'Format der Lastschriftdatei',
     'Mit der Hausbank abklaeren.'),
    ('sepa.prenotification_days', '14'::jsonb, 'integer', 'Vorabankuendigung in Tagen',
     'Pflicht vor jedem Einzug. So viele Tage muessen zwischen Ankuendigung '
     'und Faelligkeit liegen.'),
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

-- ---------------------------------------------------------------------------
-- Das Protokoll kennt jetzt auch Lesezugriffe
--
-- Bisher hielt change_log nur Aenderungen fest, geschrieben vom Trigger.
-- Genau eine Stelle im System gibt entschluesselte IBANs heraus
-- (debit_batch_payload), und dass sie benutzt wurde, gehoert festgehalten -
-- ein Lesezugriff auf dreihundert Bankverbindungen ist folgenreicher als die
-- meisten Aenderungen.
-- ---------------------------------------------------------------------------
alter table public.change_log drop constraint if exists change_log_action_known;
alter table public.change_log add constraint change_log_action_known
  check (action in ('insert', 'update', 'delete', 'read'));

comment on table public.change_log is
  'Anhaengetabelle. Wird vom Trigger private.log_change und von den wenigen '
  'RPCs geschrieben, die besonders schutzbeduerftige Daten herausgeben; '
  'authenticated hat kein Schreibrecht, das Protokoll ist damit nicht '
  'faelschbar.';

-- ---------------------------------------------------------------------------
-- Die Buendelung braucht ein Feld
-- ---------------------------------------------------------------------------
alter table public.debit_items
  add column if not exists end_to_end_id text;

comment on column public.debit_items.end_to_end_id is
  'Kennung der Lastschrift, die dieser Posten mittraegt. Mehrere Posten '
  'desselben Zahlers teilen sie sich - sie werden in der Datei zu einer '
  'Buchung addiert, und ein Ruecklaeufer trifft sie alle zusammen.';

create index if not exists debit_items_end_to_end_idx
  on public.debit_items (end_to_end_id);

-- ---------------------------------------------------------------------------
-- Kein Weg an den RPCs vorbei
--
-- Bis hierher konnte die Oberflaeche direkt in debit_batches und debit_items
-- schreiben. Damit waere jede Fristpruefung eine Empfehlung gewesen.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.debit_batches from authenticated;
revoke insert, update, delete on public.debit_items   from authenticated;

-- ---------------------------------------------------------------------------
-- Die Frist, zum zweiten Mal
--
-- Die Auswahl in add_charges_to_debit_batch beruecksichtigt sie schon. Dieser
-- Trigger ist der Riegel darunter: selbst ein direkter Insert - von einer
-- kuenftigen RPC, einem Skript, einem Missgriff - kommt nicht daran vorbei.
-- ---------------------------------------------------------------------------
create or replace function private.guard_prenotification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_faellig date;
  v_frist integer := public.setting_int('sepa.prenotification_days');
  c record;
begin
  select collection_date into v_faellig
  from public.debit_batches where id = new.batch_id;

  select status, notified_at, due_date, member_id into c
  from public.charges where id = new.charge_id;

  if c.status is distinct from 'notified' then
    raise exception
      'Diese Forderung ist nicht angekuendigt. Ohne Vorabankuendigung darf nicht eingezogen werden.'
      using errcode = 'invalid_parameter_value';
  end if;

  if v_faellig < (c.notified_at at time zone 'Europe/Berlin')::date + v_frist then
    raise exception
      'Zwischen Ankuendigung und Faelligkeit muessen % Tage liegen.', v_frist
      using errcode = 'invalid_parameter_value';
  end if;

  -- Leicht zu uebersehen und trotzdem wichtig: wer eine Faelligkeit zum 15.
  -- angekuendigt hat, darf nicht am 10. einziehen, auch wenn die 14 Tage
  -- rechnerisch laengst um sind.
  if c.due_date is not null and v_faellig < c.due_date then
    raise exception
      'Angekuendigt war der %. Frueher darf nicht eingezogen werden.',
      to_char(c.due_date, 'DD.MM.YYYY')
      using errcode = 'invalid_parameter_value';
  end if;

  return new;
end; $$;

create trigger debit_items_guard_prenotification
  before insert on public.debit_items
  for each row execute function private.guard_prenotification();

/**
 * Ein belegter Lauf laesst sich nicht vorziehen.
 *
 * Ohne diesen Riegel liesse sich die Frist nachtraeglich unterlaufen: erst
 * korrekt zusammenstellen, dann collection_date um zwei Wochen nach vorn.
 */
create or replace function private.guard_collection_date()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.collection_date < old.collection_date
     and exists (select 1 from public.debit_items where batch_id = old.id) then
    raise exception
      'Der Faelligkeitstag laesst sich nicht vorziehen, solange Posten am Lauf haengen.'
      using errcode = 'invalid_parameter_value';
  end if;
  return new;
end; $$;

create trigger debit_batches_guard_collection_date
  before update of collection_date on public.debit_batches
  for each row execute function private.guard_collection_date();

-- ---------------------------------------------------------------------------
-- Der Lauf
-- ---------------------------------------------------------------------------

/** Einen leeren Lastschriftlauf anlegen. */
create or replace function public.create_debit_batch(
  p_title text, p_collection_date date
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

  insert into public.debit_batches (title, collection_date, created_by)
  values (btrim(p_title), p_collection_date, private.current_member_id())
  returning id into v_id;

  return v_id;
end; $$;

revoke execute on function public.create_debit_batch(text, date) from public, anon;
grant  execute on function public.create_debit_batch(text, date) to authenticated;

/**
 * Wer koennte in diesen Lauf - und wer nicht, und warum?
 *
 * Eine Zeile je spaeterer Lastschrift, also je Zahler und Mandat. Der Grund
 * steht als ganzer deutscher Satz daneben; damit stehen alle Ausschlussgruende
 * an einer Stelle statt verteilt ueber RPC, Server Action und Komponente.
 *
 * Der Mindestbetrag wirkt hier und nur hier - und je Zahler ueber alle seine
 * Forderungen. Sonst wuerde eine Familie mit drei Kindern zu je 3 Euro nie
 * eingezogen, obwohl neun Euro zusammenkommen.
 */
create or replace function public.debit_batch_candidates(
  p_collection_date date,
  p_kinds public.charge_kind[] default null
)
returns table (
  payer_id uuid, payer_name text, charge_ids uuid[], positionen integer,
  arten text, amount_cents integer,
  mandate_id uuid, mandate_reference text, mandate_scope public.mandate_scope,
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
    -- Je Forderung das engste passende Mandat: ein Beitragsmandat traegt
    -- Beitrag, Arbeitsdienst und Pfand, aber weder Getraenke noch Gastgebuehr.
    select o.*, sm.id as mandat_id, sm.reference, sm.scope, sm.signed_on, sm.last_used_on
    from offen o
    left join lateral (
      select s.* from public.sepa_mandates s
      where s.member_id = o.payer_id and s.status = 'active'
        and (s.scope = 'all_payments' or o.kind in ('fee', 'work_duty', 'deposit'))
      order by case when s.scope = 'fees_only' then 0 else 1 end
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
    x.scope,
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
      max(m.scope::text)::public.mandate_scope as scope,
      case
        when bool_or(m.mandat_id is null) then
          'Fuer diesen Zahler ist kein Mandat hinterlegt, das alle diese Forderungen deckt. '
          'Ein Mandat nur fuer Beitraege traegt den Getraenkeeinzug nicht.'
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

/**
 * Die einzugsfaehigen Forderungen in den Lauf aufnehmen.
 *
 * Alle Posten eines Zahlers bekommen dieselbe end_to_end_id. Mandatsreferenz,
 * Unterschriftsdatum und Sequenztyp werden kopiert: die Datei muss
 * reproduzierbar bleiben, auch wenn das Mandat spaeter geaendert oder
 * widerrufen wird.
 */
create or replace function public.add_charges_to_debit_batch(
  p_batch_id uuid, p_payer_ids uuid[] default null
)
returns table (aufgenommen integer, uebersprungen integer, summe_cents integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_faellig date;
  v_status public.debit_batch_status;
  v_auf integer;
  v_summe integer;
  v_moeglich integer;
begin
  if not private.is_admin() then
    raise exception 'Lastschriftlaeufe fuellen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select collection_date, status into v_faellig, v_status
  from public.debit_batches where id = p_batch_id;

  if v_faellig is null then
    raise exception 'Diesen Lastschriftlauf gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'draft' then
    raise exception 'Dieser Lauf ist bereits erzeugt und laesst sich nicht mehr aendern.'
      using errcode = 'invalid_parameter_value';
  end if;

  with kandidat as (
    select k.* from public.debit_batch_candidates(v_faellig) k
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
  from public.debit_batch_candidates(v_faellig) k
  where not k.einzugsfaehig;

  return query select v_auf, coalesce(v_moeglich, 0), v_summe;
end; $$;

revoke execute on function public.add_charges_to_debit_batch(uuid, uuid[]) from public, anon;
grant  execute on function public.add_charges_to_debit_batch(uuid, uuid[]) to authenticated;

/** Einen Posten wieder herausnehmen, solange der Lauf ein Entwurf ist. */
create or replace function public.remove_charge_from_debit_batch(p_item_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_batch uuid; v_status public.debit_batch_status;
begin
  if not private.is_admin() then
    raise exception 'Lastschriftlaeufe aendern duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select i.batch_id, b.status into v_batch, v_status
  from public.debit_items i join public.debit_batches b on b.id = i.batch_id
  where i.id = p_item_id;

  if v_batch is null then
    raise exception 'Diesen Posten gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'draft' then
    raise exception 'Aus einem erzeugten Lauf laesst sich nichts mehr herausnehmen.'
      using errcode = 'invalid_parameter_value';
  end if;

  delete from public.debit_items where id = p_item_id;

  update public.debit_batches b
     set total_cents = (select coalesce(sum(amount_cents), 0)::integer
                        from public.debit_items where batch_id = v_batch),
         item_count  = (select count(distinct end_to_end_id)::integer
                        from public.debit_items where batch_id = v_batch)
   where b.id = v_batch;
end; $$;

revoke execute on function public.remove_charge_from_debit_batch(uuid) from public, anon;
grant  execute on function public.remove_charge_from_debit_batch(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Die Datei
-- ---------------------------------------------------------------------------

/**
 * Alles, was buildPain008 braucht - inklusive der IBAN im Klartext.
 *
 * Das ist die einzige Funktion im ganzen System, die entschluesselte IBANs
 * herausgibt, und sie ist bewusst eng gebaut:
 *
 *   - kein Parameter fuer ein einzelnes Mitglied. Man kann nicht gezielt nach
 *     einer Person fragen, nur nach einem vollstaendigen Lauf.
 *   - nur im Status 'draft', also nur in dem Moment, in dem die Datei
 *     entsteht. Danach liegt die Datei im Storage und wird von dort geholt.
 *   - jeder Aufruf steht im Aenderungsprotokoll.
 *
 * Die erzeugte Datei enthaelt alle IBANs im Klartext. Sie ist damit genauso
 * schutzbeduerftig wie bank_accounts selbst - deshalb liegt sie in einem
 * privaten Bucket ohne oeffentliche Adresse und ohne Loeschrecht.
 */
create or replace function public.debit_batch_payload(p_batch_id uuid)
returns table (
  creditor_name text, creditor_id text, creditor_iban text, creditor_bic text,
  collection_date date, pain_version text, title text,
  end_to_end_id text, debtor_name text, debtor_iban text,
  amount_cents integer, remittance_info text, kind public.charge_kind,
  mandate_reference text, mandate_signed_on date, mandate_last_used_on date,
  sequence_type public.mandate_sequence, mandate_scope public.mandate_scope
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
      i.sequence_type,
      sm.scope
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

/**
 * Die Datei ist gebaut und abgelegt.
 *
 * Prueft nach, ob Summe und Anzahl zu dem passen, was tatsaechlich in
 * debit_items steht: ein Aufrufer, der beim Bauen etwas weggelassen hat,
 * darf den Lauf nicht als erzeugt markieren. Danach ist der Lauf zu - ein
 * zweites Erzeugen scheitert am Status, die Datei kann nicht ueberschrieben
 * werden.
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

  select status into v_status from public.debit_batches where id = p_batch_id;
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
   where c.id in (select charge_id from public.debit_items where batch_id = p_batch_id);
end; $$;

revoke execute on function public.mark_debit_batch_generated(uuid, text, integer, integer)
  from public, anon;
grant execute on function public.mark_debit_batch_generated(uuid, text, integer, integer)
  to authenticated;

/**
 * Der Vorstand hat die Datei im Onlinebanking hochgeladen.
 *
 * Hier und nicht beim Erzeugen wird last_used_on der Mandate fortgeschrieben:
 * das traegt die 36-Monats-Regel, und eine Datei, die nie eingereicht wurde,
 * darf ein Mandat nicht am Leben halten.
 */
create or replace function public.mark_debit_batch_submitted(
  p_batch_id uuid, p_submitted_on date default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status public.debit_batch_status; v_faellig date;
begin
  if not private.is_admin() then
    raise exception 'Lastschriftlaeufe einreichen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select status, collection_date into v_status, v_faellig
  from public.debit_batches where id = p_batch_id;

  if v_status is null then
    raise exception 'Diesen Lastschriftlauf gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'generated' then
    raise exception 'Nur ein erzeugter Lauf laesst sich als eingereicht vermerken.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.debit_batches set status = 'submitted' where id = p_batch_id;

  update public.sepa_mandates sm
     set last_used_on = coalesce(p_submitted_on, v_faellig),
         sequence_type = 'RCUR'
   where sm.id in (select mandate_id from public.debit_items where batch_id = p_batch_id);
end; $$;

revoke execute on function public.mark_debit_batch_submitted(uuid, date) from public, anon;
grant  execute on function public.mark_debit_batch_submitted(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Uebersichten
-- ---------------------------------------------------------------------------

create or replace function public.debit_batch_overview(p_limit integer default 24)
returns table (
  id uuid, title text, collection_date date, status public.debit_batch_status,
  total_cents integer, item_count integer, positionen integer, zurueck integer,
  hat_datei boolean, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    b.id, b.title, b.collection_date, b.status, b.total_cents, b.item_count,
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

/** Die Posten eines Laufs, zusammengefasst zu je einer Lastschrift. */
create or replace function public.debit_batch_items(p_batch_id uuid)
returns table (
  end_to_end_id text, payer_name text, mitglieder text, positionen integer,
  amount_cents integer, mandate_reference text,
  result public.debit_item_result, return_reason text, returned_on date
)
language sql stable security definer set search_path = '' as $$
  select
    i.end_to_end_id,
    max(btrim(coalesce(z.first_name, '') || ' ' || coalesce(z.last_name, ''))),
    string_agg(distinct btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')), ', '),
    count(*)::integer,
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
-- Der Ablageort der Datei
--
-- Privat, nur fuer Admins lesbar, ohne Aenderungs- und ohne Loeschrecht: eine
-- eingereichte Lastschriftdatei ist ein Buchungsbeleg. Der oeffentliche
-- Schluessel reicht damit aus - kein Dienstschluessel im Web-Prozess.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('sepa', 'sepa', false)
on conflict (id) do nothing;

drop policy if exists sepa_admin_read   on storage.objects;
drop policy if exists sepa_admin_insert on storage.objects;

create policy sepa_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'sepa' and (select private.is_admin()));

create policy sepa_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sepa' and (select private.is_admin()));
