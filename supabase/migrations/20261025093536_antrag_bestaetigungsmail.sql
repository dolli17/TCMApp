-- ===========================================================================
-- Mitgliedsantrag mit Bestaetigungsmail (S22)
--
-- Bisher galt ein Antrag mit dem Absenden. Der Deckel von zwanzig Antraegen
-- je Stunde liess sich so mit erfundenen Antraegen fuellen, und danach kam
-- kein echter mehr durch.
--
-- Jetzt ist ein Antrag erst einmal unbestaetigt. An die angegebene Adresse
-- geht ein Link; erst der Klick darauf macht ihn fuer die Verwaltung sichtbar
-- und benachrichtigt den Vorstand. Wer eine Adresse nicht lesen kann, kommt
-- ueber "unbestaetigt" nicht hinaus, und Unbestaetigtes zaehlt fuer den
-- globalen Deckel nicht mehr.
--
--   * Einreichen: public.begin_membership_application, nur fuer den
--     Dienstschluessel. Sie gibt das Token im Klartext zurueck, und das darf
--     nur die Edge Function mitgliedsantrag sehen, die es per Mail
--     verschickt. In der Datenbank steht nur sein Hash.
--   * Bestaetigen: public.confirm_membership_application, fuer anon. Einmal:
--     ein zweiter Klick aendert nichts mehr und meldet "schon bestaetigt".
--   * Gueltig 24 Stunden ab der letzten Mail. Danach loescht ein stuendlicher
--     Job (pg_cron) den unbestaetigten Antrag ganz: Daten von jemandem, der
--     nie bestaetigt hat, haben hier nichts verloren.
--   * Dieselbe Adresse erneut: kein zweiter Antrag, sondern dieselbe Mail
--     noch einmal, fruehestens nach zehn Minuten und hoechstens fuenfmal.
--     Die Antwort nach aussen ist in jedem Fall dieselbe.
--
-- Abwaertskompatibel: neue, nullbare Spalten; alle bestehenden Antraege
-- gelten als bestaetigt (confirmed_at = submitted_at). Die alte
-- submit_membership_application bleibt aufrufbar, legt aber nichts mehr an
-- und bittet um einen neuen Versuch - das alte Web haette sonst waehrend des
-- Deploys Antraege angenommen, zu denen nie eine Mail rausgeht.
-- ===========================================================================

create extension if not exists pg_cron;

alter table public.membership_applications
  add column if not exists confirmed_at            timestamptz,
  add column if not exists confirmation_token_hash text,
  add column if not exists confirmation_sent_at    timestamptz,
  add column if not exists confirmation_mails      smallint not null default 0;

comment on column public.membership_applications.confirmed_at is
  'Wann die Adresse per Link bestaetigt wurde. null = unbestaetigt: fuer die '
  'Verwaltung unsichtbar, wird nach 24 Stunden geloescht.';
comment on column public.membership_applications.confirmation_token_hash is
  'SHA-256 des Bestaetigungstokens (hex). Das Token selbst steht nur in der Mail.';
comment on column public.membership_applications.confirmation_sent_at is
  'Wann die letzte Bestaetigungsmail rausging. Der Link gilt 24 Stunden ab hier.';
comment on column public.membership_applications.confirmation_mails is
  'Wie viele Bestaetigungsmails zu diesem Antrag rausgingen (hoechstens 5).';

-- Der Bestand war schon sichtbar und bleibt es.
update public.membership_applications
   set confirmed_at = submitted_at
 where confirmed_at is null;

create unique index if not exists membership_applications_token_idx
  on public.membership_applications (confirmation_token_hash)
  where confirmation_token_hash is not null;

-- Fuer den Aufraeumjob und den globalen Deckel.
create index if not exists membership_applications_unbestaetigt_idx
  on public.membership_applications (submitted_at)
  where confirmed_at is null;
create index if not exists membership_applications_bestaetigt_idx
  on public.membership_applications (confirmed_at)
  where confirmed_at is not null;

-- ---------------------------------------------------------------------------
-- Die Verwaltung sieht nur Bestaetigtes
--
-- Ueber RLS und nicht in jeder Abfrage: Zaehler im Menue, Uebersicht,
-- Antragsliste und member-login lesen die Tabelle alle direkt, und keiner
-- davon soll einen unbestaetigten Antrag je zu Gesicht bekommen.
-- ---------------------------------------------------------------------------
drop policy if exists membership_applications_admin_all on public.membership_applications;
create policy membership_applications_admin_all on public.membership_applications
  for all to authenticated
  using ((select private.is_admin()) and confirmed_at is not null)
  with check ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Einreichen
-- ---------------------------------------------------------------------------

