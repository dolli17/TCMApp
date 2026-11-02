-- ===========================================================================
-- Mitspielersuche mit LK-Bereich und Geschlecht
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
--
-- Merke: nach tests.act_as() besteht kein Zugriff mehr auf das Schema tests.
-- Die Hilfsfunktionen unten wechseln deshalb selbst die Rolle und setzen sie
-- danach zurueck.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Hilfen
-- ---------------------------------------------------------------------------

/** Mitglied mit LK (Freitext wie in members.tennis_lk) und Geschlecht. */
create or replace function tests.spieler(
  p_lk text, p_gender public.gender, p_role public.app_role default null
)
returns table (member_id uuid, auth_id uuid)
language plpgsql as $f$
declare v record;
begin
  select * into v from tests.fixture_user(p_role) limit 1;
  update public.members set tennis_lk = p_lk, gender = p_gender where id = v.member_id;
  return query select v.member_id, v.auth_id;
end; $f$;

/** Sieht dieses Mitglied die Buchung in open_matches? */
create or replace function tests.sieht(p_auth uuid, p_booking uuid)
returns boolean language plpgsql as $f$
declare v boolean;
begin
  perform tests.act_as(p_auth);
  select exists (select 1 from public.open_matches() om where om.booking_id = p_booking) into v;
  perform set_config('role', 'postgres', true);
  return v;
end; $f$;

/** Legt als p_auth ein Doppel mit Suche und Filtern an (ohne Mitspieler). */
create or replace function tests.suche(
  p_auth uuid, p_court uuid, p_start timestamptz,
  p_von numeric, p_bis numeric, p_fuer text, p_spieler uuid[] default '{}'
)
returns uuid language plpgsql as $f$
declare v uuid;
begin
  perform tests.act_as(p_auth);
  select public.create_booking(p_court, p_start, 'doppel', p_spieler, '{}'::text[], true,
                               p_von, p_bis, p_fuer) into v;
  perform set_config('role', 'postgres', true);
  return v;
end; $f$;

-- ---------------------------------------------------------------------------
-- lk_zahl
-- ---------------------------------------------------------------------------

create or replace function tests.test_suche_lk_zahl()
returns setof text language plpgsql as $f$
begin
  return next is(private.lk_zahl('LK12,3'), 12.3, '„LK12,3“');
  return next is(private.lk_zahl('LK 12.3'), 12.3, '„LK 12.3“');
  return next is(private.lk_zahl('lk7'), 7::numeric, 'klein geschrieben');
  return next is(private.lk_zahl(' 12 '), 12::numeric, 'ganze Zahl mit Leerzeichen');
  return next is(private.lk_zahl('12.3'), 12.3, 'Punkt');
  return next is(private.lk_zahl('1'), 1::numeric, 'Untergrenze 1');
  return next is(private.lk_zahl('25,0'), 25::numeric, 'Obergrenze 25');
  return next is(private.lk_zahl('25,1'), null, 'über 25 ist nicht lesbar');
  return next is(private.lk_zahl('0,9'), null, 'unter 1 ist nicht lesbar');
  return next is(private.lk_zahl('12,34'), null, 'zwei Nachkommastellen sind nicht lesbar');
  return next is(private.lk_zahl('keine'), null, 'Text ist nicht lesbar');
  return next is(private.lk_zahl(''), null, 'leer');
  return next is(private.lk_zahl(null), null, 'null');
end; $f$;

-- ---------------------------------------------------------------------------
-- Sichtbarkeit: LK
-- ---------------------------------------------------------------------------

create or replace function tests.test_suche_lk_bereich()
returns setof text language plpgsql as $f$
declare a record; m12 record; m99 record; m16 record; m10 record; m20 record; ohne record; kaputt record;
        v_court uuid := tests.fixture_court(); v_id uuid;
