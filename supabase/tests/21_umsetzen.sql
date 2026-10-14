-- ===========================================================================
-- Buchung umsetzen: anderer Platz, andere Zeit
--
-- Die Platzverwaltung legt eine Buchung auf einen freien Platz oder eine
-- andere Zeit. Wer drin steht, wird benachrichtigt; Sperrungen, Serien,
-- Vergangenes und belegte Plaetze werden abgewiesen.
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql. Nach tests.act_as() besteht kein Zugriff mehr
-- auf das Schema tests - Zeiten und Namen deshalb vorher in Variablen holen.
-- ===========================================================================

/** Eine Buchung, die gerade laeuft oder schon vorbei ist - am RPC vorbei angelegt. */
create or replace function tests.buchung_direkt(
  p_court_id uuid, p_member_id uuid, p_von timestamptz, p_bis timestamptz
)
returns uuid language sql as $f$
  insert into public.bookings (court_id, slot, kind, booking_type_id, member_id, created_by)
  values (p_court_id, tstzrange(p_von, p_bis, '[)'), 'booking',
          (select id from public.booking_types where code = 'einzel'), p_member_id, p_member_id)
  returning id;
$f$;

-- ---------------------------------------------------------------------------
-- Was gelingt
-- ---------------------------------------------------------------------------

create or replace function tests.test_umsetzen_platz_und_zeit()
returns setof text language plpgsql as $f$
declare p record; a record; b record;
        p1 uuid := tests.fixture_court(); p2 uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(3, 14); v_id uuid;
begin
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  select public.create_booking(p1, s1, 'einzel', array[b.member_id]) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(p.auth_id);
  return next lives_ok(format('select public.move_booking(%L, %L, %L)', v_id, p2, s1),
    'Der Platzwart setzt die Buchung auf einen anderen Platz');
  perform set_config('role', 'postgres', true);
  return next is((select court_id from public.bookings where id = v_id), p2,
    'Die Buchung liegt jetzt auf dem anderen Platz');

  perform tests.act_as(p.auth_id);
  return next lives_ok(
    format('select public.move_booking(%L, %L, %L)', v_id, p2, s1 + interval '2 hours'),
    'Der Platzwart verlegt die Buchung auf eine andere Zeit');
  perform set_config('role', 'postgres', true);
  return next is((select slot from public.bookings where id = v_id),
    tstzrange(s1 + interval '2 hours', s1 + interval '3 hours', '[)'),
    'Start und Ende wandern mit, die Dauer bleibt');

  -- Weiter als lead_days in der Zukunft ist fuer die Platzverwaltung kein Hindernis.
  perform tests.act_as(p.auth_id);
  return next lives_ok(
    format('select public.move_booking(%L, %L, %L)', v_id, p1, s1 + interval '30 days'),
    'Der Buchungsvorlauf gilt beim Umsetzen nicht');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_umsetzen_ueberschneidung_mit_sich_selbst()
returns setof text language plpgsql as $f$
declare p record; a record; b record;
        p1 uuid := tests.fixture_court(); s1 timestamptz := tests.naechster_slot(3, 10); v_id uuid;
begin
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  select public.create_booking(p1, s1, 'einzel', array[b.member_id]) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(p.auth_id);
  return next lives_ok(
    format('select public.move_booking(%L, %L, %L)', v_id, p1, s1 + interval '30 minutes'),
    'Eine halbe Stunde nach hinten ueberschneidet sich nur mit der eigenen alten Lage');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_umsetzen_laufende_buchung()
returns setof text language plpgsql as $f$
declare p record; a record;
        p1 uuid := tests.fixture_court(); p2 uuid := tests.fixture_court();
        v_von timestamptz := date_trunc('hour', now()); v_id uuid;
