-- ===========================================================================
-- Security-Audit run-1, bestaetigte Befunde 3.1 bis 3.5
--
-- Jeder Test stellt den Angriff aus dem Bericht nach und erwartet, dass er
-- jetzt scheitert.
--
-- Fixtures aus 02_rls.sql (fixture_user, act_as), 03_rpc_bookings.sql
-- (naechster_slot), 09_benachrichtigungs_mails.sql (fixture_user_mit_mail,
-- lege_nachricht_an), 16_benachrichtigungs_pushes.sql
-- (fixture_user_mit_geraet, lege_push_nachricht_an) und
-- 25_veranstaltungen.sql (fixture_event).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 3.1 Benachrichtigungs-Warteschlange
-- ---------------------------------------------------------------------------

/**
 * Der Kern des Befunds: ein Rueckstand vor der Vorabankuendigung. Frueher
 * kam sie erst im vierten Lauf. Jetzt geht sie im ersten raus, und das
 * geflutete Mitglied bekommt hoechstens 20 Posten je Lauf.
 */
create or replace function tests.test_audit_flut_haelt_vorabankuendigung_nicht_auf()
returns setof text language plpgsql as $f$
declare v record; l record; v_id uuid; v_posten integer; v_ids uuid[];
begin
  select * into v from tests.fixture_user_mit_mail() limit 1;
  select * into l from tests.fixture_user_mit_mail() limit 1;

  -- Die Flut, aelter als die Vorabankuendigung.
  insert into public.notifications (member_id, kind, title, body, created_at)
  select v.member_id, 'booking_removed', 'ZZFlut', 'Flut ' || i, now() - interval '1 hour' + make_interval(secs => i)
  from generate_series(1, 300) as i;
  v_id := tests.lege_nachricht_an(l.member_id, 'charge_announced');

  create temporary table zz_lauf on commit drop as
    select * from public.claim_notification_mails(50);

  select c.notification_ids into v_ids from zz_lauf c where c.member_id = l.member_id;
  return next ok(v_id = any (coalesce(v_ids, '{}')),
    'Die Vorabankuendigung geht im ersten Lauf raus, trotz 300 Zeilen davor');

  select jsonb_array_length(c.items) into v_posten from zz_lauf c where c.member_id = v.member_id;
  return next is(v_posten, 20, 'Das geflutete Mitglied bekommt hoechstens 20 Posten je Lauf');
  return next is(
    (select count(*)::integer from public.notifications
      where member_id = v.member_id and mailed_at is null),
    280, 'Der Rest wartet auf die naechsten Laeufe, nichts ist verloren');
end; $f$;

/**
 * Zweites Szenario aus dem Bericht: der Rueckstand ist ueber einen Tag alt.
 * Frueher wurde die Vorabankuendigung abgehakt und nie verschickt.
 */
create or replace function tests.test_audit_alte_vorabankuendigung_geht_noch_raus()
returns setof text language plpgsql as $f$
declare l record; v_ankuendigung uuid; v_alt uuid; v_ids uuid[];
begin
  select * into l from tests.fixture_user_mit_mail() limit 1;
  v_ankuendigung := tests.lege_nachricht_an(l.member_id, 'charge_announced');
  v_alt := tests.lege_nachricht_an(l.member_id, 'booking_removed');
  update public.notifications set created_at = now() - interval '25 hours'
   where id in (v_ankuendigung, v_alt);

  select c.notification_ids into v_ids
  from public.claim_notification_mails() c where c.member_id = l.member_id;

  return next is(v_ids, array[v_ankuendigung],
    'Die Vorabankuendigung verfaellt nicht nach Alter, die alte Absage schon');
  return next is(
    (select mail_discarded_at from public.notifications where id = v_ankuendigung), null,
    'Die Vorabankuendigung gilt als verschickt, nicht als verworfen');
  return next isnt(
    (select mailed_at from public.notifications where id = v_alt), null,
    'Die alte Absage ist abgehakt');
  return next isnt(
    (select mail_discarded_at from public.notifications where id = v_alt), null,
    'und als verworfen markiert, nicht als verschickt');
end; $f$;

