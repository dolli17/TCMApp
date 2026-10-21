-- ===========================================================================
-- Haertung Welle 4: Rechte und Grenzen (B7, S6, S8, S15, S17, S21, S26)
--
-- B7  Die Lastschriftdatei liegt je Versuch unter einem eigenen Pfad. Das
--     baut das Web (lastschriftPfad in @tcm/core); der Bucket sepa bleibt
--     ohne Aenderungsrecht. Hier aendert sich dafuer nichts.
--
-- S6  submit_membership_application liest die Herkunft aus dem Anfragekopf
--     x-forwarded-for (erster Eintrag) statt aus p_ip. p_ip bleibt in der
--     Signatur und wird ignoriert. Das Web reicht die Adresse seines
--     Aufrufers als x-forwarded-for durch, sonst saehe die Datenbank fuer
--     jeden Antrag aus dem Formular nur den Web-Server.
--
-- S8  Keine Funktion in private ist mehr fuer PUBLIC ausfuehrbar, auch keine
--     kuenftige (default privileges fuer postgres). Clients brauchen aus
--     private nur, was in Policies steht: is_admin, is_member, is_kiosk,
--     current_member_id, can_view_member. Die vier letzten hatten schon
--     ausdrueckliche Rechte, is_admin bekommt sie hier, fuer anon wegen
--     legal_documents_select. Die security-definer-RPCs laufen als
--     Eigentuemer und sind nicht betroffen. Die Voreinstellung gilt global
--     fuer postgres, nicht nur in private (Postgres kann sie nicht je Schema
--     wegnehmen): neue Funktionen brauchen ein ausdrueckliches grant. Das
--     schreibt jede Migration hier ohnehin.
--
-- S15 bookings: Mitglieder lesen nur noch die Spalten fuer den Plan, nicht
--     Stornogrund, Buchungscode, wer gebucht oder storniert hat, eBuSy-Id
--     und Quelle. Fremde Buchungen sehen sie bis eine Woche zurueck, die
--     eigenen immer. Web und App lesen bookings nicht direkt (alles ueber
--     RPCs); Realtime filtert die Spalten nach dem Grant.
--
-- S17 members: Mitglieder lesen notes, import_notes und legacy_data nicht,
--     auch die eigenen nicht. Admins lesen die Notizen ueber member_notes().
--     Achtung fuer kuenftige Spalten: ab jetzt braucht jede neue Spalte in
--     members ein grant select (spalte), sonst sieht sie kein Client.
--
-- S21 Laengengrenzen fuer Freitext, grosszuegig: Namen 100, Gastname 100,
--     Titel 200, Strasse und Ort 200, Stornogrund 500, Antragsnachricht 2000.
--     Erst NOT VALID, dann VALIDATE: so bricht die Migration ab, falls der
--     Bestand eine Grenze verletzt, statt halb zu greifen.
--
-- S26 register_push_token haengt ein Geraet nur noch um, wenn es stillgelegt
--     ist oder der bisherige Besitzer keinen Zugang mehr hat.
--
-- Abwaertskompatibel: Signaturen und Rueckgaben bleiben gleich. Die alte
-- Web-Fassung liest auf der Mitgliederseite notes direkt; zwischen Migration
-- und Web-Deploy faellt diese eine Admin-Seite kurz aus. Die App ist nicht
-- betroffen.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- S8: private nicht fuer PUBLIC
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema private from public;
alter default privileges for role postgres revoke execute on functions from public;

grant execute on function private.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- S6: Herkunft aus dem Anfragekopf
-- ---------------------------------------------------------------------------

/**
 * Die Adresse des Aufrufers: erster Eintrag aus x-forwarded-for, wie
 * PostgREST den Kopf in request.headers ablegt. Null, wenn es keinen gibt
 * (Aufruf direkt in der Datenbank).
 */
create or replace function private.anfrage_ip()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(btrim(split_part(
    coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'x-forwarded-for',
    ',', 1)), '');
$$;

revoke execute on function private.anfrage_ip() from public, anon, authenticated;

