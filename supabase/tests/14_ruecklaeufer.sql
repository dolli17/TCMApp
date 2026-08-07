-- ===========================================================================
-- Ruecklaeufer und Abschluss
--
-- Zwei Tests tragen die Datei:
--
--   1. Ein Ruecklaeufer trifft ALLE Forderungen seiner Kennung. Fuer die
--      Familienlastschrift ueber 270 Euro kam kein Geld - also fuer keines der
--      drei Kinder. Wuerde nur eine Forderung zurueckfallen, stuenden die
--      anderen beiden als bezahlt da, und der Verein haette 180 Euro
--      verbucht, die nie ankamen.
--   2. Danach ist die Forderung wieder aufnehmbar. Der Teilindex deckt nur
--      'pending' und 'settled' ab und gibt sie mit dem Ruecklaeufer frei.
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
-- ===========================================================================

/** Ein eingereichter Lauf mit einem Zahler und zwei Kindern. */
create or replace function tests.fixture_eingereicht(p_kinder integer default 1)
returns table (lauf uuid, zahler uuid, kennung text, summe integer)
language plpgsql as $f$
declare
  adm record; eltern record; k record; v_batch uuid; v_tag date;
  v_summe integer; v_kennung text; i integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into eltern from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(eltern.member_id);
  v_tag := tests.fixture_einzugstag();

  for i in 1..p_kinder loop
    select * into k from tests.fixture_user() limit 1;
    update public.members set billing_payer_id = eltern.member_id where id = k.member_id;
    perform tests.fixture_angekuendigt(k.member_id, 9000);
  end loop;

  perform tests.act_as(adm.auth_id);
  select public.create_debit_batch('ZZTest Ruecklauf', v_tag) into v_batch;
  perform public.add_charges_to_debit_batch(v_batch);
  select total_cents into v_summe from public.debit_batches where id = v_batch;
  perform public.mark_debit_batch_generated(v_batch, 'sepa/test.xml', v_summe, 1);
  perform public.mark_debit_batch_submitted(v_batch);
  perform set_config('role', 'postgres', true);

  select i.end_to_end_id into v_kennung
  from public.debit_items i where i.batch_id = v_batch limit 1;

  return query select v_batch, eltern.member_id, v_kennung, v_summe;
end; $f$;

/**
 * Der Kern: ein Ruecklaeufer trifft die ganze Lastschrift.
 */
create or replace function tests.test_ruecklaeufer_trifft_alle_forderungen()
returns setof text language plpgsql as $f$
declare adm record; f record; v record; v_offen integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_eingereicht(3) limit 1;

  perform tests.act_as(adm.auth_id);
  select * into v from public.record_debit_return(f.kennung, 'Konto nicht gedeckt');
  perform set_config('role', 'postgres', true);

  return next is(v.forderungen, 3, 'Alle drei Forderungen der Kennung sind betroffen');
  return next is(v.summe_cents, 27000, 'mit dem vollen Betrag');
  return next is(
    (select count(*)::integer from public.charges c
      join public.debit_items i on i.charge_id = c.id
      where i.end_to_end_id = f.kennung and c.status = 'returned'),
    3, 'und alle drei stehen auf zurueckgebucht');
  return next is(
    (select count(distinct result)::integer from public.debit_items
      where end_to_end_id = f.kennung),
    1, 'Kein Posten bleibt als eingezogen stehen');
end; $f$;

/**
 * Nach dem Ruecklaeufer ist die Forderung wieder aufnehmbar.
 *
 * Ohne das waere ein Ruecklaeufer eine Sackgasse: das Geld ist weg, die
 * Forderung steht offen, und ein zweiter Versuch scheitert am Teilindex.
 */
create or replace function tests.test_nach_ruecklaeufer_wieder_aufnehmbar()
returns setof text language plpgsql as $f$
declare adm record; f record; v_batch2 uuid; v_tag date; v record; v_charge uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_eingereicht(1) limit 1;
  v_tag := tests.fixture_einzugstag();

  perform tests.act_as(adm.auth_id);
  perform public.record_debit_return(f.kennung, 'Widerspruch');
  perform set_config('role', 'postgres', true);

  -- Wieder ankuendigen, sonst greift die Fristpruefung.
  select i.charge_id into v_charge
  from public.debit_items i where i.end_to_end_id = f.kennung limit 1;
  update public.charges
     set status = 'notified', notified_at = now() - interval '20 days',
         due_date = (now() at time zone 'Europe/Berlin')::date + 1
   where id = v_charge;

  perform tests.act_as(adm.auth_id);
  select public.create_debit_batch('ZZTest Zweiter Versuch', v_tag) into v_batch2;
  select * into v from public.add_charges_to_debit_batch(v_batch2);
  perform set_config('role', 'postgres', true);

  return next is(v.aufgenommen, 1,
    'Die zurueckgebuchte Forderung geht in den naechsten Lauf');
end; $f$;

/** Der Zahler bekommt genau eine Nachricht, mit dem Grund. */
create or replace function tests.test_ruecklaeufer_benachrichtigt_den_zahler()
returns setof text language plpgsql as $f$
declare adm record; f record; v_anzahl integer; v_text text;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_eingereicht(2) limit 1;

  perform tests.act_as(adm.auth_id);
  perform public.record_debit_return(f.kennung, 'Konto erloschen');
  perform set_config('role', 'postgres', true);

  select count(*)::integer, max(body) into v_anzahl, v_text
  from public.notifications
  where member_id = f.zahler and kind = 'charge_returned';

  return next is(v_anzahl, 1, 'Eine Nachricht, nicht eine je Kind');
  return next ok(v_text like '%Konto erloschen%',
    'Der Grund steht drin - er entscheidet ueber den naechsten Schritt');
  return next ok(v_text like '%180,00 Euro%', 'und der Betrag, der zurueckkam');
