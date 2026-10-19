-- ===========================================================================
-- Veranstaltungen: Arbeitsdienste, Feste und Termine
--
-- Der Vorstand legt Veranstaltungen an, Mitglieder melden sich an (optional
-- mit Begleitpersonen und Bemerkung). Wer keinen Platz mehr bekommt, landet
-- auf der Warteliste und rueckt bei einer Absage automatisch nach.
--
-- Gebuehren gehen direkt in die Kasse:
--
--   Anmeldung -> Forderung (Art 'event', Preis x Personen), sofort im Konto
--   Begleitpersonen aendern vor dem Anmeldeschluss -> Forderung passt sich an
--   Abmeldung vor dem Anmeldeschluss -> Forderung verschwindet
--   ab dem Anmeldeschluss -> Forderung steht fest, Abmeldung kostet trotzdem,
--                            und sie erscheint unter "Einzug vorbereiten"
--
-- Steckt eine Forderung in einem Einzug, aendert keine Korrektur sie mehr;
-- dann bleibt nur das Erlassen in der Kasse wie bei jeder anderen Forderung.
-- Ohne Anmeldeschluss gilt der Beginn als Schluss. Es gibt keinen Job, der
-- zum Schluss etwas umstellt: alles ergibt sich aus dem Datumsvergleich.
--
-- Arbeitsdienste: Der Vorstand hakt die Anwesenden ab und schreibt ihnen die
-- Stunden gut. Daraus werden bestaetigte work_duty_entries mit Bezug zur
-- Veranstaltung; ein Teilindex verhindert die doppelte Gutschrift.
--
-- Abwaertskompatibel: neue Tabellen und Spalten. einzug_gruppen bekommt zwei
-- Spalten dazu, einzug_forderungen versteht zusaetzlich "event" in der
-- Auswahl. Alte Clients senden das nicht und sehen dieselben Gruppen wie
-- vorher.
-- ===========================================================================

