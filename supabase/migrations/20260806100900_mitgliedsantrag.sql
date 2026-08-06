-- ===========================================================================
-- Mitgliedsantrag
--
-- Der einzige Weg, auf dem jemand ohne Anmeldung etwas in diese Datenbank
-- schreiben kann. Entsprechend eng ist er gefasst:
--
--   * anon hat auf die Tabelle keinerlei Recht. Ausfuehrbar ist genau eine
--     Funktion, und die gibt nichts zurueck.
--   * Die Antwort ist in jedem Fall dieselbe - ob die Adresse neu ist, schon
--     einen offenen Antrag hat oder zu einem Mitglied gehoert. Andernfalls
--     liesse sich hier durchprobieren, wer im Verein ist.
--   * Drei Sperren gegen Massenzusendungen, und die IP wird nur gehasht
--     abgelegt.
--
-- Warum eine eigene Tabelle und nicht memberships mit status 'requested'?
-- Weil eine Mitgliedschaft eine members-Zeile voraussetzt und eine
-- Mitgliedsnummer verbraucht. Ein anonymer Absender wuerde damit direkt in
-- die Mitgliedertabelle schreiben. Der Enum-Wert 'requested' bleibt fuer die
-- eBuSy-Importe erhalten.
-- ===========================================================================

do $$ begin
  create type public.application_status as enum ('new', 'accepted', 'declined', 'spam');
exception when duplicate_object then null; end $$;

create table public.membership_applications (
  id             uuid primary key default gen_random_uuid(),

  first_name     text not null,
  last_name      text not null,
  title          text,
  gender         public.gender,
  salutation     public.salutation,
  birthday       date not null,

  email          extensions.citext not null,
  phone          text,
  mobile         text,

  street         text,
  postcode       text,
  city           text,
  country_code   text default 'DE',

  emergency_contact_name     text,
  emergency_contact_phone    text,
  emergency_contact_relation text,

  -- Bei Minderjaehrigen: wer unterschreibt und wer bezahlt.
  guardian_name  text,
  guardian_email extensions.citext,

  desired_fee_type_id uuid references public.fee_types (id) on delete set null,
  -- Die Einwilligungen aus dem Formular, als {"code": true}. Sie werden erst
  -- bei der Annahme in member_attribute_values uebertragen - vorher gibt es
  -- noch kein Mitglied, an dem sie haengen koennten.
  attribute_choices jsonb not null default '{}'::jsonb,
  message        text,

  status         public.application_status not null default 'new',
  -- Nur ein Verdacht, nie eine Aussage nach aussen: die Antwort bleibt
  -- unabhaengig davon dieselbe.
  possible_duplicate boolean not null default false,

  ip_hash        text,
  user_agent     text,

  decided_at     timestamptz,
  decided_by     uuid references public.members (id) on delete set null,
  decision_note  text,
  created_member_id uuid references public.members (id) on delete set null,

  submitted_at   timestamptz not null default now(),

  constraint membership_applications_birthday_past   check (birthday <= current_date),
  constraint membership_applications_birthday_plausibel
    check (birthday >= current_date - interval '120 years'),
  constraint membership_applications_names_set
    check (length(btrim(first_name)) > 0 and length(btrim(last_name)) > 0),
  constraint membership_applications_message_length
    check (message is null or length(message) <= 1000),
  constraint membership_applications_felder_kurz
    check (length(first_name) <= 100 and length(last_name) <= 100
           and (street is null or length(street) <= 200)
           and (city is null or length(city) <= 100))
);

comment on table public.membership_applications is
  'Aufnahmeantraege aus dem oeffentlichen Formular. Wird ausschliesslich ueber '
  'submit_membership_application beschrieben; anon hat auf die Tabelle kein Recht.';

create index membership_applications_status_idx
  on public.membership_applications (status, submitted_at desc);
create index membership_applications_ip_idx
  on public.membership_applications (ip_hash, submitted_at desc);
create index membership_applications_decided_by_idx
  on public.membership_applications (decided_by);
create index membership_applications_member_idx
  on public.membership_applications (created_member_id);