begin
  select * into a      from tests.spieler('LK14', 'male') limit 1;
  select * into m12    from tests.spieler('LK12,0', 'male') limit 1;
  select * into m99    from tests.spieler('9,9', 'male') limit 1;
  select * into m16    from tests.spieler('LK 16', 'male') limit 1;
  select * into m10    from tests.spieler('10', 'male') limit 1;
  select * into m20    from tests.spieler('LK20', 'male') limit 1;
  select * into ohne   from tests.spieler(null, 'male') limit 1;
  select * into kaputt from tests.spieler('weiß nicht', 'male') limit 1;

  v_id := tests.suche(a.auth_id, v_court, tests.naechster_slot(2, 10), 10, 16, null);

  return next ok(tests.sieht(m12.auth_id, v_id), 'LK im Bereich sieht die Suche');
  return next ok(tests.sieht(m16.auth_id, v_id), 'Obergrenze gehört dazu');
  return next ok(tests.sieht(m10.auth_id, v_id), 'Untergrenze gehört dazu');
  return next ok(not tests.sieht(m99.auth_id, v_id), 'Bessere LK als von sieht sie nicht');
  return next ok(not tests.sieht(m20.auth_id, v_id), 'Schwächere LK als bis sieht sie nicht');
  return next ok(not tests.sieht(ohne.auth_id, v_id), 'Ohne LK und bis < 25 nicht sichtbar');
  return next ok(not tests.sieht(kaputt.auth_id, v_id), 'Nicht lesbare LK zählt wie ohne LK');
end; $f$;

create or replace function tests.test_suche_ohne_lk()
returns setof text language plpgsql as $f$
declare a record; ohne record; v_court uuid := tests.fixture_court();
        v_bis25 uuid; v_offen uuid; v_ab uuid; v_bis uuid;
begin
  select * into a    from tests.spieler('LK14', 'male') limit 1;
  select * into ohne from tests.spieler(null, 'male') limit 1;

  v_bis25 := tests.suche(a.auth_id, v_court, tests.naechster_slot(2, 10), 10, 25, null);
  v_offen := tests.suche(a.auth_id, v_court, tests.naechster_slot(2, 12), null, null, null);
  v_ab    := tests.suche(a.auth_id, v_court, tests.naechster_slot(2, 14), 10, null, null);
  v_bis   := tests.suche(a.auth_id, v_court, tests.naechster_slot(2, 16), null, 24.9, null);

  return next ok(tests.sieht(ohne.auth_id, v_bis25), 'Ohne LK: bis = 25 ist sichtbar');
  return next ok(tests.sieht(ohne.auth_id, v_offen), 'Ohne LK: ohne Filter sichtbar');
  return next ok(tests.sieht(ohne.auth_id, v_ab), 'Ohne LK: nur von, kein bis, sichtbar');
  return next ok(not tests.sieht(ohne.auth_id, v_bis), 'Ohne LK: bis < 25 nicht sichtbar');

  return next is((select array[partner_lk_von, partner_lk_bis] from public.bookings where id = v_bis25),
    array[10, null]::numeric[], 'bis = 25 wird als keine Grenze gespeichert');

  -- Auch ein direkt gespeichertes bis = 25 (etwa von einem Admin) gilt als offen.
  return next ok(private.passt_zur_suche(ohne.member_id, null, 25, null),
    'passt_zur_suche: ohne LK und bis = 25');
  return next ok(not private.passt_zur_suche(ohne.member_id, null, 24.9, null),
    'passt_zur_suche: ohne LK und bis 24,9');
end; $f$;

-- ---------------------------------------------------------------------------
-- Sichtbarkeit: Damen/Herren
-- ---------------------------------------------------------------------------

create or replace function tests.test_suche_geschlecht()
returns setof text language plpgsql as $f$
declare a record; d record; h record; dv record; o record; v_court uuid := tests.fixture_court();
        v_damen uuid; v_herren uuid; v_alle uuid;