begin
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into a from tests.fixture_user() limit 1;
  v_id := tests.buchung_direkt(p1, a.member_id, v_von, v_von + interval '1 hour');

  perform tests.act_as(p.auth_id);
  return next throws_ok(
    format('select public.move_booking(%L, %L, %L)', v_id, p2, v_von + interval '1 hour'),
    '22023', 'Die Buchung laeuft schon - sie kann nur noch den Platz wechseln.',
    'Eine laufende Buchung bekommt keine neue Zeit');
  return next lives_ok(format('select public.move_booking(%L, %L, %L)', v_id, p2, v_von),
    'Eine laufende Buchung wechselt den Platz');
  perform set_config('role', 'postgres', true);
  return next is((select court_id from public.bookings where id = v_id), p2,
    'Die laufende Buchung liegt auf dem neuen Platz');
end; $f$;

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------

create or replace function tests.test_umsetzen_rechte()
returns setof text language plpgsql as $f$
declare a record; b record; c record;
        p1 uuid := tests.fixture_court(); p2 uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(3, 11); v_id uuid;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  select public.create_booking(p1, s1, 'einzel', array[b.member_id]) into v_id;
  return next throws_ok(format('select public.move_booking(%L, %L, %L)', v_id, p2, s1),
    '42501', 'Buchungen umsetzen kann nur die Platzverwaltung.',
    'Auch der Bucher selbst kann nicht umsetzen');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(c.auth_id);
  return next throws_ok(format('select public.move_booking(%L, %L, %L)', v_id, p2, s1),
    '42501', 'Buchungen umsetzen kann nur die Platzverwaltung.',
    'Ein einfaches Mitglied kann nicht umsetzen');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Belegt
-- ---------------------------------------------------------------------------

create or replace function tests.test_umsetzen_belegt()
returns setof text language plpgsql as $f$
declare p record; a record; b record; c record; d record; e record;
        p1 uuid := tests.fixture_court(); p2 uuid := tests.fixture_court();
        p3 uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(3, 12); v_id uuid; n3 text; b_name text;
begin
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into c from tests.fixture_user() limit 1;
  select * into d from tests.fixture_user() limit 1;
  select * into e from tests.fixture_user() limit 1;
  n3 := tests.platzname(p3);
  select first_name || ' ' || last_name into b_name from public.members where id = b.member_id;

  perform tests.act_as(a.auth_id);
  select public.create_booking(p1, s1, 'einzel', array[b.member_id]) into v_id;
  perform set_config('role', 'postgres', true);
  perform tests.act_as(c.auth_id);
  perform public.create_booking(p2, s1, 'einzel', array[d.member_id]);
  perform set_config('role', 'postgres', true);
  -- b spielt um 16 Uhr woanders mit.
  perform tests.act_as(e.auth_id);
  perform public.create_booking(p3, s1 + interval '4 hours', 'einzel', array[b.member_id]);
  perform set_config('role', 'postgres', true);

  perform tests.act_as(p.auth_id);
  return next throws_ok(format('select public.move_booking(%L, %L, %L)', v_id, p2, s1),
    '23P01', 'Dieser Platz ist zu der Zeit bereits belegt.',
    'Auf einen belegten Platz wird nicht umgesetzt');
  return next throws_ok(
    format('select public.move_booking(%L, %L, %L)', v_id, p2, s1 + interval '30 minutes'),
    '23P01', 'Dieser Platz ist zu der Zeit bereits belegt.',
    'Auch eine teilweise Ueberschneidung auf dem Zielplatz zaehlt');
  return next throws_ok(
    format('select public.move_booking(%L, %L, %L)', v_id, p1, s1 + interval '4 hours'),
    '23514', format('%s spielt zu dieser Zeit schon auf %s.', b_name, n3),
    'Ein Mitspieler, der zur neuen Zeit woanders spielt, verhindert das Umsetzen');
  perform set_config('role', 'postgres', true);

  return next is((select slot from public.bookings where id = v_id),
    tstzrange(s1, s1 + interval '1 hour', '[)'), 'Nach den Abweisungen liegt die Buchung unveraendert');