/**
 * Legt einen unbestaetigten Antrag an und gibt das Token fuer die Mail zurueck.
 *
 * Keine Zeile zurueck heisst: keine Mail. Das ist der Fall, wenn es zu der
 * Adresse schon einen bestaetigten offenen Antrag gibt, oder bei einem
 * unbestaetigten, solange die Sperrfrist laeuft oder fuenf Mails draussen
 * sind. Der Aufrufer antwortet dem Absender trotzdem gleich - sonst liesse
 * sich hier ablesen, wer schon einen Antrag gestellt hat.
 *
 * Ein erneuter Versuch ueberschreibt die Angaben nicht: sonst koennte jeder,
 * der eine fremde Adresse kennt, deren noch offenen Antrag umschreiben.
 *
 * p_ip ist die Adresse des Absenders im Klartext; gespeichert wird nur ihr
 * Hash. Die Function liest sie aus x-forwarded-for wie S6.
 */
create or replace function public.begin_membership_application(
  p_data       jsonb,
  p_ip         text default null,
  p_user_agent text default null)
returns table (application_id uuid, email text, first_name text, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_erlaubt constant text[] := array[
    'first_name', 'last_name', 'title', 'gender', 'salutation', 'birthday',
    'email', 'phone', 'mobile', 'street', 'postcode', 'city',
    'desired_fee_type_id', 'message'
  ];
  v_d       jsonb := '{}'::jsonb;
  v_schl    text;
  v_ip      text := private.hash_ip(p_ip);
  v_email   extensions.citext;
  v_anzahl  integer;
  v_gender  public.gender;
  v_fehlt   text[];
  v_offen   public.membership_applications;
  v_token   text := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash    text;
  v_id      uuid;
begin
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

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
  if v_email is null or v_email::text !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
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

  -- Sperre 1: dieselbe Herkunft, zehnmal in einer Stunde - bestaetigt oder
  -- nicht. Zehn und nicht drei: hinter einem Anschluss sitzt oft mehr als
  -- eine Person (Schnuppertag im WLAN des Clubheims, eine Familie).
  if v_ip is not null then
    select count(*)::integer into v_anzahl
    from public.membership_applications a
    where a.ip_hash = v_ip and a.submitted_at > now() - interval '1 hour';

    if v_anzahl >= 10 then
      raise exception 'Es sind gerade zu viele Anträge eingegangen. Bitte später erneut versuchen.'
        using errcode = 'too_many_rows';
    end if;
  end if;

  -- Sperre 2: zwanzig bestaetigte Antraege in einer Stunde. Unbestaetigte
  -- zaehlen nicht - genau mit denen liess sich der Deckel bisher fuellen
  -- (S22). Wer ihn jetzt fuellen will, braucht zwanzig echte Postfaecher.
  select count(*)::integer into v_anzahl
  from public.membership_applications a
  where a.confirmed_at > now() - interval '1 hour';

  if v_anzahl >= 20 then
    raise exception 'Es sind gerade zu viele Anträge eingegangen. Bitte später erneut versuchen.'
      using errcode = 'too_many_rows';
  end if;

  -- Sperre 3: schon ein offener Antrag zu dieser Adresse.
  select * into v_offen from public.membership_applications a
   where a.email = v_email and a.status = 'new'
   for update;

  if found then
    -- Bestaetigt: still aussteigen, wie bisher.
    if v_offen.confirmed_at is not null then
      return;
    end if;

    -- Unbestaetigt: dieselbe Mail noch einmal, mit neuem Link. Zehn Minuten
    -- Abstand und hoechstens fuenf Mails, damit sich niemand ein fremdes
    -- Postfach mit Bestaetigungsmails fuellen kann.
    if (v_offen.confirmation_sent_at is not null
        and v_offen.confirmation_sent_at > now() - interval '10 minutes')
       or v_offen.confirmation_mails >= 5 then
      return;
    end if;

    update public.membership_applications a set
      confirmation_token_hash = v_hash,
      confirmation_sent_at    = now(),
      confirmation_mails      = a.confirmation_mails + 1
    where a.id = v_offen.id;

    return query select v_offen.id, v_offen.email::text, v_offen.first_name, v_token;
    return;
  end if;

  begin
    insert into public.membership_applications (
      first_name, last_name, title, gender, salutation, birthday,
      email, phone, mobile, street, postcode, city,
      desired_fee_type_id, message, possible_duplicate, ip_hash, user_agent,
      confirmation_token_hash, confirmation_sent_at, confirmation_mails
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
      left(coalesce(p_user_agent, ''), 300),
      v_hash, now(), 1
    )
    returning id into v_id;
  exception when unique_violation then
    -- Zwei Absendungen derselben Adresse im selben Augenblick: die andere
    -- hat gewonnen und verschickt die Mail.
    return;
  end;

  return query select v_id, v_email::text, btrim(v_d ->> 'first_name'), v_token;
end;
$$;

revoke execute on function public.begin_membership_application(jsonb, text, text)
  from public, anon, authenticated;
grant  execute on function public.begin_membership_application(jsonb, text, text)
  to service_role;

/**
 * Die Mail ging nicht raus: Sperrfrist und Zaehler zuruecknehmen, damit ein
 * neuer Versuch sofort wieder eine Mail ausloest. Der Link aus dieser Runde
 * wird ungueltig - er hat ja niemanden erreicht.
 */
create or replace function public.release_membership_application_mail(p_application_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.membership_applications set
    confirmation_token_hash = null,
    confirmation_sent_at    = null,
    confirmation_mails      = greatest(confirmation_mails - 1, 0)
  where id = p_application_id and confirmed_at is null;
$$;

revoke execute on function public.release_membership_application_mail(uuid)
  from public, anon, authenticated;
grant  execute on function public.release_membership_application_mail(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Bestaetigen
-- ---------------------------------------------------------------------------

/**
 * Wo ein Link steht, ohne etwas zu aendern: 'pending', 'already_confirmed' oder
 * 'expired'. Abgelaufen heisst auch: unbekannt - nach 24 Stunden ist der
 * Antrag geloescht, und dann laesst sich beides nicht mehr unterscheiden.
 *
 * Die Bestaetigungsseite fragt erst hier und bestaetigt erst auf Knopfdruck:
 * Linkpruefer in Postfaechern rufen jeden Link einmal ab, und das soll keinen
 * Antrag bestaetigen.
 */
create or replace function public.membership_application_confirmation_state(p_token text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when a.confirmed_at is not null then 'already_confirmed'
      when a.confirmation_sent_at > now() - interval '24 hours' then 'pending'
      else 'expired'
    end
    from public.membership_applications a
    where a.confirmation_token_hash
          = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  ), 'expired');
$$;

revoke execute on function public.membership_application_confirmation_state(text) from public;
grant  execute on function public.membership_application_confirmation_state(text) to anon, authenticated;

/**
 * Bestaetigt den Antrag zum Token: 'confirmed', 'already_confirmed' oder
 * 'expired'. Erst hier erfaehrt der Vorstand davon.
 *
 * Kein eigener Deckel: das Token hat 256 Bit, Raten ist aussichtslos.
 */
create or replace function public.confirm_membership_application(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.membership_applications;
begin
  select * into v_a from public.membership_applications a
   where a.confirmation_token_hash
         = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;

  if not found then
    return 'expired';
  end if;

  if v_a.confirmed_at is not null then
    return 'already_confirmed';
  end if;

  if v_a.confirmation_sent_at is null
     or v_a.confirmation_sent_at <= now() - interval '24 hours' then
    return 'expired';
  end if;

  update public.membership_applications set confirmed_at = now() where id = v_a.id;

  -- Den Vorstand benachrichtigen - bisher beim Absenden, jetzt hier.
  insert into public.notifications (member_id, kind, title, body)
  select distinct r.member_id, 'application_new', 'Neuer Mitgliedsantrag',
         v_a.first_name || ' ' || v_a.last_name || ' möchte dem Verein beitreten.'
  from public.member_roles r
  where r.role in ('admin', 'board');

  return 'confirmed';
end;
$$;

revoke execute on function public.confirm_membership_application(text) from public;
grant  execute on function public.confirm_membership_application(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Die alte Einreichung
--
-- Ruft nur noch das Web aus der Zeit vor dieser Migration auf, und das nur
-- bis zu seinem Deploy. Sie legt nichts an: ein Antrag ohne Mail bliebe
-- unbestaetigt und waere nach einem Tag weg, ohne dass es jemand merkt.
-- Kann mit dem naechsten Aufraeumen entfallen.
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
begin
  raise exception 'Das Formular wurde gerade erneuert. Bitte lade die Seite neu und sende den Antrag noch einmal.'
    using errcode = 'feature_not_supported';
end;
$$;

-- ---------------------------------------------------------------------------
-- Ablehnen und Spam nur fuer Bestaetigtes
--
-- Die Verwaltung sieht Unbestaetigtes ohnehin nicht (RLS); die beiden
-- Funktionen laufen aber als Eigentuemer und saehen es.
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
    raise exception 'Anträge bearbeiten dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.membership_applications
                  where id = p_application_id and status = 'new'
                    and confirmed_at is not null) then
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

create or replace function public.mark_application_spam(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Anträge bearbeiten dürfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.membership_applications set
    status = 'spam',
    decided_at = now(),
    decided_by = private.current_member_id()
  where id = p_application_id and status = 'new' and confirmed_at is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aufraeumen: Unbestaetigtes nach Ablauf loeschen (DSGVO)
-- ---------------------------------------------------------------------------

/**
 * Loescht unbestaetigte Antraege, deren letzter Link abgelaufen ist. Ohne
 * verschickte Mail (die Mail scheiterte) zaehlt der Eingang. Rueckgabe: wie
 * viele es waren.
 */
create or replace function private.unbestaetigte_antraege_loeschen()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_anzahl integer;
begin
  delete from public.membership_applications
   where confirmed_at is null
     and coalesce(confirmation_sent_at, submitted_at) <= now() - interval '24 hours';
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke execute on function private.unbestaetigte_antraege_loeschen() from public, anon, authenticated;

-- Stuendlich zur 23. Minute. Ein Name, den es schon gibt, ersetzt den Job.
select cron.schedule(
  'unbestaetigte-antraege',
  '23 * * * *',
  'select private.unbestaetigte_antraege_loeschen()'
);