begin
  select * into a  from tests.spieler('LK14', 'male') limit 1;
  select * into d  from tests.spieler('LK14', 'female') limit 1;
  select * into h  from tests.spieler('LK14', 'male') limit 1;
  select * into dv from tests.spieler('LK14', 'diverse') limit 1;
  select * into o  from tests.spieler('LK14', null) limit 1;

  v_damen  := tests.suche(a.auth_id, v_court, tests.naechster_slot(3, 10), null, null, 'female');
  v_herren := tests.suche(a.auth_id, v_court, tests.naechster_slot(3, 12), null, null, 'male');
  v_alle   := tests.suche(a.auth_id, v_court, tests.naechster_slot(3, 14), null, null, null);

  return next ok(tests.sieht(d.auth_id, v_damen), 'Damen-Suche: Dame sieht sie');
  return next ok(tests.sieht(dv.auth_id, v_damen), 'Damen-Suche: divers sieht sie');
  return next ok(not tests.sieht(h.auth_id, v_damen), 'Damen-Suche: Herr sieht sie nicht');
  return next ok(not tests.sieht(o.auth_id, v_damen), 'Damen-Suche: ohne Angabe sieht sie nicht');

  return next ok(tests.sieht(h.auth_id, v_herren), 'Herren-Suche: Herr sieht sie');
  return next ok(tests.sieht(dv.auth_id, v_herren), 'Herren-Suche: divers sieht sie');
  return next ok(not tests.sieht(d.auth_id, v_herren), 'Herren-Suche: Dame sieht sie nicht');
  return next ok(not tests.sieht(o.auth_id, v_herren), 'Herren-Suche: ohne Angabe sieht sie nicht');

  return next ok(tests.sieht(o.auth_id, v_alle), 'Für alle: auch ohne Angabe sichtbar');
  return next ok(tests.sieht(d.auth_id, v_alle), 'Für alle: Dame sieht sie');
end; $f$;

-- ---------------------------------------------------------------------------
-- Bucher, Eingetragene und Platzverwalter sehen die Suche immer
-- ---------------------------------------------------------------------------

create or replace function tests.test_suche_beteiligte_und_admin()
returns setof text language plpgsql as $f$
declare a record; c record; adm record; wart record; x record;
        v_court uuid := tests.fixture_court(); v_id uuid; v_zeile record;
        v_tag date := (tests.naechster_slot(4, 10) at time zone 'Europe/Berlin')::date;
begin
  -- Alle Herren ohne LK, die Suche richtet sich an Damen mit LK 1-5.
  select * into a    from tests.spieler(null, 'male') limit 1;
  select * into c    from tests.spieler(null, 'male') limit 1;
  select * into adm  from tests.spieler(null, 'male', 'admin') limit 1;
  select * into wart from tests.spieler(null, 'male', 'groundskeeper') limit 1;
  select * into x    from tests.spieler(null, 'male') limit 1;

  v_id := tests.suche(a.auth_id, v_court, tests.naechster_slot(4, 10), 1.5, 5, 'female',
                      array[c.member_id]);

  return next ok(tests.sieht(a.auth_id, v_id), 'Der Bucher sieht seine Suche');
  return next ok(tests.sieht(c.auth_id, v_id), 'Ein Eingetragener sieht sie');
  return next ok(tests.sieht(adm.auth_id, v_id), 'Ein Admin sieht sie');
  return next ok(tests.sieht(wart.auth_id, v_id), 'Ein Platzwart (darf_plaetze) sieht sie');
  return next ok(not tests.sieht(x.auth_id, v_id), 'Ein anderes Mitglied, das nicht passt, nicht');

  perform tests.act_as(a.auth_id);
  select * into v_zeile from public.open_matches() om where om.booking_id = v_id;
  perform set_config('role', 'postgres', true);
  return next is(array[v_zeile.lk_von, v_zeile.lk_bis], array[1.5, 5]::numeric[],
    'open_matches liefert den LK-Bereich');
  return next is(v_zeile.fuer, 'female', 'open_matches liefert für wen');

  -- day_schedule zeigt jede Buchung samt Filter, auch wer nicht passt: das
  -- ist der Platzplan, nicht die Suche.
  perform tests.act_as(x.auth_id);
  select * into v_zeile from public.day_schedule(v_tag) ds where ds.booking_id = v_id;
  perform set_config('role', 'postgres', true);
  return next is(array[v_zeile.partner_lk_von, v_zeile.partner_lk_bis], array[1.5, 5]::numeric[],
    'day_schedule liefert den LK-Bereich');
  return next is(v_zeile.partner_fuer, 'female', 'day_schedule liefert für wen');
end; $f$;

-- ---------------------------------------------------------------------------
-- join_booking
-- ---------------------------------------------------------------------------

create or replace function tests.test_suche_join_booking()
returns setof text language plpgsql as $f$
declare a record; passt record; lk_falsch record; herr record; adm record;
        v_court uuid := tests.fixture_court(); v_id uuid;