end; $f$;

-- ---------------------------------------------------------------------------
-- Abweisungen
-- ---------------------------------------------------------------------------

create or replace function tests.test_umsetzen_zeitregeln()
returns setof text language plpgsql as $f$
declare p record; a record; b record;
        p1 uuid := tests.fixture_court(); s1 timestamptz := tests.naechster_slot(3, 14);
        v_id uuid; v_gestern timestamptz := tests.naechster_slot(-1, 14);
begin
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  select public.create_booking(p1, s1, 'einzel', array[b.member_id]) into v_id;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(p.auth_id);
  return next throws_ok(
    format('select public.move_booking(%L, %L, %L)', v_id, p1, s1 + interval '15 minutes'),
    '22023', 'Startzeit muss auf ein 30-Minuten-Raster fallen.', 'Das Raster gilt');
  return next throws_ok(
    format('select public.move_booking(%L, %L, %L)', v_id, p1, s1 - interval '7 hours'),
    '22023', 'Vor 08:00 wird nicht gespielt.', 'Die Oeffnungszeit gilt');
  return next throws_ok(
    format('select public.move_booking(%L, %L, %L)', v_id, p1, s1 + interval '6 hours 30 minutes'),
    '22023', 'Die Buchung endet nach 21:00 Uhr.', 'Die Schliesszeit gilt');
  return next throws_ok(format('select public.move_booking(%L, %L, %L)', v_id, p1, v_gestern),
    '22023', 'Dieser Zeitpunkt liegt in der Vergangenheit.', 'In die Vergangenheit wird nicht verlegt');
  return next throws_ok(format('select public.move_booking(%L, %L, %L)', v_id, p1, s1),
    '22023', 'Die Buchung liegt schon dort.', 'Ohne Aenderung wird abgewiesen');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_umsetzen_was_nicht_geht()
returns setof text language plpgsql as $f$
declare p record; a record; b record;
        p1 uuid := tests.fixture_court(); p2 uuid := tests.fixture_court();
        p_alt uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(3, 15);
        v_von date := (now() at time zone 'Europe/Berlin')::date + 1;
        v_id uuid; v_sperre uuid; v_serie uuid; v_termin uuid; v_vorbei uuid;
begin
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  update public.courts set active = false where id = p_alt;

  perform tests.act_as(a.auth_id);
  select public.create_booking(p1, s1, 'einzel', array[b.member_id]) into v_id;
  perform set_config('role', 'postgres', true);

  insert into public.bookings (court_id, slot, kind, booking_type_id, title)
  values (p1, tstzrange(s1 + interval '2 hours', s1 + interval '3 hours', '[)'), 'blocking',
          (select id from public.booking_types where code = 'platzpflege'), 'Regen')
  returning id into v_sperre;

  v_vorbei := tests.buchung_direkt(p1, a.member_id, now() - interval '3 hours', now() - interval '2 hours');

  perform tests.act_as(p.auth_id);
  select s.series_id into v_serie
  from public.create_series(p1, 'training', extract(dow from v_von + 1)::integer,
                            '18:00', '19:00', v_von, v_von + 13, 'Training') s;
  perform set_config('role', 'postgres', true);
  select id into v_termin from public.bookings where series_id = v_serie limit 1;

  perform tests.act_as(p.auth_id);
  return next throws_ok(format('select public.move_booking(%L, %L, %L)', v_id, p_alt, s1),
    '22023', 'Auf diesen Platz kann nicht umgesetzt werden, er ist stillgelegt.',
    'Auf einen stillgelegten Platz wird nicht umgesetzt');
  return next throws_ok(
    format('select public.move_booking(%L, %L, %L)', v_sperre, p2, s1 + interval '2 hours'),
    '22023', 'Eine Sperrung laesst sich nicht umsetzen.', 'Sperrungen werden nicht umgesetzt');
  return next throws_ok(
    format('select public.move_booking(%L, %L, (select lower(slot) from public.bookings where id = %L))',
           v_termin, p2, v_termin),
    '22023', 'Ein Serientermin laesst sich nicht einzeln umsetzen.',
    'Serientermine werden nicht umgesetzt');
  return next throws_ok(
    format('select public.move_booking(%L, %L, (select lower(slot) from public.bookings where id = %L))',
           v_vorbei, p2, v_vorbei),
    '23514', 'Die Buchung ist schon vorbei.', 'Vergangene Buchungen werden nicht umgesetzt');

  perform public.cancel_booking(v_id, 'Regen');
  return next throws_ok(format('select public.move_booking(%L, %L, %L)', v_id, p2, s1),
    '23514', 'Diese Buchung ist storniert.', 'Stornierte Buchungen werden nicht umgesetzt');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Folgen: Benachrichtigung und Gastgebuehr