end; $f$;

/** Ohne Grund kein Ruecklaeufer. */
create or replace function tests.test_ruecklaeufer_braucht_einen_grund()
returns setof text language plpgsql as $f$
declare adm record; f record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_eingereicht(1) limit 1;

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select public.record_debit_return(%L, ''  '')', f.kennung),
    '22023', null,
    'Ohne Grund laesst sich kein Ruecklaeufer erfassen');
  perform set_config('role', 'postgres', true);
end; $f$;

/** Zweimal denselben Ruecklaeufer gibt es nicht. */
create or replace function tests.test_ruecklaeufer_nur_einmal()
returns setof text language plpgsql as $f$
declare adm record; f record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into f from tests.fixture_eingereicht(1) limit 1;

  perform tests.act_as(adm.auth_id);
  perform public.record_debit_return(f.kennung, 'Konto nicht gedeckt');
  return next throws_ok(
    format('select public.record_debit_return(%L, ''nochmal'')', f.kennung),
    '22023', null,
    'Dieselbe Lastschrift kommt nicht zweimal zurueck');
  perform set_config('role', 'postgres', true);
end; $f$;

/** Eine unbekannte Kennung wird abgewiesen. */
create or replace function tests.test_unbekannte_kennung_abgewiesen()
returns setof text language plpgsql as $f$
declare adm record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    'select public.record_debit_return(''TCM-gibtsnicht'', ''Grund'')',
    'P0002', null,
    'Zu einer unbekannten Kennung gibt es keine Lastschrift');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Abschluss
-- ---------------------------------------------------------------------------

/**
 * Der Abschluss laesst Ruecklaeufer in Ruhe.
 *
 * Wuerde er alles auf eingezogen setzen, verschwaende der Ruecklaeufer beim
 * Abschluss - und der Verein haette Geld verbucht, das nie ankam.
 */
create or replace function tests.test_abschluss_laesst_ruecklaeufer_stehen()
returns setof text language plpgsql as $f$
declare adm record; f1 record; f2 record; v record; v_batch uuid;
        v_tag date; eltern record; k record; v_summe integer; v_kennungen text[];
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_tag := tests.fixture_einzugstag();

  -- Zwei Zahler in einem Lauf, damit einer zurueckkommen kann.
  select * into eltern from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(eltern.member_id);
  perform tests.fixture_angekuendigt(eltern.member_id, 9000);
  select * into k from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(k.member_id);
  perform tests.fixture_angekuendigt(k.member_id, 12000);

  perform tests.act_as(adm.auth_id);
  select public.create_debit_batch('ZZTest Abschluss', v_tag) into v_batch;
  perform public.add_charges_to_debit_batch(v_batch);
  select total_cents into v_summe from public.debit_batches where id = v_batch;
  perform public.mark_debit_batch_generated(v_batch, 'sepa/a.xml', v_summe, 2);
  perform public.mark_debit_batch_submitted(v_batch);
  perform set_config('role', 'postgres', true);

  select array_agg(distinct end_to_end_id) into v_kennungen
  from public.debit_items where batch_id = v_batch;

  perform tests.act_as(adm.auth_id);
  perform public.record_debit_return(v_kennungen[1], 'Konto nicht gedeckt');
  select * into v from public.complete_debit_batch(v_batch);
  perform set_config('role', 'postgres', true);

  return next is(v.eingezogen, 1, 'Eine Lastschrift gilt als eingezogen');
  return next is(v.zurueck, 1, 'die andere bleibt zurueckgebucht');
  return next is(
    (select status::text from public.debit_batches where id = v_batch),
    'completed', 'Der Lauf ist abgeschlossen');
  return next is(
    (select count(*)::integer from public.charges c
      join public.debit_items i on i.charge_id = c.id
      where i.batch_id = v_batch and c.status = 'returned'),
    1, 'Die zurueckgebuchte Forderung steht weiter offen');
end; $f$;

/** Nur ein eingereichter Lauf laesst sich abschliessen. */
create or replace function tests.test_nur_eingereichtes_abschliessbar()
returns setof text language plpgsql as $f$
declare adm record; v_batch uuid; v_tag date;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_tag := tests.fixture_einzugstag();

  perform tests.act_as(adm.auth_id);
  select public.create_debit_batch('ZZTest Zufrueh', v_tag) into v_batch;
  return next throws_ok(
    format('select public.complete_debit_batch(%L)', v_batch), '22023', null,
    'Ein Entwurf laesst sich nicht abschliessen - es steht noch nicht fest, was ankommt');
  perform set_config('role', 'postgres', true);
end; $f$;

/** Nur Administratoren erfassen Ruecklaeufer. */
create or replace function tests.test_ruecklaeufer_nur_admin()
returns setof text language plpgsql as $f$
declare u record; f record;
begin
  select * into f from tests.fixture_eingereicht(1) limit 1;
  select * into u from tests.fixture_user() limit 1;

  perform tests.act_as(u.auth_id);
  return next throws_ok(
    format('select public.record_debit_return(%L, ''Grund'')', f.kennung),
    '42501', null,
    'Ein normales Mitglied erfasst keine Ruecklaeufer');
  perform set_config('role', 'postgres', true);
end; $f$;

/** Der Ruecklaeufer geht auch per Mail raus. */
create or replace function tests.test_ruecklaeufer_ist_eine_mailart()
returns setof text language plpgsql as $f$
begin
  return next ok(
    'charge_returned' = any (private.notification_mail_kinds()),
    'charge_returned steht in der Liste der Mailarten - es ist die dringendste Nachricht');
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer die Ruecklaeufer sind eingespielt');
select * from extensions.finish();
