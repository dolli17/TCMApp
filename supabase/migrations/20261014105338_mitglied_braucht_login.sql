-- ===========================================================================
-- Jedes Mitglied hat einen Login
--
-- Abschluss der Umstellung "keine Mitglieder ohne Login" (PR A bis C haben
-- vorbereitet, Dev hat bei allen Mitgliedern E-Mail und Login, Prod ist noch
-- leer):
--
--   1. E-Mail-Pflicht als validierter CHECK statt Trigger.
--   2. Login-Pflicht als validierter CHECK. Damit das geht, entsteht der Login
--      zuerst und create_member bzw. accept_membership_application bekommen
--      ihn als p_auth_user_id. Scheitert das Anlegen, loescht die Edge
--      Function member-login den Login wieder. Ein Mitglied ohne Login
--      entsteht so nie, auch nicht fuer einen Augenblick.
--   3. Die Zahler-Beziehung verschwindet endgueltig: Spalte billing_payer_id,
--      Parameter p_billing_payer_id und die immer leeren Rueckgaben
--      released_payees, payees und is_paid_by. charges.payer_id bleibt.
--   4. O25: link_auth_user weist Kiosk-Konten ab.
--
-- Archivierte sind von beiden Pflichten ausgenommen: anonymize_member entfernt
-- Adresse und Login bewusst.
--
-- Nicht abwaertskompatibel im engeren Sinn (Spalte und Parameter fallen weg).
-- Das ist hier vertretbar: Web und Edge Function kommen im selben Deploy, und
-- die Mobile-App benutzt keines der entfernten Felder.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. E-Mail-Pflicht: CHECK statt Trigger
-- ---------------------------------------------------------------------------
drop trigger if exists members_email_pflicht on public.members;
drop function if exists private.guard_member_email();

alter table public.members
  add constraint members_email_pflicht
  check (status = 'archived' or (email is not null and btrim(email::text) <> ''));

-- ---------------------------------------------------------------------------
-- 2. Login-Pflicht
--
-- Der Fremdschluessel auf auth.users bleibt "on delete set null". Ein Login
-- eines nicht archivierten Mitglieds laesst sich damit nicht mehr loeschen -
-- der CHECK lehnt das Nullsetzen ab. Das ist gewollt: Der Login geht nur mit
-- dem Mitglied (delete_member, anonymize_member).
-- ---------------------------------------------------------------------------
alter table public.members
  add constraint members_login_pflicht
  check (status = 'archived' or auth_user_id is not null);

comment on column public.members.auth_user_id is
  'Login des Mitglieds, Pflicht ausser bei Archivierten (CHECK members_login_pflicht). '
  'Entsteht vor dem Mitglied und wird create_member mitgegeben. Ein Account gehoert '
  'immer genau einer Person.';

comment on column public.members.email is
  'Pflicht ausser bei Archivierten (CHECK members_email_pflicht), auch fuer Kinder. '
  'Unique, wie auth.users.email.';

-- ---------------------------------------------------------------------------
-- 3. Zahler endgueltig entfernen
-- ---------------------------------------------------------------------------
alter table public.members drop constraint if exists members_no_billing_payer;
alter table public.members drop constraint if exists members_no_self_payer;
drop index if exists public.members_billing_payer_id_idx;
alter table public.members drop column if exists billing_payer_id;

-- ---------------------------------------------------------------------------
-- Pruefung eines neuen Logins, gemeinsam fuer create_member und link_auth_user
-- ---------------------------------------------------------------------------
create or replace function private.login_pruefen(p_auth_user_id uuid, p_member_id uuid default null)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    raise exception 'Dieser Zugang gehoert zu einem Kiosk-Geraet und laesst sich keinem Mitglied zuordnen.'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.members
              where auth_user_id = p_auth_user_id
                and id is distinct from p_member_id) then
    raise exception 'Dieser Zugang gehoert bereits zu einem anderen Mitglied.'
      using errcode = 'check_violation';
  end if;
