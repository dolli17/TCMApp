-- ===========================================================================
-- Mitgliederverwaltung: die Kern-Funktionen
--
-- Warum ueberhaupt RPCs, wo doch members_admin_all einem Admin jede Zeile
-- erlaubt? Weil authenticated auf public.members nur einen SPALTEN-Grant hat.
-- Status, Zahler, E-Mail, Geburtstag und die Tennisfelder stehen nicht darin -
-- ein Admin kommt an sie ausschliesslich hier vorbei. Das ist Absicht: die
-- Regeln stehen an einer Stelle, nicht in jeder Oberflaeche neu.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Mitgliedsnummer
--
-- Der Vorschuss-Lock ist kein Zierrat: ohne ihn holen sich zwei gleichzeitige
-- Anlagen dieselbe hoechste Nummer und die zweite scheitert an
-- memberships_number_key - fuer den Vorstand ein unerklaerlicher Fehler.
-- ---------------------------------------------------------------------------
create or replace function private.next_membership_number()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
begin
  perform pg_advisory_xact_lock(hashtext('membership_number'));

  select coalesce(max(number::integer), 0) into v_max
  from public.memberships
  where number ~ '^[0-9]+$';

  return (v_max + 1)::text;
end;
$$;

comment on function private.next_membership_number() is
  'Naechste freie Mitgliedsnummer. Nicht-numerische Nummern aus dem eBuSy-'
  'Bestand werden uebergangen, nicht ueberschrieben.';

-- ---------------------------------------------------------------------------
-- Bin ich Admin?
--
-- Die Edge Function fuer die Login-Verwaltung braucht diese Auskunft, und die
-- Oberflaeche kann damit Knoepfe sperren, statt den Fehler abzuwarten.
-- ---------------------------------------------------------------------------
create or replace function public.am_i_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin();
$$;

