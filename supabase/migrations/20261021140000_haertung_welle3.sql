-- ===========================================================================
-- Haertung Welle 3: Sperre, Datum, Status (B6, B10, B21, B23), Kontoloeschung (O9)
--
-- B6  join_booking, update_booking_players und leave_booking lesen die
--     Buchung mit FOR UPDATE. Zwei gleichzeitige "Mitspielen" zaehlten sonst
--     dieselbe Besetzung und ueberbuchten. Der zweite wartet jetzt, bis der
--     erste fertig ist, und sieht dann die volle Buchung.
--
-- B10 Das SEPA-Mandat im Onboarding traegt das Berliner Datum
--     (private.heute()), die Constraint pruefte gegen current_date in UTC.
--     Zwischen 0 und 2 Uhr lag das Berliner Datum in der Zukunft. Die
--     Constraint rechnet jetzt ebenfalls in Berliner Zeit. Inline statt
--     ueber private.heute(): eine Constraint ruft die Funktion mit den Rechten
--     des Schreibenden auf, und private.heute() ist fuer Clients gesperrt.
--     Bestand verletzt die neue Regel nicht, das Berliner Datum liegt nie
--     vor dem UTC-Datum.
--
-- B21 member_directory und record_purchase pruefen private.hat_zugang statt
--     status = 'active'. Wer zum Jahresende austritt, steht ab
--     end_membership auf inaktiv, ist aber bis zum Austrittsdatum Mitglied:
--     er spielt, zahlt und trinkt. Warum hier hat_zugang und nicht den
--     Status erst zum Datum setzen:
--       - hat_zugang ist schon die eine Antwort auf "ist das noch ein
--         Mitglied" (S12): Login, Rechte, Policies. Das Verzeichnis und der
--         Kiosk sagen jetzt dasselbe, statt einer zweiten Regel.
--       - Den Status spaeter setzen braucht einen Zeitgeber. Faellt der aus
--         oder laeuft spaet, stimmt der Status nicht, und bis dahin waere
--         jemand noch aktiv, der laengst gegangen ist.
--       - Der Status inaktiv ab der Kuendigung bleibt fuer die Verwaltung
--         lesbar: gekuendigt, laeuft aus.
--     Nebenbei fallen Gesperrte (login_disabled_at) aus dem Verzeichnis. Sie
--     koennen nicht mehr buchen, also auch nicht als Mitspieler auftauchen.
--
-- B23 update_member setzt den Status nur noch auf aktiv oder inaktiv.
--     Archivieren geht ausschliesslich ueber archive_member, das aufraeumt
--     (B4, B5). Ein Archivierter wird nicht ueber den Status zurueckgeholt:
--     Sperrvermerk, Mandat und Rollen blieben sonst halb weg.
--
-- O9  Neu: konto_loeschung_beantragen und die Tabelle
--     account_deletion_requests (Apple-Regel 5.1.1(v)), siehe unten.
--
-- Abwaertskompatibel: Signaturen, Rueckgaben und Rechte bleiben gleich, O9
-- kommt nur hinzu. Grundlage ist jeweils die neueste Fassung der Funktion.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- B6: Zeilensperre auf die Buchung
--
-- Fassungen aus 20261014113953_onboarding_grundlagen.sql (join_booking),
-- 20261014075926_platzwart_rechte.sql (update_booking_players) und
-- 20260807100100_meine_buchungen.sql (leave_booking). Geaendert ist nur das
-- Lesen der Buchung.
-- ---------------------------------------------------------------------------
create or replace function public.join_booking(p_booking_id uuid)
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
    raise exception 'Fuer diese Buchung werden keine Mitspieler gesucht.'
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
    raise exception 'Du hast bereits % offene Buchungen. Mehr sind nicht moeglich.', v_max_open
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
          format('%s hat sich fuer %s eingetragen.',
                 private.member_label(v_me), private.booking_label(p_booking_id)));
end; $function$;

create or replace function public.update_booking_players(
  p_booking_id uuid, p_member_ids uuid[] default '{}', p_guest_names text[] default '{}'
)
returns void language plpgsql security definer set search_path = '' as $$
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
    raise exception 'Du kannst nur deine eigenen Buchungen aendern.'
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
      raise exception 'Fuer "%" musst du mindestens einen Mitspieler angeben.', v_type.name
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
    raise exception '"%" erlaubt hoechstens % Spieler.', v_type.name, v_type.max_players
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
         format('%s hat dich fuer %s eingetragen.', private.member_label(v_me), v_label)
  from unnest(coalesce(p_member_ids, '{}')) as neu
  where not (neu = any (v_vorher)) and neu <> v_me;

  insert into public.notifications (member_id, kind, title, body)
  select alt, 'booking_removed', 'Du bist nicht mehr dabei',
         format('%s hat dich von %s ausgetragen.', private.member_label(v_me), v_label)
  from unnest(v_vorher) as alt
  where not (alt = any (coalesce(p_member_ids, '{}'))) and alt <> v_me;