-- ---------------------------------------------------------------------------

create or replace function tests.test_umsetzen_benachrichtigt_und_gastgebuehr()
returns setof text language plpgsql as $f$
declare p record; a record; b record;
        p1 uuid := tests.fixture_court(); p2 uuid := tests.fixture_court();
        s1 timestamptz := tests.naechster_slot(4, 10); v_id uuid; v_alt text; v_neu text;
begin
  select * into p from tests.fixture_user('groundskeeper', 'Platzwart') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;

  perform tests.act_as(a.auth_id);
  select public.create_booking(p1, s1, 'doppel', array[b.member_id], array['Gast'], true) into v_id;
  perform set_config('role', 'postgres', true);
  v_alt := private.booking_label(v_id);

  perform tests.act_as(p.auth_id);
  perform public.move_booking(v_id, p2, s1 + interval '1 hour', '  Platz 1 unter Wasser ');
  perform set_config('role', 'postgres', true);
  v_neu := private.booking_label(v_id);

  return next is(
    (select count(*)::integer from public.notifications
      where kind = 'booking_moved' and member_id in (a.member_id, b.member_id)),
    2, 'Bucher und Mitspieler werden benachrichtigt');
  return next is(
    (select count(*)::integer from public.notifications
      where kind = 'booking_moved' and member_id = p.member_id),
    0, 'Wer umsetzt, bekommt keine Nachricht');
  return next is(
    (select title from public.notifications where kind = 'booking_moved' and member_id = a.member_id),
    'Deine Platzbuchung wurde verlegt', 'Der Titel sagt, was passiert ist');
  return next is(
    (select body from public.notifications where kind = 'booking_moved' and member_id = a.member_id),
    format('Die Buchung am %s wurde verlegt: neu am %s. Grund: Platz 1 unter Wasser', v_alt, v_neu),
    'Der Text nennt alten und neuen Ort und den Grund');

  return next is(
    (select description from public.charges where booking_id = v_id and kind = 'guest'),
    'Gastgebuehr ' || v_neu, 'Die offene Gastgebuehr nennt den neuen Ort');
  return next is(
    (select status::text from public.charges where booking_id = v_id and kind = 'guest'),
    'open', 'Die Gastgebuehr bleibt offen - gespielt wird ja trotzdem');
  return next is(
    (select partner_wanted from public.bookings where id = v_id), true,
    'Die Suche nach Mitspielern bleibt bestehen');
end; $f$;

create or replace function tests.test_umsetzen_ist_mail_und_push()
returns setof text language plpgsql as $f$
begin
  return next ok('booking_moved' = any (private.notification_mail_kinds()),
    'booking_moved geht per Mail');
  return next ok('booking_moved' = any (private.notification_push_kinds()),
    'booking_moved geht als Push');
  return next ok('charge_returned' = any (private.notification_mail_kinds()),
    'Die bisherigen Mailarten bleiben erhalten');
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer das Umsetzen sind eingespielt');
select * from extensions.finish();