begin
  select * into a        from tests.spieler('LK14', 'female') limit 1;
  select * into passt    from tests.spieler('LK12', 'female') limit 1;
  select * into lk_falsch from tests.spieler('LK20', 'female') limit 1;
  select * into herr     from tests.spieler('LK12', 'male') limit 1;
  select * into adm      from tests.spieler(null, 'male', 'admin') limit 1;

  v_id := tests.suche(a.auth_id, v_court, tests.naechster_slot(5, 10), 10, 16, 'female');

  perform tests.act_as(lk_falsch.auth_id);
  return next throws_ok(format('select public.join_booking(%L)', v_id),
    '23514', 'Diese Suche richtet sich an andere Spieler (LK oder Damen/Herren).',
    'Falsche LK: Beitritt abgelehnt');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(herr.auth_id);
  return next throws_ok(format('select public.join_booking(%L)', v_id),
    '23514', 'Diese Suche richtet sich an andere Spieler (LK oder Damen/Herren).',
    'Herr bei Damen-Suche: Beitritt abgelehnt');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(passt.auth_id);
  return next lives_ok(format('select public.join_booking(%L)', v_id),
    'Wer passt, kann beitreten');
  perform set_config('role', 'postgres', true);

  perform tests.act_as(adm.auth_id);
  return next lives_ok(format('select public.join_booking(%L)', v_id),
    'Ein Admin sieht jede Suche und kann ihr deshalb auch beitreten');
  perform set_config('role', 'postgres', true);

  return next is((select count(*)::integer from public.booking_players where booking_id = v_id), 2,
    'Nur die beiden Passenden stehen in der Besetzung');
end; $f$;

-- Was der Bucher selbst eintraegt, ist nicht eingeschraenkt.
create or replace function tests.test_suche_bucher_traegt_frei_ein()
returns setof text language plpgsql as $f$
declare a record; herr record; herr2 record; v_court uuid := tests.fixture_court(); v_id uuid;
begin
  select * into a     from tests.spieler('LK14', 'female') limit 1;
  select * into herr  from tests.spieler('LK20', 'male') limit 1;
  select * into herr2 from tests.spieler(null, 'male') limit 1;

  v_id := tests.suche(a.auth_id, v_court, tests.naechster_slot(5, 12), 10, 16, 'female',
                      array[herr.member_id]);
  return next isnt(v_id, null, 'create_booking: der Bucher trägt ein, wen er will');

  perform tests.act_as(a.auth_id);
  return next lives_ok(format('select public.update_booking_players(%L, array[%L, %L]::uuid[])',
                              v_id, herr.member_id, herr2.member_id),
    'update_booking_players: ebenso');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Gespeicherte Filter, Abschalten, Aendern
-- ---------------------------------------------------------------------------

create or replace function tests.test_suche_create_booking_speichert()
returns setof text language plpgsql as $f$
declare a record; b record; v_court uuid := tests.fixture_court(); v_id uuid; v_ohne uuid; v_b record;
        s1 timestamptz := tests.naechster_slot(2, 18); s2 timestamptz := tests.naechster_slot(2, 20);
begin
  select * into a from tests.spieler('LK14', 'male') limit 1;
  select * into b from tests.spieler('LK14', 'male') limit 1;

  v_id := tests.suche(a.auth_id, v_court, s1, 8.5, 15.5, ' Male ');
  select * into v_b from public.bookings where id = v_id;
  return next is(array[v_b.partner_lk_von, v_b.partner_lk_bis], array[8.5, 15.5]::numeric[],
    'create_booking speichert den LK-Bereich');
  return next is(v_b.partner_fuer, 'male', 'create_booking speichert für wen, normalisiert');

  -- Ohne Suche werden mitgeschickte Filter verworfen.
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s2, 'einzel', array[b.member_id], '{}'::text[], false,
                               1, 25, 'female') into v_ohne;
  perform set_config('role', 'postgres', true);
  select * into v_b from public.bookings where id = v_ohne;
  return next ok(v_b.partner_lk_von is null and v_b.partner_lk_bis is null and v_b.partner_fuer is null,
    'Ohne Suche werden Filter nicht gespeichert');
end; $f$;

create or replace function tests.test_suche_abschalten_leert_filter()
returns setof text language plpgsql as $f$
declare a record; b record; c record; d record; v_court uuid := tests.fixture_court();
        v_id uuid; v_voll uuid; v_storno uuid; v_b record;