-- Ein offener Antrag je Adresse. Ein zweiter Versuch laeuft ins Leere - aber
-- still, ohne dass der Absender daraus etwas ablesen koennte.
create unique index membership_applications_one_open_per_email
  on public.membership_applications (email) where (status = 'new');

alter table public.membership_applications enable row level security;

create policy membership_applications_admin_all on public.membership_applications
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

grant select on public.membership_applications to authenticated;

-- ---------------------------------------------------------------------------
-- Pfeffer fuer den IP-Hash
--
-- Eine blosse Pruefsumme der IP-Adresse waere in Minuten rueckrechenbar - der
-- Raum der IPv4-Adressen ist klein. Mit einem geheimen Zusatz aus dem Vault
-- ist er das nicht. Gebraucht wird der Hash nur, um mehrere Zusendungen
-- derselben Herkunft zu erkennen; die Adresse selbst wird nirgends abgelegt.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'ip_hash_pepper') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'ip_hash_pepper',
      'Zusatz fuer den IP-Hash der Mitgliedsantraege'
    );
  end if;
end $$;

create or replace function private.hash_ip(p_ip text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pepper text;
begin
  if p_ip is null or btrim(p_ip) = '' then return null; end if;

  select decrypted_secret into v_pepper
  from vault.decrypted_secrets where name = 'ip_hash_pepper';

  if v_pepper is null then return null; end if;

  return encode(extensions.hmac(btrim(p_ip), v_pepper, 'sha256'), 'hex');
end;
$$;

-- ---------------------------------------------------------------------------
-- Antrag einreichen
--
-- Die einzige Funktion, die anon aufrufen darf. Sie gibt void zurueck: keine
-- Kennung, keine Zahl, nichts, woraus sich etwas ableiten liesse.
-- ---------------------------------------------------------------------------
create or replace function public.submit_membership_application(
  p_data       jsonb,
  p_ip         text default null,
  p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_erlaubt constant text[] := array[
    'first_name', 'last_name', 'title', 'gender', 'salutation', 'birthday',
    'email', 'phone', 'mobile', 'street', 'postcode', 'city',
    'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
    'guardian_name', 'guardian_email', 'desired_fee_type_id',
    'attribute_choices', 'message'
  ];
  v_d       jsonb := '{}'::jsonb;
  v_schl    text;
  v_ip      text := private.hash_ip(p_ip);
  v_email   extensions.citext;
  v_anzahl  integer;
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

  v_email := lower(btrim(coalesce(v_d ->> 'email', '')))::extensions.citext;
  if v_email is null or position('@' in v_email::text) = 0 then
    raise exception 'Bitte eine gueltige E-Mail-Adresse angeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  if (v_d ->> 'birthday') is null then
    raise exception 'Bitte das Geburtsdatum angeben.'
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
      raise exception 'Es sind gerade zu viele Antraege eingegangen. Bitte spaeter erneut versuchen.'
        using errcode = 'too_many_rows';
    end if;
  end if;

  -- Sperre 2: zwanzig Antraege in einer Stunde ueberhaupt. Der Verein hat
  -- dreihundert Mitglieder; das ist mit Sicherheit kein echter Andrang.
  select count(*)::integer into v_anzahl
  from public.membership_applications
  where submitted_at > now() - interval '1 hour';

  if v_anzahl >= 20 then
    raise exception 'Es sind gerade zu viele Antraege eingegangen. Bitte spaeter erneut versuchen.'
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
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    guardian_name, guardian_email, desired_fee_type_id,
    attribute_choices, message, possible_duplicate, ip_hash, user_agent
  ) values (
    btrim(v_d ->> 'first_name'),
    btrim(v_d ->> 'last_name'),
    nullif(btrim(coalesce(v_d ->> 'title', '')), ''),
    (nullif(v_d ->> 'gender', ''))::public.gender,
    (nullif(v_d ->> 'salutation', ''))::public.salutation,
    (v_d ->> 'birthday')::date,
    v_email,
    nullif(btrim(coalesce(v_d ->> 'phone', '')), ''),
    nullif(btrim(coalesce(v_d ->> 'mobile', '')), ''),
    nullif(btrim(coalesce(v_d ->> 'street', '')), ''),
    nullif(btrim(coalesce(v_d ->> 'postcode', '')), ''),
    nullif(btrim(coalesce(v_d ->> 'city', '')), ''),
    nullif(btrim(coalesce(v_d ->> 'emergency_contact_name', '')), ''),
    nullif(btrim(coalesce(v_d ->> 'emergency_contact_phone', '')), ''),
    nullif(btrim(coalesce(v_d ->> 'emergency_contact_relation', '')), ''),
    nullif(btrim(coalesce(v_d ->> 'guardian_name', '')), ''),
    nullif(lower(btrim(coalesce(v_d ->> 'guardian_email', ''))), '')::extensions.citext,
    (nullif(v_d ->> 'desired_fee_type_id', ''))::uuid,
    coalesce(v_d -> 'attribute_choices', '{}'::jsonb),
    nullif(btrim(coalesce(v_d ->> 'message', '')), ''),
    -- Nur ein Vermerk fuer den Vorstand. Nach aussen aendert er nichts.
    exists (select 1 from public.members m where m.email = v_email),
    v_ip,
    left(coalesce(p_user_agent, ''), 300)
  );

  -- Den Vorstand benachrichtigen. Geht aus anon heraus nur, weil diese
  -- Funktion security definer ist.
  insert into public.notifications (member_id, kind, title, body)
  select r.member_id, 'application_new', 'Neuer Mitgliedsantrag',
         btrim(v_d ->> 'first_name') || ' ' || btrim(v_d ->> 'last_name')
         || ' moechte dem Verein beitreten.'
  from public.member_roles r
  where r.role = 'admin';
end;
$$;

revoke execute on function public.submit_membership_application(jsonb, text, text) from public;
grant  execute on function public.submit_membership_application(jsonb, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Was das oeffentliche Formular anzeigen darf
--
-- Beitragsarten und die Einwilligungen mit in_application - mehr nicht. Ohne
-- diese Funktion muesste anon auf zwei Tabellen lesen duerfen.
-- ---------------------------------------------------------------------------
create or replace function public.application_form_options()
returns table (art text, code text, name text, description text, amount_cents integer)
language sql
stable
security definer
set search_path = ''
as $$
  select 'fee_type', t.id::text, t.name, t.description,
         (select p.amount_cents from public.fee_prices p
           where p.fee_type_id = t.id
             and p.valid_from_year <= extract(year from current_date)::integer
           order by p.valid_from_year desc limit 1)
  from public.fee_types t
  where t.active and t.code <> 'schluesselpfand'
  union all
  select 'attribute', a.code, a.name, a.description, null::integer
  from public.member_attribute_types a
  where a.active and a.in_application
  order by 1 desc, 3;
$$;

revoke execute on function public.application_form_options() from public;
grant  execute on function public.application_form_options() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Antrag annehmen
--
-- Legt Mitglied, Mitgliedschaft und Rolle an und uebertraegt die
-- Einwilligungen. Die Einladung verschickt danach die Edge Function -
-- needs_invite sagt der Oberflaeche, ob sich das anbietet.
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
    p_billing_payer_id => p_billing_payer_id,
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

revoke execute on function public.accept_membership_application(uuid, text, uuid[], date, uuid)
  from public, anon;
grant execute on function public.accept_membership_application(uuid, text, uuid[], date, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Antrag ablehnen
--
-- Ohne automatische Nachricht: eine Absage schreibt der Vorstand persoenlich.
-- ---------------------------------------------------------------------------
create or replace function public.decline_membership_application(
  p_application_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Antraege bearbeiten duerfen nur Administratoren.'
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
$$;

revoke execute on function public.decline_membership_application(uuid, text) from public, anon;
grant  execute on function public.decline_membership_application(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Als Spam kennzeichnen
--
-- Nicht loeschen: die Zeile zaehlt weiter fuer die Sperren, und genau das ist
-- ihr verbleibender Zweck.
-- ---------------------------------------------------------------------------
create or replace function public.mark_application_spam(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Antraege bearbeiten duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.membership_applications set
    status = 'spam',
    decided_at = now(),
    decided_by = private.current_member_id()
  where id = p_application_id and status = 'new';
end;
$$;

revoke execute on function public.mark_application_spam(uuid) from public, anon;
grant  execute on function public.mark_application_spam(uuid) to authenticated;