create or replace function public.submit_membership_application(
  p_data jsonb, p_ip text default null, p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
    raise exception 'Vor- und Nachname duerfen hoechstens 100 Zeichen lang sein.'
      using errcode = 'invalid_parameter_value';
  end if;
  if length(btrim(coalesce(v_d ->> 'message', ''))) > 2000 then
    raise exception 'Die Nachricht darf hoechstens 2000 Zeichen lang sein.'
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
         || ' moechte dem Verein beitreten.'
  from public.member_roles r
  where r.role in ('admin', 'board');
end;
$$;
-- ---------------------------------------------------------------------------
-- S15: Buchungen, Spalten und Zeitraum
-- ---------------------------------------------------------------------------
revoke select on public.bookings from authenticated;
grant select (id, court_id, slot, kind, booking_type_id, member_id, series_id,
              title, status, partner_wanted, created_at)
  on public.bookings to authenticated;

drop policy bookings_select on public.bookings;
create policy bookings_select on public.bookings
  for select to authenticated
  using ((select private.is_member())
         and (upper(slot) > now() - interval '7 days'
              or member_id = (select private.current_member_id())));

-- ---------------------------------------------------------------------------
-- S17: Notizen am Mitglied
-- ---------------------------------------------------------------------------
revoke select on public.members from authenticated;
grant select (
  id, auth_user_id, first_name, last_name, title, gender, salutation, birthday,
  email, phone, mobile, street, postcode, city, country_code, status,
  ebusy_person_id, source, imported_at, created_at, updated_at,
  emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
  is_trainer, nationality_code, tennis_lk, nuliga_id, playing_right,
  playing_right_since, invited_at, login_disabled_at, team_id, is_team_captain,
  onboarding_completed_at, onboarding_stammdaten_at, guardian_name,
  guardian_email, guardian_phone, guardian_consent_at
) on public.members to authenticated;

/** Die Notizen des Vorstands zu einem Mitglied. Nur fuer Admins. */
create or replace function public.member_notes(p_member_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Notizen lesen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;
  return (select notes from public.members where id = p_member_id);
end;
$$;

revoke execute on function public.member_notes(uuid) from public, anon;
grant  execute on function public.member_notes(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- S21: Laengengrenzen
-- ---------------------------------------------------------------------------
alter table public.members
  add constraint members_first_name_laenge check (char_length(first_name) <= 100) not valid,
  add constraint members_last_name_laenge  check (char_length(last_name) <= 100) not valid,
  add constraint members_title_laenge      check (char_length(title) <= 100) not valid,
  add constraint members_street_laenge     check (char_length(street) <= 200) not valid,
  add constraint members_city_laenge       check (char_length(city) <= 200) not valid,
  add constraint members_notfall_laenge    check (char_length(emergency_contact_name) <= 100
                                                  and char_length(emergency_contact_relation) <= 100) not valid,
  add constraint members_guardian_name_laenge check (char_length(guardian_name) <= 100) not valid;
alter table public.membership_applications
  add constraint membership_applications_first_name_laenge check (char_length(first_name) <= 100) not valid,
  add constraint membership_applications_last_name_laenge  check (char_length(last_name) <= 100) not valid,
  add constraint membership_applications_street_laenge     check (char_length(street) <= 200) not valid,
  add constraint membership_applications_city_laenge       check (char_length(city) <= 200) not valid,
  add constraint membership_applications_message_laenge    check (char_length(message) <= 2000) not valid;
alter table public.booking_players
  add constraint booking_players_guest_name_laenge check (char_length(guest_name) <= 100) not valid;
alter table public.bookings
  add constraint bookings_title_laenge               check (char_length(title) <= 200) not valid,
  add constraint bookings_cancellation_reason_laenge check (char_length(cancellation_reason) <= 500) not valid;
alter table public.booking_series
  add constraint booking_series_title_laenge check (char_length(title) <= 200) not valid;
alter table public.memberships
  add constraint memberships_cancellation_reason_laenge check (char_length(cancellation_reason) <= 500) not valid;

alter table public.members validate constraint members_first_name_laenge;
alter table public.members validate constraint members_last_name_laenge;
alter table public.members validate constraint members_title_laenge;
alter table public.members validate constraint members_street_laenge;
alter table public.members validate constraint members_city_laenge;
alter table public.members validate constraint members_notfall_laenge;
alter table public.members validate constraint members_guardian_name_laenge;
alter table public.membership_applications validate constraint membership_applications_first_name_laenge;
alter table public.membership_applications validate constraint membership_applications_last_name_laenge;
alter table public.membership_applications validate constraint membership_applications_street_laenge;
alter table public.membership_applications validate constraint membership_applications_city_laenge;
alter table public.membership_applications validate constraint membership_applications_message_laenge;
alter table public.booking_players validate constraint booking_players_guest_name_laenge;
alter table public.bookings validate constraint bookings_title_laenge;
alter table public.bookings validate constraint bookings_cancellation_reason_laenge;
alter table public.booking_series validate constraint booking_series_title_laenge;
alter table public.memberships validate constraint memberships_cancellation_reason_laenge;

-- ---------------------------------------------------------------------------
-- S26: Push-Geraete nicht fremd umhaengen
--
-- Fassung aus 20260810100000_push_benachrichtigungen.sql.
-- ---------------------------------------------------------------------------
create or replace function public.register_push_token(
  p_token       text,
  p_platform    text,
  p_device_name text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_member uuid; v_alt public.push_tokens; v_alt_zugang boolean;
begin
  v_member := (select private.current_member_id());
  if v_member is null then
    raise exception 'Nur Mitglieder koennen ein Geraet anmelden.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(p_token), '') = '' then
    raise exception 'Ohne Marke laesst sich kein Geraet anmelden.'
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
      raise exception 'Dieses Geraet ist noch fuer ein anderes Mitglied angemeldet. Bitte dort zuerst abmelden.'
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
end; $$;