/** Unzustellbares belegt keinen Platz im Lauf mehr. */
create or replace function tests.test_audit_unzustellbares_belegt_keinen_platz()
returns setof text language plpgsql as $f$
declare u record; v_frisch uuid; v_ids uuid[];
begin
  select * into u from tests.fixture_user_mit_mail() limit 1;
  -- 30 Zeilen einer Art, die nicht gemailt wird, vor der einen wichtigen.
  insert into public.notifications (member_id, kind, title, body, created_at)
  select u.member_id, 'player_joined', 'ZZ', 'x', now() - interval '1 hour'
  from generate_series(1, 30);
  v_frisch := tests.lege_nachricht_an(u.member_id, 'booking_displaced');

  select c.notification_ids into v_ids
  from public.claim_notification_mails(5) c where c.member_id = u.member_id;
  return next is(v_ids, array[v_frisch], 'Ein Lauf mit Platz fuer fuenf liefert die wichtige Nachricht');
  return next is(
    (select count(*)::integer from public.notifications
      where member_id = u.member_id and kind = 'player_joined'
        and mailed_at is not null and mail_discarded_at is not null),
    30, 'Die unerwuenschten sind abgehakt und verworfen');
end; $f$;

create or replace function tests.test_audit_push_fair_und_verworfen()
returns setof text language plpgsql as $f$
declare u record; v_alt uuid; v_posten integer;
begin
  select * into u from tests.fixture_user_mit_geraet() limit 1;
  for i in 1..30 loop
    perform tests.lege_push_nachricht_an(u.member_id, 'booking_cancelled');
  end loop;
  v_alt := tests.lege_push_nachricht_an(u.member_id, 'booking_cancelled');
  update public.notifications set created_at = now() - interval '25 hours' where id = v_alt;

  select jsonb_array_length(c.items) into v_posten
  from public.claim_notification_pushes() c where c.member_id = u.member_id;
  return next is(v_posten, 20, 'Hoechstens 20 Pushes je Empfaenger und Lauf');
  return next is(
    (select count(*)::integer from public.notifications
      where member_id = u.member_id and pushed_at is null),
    10, 'Der Rest bleibt fuer den naechsten Lauf');
  return next isnt((select push_discarded_at from public.notifications where id = v_alt), null,
    'Ein alter Push ist als verworfen markiert');
end; $f$;

/**
 * Der Angriff selbst: Besetzung im Wechsel {V1, V2} und {}. Noch nicht
 * verschickte Gegenstuecke heben sich auf, und nach 20 Aenderungen in der
 * Stunde ist Schluss.
 */
create or replace function tests.test_audit_besetzung_flut_begrenzt()
returns setof text language plpgsql as $f$
declare a record; v1 record; v2 record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 10); v_offen integer;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into v1 from tests.fixture_user() limit 1;
  select * into v2 from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  v_id := public.create_booking(v_court, s1, 'doppel', '{}'::uuid[], '{}'::text[], true);
  for i in 1..10 loop
    perform public.update_booking_players(v_id, array[v1.member_id, v2.member_id]);
    perform public.update_booking_players(v_id, '{}'::uuid[]);
  end loop;
  perform set_config('role', 'postgres', true);

  select count(*)::integer into v_offen from public.notifications
   where member_id in (v1.member_id, v2.member_id) and kind in ('booking_added', 'booking_removed');
  return next is(v_offen, 0,
    'Ein- und Austragen vor dem Versand hebt sich auf: keine Benachrichtigung bleibt');

  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format('select public.update_booking_players(%L, array[%L, %L]::uuid[])', v_id, v1.member_id, v2.member_id),
    '23514',
    'Die Mitspieler dieser Buchung wurden in der letzten Stunde zu oft geändert. Bitte versuche es später noch einmal.',
    'Die 21. Aenderung in einer Stunde wird abgelehnt');
  -- Nur Gaeste: keine Benachrichtigung, also kein Limit.
  return next lives_ok(
    format('select public.update_booking_players(%L, ''{}''::uuid[], array[''Gast''])', v_id),
    'Gaeste aendern bleibt moeglich, das benachrichtigt niemanden');
  perform set_config('role', 'postgres', true);
end; $f$;

