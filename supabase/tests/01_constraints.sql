-- ===========================================================================
-- Datenbank-Garantien: Doppelbuchungsschutz, Zeitraeume, Perioden-Sperre
--
-- Jede Testfunktion laeuft ueber runtests() in einer eigenen Transaktion, die
-- am Ende zurueckgerollt wird. Die Tests hinterlassen also keinen Zustand.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Hilfsdaten fuer einen Test anlegen
-- ---------------------------------------------------------------------------
create or replace function tests.fixture_court()
returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  insert into public.courts (name, short_name)
  values ('Testplatz ' || gen_random_uuid()::text, 'TP')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function tests.fixture_member(p_name text default 'Test')
returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  insert into public.members (first_name, last_name)
  values (p_name, 'Person ' || substr(gen_random_uuid()::text, 1, 8))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function tests.type_einzel()
returns uuid
language sql
as $$ select id from public.booking_types where code = 'einzel'; $$;

-- ---------------------------------------------------------------------------
-- Doppelbuchungsschutz
-- ---------------------------------------------------------------------------
create or replace function tests.test_doppelbuchung_wird_verhindert()
returns setof text
language plpgsql
as $$
declare
  v_court uuid := tests.fixture_court();
  v_mem   uuid := tests.fixture_member();
  v_start timestamptz := date_trunc('hour', now()) + interval '30 days';
begin
  insert into public.bookings (court_id, slot, booking_type_id, member_id)
  values (v_court, tstzrange(v_start, v_start + interval '1 hour', '[)'),
          tests.type_einzel(), v_mem);

  return next throws_ok(
    format($q$insert into public.bookings (court_id, slot, booking_type_id, member_id)
              values (%L, tstzrange(%L, %L, '[)'), %L, %L)$q$,
           v_court, v_start, v_start + interval '1 hour', tests.type_einzel(), v_mem),
    '23P01',
    null,
    'Identischer Slot auf demselben Platz wird abgelehnt'
  );
end;
$$;

create or replace function tests.test_teilueberlappung_wird_verhindert()
returns setof text
language plpgsql
as $$
declare
  v_court uuid := tests.fixture_court();
  v_mem   uuid := tests.fixture_member();
  v_start timestamptz := date_trunc('hour', now()) + interval '31 days';
begin
  insert into public.bookings (court_id, slot, booking_type_id, member_id)
  values (v_court, tstzrange(v_start, v_start + interval '1 hour', '[)'),
          tests.type_einzel(), v_mem);

  return next throws_ok(
    format($q$insert into public.bookings (court_id, slot, booking_type_id, member_id)
              values (%L, tstzrange(%L, %L, '[)'), %L, %L)$q$,
           v_court, v_start + interval '30 min', v_start + interval '90 min',
           tests.type_einzel(), v_mem),
    '23P01',
    null,
    'Teilweise Ueberlappung wird abgelehnt'
  );
end;
$$;

create or replace function tests.test_angrenzende_slots_erlaubt()
returns setof text
language plpgsql
as $$
declare
  v_court uuid := tests.fixture_court();
  v_mem   uuid := tests.fixture_member();
  v_start timestamptz := date_trunc('hour', now()) + interval '32 days';
begin
  insert into public.bookings (court_id, slot, booking_type_id, member_id)
  values (v_court, tstzrange(v_start, v_start + interval '1 hour', '[)'),
          tests.type_einzel(), v_mem);

  return next lives_ok(
    format($q$insert into public.bookings (court_id, slot, booking_type_id, member_id)
              values (%L, tstzrange(%L, %L, '[)'), %L, %L)$q$,
           v_court, v_start + interval '1 hour', v_start + interval '2 hours',
           tests.type_einzel(), v_mem),
    'Direkt angrenzender Slot ist erlaubt - halboffenes Intervall'
  );
end;
$$;

create or replace function tests.test_gleicher_slot_anderer_platz_erlaubt()
returns setof text
language plpgsql
as $$
declare
  v_a     uuid := tests.fixture_court();
  v_b     uuid := tests.fixture_court();
  v_mem   uuid := tests.fixture_member();
  v_start timestamptz := date_trunc('hour', now()) + interval '33 days';
begin
  insert into public.bookings (court_id, slot, booking_type_id, member_id)
  values (v_a, tstzrange(v_start, v_start + interval '1 hour', '[)'),
          tests.type_einzel(), v_mem);

  return next lives_ok(
    format($q$insert into public.bookings (court_id, slot, booking_type_id, member_id)
              values (%L, tstzrange(%L, %L, '[)'), %L, %L)$q$,
           v_b, v_start, v_start + interval '1 hour', tests.type_einzel(), v_mem),
    'Gleiche Zeit auf einem anderen Platz ist erlaubt'
  );
end;
$$;

