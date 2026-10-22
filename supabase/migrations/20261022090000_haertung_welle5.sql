-- ===========================================================================
-- Haertung Welle 5: Datum, Erinnerung, Rechtstexte, Reaktivieren, Admins
-- (B15, B16, B17, S18a, S23, B26)
--
-- Abwaertskompatibel: alle Signaturen bleiben, neu sind nur
-- reactivate_member() und private.aktive_admins_ohne().
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- B15, B16: "heute" ist der Berliner Tag
--
-- current_date folgt der Zeitzone der Sitzung, und die ist bei Supabase UTC.
-- Zwischen Mitternacht und ein bzw. zwei Uhr nachts lag "heute" damit noch
-- auf gestern: ein neuer Getraenkepreis galt zu spaet, ein Mandat ohne Datum
-- trug den Vortag.
--
-- In Funktionsrumpfen (security definer, Eigentuemer postgres) steht
-- private.heute(). Standardwerte von Spalten und Parametern und
-- CHECK-Bedingungen laufen dagegen mit den Rechten des Aufrufers; dort steht
-- der Ausdruck selbst, damit private.heute() fuer authenticated und anon
-- gesperrt bleiben kann (S8).
-- ---------------------------------------------------------------------------

create or replace function private.current_drink_price(p_item_id uuid)
returns integer
language sql
stable security definer
set search_path to ''
as $function$
  select dp.price_cents
  from public.drink_prices dp
  where dp.drink_item_id = p_item_id
    and dp.valid_from <= private.heute()
  order by dp.valid_from desc
  limit 1;
$function$;

alter table public.legal_documents
  alter column valid_from set default ((now() at time zone 'Europe/Berlin')::date);

-- Ein Geburtstag darf nicht in der Zukunft liegen, gemessen am Berliner Tag.
-- Neu als "not valid" angelegt und danach geprueft, wie in Welle 4 (S21).
alter table public.members drop constraint members_birthday_past;
alter table public.members add constraint members_birthday_past
  check (birthday is null or birthday <= (now() at time zone 'Europe/Berlin')::date) not valid;
alter table public.members validate constraint members_birthday_past;

alter table public.membership_applications drop constraint membership_applications_birthday_past;
alter table public.membership_applications add constraint membership_applications_birthday_past
  check (birthday <= (now() at time zone 'Europe/Berlin')::date) not valid;
alter table public.membership_applications validate constraint membership_applications_birthday_past;

alter table public.membership_applications drop constraint membership_applications_birthday_plausibel;
alter table public.membership_applications add constraint membership_applications_birthday_plausibel
  check (birthday >= (now() at time zone 'Europe/Berlin')::date - interval '120 years') not valid;
alter table public.membership_applications validate constraint membership_applications_birthday_plausibel;

