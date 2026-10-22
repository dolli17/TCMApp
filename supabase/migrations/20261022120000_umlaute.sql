-- ===========================================================================
-- Umlaute in Texten aus der Datenbank (U21, O13)
--
-- Was Menschen lesen, schreibt jetzt echte Umlaute und Eszett statt ae/oe/ue/ss:
-- Fehlermeldungen, Benachrichtigungen, Forderungsbeschreibungen (Getraenke,
-- Gastgebuehr), Gruende und Stornotexte, Einstellungstexte.
--
-- Die Funktionen unten sind die bisherigen, Wort fuer Wort, nur die Texte in
-- den Literalen sind umgeschrieben. Signaturen und Rechte bleiben (create or
-- replace). Codes, Schluessel, Enum-Werte und Kommentare bleiben ASCII, etwa
-- 'geloescht' im Aenderungsprotokoll oder die Schluessel von my_onboarding.
--
-- Bereits gespeicherte Benachrichtigungen und Forderungen bleiben, wie sie
-- sind. Die Bankdatei schreibt Umlaute beim Erzeugen wieder um (B27,
-- sepaText in @tcm/core).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Einstellungen: ensure_default_settings legt nur fehlende an, deshalb die
-- bestehenden Zeilen hier. Nur, wo noch der alte Text steht.
-- ---------------------------------------------------------------------------

update public.settings set label = 'Schließzeit'
 where key = 'booking.closing_time' and label = 'Schliesszeit';
update public.settings set description = 'Späteste Endzeit einer Buchung.'
 where key = 'booking.closing_time' and description = 'Spaeteste Endzeit einer Buchung.';
update public.settings set label = 'Gastgebühr in Cent'
 where key = 'booking.guest_fee_cents' and label = 'Gastgebuehr in Cent';
update public.settings set description = '0 = keine Gebühr. Sonst wird sie je Gast dem buchenden Mitglied berechnet und mit der nächsten Lastschrift eingezogen.'
 where key = 'booking.guest_fee_cents' and description = '0 = keine Gebuehr. Sonst wird sie je Gast dem buchenden Mitglied berechnet und mit der naechsten Lastschrift eingezogen.';
update public.settings set description = 'Rollierend: buchbar ist alles innerhalb der nächsten X Tage.'
 where key = 'booking.lead_days' and description = 'Rollierend: buchbar ist alles innerhalb der naechsten X Tage.';
update public.settings set description = 'Wie viele künftige Buchungen ein Mitglied gleichzeitig haben darf. Mitspieler zählen mit. 0 bedeutet unbegrenzt.'
 where key = 'booking.max_open_bookings' and description = 'Wie viele kuenftige Buchungen ein Mitglied gleichzeitig haben darf. Mitspieler zaehlen mit. 0 bedeutet unbegrenzt.';
update public.settings set label = 'Öffnungszeit'
 where key = 'booking.opening_time' and label = 'Oeffnungszeit';
update public.settings set description = 'Früheste Startzeit einer Buchung.'
 where key = 'booking.opening_time' and description = 'Frueheste Startzeit einer Buchung.';
update public.settings set description = 'Startzeiten müssen auf dieses Raster fallen (30 = :00 und :30).'
 where key = 'booking.slot_minutes' and description = 'Startzeiten muessen auf dieses Raster fallen (30 = :00 und :30).';
update public.settings set description = 'Beträge darunter werden nicht eingezogen, sondern beim nächsten Lauf mitgenommen. Die Schwelle gilt je Zahler über alle offenen Forderungen.'
 where key = 'drinks.min_debit_cents' and description = 'Betraege darunter werden nicht eingezogen, sondern beim naechsten Lauf mitgenommen. Die Schwelle gilt je Zahler ueber alle offenen Forderungen.';
update public.settings set label = 'Storno-Fenster Getränke'
 where key = 'drinks.void_window_minutes' and label = 'Storno-Fenster Getraenke';
update public.settings set description = 'So lange darf ein Mitglied eine eigene Fehlbuchung selbst zurücknehmen.'
 where key = 'drinks.void_window_minutes' and description = 'So lange darf ein Mitglied eine eigene Fehlbuchung selbst zuruecknehmen.';
update public.settings set description = 'Fälligkeitsdatum der Jahresbeitrags-Lastschrift.'
 where key = 'fees.annual_run_day' and description = 'Faelligkeitsdatum der Jahresbeitrags-Lastschrift.';
update public.settings set description = 'Kommagetrennte Liste. Getrennt von den E-Mail-Arten, weil ein Push sofort da ist und auch Erfreuliches melden darf, das als Mail nur Lärm wäre.'
 where key = 'notifications.push_kinds' and description = 'Kommagetrennte Liste. Getrennt von den E-Mail-Arten, weil ein Push sofort da ist und auch Erfreuliches melden darf, das als Mail nur Laerm waere.';
update public.settings set label = 'Aufbewahrung des Änderungsprotokolls in Tagen'
 where key = 'privacy.change_log_days' and label = 'Aufbewahrung des Aenderungsprotokolls in Tagen';
update public.settings set description = 'Ältere Einträge werden beim Aufräumlauf entfernt. 1095 Tage sind drei Jahre.'
 where key = 'privacy.change_log_days' and description = 'Aeltere Eintraege werden beim Aufraeumlauf entfernt. 1095 Tage sind drei Jahre.';
update public.settings set description = 'Optional. Fehlt sie, trägt die Datei NOTPROVIDED - das reicht innerhalb des SEPA-Raums.'
 where key = 'sepa.creditor_bic' and description = 'Optional. Fehlt sie, traegt die Datei NOTPROVIDED - das reicht innerhalb des SEPA-Raums.';
update public.settings set description = 'Auf dieses Konto werden die Lastschriften gutgeschrieben. Ohne sie lässt sich keine Datei erzeugen.'
 where key = 'sepa.creditor_iban' and description = 'Auf dieses Konto werden die Lastschriften gutgeschrieben. Ohne sie laesst sich keine Datei erzeugen.';
update public.settings set label = 'Gläubiger-Identifikationsnummer'
 where key = 'sepa.creditor_id' and label = 'Glaeubiger-Identifikationsnummer';
update public.settings set description = 'Aus dem eBuSy-Backend übernehmen. Muss unverändert bleiben, damit die Bestandsmandate gültig bleiben.'
 where key = 'sepa.creditor_id' and description = 'Aus dem eBuSy-Backend uebernehmen. Muss unveraendert bleiben, damit die Bestandsmandate gueltig bleiben.';
update public.settings set label = 'Name des Zahlungsempfängers'
 where key = 'sepa.creditor_name' and label = 'Name des Zahlungsempfaengers';
update public.settings set description = 'Fassung des Textes, mit dem Mitglieder ihr SEPA-Mandat online erteilen. Wird hochgezählt, wenn sich der Text in private.sepa_mandatstext ändert.'
 where key = 'sepa.mandate_text_version' and description = 'Fassung des Textes, mit dem Mitglieder ihr SEPA-Mandat online erteilen. Wird hochgezaehlt, wenn sich der Text in private.sepa_mandatstext aendert.';
update public.settings set description = 'Mit der Hausbank abklären.'
 where key = 'sepa.pain_version' and description = 'Mit der Hausbank abklaeren.';
update public.settings set label = 'Vorabankündigung in Tagen'
 where key = 'sepa.prenotification_days' and label = 'Vorabankuendigung in Tagen';
update public.settings set description = 'Pflicht vor jedem Einzug. So viele Tage müssen zwischen Ankündigung und Fälligkeit liegen.'
 where key = 'sepa.prenotification_days' and description = 'Pflicht vor jedem Einzug. So viele Tage muessen zwischen Ankuendigung und Faelligkeit liegen.';