begin
  select * into a from tests.spieler('LK14', 'male') limit 1;
  select * into b from tests.spieler('LK14', 'male') limit 1;
  select * into c from tests.spieler('LK14', 'male') limit 1;
  select * into d from tests.spieler('LK14', 'male') limit 1;

  v_id := tests.suche(a.auth_id, v_court, tests.naechster_slot(6, 10), 10, 16, 'male');
  perform tests.act_as(a.auth_id);
  perform public.set_partner_wanted(v_id, false);
  perform set_config('role', 'postgres', true);
  select * into v_b from public.bookings where id = v_id;
  return next ok(not v_b.partner_wanted and v_b.partner_lk_von is null
                 and v_b.partner_lk_bis is null and v_b.partner_fuer is null,
    'set_partner_wanted(false) leert die Filter');

  -- Voll durch Beitritt: die Suche endet von selbst, die Filter mit ihr.
  v_voll := tests.suche(a.auth_id, v_court, tests.naechster_slot(6, 12), 10, 16, 'male',
                        array[b.member_id, c.member_id]);
  perform tests.act_as(d.auth_id);
  perform public.join_booking(v_voll);
  perform set_config('role', 'postgres', true);
  select * into v_b from public.bookings where id = v_voll;
  return next ok(not v_b.partner_wanted and v_b.partner_lk_von is null and v_b.partner_fuer is null,
    'Voll: Suche und Filter sind weg');

  -- Storno
  v_storno := tests.suche(a.auth_id, v_court, tests.naechster_slot(6, 14), 10, 16, 'male');
  perform tests.act_as(a.auth_id);
  perform public.cancel_booking(v_storno);
  perform set_config('role', 'postgres', true);
  select * into v_b from public.bookings where id = v_storno;
  return next ok(v_b.partner_lk_von is null and v_b.partner_fuer is null,
    'Storno: Filter sind weg');

  -- Auch ein direktes Update (Admin-Policy) kann keine Filter ohne Suche setzen.
  update public.bookings set partner_lk_von = 5 where id = v_id;
  return next is((select partner_lk_von from public.bookings where id = v_id), null,
    'Ohne Suche bleiben die Filter leer');
end; $f$;

create or replace function tests.test_suche_filter_aendern()
returns setof text language plpgsql as $f$
declare a record; v_court uuid := tests.fixture_court(); v_id uuid; v_b record;
begin
  select * into a from tests.spieler('LK14', 'male') limit 1;
  v_id := tests.suche(a.auth_id, v_court, tests.naechster_slot(6, 16), 10, 16, 'male');

  perform tests.act_as(a.auth_id);
  perform public.set_partner_wanted(v_id, true, 3, 9.5, 'female');
  perform set_config('role', 'postgres', true);
  select * into v_b from public.bookings where id = v_id;
  return next is(array[v_b.partner_lk_von, v_b.partner_lk_bis], array[3, 9.5]::numeric[],
    'set_partner_wanted ändert den LK-Bereich');
  return next is(v_b.partner_fuer, 'female', 'set_partner_wanted ändert für wen');

  -- Alter Aufruf ohne Filter: Suche bleibt an, Einschraenkung faellt weg.
  perform tests.act_as(a.auth_id);
  perform public.set_partner_wanted(p_booking_id => v_id, p_wanted => true);
  perform set_config('role', 'postgres', true);
  select * into v_b from public.bookings where id = v_id;
  return next ok(v_b.partner_wanted and v_b.partner_lk_von is null
                 and v_b.partner_lk_bis is null and v_b.partner_fuer is null,
    'Alter Aufruf (zwei Parameter, benannt) schaltet die Suche ohne Filter ein');
end; $f$;

-- ---------------------------------------------------------------------------
-- Ungueltige Filter
-- ---------------------------------------------------------------------------

create or replace function tests.test_suche_ungueltige_filter()
returns setof text language plpgsql as $f$
declare a record; v_court uuid := tests.fixture_court(); v_id uuid;
        s1 timestamptz := tests.naechster_slot(3, 18);