/** Verschickt ist verschickt: dann kommt auch die Gegenmeldung. */
create or replace function tests.test_audit_verschicktes_hebt_sich_nicht_auf()
returns setof text language plpgsql as $f$
declare a record; v1 record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 11);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into v1 from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  v_id := public.create_booking(v_court, s1, 'doppel', array[v1.member_id], '{}'::text[], true);
  perform set_config('role', 'postgres', true);

  return next is(
    (select booking_id from public.notifications where member_id = v1.member_id and kind = 'booking_added'),
    v_id, 'Die Benachrichtigung kennt ihre Buchung');
  update public.notifications set pushed_at = now()
   where member_id = v1.member_id and kind = 'booking_added';

  perform tests.act_as(a.auth_id);
  perform public.update_booking_players(v_id, '{}'::uuid[]);
  perform set_config('role', 'postgres', true);

  return next is(
    (select count(*)::integer from public.notifications
      where member_id = v1.member_id and kind in ('booking_added', 'booking_removed')),
    2, 'Nach dem Push bleibt die Eintragung stehen und die Austragung kommt dazu');
end; $f$;

create or replace function tests.test_audit_anlegen_begrenzt()
returns setof text language plpgsql as $f$
declare a record; v1 record; adm record; v_court uuid := tests.fixture_court(); v_alt uuid;
        s1 timestamptz := tests.naechster_slot(3, 10); s2 timestamptz := tests.naechster_slot(3, 12);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into v1 from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;

  -- 20 Buchungen mit Mitspielern in der letzten Stunde, wie nach einer
  -- Schleife aus Anlegen und Stornieren.
  insert into public.bookings (court_id, member_id, slot, booking_type_id)
  values (v_court, a.member_id, tstzrange(now() + interval '6 days', now() + interval '6 days 1 hour'),
          (select id from public.booking_types where code = 'einzel'))
  returning id into v_alt;
  insert into private.besetzung_aenderungen (booking_id, changed_by, angelegt)
  select v_alt, a.member_id, true from generate_series(1, 20);

  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])', v_court, s1, v1.member_id),
    '23514',
    'Du hast in der letzten Stunde zu viele Buchungen mit Mitspielern angelegt. Bitte versuche es später noch einmal.',
    'Die 21. Buchung mit Mitspielern in einer Stunde wird abgelehnt');
  return next lives_ok(
    format('select public.create_booking(%L, %L, ''doppel'', ''{}''::uuid[], ''{}''::text[], true)', v_court, s1),
    'Ohne Mitspieler bucht man weiter');
  perform set_config('role', 'postgres', true);

  insert into private.besetzung_aenderungen (booking_id, changed_by, angelegt)
  select v_alt, adm.member_id, true from generate_series(1, 20);
  perform tests.act_as(adm.auth_id);
  return next lives_ok(
    format('select public.create_booking(%L, %L, ''einzel'', array[%L]::uuid[])', v_court, s2, v1.member_id),
    'Admins sind ausgenommen');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- 3.2 Mitspieler ohne Zustimmung
-- ---------------------------------------------------------------------------

create or replace function tests.test_audit_opfer_kommt_raus()
returns setof text language plpgsql as $f$
declare a record; opfer record; c record; v_court uuid := tests.fixture_court();
        v_court2 uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 14);
begin
  select * into a from tests.fixture_user() limit 1;
  select * into opfer from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;

  -- Doppel mit genau drei Spielern, das Opfer wurde nicht gefragt.
  perform tests.act_as(a.auth_id);
  v_id := public.create_booking(v_court, s1, 'doppel', array[opfer.member_id, c.member_id]);
  perform set_config('role', 'postgres', true);

  perform tests.act_as(opfer.auth_id);
  return next lives_ok(format('select public.leave_booking(%L)', v_id),
    'Das Opfer kann sich austragen, auch unter der Untergrenze');
  return next lives_ok(
    format('select public.create_booking(%L, %L, ''einzel'', ''{}''::uuid[], ''{}''::text[], true)', v_court2, s1),
    'und danach zur selben Zeit selbst buchen');
  perform set_config('role', 'postgres', true);

  return next is((select partner_wanted from public.bookings where id = v_id), true,
    'Die Buchung sucht jetzt Mitspieler');
  return next is((select status::text from public.bookings where id = v_id), 'active',
    'und bleibt bestehen');
  return next ok(exists (select 1 from public.notifications
                          where member_id = a.member_id and kind = 'player_left'
                            and body like '%sucht jetzt Mitspieler%'),
    'Der Bucher erfaehrt es');
end; $f$;

-- ---------------------------------------------------------------------------
-- 3.3 Nachruecken ohne Zugang
-- ---------------------------------------------------------------------------