create type public.event_kind as enum ('arbeitsdienst', 'fest', 'termin');
create type public.event_status as enum ('draft', 'published', 'cancelled');
create type public.event_registration_status as enum ('registered', 'waitlisted', 'cancelled');

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table public.events (
  id                    uuid primary key default gen_random_uuid(),
  kind                  public.event_kind not null,
  title                 text not null,
  description           text,
  location              text,
  starts_at             timestamptz not null,
  ends_at               timestamptz,
  -- Abgeschlossen ist keine Spalte: das ergibt sich aus Ende bzw. Beginn.
  status                public.event_status not null default 'draft',

  registration_enabled  boolean not null default false,
  -- Ohne Angabe gilt der Beginn als Anmeldeschluss.
  registration_deadline timestamptz,
  -- Personen, Begleitpersonen eingerechnet. Null = unbegrenzt.
  max_participants      integer,
  companions_allowed    boolean not null default false,
  -- Pro Person, gilt auch fuer Begleitpersonen. Null = keine Gebuehr.
  fee_cents             integer,
  -- Nur Arbeitsdienst: Stunden, die jede Teilnahme gutgeschrieben bekommt.
  work_hours            numeric(6, 2),

  published_at          timestamptz,
  cancelled_at          timestamptz,
  created_by            uuid references public.members (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint events_title_not_blank check (btrim(title) <> ''),
  constraint events_end_after_start check (ends_at is null or ends_at >= starts_at),
  constraint events_deadline_before_start
    check (registration_deadline is null or registration_deadline <= starts_at),
  constraint events_max_positive check (max_participants is null or max_participants >= 1),
  constraint events_fee_range check (fee_cents is null or fee_cents between 0 and 100000),
  constraint events_hours_range check (work_hours is null or (work_hours > 0 and work_hours <= 24)),
  constraint events_hours_only_work_duty check (work_hours is null or kind = 'arbeitsdienst'),
  constraint events_registration_fields check (
    registration_enabled
    or (registration_deadline is null and max_participants is null
        and fee_cents is null and not companions_allowed)
  )
);

comment on table public.events is
  'Veranstaltungen des Vereins: Arbeitsdienste, Feste, Termine. Schreiben nur ueber die RPCs.';

create index events_starts_at_idx on public.events (starts_at);
create index events_created_by_idx on public.events (created_by);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function extensions.moddatetime (updated_at);

create table public.event_registrations (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  member_id     uuid not null references public.members (id) on delete cascade,
  companions    integer not null default 0,
  note          text,
  status        public.event_registration_status not null default 'registered',
  attended      boolean not null default false,

  registered_at timestamptz not null default now(),
  -- Reihenfolge der Warteliste: wer zuerst kam, rueckt zuerst nach.
  waitlisted_at timestamptz,
  cancelled_at  timestamptz,
  updated_at    timestamptz not null default now(),

  constraint event_registrations_one_per_member unique (event_id, member_id),
  constraint event_registrations_companions_range check (companions between 0 and 20),
  constraint event_registrations_note_length check (note is null or char_length(note) <= 500)
);

comment on table public.event_registrations is
  'Anmeldungen zu Veranstaltungen. Mitglieder sehen nur die eigene, Namen anderer nie.';

create index event_registrations_member_idx on public.event_registrations (member_id);
create index event_registrations_event_status_idx on public.event_registrations (event_id, status);

create trigger event_registrations_set_updated_at
  before update on public.event_registrations
  for each row execute function extensions.moddatetime (updated_at);

-- Forderung zur Veranstaltung. period_label bleibt null: Zeitraum ist hier
-- kein Begriff, und ein Konto zeigt period_label hinter der Art an.
alter table public.charges
  add column event_id uuid references public.events (id) on delete restrict;

create index charges_event_idx on public.charges (event_id) where (event_id is not null);

-- Eine Forderung je Mitglied und Veranstaltung, wie charges_one_per_member_kind_period.
create unique index charges_one_per_member_event
  on public.charges (member_id, event_id)
  where (event_id is not null and status <> 'waived');

comment on column public.charges.event_id is
  'Veranstaltung, deren Teilnahmegebuehr diese Forderung ist.';

-- Gutschrift aus einem Arbeitsdienst. Je Mitglied und Veranstaltung hoechstens eine.
alter table public.work_duty_entries
  add column event_id uuid references public.events (id) on delete restrict;

create unique index work_duty_entries_one_per_event
  on public.work_duty_entries (member_id, event_id)
  where (event_id is not null);

create index work_duty_entries_event_idx on public.work_duty_entries (event_id)
  where (event_id is not null);

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------

alter table public.events enable row level security;
alter table public.event_registrations enable row level security;

revoke all on public.events from anon;
revoke all on public.event_registrations from anon;
revoke insert, update, delete, truncate on public.events from authenticated;
revoke insert, update, delete, truncate on public.event_registrations from authenticated;
grant select on public.events to authenticated;
grant select on public.event_registrations to authenticated;

-- Entwuerfe sieht nur der Vorstand.
create policy events_select on public.events for select to authenticated
  using ((select private.is_admin()) or ((select private.is_member()) and status <> 'draft'));

-- Die eigene Anmeldung, sonst nichts: wer sonst kommt, bleibt verborgen.
create policy event_registrations_select on public.event_registrations for select to authenticated
  using (member_id = (select private.current_member_id()) or (select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Helfer
-- ---------------------------------------------------------------------------

/** Ab wann eine Anmeldung feststeht: Anmeldeschluss, sonst Beginn. */
create or replace function private.event_schluss(e public.events)
returns timestamptz language sql immutable set search_path = '' as $$
  select coalesce(e.registration_deadline, e.starts_at);
$$;

/** Angemeldete Personen, Begleitpersonen eingerechnet. */
create or replace function private.event_belegt(p_event_id uuid)
returns integer language sql stable set search_path = '' as $$
  select coalesce(sum(1 + r.companions), 0)::integer
  from public.event_registrations r
  where r.event_id = p_event_id and r.status = 'registered';
$$;

/**
 * Laesst sich die Forderung noch aendern?
 *
 * Nein, sobald sie in einem Einzug steckt oder darueber hinaus ist. Ein
 * Posten im Einzug verweist mit "on delete restrict" auf sie; auch ein
 * zurueckgebuchter Posten ist Teil eines Belegs.
 */
create or replace function private.forderung_gesperrt(c public.charges)
returns boolean language sql stable set search_path = '' as $$
  select c.status not in ('open', 'notified')
      or exists (select 1 from public.debit_items di where di.charge_id = c.id);
$$;

/**
 * Die Forderung einer Anmeldung auf den Stand bringen.
 *
 * Soll: angemeldet, Veranstaltung nicht abgesagt, Gebuehr > 0 ergibt
 * Preis x (1 + Begleitpersonen), sonst keine Forderung. Eine erlassene
 * Forderung bleibt erlassen; es entsteht dann keine neue.
 *
 * Steckt die Forderung schon in einem Einzug und der Betrag muesste sich
 * aendern, bricht der ganze Vorgang ab. Nur die Beschreibung (etwa nach einer
 * Umbenennung) bleibt dann einfach stehen.
 */
create or replace function private.event_forderung_abgleichen(p_registration_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
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
        'Die Forderung steckt schon in einem Einzug und laesst sich nicht mehr aendern. Erlassen geht weiterhin in der Kasse.'
        using errcode = 'invalid_parameter_value';
    end if;
    return;
  end if;

  if v_soll = 0 then
    delete from public.charges where id = c.id;
  elsif c.amount_cents <> v_soll or c.description <> v_text then
    update public.charges set amount_cents = v_soll, description = v_text where id = c.id;
  end if;
end; $$;

/**
 * Die Warteliste nachruecken lassen, soweit Plaetze frei sind.
 *
 * In Reihenfolge der Warteliste rueckt nach, wer mit seiner Personenzahl
 * passt; Plaetze bleiben nicht ungenutzt, nur weil der Erste eine grosse
 * Gruppe ist. Nur bis zum Anmeldeschluss: danach steht die Teilnehmerzahl
 * fest (das Essen ist bestellt), der Vorstand kann aber selbst nachtragen.
 *
 * Rueckgabe: wie viele nachgerueckt sind.
 */
create or replace function private.event_nachruecken(p_event_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
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
    where r.event_id = p_event_id and r.status = 'waitlisted'
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

revoke execute on function private.event_forderung_abgleichen(uuid) from public, anon, authenticated;
revoke execute on function private.event_nachruecken(uuid) from public, anon, authenticated;

create or replace function private.pruefe_event_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Veranstaltungen verwalten duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
end; $$;

revoke execute on function private.pruefe_event_admin() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verwaltung: Veranstaltungen
-- ---------------------------------------------------------------------------

/**
 * Eine Veranstaltung anlegen oder aendern.
 *
 * Neu angelegt ist sie ein Entwurf; p_veroeffentlichen macht sie sofort
 * sichtbar. Zurueck zum Entwurf geht es nicht, sobald Mitglieder sie gesehen
 * haben koennten.
 *
 * Bei bestehenden Anmeldungen schuetzt die Funktion, was schon zugesagt ist:
 * keine Anmeldung abschalten, keine Plaetze unter die Belegung senken, keine
 * Begleitpersonen verbieten, die schon angemeldet sind. Eine neue Gebuehr
 * wird vor dem Anmeldeschluss in alle Forderungen uebernommen, danach ist sie
 * fest. Mehr Plaetze lassen die Warteliste nachruecken.
 */
create or replace function public.event_speichern(
  p_id uuid,
  p_kind public.event_kind,
  p_title text,
  p_description text,
  p_location text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_registration_enabled boolean,
  p_registration_deadline timestamptz,
  p_max_participants integer,
  p_companions_allowed boolean,
  p_fee_cents integer,
  p_work_hours numeric,
  p_veroeffentlichen boolean default false
)
returns uuid language plpgsql security definer set search_path = '' as $$
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
    raise exception 'Bitte eine Art waehlen.' using errcode = 'invalid_parameter_value';
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
    raise exception 'Die Gebuehr muss zwischen 0,00 und 1000,00 Euro liegen.'
      using errcode = 'invalid_parameter_value';
  end if;
  if not v_anmeldung and v_fee is not null then
    raise exception 'Eine Gebuehr gibt es nur mit Anmeldung.' using errcode = 'invalid_parameter_value';
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
    raise exception 'Eine abgesagte Veranstaltung laesst sich nicht mehr bearbeiten.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_belegt := private.event_belegt(p_id);

  if exists (select 1 from public.event_registrations
              where event_id = p_id and status <> 'cancelled') then
    if not v_anmeldung then
      raise exception 'Es gibt schon Anmeldungen. Die Anmeldung laesst sich nicht mehr abschalten.'
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
    raise exception 'Es sind schon % Personen angemeldet. Weniger Plaetze gehen nicht.', v_belegt
      using errcode = 'invalid_parameter_value';
  end if;
  if v_fee is distinct from alt.fee_cents
     and now() >= private.event_schluss(alt)
     and exists (select 1 from public.event_registrations
                  where event_id = p_id and status = 'registered') then
    raise exception 'Der Anmeldeschluss ist vorbei. Die Gebuehr steht fest und laesst sich nicht mehr aendern.'
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
end; $$;

revoke execute on function public.event_speichern(
  uuid, public.event_kind, text, text, text, timestamptz, timestamptz, boolean,
  timestamptz, integer, boolean, integer, numeric, boolean) from public, anon;
grant execute on function public.event_speichern(
  uuid, public.event_kind, text, text, text, timestamptz, timestamptz, boolean,
  timestamptz, integer, boolean, integer, numeric, boolean) to authenticated;

/** Einen Entwurf veroeffentlichen. */
create or replace function public.event_veroeffentlichen(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.pruefe_event_admin();
  update public.events set status = 'published', published_at = now()
   where id = p_id and status = 'draft';
  if not found then
    raise exception 'Nur ein Entwurf laesst sich veroeffentlichen.' using errcode = 'invalid_parameter_value';
  end if;
end; $$;

revoke execute on function public.event_veroeffentlichen(uuid) from public, anon;
grant  execute on function public.event_veroeffentlichen(uuid) to authenticated;

/**
 * Eine Veranstaltung absagen.
 *
 * Alle Forderungen, die noch in keinem Einzug stecken, verschwinden. Was
 * schon eingezogen wird, bleibt stehen: das erstattet oder erlaesst der
 * Vorstand in der Kasse. Die Anmeldungen bleiben als Beleg, wer dabei war.
 */
create or replace function public.event_absagen(p_id uuid)
returns table (geloescht integer, verbleibend integer)
language plpgsql security definer set search_path = '' as $$
declare v_status public.event_status; v_geloescht integer; v_rest integer;
begin
  perform private.pruefe_event_admin();

  select status into v_status from public.events where id = p_id for update;
  if v_status is null then
    raise exception 'Diese Veranstaltung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if v_status = 'cancelled' then
    raise exception 'Diese Veranstaltung ist schon abgesagt.' using errcode = 'invalid_parameter_value';
  end if;

  update public.events set status = 'cancelled', cancelled_at = now() where id = p_id;

  with weg as (
    delete from public.charges c
     where c.event_id = p_id and c.status <> 'waived' and not private.forderung_gesperrt(c)
    returning 1
  )
  select count(*)::integer into v_geloescht from weg;

  select count(*)::integer into v_rest
  from public.charges c where c.event_id = p_id and c.status <> 'waived';

  return query select v_geloescht, v_rest;
end; $$;

revoke execute on function public.event_absagen(uuid) from public, anon;
grant  execute on function public.event_absagen(uuid) to authenticated;

/** Einen Entwurf ohne Anmeldungen loeschen. Alles andere ist ein Beleg. */
create or replace function public.event_loeschen(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.pruefe_event_admin();
  if not exists (select 1 from public.events where id = p_id and status = 'draft')
     or exists (select 1 from public.event_registrations where event_id = p_id) then
    raise exception 'Nur ein Entwurf ohne Anmeldungen laesst sich loeschen.'
      using errcode = 'invalid_parameter_value';
  end if;
  delete from public.events where id = p_id;
end; $$;

revoke execute on function public.event_loeschen(uuid) from public, anon;
grant  execute on function public.event_loeschen(uuid) to authenticated;

/**
 * Alle Veranstaltungen mit den Zahlen fuer Liste, Detail und "Zu tun".
 *
 * einziehbar zaehlt, was jetzt in einen Einzug koennte - also erst ab dem
 * Anmeldeschluss. offene_stunden zaehlt Anwesende eines Arbeitsdienstes, die
 * noch keine Gutschrift haben.
 */
create or replace function public.event_verwaltung()
returns table (
  id uuid, kind public.event_kind, title text, description text, location text,
  starts_at timestamptz, ends_at timestamptz, status public.event_status,
  registration_enabled boolean, registration_deadline timestamptz,
  max_participants integer, companions_allowed boolean, fee_cents integer, work_hours numeric,
  created_at timestamptz, published_at timestamptz, cancelled_at timestamptz,
  anmeldungen integer, personen integer, begleitpersonen integer, warteliste integer,
  abgemeldet integer, forderungen integer, forderungen_cents integer,
  im_einzug integer, einziehbar integer, einziehbar_cents integer,
  anwesend integer, gutgeschrieben integer
)
language sql stable security definer set search_path = '' as $$
  select
    e.id, e.kind, e.title, e.description, e.location, e.starts_at, e.ends_at, e.status,
    e.registration_enabled, e.registration_deadline, e.max_participants, e.companions_allowed,
    e.fee_cents, e.work_hours, e.created_at, e.published_at, e.cancelled_at,
    coalesce(r.anmeldungen, 0), coalesce(r.personen, 0), coalesce(r.begleitpersonen, 0),
    coalesce(r.warteliste, 0), coalesce(r.abgemeldet, 0),
    coalesce(f.anzahl, 0), coalesce(f.cents, 0), coalesce(f.im_einzug, 0),
    coalesce(f.einziehbar, 0), coalesce(f.einziehbar_cents, 0),
    coalesce(r.anwesend, 0), coalesce(g.anzahl, 0)
  from public.events e
  left join lateral (
    select
      count(*) filter (where x.status = 'registered')::integer as anmeldungen,
      coalesce(sum(1 + x.companions) filter (where x.status = 'registered'), 0)::integer as personen,
      coalesce(sum(x.companions) filter (where x.status = 'registered'), 0)::integer as begleitpersonen,
      count(*) filter (where x.status = 'waitlisted')::integer as warteliste,
      count(*) filter (where x.status = 'cancelled')::integer as abgemeldet,
      count(*) filter (where x.status = 'registered' and x.attended)::integer as anwesend
    from public.event_registrations x where x.event_id = e.id
  ) r on true
  left join lateral (
    select
      count(*)::integer as anzahl,
      coalesce(sum(c.amount_cents), 0)::integer as cents,
      count(*) filter (where private.forderung_gesperrt(c))::integer as im_einzug,
      count(*) filter (where private.einziehbar(c))::integer as einziehbar,
      coalesce(sum(c.amount_cents) filter (where private.einziehbar(c)), 0)::integer as einziehbar_cents
    from public.charges c where c.event_id = e.id and c.status <> 'waived'
  ) f on true
  left join lateral (
    select count(*)::integer as anzahl
    from public.work_duty_entries w where w.event_id = e.id
  ) g on true
  where private.is_admin()
  order by e.starts_at;
$$;

revoke execute on function public.event_verwaltung() from public, anon;
grant  execute on function public.event_verwaltung() to authenticated;

/** Die Teilnehmer einer Veranstaltung mit Forderung und Gutschrift. */
create or replace function public.event_teilnehmer(p_event_id uuid)
returns table (
  registration_id uuid, member_id uuid, member_name text, companions integer, note text,
  status public.event_registration_status, attended boolean,
  registered_at timestamptz, waitlisted_at timestamptz, cancelled_at timestamptz,
  charge_id uuid, charge_cents integer, charge_status public.charge_status,
  charge_gesperrt boolean, gutgeschrieben boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.pruefe_event_admin();

  return query
  select r.id, r.member_id,
         btrim(coalesce(m.last_name, '') || ', ' || coalesce(m.first_name, ''), ', '),
         r.companions, r.note, r.status, r.attended,
         r.registered_at, r.waitlisted_at, r.cancelled_at,
         c.id, c.amount_cents, c.status,
         case when c.id is null then false else private.forderung_gesperrt(c) end,
         exists (select 1 from public.work_duty_entries w
                  where w.event_id = r.event_id and w.member_id = r.member_id)
  from public.event_registrations r
  join public.members m on m.id = r.member_id
  left join public.charges c
    on c.event_id = r.event_id and c.member_id = r.member_id and c.status <> 'waived'
  where r.event_id = p_event_id
  order by r.status, r.waitlisted_at nulls first, m.last_name, m.first_name;
end; $$;

revoke execute on function public.event_teilnehmer(uuid) from public, anon;
grant  execute on function public.event_teilnehmer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Verwaltung: Korrekturen an Anmeldungen
--
-- Der Vorstand darf mehr als das Mitglied: auch nach dem Anmeldeschluss und
-- ueber die Plaetze hinaus (wer beim Arbeitsdienst spontan mithilft, steht
-- danach auf der Liste). Die Forderung zieht immer mit, bis sie in einem
-- Einzug steckt.
-- ---------------------------------------------------------------------------

create or replace function public.event_admin_anmelden(
  p_event_id uuid, p_member_id uuid, p_companions integer default 0, p_note text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare e public.events; v_id uuid; v_status public.event_registration_status;
begin
  perform private.pruefe_event_admin();

  select * into e from public.events where id = p_event_id for update;
  if e.id is null then
    raise exception 'Diese Veranstaltung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if e.status <> 'published' then
    raise exception 'Anmelden geht nur bei einer veroeffentlichten Veranstaltung.'
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
end; $$;

revoke execute on function public.event_admin_anmelden(uuid, uuid, integer, text) from public, anon;
grant  execute on function public.event_admin_anmelden(uuid, uuid, integer, text) to authenticated;

create or replace function public.event_admin_aendern(
  p_registration_id uuid, p_companions integer, p_note text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.event_registrations; e public.events;
begin
  perform private.pruefe_event_admin();

  select * into r from public.event_registrations where id = p_registration_id;
  if r.id is null then
    raise exception 'Diese Anmeldung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  select * into e from public.events where id = r.event_id for update;
  if r.status = 'cancelled' then
    raise exception 'Diese Anmeldung ist abgemeldet. Bitte neu anmelden.'
      using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(p_companions, 0) < 0 or coalesce(p_companions, 0) > 20 then
    raise exception 'Begleitpersonen: zwischen 0 und 20.' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(p_companions, 0) > 0 and not e.companions_allowed then
    raise exception 'Bei dieser Veranstaltung sind keine Begleitpersonen vorgesehen.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.event_registrations
     set companions = coalesce(p_companions, 0),
         note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_registration_id;

  perform private.event_forderung_abgleichen(p_registration_id);
  perform private.event_nachruecken(r.event_id);
end; $$;

revoke execute on function public.event_admin_aendern(uuid, integer, text) from public, anon;
grant  execute on function public.event_admin_aendern(uuid, integer, text) to authenticated;

/** Abmelden durch den Vorstand: die Forderung verschwindet mit, auch nach dem Schluss. */
create or replace function public.event_admin_abmelden(p_registration_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.event_registrations;
begin
  perform private.pruefe_event_admin();

  select * into r from public.event_registrations where id = p_registration_id;
  if r.id is null then
    raise exception 'Diese Anmeldung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  perform 1 from public.events where id = r.event_id for update;
  if r.status = 'cancelled' then
    raise exception 'Diese Anmeldung ist schon abgemeldet.' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.work_duty_entries
              where event_id = r.event_id and member_id = r.member_id) then
    raise exception 'Die Stunden sind schon gutgeschrieben. Erst den Eintrag im Arbeitsdienst entfernen.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.event_registrations
     set status = 'cancelled', cancelled_at = now(), waitlisted_at = null, attended = false
   where id = p_registration_id;

  perform private.event_forderung_abgleichen(p_registration_id);
  perform private.event_nachruecken(r.event_id);
end; $$;

revoke execute on function public.event_admin_abmelden(uuid) from public, anon;
grant  execute on function public.event_admin_abmelden(uuid) to authenticated;

/** Anwesend abhaken, sobald die Veranstaltung begonnen hat. */
create or replace function public.event_anwesenheit_setzen(p_registration_id uuid, p_attended boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.event_registrations; e public.events;
begin
  perform private.pruefe_event_admin();

  select * into r from public.event_registrations where id = p_registration_id;
  if r.id is null then
    raise exception 'Diese Anmeldung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  select * into e from public.events where id = r.event_id;
  if r.status <> 'registered' then
    raise exception 'Anwesend sein kann nur, wer angemeldet ist.' using errcode = 'invalid_parameter_value';
  end if;
  if e.starts_at > now() then
    raise exception 'Die Veranstaltung hat noch nicht begonnen.' using errcode = 'invalid_parameter_value';
  end if;
  if not coalesce(p_attended, false) and exists (
    select 1 from public.work_duty_entries where event_id = r.event_id and member_id = r.member_id
  ) then
    raise exception 'Die Stunden sind schon gutgeschrieben. Erst den Eintrag im Arbeitsdienst entfernen.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.event_registrations set attended = coalesce(p_attended, false) where id = p_registration_id;
end; $$;

revoke execute on function public.event_anwesenheit_setzen(uuid, boolean) from public, anon;
grant  execute on function public.event_anwesenheit_setzen(uuid, boolean) to authenticated;

/**
 * Den Anwesenden eines Arbeitsdienstes die Stunden gutschreiben.
 *
 * Je Anwesendem ein bestaetigter Eintrag mit Bezug zur Veranstaltung. Wer
 * schon gutgeschrieben ist, wird uebersprungen - der Knopf darf beliebig oft
 * gedrueckt werden, etwa nachdem jemand nachtraeglich abgehakt wurde. Ist das
 * Jahr eines Mitglieds schon abgerechnet, wird es ebenfalls uebersprungen.
 */
create or replace function public.event_stunden_gutschreiben(p_event_id uuid)
returns table (gutgeschrieben integer, uebersprungen integer)
language plpgsql security definer set search_path = '' as $$
declare e public.events; v_tag date; v_jahr integer; v_neu integer; v_alle integer;
begin
  perform private.pruefe_event_admin();

  select * into e from public.events where id = p_event_id for update;
  if e.id is null then
    raise exception 'Diese Veranstaltung gibt es nicht.' using errcode = 'no_data_found';
  end if;
  if e.kind <> 'arbeitsdienst' or e.work_hours is null then
    raise exception 'Stunden gibt es nur bei einem Arbeitsdienst mit Stunden je Teilnahme.'
      using errcode = 'invalid_parameter_value';
  end if;
  if e.status = 'cancelled' then
    raise exception 'Die Veranstaltung ist abgesagt.' using errcode = 'invalid_parameter_value';
  end if;
  if e.starts_at > now() then
    raise exception 'Die Veranstaltung hat noch nicht begonnen.' using errcode = 'invalid_parameter_value';
  end if;

  v_tag := (e.starts_at at time zone 'Europe/Berlin')::date;
  v_jahr := extract(year from v_tag)::integer;

  select count(*)::integer into v_alle
  from public.event_registrations r
  where r.event_id = p_event_id and r.status = 'registered' and r.attended;

  with neu as (
    insert into public.work_duty_entries
      (member_id, year, hours, worked_on, description, confirmed_by, confirmed_at, created_by, event_id)
    select r.member_id, v_jahr, e.work_hours, v_tag, e.title,
           private.current_member_id(), now(), private.current_member_id(), e.id
    from public.event_registrations r
    where r.event_id = p_event_id and r.status = 'registered' and r.attended
      and not exists (select 1 from public.work_duty_settlements s
                       where s.member_id = r.member_id and s.year = v_jahr)
    on conflict (member_id, event_id) where (event_id is not null) do nothing
    returning 1
  )
  select count(*)::integer into v_neu from neu;

  return query select v_neu, v_alle - v_neu;
end; $$;

revoke execute on function public.event_stunden_gutschreiben(uuid) from public, anon;
grant  execute on function public.event_stunden_gutschreiben(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Mitglieder: anmelden, aendern, abmelden
-- ---------------------------------------------------------------------------

/**
 * Veroeffentlichte und abgesagte Veranstaltungen mit der eigenen Anmeldung.
 *
 * Von den anderen gibt es nur Zahlen: wie viele Personen kommen, wie viele
 * warten. Namen gehen nie heraus.
 */
create or replace function public.events_fuer_mitglied()
returns table (
  id uuid, kind public.event_kind, title text, description text, location text,
  starts_at timestamptz, ends_at timestamptz, status public.event_status,
  registration_enabled boolean, registration_deadline timestamptz,
  max_participants integer, companions_allowed boolean, fee_cents integer, work_hours numeric,
  personen integer, warteliste integer,
  mein_status public.event_registration_status, meine_begleitpersonen integer, meine_bemerkung text
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.kind, e.title, e.description, e.location, e.starts_at, e.ends_at, e.status,
         e.registration_enabled, e.registration_deadline, e.max_participants,
         e.companions_allowed, e.fee_cents, e.work_hours,
         private.event_belegt(e.id),
         (select count(*)::integer from public.event_registrations w
           where w.event_id = e.id and w.status = 'waitlisted'),
         mine.status, mine.companions, mine.note
  from public.events e
  left join public.event_registrations mine
    on mine.event_id = e.id and mine.member_id = private.current_member_id()
  where private.is_member() and e.status <> 'draft'
  order by e.starts_at;
$$;

revoke execute on function public.events_fuer_mitglied() from public, anon;
grant  execute on function public.events_fuer_mitglied() to authenticated;

/**
 * Sich anmelden. Rueckgabe: 'registered' oder 'waitlisted'.
 *
 * Passt die ganze Gruppe nicht mehr hinein, kommt sie auf die Warteliste;
 * eine halbe Anmeldung gibt es nicht. Die Veranstaltung wird dabei gesperrt,
 * damit zwei gleichzeitige Anmeldungen nicht beide den letzten Platz bekommen.
 */
create or replace function public.event_anmelden(
  p_event_id uuid, p_companions integer default 0, p_note text default null
)
returns public.event_registration_status
language plpgsql security definer set search_path = '' as $$
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
    raise exception 'Fuer diese Veranstaltung gibt es keine Anmeldung.' using errcode = 'invalid_parameter_value';
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
end; $$;

revoke execute on function public.event_anmelden(uuid, integer, text) from public, anon;
grant  execute on function public.event_anmelden(uuid, integer, text) to authenticated;

/**
 * Begleitpersonen und Bemerkung aendern, bis zum Anmeldeschluss.
 *
 * Mehr Personen als frei sind gibt es nicht; wer schon angemeldet ist, faellt
 * dadurch nicht auf die Warteliste zurueck. Weniger Personen machen Platz
 * fuer die Warteliste. Rueckgabe: der Status danach.
 */
create or replace function public.event_anmeldung_aendern(
  p_event_id uuid, p_companions integer, p_note text default null
)
returns public.event_registration_status
language plpgsql security definer set search_path = '' as $$
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
    raise exception 'Der Anmeldeschluss ist vorbei. Aenderungen bitte beim Vorstand melden.'
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
    raise exception 'Fuer so viele Personen sind keine Plaetze mehr frei.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.event_registrations
     set companions = v_neu, note = nullif(btrim(coalesce(p_note, '')), '')
   where id = r.id;

  perform private.event_forderung_abgleichen(r.id);
  perform private.event_nachruecken(p_event_id);

  return (select status from public.event_registrations where id = r.id);
end; $$;

revoke execute on function public.event_anmeldung_aendern(uuid, integer, text) from public, anon;
grant  execute on function public.event_anmeldung_aendern(uuid, integer, text) to authenticated;

/**
 * Sich abmelden, bis die Veranstaltung beginnt.
 *
 * Vor dem Anmeldeschluss verschwindet die Forderung, und die Warteliste
 * rueckt nach. Danach bleibt die Forderung stehen: der Platz war zugesagt.
 */
create or replace function public.event_abmelden(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.events; r public.event_registrations;
begin
  perform private.pruefe_freigeschaltet();

  select * into e from public.events where id = p_event_id for update;
  select * into r from public.event_registrations
   where event_id = p_event_id and member_id = private.current_member_id();
  if r.id is null or r.status = 'cancelled' or e.status = 'draft' then
    raise exception 'Du bist nicht angemeldet.' using errcode = 'no_data_found';
  end if;
  if e.starts_at <= now() then
    raise exception 'Die Veranstaltung hat schon begonnen.' using errcode = 'invalid_parameter_value';
  end if;

  update public.event_registrations
     set status = 'cancelled', cancelled_at = now(), waitlisted_at = null
   where id = r.id;

  if r.status = 'registered' and now() < private.event_schluss(e) then
    perform private.event_forderung_abgleichen(r.id);
    perform private.event_nachruecken(p_event_id);
  end if;
end; $$;

revoke execute on function public.event_abmelden(uuid) from public, anon;
grant  execute on function public.event_abmelden(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Kasse: Veranstaltungen im Einzug
-- ---------------------------------------------------------------------------

/**
 * Forderungen, die in einen Einzug koennen.
 *
 * Neu: eine Teilnahmegebuehr erst ab dem Anmeldeschluss. Bis dahin kann sie
 * sich noch aendern oder verschwinden.
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
     ));
$$;

/**
 * Die Gruppen, aus denen ein Einzug zusammengestellt wird.
 *
 * Neu: Veranstaltungen sind je eine Gruppe (event_id), mit ihrem Titel.
 */
drop function public.einzug_gruppen();

create function public.einzug_gruppen()
returns table (
  kind public.charge_kind, period_label text, ruecklaeufer boolean,
  anzahl integer, mitglieder integer, summe_cents integer,
  event_id uuid, titel text
)
language sql stable security definer set search_path = '' as $$
  select c.kind, c.period_label, c.status = 'returned',
         count(*)::integer,
         count(distinct c.payer_id)::integer,
         sum(c.amount_cents)::integer,
         c.event_id,
         max(e.title)
  from public.charges c
  left join public.events e on e.id = c.event_id
  where private.is_admin() and private.einziehbar(c)
  group by c.kind, c.period_label, c.event_id, c.status = 'returned'
  order by c.status = 'returned', c.kind, c.period_label desc nulls last, min(e.starts_at);
$$;

revoke execute on function public.einzug_gruppen() from public, anon;
grant  execute on function public.einzug_gruppen() to authenticated;

/**
 * Die Forderungen hinter einer Auswahl von Gruppen.
 *
 * p_gruppen: [{"kind": "event", "period": null, "returned": false, "event": "<uuid>"}, ...];
 * event fehlt bei allen anderen Arten und heisst dann "ohne Veranstaltung".
 */
create or replace function private.einzug_forderungen(p_gruppen jsonb)
returns setof uuid language sql stable set search_path = '' as $$
  select c.id
  from public.charges c
  join jsonb_to_recordset(coalesce(p_gruppen, '[]'::jsonb))
         as g(kind public.charge_kind, period text, returned boolean, event uuid)
    on c.kind = g.kind
   and c.period_label is not distinct from g.period
   and c.event_id is not distinct from g.event
   and (c.status = 'returned') = coalesce(g.returned, false)
  where private.einziehbar(c);
$$;