begin
  select * into a from tests.spieler('LK14', 'male') limit 1;
  v_id := tests.suche(a.auth_id, v_court, tests.naechster_slot(3, 20), null, null, null);

  perform tests.act_as(a.auth_id);
  return next throws_ok(format(
    $q$select public.create_booking(%L, %L, 'doppel', '{}'::uuid[], '{}'::text[], true, 0.9, null, null)$q$,
    v_court, s1), '22023', 'Die LK muss zwischen 1 und 25 liegen.', 'von unter 1');
  return next throws_ok(format(
    $q$select public.create_booking(%L, %L, 'doppel', '{}'::uuid[], '{}'::text[], true, null, 25.1, null)$q$,
    v_court, s1), '22023', 'Die LK muss zwischen 1 und 25 liegen.', 'bis über 25');
  return next throws_ok(format(
    $q$select public.create_booking(%L, %L, 'doppel', '{}'::uuid[], '{}'::text[], true, 16, 10, null)$q$,
    v_court, s1), '22023', 'Beim LK-Bereich darf „von“ nicht größer sein als „bis“.', 'von > bis');
  return next throws_ok(format(
    $q$select public.create_booking(%L, %L, 'doppel', '{}'::uuid[], '{}'::text[], true, 10.25, null, null)$q$,
    v_court, s1), '22023', 'Die LK hat höchstens eine Nachkommastelle.', 'zwei Nachkommastellen');
  return next throws_ok(format(
    $q$select public.create_booking(%L, %L, 'doppel', '{}'::uuid[], '{}'::text[], true, null, null, 'kids')$q$,
    v_court, s1), '22023', 'Die Suche kann nur auf Damen oder Herren eingeschränkt werden.',
    'fuer unbekannt');

  return next throws_ok(format('select public.set_partner_wanted(%L, true, 20, 5, null)', v_id),
    '22023', 'Beim LK-Bereich darf „von“ nicht größer sein als „bis“.',
    'set_partner_wanted prüft ebenso');
  return next throws_ok(format('select public.set_partner_wanted(%L, true, null, null, %L)', v_id, 'diverse'),
    '22023', 'Die Suche kann nur auf Damen oder Herren eingeschränkt werden.',
    'set_partner_wanted: divers ist keine Einschränkung');
  perform set_config('role', 'postgres', true);

  return next throws_ok(format('update public.bookings set partner_lk_bis = 30 where id = %L', v_id),
    '23514', null, 'Constraint: bis außerhalb 1-25');
  return next throws_ok(format('update public.bookings set partner_lk_von = 12, partner_lk_bis = 11 where id = %L', v_id),
    '23514', null, 'Constraint: von > bis');
  return next throws_ok(format('update public.bookings set partner_fuer = %L where id = %L', 'kids', v_id),
    '23514', null, 'Constraint: fuer unbekannt');
end; $f$;

-- ---------------------------------------------------------------------------
-- Abwaertskompatibel
-- ---------------------------------------------------------------------------

create or replace function tests.test_suche_alte_aufrufe()
returns setof text language plpgsql as $f$
declare a record; o record; v_court uuid := tests.fixture_court(); v_id uuid; v_b record;
        s1 timestamptz := tests.naechster_slot(4, 18);
begin
  select * into a from tests.spieler('LK14', 'male') limit 1;
  select * into o from tests.spieler(null, null) limit 1;

  -- So ruft die eingefrorene Expo-App (PostgREST, benannt) create_booking auf.
  perform tests.act_as(a.auth_id);
  select public.create_booking(p_court_id => v_court, p_starts_at => s1,
                               p_booking_type_code => 'doppel',
                               p_player_member_ids => '{}'::uuid[], p_guest_names => '{}'::text[],
                               p_partner_wanted => true) into v_id;
  perform set_config('role', 'postgres', true);
  select * into v_b from public.bookings where id = v_id;
  return next ok(v_b.partner_wanted and v_b.partner_lk_von is null and v_b.partner_fuer is null,
    'Alter create_booking-Aufruf: Suche ohne Filter');
  return next ok(tests.sieht(o.auth_id, v_id), 'Ohne Filter sieht jedes Mitglied die Suche');

  return next is((select count(*)::integer from pg_proc
                   where proname in ('create_booking', 'set_partner_wanted', 'open_matches', 'day_schedule')
                     and pronamespace = 'public'::regnamespace), 4,
    'Keine alten Überladungen übrig');
end; $f$;

select extensions.plan(1);
select extensions.pass('Tests zur Mitspielersuche mit Filtern sind eingespielt');
select * from extensions.finish();