-- Die Funktionen unten sind unveraendert bis auf das Datum.
CREATE OR REPLACE FUNCTION private.next_mandate_reference(p_member_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_nummer text;
  v_basis  text;
  v_kandidat text;
  v_lauf   integer := 1;
begin
  select s.number into v_nummer
  from public.memberships s
  where s.member_id = p_member_id
  order by (s.ended_on is null) desc, s.started_on desc
  limit 1;

  v_basis := 'TCM-' || coalesce(v_nummer, substr(p_member_id::text, 1, 8))
             || '-' || to_char(private.heute(), 'YYYY');
  v_kandidat := v_basis;

  while exists (select 1 from public.sepa_mandates where reference = v_kandidat) loop
    v_lauf := v_lauf + 1;
    v_kandidat := v_basis || '-' || v_lauf;
  end loop;

  return v_kandidat;
end;
$function$;

CREATE OR REPLACE FUNCTION public.application_form_options()
 RETURNS TABLE(art text, code text, name text, description text, amount_cents integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select 'fee_type', t.id::text, t.name, t.description,
         (select p.amount_cents from public.fee_prices p
           where p.fee_type_id = t.id
             and p.valid_from_year <= extract(year from private.heute())::integer
           order by p.valid_from_year desc limit 1)
  from public.fee_types t
  where t.active and t.code <> 'schluesselpfand'
  union all
  select 'attribute', a.code, a.name, a.description, null::integer
  from public.member_attribute_types a
  where a.active and a.in_application
  order by 1 desc, 3;
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

  if v_signed > private.heute() then
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
$function$;

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
    raise exception 'Mandate widerrufen duerfen nur Administratoren.'
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
    raise exception 'Mitgliedschaften beenden duerfen nur Administratoren.'
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
    raise exception 'Wiedereintritte eintragen duerfen nur Administratoren.'
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
    raise exception 'Antraege bearbeiten duerfen nur Administratoren.'
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
    raise exception 'Mitglieder anlegen duerfen nur Administratoren.'
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
    raise exception 'Der Login gehoert zu einer anderen E-Mail-Adresse als das Mitglied.'
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
     set status = 'revoked', revoked_on = coalesce(revoked_on, private.heute())
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
    notes = 'Anonymisiert am ' || to_char(private.heute(), 'DD.MM.YYYY')
            || coalesce(': ' || nullif(btrim(coalesce(p_reason, '')), ''), '')
  where id = p_member_id;

  delete from public.member_roles where member_id = p_member_id and role = 'admin';
end;
$function$;

-- ---------------------------------------------------------------------------
-- B17: Schluss nach hinten verschoben, erneut erinnern
--
-- Die Erinnerung geht einmal je Veranstaltung (reminder_sent_at). Rueckt der
-- Anmeldeschluss nach hinten, gilt die alte Erinnerung nicht mehr: der
-- naechste Lauf erinnert vor dem neuen Schluss. Ohne eigenen Schluss ist es
-- der Beginn (private.event_schluss). Rueckt er nach vorne, bleibt es dabei.
-- ---------------------------------------------------------------------------

create or replace function private.event_erinnerung_bei_neuem_schluss()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.reminder_sent_at is not null
     and old.reminder_sent_at is not distinct from new.reminder_sent_at
     and private.event_schluss(new) > private.event_schluss(old) then
    new.reminder_sent_at := null;
  end if;
  return new;
end;
$function$;

create trigger events_erinnerung_bei_neuem_schluss
  before update of registration_deadline, starts_at on public.events
  for each row execute function private.event_erinnerung_bei_neuem_schluss();

-- ---------------------------------------------------------------------------
-- S18a: wer als "aktiver Admin" zaehlt
--
-- set_member_role laesst die letzte Person mit vollen Rechten ihre Rolle
-- nicht abgeben. Gezaehlt wurde dabei jede Rolle admin oder board, auch die
-- eines gesperrten Zugangs oder eines Mitglieds ohne Zugang. Wer die Rechte
-- nicht ausueben kann, zaehlt jetzt nicht mehr: dieselbe Bedingung wie in
-- private.is_admin() (Rolle, Login, hat_zugang).
--
-- private.aktive_admins_ohne(m, r) zaehlt die Personen, die nach dem Abgeben
-- von Rolle r durch Mitglied m noch volle Rechte ausueben koennen. Ohne r
-- zaehlt m gar nicht mit (etwa vor dem Sperren oder Loeschen von m).
-- ---------------------------------------------------------------------------

create or replace function private.aktive_admins_ohne(
  p_member_id uuid,
  p_role public.app_role default null
)
returns integer
language sql
stable security definer
set search_path to ''
as $function$
  select count(distinct r.member_id)::integer
  from public.member_roles r
  join public.members m on m.id = r.member_id
  where r.role in ('admin'::public.app_role, 'board'::public.app_role)
    and m.auth_user_id is not null
    and private.hat_zugang(m)
    and not (r.member_id is not distinct from p_member_id
             and (p_role is null or r.role = p_role));
$function$;

revoke execute on function private.aktive_admins_ohne(uuid, public.app_role) from public;

create or replace function public.set_member_role(p_member_id uuid, p_role app_role, p_granted boolean)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_voll   boolean := p_role in ('admin', 'board');
begin
  if not private.is_admin() then
    raise exception 'Rollen vergeben duerfen nur Administratoren.'
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
      raise exception 'Nur Mitglieder mit Login koennen Administrator oder Vorstand werden.'
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

-- ---------------------------------------------------------------------------
-- S23: Eine Fassung, der jemand zugestimmt hat, bleibt, wie sie war
--
-- member_consents verweist auf (code, version). Der Nachweis taugt nur, wenn
-- der Text dahinter derselbe bleibt. Eine neue Fassung ist eine neue
-- Version; aktiv, gueltig ab und Anlagezeit duerfen sich weiter aendern.
-- ---------------------------------------------------------------------------

create or replace function private.rechtstext_fassung_schuetzen()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (new.title is distinct from old.title or new.body_md is distinct from old.body_md)
     and exists (select 1 from public.member_consents c
                  where c.document_code = old.code and c.version = old.version) then
    raise exception 'Dieser Fassung haben Mitglieder bereits zugestimmt. Fuer einen neuen Text bitte eine neue Version anlegen.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

revoke execute on function private.rechtstext_fassung_schuetzen() from public;

create trigger legal_documents_fassung_schuetzen
  before update of title, body_md on public.legal_documents
  for each row execute function private.rechtstext_fassung_schuetzen();

-- ---------------------------------------------------------------------------
-- B26: Archivierte Mitglieder reaktivieren
--
-- Seit B23 holt update_member niemanden mehr aus dem Archiv. Das macht jetzt
-- reactivate_member, nur fuer Admins. Bewusst ohne Zugang: der Sperrvermerk
-- vom Archivieren bleibt, der Admin gibt den Login frei und laedt neu ein.
-- Das Onboarding ist wieder offen, samt Stammdaten, damit das Mitglied
-- Anschrift und Kontakt bestaetigt. Rollen ausser member kommen nicht
-- zurueck, eine neue Mitgliedschaft traegt reactivate_membership ein.
--
-- Anonymisierte Mitglieder bleiben archiviert: von ihnen ist nichts mehr da,
-- was sich zurueckholen liesse.
-- ---------------------------------------------------------------------------

create or replace function public.reactivate_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_m public.members;
begin
  if not private.is_admin() then
    raise exception 'Mitglieder reaktivieren duerfen nur Administratoren.'
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
    raise exception 'Ein anonymisiertes Mitglied laesst sich nicht reaktivieren.'
      using errcode = 'check_violation';
  end if;

  update public.members set
    status = 'active',
    onboarding_completed_at = null,
    onboarding_stammdaten_at = null
  where id = p_member_id;
end;
$function$;

revoke execute on function public.reactivate_member(uuid) from public, anon;
grant execute on function public.reactivate_member(uuid) to authenticated;
