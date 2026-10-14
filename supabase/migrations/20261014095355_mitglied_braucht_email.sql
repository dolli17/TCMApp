-- ===========================================================================
-- Jedes Mitglied braucht eine E-Mail-Adresse
--
-- Bisher waren Mitglied und Login bewusst getrennt: Kinder und Mitglieder ohne
-- Adresse hatten einen Datensatz, aber keinen Zugang. Das faellt weg. Wer
-- angelegt wird, bekommt sofort einen Login und eine Einladungsmail. Dafuer
-- braucht jedes Mitglied eine eigene, eindeutige Adresse, auch ein Kind.
--
-- Abwaertskompatibel: Der Altbestand ohne Adresse bleibt erlaubt, bis er
-- nachgepflegt ist (Skript tools/logins-nachziehen). Statt eines CHECK
-- (NOT VALID) prueft ein Trigger die Regel nur beim Anlegen und wenn sich die
-- Adresse aendert. Ein CHECK greift bei jedem UPDATE der Zeile, auch wenn die
-- Adresse gar nicht angefasst wird - beim Altbestand liesse sich dann nicht
-- einmal die Telefonnummer aendern. Ist der Bestand bereinigt, wird daraus ein
-- validierter CHECK.
--
-- Ausgenommen sind archivierte Mitglieder: anonymize_member entfernt die
-- Adresse bewusst, und Archivierte bekommen ohnehin keinen Zugang.
--
-- Ausserdem: members_ohne_login() fuer das Skript tools/logins-nachziehen,
-- damit es ohne direkte Datenbankverbindung auskommt.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Regel: E-Mail ist Pflicht
-- ---------------------------------------------------------------------------
create or replace function private.guard_member_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.email is not distinct from old.email then
    return new;
  end if;

  if new.status = 'archived' then
    return new;
  end if;

  if nullif(btrim(coalesce(new.email::text, '')), '') is null then
    if tg_op = 'INSERT' then
      raise exception 'Ohne E-Mail-Adresse kann kein Mitglied angelegt werden.'
        using errcode = 'check_violation';
    end if;
    raise exception 'Die E-Mail-Adresse laesst sich nicht entfernen. Jedes Mitglied braucht sie fuer seinen Login.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function private.guard_member_email() is
  'E-Mail ist Pflicht, geprueft beim Anlegen und wenn sich die Adresse aendert. '
  'Altbestand ohne Adresse bleibt aenderbar; Archivierte (anonymisiert) sind ausgenommen.';

drop trigger if exists members_email_pflicht on public.members;
create trigger members_email_pflicht
  before insert or update on public.members
  for each row execute function private.guard_member_email();

-- ---------------------------------------------------------------------------
-- Kommentare auf das neue Modell
-- ---------------------------------------------------------------------------
comment on table public.members is
  'Eine Person im Verein. Jedes Mitglied hat eine eigene E-Mail-Adresse und einen '
  'eigenen Login, auch ein Kind, und zahlt fuer sich selbst. Bei Kindern gehoert '
  'das Konto des SEPA-Mandats den Eltern (bank_accounts.holder).';

comment on column public.members.auth_user_id is
  'Login des Mitglieds. Wird beim Anlegen per Einladung gesetzt. Null nur beim '
  'Altbestand, der noch nachgezogen wird (tools/logins-nachziehen), und bei '
  'Archivierten. Ein Account gehoert immer genau einer Person.';

comment on column public.members.email is
  'Pflicht fuer jedes Mitglied (Trigger members_email_pflicht), auch fuer Kinder. '
  'Unique, wie auth.users.email. Null nur beim Altbestand und bei Anonymisierten.';

-- ---------------------------------------------------------------------------
-- Mitglied anlegen: ohne E-Mail keine Anlage
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

  -- p_email bleibt wegen der Signatur optional, ist aber Pflicht.
  if length(btrim(coalesce(p_email, ''))) = 0 then
    raise exception 'Ohne E-Mail-Adresse kann kein Mitglied angelegt werden.'
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
    lower(btrim(p_email))::extensions.citext,
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