create or replace function tests.test_audit_nachruecken_nur_mit_zugang()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1000, 1); a record; gesperrt record; c record;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into gesperrt from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  perform public.event_anmelden(v_event, 0);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(gesperrt.auth_id);
  perform public.event_anmelden(v_event, 0);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(c.auth_id);
  perform public.event_anmelden(v_event, 0);
  perform set_config('role', 'postgres', true);

  -- Gesperrt, ohne dass die Warteliste geraeumt wurde (Altbestand). Ohne
  -- Anmeldung, sonst greift die Selbstpflege-Sperre.
  perform set_config('request.jwt.claims', null, true);
  update public.members set login_disabled_at = now() where id = gesperrt.member_id;

  perform tests.act_as(a.auth_id);
  perform public.event_abmelden(v_event);
  perform set_config('role', 'postgres', true);

  return next is(
    (select status::text from public.event_registrations where event_id = v_event and member_id = gesperrt.member_id),
    'waitlisted', 'Wer keinen Zugang hat, rueckt nicht nach');
  return next is((tests.event_forderung(v_event, gesperrt.member_id)).id, null,
    'und bekommt keine Forderung');
  return next is(
    (select status::text from public.event_registrations where event_id = v_event and member_id = c.member_id),
    'registered', 'Der Naechste mit Zugang rueckt nach');
end; $f$;

create or replace function tests.test_audit_sperre_und_austritt_raeumen_warteliste()
returns setof text language plpgsql as $f$
declare v_event uuid := tests.fixture_event(1000, 1); adm record; a record; b record; c record;
        v_heute date := private.heute();
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  insert into public.memberships (member_id, number, started_on)
  values (c.member_id, 'ZZ-' || substr(gen_random_uuid()::text, 1, 8), current_date - 100);

  perform tests.act_as(a.auth_id);
  perform public.event_anmelden(v_event, 0);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(b.auth_id);
  perform public.event_anmelden(v_event, 0);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(c.auth_id);
  perform public.event_anmelden(v_event, 0);
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  perform public.set_login_disabled(b.member_id, true);
  perform public.end_membership(c.member_id, v_heute);
  perform set_config('role', 'postgres', true);

  return next is(
    (select status::text from public.event_registrations where event_id = v_event and member_id = b.member_id),
    'cancelled', 'Sperren nimmt von der Warteliste');
  return next is(
    (select status::text from public.event_registrations where event_id = v_event and member_id = c.member_id),
    'cancelled', 'Austritt zu heute auch');
  return next is(
    (select status::text from public.event_registrations where event_id = v_event and member_id = a.member_id),
    'registered', 'Angemeldete bleiben angemeldet');
end; $f$;

-- ---------------------------------------------------------------------------
-- 3.4 S15 in day_schedule, open_matches und booking_players
-- ---------------------------------------------------------------------------