create or replace function tests.test_storno_gibt_slot_frei()
returns setof text
language plpgsql
as $$
declare
  v_court uuid := tests.fixture_court();
  v_mem   uuid := tests.fixture_member();
  v_start timestamptz := date_trunc('hour', now()) + interval '34 days';
  v_id    uuid;
begin
  insert into public.bookings (court_id, slot, booking_type_id, member_id)
  values (v_court, tstzrange(v_start, v_start + interval '1 hour', '[)'),
          tests.type_einzel(), v_mem)
  returning id into v_id;

  update public.bookings
     set status = 'cancelled', cancelled_at = now()
   where id = v_id;

  return next lives_ok(
    format($q$insert into public.bookings (court_id, slot, booking_type_id, member_id)
              values (%L, tstzrange(%L, %L, '[)'), %L, %L)$q$,
           v_court, v_start, v_start + interval '1 hour', tests.type_einzel(), v_mem),
    'Nach dem Storno ist der Slot wieder buchbar'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Form des Zeitraums
-- ---------------------------------------------------------------------------
create or replace function tests.test_geschlossenes_intervall_abgelehnt()
returns setof text
language plpgsql
as $$
declare
  v_court uuid := tests.fixture_court();
  v_mem   uuid := tests.fixture_member();
  v_start timestamptz := date_trunc('hour', now()) + interval '35 days';
begin
  return next throws_ok(
    format($q$insert into public.bookings (court_id, slot, booking_type_id, member_id)
              values (%L, tstzrange(%L, %L, '[]'), %L, %L)$q$,
           v_court, v_start, v_start + interval '1 hour', tests.type_einzel(), v_mem),
    '23514',
    null,
    'Nicht halboffener Zeitraum wird abgelehnt'
  );
end;
$$;

create or replace function tests.test_buchung_ohne_mitglied_abgelehnt()
returns setof text
language plpgsql
as $$
declare
  v_court uuid := tests.fixture_court();
  v_start timestamptz := date_trunc('hour', now()) + interval '36 days';
begin
  return next throws_ok(
    format($q$insert into public.bookings (court_id, slot, booking_type_id, kind)
              values (%L, tstzrange(%L, %L, '[)'), %L, 'booking')$q$,
           v_court, v_start, v_start + interval '1 hour', tests.type_einzel()),
    '23514',
    null,
    'Buchung ohne Mitglied wird abgelehnt'
  );
end;
$$;

create or replace function tests.test_blockung_ohne_titel_abgelehnt()
returns setof text
language plpgsql
as $$
declare
  v_court uuid := tests.fixture_court();
  v_start timestamptz := date_trunc('hour', now()) + interval '37 days';
begin
  return next throws_ok(
    format($q$insert into public.bookings (court_id, slot, booking_type_id, kind)
              values (%L, tstzrange(%L, %L, '[)'), %L, 'blocking')$q$,
           v_court, v_start, v_start + interval '1 hour', tests.type_einzel()),
    '23514',
    null,
    'Blockung ohne Titel wird abgelehnt'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Mitspieler
-- ---------------------------------------------------------------------------
create or replace function tests.test_mitspieler_entweder_mitglied_oder_gast()
returns setof text
language plpgsql
as $$
declare
  v_court uuid := tests.fixture_court();
  v_mem   uuid := tests.fixture_member();
  v_start timestamptz := date_trunc('hour', now()) + interval '38 days';
  v_id    uuid;
begin
  insert into public.bookings (court_id, slot, booking_type_id, member_id)
  values (v_court, tstzrange(v_start, v_start + interval '1 hour', '[)'),
          tests.type_einzel(), v_mem)
  returning id into v_id;

  return next throws_ok(
    format($q$insert into public.booking_players (booking_id, member_id, guest_name)
              values (%L, %L, 'Gast')$q$, v_id, v_mem),
    '23514', null,
    'Mitspieler kann nicht gleichzeitig Mitglied und Gast sein'
  );

  return next throws_ok(
    format($q$insert into public.booking_players (booking_id) values (%L)$q$, v_id),
    '23514', null,
    'Mitspieler ohne Mitglied und ohne Gastname wird abgelehnt'
  );

  return next lives_ok(
    format($q$insert into public.booking_players (booking_id, guest_name)
              values (%L, 'Besuch vom Nachbarverein')$q$, v_id),
    'Gast als Freitext ist erlaubt'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Abgeschlossene Abrechnungsperioden sind unveraenderlich
-- ---------------------------------------------------------------------------
create or replace function tests.test_geschlossene_periode_sperrt_buchungen()
returns setof text
language plpgsql
as $$
declare
  v_mem    uuid := tests.fixture_member();
  v_item   uuid;
  v_period uuid;
  v_id     uuid;
begin
  insert into public.drink_items (name) values ('Testgetraenk ' || gen_random_uuid()::text)
  returning id into v_item;
  insert into public.drink_prices (drink_item_id, valid_from, price_cents)
  values (v_item, current_date - 1, 200);

  insert into public.drink_purchases (member_id, drink_item_id, quantity, unit_price_cents)
  values (v_mem, v_item, 1, 200)
  returning id, billing_period_id into v_id, v_period;

  return next isnt(v_period, null, 'Periode wird automatisch zugeordnet');

  update public.billing_periods set status = 'closed', closed_at = now() where id = v_period;

  return next throws_ok(
    format($q$update public.drink_purchases set quantity = 5 where id = %L$q$, v_id),
    '23514', null,
    'Aenderung in geschlossener Periode wird abgelehnt'
  );

  return next throws_ok(
    format($q$delete from public.drink_purchases where id = %L$q$, v_id),
    '23514', null,
    'Loeschen in geschlossener Periode wird abgelehnt'
  );

  return next throws_ok(
    format($q$insert into public.drink_purchases
              (member_id, drink_item_id, quantity, unit_price_cents, billing_period_id)
              values (%L, %L, 1, 200, %L)$q$, v_mem, v_item, v_period),
    '23514', null,
    'Neue Buchung in geschlossener Periode wird abgelehnt'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Weitere fachliche Constraints
-- ---------------------------------------------------------------------------
create or replace function tests.test_mitglied_kann_nicht_sein_eigener_zahler_sein()
returns setof text
language plpgsql
as $$
declare v_mem uuid := tests.fixture_member();
begin
  return next throws_ok(
    format($q$update public.members set billing_payer_id = %L where id = %L$q$, v_mem, v_mem),
    '23514', null,
    'Ein Mitglied kann nicht sein eigener Zahler sein'
  );
end;
$$;

create or replace function tests.test_mandat_nicht_vor_unterschrift_benutzt()
returns setof text
language plpgsql
as $$
declare
  v_mem uuid := tests.fixture_member();
  v_ba  uuid;
begin
  insert into public.bank_accounts (member_id, iban_encrypted, iban_last4, holder)
  values (v_mem, '\x00'::bytea, '1234', 'Test')
  returning id into v_ba;

  return next throws_ok(
    format($q$insert into public.sepa_mandates
              (member_id, bank_account_id, reference, signed_on, last_used_on)
              values (%L, %L, 'TEST-1', current_date - 10, current_date - 20)$q$, v_mem, v_ba),
    '23514', null,
    'Mandat kann nicht vor seiner Unterschrift benutzt worden sein'
  );
end;
$$;

create or replace function tests.test_getraenkemenge_muss_positiv_sein()
returns setof text
language plpgsql
as $$
declare
  v_mem  uuid := tests.fixture_member();
  v_item uuid;
begin
  insert into public.drink_items (name) values ('Testartikel ' || gen_random_uuid()::text)
  returning id into v_item;

  return next throws_ok(
    format($q$insert into public.drink_purchases
              (member_id, drink_item_id, quantity, unit_price_cents)
              values (%L, %L, 0, 200)$q$, v_mem, v_item),
    '23514', null,
    'Menge null wird abgelehnt'
  );

  return next throws_ok(
    format($q$insert into public.drink_purchases
              (member_id, drink_item_id, quantity, unit_price_cents)
              values (%L, %L, -1, 200)$q$, v_mem, v_item),
    '23514', null,
    'Negative Menge wird abgelehnt'
  );
end;
$$;

create or replace function tests.test_gesamtpreis_wird_berechnet()
returns setof text
language plpgsql
as $$
declare
  v_mem   uuid := tests.fixture_member();
  v_item  uuid;
  v_total integer;
begin
  insert into public.drink_items (name) values ('Preistest ' || gen_random_uuid()::text)
  returning id into v_item;

  insert into public.drink_purchases (member_id, drink_item_id, quantity, unit_price_cents)
  values (v_mem, v_item, 3, 250)
  returning total_cents into v_total;

  return next is(v_total, 750, 'Gesamtpreis wird aus Menge und Einzelpreis berechnet');
end;
$$;

create or replace function tests.test_doppelte_forderung_wird_verhindert()
returns setof text
language plpgsql
as $$
declare v_mem uuid := tests.fixture_member();
begin
  insert into public.charges (member_id, payer_id, kind, period_label, amount_cents, description)
  values (v_mem, v_mem, 'fee', '2026', 19000, 'Jahresbeitrag 2026');

  return next throws_ok(
    format($q$insert into public.charges
              (member_id, payer_id, kind, period_label, amount_cents, description)
              values (%L, %L, 'fee', '2026', 19000, 'Jahresbeitrag 2026')$q$, v_mem, v_mem),
    '23505', null,
    'Zweiter Beitragslauf erzeugt keine doppelte Forderung'
  );
end;
$$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Der eine Test hier belegt, dass die Definitionen selbst
-- fehlerfrei eingespielt wurden - ohne Plan haelt pg_prove die Datei sonst
-- fuer kaputt.
select extensions.plan(1);
select extensions.pass('Constraint-Tests sind eingespielt');
select * from extensions.finish();