-- ---------------------------------------------------------------------------
-- Stammdaten aendern: die E-Mail laesst sich nicht leeren
-- ---------------------------------------------------------------------------
create or replace function public.update_member(p_member_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
    raise exception 'Mitgliedsdaten aendern duerfen nur Administratoren.'
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

  -- Eine vorhandene Adresse darf sich aendern, aber nicht verschwinden. Der
  -- Altbestand ohne Adresse darf ohne bleiben, bis jemand eine eintraegt.
  if v_neu ? 'email' and v_neu ->> 'email' is null and v_alt.email is not null then
    raise exception 'Die E-Mail-Adresse laesst sich nicht entfernen. Jedes Mitglied braucht sie fuer seinen Login.'
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
$$;

-- ---------------------------------------------------------------------------
-- Antrag annehmen: es wird immer eingeladen
--
-- Der Antrag verlangt die E-Mail ohnehin, und create_member weist ein
-- Mitglied ohne Adresse ab. needs_invite ist deshalb immer true.
-- ---------------------------------------------------------------------------
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

  return query select v_id, v_nummer, true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Login-Status: ohne E-Mail ist das Altbestand
-- ---------------------------------------------------------------------------
create or replace function public.member_login_state(p_member_id uuid)
returns table (
  hat_zugang     boolean,
  email          text,
  invited_at     timestamptz,
  disabled_at    timestamptz,
  last_sign_in   timestamptz,
  ist_admin      boolean,
  einladbar      boolean,
  grund          text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.auth_user_id is not null,
    m.email::text,
    m.invited_at,
    m.login_disabled_at,
    u.last_sign_in_at,
    private.has_full_rights(m.id),
    m.auth_user_id is null and m.email is not null and m.status <> 'archived',
    case
      when m.auth_user_id is not null then null::text
      when m.status = 'archived' then 'Archivierte Mitglieder bekommen keinen Zugang.'
      when m.email is null then
        'Altbestand: E-Mail fehlt. Bitte eine Adresse eintragen, dann kann eingeladen werden.'
      else null::text
    end
  from public.members m
  left join auth.users u on u.id = m.auth_user_id
  where m.id = p_member_id
    and private.is_admin();
$$;

-- ---------------------------------------------------------------------------
-- Mitglieder ohne Login, fuer tools/logins-nachziehen
--
-- Der Dienstschluessel hat auf public.members bewusst kein SELECT (siehe
-- member_for_login_admin). Statt die Tabelle zu oeffnen, bekommt das Skript
-- genau das, was es zum Einteilen braucht: die nicht archivierten Mitglieder
-- ohne Login, das Urteil von ist_testadresse und den Abgleich mit auth.users
-- (gibt es zur Adresse schon ein Konto, und wem gehoert es?). Adressen werden
-- ohne Ruecksicht auf Gross- und Kleinschreibung verglichen.
-- ---------------------------------------------------------------------------
create or replace function public.members_ohne_login()
returns table (
  id              uuid,
  first_name      text,
  last_name       text,
  email           text,
  ist_testadresse boolean,
  konto_id        uuid,
  konto_mitglied  text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id,
    m.first_name,
    m.last_name,
    nullif(btrim(coalesce(m.email::text, '')), ''),
    coalesce(public.ist_testadresse(m.email::text), false),
    u.id,
    nullif(btrim(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')), '')
  from public.members m
  left join lateral (
    select au.id from auth.users au
    where lower(au.email) = lower(btrim(m.email::text))
    limit 1
  ) u on true
  left join public.members b on b.auth_user_id = u.id
  where m.auth_user_id is null
    and m.status <> 'archived'
  order by m.last_name, m.first_name;
$$;

comment on function public.members_ohne_login() is
  'Nicht archivierte Mitglieder ohne Login samt Abgleich mit auth.users. '
  'Nur fuer den Dienstschluessel (tools/logins-nachziehen).';

revoke execute on function public.members_ohne_login() from public, anon, authenticated;
grant  execute on function public.members_ohne_login() to service_role;
