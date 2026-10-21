-- ===========================================================================
-- Zugang endet mit der Mitgliedschaft (Befunde S12, B3, B4, B5)
--
-- Bisher prueften current_member_id(), is_member(), is_admin(), has_role()
-- und darf_plaetze() nur, ob zum Login ein Mitglied gehoert. Archivierte,
-- gesperrte und ausgetretene Mitglieder behielten damit vollen Zugang, ein
-- ausgeschiedener Vorstand sah weiter IBANs.
--
-- Wer Zugang hat (private.hat_zugang):
--
--   - nicht archiviert,
--   - kein Sperrvermerk (login_disabled_at),
--   - und entweder Status aktiv oder eine Mitgliedschaft, deren
--     Austrittsdatum heute oder spaeter liegt. end_membership setzt den
--     Status sofort auf inaktiv, auch bei einem Austritt zum Jahresende. Bis
--     einschliesslich zum Austrittsdatum ist man aber Mitglied, zahlt und
--     spielt. Danach endet der Zugang ohne Zutun, ohne Cron.
--
-- Die Pruefung sitzt in allen fuenf Rechtefunktionen, auch in
-- current_member_id(). Damit greifen alle Policies und RPCs, die ueber die
-- eigene Mitglieds-ID gehen, fuer Ausgeschiedene nicht mehr: auch das Lesen
-- der eigenen Daten nicht. Das ist gewollt. Auskunft nach Art. 15 DSGVO gibt
-- der Verein auf Anfrage, ein Selbstbedienungszugang ist dafuer nicht
-- vorgeschrieben. Kiosk-Geraete haben kein Mitglied und haengen an
-- is_kiosk(); das bleibt unberuehrt. Onboarding-Konten sind aktiv und
-- behalten current_member_id().
--
-- Die Pruefung liest die Datenbank bei jeder Anfrage. Ein noch gueltiges JWT
-- (bis 1 h) hilft deshalb nicht weiter (S19).
--
-- Dazu:
--
--   - archive_member setzt den Sperrvermerk. Den Bann im Auth-Konto setzt
--     das Web danach ueber member-login (login_deaktivieren), denn SQL
--     erreicht auth.users nicht ueber die Admin-API.
--   - archive_member raeumt auf (B4): Gastgebuehren der abgesagten
--     Buchungen, Mitspielerplaetze in fremden Buchungen, Anmeldungen und
--     Wartelistenplaetze kuenftiger Veranstaltungen.
--   - archive_member nimmt das Mitglied aus Einzuegen, deren Datei noch
--     nicht erzeugt ist (B5). Das Mandat ist danach widerrufen.
--   - event_nachruecken laesst Archivierte aus, auch wenn sie auf einem
--     anderen Weg (update_member) archiviert wurden.
--   - end_membership nimmt bei einem Austritt zu heute oder frueher die
--     Rollen. Bei einem kuenftigen Datum bleiben sie bis dahin, danach greift
--     hat_zugang. Sich selbst austragen geht nicht, wie beim Archivieren.
--   - reactivate_membership gibt alte Rollen nicht automatisch zurueck.
--
-- Abwaertskompatibel: Signaturen und Rueckgaben bleiben gleich.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Wer Zugang hat
-- ---------------------------------------------------------------------------
create or replace function private.hat_zugang(m public.members)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select m.status <> 'archived'
     and m.login_disabled_at is null
     and (m.status = 'active'
          or exists (select 1 from public.memberships ms
                      where ms.member_id = m.id
                        and (ms.ended_on is null or ms.ended_on >= private.heute())));
$$;

comment on function private.hat_zugang(public.members) is
  'Nicht archiviert, nicht gesperrt und Mitglied: aktiv oder Austrittsdatum heute oder spaeter. '
  'Grundlage von current_member_id(), is_member(), is_admin(), has_role() und darf_plaetze().';

-- Nur fuer die Rechtefunktionen, die als Eigentuemer laufen.
revoke execute on function private.hat_zugang(public.members) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Die Rechtefunktionen
-- ---------------------------------------------------------------------------
create or replace function private.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.members m
  where m.auth_user_id = (select auth.uid())
    and private.hat_zugang(m);
$$;

create or replace function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.auth_user_id = (select auth.uid())
      and m.onboarding_completed_at is not null
      and private.hat_zugang(m)
  );
$$;
comment on function private.is_member() is
  'Angemeldet, Mitglied mit Zugang (hat_zugang) und Onboarding abgeschlossen. Basis der vereinsweiten Lese-Policies.';

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_roles mr
    join public.members m on m.id = mr.member_id
    where m.auth_user_id = (select auth.uid())
      and mr.role in ('admin'::public.app_role, 'board'::public.app_role)
      and private.hat_zugang(m)
  );
$$;

create or replace function private.has_role(p_role public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_roles mr
    join public.members m on m.id = mr.member_id
    where m.auth_user_id = (select auth.uid()) and mr.role = p_role
      and private.hat_zugang(m)
  );
$$;

create or replace function private.darf_plaetze()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member_roles mr
    join public.members m on m.id = mr.member_id
    where m.auth_user_id = (select auth.uid())
      and mr.role in ('admin'::public.app_role, 'board'::public.app_role,
                      'groundskeeper'::public.app_role)
      and private.hat_zugang(m)
  );
$$;

-- ---------------------------------------------------------------------------
-- Nachruecken: Archivierte bleiben aussen vor
-- ---------------------------------------------------------------------------
create or replace function private.event_nachruecken(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  w record;
  v_belegt integer;
  v_anzahl integer := 0;
begin
  select * into e from public.events where id = p_event_id;
  if e.status <> 'published' or not e.registration_enabled or now() >= private.event_schluss(e) then
    return 0;
  end if;

  v_belegt := private.event_belegt(p_event_id);

  for w in
    select r.id, 1 + r.companions as personen
    from public.event_registrations r
    join public.members m on m.id = r.member_id
    where r.event_id = p_event_id and r.status = 'waitlisted'
      and m.status <> 'archived'
    order by r.waitlisted_at, r.registered_at
  loop
    if e.max_participants is null or v_belegt + w.personen <= e.max_participants then
      update public.event_registrations
         set status = 'registered', waitlisted_at = null
       where id = w.id;
      perform private.event_forderung_abgleichen(w.id);
      v_belegt := v_belegt + w.personen;
      v_anzahl := v_anzahl + 1;
    end if;
  end loop;

  return v_anzahl;
end; $$;

-- ---------------------------------------------------------------------------
-- Archivieren: sperren und aufraeumen
-- ---------------------------------------------------------------------------
create or replace function public.archive_member(
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
$$;

-- ---------------------------------------------------------------------------
-- Austreten: Rollen enden mit dem Austrittsdatum
-- ---------------------------------------------------------------------------
create or replace function public.end_membership(
  p_member_id uuid,
  p_ended_on date default current_date,
  p_cancellation_date date default null,
  p_reason text default null,
  p_set_inactive boolean default true)
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
    cancellation_date   = coalesce(p_cancellation_date, current_date),
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
$$;

-- ---------------------------------------------------------------------------
-- Wiedereintritt: ohne die alten Rollen
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
$$;