revoke execute on function public.am_i_admin() from public, anon;
grant  execute on function public.am_i_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Zahlerbeziehung
--
-- Zwei Schranken: diese Funktion fuer die Oberflaeche, und ein Trigger, der
-- auch Import, Seed und jeden kuenftigen Codepfad erfasst. Ein Kreis in der
-- Zahlerkette wuerde den Beitragslauf in eine Endlosschleife schicken.
-- ---------------------------------------------------------------------------
create or replace function private.zahlerkette_prueft(p_member_id uuid, p_payer_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if p_payer_id is null then return; end if;

  if p_payer_id = p_member_id then
    raise exception 'Ein Mitglied kann nicht sein eigener Zahler sein.'
      using errcode = 'check_violation';
  end if;

  -- Vorgesehen ist genau eine Stufe: Kind -> Elternteil. Daraus folgen zwei
  -- Regeln, die zusammen auch jeden Kreis ausschliessen - ein Kreis braucht
  -- mindestens zwei Kanten, und mehr als eine gibt es hier nicht.
  --
  -- Die Alternative waere eine rekursive Tiefenmessung. Die ist schwerer zu
  -- lesen, und die Fehlermeldung koennte nicht sagen, wer im Weg steht.

  -- 1. Der neue Zahler darf nicht selbst bezahlt werden.
  select m2.last_name || ', ' || m2.first_name into v_name
  from public.members m
  join public.members m2 on m2.id = m.billing_payer_id
  where m.id = p_payer_id;

  if v_name is not null then
    raise exception 'Diese Person wird selbst von % bezahlt. Zahlerketten ueber mehr als zwei Stufen sind nicht vorgesehen.', v_name
      using errcode = 'check_violation';
  end if;

  -- 2. Wer selbst fuer andere zahlt, bekommt keinen Zahler.
  select m.last_name || ', ' || m.first_name into v_name
  from public.members m
  where m.billing_payer_id = p_member_id
  order by m.last_name
  limit 1;

  if v_name is not null then
    raise exception 'Dieses Mitglied zahlt bereits fuer andere, unter anderem fuer %. Es kann deshalb keinen eigenen Zahler bekommen.', v_name
      using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function private.guard_payer_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.billing_payer_id is not null
     and (TG_OP = 'INSERT' or new.billing_payer_id is distinct from old.billing_payer_id)
  then
    perform private.zahlerkette_prueft(new.id, new.billing_payer_id);
  end if;
  return new;
end;
$$;

create trigger members_guard_payer_cycle
  before insert or update of billing_payer_id on public.members
  for each row execute function private.guard_payer_cycle();

-- ---------------------------------------------------------------------------
-- Mitglied anlegen
--
-- Legt Person, Mitgliedschaft, Rolle und Beitragszuordnung in einem Zug an.
-- Getrennt waeren es vier Aufrufe, von denen der dritte scheitern kann - und
-- dann steht ein halbes Mitglied in der Datenbank.
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

  if p_billing_payer_id is not null
     and not exists (select 1 from public.members
                      where id = p_billing_payer_id and status <> 'archived') then
    raise exception 'Der gewaehlte Zahler existiert nicht oder ist archiviert.'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.members (
    first_name, last_name, title, gender, salutation, birthday,
    email, phone, mobile, street, postcode, city, country_code,
    billing_payer_id, notes
  ) values (
    btrim(p_first_name), btrim(p_last_name), nullif(btrim(coalesce(p_title, '')), ''),
    p_gender, p_salutation, p_birthday,
    nullif(lower(btrim(coalesce(p_email, ''))), '')::extensions.citext,
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_mobile, '')), ''),
    nullif(btrim(coalesce(p_street, '')), ''),
    nullif(btrim(coalesce(p_postcode, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    coalesce(nullif(btrim(coalesce(p_country_code, '')), ''), 'DE'),
    p_billing_payer_id,
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

revoke execute on function public.create_member(
  text, text, text, date, public.gender, public.salutation, text, text, text,
  text, text, text, text, uuid, text, text, date, uuid[]) from public, anon;
grant execute on function public.create_member(
  text, text, text, date, public.gender, public.salutation, text, text, text,
  text, text, text, text, uuid, text, text, date, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Stammdaten aendern
--
-- Ein Patch statt achtzehn Parameter: die Oberflaeche schickt nur, was sich
-- geaendert hat, und die Fehlermeldung kann das Feld benennen. Die Whitelist
-- ist die einzige Stelle, an der steht, was ein Admin ueberhaupt aendern darf.
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

revoke execute on function public.update_member(uuid, jsonb) from public, anon;
grant  execute on function public.update_member(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Mitgliedschaft aendern
-- ---------------------------------------------------------------------------
create or replace function public.update_membership(p_membership_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_erlaubt constant text[] := array[
    'number', 'started_on', 'notes', 'cancellation_date', 'cancellation_reason'];
  v_feld text;
begin
  if not private.is_admin() then
    raise exception 'Mitgliedschaften aendern duerfen nur Administratoren.'
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
$$;

revoke execute on function public.update_membership(uuid, jsonb) from public, anon;
grant  execute on function public.update_membership(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Rollen
--
-- Der letzte Admin darf sich die Rolle nicht nehmen. Ohne diese Sperre steht
-- der Verein vor einer App, die niemand mehr verwalten kann - reparierbar nur
-- noch mit Datenbankzugriff.
-- ---------------------------------------------------------------------------
create or replace function public.set_member_role(
  p_member_id uuid, p_role public.app_role, p_granted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uebrig integer;
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
    if p_role = 'admin'
       and not exists (select 1 from public.members
                        where id = p_member_id and auth_user_id is not null) then
      raise exception 'Nur Mitglieder mit Login koennen Administrator werden.'
        using errcode = 'invalid_parameter_value';
    end if;

    insert into public.member_roles (member_id, role, granted_by)
    values (p_member_id, p_role, private.current_member_id())
    on conflict do nothing;
  else
    if p_role = 'admin' then
      select count(*) into v_uebrig
      from public.member_roles
      where role = 'admin' and member_id <> p_member_id;

      if v_uebrig = 0 then
        raise exception 'Der letzte Administrator kann die Rolle nicht abgeben. '
                        'Bitte zuerst eine weitere Person zum Administrator machen.'
          using errcode = 'check_violation';
      end if;
    end if;

    delete from public.member_roles where member_id = p_member_id and role = p_role;
  end if;
end;
$$;

revoke execute on function public.set_member_role(uuid, public.app_role, boolean) from public, anon;
grant  execute on function public.set_member_role(uuid, public.app_role, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Zahler zuweisen
-- ---------------------------------------------------------------------------
-- p_payer_id hat einen Default, damit "zahlt selbst" ausdrueckbar bleibt:
-- ohne ihn erzeugt die Typgenerierung einen Pflichtparameter, dem sich kein
-- null uebergeben laesst.
create or replace function public.set_billing_payer(p_member_id uuid, p_payer_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Den Zahler aendern duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if p_payer_id is not null
     and not exists (select 1 from public.members
                      where id = p_payer_id and status <> 'archived') then
    raise exception 'Der gewaehlte Zahler existiert nicht oder ist archiviert.'
      using errcode = 'invalid_parameter_value';
  end if;

  perform private.zahlerkette_prueft(p_member_id, p_payer_id);

  update public.members set billing_payer_id = p_payer_id where id = p_member_id;
end;
$$;

revoke execute on function public.set_billing_payer(uuid, uuid) from public, anon;
grant  execute on function public.set_billing_payer(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Beitragsarten
-- ---------------------------------------------------------------------------
create or replace function public.set_member_fee(
  p_member_id uuid, p_fee_type_id uuid, p_year integer,
  p_override_amount_cents integer default null, p_note text default null)
returns table (already_charged boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Beitragsarten zuordnen duerfen nur Administratoren.'
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
$$;

revoke execute on function public.set_member_fee(uuid, uuid, integer, integer, text) from public, anon;
grant  execute on function public.set_member_fee(uuid, uuid, integer, integer, text) to authenticated;

create or replace function public.remove_member_fee(
  p_member_id uuid, p_fee_type_id uuid, p_year integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Beitragsarten entfernen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.member_fees
  where member_id = p_member_id and fee_type_id = p_fee_type_id and year = p_year;
end;
$$;

revoke execute on function public.remove_member_fee(uuid, uuid, integer) from public, anon;
grant  execute on function public.remove_member_fee(uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Mitgliedschaft beenden
--
-- Gibt Kennzahlen zurueck, damit die Oberflaeche sagen kann, was noch offen
-- ist. Ein Austritt loescht keine Schulden.
-- ---------------------------------------------------------------------------
create or replace function public.end_membership(
  p_member_id         uuid,
  p_ended_on          date default current_date,
  p_cancellation_date date default null,
  p_reason            text default null,
  p_set_inactive      boolean default true)
returns table (open_charges integer, open_amount_cents integer, future_bookings integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ms public.memberships;
begin
  if not private.is_admin() then
    raise exception 'Mitgliedschaften beenden duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
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
    cancellation_date   = coalesce(p_cancellation_date, current_date),
    cancellation_reason = nullif(btrim(coalesce(p_reason, '')), ''),
    status              = 'ended'
  where id = v_ms.id;

  if p_set_inactive then
    update public.members set status = 'inactive' where id = p_member_id;
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
$$;

revoke execute on function public.end_membership(uuid, date, date, text, boolean) from public, anon;
grant  execute on function public.end_membership(uuid, date, date, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Wiedereintritt
-- ---------------------------------------------------------------------------
create or replace function public.reactivate_membership(
  p_member_id uuid,
  p_started_on date default current_date,
  p_number text default null,
  p_fee_type_ids uuid[] default '{}')
returns text
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke execute on function public.reactivate_membership(uuid, date, text, uuid[]) from public, anon;
grant  execute on function public.reactivate_membership(uuid, date, text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Archivieren
--
-- Der Regelfall beim Austritt. Zweistufig wie preview_series/create_series:
-- ohne p_force bricht es ab, solange Forderungen offen sind, und nennt die
-- Zahlen. Offene Forderungen werden NICHT angefasst - Schulden verschwinden
-- nicht dadurch, dass jemand den Verein verlaesst.
-- ---------------------------------------------------------------------------
create or replace function public.archive_member(
  p_member_id uuid, p_force boolean default false, p_reason text default null)
returns table (cancelled_bookings integer, open_charges integer,
               open_amount_cents integer, released_payees integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ich      uuid := private.current_member_id();
  v_offen    integer;
  v_betrag   integer;
  v_gecancelt integer := 0;
  v_geloest   integer := 0;
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

  -- Wer von dieser Person bezahlt wurde, zahlt ab jetzt selbst.
  update public.members set billing_payer_id = null where billing_payer_id = p_member_id;
  get diagnostics v_geloest = row_count;

  update public.members set
    status = 'archived',
    notes = case when nullif(btrim(coalesce(p_reason, '')), '') is null then notes
                 else coalesce(notes || E'\n', '') || 'Archiviert: ' || btrim(p_reason) end
  where id = p_member_id;

  return query select v_gecancelt, v_offen, v_betrag, v_geloest;
end;
$$;

revoke execute on function public.archive_member(uuid, boolean, text) from public, anon;
grant  execute on function public.archive_member(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Was haengt an diesem Mitglied?
--
-- Die Vorschau vor dem Loeschen. Rein lesend - sie aendert nichts und darf
-- deshalb bedenkenlos beim Oeffnen der Seite laufen.
-- ---------------------------------------------------------------------------
create or replace function public.member_delete_impact(p_member_id uuid)
returns table (
  charges integer, drink_purchases integer, bookings integer,
  booking_players integer, work_duty_entries integer,
  mandates integer, bank_accounts integer, payees integer,
  can_delete boolean, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_charges integer; v_drinks integer; v_bookings integer; v_player integer;
  v_duty integer; v_mandate integer; v_konten integer; v_payees integer;
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
  select count(*)::integer into v_payees from public.members where billing_payer_id = p_member_id;

  return query select
    v_charges, v_drinks, v_bookings, v_player, v_duty, v_mandate, v_konten, v_payees,
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
-- Loeschen
--
-- Fuer Fehleingaben, Dubletten und Testdatensaetze. Endgueltig, ohne
-- Papierkorb - deshalb die Tippbestaetigung statt eines zweiten Klicks.
--
-- Die Pruefung auf Finanzhistorie ist die freundliche Fassung dessen, was die
-- Fremdschluessel ohnehin erzwingen: charges, drink_purchases, bookings und
-- booking_players stehen auf "on delete restrict". Ohne diese Pruefung
-- bekaeme der Vorstand eine rohe Constraint-Meldung zu sehen.
-- ---------------------------------------------------------------------------
create or replace function public.delete_member(p_member_id uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m      public.members;
  v_impact record;
begin
  if not private.is_admin() then
    raise exception 'Mitglieder loeschen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_member_id = private.current_member_id() then
    raise exception 'Du kannst dich nicht selbst loeschen.'
      using errcode = 'check_violation';
  end if;

  select * into v_m from public.members where id = p_member_id;
  if not found then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if lower(btrim(coalesce(p_confirm_name, ''))) is distinct from lower(btrim(v_m.last_name)) then
    raise exception 'Zum Loeschen bitte den Nachnamen zur Bestaetigung eingeben.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_impact from public.member_delete_impact(p_member_id);

  if not v_impact.can_delete then
    raise exception 'Zu diesem Mitglied gibt es % Forderungen, % Getraenkebuchungen und % Platzbuchungen. '
                    'Ein Loeschen wuerde die Buchhaltung zerreissen - bitte archivieren oder anonymisieren.',
      v_impact.charges, v_impact.drink_purchases, v_impact.bookings
      using errcode = 'check_violation';
  end if;

  -- Wer von dieser Person bezahlt wurde, zahlt ab jetzt selbst. Ohne das
  -- griffe zwar "on delete set null", aber ohne Protokolleintrag.
  update public.members set billing_payer_id = null where billing_payer_id = p_member_id;

  delete from public.members where id = p_member_id;
end;
$$;

revoke execute on function public.delete_member(uuid, text) from public, anon;
grant  execute on function public.delete_member(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Anonymisieren
--
-- Der Weg fuer einen Loeschwunsch nach Art. 17 DSGVO, wenn die Buchhaltung die
-- Daten nach § 147 AO zehn Jahre aufbewahren muss. Betraege und Buchungen
-- bleiben stehen, tragen aber keinen Klarnamen mehr.
--
-- Nicht umkehrbar.
-- ---------------------------------------------------------------------------
create or replace function public.anonymize_member(p_member_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

  -- Mandate und Bankverbindungen zuerst: sie enthalten die sensibelsten Daten.
  update public.sepa_mandates
     set status = 'revoked', revoked_on = coalesce(revoked_on, current_date)
   where member_id = p_member_id and status = 'active';
  delete from public.bank_accounts where member_id = p_member_id;
  -- Die Merkmalswerte kommen mit der Merkmale-Migration hinzu; sie erweitert
  -- diese Funktion dann um ihr eigenes delete.

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
    notes = 'Anonymisiert am ' || to_char(current_date, 'DD.MM.YYYY')
            || coalesce(': ' || nullif(btrim(coalesce(p_reason, '')), ''), '')
  where id = p_member_id;

  delete from public.member_roles where member_id = p_member_id and role = 'admin';
  update public.members set billing_payer_id = null where billing_payer_id = p_member_id;
end;
$$;

revoke execute on function public.anonymize_member(uuid, text) from public, anon;
grant  execute on function public.anonymize_member(uuid, text) to authenticated;