-- ---------------------------------------------------------------------------
-- Funktionen
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_membership_application(p_application_id uuid, p_number text DEFAULT NULL::text, p_fee_type_ids uuid[] DEFAULT NULL::uuid[], p_started_on date DEFAULT NULL::date, p_auth_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(member_id uuid, membership_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_a      public.membership_applications;
  v_id     uuid;
  v_nummer text;
  v_arten  uuid[];
  v_code   text;
  v_wert   jsonb;
begin
  if not private.is_admin() then
    raise exception 'Anträge bearbeiten dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_a from public.membership_applications where id = p_application_id;
  if not found then
    raise exception 'Diesen Antrag gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if v_a.status <> 'new' then
    raise exception 'Dieser Antrag wurde bereits bearbeitet.'
      using errcode = 'check_violation';
  end if;

  -- Ohne Angabe (null) die im Antrag gewuenschte Beitragsart. Ein leeres
  -- Array heisst "spaeter festlegen": dann gibt es keine Zuordnung.
  v_arten := case
    when p_fee_type_ids is not null then p_fee_type_ids
    when v_a.desired_fee_type_id is not null then array[v_a.desired_fee_type_id]
    else '{}'::uuid[]
  end;

  -- create_member prueft die Pflichtangaben. Ein alter Antrag, dem etwas
  -- fehlt, laesst sich nicht annehmen; der Vorstand legt das Mitglied dann
  -- direkt an.
  v_id := public.create_member(
    p_first_name   => v_a.first_name,
    p_last_name    => v_a.last_name,
    p_email        => v_a.email::text,
    p_birthday     => v_a.birthday,
    p_gender       => v_a.gender,
    p_salutation   => v_a.salutation,
    p_title        => v_a.title,
    p_phone        => v_a.phone,
    p_mobile       => v_a.mobile,
    p_street       => v_a.street,
    p_postcode     => v_a.postcode,
    p_city         => v_a.city,
    p_country_code => coalesce(v_a.country_code, 'DE'),
    p_notes        => v_a.message,
    p_number       => p_number,
    p_started_on   => coalesce(p_started_on, private.heute()),
    p_fee_type_ids => v_arten,
    p_auth_user_id => p_auth_user_id
  );

  -- Neue Antraege erheben Notfallkontakt und Erziehungsberechtigte nicht
  -- mehr, das passiert im Onboarding. Aeltere Antraege haben sie noch; dann
  -- gehen sie nicht verloren.
  update public.members set
    emergency_contact_name     = v_a.emergency_contact_name,
    emergency_contact_phone    = v_a.emergency_contact_phone,
    emergency_contact_relation = v_a.emergency_contact_relation,
    guardian_name              = v_a.guardian_name,
    guardian_email             = v_a.guardian_email
  where id = v_id;

  -- Einwilligungen aus aelteren Antraegen uebernehmen. Erteilt wurden sie
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

  return query select v_id, v_nummer;
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_bank_account(p_member_id uuid, p_iban text, p_holder text DEFAULT NULL::text, p_bank_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_iban   text;
  v_m      public.members;
  v_id     uuid;
  v_finger bytea;
begin
  if not private.is_admin() then
    raise exception 'Bankverbindungen pflegen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_m from public.members where id = p_member_id;
  if not found then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  v_iban := upper(replace(btrim(coalesce(p_iban, '')), ' ', ''));

  if not public.iban_is_valid(v_iban) then
    raise exception 'Diese IBAN ist nicht gültig. Bitte die Ziffern prüfen.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_finger := private.fingerprint_iban(v_iban);

  if exists (select 1 from public.bank_accounts
              where member_id = p_member_id and iban_fingerprint = v_finger) then
    raise exception 'Diese Bankverbindung ist bei diesem Mitglied bereits erfasst.'
      using errcode = 'unique_violation';
  end if;

  insert into public.bank_accounts
    (member_id, iban_encrypted, iban_fingerprint, iban_last4, holder, bank_name)
  values (
    p_member_id,
    private.encrypt_iban(v_iban),
    v_finger,
    right(v_iban, 4),
    coalesce(nullif(btrim(coalesce(p_holder, '')), ''), v_m.first_name || ' ' || v_m.last_name),
    nullif(btrim(coalesce(p_bank_name, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$function$;

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
end; $function$;

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
end; $function$;

CREATE OR REPLACE FUNCTION public.anonymize_member(p_member_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lauf integer;
begin
  if not private.is_admin() then
    raise exception 'Mitglieder anonymisieren dürfen nur Administratoren.'
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
     set status = 'revoked', revoked_on = coalesce(revoked_on, private.heute())
   where member_id = p_member_id and status = 'active';
  delete from public.bank_accounts where member_id = p_member_id;
  delete from public.member_attribute_values where member_id = p_member_id;

  update public.members set
    first_name = 'Gelöscht',
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
    notes = 'Anonymisiert am ' || to_char(private.heute(), 'DD.MM.YYYY')
            || coalesce(': ' || nullif(btrim(coalesce(p_reason, '')), ''), '')
  where id = p_member_id;

  delete from public.member_roles where member_id = p_member_id and role = 'admin';
end;
$function$;

CREATE OR REPLACE FUNCTION public.archive_member(p_member_id uuid, p_force boolean DEFAULT false, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(cancelled_bookings integer, open_charges integer, open_amount_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ich      uuid := private.current_member_id();
  v_offen    integer;
  v_betrag   integer;
  v_gecancelt integer := 0;
  v_buchung  record;
  v_anmeldung record;
  v_posten   uuid[];
  v_laeufe   uuid[];
begin
  if not private.is_admin() then
    raise exception 'Mitglieder archivieren dürfen nur Administratoren.'
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
    raise exception 'Es sind noch % Forderungen über % Euro offen. Zum Archivieren ausdrücklich bestätigen.',
      v_offen, to_char(v_betrag / 100.0, 'FM999G999D00')
      using errcode = 'check_violation';
  end if;

  -- Aus Einzuegen ohne Datei herausnehmen: das Mandat wird gleich
  -- widerrufen, eine Lastschrift darauf kaeme zurueck. Die Forderungen sind
  -- danach wieder offen, wie bei einzug_mitglied_entfernen.
  with weg as (
    delete from public.debit_items di
     using public.debit_batches b, public.charges c
     where b.id = di.batch_id and b.status = 'draft'
       and c.id = di.charge_id and c.payer_id = p_member_id
    returning di.charge_id, di.batch_id
  )
  select array_agg(charge_id), array_agg(distinct batch_id) into v_posten, v_laeufe from weg;

  if v_posten is not null then
    update public.charges
       set status = 'open', notified_at = null, due_date = null
     where id = any (v_posten) and status = 'notified';

    update public.debit_batches b
       set total_cents = (select coalesce(sum(i.amount_cents), 0)::integer
                          from public.debit_items i where i.batch_id = b.id),
           item_count  = (select count(distinct i.end_to_end_id)::integer
                          from public.debit_items i where i.batch_id = b.id)
     where b.id = any (v_laeufe);
  end if;

  -- Kuenftige Buchungen stornieren, Gastgebuehren erlassen und alle
  -- Mitspieler benachrichtigen.
  for v_buchung in
    select b.id, b.court_id, b.slot
    from public.bookings b
    where b.member_id = p_member_id and b.status = 'active' and lower(b.slot) > now()
  loop
    update public.bookings set
      status = 'cancelled', cancelled_at = now(), cancelled_by = v_ich,
      cancellation_reason = 'Mitglied archiviert'
    where id = v_buchung.id;

    perform private.waive_guest_charges(v_buchung.id);

    insert into public.notifications (member_id, kind, title, body)
    select bp.member_id, 'booking_cancelled', 'Buchung abgesagt',
           'Eine Buchung am ' ||
           to_char(lower(v_buchung.slot) at time zone 'Europe/Berlin', 'DD.MM.YYYY "um" HH24:MI') ||
           ' wurde abgesagt, weil das buchende Mitglied ausgetreten ist.'
    from public.booking_players bp
    where bp.booking_id = v_buchung.id and bp.member_id <> p_member_id;

    v_gecancelt := v_gecancelt + 1;
  end loop;

  -- Mitspielerplaetze in kuenftigen fremden Buchungen freigeben.
  for v_buchung in
    select b.id, b.member_id
    from public.booking_players bp
    join public.bookings b on b.id = bp.booking_id
    where bp.member_id = p_member_id and b.status = 'active' and lower(b.slot) > now()
  loop
    delete from public.booking_players
     where booking_id = v_buchung.id and member_id = p_member_id;

    insert into public.notifications (member_id, kind, title, body)
    values (v_buchung.member_id, 'player_left', 'Ein Mitspieler ist ausgetreten',
            format('%s spielt am %s nicht mit, weil er oder sie ausgetreten ist.',
                   private.member_label(p_member_id), private.booking_label(v_buchung.id)));
  end loop;

  -- Von kuenftigen Veranstaltungen abmelden, wie event_abmelden: vor dem
  -- Anmeldeschluss faellt die Forderung weg und der Naechste rueckt nach,
  -- danach steht sie fest.
  for v_anmeldung in
    select r.id, r.status, r.event_id
    from public.event_registrations r
    join public.events e on e.id = r.event_id
    where r.member_id = p_member_id and r.status in ('registered', 'waitlisted')
      and e.status <> 'cancelled' and e.starts_at > now()
    order by r.event_id
  loop
    perform 1 from public.events where id = v_anmeldung.event_id for update;

    update public.event_registrations
       set status = 'cancelled', cancelled_at = now(), waitlisted_at = null
     where id = v_anmeldung.id;

    if v_anmeldung.status = 'registered'
       and now() < (select private.event_schluss(e) from public.events e where e.id = v_anmeldung.event_id) then
      perform private.event_forderung_abgleichen(v_anmeldung.id);
      perform private.event_nachruecken(v_anmeldung.event_id);
    end if;
  end loop;

  -- Laufende Mitgliedschaft beenden, sofern noch offen.
  update public.memberships set
    ended_on = coalesce(ended_on, private.heute()),
    cancellation_date = coalesce(cancellation_date, private.heute()),
    cancellation_reason = coalesce(cancellation_reason, nullif(btrim(coalesce(p_reason, '')), '')),
    status = 'ended'
  where member_id = p_member_id and ended_on is null;

  -- Mandate widerrufen, Bankverbindungen stilllegen.
  update public.sepa_mandates
     set status = 'revoked', revoked_on = coalesce(revoked_on, private.heute())
   where member_id = p_member_id and status = 'active';
  update public.bank_accounts set active = false
   where member_id = p_member_id and active;

  -- Adminrechte enden mit der Mitgliedschaft.
  delete from public.member_roles where member_id = p_member_id and role = 'admin';

  -- Der Sperrvermerk wirkt ueber hat_zugang sofort. Den Bann im Auth-Konto
  -- setzt das Web danach ueber member-login.
  update public.members set
    status = 'archived',
    login_disabled_at = coalesce(login_disabled_at, now()),
    notes = case when nullif(btrim(coalesce(p_reason, '')), '') is null then notes
                 else coalesce(notes || E'\n', '') || 'Archiviert: ' || btrim(p_reason) end
  where id = p_member_id;

  return query select v_gecancelt, v_offen, v_betrag;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_text text;
begin
  if v_me is null then
    raise exception 'Nur Mitglieder können stornieren.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.status = 'cancelled' then return; end if;

  if v_booking.member_id is distinct from v_me and not private.darf_plaetze() then
    raise exception 'Du kannst nur deine eigenen Buchungen stornieren.'
      using errcode = 'insufficient_privilege';
  end if;
  -- Admins raeumen auch waehrend der Spielzeit auf, etwa bei Platzsperrung.
  if lower(v_booking.slot) <= now() and not private.darf_plaetze() then
    raise exception 'Die Spielzeit hat bereits begonnen.' using errcode = 'check_violation';
  end if;

  -- Der Text wird vor dem Storno gebildet: booking_label liest die Buchung,
  -- und die soll den Zeitpunkt nennen, nicht den Status.
  v_text := format('Die Buchung am %s wurde storniert.', private.booking_label(p_booking_id));
  if p_reason is not null and btrim(p_reason) <> '' then
    v_text := v_text || ' Grund: ' || btrim(p_reason);
  end if;

  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me,
         cancellation_reason = p_reason, partner_wanted = false
   where id = p_booking_id;

  -- Vor Spielbeginn wird die Gastgebuehr erlassen, danach bleibt sie stehen.
  if lower(v_booking.slot) > now() then
    perform private.waive_guest_charges(p_booking_id);
  end if;

  -- Alle Betroffenen ausser dem, der storniert hat: der weiss es bereits.
  insert into public.notifications (member_id, kind, title, body)
  select distinct p.member_id, 'booking_cancelled', 'Eine Buchung wurde storniert', v_text
  from (
    select v_booking.member_id as member_id
    union
    select bp.member_id from public.booking_players bp
    where bp.booking_id = p_booking_id and bp.member_id is not null
  ) p
  where p.member_id is not null and p.member_id <> v_me;
end; $function$;

CREATE OR REPLACE FUNCTION public.cancel_series_occurrence(p_booking_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
begin
  if not private.darf_plaetze() then
    raise exception 'Nur Administratoren können Serientermine absagen.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Diesen Termin gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.series_id is null then
    raise exception 'Dieser Termin gehört zu keiner Serie.'
      using errcode = 'invalid_parameter_value';
  end if;
  if v_booking.status = 'cancelled' then return; end if;

  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me,
         cancellation_reason = coalesce(nullif(btrim(p_reason), ''), 'Fällt aus')
   where id = p_booking_id;
end; $function$;

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
end; $function$;

CREATE OR REPLACE FUNCTION public.close_billing_period(p_year integer, p_month integer)
 RETURNS TABLE(buchungen integer, mitglieder integer, summe_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_heute date := (now() at time zone 'Europe/Berlin')::date;
  v_id uuid;
  v_status public.billing_period_status;
begin
  if not private.is_admin() then
    raise exception 'Abrechnungszeiträume schließen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if make_date(p_year, p_month, 1) >= date_trunc('month', v_heute)::date then
    raise exception
      'Der laufende Monat lässt sich nicht schließen. Danach könnte an der Theke nichts mehr gebucht werden.'
      using errcode = 'invalid_parameter_value';
  end if;

  select id, status into v_id, v_status
  from public.billing_periods where year = p_year and month = p_month;

  if v_id is null then
    raise exception 'Für diesen Monat gibt es keinen Abrechnungszeitraum.'
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
end; $function$;

CREATE OR REPLACE FUNCTION public.complete_debit_batch(p_batch_id uuid)
 RETURNS TABLE(eingezogen integer, zurueck integer, summe_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status public.debit_batch_status; v_ein integer; v_zurueck integer; v_summe integer;
begin
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
end; $function$;

CREATE OR REPLACE FUNCTION public.create_blocking(p_court_ids uuid[], p_von timestamp with time zone, p_bis timestamp with time zone, p_type_code text, p_title text, p_force boolean DEFAULT false)
 RETURNS TABLE(created_count integer, displaced_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := private.current_member_id();
  v_type public.booking_types%rowtype;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_grund text;
  v_created integer := 0; v_displaced integer := 0; v_conflicts integer;
  v_court uuid; v_conflict record; v_court_name text;
begin
  if not private.darf_plaetze() then
    raise exception 'Sperrungen können nur Administratoren anlegen.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_court_ids is null or array_length(p_court_ids, 1) is null then
    raise exception 'Bitte mindestens einen Platz auswählen.'
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
      '% Buchungen liegen in diesem Zeitraum. Bestätige das Verdrängen.',
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
             format('Die Buchung am %s auf %s fällt aus: %s.',
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
end; $function$;

CREATE OR REPLACE FUNCTION public.create_booking(p_court_id uuid, p_starts_at timestamp with time zone, p_booking_type_code text, p_player_member_ids uuid[] DEFAULT '{}'::uuid[], p_guest_names text[] DEFAULT '{}'::text[], p_partner_wanted boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := private.current_member_id();
  v_type public.booking_types%rowtype;
  v_ends_at timestamptz; v_local_start time; v_local_end time;
  v_opening time := public.setting_time('booking.opening_time');
  v_closing time := public.setting_time('booking.closing_time');
  v_grid integer := public.setting_int('booking.slot_minutes');
  v_lead_days integer := public.setting_int('booking.lead_days');
  v_max_open integer := public.setting_int('booking.max_open_bookings');
  v_players integer; v_booking_id uuid; v_blocker text; v_player uuid; v_guest text;
  v_gaeste integer := coalesce(array_length(p_guest_names, 1), 0);
begin
  if v_me is null then
    raise exception 'Nur Mitglieder können buchen.' using errcode = 'insufficient_privilege';
  end if;
  perform private.pruefe_freigeschaltet();

  select * into v_type from public.booking_types where code = p_booking_type_code and active;
  if not found then
    raise exception 'Unbekannte Buchungsart: %', p_booking_type_code
      using errcode = 'invalid_parameter_value';
  end if;
  if v_type.applies_to <> 'booking' then
    raise exception 'Die Art "%" ist eine Blockung und kann nicht regulär gebucht werden.', v_type.name
      using errcode = 'invalid_parameter_value';
  end if;
  -- Beschraenkte Buchungsarten sind seit der Rollenzusammenlegung Admin-Sache.
  if v_type.allowed_roles is not null and not private.is_admin() then
    raise exception 'Für "%" fehlt dir die Berechtigung.', v_type.name
      using errcode = 'insufficient_privilege';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_type.duration_minutes);

  if extract(second from p_starts_at) <> 0
     or (extract(minute from p_starts_at)::integer % v_grid) <> 0 then
    raise exception 'Startzeit muss auf ein %-Minuten-Raster fallen.', v_grid
      using errcode = 'invalid_parameter_value';
  end if;

  v_local_start := (p_starts_at at time zone 'Europe/Berlin')::time;
  v_local_end   := (v_ends_at   at time zone 'Europe/Berlin')::time;

  if v_local_start < v_opening then
    raise exception 'Vor % wird nicht gespielt.', to_char(v_opening, 'HH24:MI')
      using errcode = 'invalid_parameter_value';
  end if;
  if v_local_end > v_closing or v_local_end <= v_local_start then
    raise exception 'Die Buchung endet nach % Uhr.', to_char(v_closing, 'HH24:MI')
      using errcode = 'invalid_parameter_value';
  end if;
  if p_starts_at < now() then
    raise exception 'Dieser Zeitpunkt liegt in der Vergangenheit.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_starts_at > now() + make_interval(days => v_lead_days) then
    raise exception 'Es kann höchstens % Tage im Voraus gebucht werden.', v_lead_days
      using errcode = 'invalid_parameter_value';
  end if;

  v_players := 1 + coalesce(array_length(p_player_member_ids, 1), 0) + v_gaeste;

  -- Wer Mitspieler sucht, darf die Untergrenze noch nicht erfuellen: genau
  -- dafuer ist das Feld da. Die Obergrenze gilt trotzdem.
  if not p_partner_wanted then
    if v_type.requires_partner and v_players < 2 then
      raise exception 'Für "%" musst du mindestens einen Mitspieler angeben.', v_type.name
        using errcode = 'invalid_parameter_value';
    end if;
    if v_players < v_type.min_players then
      raise exception '"%" braucht mindestens % Spieler.', v_type.name, v_type.min_players
        using errcode = 'invalid_parameter_value';
    end if;
  end if;
  if v_players > v_type.max_players then
    raise exception '"%" erlaubt höchstens % Spieler.', v_type.name, v_type.max_players
      using errcode = 'invalid_parameter_value';
  end if;
  if p_partner_wanted and v_players >= v_type.max_players then
    raise exception 'Die Buchung ist schon voll - dann brauchst du keine Mitspieler zu suchen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if v_me = any (p_player_member_ids) then
    raise exception 'Du bist als Bucher schon dabei und musst dich nicht als Mitspieler eintragen.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Kontingent: 0 bedeutet unbegrenzt. Die Regel bleibt vollstaendig erhalten,
  -- damit der Vorstand sie in knappen Zeiten wieder einschalten kann.
  if v_max_open > 0 and v_type.counts_towards_quota then
    if private.open_booking_count(v_me) >= v_max_open then
      raise exception 'Du hast bereits % offene Buchungen. Mehr sind nicht möglich.', v_max_open
        using errcode = 'check_violation';
    end if;
    foreach v_player in array coalesce(p_player_member_ids, '{}') loop
      if private.open_booking_count(v_player) >= v_max_open then
        select m.first_name || ' ' || m.last_name into v_blocker
        from public.members m where m.id = v_player;
        raise exception '% hat bereits % offene Buchungen und kann nicht mitspielen.',
          coalesce(v_blocker, 'Ein Mitspieler'), v_max_open using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  begin
    insert into public.bookings
      (court_id, slot, kind, booking_type_id, member_id, created_by, partner_wanted)
    values (p_court_id, tstzrange(p_starts_at, v_ends_at, '[)'), 'booking', v_type.id,
            v_me, v_me, coalesce(p_partner_wanted, false))
    returning id into v_booking_id;
  exception when exclusion_violation then
    raise exception 'Dieser Platz ist zu der Zeit bereits belegt.' using errcode = 'exclusion_violation';
  end;

  -- Erst nach dem Platz die Personen: ist der Platz selbst belegt, ist das die
  -- treffendere Meldung. Bucher zuerst, dann die Mitspieler; die neue Buchung
  -- steht schon in der Tabelle und wird ausgenommen.
  perform private.pruefe_spielt_schon(
    array[v_me] || coalesce(p_player_member_ids, '{}'),
    tstzrange(p_starts_at, v_ends_at, '[)'), v_booking_id);

  foreach v_player in array coalesce(p_player_member_ids, '{}') loop
    insert into public.booking_players (booking_id, member_id) values (v_booking_id, v_player);
  end loop;
  foreach v_guest in array coalesce(p_guest_names, '{}') loop
    if length(btrim(v_guest)) = 0 then
      raise exception 'Gastname darf nicht leer sein.' using errcode = 'invalid_parameter_value';
    end if;
    insert into public.booking_players (booking_id, guest_name) values (v_booking_id, btrim(v_guest));
  end loop;

  perform private.sync_guest_charges(v_booking_id, v_me, v_gaeste);

  -- Wer eingetragen wurde, soll es erfahren, ohne den Plan aufzuschlagen.
  insert into public.notifications (member_id, kind, title, body)
  select v_player_id, 'booking_added', 'Du bist als Mitspieler eingetragen',
         format('%s hat dich für %s eingetragen.',
                private.member_label(v_me), private.booking_label(v_booking_id))
  from unnest(coalesce(p_player_member_ids, '{}')) as v_player_id;

  return v_booking_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.create_debit_batch(p_title text, p_collection_date date, p_kinds charge_kind[] DEFAULT NULL::charge_kind[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Lastschriftläufe anlegen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'Der Lauf braucht einen Namen.' using errcode = 'invalid_parameter_value';
  end if;
  if p_collection_date is null
     or p_collection_date < (now() at time zone 'Europe/Berlin')::date then
    raise exception 'Der Fälligkeitstag darf nicht in der Vergangenheit liegen.'
      using errcode = 'invalid_parameter_value';
  end if;
  -- Eine leere Auswahl wuerde nichts einziehen - das ist sicher ein Versehen.
  if p_kinds is not null and cardinality(p_kinds) = 0 then
    raise exception 'Bitte mindestens eine Art wählen.' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.debit_batches (title, collection_date, kinds, created_by)
  values (btrim(p_title), p_collection_date, p_kinds, private.current_member_id())
  returning id into v_id;

  return v_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.create_manual_charge(p_member_id uuid, p_kind charge_kind, p_amount_cents integer, p_description text, p_period_label text DEFAULT NULL::text, p_due_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_payer uuid; v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Forderungen anlegen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Der Betrag muss größer als null sein.'
      using errcode = 'invalid_parameter_value';
  end if;
  if btrim(coalesce(p_description, '')) = '' then
    raise exception 'Ohne Beschreibung weiß später niemand mehr, wofür die Forderung war.'
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
  raise exception 'Für diesen Zeitraum gibt es bereits eine Forderung dieser Art.'
    using errcode = 'unique_violation';
end; $function$;

CREATE OR REPLACE FUNCTION public.create_member(p_first_name text, p_last_name text, p_email text DEFAULT NULL::text, p_birthday date DEFAULT NULL::date, p_gender gender DEFAULT NULL::gender, p_salutation salutation DEFAULT NULL::salutation, p_title text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_mobile text DEFAULT NULL::text, p_street text DEFAULT NULL::text, p_postcode text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_country_code text DEFAULT 'DE'::text, p_notes text DEFAULT NULL::text, p_number text DEFAULT NULL::text, p_started_on date DEFAULT NULL::date, p_fee_type_ids uuid[] DEFAULT '{}'::uuid[], p_auth_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id     uuid;
  v_nummer text;
  v_fee    uuid;
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_fehlt  text[];
begin
  if not private.is_admin() then
    raise exception 'Mitglieder anlegen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if length(btrim(coalesce(p_first_name, ''))) = 0
     or length(btrim(coalesce(p_last_name, ''))) = 0 then
    raise exception 'Vor- und Nachname sind Pflicht.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- p_email, die Stammdaten und p_auth_user_id sind nur der Reihenfolge wegen
  -- optional.
  if v_email = '' then
    raise exception 'Ohne E-Mail-Adresse kann kein Mitglied angelegt werden.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_fehlt := private.fehlende_stammdaten(p_birthday, p_gender, p_street, p_postcode,
                                         p_city, p_phone, p_mobile);
  if cardinality(v_fehlt) > 0 then
    raise exception 'Pflichtangaben fehlen: %.', array_to_string(v_fehlt, ', ')
      using errcode = 'invalid_parameter_value';
  end if;

  if p_birthday > private.heute() then
    raise exception 'Das Geburtsdatum liegt in der Zukunft.'
      using errcode = 'invalid_parameter_value';
  end if;

  perform private.login_pruefen(p_auth_user_id);

  -- Login und Mitglied gehoeren zur selben Adresse. Sonst haette jemand Zugang
  -- zu einem Datensatz, dessen Mails an eine andere Person gehen.
  if not exists (select 1 from auth.users
                  where id = p_auth_user_id and lower(email) = v_email) then
    raise exception 'Der Login gehört zu einer anderen E-Mail-Adresse als das Mitglied.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- onboarding_completed_at bleibt null: das neue Mitglied durchlaeuft nach
  -- dem ersten Login das Onboarding.
  insert into public.members (
    first_name, last_name, title, gender, salutation, birthday,
    email, phone, mobile, street, postcode, city, country_code,
    notes, auth_user_id, invited_at, onboarding_completed_at
  ) values (
    btrim(p_first_name), btrim(p_last_name), nullif(btrim(coalesce(p_title, '')), ''),
    p_gender, coalesce(p_salutation, private.anrede_aus_geschlecht(p_gender)), p_birthday,
    v_email::extensions.citext,
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_mobile, '')), ''),
    nullif(btrim(coalesce(p_street, '')), ''),
    nullif(btrim(coalesce(p_postcode, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    coalesce(nullif(btrim(coalesce(p_country_code, '')), ''), 'DE'),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_auth_user_id, now(), null
  )
  returning id into v_id;

  v_nummer := coalesce(nullif(btrim(coalesce(p_number, '')), ''),
                       private.next_membership_number());

  insert into public.memberships (member_id, number, started_on, status)
  values (v_id, v_nummer, coalesce(p_started_on, private.heute()), 'active');

  insert into public.member_roles (member_id, role) values (v_id, 'member');

  foreach v_fee in array coalesce(p_fee_type_ids, '{}') loop
    insert into public.member_fees (member_id, fee_type_id, year)
    values (v_id, v_fee, extract(year from private.heute())::integer)
    on conflict do nothing;
  end loop;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_my_sepa_mandate(p_iban text, p_holder text DEFAULT NULL::text, p_accept boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_m       public.members;
  v_g_name  text := btrim(coalesce(public.setting_text('sepa.creditor_name'), ''));
  v_g_id    text := btrim(coalesce(public.setting_text('sepa.creditor_id'), ''));
  v_iban    text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
  v_holder  text := nullif(btrim(coalesce(p_holder, '')), '');
  v_finger  bytea;
  v_konto   uuid;
  v_ref     text;
begin
  select * into v_m from public.members where id = private.current_member_id();
  if not found then
    raise exception 'Nur Mitglieder können ein Mandat erteilen.'
      using errcode = 'insufficient_privilege';
  end if;

  if not coalesce(p_accept, false) then
    raise exception 'Bitte bestätige das Mandat ausdrücklich.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Pro Mitglied hoechstens ein aktives Mandat (Index sepa_mandates_ein_aktives).
  if exists (select 1 from public.sepa_mandates
              where member_id = v_m.id and status = 'active') then
    raise exception 'Für dich besteht bereits ein aktives SEPA-Mandat. Ändern kann es der Vorstand.'
      using errcode = 'check_violation';
  end if;

  if v_g_name = '' or v_g_id = '' then
    raise exception 'Die Gläubigerdaten des Vereins fehlen noch. Bitte wende dich an den Vorstand.'
      using errcode = 'check_violation';
  end if;

  if not public.iban_is_valid(v_iban) then
    raise exception 'Diese IBAN ist nicht gültig. Bitte die Ziffern prüfen.'
      using errcode = 'invalid_parameter_value';
  end if;

  if private.ist_minderjaehrig(v_m.birthday) then
    v_holder := coalesce(v_holder, nullif(btrim(coalesce(v_m.guardian_name, '')), ''));
    if v_holder is null then
      raise exception 'Bitte zuerst die Erziehungsberechtigten angeben. Kontoinhaber ist bei Kindern ein Elternteil.'
        using errcode = 'invalid_parameter_value';
    end if;
  else
    v_holder := coalesce(v_holder, btrim(v_m.first_name || ' ' || v_m.last_name));
  end if;

  if length(v_holder) > 70 then
    raise exception 'Der Name des Kontoinhabers ist zu lang (höchstens 70 Zeichen).'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Dieselbe IBAN hat der Vorstand vielleicht schon erfasst. Dann wird die
  -- vorhandene Bankverbindung genommen statt einer zweiten.
  v_finger := private.fingerprint_iban(v_iban);
  select id into v_konto from public.bank_accounts
  where member_id = v_m.id and iban_fingerprint = v_finger;

  if v_konto is null then
    insert into public.bank_accounts
      (member_id, iban_encrypted, iban_fingerprint, iban_last4, holder, source)
    values (v_m.id, private.encrypt_iban(v_iban), v_finger, right(v_iban, 4), v_holder, 'app')
    returning id into v_konto;
  else
    update public.bank_accounts set holder = v_holder, active = true where id = v_konto;
  end if;

  v_ref := private.next_mandate_reference(v_m.id);

  insert into public.sepa_mandates (
    member_id, bank_account_id, reference, signed_on, sequence_type, status, source,
    granted_online_at, mandate_text, accepted_holder
  ) values (
    v_m.id, v_konto, v_ref, private.heute(), 'FRST', 'active', 'app',
    now(), private.sepa_mandatstext(v_g_name, v_g_id, v_ref), v_holder
  );

  return v_ref;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_sepa_mandate(p_member_id uuid, p_bank_account_id uuid, p_reference text DEFAULT NULL::text, p_signed_on date DEFAULT NULL::date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_konto     public.bank_accounts;
  v_referenz  text;
  v_signed    date := coalesce(p_signed_on, private.heute());
begin
  if not private.is_admin() then
    raise exception 'Mandate erteilen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_konto from public.bank_accounts where id = p_bank_account_id;
  if not found then
    raise exception 'Diese Bankverbindung gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if v_konto.member_id <> p_member_id then
    raise exception 'Diese Bankverbindung gehört zu einem anderen Mitglied.'
      using errcode = 'invalid_parameter_value';
  end if;

  if not v_konto.active then
    raise exception 'Diese Bankverbindung ist stillgelegt.'
      using errcode = 'check_violation';
  end if;

  if v_signed > private.heute() then
    raise exception 'Ein Mandat kann nicht in der Zukunft unterschrieben worden sein.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Zwei aktive Mandate waeren fuer den Lastschriftlauf nicht zu
  -- unterscheiden. Der Index sepa_mandates_ein_aktives faengt dasselbe ab;
  -- hier steht es mit verstaendlicher Meldung.
  if exists (select 1 from public.sepa_mandates
              where member_id = p_member_id and status = 'active') then
    raise exception 'Für dieses Mitglied besteht bereits ein aktives Mandat. Bitte zuerst widerrufen.'
      using errcode = 'check_violation';
  end if;

  v_referenz := coalesce(nullif(btrim(coalesce(p_reference, '')), ''),
                         private.next_mandate_reference(p_member_id));

  insert into public.sepa_mandates
    (member_id, bank_account_id, reference, signed_on, sequence_type, status)
  values (p_member_id, p_bank_account_id, v_referenz, v_signed, 'FRST', 'active');

  return v_referenz;
end;
$function$;

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
end; $function$;

CREATE OR REPLACE FUNCTION public.deactivate_bank_account(p_bank_account_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_offen integer;
begin
  if not private.is_admin() then
    raise exception 'Bankverbindungen pflegen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.bank_accounts where id = p_bank_account_id) then
    raise exception 'Diese Bankverbindung gibt es nicht.' using errcode = 'no_data_found';
  end if;

  select count(*)::integer into v_offen
  from public.sepa_mandates
  where bank_account_id = p_bank_account_id and status = 'active';

  if v_offen > 0 then
    raise exception 'An dieser Bankverbindung hängt noch ein aktives Mandat. Bitte zuerst widerrufen.'
      using errcode = 'check_violation';
  end if;

  update public.bank_accounts set active = false where id = p_bank_account_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.debit_batch_candidates(p_collection_date date, p_kinds charge_kind[] DEFAULT NULL::charge_kind[])
 RETURNS TABLE(payer_id uuid, payer_name text, charge_ids uuid[], positionen integer, arten text, kinds charge_kind[], amount_cents integer, mandate_id uuid, mandate_reference text, einzugsfaehig boolean, grund text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
          'Für dieses Mitglied ist kein Mandat hinterlegt.'
        when max(m.signed_on) > p_collection_date then
          'Das Mandat ist erst nach dem Fälligkeitstag unterschrieben.'
        when coalesce(max(m.last_used_on), max(m.signed_on)) + interval '36 months'
             < (now() at time zone 'Europe/Berlin')::date then
          'Das Mandat ist seit über 36 Monaten ungenutzt und damit erloschen. '
          'Es muss neu eingeholt werden.'
        when p_collection_date < max((m.notified_at at time zone 'Europe/Berlin')::date)
                                 + (select tage from frist) then
          'Die Vorabankündigung ist noch nicht ' || (select tage from frist) ||
          ' Tage her.'
        when p_collection_date < max(m.due_date) then
          'Angekündigt war der ' || to_char(max(m.due_date), 'DD.MM.YYYY') ||
          '. Früher darf nicht eingezogen werden.'
        when sum(m.amount_cents) < (select mindest from frist) then
          'Unter dem Mindestbetrag. Der Betrag geht beim nächsten Lauf mit.'
        else null
      end as grund
    from mit_mandat m
    group by m.payer_id
  ) x
  join public.members z on z.id = x.payer_id
  order by x.grund is null desc, 2;
$function$;

CREATE OR REPLACE FUNCTION public.debit_batch_payload(p_batch_id uuid)
 RETURNS TABLE(creditor_name text, creditor_id text, creditor_iban text, creditor_bic text, collection_date date, pain_version text, title text, end_to_end_id text, debtor_name text, debtor_iban text, amount_cents integer, remittance_info text, kind charge_kind, mandate_reference text, mandate_signed_on date, mandate_last_used_on date, sequence_type mandate_sequence)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status public.debit_batch_status;
begin
  if not private.is_admin() then
    raise exception 'Lastschriftdateien erzeugen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select b.status into v_status from public.debit_batches b where b.id = p_batch_id;
  if v_status is null then
    raise exception 'Diesen Lastschriftlauf gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'draft' then
    raise exception
      'Dieser Lauf ist bereits erzeugt. Die Datei liegt beim Lauf und lässt sich dort herunterladen.'
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
end; $function$;

CREATE OR REPLACE FUNCTION public.decline_membership_application(p_application_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_admin() then
    raise exception 'Anträge bearbeiten dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.membership_applications
                  where id = p_application_id and status = 'new') then
    raise exception 'Dieser Antrag wurde bereits bearbeitet.'
      using errcode = 'check_violation';
  end if;

  update public.membership_applications set
    status = 'declined',
    decided_at = now(),
    decided_by = private.current_member_id(),
    decision_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_application_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_member_attribute_type(p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_typ     public.member_attribute_types;
  v_benutzt integer;
begin
  if not private.is_admin() then
    raise exception 'Merkmale löschen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_typ from public.member_attribute_types where code = p_code;
  if not found then
    raise exception 'Dieses Merkmal gibt es nicht.' using errcode = 'no_data_found';
  end if;

  select count(*)::integer into v_benutzt
  from public.member_attribute_values where attribute_type_id = v_typ.id;

  if v_benutzt > 0 then
    raise exception '% Mitglieder haben einen Wert zu "%". Das Merkmal lässt sich deshalb nur stilllegen, nicht löschen.',
      v_benutzt, v_typ.name using errcode = 'check_violation';
  end if;

  delete from public.member_attribute_types where id = v_typ.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_member(p_member_id uuid, p_confirm_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_m      public.members;
  v_impact record;
begin
  if not private.is_admin() then
    raise exception 'Mitglieder löschen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_member_id = private.current_member_id() then
    raise exception 'Du kannst dich nicht selbst löschen.'
      using errcode = 'check_violation';
  end if;

  select * into v_m from public.members where id = p_member_id;
  if not found then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if lower(btrim(coalesce(p_confirm_name, ''))) is distinct from lower(btrim(v_m.last_name)) then
    raise exception 'Zum Löschen bitte den Nachnamen zur Bestätigung eingeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_impact from public.member_delete_impact(p_member_id);

  if not v_impact.can_delete then
    raise exception 'Zu diesem Mitglied gibt es % Forderungen, % Getränkebuchungen und % Platzbuchungen. '
                    'Ein Löschen würde die Buchhaltung zerreißen - bitte archivieren oder anonymisieren.',
      v_impact.charges, v_impact.drink_purchases, v_impact.bookings
      using errcode = 'check_violation';
  end if;

  delete from public.members where id = p_member_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_team(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_admin() then
    raise exception 'Mannschaften löschen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.teams where id = p_id) then
    raise exception 'Diese Mannschaft gibt es nicht.' using errcode = 'no_data_found';
  end if;

  update public.members
     set team_id = null, is_team_captain = false
   where team_id = p_id;

  delete from public.teams where id = p_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_work_duty(p_entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      'Für % ist bereits abgerechnet. Der Eintrag steckt in der Abrechnung und bleibt stehen.',
      v_jahr using errcode = 'invalid_parameter_value';
  end if;

  delete from public.work_duty_entries where id = p_entry_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.disable_push_token(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Geräte stilllegen darf nur der Versanddienst.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.push_tokens
     set disabled_at = now()
   where token = btrim(p_token) and disabled_at is null;
end; $function$;

CREATE OR REPLACE FUNCTION public.einzug_loeschen(p_batch_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status public.debit_batch_status;
begin
  if not private.is_admin() then
    raise exception 'Einzüge löschen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from public.debit_batches where id = p_batch_id;
  if v_status is null then
    raise exception 'Diesen Einzug gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'draft'
     or exists (select 1 from public.debit_items where batch_id = p_batch_id) then
    raise exception 'Nur ein leerer Einzug ohne Datei lässt sich löschen.'
      using errcode = 'invalid_parameter_value';
  end if;

  delete from public.debit_batches where id = p_batch_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.einzug_mitglied_entfernen(p_batch_id uuid, p_end_to_end_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status public.debit_batch_status; v_ids uuid[];
begin
  if not private.is_admin() then
    raise exception 'Einzüge ändern dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from public.debit_batches where id = p_batch_id;
  if v_status is null then
    raise exception 'Diesen Einzug gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'draft' then
    raise exception 'Die Datei ist schon erzeugt. Danach lässt sich niemand mehr herausnehmen.'
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
end; $function$;

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
end; $function$;

CREATE OR REPLACE FUNCTION public.einzug_vorschau(p_collection_date date, p_gruppen jsonb)
 RETURNS TABLE(member_id uuid, member_name text, positionen integer, arten text, kinds charge_kind[], amount_cents integer, mandate_reference text, einzugsfaehig boolean, grund text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_admin() then
    raise exception 'Einzüge vorbereiten dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select p.member_id, p.member_name, p.positionen, p.arten, p.kinds, p.amount_cents,
         p.mandate_reference, p.einzugsfaehig, p.grund
  from private.einzug_pruefung(
         array(select private.einzug_forderungen(p_gruppen)), p_collection_date) p;
end; $function$;

CREATE OR REPLACE FUNCTION public.end_membership(p_member_id uuid, p_ended_on date DEFAULT ((now() AT TIME ZONE 'Europe/Berlin'::text))::date, p_cancellation_date date DEFAULT NULL::date, p_reason text DEFAULT NULL::text, p_set_inactive boolean DEFAULT true)
 RETURNS TABLE(open_charges integer, open_amount_cents integer, future_bookings integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ms public.memberships;
begin
  if not private.is_admin() then
    raise exception 'Mitgliedschaften beenden dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_member_id = private.current_member_id() then
    raise exception 'Du kannst deine eigene Mitgliedschaft nicht selbst beenden.'
      using errcode = 'check_violation';
  end if;

  select * into v_ms from public.memberships
  where member_id = p_member_id and ended_on is null;

  if not found then
    raise exception 'Dieses Mitglied hat keine laufende Mitgliedschaft.'
      using errcode = 'no_data_found';
  end if;

  if p_ended_on < v_ms.started_on then
    raise exception 'Das Austrittsdatum darf nicht vor dem Eintritt liegen.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.memberships set
    ended_on            = p_ended_on,
    cancellation_date   = coalesce(p_cancellation_date, private.heute()),
    cancellation_reason = nullif(btrim(coalesce(p_reason, '')), ''),
    status              = 'ended'
  where id = v_ms.id;

  if p_set_inactive then
    update public.members set status = 'inactive' where id = p_member_id;
  end if;

  -- Wer heute geht, behaelt keine Rollen. Bei einem kuenftigen Datum
  -- bleiben sie bis dahin, danach greift hat_zugang.
  if p_ended_on <= private.heute() then
    delete from public.member_roles where member_id = p_member_id and role <> 'member';
  end if;

  return query
    select
      (select count(*)::integer from public.charges
        where member_id = p_member_id and status in ('open', 'notified')),
      (select coalesce(sum(amount_cents), 0)::integer from public.charges
        where member_id = p_member_id and status in ('open', 'notified')),
      (select count(*)::integer from public.bookings
        where member_id = p_member_id and status = 'active' and lower(slot) > now());
end;
$function$;

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
end; $function$;

CREATE OR REPLACE FUNCTION public.ensure_default_settings()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before integer;
  v_after  integer;
begin
  select count(*) into v_before from public.settings;

  insert into public.settings (key, value, value_type, label, description) values
    ('booking.max_open_bookings', '0'::jsonb, 'integer', 'Maximale offene Buchungen',
     'Wie viele künftige Buchungen ein Mitglied gleichzeitig haben darf. '
     'Mitspieler zählen mit. 0 bedeutet unbegrenzt.'),
    ('booking.lead_days', '7'::jsonb, 'integer', 'Buchungsvorlauf in Tagen',
     'Rollierend: buchbar ist alles innerhalb der nächsten X Tage.'),
    ('booking.opening_time', '"08:00"'::jsonb, 'time', 'Öffnungszeit',
     'Früheste Startzeit einer Buchung.'),
    ('booking.closing_time', '"21:00"'::jsonb, 'time', 'Schließzeit',
     'Späteste Endzeit einer Buchung.'),
    ('booking.slot_minutes', '30'::jsonb, 'integer', 'Raster in Minuten',
     'Startzeiten müssen auf dieses Raster fallen (30 = :00 und :30).'),
    ('booking.display_minutes', '60'::jsonb, 'integer', 'Raster der Plananzeige',
     'In welchen Schritten der Belegungsplan Zeilen zeigt. Gebucht wird im '
     'feineren Raster aus booking.slot_minutes.'),
    ('booking.guest_fee_cents', '1000'::jsonb, 'integer', 'Gastgebühr in Cent',
     '0 = keine Gebühr. Sonst wird sie je Gast dem buchenden Mitglied '
     'berechnet und mit der nächsten Lastschrift eingezogen.'),
    ('notifications.mail_kinds',
     '"booking_displaced,booking_cancelled,booking_removed,application_new,charge_announced,charge_returned,booking_moved,event_promoted,event_cancelled,event_changed,account_deletion_requested"'::jsonb,
     'text', 'Benachrichtigungen, die auch per E-Mail gehen',
     'Kommagetrennte Liste. Wer bei "E-Mails zu Buchungen" auf "Alle" steht, '
     'bekommt jede Art; alle anderen nur diese hier.'),
    ('drinks.min_debit_cents', '500'::jsonb, 'integer', 'Mindestbetrag Lastschrift',
     'Beträge darunter werden nicht eingezogen, sondern beim nächsten Lauf '
     'mitgenommen. Die Schwelle gilt je Zahler über alle offenen Forderungen.'),
    ('drinks.void_window_minutes', '15'::jsonb, 'integer', 'Storno-Fenster Getränke',
     'So lange darf ein Mitglied eine eigene Fehlbuchung selbst zurücknehmen.'),
    ('sepa.creditor_id', '""'::jsonb, 'text', 'Gläubiger-Identifikationsnummer',
     'Aus dem eBuSy-Backend übernehmen. Muss unverändert bleiben, damit die '
     'Bestandsmandate gültig bleiben.'),
    ('sepa.creditor_iban', '""'::jsonb, 'text', 'IBAN des Vereinskontos',
     'Auf dieses Konto werden die Lastschriften gutgeschrieben. Ohne sie lässt '
     'sich keine Datei erzeugen.'),
    ('sepa.creditor_bic', '""'::jsonb, 'text', 'BIC des Vereinskontos',
     'Optional. Fehlt sie, trägt die Datei NOTPROVIDED - das reicht innerhalb '
     'des SEPA-Raums.'),
    ('sepa.pain_version', '"pain.008.001.08"'::jsonb, 'text', 'Format der Lastschriftdatei',
     'Mit der Hausbank abklären.'),
    ('sepa.prenotification_days', '14'::jsonb, 'integer', 'Vorabankündigung in Tagen',
     'Pflicht vor jedem Einzug. So viele Tage müssen zwischen Ankündigung '
     'und Fälligkeit liegen.'),
    ('sepa.creditor_name', '"TC Muckensturm e.V."'::jsonb, 'text', 'Name des Zahlungsempfängers',
     'Erscheint auf dem Kontoauszug der Mitglieder.'),
    ('sepa.mandate_text_version', '1'::jsonb, 'integer', 'Version des Mandatstexts',
     'Fassung des Textes, mit dem Mitglieder ihr SEPA-Mandat online erteilen. '
     'Wird hochgezählt, wenn sich der Text in private.sepa_mandatstext ändert.'),
    ('fees.annual_run_month', '1'::jsonb, 'integer', 'Monat des Beitragslaufs',
     'Der Lauf wird trotzdem manuell gestartet.'),
    ('fees.annual_run_day', '15'::jsonb, 'integer', 'Tag des Beitragslaufs',
     'Fälligkeitsdatum der Jahresbeitrags-Lastschrift.'),
    ('work_duty.hourly_rate_cents', '1500'::jsonb, 'integer', 'Stundensatz Arbeitsdienst',
     'Womit nicht geleistete Stunden zum Jahresende abgerechnet werden. Platzhalter.'),
    ('privacy.change_log_days', '1095'::jsonb, 'integer',
     'Aufbewahrung des Änderungsprotokolls in Tagen',
     'Ältere Einträge werden beim Aufräumlauf entfernt. 1095 Tage sind drei Jahre.'),
    ('notifications.push_kinds',
     '"booking_displaced,booking_cancelled,booking_removed,booking_added,player_joined,player_left,application_new,booking_moved,event_published,event_promoted,event_cancelled,event_changed,event_reminder,account_deletion_requested"'::jsonb,
     'text', 'Benachrichtigungen, die auch als Push gehen',
     'Kommagetrennte Liste. Getrennt von den E-Mail-Arten, weil ein Push sofort '
     'da ist und auch Erfreuliches melden darf, das als Mail nur Lärm wäre.')
  on conflict (key) do nothing;

  select count(*) into v_after from public.settings;
  return v_after - v_before;
end;
$function$;

CREATE OR REPLACE FUNCTION public.event_admin_anmelden(p_event_id uuid, p_member_id uuid, p_companions integer DEFAULT 0, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.events; v_id uuid; v_status public.event_registration_status;
begin
  perform private.pruefe_event_admin();

  select * into e from public.events where id = p_event_id for update;
  if e.id is null then
    raise exception 'Diese Veranstaltung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if e.status <> 'published' then
    raise exception 'Anmelden geht nur bei einer veröffentlichten Veranstaltung.'
      using errcode = 'invalid_parameter_value';
  end if;
  if not e.registration_enabled then
    raise exception 'Diese Veranstaltung hat keine Anmeldung.' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(p_companions, 0) < 0 or coalesce(p_companions, 0) > 20 then
    raise exception 'Begleitpersonen: zwischen 0 und 20.' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(p_companions, 0) > 0 and not e.companions_allowed then
    raise exception 'Bei dieser Veranstaltung sind keine Begleitpersonen vorgesehen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  select id, status into v_id, v_status from public.event_registrations
   where event_id = p_event_id and member_id = p_member_id for update;

  if v_status = 'registered' then
    raise exception 'Dieses Mitglied ist schon angemeldet.' using errcode = 'unique_violation';
  end if;

  if v_id is null then
    insert into public.event_registrations (event_id, member_id, companions, note)
    values (p_event_id, p_member_id, coalesce(p_companions, 0),
            nullif(btrim(coalesce(p_note, '')), ''))
    returning id into v_id;
  else
    update public.event_registrations
       set status = 'registered', companions = coalesce(p_companions, 0),
           note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note),
           registered_at = case when status = 'cancelled' then now() else registered_at end,
           waitlisted_at = null, cancelled_at = null, attended = false
     where id = v_id;
  end if;

  perform private.event_forderung_abgleichen(v_id);
  return v_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.event_anmelden(p_event_id uuid, p_companions integer DEFAULT 0, p_note text DEFAULT NULL::text)
 RETURNS event_registration_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e public.events;
  v_member uuid := private.current_member_id();
  v_id uuid;
  v_alt public.event_registration_status;
  v_personen integer := 1 + coalesce(p_companions, 0);
  v_status public.event_registration_status;
begin
  perform private.pruefe_freigeschaltet();

  select * into e from public.events where id = p_event_id for update;
  if e.id is null or e.status = 'draft' then
    raise exception 'Diese Veranstaltung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if e.status = 'cancelled' then
    raise exception 'Diese Veranstaltung ist abgesagt.' using errcode = 'invalid_parameter_value';
  end if;
  if not e.registration_enabled then
    raise exception 'Für diese Veranstaltung gibt es keine Anmeldung.' using errcode = 'invalid_parameter_value';
  end if;
  if now() >= private.event_schluss(e) then
    raise exception 'Der Anmeldeschluss ist vorbei.' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(p_companions, 0) < 0 or coalesce(p_companions, 0) > 20 then
    raise exception 'Begleitpersonen: zwischen 0 und 20.' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(p_companions, 0) > 0 and not e.companions_allowed then
    raise exception 'Bei dieser Veranstaltung sind keine Begleitpersonen vorgesehen.'
      using errcode = 'invalid_parameter_value';
  end if;

  select id, status into v_id, v_alt from public.event_registrations
   where event_id = p_event_id and member_id = v_member;
  if v_alt in ('registered', 'waitlisted') then
    raise exception 'Du bist schon angemeldet.' using errcode = 'unique_violation';
  end if;

  v_status := case
    when e.max_participants is null or private.event_belegt(p_event_id) + v_personen <= e.max_participants
      then 'registered' else 'waitlisted'
  end;

  if v_id is null then
    insert into public.event_registrations (event_id, member_id, companions, note, status, waitlisted_at)
    values (p_event_id, v_member, coalesce(p_companions, 0), nullif(btrim(coalesce(p_note, '')), ''),
            v_status, case when v_status = 'waitlisted' then now() end)
    returning id into v_id;
  else
    update public.event_registrations
       set status = v_status, companions = coalesce(p_companions, 0),
           note = nullif(btrim(coalesce(p_note, '')), ''),
           registered_at = now(), cancelled_at = null, attended = false,
           waitlisted_at = case when v_status = 'waitlisted' then now() end
     where id = v_id;
  end if;

  perform private.event_forderung_abgleichen(v_id);
  return v_status;
end; $function$;

CREATE OR REPLACE FUNCTION public.event_anmeldung_aendern(p_event_id uuid, p_companions integer, p_note text DEFAULT NULL::text)
 RETURNS event_registration_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e public.events;
  r public.event_registrations;
  v_neu integer := coalesce(p_companions, 0);
begin
  perform private.pruefe_freigeschaltet();

  select * into e from public.events where id = p_event_id for update;
  select * into r from public.event_registrations
   where event_id = p_event_id and member_id = private.current_member_id();
  if r.id is null or r.status = 'cancelled' or e.status = 'draft' then
    raise exception 'Du bist nicht angemeldet.' using errcode = 'no_data_found';
  end if;
  if e.status = 'cancelled' then
    raise exception 'Diese Veranstaltung ist abgesagt.' using errcode = 'invalid_parameter_value';
  end if;
  if now() >= private.event_schluss(e) then
    raise exception 'Der Anmeldeschluss ist vorbei. Änderungen bitte beim Vorstand melden.'
      using errcode = 'invalid_parameter_value';
  end if;
  if v_neu < 0 or v_neu > 20 then
    raise exception 'Begleitpersonen: zwischen 0 und 20.' using errcode = 'invalid_parameter_value';
  end if;
  if v_neu > 0 and not e.companions_allowed then
    raise exception 'Bei dieser Veranstaltung sind keine Begleitpersonen vorgesehen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if r.status = 'registered' and e.max_participants is not null and v_neu > r.companions
     and private.event_belegt(p_event_id) + (v_neu - r.companions) > e.max_participants then
    raise exception 'Für so viele Personen sind keine Plätze mehr frei.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.event_registrations
     set companions = v_neu, note = nullif(btrim(coalesce(p_note, '')), '')
   where id = r.id;

  perform private.event_forderung_abgleichen(r.id);
  perform private.event_nachruecken(p_event_id);

  return (select status from public.event_registrations where id = r.id);
end; $function$;

CREATE OR REPLACE FUNCTION public.event_loeschen(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.pruefe_event_admin();
  if not exists (select 1 from public.events where id = p_id and status = 'draft')
     or exists (select 1 from public.event_registrations where event_id = p_id) then
    raise exception 'Nur ein Entwurf ohne Anmeldungen lässt sich löschen.'
      using errcode = 'invalid_parameter_value';
  end if;
  delete from public.events where id = p_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.event_speichern(p_id uuid, p_kind event_kind, p_title text, p_description text, p_location text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_registration_enabled boolean, p_registration_deadline timestamp with time zone, p_max_participants integer, p_companions_allowed boolean, p_fee_cents integer, p_work_hours numeric, p_veroeffentlichen boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  alt public.events;
  v_id uuid;
  v_anmeldung boolean := coalesce(p_registration_enabled, false);
  v_fee integer := nullif(p_fee_cents, 0);
  v_belegt integer;
  r record;
begin
  perform private.pruefe_event_admin();

  if p_kind is null then
    raise exception 'Bitte eine Art wählen.' using errcode = 'invalid_parameter_value';
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'Der Titel ist Pflicht.' using errcode = 'invalid_parameter_value';
  end if;
  if p_starts_at is null then
    raise exception 'Der Beginn ist Pflicht.' using errcode = 'invalid_parameter_value';
  end if;
  if p_ends_at is not null and p_ends_at < p_starts_at then
    raise exception 'Das Ende liegt vor dem Beginn.' using errcode = 'invalid_parameter_value';
  end if;
  if v_anmeldung and p_registration_deadline is not null and p_registration_deadline > p_starts_at then
    raise exception 'Der Anmeldeschluss liegt nach dem Beginn.' using errcode = 'invalid_parameter_value';
  end if;
  if v_anmeldung and p_max_participants is not null and p_max_participants < 1 then
    raise exception 'Mindestens ein Platz.' using errcode = 'invalid_parameter_value';
  end if;
  if v_fee is not null and (v_fee < 0 or v_fee > 100000) then
    raise exception 'Die Gebühr muss zwischen 0,00 und 1000,00 Euro liegen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if not v_anmeldung and v_fee is not null then
    raise exception 'Eine Gebühr gibt es nur mit Anmeldung.' using errcode = 'invalid_parameter_value';
  end if;
  if p_work_hours is not null and p_kind <> 'arbeitsdienst' then
    raise exception 'Stunden gibt es nur beim Arbeitsdienst.' using errcode = 'invalid_parameter_value';
  end if;
  if p_work_hours is not null and (p_work_hours <= 0 or p_work_hours > 24) then
    raise exception 'Die Stundenzahl muss zwischen 0,25 und 24 liegen.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_id is null then
    insert into public.events (
      kind, title, description, location, starts_at, ends_at,
      registration_enabled, registration_deadline, max_participants, companions_allowed,
      fee_cents, work_hours, status, published_at, created_by
    ) values (
      p_kind, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
      nullif(btrim(coalesce(p_location, '')), ''), p_starts_at, p_ends_at,
      v_anmeldung,
      case when v_anmeldung then p_registration_deadline end,
      case when v_anmeldung then p_max_participants end,
      v_anmeldung and coalesce(p_companions_allowed, false),
      v_fee, p_work_hours,
      case when coalesce(p_veroeffentlichen, false) then 'published' else 'draft' end::public.event_status,
      case when coalesce(p_veroeffentlichen, false) then now() end,
      private.current_member_id()
    )
    returning id into v_id;
    return v_id;
  end if;

  select * into alt from public.events where id = p_id for update;
  if alt.id is null then
    raise exception 'Diese Veranstaltung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if alt.status = 'cancelled' then
    raise exception 'Eine abgesagte Veranstaltung lässt sich nicht mehr bearbeiten.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_belegt := private.event_belegt(p_id);

  if exists (select 1 from public.event_registrations
              where event_id = p_id and status <> 'cancelled') then
    if not v_anmeldung then
      raise exception 'Es gibt schon Anmeldungen. Die Anmeldung lässt sich nicht mehr abschalten.'
        using errcode = 'invalid_parameter_value';
    end if;
    if not coalesce(p_companions_allowed, false) and exists (
      select 1 from public.event_registrations
       where event_id = p_id and status <> 'cancelled' and companions > 0
    ) then
      raise exception 'Es sind schon Begleitpersonen angemeldet. Begleitpersonen lassen sich nicht mehr verbieten.'
        using errcode = 'invalid_parameter_value';
    end if;
  end if;
  if p_max_participants is not null and p_max_participants < v_belegt then
    raise exception 'Es sind schon % Personen angemeldet. Weniger Plätze gehen nicht.', v_belegt
      using errcode = 'invalid_parameter_value';
  end if;
  if v_fee is distinct from alt.fee_cents
     and now() >= private.event_schluss(alt)
     and exists (select 1 from public.event_registrations
                  where event_id = p_id and status = 'registered') then
    raise exception 'Der Anmeldeschluss ist vorbei. Die Gebühr steht fest und lässt sich nicht mehr ändern.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.events set
    kind = p_kind,
    title = btrim(p_title),
    description = nullif(btrim(coalesce(p_description, '')), ''),
    location = nullif(btrim(coalesce(p_location, '')), ''),
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    registration_enabled = v_anmeldung,
    registration_deadline = case when v_anmeldung then p_registration_deadline end,
    max_participants = case when v_anmeldung then p_max_participants end,
    companions_allowed = v_anmeldung and coalesce(p_companions_allowed, false),
    fee_cents = v_fee,
    work_hours = p_work_hours,
    status = case when coalesce(p_veroeffentlichen, false) and status = 'draft'
                  then 'published'::public.event_status else status end,
    published_at = case when coalesce(p_veroeffentlichen, false) and status = 'draft'
                        then now() else published_at end
  where id = p_id;

  -- Gebuehr, Titel oder Tag koennen sich geaendert haben.
  for r in select id from public.event_registrations
            where event_id = p_id and status = 'registered'
  loop
    perform private.event_forderung_abgleichen(r.id);
  end loop;

  perform private.event_nachruecken(p_id);
  return p_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.event_veroeffentlichen(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.pruefe_event_admin();
  update public.events set status = 'published', published_at = now()
   where id = p_id and status = 'draft';
  if not found then
    raise exception 'Nur ein Entwurf lässt sich veröffentlichen.' using errcode = 'invalid_parameter_value';
  end if;
end; $function$;

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
end; $function$;

CREATE OR REPLACE FUNCTION public.guard_closed_billing_period()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_period uuid := coalesce(new.billing_period_id, old.billing_period_id);
  v_status public.billing_period_status;
  v_label  text;
begin
  select bp.status, bp.year || '-' || lpad(bp.month::text, 2, '0')
    into v_status, v_label
  from public.billing_periods bp
  where bp.id = v_period;

  if v_status is distinct from 'open' then
    raise exception
      'Abrechnungszeitraum % ist abgeschlossen (%). Buchungen können nicht mehr geändert werden.',
      v_label, v_status
      using errcode = 'check_violation';
  end if;

  -- Beim Verschieben in eine andere Periode muss auch die Zielperiode offen sein.
  if tg_op = 'UPDATE'
     and new.billing_period_id is distinct from old.billing_period_id then
    select bp.status into v_status
    from public.billing_periods bp
    where bp.id = new.billing_period_id;

    if v_status is distinct from 'open' then
      raise exception 'Zielzeitraum ist abgeschlossen.'
        using errcode = 'check_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_member_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_erlaubt constant text[] := array[
    'first_name', 'last_name', 'title', 'phone', 'mobile',
    'street', 'postcode', 'city', 'country_code',
    'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
    'nationality_code', 'updated_at'
  ];
  v_alt   jsonb := to_jsonb(old);
  v_neu   jsonb := to_jsonb(new);
  v_feld  text;
begin
  -- Kein angemeldeter Nutzer: Seed, Import, Cron oder Service-Rolle.
  if (select auth.uid()) is null then return new; end if;
  if (select private.is_admin()) then return new; end if;
  -- Eine der Onboarding-RPCs; sie prueft selbst, was sie schreibt.
  if coalesce(current_setting('tcm.selbstpflege_rpc', true), '') = 'on' then return new; end if;

  for v_feld in select jsonb_object_keys(v_neu) loop
    if v_neu -> v_feld is distinct from v_alt -> v_feld
       and not (v_feld = any (v_erlaubt))
    then
      raise exception 'Das Feld "%" kann nur ein Administrator ändern.', v_feld
        using errcode = 'insufficient_privilege';
    end if;
  end loop;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.join_booking(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_type public.booking_types%rowtype;
  v_max_open integer := public.setting_int('booking.max_open_bookings');
  v_besetzt integer;
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;
  perform private.pruefe_freigeschaltet();

  -- Die Sperre reiht gleichzeitige Beitritte hintereinander. Ohne sie
  -- zaehlen zwei dieselbe Besetzung, und beide kommen hinein (B6).
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.status <> 'active' then
    raise exception 'Diese Buchung ist storniert.' using errcode = 'check_violation';
  end if;
  if not v_booking.partner_wanted then
    raise exception 'Für diese Buchung werden keine Mitspieler gesucht.'
      using errcode = 'check_violation';
  end if;
  if lower(v_booking.slot) <= now() then
    raise exception 'Die Spielzeit hat bereits begonnen.' using errcode = 'check_violation';
  end if;
  if v_booking.member_id = v_me then
    raise exception 'Es ist deine eigene Buchung.' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.booking_players bp
              where bp.booking_id = p_booking_id and bp.member_id = v_me) then
    raise exception 'Du bist schon dabei.' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_type from public.booking_types where id = v_booking.booking_type_id;

  select 1 + count(*)::integer into v_besetzt
  from public.booking_players bp where bp.booking_id = p_booking_id;

  if v_besetzt >= v_type.max_players then
    raise exception 'Diese Buchung ist bereits voll.' using errcode = 'check_violation';
  end if;

  if v_max_open > 0 and v_type.counts_towards_quota
     and private.open_booking_count(v_me) >= v_max_open then
    raise exception 'Du hast bereits % offene Buchungen. Mehr sind nicht möglich.', v_max_open
      using errcode = 'check_violation';
  end if;

  perform private.pruefe_spielt_schon(array[v_me], v_booking.slot, p_booking_id);

  insert into public.booking_players (booking_id, member_id) values (p_booking_id, v_me);

  -- Voll ist voll: die Buchung verschwindet aus den offenen Spielen, ohne dass
  -- der Bucher daran denken muss.
  if v_besetzt + 1 >= v_type.max_players then
    update public.bookings set partner_wanted = false where id = p_booking_id;
  end if;

  insert into public.notifications (member_id, kind, title, body)
  values (v_booking.member_id, 'player_joined', 'Jemand spielt mit',
          format('%s hat sich für %s eingetragen.',
                 private.member_label(v_me), private.booking_label(p_booking_id)));
end; $function$;

CREATE OR REPLACE FUNCTION public.konto_loeschung_beantragen(p_nachricht text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me        uuid := private.current_member_id();
  v_nachricht text := nullif(btrim(coalesce(p_nachricht, '')), '');
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;

  if char_length(v_nachricht) > 1000 then
    raise exception 'Die Nachricht ist zu lang (höchstens 1000 Zeichen).'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Zwei gleichzeitige Klicks reihen sich hier hintereinander, der zweite
  -- sieht dann den ersten Antrag.
  perform 1 from public.members where id = v_me for update;

  if exists (select 1 from public.account_deletion_requests
              where member_id = v_me and created_at > now() - interval '24 hours') then
    return false;
  end if;

  insert into public.account_deletion_requests (member_id, message)
  values (v_me, v_nachricht);

  -- Admins und Vorstand mit Zugang. Wer selbst Admin ist und geht, braucht
  -- keine Nachricht ueber sich.
  insert into public.notifications (member_id, kind, title, body)
  select distinct m.id, 'account_deletion_requested', 'Kontolöschung beantragt',
         private.member_label(v_me) || ' möchte das eigene Konto löschen lassen.'
         || coalesce(E'\n\nNachricht: ' || v_nachricht, '')
  from public.member_roles r
  join public.members m on m.id = r.member_id
  where r.role in ('admin'::public.app_role, 'board'::public.app_role)
    and private.hat_zugang(m)
    and m.id <> v_me;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.leave_booking(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_type public.booking_types%rowtype;
  v_danach integer;
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;

  -- Gesperrt wie in join_booking: gehen zwei gleichzeitig, zaehlt der
  -- zweite sonst den ersten noch mit und unterschreitet die Untergrenze (B6).
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.status <> 'active' then
    raise exception 'Diese Buchung ist storniert.' using errcode = 'check_violation';
  end if;
  if v_booking.member_id = v_me then
    raise exception 'Als Bucher kannst du dich nicht austragen. Storniere die Buchung stattdessen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.booking_players bp
                  where bp.booking_id = p_booking_id and bp.member_id = v_me) then
    raise exception 'Du bist bei dieser Buchung nicht als Mitspieler eingetragen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if lower(v_booking.slot) <= now() then
    raise exception 'Die Spielzeit hat bereits begonnen.' using errcode = 'check_violation';
  end if;

  select * into v_type from public.booking_types where id = v_booking.booking_type_id;

  -- Nach dem Austragen: der Bucher plus alle Eintraege ausser dem eigenen.
  -- Gaeste zaehlen mit, sie stehen ja auch auf dem Platz.
  select 1 + count(*) filter (where bp.member_id is distinct from v_me)::integer
    into v_danach
  from public.booking_players bp where bp.booking_id = p_booking_id;

  if v_danach < v_type.min_players then
    raise exception 'Ohne dich wären es zu wenige Spieler. Bitte sag dem Bucher Bescheid.'
      using errcode = 'check_violation';
  end if;

  delete from public.booking_players
   where booking_id = p_booking_id and member_id = v_me;

  insert into public.notifications (member_id, kind, title, body)
  values (v_booking.member_id, 'player_left', 'Ein Mitspieler hat sich ausgetragen',
          format('%s spielt am %s nicht mit.',
                 private.member_label(v_me), private.booking_label(p_booking_id)));
end; $function$;

CREATE OR REPLACE FUNCTION public.link_auth_user(p_member_id uuid, p_auth_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_m public.members;
begin
  -- Entweder ein Administrator, oder ein Aufruf ohne angemeldeten Nutzer:
  -- Letzteres ist die Edge Function mit dem Service-Schluessel.
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Zugänge verwalten dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_m from public.members where id = p_member_id;
  if not found then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if v_m.auth_user_id is not null and v_m.auth_user_id <> p_auth_user_id then
    raise exception 'Dieses Mitglied hat bereits einen Zugang.'
      using errcode = 'check_violation';
  end if;

  perform private.login_pruefen(p_auth_user_id, p_member_id);

  update public.members
     set auth_user_id = p_auth_user_id,
         invited_at = coalesce(invited_at, now()),
         login_disabled_at = null
   where id = p_member_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_application_spam(p_application_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_admin() then
    raise exception 'Anträge bearbeiten dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.membership_applications set
    status = 'spam',
    decided_at = now(),
    decided_by = private.current_member_id()
  where id = p_application_id and status = 'new';
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_debit_batch_generated(p_batch_id uuid, p_storage_path text, p_total_cents integer, p_item_count integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status public.debit_batch_status; v_summe integer; v_anzahl integer;
begin
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
end; $function$;

CREATE OR REPLACE FUNCTION public.mark_debit_batch_submitted(p_batch_id uuid, p_submitted_on date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status public.debit_batch_status; v_faellig date;
begin
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
end; $function$;

CREATE OR REPLACE FUNCTION public.member_delete_impact(p_member_id uuid)
 RETURNS TABLE(charges integer, drink_purchases integer, bookings integer, booking_players integer, work_duty_entries integer, mandates integer, bank_accounts integer, can_delete boolean, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    v_charges, v_drinks, v_bookings, v_player, v_duty, v_mandate, v_konten,
    (v_charges + v_drinks + v_bookings + v_player = 0),
    case
      when v_charges + v_drinks + v_bookings + v_player = 0 then null::text
      else 'Zu diesem Mitglied gehören bereits Forderungen, Getränke oder Buchungen. '
        || 'Löschen würde die Buchhaltung zerreißen.'
    end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.member_notes(p_member_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_admin() then
    raise exception 'Notizen lesen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
  return (select notes from public.members where id = p_member_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.move_booking(p_booking_id uuid, p_court_id uuid, p_starts_at timestamp with time zone, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_court public.courts%rowtype;
  v_dauer interval;
  v_ends_at timestamptz;
  v_slot tstzrange;
  v_zeit_neu boolean;
  v_local_start time; v_local_end time;
  v_opening time := public.setting_time('booking.opening_time');
  v_closing time := public.setting_time('booking.closing_time');
  v_grid integer := public.setting_int('booking.slot_minutes');
  v_alt text; v_neu text; v_text text;
begin
  if v_me is null or not private.darf_plaetze() then
    raise exception 'Buchungen umsetzen kann nur die Platzverwaltung.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Gesperrt, damit niemand gleichzeitig storniert oder dieselbe Buchung
  -- woandershin setzt.
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.status <> 'active' then
    raise exception 'Diese Buchung ist storniert.' using errcode = 'check_violation';
  end if;
  -- Serientermine sind selbst Blockungen; deshalb zuerst, mit eigener Meldung.
  if v_booking.series_id is not null then
    raise exception 'Ein Serientermin lässt sich nicht einzeln umsetzen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if v_booking.kind <> 'booking' then
    raise exception 'Eine Sperrung lässt sich nicht umsetzen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if upper(v_booking.slot) <= now() then
    raise exception 'Die Buchung ist schon vorbei.' using errcode = 'check_violation';
  end if;

  select * into v_court from public.courts where id = p_court_id;
  if not found or not v_court.active then
    raise exception 'Auf diesen Platz kann nicht umgesetzt werden, er ist stillgelegt.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_zeit_neu := p_starts_at is distinct from lower(v_booking.slot);
  if p_court_id = v_booking.court_id and not v_zeit_neu then
    raise exception 'Die Buchung liegt schon dort.' using errcode = 'invalid_parameter_value';
  end if;

  v_dauer   := upper(v_booking.slot) - lower(v_booking.slot);
  v_ends_at := p_starts_at + v_dauer;
  v_slot    := tstzrange(p_starts_at, v_ends_at, '[)');

  -- Die Zeit wird nur geprueft, wenn sie sich aendert: ein reiner Platzwechsel
  -- uebernimmt die Zeit, die schon gilt.
  if v_zeit_neu then
    if lower(v_booking.slot) <= now() then
      raise exception 'Die Buchung läuft schon - sie kann nur noch den Platz wechseln.'
        using errcode = 'invalid_parameter_value';
    end if;

    -- Raster, Oeffnung und Schluss wie in create_booking.
    if extract(second from p_starts_at) <> 0
       or (extract(minute from p_starts_at)::integer % v_grid) <> 0 then
      raise exception 'Startzeit muss auf ein %-Minuten-Raster fallen.', v_grid
        using errcode = 'invalid_parameter_value';
    end if;

    v_local_start := (p_starts_at at time zone 'Europe/Berlin')::time;
    v_local_end   := (v_ends_at   at time zone 'Europe/Berlin')::time;

    if v_local_start < v_opening then
      raise exception 'Vor % wird nicht gespielt.', to_char(v_opening, 'HH24:MI')
        using errcode = 'invalid_parameter_value';
    end if;
    if v_local_end > v_closing or v_local_end <= v_local_start then
      raise exception 'Die Buchung endet nach % Uhr.', to_char(v_closing, 'HH24:MI')
        using errcode = 'invalid_parameter_value';
    end if;
    if p_starts_at < now() then
      raise exception 'Dieser Zeitpunkt liegt in der Vergangenheit.'
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  -- Erst der Platz, dann die Personen: ist der Platz belegt, ist das die
  -- treffendere Meldung. Die eigene Buchung zaehlt nicht mit - wer eine halbe
  -- Stunde nach hinten rutscht, ueberschneidet sich nur mit sich selbst.
  if exists (
    select 1 from public.bookings b
    where b.court_id = p_court_id and b.status = 'active'
      and b.slot && v_slot and b.id <> p_booking_id
  ) then
    raise exception 'Dieser Platz ist zu der Zeit bereits belegt.'
      using errcode = 'exclusion_violation';
  end if;

  v_alt := private.booking_label(p_booking_id);

  -- Faengt das Rennen mit einer gleichzeitigen Buchung auf dem Zielplatz ab.
  begin
    update public.bookings set court_id = p_court_id, slot = v_slot
     where id = p_booking_id;
  exception when exclusion_violation then
    raise exception 'Dieser Platz ist zu der Zeit bereits belegt.'
      using errcode = 'exclusion_violation';
  end;

  v_neu := private.booking_label(p_booking_id);

  -- Die offene Gastgebuehr nennt Platz und Zeit; sonst stuende auf der
  -- Lastschrift eine Buchung, die es so nie gab.
  update public.charges
     set description = 'Gastgebühr ' || v_neu
   where booking_id = p_booking_id and kind = 'guest' and status = 'open';

  v_text := format('Die Buchung am %s wurde verlegt: neu am %s.', v_alt, v_neu);
  if p_reason is not null and btrim(p_reason) <> '' then
    v_text := v_text || ' Grund: ' || btrim(p_reason);
  end if;

  insert into public.notifications (member_id, kind, title, body)
  select distinct p.member_id, 'booking_moved', 'Deine Platzbuchung wurde verlegt', v_text
  from (
    select v_booking.member_id as member_id
    union
    select bp.member_id from public.booking_players bp
    where bp.booking_id = p_booking_id and bp.member_id is not null
  ) p
  where p.member_id is not null and p.member_id <> v_me;
end; $function$;

CREATE OR REPLACE FUNCTION public.onboarding_accept_documents(p_codes text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me   uuid := private.current_member_id();
  v_code text;
  v_ver  integer;
begin
  if v_me is null then
    raise exception 'Nur Mitglieder können zustimmen.' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(cardinality(p_codes), 0) = 0 then
    raise exception 'Es wurde kein Text ausgewählt.' using errcode = 'invalid_parameter_value';
  end if;

  foreach v_code in array p_codes loop
    select d.version into v_ver from public.legal_documents d
    where d.code = v_code and d.active;
    if v_ver is null then
      raise exception 'Den Text "%" gibt es nicht.', v_code using errcode = 'invalid_parameter_value';
    end if;

    insert into public.member_consents (member_id, document_code, version)
    values (v_me, v_code, v_ver)
    on conflict (member_id, document_code, version) do nothing;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.onboarding_save_guardian(p_name text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_consent boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_m     public.members;
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  select * into v_m from public.members where id = private.current_member_id();
  if not found then
    raise exception 'Nur Mitglieder haben ein Onboarding.' using errcode = 'insufficient_privilege';
  end if;

  if v_email is not null and position('@' in v_email) < 2 then
    raise exception 'Bitte eine gültige E-Mail-Adresse der Erziehungsberechtigten angeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  if private.ist_minderjaehrig(v_m.birthday) then
    if v_name is null then
      raise exception 'Bitte den Namen der Erziehungsberechtigten angeben.'
        using errcode = 'invalid_parameter_value';
    end if;
    if v_email is null and v_phone is null then
      raise exception 'Bitte eine E-Mail-Adresse oder Telefonnummer der Erziehungsberechtigten angeben.'
        using errcode = 'invalid_parameter_value';
    end if;
    if not coalesce(p_consent, false) then
      raise exception 'Die Erziehungsberechtigten müssen der Mitgliedschaft zustimmen.'
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  perform set_config('tcm.selbstpflege_rpc', 'on', true);

  update public.members set
    guardian_name       = v_name,
    guardian_email      = v_email::extensions.citext,
    guardian_phone      = v_phone,
    guardian_consent_at = case when coalesce(p_consent, false)
                               then coalesce(v_m.guardian_consent_at, now()) end
  where id = v_m.id;

  perform set_config('tcm.selbstpflege_rpc', '', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.onboarding_save_notfallkontakt(p_name text, p_phone text, p_relation text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_m     public.members;
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  select * into v_m from public.members where id = private.current_member_id();
  if not found then
    raise exception 'Nur Mitglieder haben ein Onboarding.' using errcode = 'insufficient_privilege';
  end if;

  if private.ist_minderjaehrig(v_m.birthday) and (v_name is null or v_phone is null) then
    raise exception 'Bei Minderjährigen sind Name und Telefonnummer des Notfallkontakts Pflicht.'
      using errcode = 'invalid_parameter_value';
  end if;

  if (v_name is null) <> (v_phone is null) then
    raise exception 'Bitte Name und Telefonnummer des Notfallkontakts angeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.members set
    emergency_contact_name     = v_name,
    emergency_contact_phone    = v_phone,
    emergency_contact_relation = nullif(btrim(coalesce(p_relation, '')), '')
  where id = v_m.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.onboarding_save_stammdaten(p_first_name text, p_last_name text, p_birthday date, p_gender gender, p_street text, p_postcode text, p_city text, p_phone text DEFAULT NULL::text, p_mobile text DEFAULT NULL::text, p_salutation salutation DEFAULT NULL::salutation, p_title text DEFAULT NULL::text, p_country_code text DEFAULT 'DE'::text, p_nationality_code text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_m     public.members;
  v_fehlt text[];
begin
  select * into v_m from public.members where id = private.current_member_id();
  if not found then
    raise exception 'Nur Mitglieder haben ein Onboarding.' using errcode = 'insufficient_privilege';
  end if;

  -- Geburtsdatum und Geschlecht korrigiert das Mitglied nur hier, solange das
  -- Onboarding offen ist. Danach geht das ueber den Vorstand.
  if v_m.onboarding_completed_at is not null then
    raise exception 'Das Onboarding ist abgeschlossen. Geburtsdatum und Geschlecht ändert jetzt der Vorstand.'
      using errcode = 'check_violation';
  end if;

  if length(btrim(coalesce(p_first_name, ''))) = 0
     or length(btrim(coalesce(p_last_name, ''))) = 0 then
    raise exception 'Vor- und Nachname sind Pflicht.' using errcode = 'invalid_parameter_value';
  end if;

  v_fehlt := private.fehlende_stammdaten(p_birthday, p_gender, p_street, p_postcode,
                                         p_city, p_phone, p_mobile);
  if cardinality(v_fehlt) > 0 then
    raise exception 'Pflichtangaben fehlen: %.', array_to_string(v_fehlt, ', ')
      using errcode = 'invalid_parameter_value';
  end if;

  if p_birthday > private.heute() or p_birthday < date '1900-01-01' then
    raise exception 'Bitte ein gültiges Geburtsdatum angeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  perform set_config('tcm.selbstpflege_rpc', 'on', true);

  update public.members set
    first_name       = btrim(p_first_name),
    last_name        = btrim(p_last_name),
    title            = nullif(btrim(coalesce(p_title, '')), ''),
    birthday         = p_birthday,
    gender           = p_gender,
    salutation       = coalesce(p_salutation, private.anrede_aus_geschlecht(p_gender)),
    street           = btrim(p_street),
    postcode         = btrim(p_postcode),
    city             = btrim(p_city),
    phone            = nullif(btrim(coalesce(p_phone, '')), ''),
    mobile           = nullif(btrim(coalesce(p_mobile, '')), ''),
    country_code     = coalesce(nullif(upper(btrim(coalesce(p_country_code, ''))), ''), 'DE'),
    nationality_code = nullif(upper(btrim(coalesce(p_nationality_code, ''))), ''),
    onboarding_stammdaten_at = now()
  where id = v_m.id;

  perform set_config('tcm.selbstpflege_rpc', '', true);
end;
$function$;

CREATE OR REPLACE FUNCTION private.einzug_pruefung(p_charge_ids uuid[], p_collection_date date)
 RETURNS TABLE(member_id uuid, member_name text, charge_ids uuid[], positionen integer, arten text, kinds charge_kind[], amount_cents integer, mandate_id uuid, mandate_reference text, einzugsfaehig boolean, grund text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
          'Kein gültiges Mandat hinterlegt.'
        when max(p.signed_on) > p_collection_date then
          'Das Mandat ist erst nach dem Abbuchungstag unterschrieben.'
        when coalesce(max(p.last_used_on), max(p.signed_on)) + interval '36 months'
             < (now() at time zone 'Europe/Berlin')::date then
          'Das Mandat ist seit über 36 Monaten ungenutzt und damit erloschen. '
          'Es muss neu eingeholt werden.'
        when sum(p.amount_cents) < public.setting_int('drinks.min_debit_cents') then
          'Unter dem Mindestbetrag. Der Betrag geht beim nächsten Einzug mit.'
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
$function$;

CREATE OR REPLACE FUNCTION private.encrypt_iban(p_iban text)
 RETURNS bytea
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'iban_encryption_key';

  if v_key is null then
    raise exception 'Vault-Secret "iban_encryption_key" fehlt. IBANs können nicht gespeichert werden.'
      using errcode = 'no_data_found';
  end if;

  return extensions.pgp_sym_encrypt(p_iban, v_key);
end;
$function$;

CREATE OR REPLACE FUNCTION private.event_aenderung_melden()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.status = 'published' and new.status = 'cancelled' then
    insert into public.notifications (member_id, kind, title, body, event_id)
    select r.member_id, 'event_cancelled', 'Abgesagt: ' || new.title,
           format('%s %s fällt aus.', new.title,
                  private.event_wann(new.starts_at, new.ends_at, new.location))
           || case
                when c.id is null then ''
                when private.forderung_gesperrt(c) then
                  ' Die Gebühr ist schon im Einzug - der Verein meldet sich wegen der Erstattung.'
                else ' Die Gebühr entfällt.'
              end,
           new.id
    from public.event_registrations r
    left join public.charges c
      on c.event_id = r.event_id and c.member_id = r.member_id and c.status <> 'waived'
    where r.event_id = new.id
      and r.status in ('registered', 'waitlisted')
      and r.member_id is distinct from private.current_member_id();

  elsif old.status = 'published' and new.status = 'published'
        and (old.starts_at, old.ends_at, old.location)
            is distinct from (new.starts_at, new.ends_at, new.location)
        and coalesce(new.ends_at, new.starts_at) > now() then
    insert into public.notifications (member_id, kind, title, body, event_id)
    select r.member_id, 'event_changed', 'Geändert: ' || new.title,
           format('%s findet jetzt %s statt (bisher %s).', new.title,
                  private.event_wann(new.starts_at, new.ends_at, new.location),
                  private.event_wann(old.starts_at, old.ends_at, old.location)),
           new.id
    from public.event_registrations r
    where r.event_id = new.id
      and r.status in ('registered', 'waitlisted')
      and r.member_id is distinct from private.current_member_id();
  end if;
  return null;
end; $function$;

CREATE OR REPLACE FUNCTION private.event_erinnerungen(p_jetzt timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e public.events;
  v_schluss timestamptz;
  v_anzahl integer := 0;
  v_n integer;
begin
  -- Zwei Laeufe zugleich (etwa von Hand und per Zeitgeber) duerfen nicht
  -- beide erinnern.
  perform pg_advisory_xact_lock(hashtext('event_erinnerungen'));

  for e in
    select * from public.events ev
     where ev.status = 'published'
       and ev.registration_enabled
       and ev.reminder_sent_at is null
       and private.event_schluss(ev) > p_jetzt
       and private.event_schluss(ev) <= p_jetzt + interval '2 days'
     for update
  loop
    v_schluss := private.event_schluss(e);

    insert into public.notifications (member_id, kind, title, body, event_id)
    select m.id, 'event_reminder', 'Anmeldeschluss naht: ' || e.title,
           format('%s %s. Anmeldung noch bis %s Uhr.', e.title,
                  private.event_wann(e.starts_at, e.ends_at, e.location),
                  to_char(v_schluss at time zone 'Europe/Berlin', 'DD.MM.YYYY, HH24:MI'))
           || case
                when e.max_participants is not null
                     and private.event_belegt(e.id) >= e.max_participants
                  then ' Gerade ausgebucht - du kämst auf die Warteliste.'
                else ''
              end,
           e.id
    from public.members m
    where m.status = 'active'
      and not exists (
        select 1 from public.event_registrations r
         where r.event_id = e.id and r.member_id = m.id)
      and not exists (
        select 1 from public.notifications n
         where n.event_id = e.id and n.member_id = m.id
           and n.kind = 'event_published'
           and n.created_at > p_jetzt - interval '1 day');
    get diagnostics v_n = row_count;
    v_anzahl := v_anzahl + v_n;

    update public.events set reminder_sent_at = p_jetzt where id = e.id;
  end loop;

  return v_anzahl;
end; $function$;

CREATE OR REPLACE FUNCTION private.event_forderung_abgleichen(p_registration_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.event_registrations;
  e public.events;
  c public.charges;
  v_personen integer;
  v_soll integer;
  v_text text;
begin
  select * into r from public.event_registrations where id = p_registration_id;
  select * into e from public.events where id = r.event_id;

  v_personen := 1 + r.companions;
  v_soll := case
    when r.status = 'registered' and e.status <> 'cancelled' and coalesce(e.fee_cents, 0) > 0
      then e.fee_cents * v_personen
    else 0
  end;
  v_text := e.title || ' am ' || to_char(e.starts_at at time zone 'Europe/Berlin', 'DD.MM.YYYY')
            || case when v_personen > 1 then ' (' || v_personen || ' Personen)' else '' end;

  select * into c from public.charges
   where event_id = e.id and member_id = r.member_id and status <> 'waived'
   for update;

  if c.id is null then
    if v_soll > 0 and not exists (
      select 1 from public.charges
       where event_id = e.id and member_id = r.member_id and status = 'waived'
    ) then
      insert into public.charges
        (member_id, payer_id, kind, period_label, amount_cents, description, event_id)
      values (r.member_id, r.member_id, 'event', null, v_soll, v_text, e.id);
    end if;
    return;
  end if;

  if private.forderung_gesperrt(c) then
    if c.amount_cents <> v_soll then
      raise exception
        'Die Forderung steckt schon in einem Einzug und lässt sich nicht mehr ändern. Erlassen geht weiterhin in der Kasse.'
        using errcode = 'invalid_parameter_value';
    end if;
    return;
  end if;

  if v_soll = 0 then
    delete from public.charges where id = c.id;
  elsif c.amount_cents <> v_soll or c.description <> v_text then
    update public.charges set amount_cents = v_soll, description = v_text where id = c.id;
  end if;
end; $function$;

CREATE OR REPLACE FUNCTION private.event_nachgerueckt_melden()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.events; v_betrag integer;
begin
  if new.member_id is not distinct from private.current_member_id() then
    return null;
  end if;
  select * into e from public.events where id = new.event_id;
  if e.status <> 'published' then
    return null;
  end if;
  v_betrag := coalesce(e.fee_cents, 0) * (1 + new.companions);

  insert into public.notifications (member_id, kind, title, body, event_id)
  values (
    new.member_id, 'event_promoted', 'Du bist nachgerückt',
    format('Für %s %s ist ein Platz frei geworden - du bist jetzt angemeldet.',
           e.title, private.event_wann(e.starts_at, e.ends_at, e.location))
    || case when v_betrag > 0
         then format(' Die Gebühr von %s Euro steht in deinem Konto.', private.cent_text(v_betrag))
         else '' end,
    e.id
  );
  return null;
end; $function$;

CREATE OR REPLACE FUNCTION private.fehlende_stammdaten(p_birthday date, p_gender gender, p_street text, p_postcode text, p_city text, p_phone text, p_mobile text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select array_remove(array[
    case when p_birthday is null then 'Geburtsdatum' end,
    case when p_gender is null then 'Geschlecht' end,
    case when btrim(coalesce(p_street, '')) = '' then 'Straße' end,
    case when btrim(coalesce(p_postcode, '')) = '' then 'PLZ' end,
    case when btrim(coalesce(p_city, '')) = '' then 'Ort' end,
    case when btrim(coalesce(p_phone, '')) = '' and btrim(coalesce(p_mobile, '')) = ''
         then 'Telefon' end
  ], null);
$function$;

CREATE OR REPLACE FUNCTION private.gastgebuehr_entfallen(p_charge_id uuid, p_grund text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'Die Gastgebühr steckt in einem Einzug, dessen Lastschriftdatei schon erzeugt ist.');

  update public.charges
     set status = 'waived',
         description = description || ' [erlassen: ' || p_grund || ']'
   where id = c.id;
  return true;
end; $function$;

CREATE OR REPLACE FUNCTION private.guard_collection_date()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.collection_date < old.collection_date
     and exists (select 1 from public.debit_items where batch_id = old.id) then
    raise exception
      'Der Fälligkeitstag lässt sich nicht vorziehen, solange Posten am Lauf hängen.'
      using errcode = 'invalid_parameter_value';
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION private.guard_prenotification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      'Diese Forderung ist nicht angekündigt. Ohne Vorabankündigung darf nicht eingezogen werden.'
      using errcode = 'invalid_parameter_value';
  end if;

  if v_faellig < (c.notified_at at time zone 'Europe/Berlin')::date + v_frist then
    raise exception
      'Zwischen Ankündigung und Fälligkeit müssen % Tage liegen.', v_frist
      using errcode = 'invalid_parameter_value';
  end if;

  -- Leicht zu uebersehen und trotzdem wichtig: wer eine Faelligkeit zum 15.
  -- angekuendigt hat, darf nicht am 10. einziehen, auch wenn die 14 Tage
  -- rechnerisch laengst um sind.
  if c.due_date is not null and v_faellig < c.due_date then
    raise exception
      'Angekündigt war der %. Früher darf nicht eingezogen werden.',
      to_char(c.due_date, 'DD.MM.YYYY')
      using errcode = 'invalid_parameter_value';
  end if;

  return new;
end; $function$;

CREATE OR REPLACE FUNCTION private.guard_single_attribute_value()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_typ public.member_attribute_types;
begin
  select * into v_typ from public.member_attribute_types where id = new.attribute_type_id;

  if not found then
    raise exception 'Dieses Merkmal gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if not v_typ.multiple and exists (
    select 1 from public.member_attribute_values v
    where v.member_id = new.member_id
      and v.attribute_type_id = new.attribute_type_id
      and v.id is distinct from new.id
  ) then
    raise exception 'Für "%" ist nur ein Wert vorgesehen.', v_typ.name
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.login_pruefen(p_auth_user_id uuid, p_member_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_auth_user_id is null then
    raise exception 'Ohne Login kann kein Mitglied angelegt werden.'
      using errcode = 'invalid_parameter_value';
  end if;

  if not exists (select 1 from auth.users where id = p_auth_user_id) then
    raise exception 'Diesen Login gibt es nicht.' using errcode = 'no_data_found';
  end if;

  -- O25: Das Kiosk-Tablet ist ein Geraetekonto und gehoert keiner Person.
  if exists (select 1 from public.kiosk_devices where auth_user_id = p_auth_user_id) then
    raise exception 'Dieser Zugang gehört zu einem Kiosk-Gerät und lässt sich keinem Mitglied zuordnen.'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.members
              where auth_user_id = p_auth_user_id
                and id is distinct from p_member_id) then
    raise exception 'Dieser Zugang gehört bereits zu einem anderen Mitglied.'
      using errcode = 'check_violation';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.pruefe_event_admin()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_admin() then
    raise exception 'Veranstaltungen verwalten dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
end; $function$;

CREATE OR REPLACE FUNCTION private.pruefe_freigeschaltet()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_member() then
    raise exception 'Bitte schließe zuerst die Einrichtung deines Kontos ab.'
      using errcode = 'insufficient_privilege';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.rechtstext_fassung_schuetzen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (new.title is distinct from old.title or new.body_md is distinct from old.body_md)
     and exists (select 1 from public.member_consents c
                  where c.document_code = old.code and c.version = old.version) then
    raise exception 'Dieser Fassung haben Mitglieder bereits zugestimmt. Für einen neuen Text bitte eine neue Version anlegen.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.record_purchase(p_member_id uuid, p_item_id uuid, p_quantity integer, p_source purchase_source, p_recorded_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_price integer;
  v_id    uuid;
  v_item  public.drink_items%rowtype;
begin
  if p_quantity < 1 or p_quantity > 50 then
    raise exception 'Menge muss zwischen 1 und 50 liegen.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_item from public.drink_items where id = p_item_id;
  if not found then
    raise exception 'Unbekannter Artikel.' using errcode = 'no_data_found';
  end if;

  if not v_item.active then
    raise exception '"%" wird nicht mehr geführt.', v_item.name
      using errcode = 'invalid_parameter_value';
  end if;

  -- Wer zu einem kuenftigen Datum ausgetreten ist, steht schon auf inaktiv,
  -- ist bis dahin aber Mitglied und trinkt am Kiosk (B21).
  if not exists (select 1 from public.members m
                 where m.id = p_member_id and private.hat_zugang(m)) then
    raise exception 'Kein aktives Mitglied.' using errcode = 'no_data_found';
  end if;

  v_price := private.current_drink_price(p_item_id);
  if v_price is null then
    raise exception 'Für "%" ist kein Preis hinterlegt.', v_item.name
      using errcode = 'no_data_found';
  end if;

  insert into public.drink_purchases
    (member_id, drink_item_id, quantity, unit_price_cents, source, recorded_by)
  values
    (p_member_id, p_item_id, p_quantity, v_price, p_source, p_recorded_by)
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.sync_guest_charges(p_booking_id uuid, p_member_id uuid, p_anzahl integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        'Die Gastgebühr ist schon im Lastschrifteinzug und wird eingezogen. Der Gast lässt sich nicht mehr austragen.'
        using errcode = 'invalid_parameter_value';
    end if;
    return;
  end if;

  -- Jedes Mitglied zahlt selbst.
  v_payer := p_member_id;

  v_text := 'Gastgebühr ' || private.booking_label(p_booking_id);

  insert into public.charges (member_id, payer_id, kind, amount_cents, description, booking_id)
  select p_member_id, v_payer, 'guest', v_gebuehr, v_text, p_booking_id
  from generate_series(1, p_anzahl - v_ist);
end; $function$;

CREATE OR REPLACE FUNCTION public.reactivate_member(p_member_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_m public.members;
begin
  if not private.is_admin() then
    raise exception 'Mitglieder reaktivieren dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_m from public.members where id = p_member_id for update;
  if not found then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if v_m.status <> 'archived' then
    raise exception 'Dieses Mitglied ist nicht archiviert.' using errcode = 'check_violation';
  end if;

  -- Erkennungszeichen wie in anonymize_member.
  if v_m.auth_user_id is null and v_m.last_name like 'Mitglied #%' then
    raise exception 'Ein anonymisiertes Mitglied lässt sich nicht reaktivieren.'
      using errcode = 'check_violation';
  end if;

  update public.members set
    status = 'active',
    onboarding_completed_at = null,
    onboarding_stammdaten_at = null
  where id = p_member_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reactivate_membership(p_member_id uuid, p_started_on date DEFAULT ((now() AT TIME ZONE 'Europe/Berlin'::text))::date, p_number text DEFAULT NULL::text, p_fee_type_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status public.member_status;
  v_nummer text;
  v_fee    uuid;
begin
  if not private.is_admin() then
    raise exception 'Wiedereintritte eintragen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from public.members where id = p_member_id;
  if not found then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if v_status = 'archived' then
    raise exception 'Ein archiviertes Mitglied muss zuerst reaktiviert werden.'
      using errcode = 'check_violation';
  end if;

  -- Vorher pruefen statt den Unique-Index sprechen zu lassen: dessen Meldung
  -- nennt einen Indexnamen, kein Problem.
  if exists (select 1 from public.memberships
              where member_id = p_member_id and ended_on is null) then
    raise exception 'Dieses Mitglied hat bereits eine laufende Mitgliedschaft.'
      using errcode = 'check_violation';
  end if;

  -- War der Austritt schon vorbei, sind die alten Rollen erloschen (bei
  -- einem Austritt zum kuenftigen Datum hat end_membership sie stehen
  -- lassen). Sie kommen nicht von selbst zurueck.
  if not exists (select 1 from public.memberships
                  where member_id = p_member_id and ended_on >= private.heute()) then
    delete from public.member_roles where member_id = p_member_id and role <> 'member';
  end if;

  v_nummer := coalesce(nullif(btrim(coalesce(p_number, '')), ''),
                       private.next_membership_number());

  insert into public.memberships (member_id, number, started_on, status)
  values (p_member_id, v_nummer, p_started_on, 'active');

  update public.members set status = 'active' where id = p_member_id;

  foreach v_fee in array coalesce(p_fee_type_ids, '{}') loop
    insert into public.member_fees (member_id, fee_type_id, year)
    values (p_member_id, v_fee, extract(year from p_started_on)::integer)
    on conflict do nothing;
  end loop;

  return v_nummer;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_debit_return(p_end_to_end_id text, p_reason text, p_returned_on date DEFAULT NULL::date)
 RETURNS TABLE(forderungen integer, summe_cents integer, payer_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tag date := coalesce(p_returned_on, (now() at time zone 'Europe/Berlin')::date);
  v_payer uuid;
  v_name text;
  v_anzahl integer;
  v_summe integer;
begin
  if not private.is_admin() then
    raise exception 'Rückläufer erfassen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Bitte den Grund der Rücklastschrift angeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  select c.payer_id into v_payer
  from public.debit_items i
  join public.charges c on c.id = i.charge_id
  where i.end_to_end_id = p_end_to_end_id
  limit 1;

  if v_payer is null then
    raise exception 'Zu dieser Kennung gibt es keine Lastschrift.'
      using errcode = 'no_data_found';
  end if;

  if exists (select 1 from public.debit_items
              where end_to_end_id = p_end_to_end_id and result = 'returned') then
    raise exception 'Diese Lastschrift ist bereits als zurückgebucht vermerkt.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.debit_items
     set result = 'returned', return_reason = btrim(p_reason), returned_on = v_tag
   where end_to_end_id = p_end_to_end_id;

  update public.charges c
     set status = 'returned'
   where c.id in (select charge_id from public.debit_items
                   where end_to_end_id = p_end_to_end_id);

  select count(*)::integer, coalesce(sum(c.amount_cents), 0)::integer
    into v_anzahl, v_summe
  from public.debit_items i
  join public.charges c on c.id = i.charge_id
  where i.end_to_end_id = p_end_to_end_id;

  v_name := private.member_label(v_payer);

  -- Der Zahler muss handeln: das Geld ist zurueck, die Forderung steht wieder
  -- offen. Ohne Nachricht erfaehrt er es erst bei der Mahnung.
  insert into public.notifications (member_id, kind, title, body)
  values (v_payer, 'charge_returned', 'Lastschrift zurückgebucht',
          'Die Lastschrift über ' || private.cent_text(v_summe) ||
          ' Euro vom ' || to_char(v_tag, 'DD.MM.YYYY') ||
          ' kam zurück: ' || btrim(p_reason) ||
          '. Bitte melde dich beim Verein, damit wir das klären können.');

  return query select v_anzahl, v_summe, v_name;
end; $function$;

CREATE OR REPLACE FUNCTION public.record_drink_purchase_for(p_member_id uuid, p_item_id uuid, p_quantity integer DEFAULT 1)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_me uuid := private.current_member_id(); v_source public.purchase_source;
begin
  if private.is_kiosk() then
    v_source := 'kiosk';
    update public.kiosk_devices set last_seen_at = now() where auth_user_id = (select auth.uid());
  elsif private.is_admin() then
    -- Der Thekendienst als eigene Rolle ist entfallen; am Tresen laeuft das
    -- ueber das Kiosk-Geraet, ausserdem koennen Admins nachtragen.
    v_source := 'bar_duty';
  else
    raise exception 'Dafür brauchst du Administratorrechte oder ein Kiosk-Gerät.'
      using errcode = 'insufficient_privilege';
  end if;
  return private.record_purchase(p_member_id, p_item_id, p_quantity, v_source, v_me);
end; $function$;

CREATE OR REPLACE FUNCTION public.record_drink_purchase(p_item_id uuid, p_quantity integer DEFAULT 1)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := private.current_member_id();
begin
  if v_me is null then
    raise exception 'Nur Mitglieder können Getränke buchen.'
      using errcode = 'insufficient_privilege';
  end if;
  perform private.pruefe_freigeschaltet();
  return private.record_purchase(v_me, p_item_id, p_quantity, 'app', v_me);
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_work_duty(p_member_id uuid, p_hours numeric, p_worked_on date, p_description text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    raise exception 'Ohne Einsatztag lässt sich nichts eintragen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_worked_on > v_heute then
    raise exception 'Ein Einsatz in der Zukunft lässt sich nicht eintragen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  v_jahr := extract(year from p_worked_on)::integer;

  if exists (select 1 from public.work_duty_settlements
              where member_id = p_member_id and year = v_jahr) then
    raise exception
      'Für % ist der Arbeitsdienst dieses Mitglieds bereits abgerechnet. Eine Nachmeldung ginge ins Leere.',
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
end; $function$;

CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text, p_device_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_member uuid; v_alt public.push_tokens; v_alt_zugang boolean;
begin
  v_member := (select private.current_member_id());
  if v_member is null then
    raise exception 'Nur Mitglieder können ein Gerät anmelden.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(p_token), '') = '' then
    raise exception 'Ohne Marke lässt sich kein Gerät anmelden.'
      using errcode = 'check_violation';
  end if;

  -- Umziehen nur, wenn das Geraet frei ist (S26): stillgelegt, oder der
  -- bisherige Besitzer hat keinen Zugang mehr. Sonst koennte jeder, der eine
  -- fremde Marke kennt, dessen Nachrichten auf sein Konto umleiten. Auf dem
  -- Familientelefon meldet die App beim Abmelden ab (remove_push_token), dann
  -- ist die Marke ohnehin frei.
  select pt.* into v_alt from public.push_tokens pt where pt.token = btrim(p_token) for update;
  if found and v_alt.member_id <> v_member and v_alt.disabled_at is null then
    select private.hat_zugang(m) into v_alt_zugang from public.members m where m.id = v_alt.member_id;
    if coalesce(v_alt_zugang, false) then
      raise exception 'Dieses Gerät ist noch für ein anderes Mitglied angemeldet. Bitte dort zuerst abmelden.'
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.push_tokens (member_id, token, platform, device_name)
  values (v_member, btrim(p_token), p_platform, nullif(btrim(p_device_name), ''))
  on conflict (token) do update
    set member_id    = v_member,
        platform     = excluded.platform,
        device_name  = excluded.device_name,
        last_seen_at = now(),
        disabled_at  = null;
end; $function$;

CREATE OR REPLACE FUNCTION public.remove_charge_from_debit_batch(p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_batch uuid; v_status public.debit_batch_status;
begin
  if not private.is_admin() then
    raise exception 'Lastschriftläufe ändern dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select i.batch_id, b.status into v_batch, v_status
  from public.debit_items i join public.debit_batches b on b.id = i.batch_id
  where i.id = p_item_id;

  if v_batch is null then
    raise exception 'Diesen Posten gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'draft' then
    raise exception 'Aus einem erzeugten Lauf lässt sich nichts mehr herausnehmen.'
      using errcode = 'invalid_parameter_value';
  end if;

  delete from public.debit_items where id = p_item_id;

  update public.debit_batches b
     set total_cents = (select coalesce(sum(amount_cents), 0)::integer
                        from public.debit_items where batch_id = v_batch),
         item_count  = (select count(distinct end_to_end_id)::integer
                        from public.debit_items where batch_id = v_batch)
   where b.id = v_batch;
end; $function$;

CREATE OR REPLACE FUNCTION public.remove_drink_price(p_item_id uuid, p_valid_from date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_admin() then
    raise exception 'Getränke können nur Administratoren pflegen.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_valid_from <= (now() at time zone 'Europe/Berlin')::date then
    raise exception
      'Nur ein geplanter Preis lässt sich zurücknehmen. Vergangene Preise bleiben als Beleg stehen.'
      using errcode = 'invalid_parameter_value';
  end if;

  delete from public.drink_prices
   where drink_item_id = p_item_id and valid_from = p_valid_from;
end; $function$;

CREATE OR REPLACE FUNCTION public.remove_member_attribute(p_member_id uuid, p_type_code text, p_option_value text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_typ public.member_attribute_types;
begin
  select * into v_typ from public.member_attribute_types where code = p_type_code;
  if not found then
    raise exception 'Dieses Merkmal gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if not private.darf_merkmal_setzen(p_member_id, v_typ) then
    raise exception 'Dieses Merkmal kann nur ein Administrator ändern.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_option_value is null then
    delete from public.member_attribute_values
    where member_id = p_member_id and attribute_type_id = v_typ.id;
  else
    delete from public.member_attribute_values v
    using public.member_attribute_options o
    where v.member_id = p_member_id
      and v.attribute_type_id = v_typ.id
      and o.id = v.option_id
      and o.value = btrim(p_option_value);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_member_fee(p_member_id uuid, p_fee_type_id uuid, p_year integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_admin() then
    raise exception 'Beitragsarten entfernen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.member_fees
  where member_id = p_member_id and fee_type_id = p_fee_type_id and year = p_year;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_push_token(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_member uuid;
begin
  v_member := (select private.current_member_id());
  if v_member is null then
    raise exception 'Nur Mitglieder können ein Gerät abmelden.'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.push_tokens
   where token = btrim(p_token) and member_id = v_member;
end; $function$;

CREATE OR REPLACE FUNCTION public.remove_work_duty_rule(p_fee_type_id uuid, p_year integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_admin() then
    raise exception 'Arbeitsdienst-Regeln pflegen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.work_duty_settlements where year = p_year) then
    raise exception
      'Für % ist der Arbeitsdienst bereits abgerechnet. Die Regeln lassen sich nicht mehr ändern.',
      p_year using errcode = 'invalid_parameter_value';
  end if;

  delete from public.work_duty_rules
   where fee_type_id = p_fee_type_id and year = p_year;
end; $function$;

CREATE OR REPLACE FUNCTION public.reorder_courts(p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_anzahl integer;
begin
  if not private.is_admin() then
    raise exception 'Plätze können nur Administratoren pflegen.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  update public.courts c
     set position = x.ord
  from (select id, ord from unnest(p_ids) with ordinality as t(id, ord)) x
  where c.id = x.id;
  get diagnostics v_anzahl = row_count;

  return v_anzahl;
end; $function$;

CREATE OR REPLACE FUNCTION public.reorder_drink_items(p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_anzahl integer;
begin
  if not private.is_admin() then
    raise exception 'Getränke können nur Administratoren pflegen.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  update public.drink_items d
     set sort_order = x.ord
  from (select id, ord from unnest(p_ids) with ordinality as t(id, ord)) x
  where d.id = x.id;
  get diagnostics v_anzahl = row_count;

  return v_anzahl;
end; $function$;

CREATE OR REPLACE FUNCTION public.revoke_sepa_mandate(p_mandate_id uuid, p_revoked_on date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_offen integer;
begin
  if not private.is_admin() then
    raise exception 'Mandate widerrufen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.sepa_mandates where id = p_mandate_id) then
    raise exception 'Dieses Mandat gibt es nicht.' using errcode = 'no_data_found';
  end if;

  -- Ein Mandat, mit dem gerade eingezogen wird, darf nicht verschwinden -
  -- sonst steht in der Lastschriftdatei eine Referenz ohne Grundlage.
  select count(*)::integer into v_offen
  from public.debit_items
  where mandate_id = p_mandate_id and result = 'pending';

  if v_offen > 0 then
    raise exception 'Dieses Mandat steckt in einem noch nicht abgeschlossenen Lastschriftlauf.'
      using errcode = 'check_violation';
  end if;

  update public.sepa_mandates
     set status = 'revoked', revoked_on = coalesce(p_revoked_on, private.heute())
   where id = p_mandate_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_court_active(p_id uuid, p_active boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_offen integer;
begin
  if not private.is_admin() then
    raise exception 'Plätze können nur Administratoren pflegen.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.courts set active = coalesce(p_active, true) where id = p_id;
  if not found then
    raise exception 'Diesen Platz gibt es nicht.' using errcode = 'no_data_found';
  end if;

  select count(*)::integer into v_offen
  from public.bookings
  where court_id = p_id and status = 'active' and upper(slot) > now();

  return v_offen;
end; $function$;

CREATE OR REPLACE FUNCTION public.set_drink_item_active(p_id uuid, p_active boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_offen integer;
begin
  if not private.is_admin() then
    raise exception 'Getränke können nur Administratoren pflegen.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.drink_items set active = coalesce(p_active, true) where id = p_id;
  if not found then
    raise exception 'Dieses Getränk gibt es nicht.' using errcode = 'no_data_found';
  end if;

  select count(*)::integer into v_offen
  from public.drink_purchases p
  join public.billing_periods b on b.id = p.billing_period_id
  where p.drink_item_id = p_id and p.voided_at is null and b.status = 'open';

  return v_offen;
end; $function$;

CREATE OR REPLACE FUNCTION public.set_drink_price(p_item_id uuid, p_price_cents integer, p_valid_from date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ab date := coalesce(p_valid_from, (now() at time zone 'Europe/Berlin')::date);
  v_name text;
  v_betroffen integer;
begin
  if not private.is_admin() then
    raise exception 'Getränke können nur Administratoren pflegen.'
      using errcode = 'insufficient_privilege';
  end if;

  select name into v_name from public.drink_items where id = p_item_id;
  if v_name is null then
    raise exception 'Dieses Getränk gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if v_ab < (now() at time zone 'Europe/Berlin')::date then
    raise exception
      'Ein Preis kann nicht rückwirkend gelten. Bereits gebuchte Getränke behalten ohnehin ihren Preis.'
      using errcode = 'invalid_parameter_value';
  end if;
  -- Obergrenze wie bei den Buchungsarten: ein Tippfehler soll nicht als
  -- 300-Euro-Bier in der Karte landen.
  if p_price_cents is null or p_price_cents < 1 or p_price_cents > 10000 then
    raise exception 'Der Preis muss zwischen 0,01 und 100,00 Euro liegen.'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.drink_prices (drink_item_id, valid_from, price_cents)
  values (p_item_id, v_ab, p_price_cents)
  on conflict (drink_item_id, valid_from) do update set price_cents = excluded.price_cents;

  select count(*)::integer into v_betroffen
  from public.drink_purchases p
  join public.billing_periods b on b.id = p.billing_period_id
  where p.drink_item_id = p_item_id
    and p.voided_at is null
    and b.status = 'open';

  return v_betroffen;
end; $function$;

CREATE OR REPLACE FUNCTION public.set_fee_price(p_fee_type_id uuid, p_valid_from_year integer, p_amount_cents integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_admin() then
    raise exception 'Beitragsarten pflegen dürfen nur Administratoren.'
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
      'Für % wurden bereits Forderungen erzeugt. Ein Preis für dieses Jahr lässt sich nicht mehr ändern.',
      p_valid_from_year using errcode = 'invalid_parameter_value';
  end if;

  insert into public.fee_prices (fee_type_id, valid_from_year, amount_cents)
  values (p_fee_type_id, p_valid_from_year, p_amount_cents)
  on conflict (fee_type_id, valid_from_year) do update
    set amount_cents = excluded.amount_cents;
end; $function$;

CREATE OR REPLACE FUNCTION public.set_fee_type_active(p_id uuid, p_active boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_jahr integer := extract(year from (now() at time zone 'Europe/Berlin'))::integer;
        v_anzahl integer;
begin
  if not private.is_admin() then
    raise exception 'Beitragsarten pflegen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.fee_types set active = coalesce(p_active, true) where id = p_id;
  if not found then
    raise exception 'Diese Beitragsart gibt es nicht.' using errcode = 'no_data_found';
  end if;

  select count(*)::integer into v_anzahl
  from public.member_fees where fee_type_id = p_id and year = v_jahr;

  return v_anzahl;
end; $function$;

CREATE OR REPLACE FUNCTION public.set_login_disabled(p_member_id uuid, p_disabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Zugänge verwalten dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_disabled and p_member_id = private.current_member_id() then
    raise exception 'Du kannst dich nicht selbst aussperren.'
      using errcode = 'check_violation';
  end if;

  update public.members
     set login_disabled_at = case when p_disabled then now() else null end
   where id = p_member_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_member_attribute_options(p_type_id uuid, p_options jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_eintrag jsonb;
  v_pos     integer := 0;
  v_aktiv   integer;
  v_werte   text[] := '{}';
begin
  if not private.is_admin() then
    raise exception 'Merkmale pflegen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.member_attribute_types where id = p_type_id) then
    raise exception 'Dieses Merkmal gibt es nicht.' using errcode = 'no_data_found';
  end if;

  for v_eintrag in select * from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
    v_pos := v_pos + 1;

    if length(btrim(coalesce(v_eintrag ->> 'value', ''))) = 0 then
      raise exception 'Der %. Eintrag hat keinen Wert.', v_pos
        using errcode = 'invalid_parameter_value';
    end if;

    insert into public.member_attribute_options (attribute_type_id, value, label, sort_order, active)
    values (p_type_id, btrim(v_eintrag ->> 'value'),
            coalesce(nullif(btrim(coalesce(v_eintrag ->> 'label', '')), ''),
                     btrim(v_eintrag ->> 'value')),
            v_pos, true)
    on conflict (attribute_type_id, value) do update
      set label = excluded.label, sort_order = excluded.sort_order, active = true;

    v_werte := v_werte || btrim(v_eintrag ->> 'value');
  end loop;

  -- Was nicht mehr in der Liste steht: loeschen, wenn ungenutzt, sonst
  -- stilllegen.
  delete from public.member_attribute_options o
   where o.attribute_type_id = p_type_id
     and not (o.value = any (v_werte))
     and not exists (select 1 from public.member_attribute_values v where v.option_id = o.id);

  update public.member_attribute_options o
     set active = false
   where o.attribute_type_id = p_type_id
     and not (o.value = any (v_werte));

  select count(*)::integer into v_aktiv
  from public.member_attribute_options
  where attribute_type_id = p_type_id and active;

  return v_aktiv;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_member_attribute(p_member_id uuid, p_type_code text, p_option_value text DEFAULT NULL::text, p_text_value text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_typ    public.member_attribute_types;
  v_option uuid;
  v_text   text;
begin
  select * into v_typ from public.member_attribute_types where code = p_type_code;
  if not found then
    raise exception 'Dieses Merkmal gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if not v_typ.active then
    raise exception 'Das Merkmal "%" ist stillgelegt.', v_typ.name
      using errcode = 'check_violation';
  end if;

  if not private.darf_merkmal_setzen(p_member_id, v_typ) then
    raise exception 'Dieses Merkmal kann nur ein Administrator setzen.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if v_typ.value_kind = 'boolean' then
    -- Die Zeile selbst ist die Aussage.
    v_text := 'ja';

  elsif v_typ.value_kind = 'list' then
    select o.id into v_option
    from public.member_attribute_options o
    where o.attribute_type_id = v_typ.id
      and o.value = btrim(coalesce(p_option_value, ''))
      and o.active;

    if v_option is null then
      raise exception '"%" ist kein gültiger Wert für %.',
        coalesce(p_option_value, ''), v_typ.name
        using errcode = 'invalid_parameter_value';
    end if;

  else
    v_text := nullif(btrim(coalesce(p_text_value, '')), '');
    if v_text is null then
      raise exception 'Für % fehlt der Wert.', v_typ.name
        using errcode = 'invalid_parameter_value';
    end if;

    -- Datum und Zahl vorab pruefen, damit die Meldung das Merkmal nennt und
    -- nicht der Typwandler zuschlaegt.
    begin
      if v_typ.value_kind = 'date'   then perform v_text::date; end if;
      if v_typ.value_kind = 'number' then perform v_text::numeric; end if;
    exception when others then
      raise exception '"%" passt nicht zu %.', v_text, v_typ.name
        using errcode = 'invalid_parameter_value';
    end;
  end if;

  -- Ohne multiple ersetzt der neue Wert den alten.
  if not v_typ.multiple then
    delete from public.member_attribute_values
    where member_id = p_member_id and attribute_type_id = v_typ.id;
  end if;

  insert into public.member_attribute_values
    (member_id, attribute_type_id, option_id, text_value, set_by)
  values (p_member_id, v_typ.id, v_option, v_text, private.current_member_id())
  on conflict do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_member_fee(p_member_id uuid, p_fee_type_id uuid, p_year integer, p_override_amount_cents integer DEFAULT NULL::integer, p_note text DEFAULT NULL::text)
 RETURNS TABLE(already_charged boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_admin() then
    raise exception 'Beitragsarten zuordnen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.fee_types where id = p_fee_type_id and active) then
    raise exception 'Diese Beitragsart gibt es nicht oder sie ist stillgelegt.'
      using errcode = 'no_data_found';
  end if;

  insert into public.member_fees (member_id, fee_type_id, year, override_amount_cents, note)
  values (p_member_id, p_fee_type_id, p_year,
          p_override_amount_cents, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (member_id, fee_type_id, year) do update
    set override_amount_cents = excluded.override_amount_cents,
        note = excluded.note;

  -- Kein Fehler, sondern eine Auskunft: die Oberflaeche soll darauf hinweisen,
  -- dass eine bereits erzeugte Forderung sich dadurch nicht mehr aendert.
  return query
    select exists (select 1 from public.charges
                    where member_id = p_member_id and kind = 'fee'
                      and period_label = p_year::text and status <> 'waived');
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_member_role(p_member_id uuid, p_role app_role, p_granted boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_voll   boolean := p_role in ('admin', 'board');
begin
  if not private.is_admin() then
    raise exception 'Rollen vergeben dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_role = 'member' and not p_granted then
    raise exception 'Die Rolle Mitglied kann nicht entzogen werden.'
      using errcode = 'invalid_parameter_value';
  end if;

  if not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if p_granted then
    if v_voll
       and not exists (select 1 from public.members
                        where id = p_member_id and auth_user_id is not null) then
      raise exception 'Nur Mitglieder mit Login können Administrator oder Vorstand werden.'
        using errcode = 'invalid_parameter_value';
    end if;

    insert into public.member_roles (member_id, role, granted_by)
    values (p_member_id, p_role, private.current_member_id())
    on conflict do nothing;
  else
    -- Es muss immer jemand mit vollen Rechten uebrig bleiben, der sie auch
    -- ausueben kann (S18a). Wer Admin und Vorstand zugleich ist, darf eine
    -- der beiden Rollen abgeben.
    if v_voll and private.aktive_admins_ohne(p_member_id, p_role) = 0 then
      raise exception 'Die letzte Person mit vollen Rechten kann die Rolle nicht abgeben. '
                      'Bitte zuerst eine weitere Person zum Administrator oder Vorstand machen.'
        using errcode = 'check_violation';
    end if;

    delete from public.member_roles where member_id = p_member_id and role = p_role;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_member_team(p_member_id uuid, p_team_id uuid DEFAULT NULL::uuid, p_is_captain boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status public.member_status;
begin
  if not private.is_admin() then
    raise exception 'Mannschaften zuordnen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from public.members where id = p_member_id;
  if not found then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if p_team_id is null then
    update public.members
       set team_id = null, is_team_captain = false
     where id = p_member_id;
    return;
  end if;

  if v_status <> 'active' then
    raise exception 'Nur aktive Mitglieder spielen in einer Mannschaft.'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.teams where id = p_team_id and active) then
    raise exception 'Diese Mannschaft gibt es nicht oder sie ist stillgelegt.'
      using errcode = 'no_data_found';
  end if;

  update public.members
     set team_id = p_team_id,
         is_team_captain = coalesce(p_is_captain, false)
   where id = p_member_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_setting(p_key text, p_value text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_typ text; v_wert jsonb;
begin
  if not private.is_admin() then
    raise exception 'Einstellungen ändern dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select value_type into v_typ from public.settings where key = p_key;
  if not found then
    raise exception 'Unbekannte Einstellung: %', p_key using errcode = 'no_data_found';
  end if;

  begin
    v_wert := case v_typ
      when 'integer' then to_jsonb(p_value::integer)
      when 'boolean' then to_jsonb(p_value::boolean)
      when 'time'    then to_jsonb(to_char(p_value::time, 'HH24:MI'))
      when 'date'    then to_jsonb(to_char(p_value::date, 'YYYY-MM-DD'))
      else to_jsonb(p_value)
    end;
  exception when others then
    raise exception '"%" ist kein gültiger Wert für %.', p_value, p_key
      using errcode = 'invalid_parameter_value';
  end;

  if v_typ = 'integer' and (v_wert #>> '{}')::integer < 0 then
    raise exception 'Negative Werte sind hier nicht sinnvoll.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.settings
     set value = v_wert, updated_at = now(), updated_by = private.current_member_id()
   where key = p_key;
end; $function$;

CREATE OR REPLACE FUNCTION public.settle_charge_manually(p_charge_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status public.charge_status;
begin
  if not private.is_admin() then
    raise exception 'Forderungen abhaken dürfen nur Administratoren.'
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
    'Als bezahlt vermerken geht erst, wenn die Lastschrift zurückkommt.');

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
end; $function$;

CREATE OR REPLACE FUNCTION public.submit_membership_application(p_data jsonb, p_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- Erziehungsberechtigte, Notfallkontakt und Einwilligungen erhebt jetzt
  -- das Onboarding. Die Spalten bleiben fuer aeltere Antraege stehen.
  v_erlaubt constant text[] := array[
    'first_name', 'last_name', 'title', 'gender', 'salutation', 'birthday',
    'email', 'phone', 'mobile', 'street', 'postcode', 'city',
    'desired_fee_type_id', 'message'
  ];
  v_d       jsonb := '{}'::jsonb;
  v_schl    text;
  -- p_ip bleibt in der Signatur, damit aeltere Aufrufer weiter
  -- funktionieren, wird aber nicht mehr gelesen (S6).
  v_ip      text := private.hash_ip(private.anfrage_ip());
  v_email   extensions.citext;
  v_anzahl  integer;
  v_gender  public.gender;
  v_fehlt   text[];
begin
  -- Unbekannte Schluessel werden still uebergangen, nicht abgewiesen: eine
  -- Fehlermeldung waere eine Auskunft ueber die Feldstruktur.
  for v_schl in select jsonb_object_keys(coalesce(p_data, '{}'::jsonb)) loop
    if v_schl = any (v_erlaubt) then
      v_d := v_d || jsonb_build_object(v_schl, p_data -> v_schl);
    end if;
  end loop;

  if length(btrim(coalesce(v_d ->> 'first_name', ''))) = 0
     or length(btrim(coalesce(v_d ->> 'last_name', ''))) = 0 then
    raise exception 'Bitte Vor- und Nachnamen angeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Dieselben Grenzen wie die Constraints (S21), hier mit lesbarer Meldung.
  if length(btrim(v_d ->> 'first_name')) > 100 or length(btrim(v_d ->> 'last_name')) > 100 then
    raise exception 'Vor- und Nachname dürfen höchstens 100 Zeichen lang sein.'
      using errcode = 'invalid_parameter_value';
  end if;
  if length(btrim(coalesce(v_d ->> 'message', ''))) > 2000 then
    raise exception 'Die Nachricht darf höchstens 2000 Zeichen lang sein.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_email := lower(btrim(coalesce(v_d ->> 'email', '')))::extensions.citext;
  if v_email is null or position('@' in v_email::text) = 0 then
    raise exception 'Bitte eine gültige E-Mail-Adresse angeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  if (v_d ->> 'birthday') is null then
    raise exception 'Bitte das Geburtsdatum angeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  if coalesce(v_d ->> 'gender', '') in ('female', 'male', 'diverse') then
    v_gender := (v_d ->> 'gender')::public.gender;
  end if;

  v_fehlt := private.fehlende_stammdaten(
    (v_d ->> 'birthday')::date, v_gender,
    v_d ->> 'street', v_d ->> 'postcode', v_d ->> 'city',
    v_d ->> 'phone', v_d ->> 'mobile');
  if cardinality(v_fehlt) > 0 then
    raise exception 'Bitte noch angeben: %.', array_to_string(v_fehlt, ', ')
      using errcode = 'invalid_parameter_value';
  end if;

  if (v_d ->> 'birthday')::date > private.heute() then
    raise exception 'Das Geburtsdatum liegt in der Zukunft.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Sperre 1: dieselbe Herkunft, zehnmal in einer Stunde.
  --
  -- Die Zahl war zuerst drei und damit zu streng: hinter einem Anschluss
  -- sitzt oft mehr als eine Person. Beim Schnuppertag melden sich mehrere aus
  -- dem WLAN des Clubheims an, eine Familie fuellt vier Antraege nacheinander
  -- aus - alles voellig gewoehnliche Faelle, die an einer Sperre von drei
  -- gescheitert waeren. Zehn je Stunde bremst Massenzusendungen immer noch
  -- wirksam und trifft niemanden, der wirklich beitreten will.
  if v_ip is not null then
    select count(*)::integer into v_anzahl
    from public.membership_applications
    where ip_hash = v_ip and submitted_at > now() - interval '1 hour';

    if v_anzahl >= 10 then
      raise exception 'Es sind gerade zu viele Anträge eingegangen. Bitte später erneut versuchen.'
        using errcode = 'too_many_rows';
    end if;
  end if;

  -- Sperre 2: zwanzig Antraege in einer Stunde ueberhaupt. Der Verein hat
  -- dreihundert Mitglieder; das ist mit Sicherheit kein echter Andrang.
  select count(*)::integer into v_anzahl
  from public.membership_applications
  where submitted_at > now() - interval '1 hour';

  if v_anzahl >= 20 then
    raise exception 'Es sind gerade zu viele Anträge eingegangen. Bitte später erneut versuchen.'
      using errcode = 'too_many_rows';
  end if;

  -- Sperre 3: schon ein offener Antrag zu dieser Adresse. Das ist ein stiller
  -- Ausstieg mit Erfolgsmeldung - wer hier eine Fehlermeldung bekaeme, wuesste,
  -- dass die Adresse bereits eingereicht hat.
  if exists (select 1 from public.membership_applications
              where email = v_email and status = 'new') then
    return;
  end if;

  insert into public.membership_applications (
    first_name, last_name, title, gender, salutation, birthday,
    email, phone, mobile, street, postcode, city,
    desired_fee_type_id, message, possible_duplicate, ip_hash, user_agent
  ) values (
    btrim(v_d ->> 'first_name'),
    btrim(v_d ->> 'last_name'),
    nullif(btrim(coalesce(v_d ->> 'title', '')), ''),
    v_gender,
    coalesce((nullif(v_d ->> 'salutation', ''))::public.salutation,
             private.anrede_aus_geschlecht(v_gender)),
    (v_d ->> 'birthday')::date,
    v_email,
    nullif(btrim(coalesce(v_d ->> 'phone', '')), ''),
    nullif(btrim(coalesce(v_d ->> 'mobile', '')), ''),
    btrim(v_d ->> 'street'),
    btrim(v_d ->> 'postcode'),
    btrim(v_d ->> 'city'),
    (nullif(v_d ->> 'desired_fee_type_id', ''))::uuid,
    nullif(btrim(coalesce(v_d ->> 'message', '')), ''),
    -- Nur ein Vermerk fuer den Vorstand. Nach aussen aendert er nichts.
    exists (select 1 from public.members m where m.email = v_email),
    v_ip,
    left(coalesce(p_user_agent, ''), 300)
  );

  -- Den Vorstand benachrichtigen. Geht aus anon heraus nur, weil diese
  -- Funktion security definer ist.
  insert into public.notifications (member_id, kind, title, body)
  select distinct r.member_id, 'application_new', 'Neuer Mitgliedsantrag',
         btrim(v_d ->> 'first_name') || ' ' || btrim(v_d ->> 'last_name')
         || ' möchte dem Verein beitreten.'
  from public.member_roles r
  where r.role in ('admin', 'board');
end;
$function$;

CREATE OR REPLACE FUNCTION public.team_overview()
 RETURNS TABLE(id uuid, name text, active boolean, sort_order integer, member_count integer, captain_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_admin() then
    raise exception 'Die Mannschaftsübersicht sehen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select t.id, t.name, t.active, t.sort_order,
         (select count(*)::integer from public.members m where m.team_id = t.id),
         (select c.first_name || ' ' || c.last_name
            from public.members c
           where c.team_id = t.id and c.is_team_captain
           limit 1)
    from public.teams t
   order by t.active desc, t.sort_order, lower(t.name);
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_blocking(p_booking_id uuid, p_court_ids uuid[], p_von timestamp with time zone, p_bis timestamp with time zone, p_type_code text, p_title text, p_force boolean DEFAULT false)
 RETURNS TABLE(created_count integer, displaced_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    raise exception 'Sperrungen können nur Platzwart, Vorstand und Administratoren bearbeiten.'
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
    raise exception 'Serientermine änderst du über die Serie.'
      using errcode = 'invalid_parameter_value';
  end if;
  if v_sperre.status <> 'active' then
    raise exception 'Diese Sperrung ist schon aufgehoben.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_court_ids is null or array_length(p_court_ids, 1) is null then
    raise exception 'Bitte mindestens einen Platz auswählen.'
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
      '% Buchungen liegen in diesem Zeitraum. Bestätige das Verdrängen.',
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
           format('Die Buchung am %s auf %s fällt aus: %s.',
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
end; $function$;

CREATE OR REPLACE FUNCTION public.update_booking_players(p_booking_id uuid, p_member_ids uuid[] DEFAULT '{}'::uuid[], p_guest_names text[] DEFAULT '{}'::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := private.current_member_id();
  v_booking public.bookings%rowtype;
  v_type public.booking_types%rowtype;
  v_max_open integer := public.setting_int('booking.max_open_bookings');
  v_players integer; v_player uuid; v_guest text; v_blocker text;
  v_ist_admin boolean := private.darf_plaetze();
  v_vorher uuid[];
  v_label text;
  v_gaeste integer := coalesce(array_length(p_guest_names, 1), 0);
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;

  -- Gesperrt wie in join_booking: die Besetzung wird gleich gelesen,
  -- geloescht und neu geschrieben, dazwischen darf niemand beitreten (B6).
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_booking.status <> 'active' then
    raise exception 'Diese Buchung ist storniert.' using errcode = 'check_violation';
  end if;
  if v_booking.member_id is distinct from v_me and not v_ist_admin then
    raise exception 'Du kannst nur deine eigenen Buchungen ändern.'
      using errcode = 'insufficient_privilege';
  end if;
  if lower(v_booking.slot) <= now() and not v_ist_admin then
    raise exception 'Die Spielzeit hat bereits begonnen.' using errcode = 'check_violation';
  end if;

  select * into v_type from public.booking_types where id = v_booking.booking_type_id;

  v_players := 1 + coalesce(array_length(p_member_ids, 1), 0) + v_gaeste;

  -- Solange Mitspieler gesucht werden, darf die Buchung unterbesetzt sein.
  if not v_booking.partner_wanted then
    if v_type.requires_partner and v_players < 2 then
      raise exception 'Für "%" musst du mindestens einen Mitspieler angeben.', v_type.name
        using errcode = 'invalid_parameter_value';
    end if;
    -- Dieselbe Untergrenze wie beim Anlegen. Ohne sie waere die Regel nur eine
    -- Huerde beim ersten Speichern und danach beliebig zu umgehen.
    if v_players < v_type.min_players then
      raise exception '"%" braucht mindestens % Spieler.', v_type.name, v_type.min_players
        using errcode = 'invalid_parameter_value';
    end if;
  end if;
  if v_players > v_type.max_players then
    raise exception '"%" erlaubt höchstens % Spieler.', v_type.name, v_type.max_players
      using errcode = 'invalid_parameter_value';
  end if;
  if v_booking.member_id = any (p_member_ids) then
    raise exception 'Der Bucher ist schon dabei und muss nicht als Mitspieler eingetragen werden.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Kontingent nur fuer neu hinzukommende Mitspieler pruefen: wer schon
  -- eingetragen war, zaehlt diese Buchung bereits mit.
  if v_max_open > 0 and v_type.counts_towards_quota then
    foreach v_player in array coalesce(p_member_ids, '{}') loop
      if not exists (select 1 from public.booking_players bp
                      where bp.booking_id = p_booking_id and bp.member_id = v_player)
         and private.open_booking_count(v_player) >= v_max_open then
        select m.first_name || ' ' || m.last_name into v_blocker
        from public.members m where m.id = v_player;
        raise exception '% hat bereits % offene Buchungen und kann nicht mitspielen.',
          coalesce(v_blocker, 'Ein Mitspieler'), v_max_open using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  -- Nur wer neu dazukommt, wird auf Doppelbelegung geprueft. Bucher und
  -- bisherige Mitspieler stehen schon in dieser Buchung; sie erneut zu pruefen,
  -- wuerde nur Altbestand aus der Zeit vor dieser Regel zur Huerde machen.
  perform private.pruefe_spielt_schon(
    array(select neu from unnest(coalesce(p_member_ids, '{}')) with ordinality as t(neu, i)
           where not exists (select 1 from public.booking_players bp
                              where bp.booking_id = p_booking_id and bp.member_id = neu)
           order by i),
    v_booking.slot, p_booking_id);

  -- Die alte Besetzung merken, bevor sie geloescht wird: nur so laesst sich
  -- danach sagen, wer neu dazukam und wer gehen musste. Die Funktion tauscht
  -- vollstaendig aus, kennt also von sich aus keinen Unterschied.
  select coalesce(array_agg(bp.member_id), '{}')
    into v_vorher
  from public.booking_players bp
  where bp.booking_id = p_booking_id and bp.member_id is not null;

  delete from public.booking_players where booking_id = p_booking_id;

  foreach v_player in array coalesce(p_member_ids, '{}') loop
    insert into public.booking_players (booking_id, member_id) values (p_booking_id, v_player);
  end loop;
  foreach v_guest in array coalesce(p_guest_names, '{}') loop
    if length(btrim(v_guest)) = 0 then
      raise exception 'Gastname darf nicht leer sein.' using errcode = 'invalid_parameter_value';
    end if;
    insert into public.booking_players (booking_id, guest_name) values (p_booking_id, btrim(v_guest));
  end loop;

  -- Die Gebuehr traegt immer der Bucher, auch wenn ein Admin die Besetzung
  -- aendert: er hat den Gast mitgebracht, nicht der Verwalter.
  perform private.sync_guest_charges(p_booking_id, v_booking.member_id, v_gaeste);

  -- Voll ist voll: die Buchung verschwindet aus den offenen Spielen.
  if v_booking.partner_wanted and v_players >= v_type.max_players then
    update public.bookings set partner_wanted = false where id = p_booking_id;
  end if;

  v_label := private.booking_label(p_booking_id);

  insert into public.notifications (member_id, kind, title, body)
  select neu, 'booking_added', 'Du bist als Mitspieler eingetragen',
         format('%s hat dich für %s eingetragen.', private.member_label(v_me), v_label)
  from unnest(coalesce(p_member_ids, '{}')) as neu
  where not (neu = any (v_vorher)) and neu <> v_me;

  insert into public.notifications (member_id, kind, title, body)
  select alt, 'booking_removed', 'Du bist nicht mehr dabei',
         format('%s hat dich von %s ausgetragen.', private.member_label(v_me), v_label)
  from unnest(v_vorher) as alt
  where not (alt = any (coalesce(p_member_ids, '{}'))) and alt <> v_me;
end; $function$;

CREATE OR REPLACE FUNCTION public.update_member(p_member_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_erlaubt constant text[] := array[
    'first_name', 'last_name', 'title', 'gender', 'salutation', 'birthday',
    'email', 'phone', 'mobile', 'street', 'postcode', 'city', 'country_code',
    'notes', 'status', 'is_trainer', 'nationality_code', 'tennis_lk',
    'nuliga_id', 'playing_right', 'playing_right_since',
    'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation'
  ];
  v_feld text;
  v_alt  public.members;
  v_neu  jsonb;
begin
  if not private.is_admin() then
    raise exception 'Mitgliedsdaten ändern dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_alt from public.members where id = p_member_id;
  if not found then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  for v_feld in select jsonb_object_keys(p_patch) loop
    if not (v_feld = any (v_erlaubt)) then
      raise exception 'Unbekanntes Feld: %.', v_feld
        using errcode = 'invalid_parameter_value';
    end if;
  end loop;

  -- Leere Zeichenketten sind in der Oberflaeche "nicht ausgefuellt" und
  -- gehoeren in der Datenbank als null abgelegt - sonst waere eine leere
  -- E-Mail ein Wert, der mit dem Unique-Index kollidiert.
  select jsonb_object_agg(k, case when jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = ''
                                  then 'null'::jsonb else v end)
    into v_neu
  from jsonb_each(p_patch) as e(k, v);

  -- Archivieren raeumt auf: Buchungen, Mandate, Einzuege, Rollen, Zugang.
  -- Ein blosser Statuswechsel liesse all das liegen (B23). Deshalb hier nur
  -- aktiv und inaktiv, und ein Archivierter bleibt archiviert.
  if v_neu ->> 'status' is not null then
    if v_neu ->> 'status' not in ('active', 'inactive') then
      raise exception 'Archivieren geht nur über "Archivieren", nicht über den Status.'
        using errcode = 'invalid_parameter_value';
    end if;
    if v_alt.status = 'archived' and v_neu ->> 'status' <> 'archived' then
      raise exception 'Ein archiviertes Mitglied lässt sich nicht über den Status zurückholen.'
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  -- Eine vorhandene Adresse darf sich aendern, aber nicht verschwinden. Der
  -- Altbestand ohne Adresse darf ohne bleiben, bis jemand eine eintraegt.
  if v_neu ? 'email' and v_neu ->> 'email' is null and v_alt.email is not null then
    raise exception 'Die E-Mail-Adresse lässt sich nicht entfernen. Jedes Mitglied braucht sie für seinen Login.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.members m set
    first_name       = coalesce(v_neu ->> 'first_name', m.first_name),
    last_name        = coalesce(v_neu ->> 'last_name', m.last_name),
    title            = case when v_neu ? 'title' then v_neu ->> 'title' else m.title end,
    gender           = case when v_neu ? 'gender' then (v_neu ->> 'gender')::public.gender else m.gender end,
    salutation       = case when v_neu ? 'salutation' then (v_neu ->> 'salutation')::public.salutation else m.salutation end,
    birthday         = case when v_neu ? 'birthday' then (v_neu ->> 'birthday')::date else m.birthday end,
    email            = case when v_neu ? 'email' then (lower(btrim(v_neu ->> 'email')))::extensions.citext else m.email end,
    phone            = case when v_neu ? 'phone' then v_neu ->> 'phone' else m.phone end,
    mobile           = case when v_neu ? 'mobile' then v_neu ->> 'mobile' else m.mobile end,
    street           = case when v_neu ? 'street' then v_neu ->> 'street' else m.street end,
    postcode         = case when v_neu ? 'postcode' then v_neu ->> 'postcode' else m.postcode end,
    city             = case when v_neu ? 'city' then v_neu ->> 'city' else m.city end,
    country_code     = case when v_neu ? 'country_code' then v_neu ->> 'country_code' else m.country_code end,
    notes            = case when v_neu ? 'notes' then v_neu ->> 'notes' else m.notes end,
    status           = coalesce((v_neu ->> 'status')::public.member_status, m.status),
    is_trainer       = coalesce((v_neu ->> 'is_trainer')::boolean, m.is_trainer),
    nationality_code = case when v_neu ? 'nationality_code' then upper(v_neu ->> 'nationality_code') else m.nationality_code end,
    tennis_lk        = case when v_neu ? 'tennis_lk' then v_neu ->> 'tennis_lk' else m.tennis_lk end,
    nuliga_id        = case when v_neu ? 'nuliga_id' then v_neu ->> 'nuliga_id' else m.nuliga_id end,
    playing_right    = coalesce((v_neu ->> 'playing_right')::public.playing_right, m.playing_right),
    playing_right_since = case when v_neu ? 'playing_right_since' then (v_neu ->> 'playing_right_since')::date else m.playing_right_since end,
    emergency_contact_name     = case when v_neu ? 'emergency_contact_name' then v_neu ->> 'emergency_contact_name' else m.emergency_contact_name end,
    emergency_contact_phone    = case when v_neu ? 'emergency_contact_phone' then v_neu ->> 'emergency_contact_phone' else m.emergency_contact_phone end,
    emergency_contact_relation = case when v_neu ? 'emergency_contact_relation' then v_neu ->> 'emergency_contact_relation' else m.emergency_contact_relation end
  where m.id = p_member_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_membership(p_membership_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_erlaubt constant text[] := array[
    'number', 'started_on', 'notes', 'cancellation_date', 'cancellation_reason'];
  v_feld text;
begin
  if not private.is_admin() then
    raise exception 'Mitgliedschaften ändern dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.memberships where id = p_membership_id) then
    raise exception 'Diese Mitgliedschaft gibt es nicht.' using errcode = 'no_data_found';
  end if;

  for v_feld in select jsonb_object_keys(p_patch) loop
    if not (v_feld = any (v_erlaubt)) then
      raise exception 'Unbekanntes Feld: %.', v_feld
        using errcode = 'invalid_parameter_value';
    end if;
  end loop;

  update public.memberships s set
    number              = coalesce(nullif(btrim(p_patch ->> 'number'), ''), s.number),
    started_on          = coalesce((p_patch ->> 'started_on')::date, s.started_on),
    notes               = case when p_patch ? 'notes'
                               then nullif(btrim(p_patch ->> 'notes'), '') else s.notes end,
    cancellation_date   = case when p_patch ? 'cancellation_date'
                               then (nullif(btrim(p_patch ->> 'cancellation_date'), ''))::date
                               else s.cancellation_date end,
    cancellation_reason = case when p_patch ? 'cancellation_reason'
                               then nullif(btrim(p_patch ->> 'cancellation_reason'), '')
                               else s.cancellation_reason end
  where s.id = p_membership_id;
end;
$function$;

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
end; $function$;

CREATE OR REPLACE FUNCTION public.upsert_booking_type(p_code text, p_name text, p_applies_to booking_kind, p_duration_minutes integer, p_min_players integer, p_max_players integer, p_requires_partner boolean, p_counts_towards_quota boolean, p_active boolean DEFAULT true, p_sort_order integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_pos integer;
begin
  if not private.is_admin() then
    raise exception 'Buchungsarten können nur Administratoren pflegen.'
      using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_code, '')) = '' or btrim(coalesce(p_name, '')) = '' then
    raise exception 'Code und Name sind Pflicht.' using errcode = 'invalid_parameter_value';
  end if;
  if p_max_players < p_min_players then
    raise exception 'Die Obergrenze darf nicht unter der Untergrenze liegen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_duration_minutes < 15 or p_duration_minutes > 1440 then
    raise exception 'Die Dauer muss zwischen 15 und 1440 Minuten liegen.'
      using errcode = 'invalid_parameter_value';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_pos from public.booking_types;

  insert into public.booking_types
    (code, name, applies_to, duration_minutes, min_players, max_players,
     requires_partner, counts_towards_quota, active, sort_order)
  values
    (btrim(p_code), btrim(p_name), p_applies_to, p_duration_minutes,
     p_min_players, p_max_players, p_requires_partner, p_counts_towards_quota,
     coalesce(p_active, true), coalesce(p_sort_order, v_pos))
  on conflict (code) do update set
    name = excluded.name,
    applies_to = excluded.applies_to,
    duration_minutes = excluded.duration_minutes,
    min_players = excluded.min_players,
    max_players = excluded.max_players,
    requires_partner = excluded.requires_partner,
    counts_towards_quota = excluded.counts_towards_quota,
    active = excluded.active,
    sort_order = coalesce(p_sort_order, public.booking_types.sort_order)
  returning id into v_id;

  return v_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.upsert_court(p_id uuid, p_name text, p_short_name text, p_subline text DEFAULT NULL::text, p_position integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_pos integer;
begin
  if not private.is_admin() then
    raise exception 'Plätze können nur Administratoren pflegen.'
      using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_name, '')) = '' or btrim(coalesce(p_short_name, '')) = '' then
    raise exception 'Name und Kurzname sind Pflicht.' using errcode = 'invalid_parameter_value';
  end if;

  if p_id is null then
    -- Neue Plaetze landen hinten, damit die bestehende Reihenfolge bleibt.
    select coalesce(max(position), 0) + 1 into v_pos from public.courts;
    insert into public.courts (name, short_name, subline, position)
    values (btrim(p_name), btrim(p_short_name),
            nullif(btrim(coalesce(p_subline, '')), ''), coalesce(p_position, v_pos))
    returning id into v_id;
  else
    update public.courts
       set name = btrim(p_name),
           short_name = btrim(p_short_name),
           subline = nullif(btrim(coalesce(p_subline, '')), ''),
           position = coalesce(p_position, position)
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Diesen Platz gibt es nicht.' using errcode = 'no_data_found';
    end if;
  end if;

  return v_id;
exception when unique_violation then
  raise exception 'Einen Platz mit diesem Namen gibt es schon.'
    using errcode = 'unique_violation';
end; $function$;

CREATE OR REPLACE FUNCTION public.upsert_drink_item(p_id uuid, p_name text, p_description text DEFAULT NULL::text, p_category drink_category DEFAULT 'drink'::drink_category, p_price_cents integer DEFAULT NULL::integer, p_sort_order integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_pos integer;
begin
  if not private.is_admin() then
    raise exception 'Getränke können nur Administratoren pflegen.'
      using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Der Name ist Pflicht.' using errcode = 'invalid_parameter_value';
  end if;
  if p_id is null and p_price_cents is null then
    raise exception 'Ein neues Getränk braucht einen Preis, sonst taucht es in der Karte nicht auf.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_id is null then
    -- Neue Getraenke landen hinten, damit die bestehende Karte bleibt.
    select coalesce(max(sort_order), 0) + 1 into v_pos from public.drink_items;
    insert into public.drink_items (name, description, category, sort_order)
    values (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''),
            p_category, coalesce(p_sort_order, v_pos))
    returning id into v_id;
  else
    update public.drink_items
       set name = btrim(p_name),
           description = nullif(btrim(coalesce(p_description, '')), ''),
           category = p_category,
           sort_order = coalesce(p_sort_order, sort_order)
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Dieses Getränk gibt es nicht.' using errcode = 'no_data_found';
    end if;
  end if;

  if p_price_cents is not null then
    perform public.set_drink_price(v_id, p_price_cents, null);
  end if;

  return v_id;
exception when unique_violation then
  raise exception 'Ein Getränk mit diesem Namen gibt es schon.'
    using errcode = 'unique_violation';
end; $function$;

CREATE OR REPLACE FUNCTION public.upsert_fee_type(p_id uuid, p_code text, p_name text, p_description text DEFAULT NULL::text, p_sort_order integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_pos integer;
begin
  if not private.is_admin() then
    raise exception 'Beitragsarten pflegen dürfen nur Administratoren.'
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
end; $function$;

CREATE OR REPLACE FUNCTION public.upsert_member_attribute_type(p_code text, p_name text, p_description text, p_value_kind attribute_kind DEFAULT 'list'::attribute_kind, p_multiple boolean DEFAULT false, p_self_editable boolean DEFAULT false, p_in_application boolean DEFAULT false, p_active boolean DEFAULT true, p_sort_order integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id       uuid;
  v_bisher   public.member_attribute_types;
  v_benutzt  integer;
begin
  if not private.is_admin() then
    raise exception 'Merkmale pflegen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(p_code), '') !~ '^[a-z0-9_]+$' then
    raise exception 'Der Schlüssel darf nur Kleinbuchstaben, Ziffern und Unterstriche enthalten.'
      using errcode = 'invalid_parameter_value';
  end if;

  if length(btrim(coalesce(p_description, ''))) = 0 then
    raise exception 'Bitte beschreiben, wofür dieses Merkmal gebraucht wird.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_bisher from public.member_attribute_types where code = btrim(p_code);

  -- Die Art nachtraeglich zu wechseln wuerde die vorhandenen Werte
  -- bedeutungslos machen: aus einer Auswahl wird kein Datum.
  if found and v_bisher.value_kind <> p_value_kind then
    select count(*)::integer into v_benutzt
    from public.member_attribute_values where attribute_type_id = v_bisher.id;

    if v_benutzt > 0 then
      raise exception 'Die Art dieses Merkmals kann nicht mehr geändert werden, solange % Mitglieder einen Wert dazu haben.',
        v_benutzt using errcode = 'check_violation';
    end if;
  end if;

  insert into public.member_attribute_types
    (code, name, description, value_kind, multiple, self_editable, in_application, active, sort_order)
  values
    (btrim(p_code), btrim(p_name), btrim(p_description), p_value_kind,
     p_multiple, p_self_editable, p_in_application, p_active, p_sort_order)
  on conflict (code) do update set
    name = excluded.name,
    description = excluded.description,
    value_kind = excluded.value_kind,
    multiple = excluded.multiple,
    self_editable = excluded.self_editable,
    in_application = excluded.in_application,
    active = excluded.active,
    sort_order = excluded.sort_order
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_team(p_name text, p_id uuid DEFAULT NULL::uuid, p_active boolean DEFAULT true, p_sort_order integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id   uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not private.is_admin() then
    raise exception 'Mannschaften pflegen dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_name = '' then
    raise exception 'Die Mannschaft braucht einen Namen.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_id is null then
    insert into public.teams (name, active, sort_order)
    values (v_name, coalesce(p_active, true), coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    update public.teams
       set name = v_name,
           active = coalesce(p_active, active),
           sort_order = coalesce(p_sort_order, sort_order)
     where id = p_id
     returning id into v_id;

    if v_id is null then
      raise exception 'Diese Mannschaft gibt es nicht.' using errcode = 'no_data_found';
    end if;
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_work_duty_rule(p_fee_type_id uuid, p_year integer, p_required_hours numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_admin() then
    raise exception 'Arbeitsdienst-Regeln pflegen dürfen nur Administratoren.'
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
      'Für % ist der Arbeitsdienst bereits abgerechnet. Die Regeln lassen sich nicht mehr ändern.',
      p_year using errcode = 'invalid_parameter_value';
  end if;

  insert into public.work_duty_rules (fee_type_id, year, required_hours)
  values (p_fee_type_id, p_year, p_required_hours)
  on conflict (fee_type_id, year) do update
    set required_hours = excluded.required_hours;
end; $function$;

CREATE OR REPLACE FUNCTION public.void_drink_purchase(p_purchase_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := private.current_member_id();
  v_purchase public.drink_purchases%rowtype;
  v_window integer := public.setting_int('drinks.void_window_minutes');
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_purchase from public.drink_purchases where id = p_purchase_id;
  if not found then
    raise exception 'Diese Buchung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_purchase.voided_at is not null then return; end if;

  if private.is_admin() then
    null;
  elsif v_purchase.member_id = v_me then
    if v_purchase.created_at < now() - make_interval(mins => v_window) then
      raise exception
        'Eigene Buchungen können nur innerhalb von % Minuten zurückgenommen werden. Bitte beim Vorstand melden.',
        v_window using errcode = 'check_violation';
    end if;
  else
    raise exception 'Du kannst nur eigene Buchungen zurückgeben.' using errcode = 'insufficient_privilege';
  end if;

  update public.drink_purchases
     set voided_at = now(), voided_by = v_me, void_reason = p_reason
   where id = p_purchase_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.waive_charge(p_charge_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status public.charge_status;
begin
  if not private.is_admin() then
    raise exception 'Forderungen erlassen dürfen nur Administratoren.'
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
    'Erlassen geht erst, wenn die Lastschrift zurückkommt.');

  select status into v_status from public.charges where id = p_charge_id for update;
  if v_status = 'submitted' then
    raise exception
      'Diese Forderung steckt in einem eingereichten Lastschriftlauf und lässt sich nicht erlassen.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.charges
     set status = 'waived',
         description = description || ' [erlassen: ' || btrim(p_reason) || ']'
   where id = p_charge_id;
end; $function$;

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
end; $function$;