end; $$;

create or replace function public.leave_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
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
    raise exception 'Ohne dich waeren es zu wenige Spieler. Bitte sag dem Bucher Bescheid.'
      using errcode = 'check_violation';
  end if;

  delete from public.booking_players
   where booking_id = p_booking_id and member_id = v_me;

  insert into public.notifications (member_id, kind, title, body)
  values (v_booking.member_id, 'player_left', 'Ein Mitspieler hat sich ausgetragen',
          format('%s spielt am %s nicht mit.',
                 private.member_label(v_me), private.booking_label(p_booking_id)));
end; $$;

-- ---------------------------------------------------------------------------
-- B10: Mandatsdatum in Berliner Zeit
-- ---------------------------------------------------------------------------
alter table public.sepa_mandates
  drop constraint sepa_mandates_signed_not_future;
alter table public.sepa_mandates
  add constraint sepa_mandates_signed_not_future
  check (signed_on <= (now() at time zone 'Europe/Berlin')::date);

-- ---------------------------------------------------------------------------
-- B21: Verzeichnis und Kiosk folgen hat_zugang
--
-- Fassungen aus 20260803101000_harden_functions.sql (member_directory) und
-- 20260803101300_rpc_drinks.sql (record_purchase).
-- ---------------------------------------------------------------------------
create or replace function public.member_directory(p_query text default null)
returns table (id uuid, first_name text, last_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.first_name, m.last_name
  from public.members m
  where private.hat_zugang(m)
    and (private.is_member() or private.is_kiosk())
    and (
      p_query is null
      or p_query = ''
      or m.first_name ilike '%' || p_query || '%'
      or m.last_name  ilike '%' || p_query || '%'
    )
  order by m.last_name, m.first_name;
$$;

comment on function public.member_directory(text) is
  'Namensverzeichnis fuer Mitspielerauswahl und Kiosk: alle mit Zugang (hat_zugang), '
  'auch Ausgetretene bis zum Austrittsdatum. Gibt nur Id und Name heraus - keine '
  'Kontaktdaten, keine Bankverbindung.';

create or replace function private.record_purchase(
  p_member_id   uuid,
  p_item_id     uuid,
  p_quantity    integer,
  p_source      public.purchase_source,
  p_recorded_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
    raise exception '"%" wird nicht mehr gefuehrt.', v_item.name
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
    raise exception 'Fuer "%" ist kein Preis hinterlegt.', v_item.name
      using errcode = 'no_data_found';
  end if;

  insert into public.drink_purchases
    (member_id, drink_item_id, quantity, unit_price_cents, source, recorded_by)
  values
    (p_member_id, p_item_id, p_quantity, v_price, p_source, p_recorded_by)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- B23: Archivieren nur ueber archive_member
--
-- Fassung aus 20261014095355_mitglied_braucht_email.sql.
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

  -- Archivieren raeumt auf: Buchungen, Mandate, Einzuege, Rollen, Zugang.
  -- Ein blosser Statuswechsel liesse all das liegen (B23). Deshalb hier nur
  -- aktiv und inaktiv, und ein Archivierter bleibt archiviert.
  if v_neu ->> 'status' is not null then
    if v_neu ->> 'status' not in ('active', 'inactive') then
      raise exception 'Archivieren geht nur ueber "Archivieren", nicht ueber den Status.'
        using errcode = 'invalid_parameter_value';
    end if;
    if v_alt.status = 'archived' and v_neu ->> 'status' <> 'archived' then
      raise exception 'Ein archiviertes Mitglied laesst sich nicht ueber den Status zurueckholen.'
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

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

-- ===========================================================================
-- O9: Kontoloeschung in der App beantragen (Apple-Regel 5.1.1(v))
--
-- Wer ein Konto anlegen kann, muss es in der App auch loeschen lassen
-- koennen. Loeschen selbst bleibt Sache des Vorstands: an einem Mitglied
-- haengen Forderungen, Mandate und Buchungen, die nicht einfach verschwinden
-- duerfen (siehe anonymize_member). Die App stellt deshalb einen Antrag, und
-- Admins und Vorstand erfahren davon per Mail und Push.
--
-- Der Antrag steht in einer eigenen Tabelle, nicht nur als Benachrichtigung:
-- so laesst sich Mehrfachklicken erkennen (hoechstens einer je Mitglied in
-- 24 Stunden), und die Verwaltung sieht spaeter, wer was wann beantragt hat.
-- ===========================================================================

create table public.account_deletion_requests (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members (id) on delete cascade,
  message    text check (char_length(message) <= 1000),
  created_at timestamptz not null default now()
);

comment on table public.account_deletion_requests is
  'Antraege auf Kontoloeschung aus der App (O9). Angelegt nur ueber konto_loeschung_beantragen.';

create index account_deletion_requests_member_idx
  on public.account_deletion_requests (member_id, created_at desc);

alter table public.account_deletion_requests enable row level security;

revoke all on public.account_deletion_requests from anon;
revoke insert, update, delete, truncate on public.account_deletion_requests from authenticated;
grant select on public.account_deletion_requests to authenticated;

-- Der eigene Antrag, und der Vorstand sieht alle.
create policy account_deletion_requests_select on public.account_deletion_requests
  for select to authenticated
  using (member_id = (select private.current_member_id()) or (select private.is_admin()));

/**
 * Beantragt die Loeschung des eigenen Kontos.
 *
 * true: der Antrag ist eingegangen, Admins und Vorstand sind benachrichtigt.
 * false: es gibt schon einen aus den letzten 24 Stunden; nichts Neues. Kein
 * Fehler, denn fuer das Mitglied ist der Antrag ja gestellt.
 */
create or replace function public.konto_loeschung_beantragen(p_nachricht text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me        uuid := private.current_member_id();
  v_nachricht text := nullif(btrim(coalesce(p_nachricht, '')), '');
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;

  if char_length(v_nachricht) > 1000 then
    raise exception 'Die Nachricht ist zu lang (hoechstens 1000 Zeichen).'
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
  select distinct m.id, 'account_deletion_requested', 'Kontoloeschung beantragt',
         private.member_label(v_me) || ' moechte das eigene Konto loeschen lassen.'
         || coalesce(E'\n\nNachricht: ' || v_nachricht, '')
  from public.member_roles r
  join public.members m on m.id = r.member_id
  where r.role in ('admin'::public.app_role, 'board'::public.app_role)
    and private.hat_zugang(m)
    and m.id <> v_me;

  return true;
end;
$$;

revoke execute on function public.konto_loeschung_beantragen(text) from public, anon;
grant  execute on function public.konto_loeschung_beantragen(text) to authenticated;

-- Mail und Push, wie ein neuer Mitgliedsantrag: sonst bliebe der Antrag
-- liegen, bis jemand zufaellig in die App schaut.
update public.settings
   set value = to_jsonb(concat_ws(',', nullif(btrim(value #>> '{}'), ''), 'account_deletion_requested'))
 where key in ('notifications.mail_kinds', 'notifications.push_kinds')
   and not ('account_deletion_requested' = any (string_to_array(coalesce(value #>> '{}', ''), ',')));

-- Fassung aus 20261019130532_veranstaltungen_erinnerung.sql, beide Listen um
-- account_deletion_requested ergaenzt.
create or replace function public.ensure_default_settings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before integer;
  v_after  integer;
begin
  select count(*) into v_before from public.settings;

  insert into public.settings (key, value, value_type, label, description) values
    ('booking.max_open_bookings', '0'::jsonb, 'integer', 'Maximale offene Buchungen',
     'Wie viele kuenftige Buchungen ein Mitglied gleichzeitig haben darf. '
     'Mitspieler zaehlen mit. 0 bedeutet unbegrenzt.'),
    ('booking.lead_days', '7'::jsonb, 'integer', 'Buchungsvorlauf in Tagen',
     'Rollierend: buchbar ist alles innerhalb der naechsten X Tage.'),
    ('booking.opening_time', '"08:00"'::jsonb, 'time', 'Oeffnungszeit',
     'Frueheste Startzeit einer Buchung.'),
    ('booking.closing_time', '"21:00"'::jsonb, 'time', 'Schliesszeit',
     'Spaeteste Endzeit einer Buchung.'),
    ('booking.slot_minutes', '30'::jsonb, 'integer', 'Raster in Minuten',
     'Startzeiten muessen auf dieses Raster fallen (30 = :00 und :30).'),
    ('booking.display_minutes', '60'::jsonb, 'integer', 'Raster der Plananzeige',
     'In welchen Schritten der Belegungsplan Zeilen zeigt. Gebucht wird im '
     'feineren Raster aus booking.slot_minutes.'),
    ('booking.guest_fee_cents', '1000'::jsonb, 'integer', 'Gastgebuehr in Cent',
     '0 = keine Gebuehr. Sonst wird sie je Gast dem buchenden Mitglied '
     'berechnet und mit der naechsten Lastschrift eingezogen.'),
    ('notifications.mail_kinds',
     '"booking_displaced,booking_cancelled,booking_removed,application_new,charge_announced,charge_returned,booking_moved,event_promoted,event_cancelled,event_changed,account_deletion_requested"'::jsonb,
     'text', 'Benachrichtigungen, die auch per E-Mail gehen',
     'Kommagetrennte Liste. Wer bei "E-Mails zu Buchungen" auf "Alle" steht, '
     'bekommt jede Art; alle anderen nur diese hier.'),
    ('drinks.min_debit_cents', '500'::jsonb, 'integer', 'Mindestbetrag Lastschrift',
     'Betraege darunter werden nicht eingezogen, sondern beim naechsten Lauf '
     'mitgenommen. Die Schwelle gilt je Zahler ueber alle offenen Forderungen.'),
    ('drinks.void_window_minutes', '15'::jsonb, 'integer', 'Storno-Fenster Getraenke',
     'So lange darf ein Mitglied eine eigene Fehlbuchung selbst zuruecknehmen.'),
    ('sepa.creditor_id', '""'::jsonb, 'text', 'Glaeubiger-Identifikationsnummer',
     'Aus dem eBuSy-Backend uebernehmen. Muss unveraendert bleiben, damit die '
     'Bestandsmandate gueltig bleiben.'),
    ('sepa.creditor_iban', '""'::jsonb, 'text', 'IBAN des Vereinskontos',
     'Auf dieses Konto werden die Lastschriften gutgeschrieben. Ohne sie laesst '
     'sich keine Datei erzeugen.'),
    ('sepa.creditor_bic', '""'::jsonb, 'text', 'BIC des Vereinskontos',
     'Optional. Fehlt sie, traegt die Datei NOTPROVIDED - das reicht innerhalb '
     'des SEPA-Raums.'),
    ('sepa.pain_version', '"pain.008.001.08"'::jsonb, 'text', 'Format der Lastschriftdatei',
     'Mit der Hausbank abklaeren.'),
    ('sepa.prenotification_days', '14'::jsonb, 'integer', 'Vorabankuendigung in Tagen',
     'Pflicht vor jedem Einzug. So viele Tage muessen zwischen Ankuendigung '
     'und Faelligkeit liegen.'),
    ('sepa.creditor_name', '"TC Muckensturm e.V."'::jsonb, 'text', 'Name des Zahlungsempfaengers',
     'Erscheint auf dem Kontoauszug der Mitglieder.'),
    ('sepa.mandate_text_version', '1'::jsonb, 'integer', 'Version des Mandatstexts',
     'Fassung des Textes, mit dem Mitglieder ihr SEPA-Mandat online erteilen. '
     'Wird hochgezaehlt, wenn sich der Text in private.sepa_mandatstext aendert.'),
    ('fees.annual_run_month', '1'::jsonb, 'integer', 'Monat des Beitragslaufs',
     'Der Lauf wird trotzdem manuell gestartet.'),
    ('fees.annual_run_day', '15'::jsonb, 'integer', 'Tag des Beitragslaufs',
     'Faelligkeitsdatum der Jahresbeitrags-Lastschrift.'),
    ('work_duty.hourly_rate_cents', '1500'::jsonb, 'integer', 'Stundensatz Arbeitsdienst',
     'Womit nicht geleistete Stunden zum Jahresende abgerechnet werden. Platzhalter.'),
    ('privacy.change_log_days', '1095'::jsonb, 'integer',
     'Aufbewahrung des Aenderungsprotokolls in Tagen',
     'Aeltere Eintraege werden beim Aufraeumlauf entfernt. 1095 Tage sind drei Jahre.'),
    ('notifications.push_kinds',
     '"booking_displaced,booking_cancelled,booking_removed,booking_added,player_joined,player_left,application_new,booking_moved,event_published,event_promoted,event_cancelled,event_changed,event_reminder,account_deletion_requested"'::jsonb,
     'text', 'Benachrichtigungen, die auch als Push gehen',
     'Kommagetrennte Liste. Getrennt von den E-Mail-Arten, weil ein Push sofort '
     'da ist und auch Erfreuliches melden darf, das als Mail nur Laerm waere.')
  on conflict (key) do nothing;

  select count(*) into v_after from public.settings;
  return v_after - v_before;
end;
$$;

revoke execute on function public.ensure_default_settings() from public, anon, authenticated;

select public.ensure_default_settings();