create or replace function tests.test_audit_alte_buchungen_nur_fuer_beteiligte()
returns setof text language plpgsql as $f$
declare a record; b record; fremd record; adm record; v_court uuid := tests.fixture_court();
        v_doppel uuid := (select id from public.booking_types where code = 'doppel');
        s_alt timestamptz := tests.naechster_slot(-30, 12);
        s_neu timestamptz := tests.naechster_slot(-3, 12);
        v_tag_alt date := (tests.naechster_slot(-30, 12) at time zone 'Europe/Berlin')::date;
        v_tag_neu date := (tests.naechster_slot(-3, 12) at time zone 'Europe/Berlin')::date;
        v_alt uuid; v_neu uuid;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into fremd from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;

  insert into public.bookings (court_id, member_id, slot, booking_type_id, partner_wanted)
  values (v_court, a.member_id, tstzrange(s_alt, s_alt + interval '1 hour'), v_doppel, true)
  returning id into v_alt;
  insert into public.booking_players (booking_id, member_id) values (v_alt, b.member_id);
  insert into public.bookings (court_id, member_id, slot, booking_type_id)
  values (v_court, a.member_id, tstzrange(s_neu, s_neu + interval '1 hour'), v_doppel)
  returning id into v_neu;
  insert into public.booking_players (booking_id, member_id) values (v_neu, b.member_id);

  perform tests.act_as(fremd.auth_id);
  return next is((select count(*)::integer from public.day_schedule(v_tag_alt) d where d.booking_id = v_alt), 0,
    'Ein Unbeteiligter sieht die Buchung von vor einem Monat nicht im Tagesplan');
  return next is((select count(*)::integer from public.open_matches(v_tag_alt, v_tag_alt) o where o.booking_id = v_alt), 0,
    'nicht in den offenen Spielen');
  return next is((select count(*)::integer from public.booking_players where booking_id = v_alt), 0,
    'und nicht ihre Mitspieler');
  return next is((select count(*)::integer from public.day_schedule(v_tag_neu) d where d.booking_id = v_neu), 1,
    'Die von vor drei Tagen sieht er weiter');
  return next is((select count(*)::integer from public.booking_players where booking_id = v_neu), 1,
    'samt Mitspielern');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(a.auth_id);
  return next is((select count(*)::integer from public.day_schedule(v_tag_alt) d where d.booking_id = v_alt), 1,
    'Der Bucher sieht seine alte Buchung');
  return next is((select count(*)::integer from public.open_matches(v_tag_alt, v_tag_alt) o where o.booking_id = v_alt), 1,
    'auch in den offenen Spielen');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(b.auth_id);
  return next is(
    (select d.player_member_ids from public.day_schedule(v_tag_alt) d where d.booking_id = v_alt),
    array[b.member_id], 'Der Mitspieler sieht sie samt Besetzung');
  return next is((select count(*)::integer from public.booking_players where booking_id = v_alt), 1,
    'und liest die Besetzung');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  return next is((select count(*)::integer from public.day_schedule(v_tag_alt) d where d.booking_id = v_alt), 1,
    'Der Admin sieht alles');
  return next is((select count(*)::integer from public.booking_players where booking_id = v_alt), 1,
    'auch die Besetzung');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- 3.5 Platzwart und Gastgebuehren
-- ---------------------------------------------------------------------------

create or replace function tests.test_audit_platzwart_nach_spielbeginn()
returns setof text language plpgsql as $f$
declare a record; p record; adm record; v_court uuid := tests.fixture_court(); v_id uuid;
        v_doppel uuid := (select id from public.booking_types where code = 'doppel');
        v_gast uuid;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;

  -- Laeuft seit einer halben Stunde, mit einem Gast und seiner Gebuehr.
  insert into public.bookings (court_id, member_id, slot, booking_type_id)
  values (v_court, a.member_id,
          tstzrange(now() - interval '30 minutes', now() + interval '30 minutes'), v_doppel)
  returning id into v_id;
  insert into public.booking_players (booking_id, guest_name) values (v_id, 'Gast');
  perform private.sync_guest_charges(v_id, a.member_id, 1);
  select id into v_gast from public.charges where booking_id = v_id and kind = 'guest';

  perform tests.act_as(p.auth_id);
  return next throws_ok(
    format('select public.update_booking_players(%L, ''{}''::uuid[], array[''G1'', ''G2'', ''G3''])', v_id),
    '42501', 'Nach Spielbeginn können nur Administratoren die Besetzung ändern.',
    'Der Platzwart legt nach Spielbeginn keine Gastgebuehren an');
  return next throws_ok(
    format('select public.update_booking_players(%L, ''{}''::uuid[], ''{}''::text[])', v_id),
    '42501', 'Nach Spielbeginn können nur Administratoren die Besetzung ändern.',
    'und erlaesst keine');
  perform set_config('role', 'postgres', true);

  return next is(
    (select count(*)::integer from public.charges where booking_id = v_id and kind = 'guest'),
    1, 'Es gibt weiter genau eine Gastforderung');
  return next is((select status::text from public.charges where id = v_gast), 'open',
    'und sie ist unveraendert offen');

  perform tests.act_as(adm.auth_id);
  return next lives_ok(
    format('select public.update_booking_players(%L, ''{}''::uuid[], array[''Gast'', ''G2''])', v_id),
    'Der Admin darf nach Spielbeginn korrigieren');
  perform set_config('role', 'postgres', true);
  return next is(
    (select count(*)::integer from public.charges
      where booking_id = v_id and kind = 'guest' and status <> 'waived'),
    2, 'und die Gebuehren ziehen mit');
end; $f$;

select extensions.plan(1);
select extensions.pass('Tests zum Security-Audit sind eingespielt');
select * from extensions.finish();