end;
$$;

revoke execute on function private.login_pruefen(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Mitglied anlegen: mit Login, ohne Zahler
-- ---------------------------------------------------------------------------
drop function if exists public.create_member(
  text, text, text, date, public.gender, public.salutation, text, text, text,
  text, text, text, text, uuid, text, text, date, uuid[]);

create function public.create_member(
  p_first_name   text,
  p_last_name    text,
  p_email        text default null,
  p_birthday     date default null,
  p_gender       public.gender default null,
  p_salutation   public.salutation default null,
  p_title        text default null,
  p_phone        text default null,
  p_mobile       text default null,
  p_street       text default null,
  p_postcode     text default null,
  p_city         text default null,
  p_country_code text default 'DE',
  p_notes        text default null,
  p_number       text default null,
  p_started_on   date default null,
  p_fee_type_ids uuid[] default '{}',
  p_auth_user_id uuid default null
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
  v_email  text := lower(btrim(coalesce(p_email, '')));
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

  -- p_email und p_auth_user_id sind nur der Reihenfolge wegen optional.
  if v_email = '' then
    raise exception 'Ohne E-Mail-Adresse kann kein Mitglied angelegt werden.'
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

  insert into public.members (
    first_name, last_name, title, gender, salutation, birthday,
    email, phone, mobile, street, postcode, city, country_code,
    notes, auth_user_id, invited_at
  ) values (
    btrim(p_first_name), btrim(p_last_name), nullif(btrim(coalesce(p_title, '')), ''),
    p_gender, p_salutation, p_birthday,
    v_email::extensions.citext,
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_mobile, '')), ''),
    nullif(btrim(coalesce(p_street, '')), ''),
    nullif(btrim(coalesce(p_postcode, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    coalesce(nullif(btrim(coalesce(p_country_code, '')), ''), 'DE'),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_auth_user_id, now()
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

revoke execute on function public.create_member(
  text, text, text, date, public.gender, public.salutation, text, text, text,
  text, text, text, text, text, text, date, uuid[], uuid) from public, anon;
grant execute on function public.create_member(
  text, text, text, date, public.gender, public.salutation, text, text, text,
  text, text, text, text, text, text, date, uuid[], uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Antrag annehmen: mit Login, in einem Zug
--
-- Die Edge Function legt zuerst den Login an und ruft dann diese Funktion.
-- Scheitert sie, rollt die Datenbank alles zurueck (Mitglied, Antragsstatus,
-- Einwilligungen), und die Function loescht den Login wieder.
-- ---------------------------------------------------------------------------
drop function if exists public.accept_membership_application(uuid, text, uuid[], date, uuid);

create function public.accept_membership_application(
  p_application_id uuid,
  p_number         text default null,
  p_fee_type_ids   uuid[] default '{}',
  p_started_on     date default null,
  p_auth_user_id   uuid default null)
returns table (member_id uuid, membership_number text)
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
    p_started_on   => coalesce(p_started_on, current_date),
    p_fee_type_ids => v_arten,
    p_auth_user_id => p_auth_user_id
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

  return query select v_id, v_nummer;
end;
$$;

revoke execute on function public.accept_membership_application(uuid, text, uuid[], date, uuid)
  from public, anon;
grant execute on function public.accept_membership_application(uuid, text, uuid[], date, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- O25: link_auth_user weist Kiosk-Konten ab
--
-- Wird nur noch selten gebraucht (das Anlegen bekommt den Login direkt),
-- bleibt aber fuer die Verwaltung erhalten.
-- ---------------------------------------------------------------------------
create or replace function public.link_auth_user(p_member_id uuid, p_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.members;
begin
  -- Entweder ein Administrator, oder ein Aufruf ohne angemeldeten Nutzer:
  -- Letzteres ist die Edge Function mit dem Service-Schluessel.
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Zugaenge verwalten duerfen nur Administratoren.'
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
$$;

-- Einen Login loesen gibt es nicht mehr: Er geht nur mit dem Mitglied.
drop function if exists public.unlink_auth_user(uuid);

-- Das Skript tools/logins-nachziehen entfaellt: Mitglieder ohne Login kann es
-- nicht mehr geben.
drop function if exists public.members_ohne_login();

-- ---------------------------------------------------------------------------
-- Login-Status: kein Altbestand mehr
--
-- Ohne Login sind nur noch Archivierte (anonymisiert). einladbar faellt weg.
-- ---------------------------------------------------------------------------
drop function if exists public.member_login_state(uuid);

create function public.member_login_state(p_member_id uuid)
returns table (
  hat_zugang     boolean,
  email          text,
  invited_at     timestamptz,
  disabled_at    timestamptz,
  last_sign_in   timestamptz,
  ist_admin      boolean,
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
    case
      when m.auth_user_id is null then 'Archivierte Mitglieder bekommen keinen Zugang.'
      else null::text
    end
  from public.members m
  left join auth.users u on u.id = m.auth_user_id
  where m.id = p_member_id
    and private.is_admin();
$$;

revoke execute on function public.member_login_state(uuid) from public, anon;
grant  execute on function public.member_login_state(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Archivieren: ohne released_payees
-- ---------------------------------------------------------------------------
drop function if exists public.archive_member(uuid, boolean, text);

create function public.archive_member(
  p_member_id uuid, p_force boolean default false, p_reason text default null)
returns table (cancelled_bookings integer, open_charges integer, open_amount_cents integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ich      uuid := private.current_member_id();
  v_offen    integer;
  v_betrag   integer;
  v_gecancelt integer := 0;
  v_buchung  record;
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

  -- Kuenftige Buchungen stornieren und alle Mitspieler benachrichtigen.
  for v_buchung in
    select b.id, b.court_id, b.slot
    from public.bookings b
    where b.member_id = p_member_id and b.status = 'active' and lower(b.slot) > now()
  loop
    update public.bookings set
      status = 'cancelled', cancelled_at = now(), cancelled_by = v_ich,
      cancellation_reason = 'Mitglied archiviert'
    where id = v_buchung.id;

    insert into public.notifications (member_id, kind, title, body)
    select bp.member_id, 'booking_cancelled', 'Buchung abgesagt',
           'Eine Buchung am ' ||
           to_char(lower(v_buchung.slot) at time zone 'Europe/Berlin', 'DD.MM.YYYY "um" HH24:MI') ||
           ' wurde abgesagt, weil das buchende Mitglied ausgetreten ist.'
    from public.booking_players bp
    where bp.booking_id = v_buchung.id and bp.member_id <> p_member_id;

    v_gecancelt := v_gecancelt + 1;
  end loop;

  -- Laufende Mitgliedschaft beenden, sofern noch offen.
  update public.memberships set
    ended_on = coalesce(ended_on, current_date),
    cancellation_date = coalesce(cancellation_date, current_date),
    cancellation_reason = coalesce(cancellation_reason, nullif(btrim(coalesce(p_reason, '')), '')),
    status = 'ended'
  where member_id = p_member_id and ended_on is null;

  -- Mandate widerrufen, Bankverbindungen stilllegen.
  update public.sepa_mandates
     set status = 'revoked', revoked_on = coalesce(revoked_on, current_date)
   where member_id = p_member_id and status = 'active';
  update public.bank_accounts set active = false
   where member_id = p_member_id and active;

  -- Adminrechte enden mit der Mitgliedschaft.
  delete from public.member_roles where member_id = p_member_id and role = 'admin';

  update public.members set
    status = 'archived',
    notes = case when nullif(btrim(coalesce(p_reason, '')), '') is null then notes
                 else coalesce(notes || E'\n', '') || 'Archiviert: ' || btrim(p_reason) end
  where id = p_member_id;

  return query select v_gecancelt, v_offen, v_betrag;
end;
$$;

revoke execute on function public.archive_member(uuid, boolean, text) from public, anon;
grant  execute on function public.archive_member(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Loeschvorschau: ohne payees
--
-- delete_member liest die Vorschau per "select *" und braucht keine Aenderung.
-- ---------------------------------------------------------------------------
drop function if exists public.member_delete_impact(uuid);

create function public.member_delete_impact(p_member_id uuid)
returns table (
  charges integer, drink_purchases integer, bookings integer,
  booking_players integer, work_duty_entries integer,
  mandates integer, bank_accounts integer,
  can_delete boolean, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
      else 'Zu diesem Mitglied gehoeren bereits Forderungen, Getraenke oder Buchungen. '
        || 'Loeschen wuerde die Buchhaltung zerreissen.'
    end;
end;
$$;

revoke execute on function public.member_delete_impact(uuid) from public, anon;
grant  execute on function public.member_delete_impact(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Mitgliederliste: ohne is_paid_by und ohne Filter "ohne-login"
-- ---------------------------------------------------------------------------
drop function if exists public.member_overview(text, text, integer);

create function public.member_overview(
  p_filter text default 'aktiv',
  p_query  text default null,
  p_limit  integer default 500)
returns table (
  id             uuid,
  first_name     text,
  last_name      text,
  email          text,
  birthday       date,
  status         public.member_status,
  is_trainer     boolean,
  has_login      boolean,
  is_admin       boolean,
  number         text,
  started_on     date,
  ended_on       date,
  roles          public.app_role[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with sichtbar as (
    select m.*
    from public.members m
    where private.is_admin()
      and case p_filter
            when 'aktiv'       then m.status = 'active'
            when 'archiviert'  then m.status = 'archived'
            when 'trainer'     then m.is_trainer
            when 'admins'      then private.has_full_rights(m.id)
            when 'vorstand'    then exists (select 1 from public.member_roles r
                                             where r.member_id = m.id and r.role = 'board')
            when 'platzwart'   then exists (select 1 from public.member_roles r
                                             where r.member_id = m.id and r.role = 'groundskeeper')
            else true
          end
      and (
        p_query is null or btrim(p_query) = ''
        or m.first_name ilike '%' || btrim(p_query) || '%'
        or m.last_name  ilike '%' || btrim(p_query) || '%'
        or (m.first_name || ' ' || m.last_name) ilike '%' || btrim(p_query) || '%'
        or (m.last_name || ' ' || m.first_name) ilike '%' || btrim(p_query) || '%'
      )
  ),
  -- Die laufende Mitgliedschaft, sonst die zuletzt beendete. "distinct on"
  -- liefert genau eine Zeile je Mitglied, ohne Unterabfrage je Zeile.
  aktuelle as (
    select distinct on (s.member_id)
           s.member_id, s.number, s.started_on, s.ended_on
    from public.memberships s
    where s.member_id in (select id from sichtbar)
    order by s.member_id, (s.ended_on is null) desc, s.started_on desc
  )
  select
    m.id, m.first_name, m.last_name, m.email::text, m.birthday, m.status,
    m.is_trainer,
    m.auth_user_id is not null,
    private.has_full_rights(m.id),
    a.number, a.started_on, a.ended_on,
    coalesce((select array_agg(r.role order by r.role) from public.member_roles r
               where r.member_id = m.id), '{}')
  from sichtbar m
  left join aktuelle a on a.member_id = m.id
  order by lower(m.last_name), lower(m.first_name)
  limit least(coalesce(p_limit, 500), 1000);
$$;

revoke execute on function public.member_overview(text, text, integer) from public, anon;
grant  execute on function public.member_overview(text, text, integer) to authenticated;

comment on table public.members is
  'Eine Person im Verein. Jedes Mitglied hat eine eigene E-Mail-Adresse und einen '
  'eigenen Login, auch ein Kind, und zahlt fuer sich selbst. Bei Kindern gehoert '
  'das Konto des SEPA-Mandats den Eltern (bank_accounts.holder).';
