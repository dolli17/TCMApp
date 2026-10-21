-- ===========================================================================
-- Keine doppelte Belastung (B1, B2)
--
-- Die Zusagen:
--
--   1. Eine Forderung im Einzugsentwurf laesst sich erlassen oder abhaken. Sie
--      geht dabei aus dem Entwurf heraus, Summe und Anzahl ziehen nach.
--   2. Steckt sie in einem Einzug, dessen Datei erzeugt oder eingereicht ist,
--      wird beides abgewiesen: sie wird eingezogen.
--   3. Das Erzeugen der Datei ueberschreibt keine erlassene oder bezahlte
--      Forderung mit "im Einzug".
--   4. Eine Gastgebuehr entsteht genau einmal, auch wenn sie schon
--      angekuendigt ist oder im Einzug steckt.
--   5. Beim Storno wird sie erlassen und aus dem Entwurf genommen. Steckt sie
--      in einer Datei, bleibt sie stehen.
--   6. Eine Gastgebuehr ist erst ab Spielbeginn einziehbar.
--
-- Fixtures aus 02_rls.sql, 03_rpc_bookings.sql, 13_lastschrift.sql und
-- 24_einzug.sql.
-- ===========================================================================

/** Ein Einzug ueber die gewaehlten Gruppen, als Admin vorbereitet. */
create or replace function tests.fixture_einzug(p_gruppen jsonb)
returns uuid language plpgsql as $f$
declare adm record; v_batch uuid; v_tag date := tests.einzug_tag();
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  perform tests.act_as(adm.auth_id);
  select r.batch_id into v_batch from public.einzug_vorbereiten(v_tag, p_gruppen) r;
  perform set_config('role', 'postgres', true);
  return v_batch;
end; $f$;

/** Die Datei des Laufs ist erzeugt; auf Wunsch auch eingereicht. */
create or replace function tests.fixture_datei(p_batch_id uuid, p_einreichen boolean default false)
returns void language plpgsql as $f$
declare adm record; b record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select total_cents, item_count into b from public.debit_batches where id = p_batch_id;
  perform tests.act_as(adm.auth_id);
  perform public.mark_debit_batch_generated(p_batch_id, 'sepa/zz-test.xml', b.total_cents, b.item_count);
  if p_einreichen then
    perform public.mark_debit_batch_submitted(p_batch_id);
  end if;
  perform set_config('role', 'postgres', true);
end; $f$;

/**
 * Eine Gastgebuehr in einem Lauf, am Einzug vorbei.
 *
 * Fuer eine kuenftige Buchung bietet einzug_vorbereiten die Gebuehr nicht
 * mehr an. Genau so ein Altfall soll aber geprueft werden: angekuendigt und
 * im Lauf, bevor gespielt wurde.
 */
create or replace function tests.fixture_gast_im_lauf(
  p_charge_id uuid, p_status public.debit_batch_status default 'draft'
)
returns uuid language plpgsql as $f$
declare c public.charges; sm public.sepa_mandates; v_tag date := tests.einzug_tag(); v_batch uuid;
begin
  update public.charges
     set status = 'notified', notified_at = now(), due_date = v_tag
   where id = p_charge_id
  returning * into c;

  select * into sm from public.sepa_mandates
   where member_id = c.payer_id and status = 'active'
   order by signed_on desc limit 1;

  insert into public.debit_batches (title, collection_date, kinds)
  values ('ZZTest Gast', v_tag, array['guest']::public.charge_kind[])
  returning id into v_batch;

  insert into public.debit_items
    (batch_id, charge_id, mandate_id, amount_cents, end_to_end_id,
     mandate_reference, mandate_signed_on, sequence_type)
  values (v_batch, c.id, sm.id, c.amount_cents,
          'TCM-ZZ-' || substr(replace(c.id::text, '-', ''), 1, 16),
          sm.reference, sm.signed_on, 'RCUR');

  update public.debit_batches
     set total_cents = c.amount_cents, item_count = 1, status = p_status
   where id = v_batch;

  if p_status <> 'draft' then
    update public.charges set status = 'submitted' where id = c.id;
  end if;

  return v_batch;
end; $f$;

/** Eine kuenftige Buchung mit einem Gast; liefert Buchung und Gastgebuehr. */
create or replace function tests.fixture_gastbuchung(p_auth_id uuid, p_stunde integer)
returns table (buchung uuid, gebuehr uuid) language plpgsql as $f$
declare v_court uuid := tests.fixture_court(); s1 timestamptz := tests.naechster_slot(5, p_stunde);
        v_id uuid;
begin
  perform tests.act_as(p_auth_id);
  select public.create_booking(v_court, s1, 'doppel', '{}'::uuid[], array['Gast', 'Gast']) into v_id;
  perform set_config('role', 'postgres', true);
  return query
    select v_id, (select c.id from public.charges c
                   where c.booking_id = v_id and c.kind = 'guest'
                   order by c.created_at, c.id limit 1);
end; $f$;

-- ---------------------------------------------------------------------------
-- B1: Erlassen und abhaken
-- ---------------------------------------------------------------------------

create or replace function tests.test_b1_erlassen_im_entwurf()
returns setof text language plpgsql as $f$
declare adm record; a record; v_beitrag uuid; v_getraenk uuid; v_batch uuid;
        v_period text := 'ZZ-' || substr(gen_random_uuid()::text, 1, 8);
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(a.member_id);
  v_beitrag  := tests.fixture_offen(a.member_id, 18500, 'fee', v_period);
  v_getraenk := tests.fixture_offen(a.member_id, 1200, 'drinks', v_period);
  v_batch := tests.fixture_einzug(jsonb_build_array(
    jsonb_build_object('kind', 'fee', 'period', v_period),
    jsonb_build_object('kind', 'drinks', 'period', v_period)));

  perform tests.act_as(adm.auth_id);
  perform public.waive_charge(v_beitrag, 'Ehrenmitglied');
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.charges where id = v_beitrag), 'waived',
    'Die Forderung im Entwurf ist erlassen');
  return next is(
    (select count(*)::integer from public.debit_items where charge_id = v_beitrag), 0,
    'und aus dem Einzug genommen');
  return next is(
    (select total_cents from public.debit_batches where id = v_batch), 1200,
    'Die Summe zieht nach');
  return next is(
    (select item_count from public.debit_batches where id = v_batch), 1,
    'Die Lastschrift fuer die Getraenke bleibt');
  return next is((select status::text from public.charges where id = v_getraenk), 'notified',
    'Die andere Forderung bleibt im Einzug');
end; $f$;

create or replace function tests.test_b1_abhaken_im_entwurf()
returns setof text language plpgsql as $f$
declare adm record; a record; v_id uuid; v_batch uuid;
        v_period text := 'ZZ-' || substr(gen_random_uuid()::text, 1, 8);
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(a.member_id);
  v_id := tests.fixture_offen(a.member_id, 7000, 'fee', v_period);
  v_batch := tests.fixture_einzug(jsonb_build_array(jsonb_build_object('kind', 'fee', 'period', v_period)));

  perform tests.act_as(adm.auth_id);
  perform public.settle_charge_manually(v_id, 'bar bezahlt');
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.charges where id = v_id), 'settled',
    'Die Forderung im Entwurf ist als bezahlt vermerkt');
  return next is(
    (select count(*)::integer from public.debit_items where batch_id = v_batch), 0,
    'und aus dem Einzug genommen');
  return next is(
    (select total_cents || '/' || item_count from public.debit_batches where id = v_batch), '0/0',
    'Summe und Anzahl ziehen nach');
end; $f$;

create or replace function tests.test_b1_nach_der_datei_gesperrt()
returns setof text language plpgsql as $f$
declare adm record; a record; v_id uuid; v_batch uuid;
        v_period text := 'ZZ-' || substr(gen_random_uuid()::text, 1, 8);
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(a.member_id);
  v_id := tests.fixture_offen(a.member_id, 7000, 'fee', v_period);
  v_batch := tests.fixture_einzug(jsonb_build_array(jsonb_build_object('kind', 'fee', 'period', v_period)));
  perform tests.fixture_datei(v_batch);

  perform tests.act_as(adm.auth_id);
  return next throws_like(
    format('select public.waive_charge(%L, ''Versehen'')', v_id),
    '%Lastschriftdatei%',
    'Erlassen nach erzeugter Datei wird abgewiesen');
  return next throws_like(
    format('select public.settle_charge_manually(%L)', v_id),
    '%Lastschriftdatei%',
    'Abhaken nach erzeugter Datei wird abgewiesen');
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.charges where id = v_id), 'submitted',
    'Die Forderung bleibt im Einzug');
  return next is(
    (select count(*)::integer from public.debit_items where batch_id = v_batch), 1,
    'und der Posten in der Datei');
end; $f$;

create or replace function tests.test_b1_nach_dem_einreichen_gesperrt()
returns setof text language plpgsql as $f$
declare adm record; a record; v_id uuid; v_batch uuid;
        v_period text := 'ZZ-' || substr(gen_random_uuid()::text, 1, 8);
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(a.member_id);
  v_id := tests.fixture_offen(a.member_id, 7000, 'fee', v_period);
  v_batch := tests.fixture_einzug(jsonb_build_array(jsonb_build_object('kind', 'fee', 'period', v_period)));
  perform tests.fixture_datei(v_batch, true);

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select public.waive_charge(%L, ''Versehen'')', v_id),
    '22023', null, 'Erlassen nach dem Einreichen wird abgewiesen');
  return next throws_ok(
    format('select public.settle_charge_manually(%L)', v_id),
    '22023', null, 'Abhaken nach dem Einreichen wird abgewiesen');
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.charges where id = v_id), 'submitted',
    'Die Forderung bleibt im Einzug');
end; $f$;

/**
 * Ein Altfall: erlassen, waehrend der Posten im Entwurf stand (vor diesem
 * Fix moeglich). Die Datei darf so nicht entstehen, und der Status bleibt.
 */
create or replace function tests.test_b1_datei_ueberschreibt_nicht()
returns setof text language plpgsql as $f$
declare adm record; a record; v_id uuid; v_batch uuid; b record;
        v_period text := 'ZZ-' || substr(gen_random_uuid()::text, 1, 8);
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(a.member_id);
  v_id := tests.fixture_offen(a.member_id, 7000, 'fee', v_period);
  v_batch := tests.fixture_einzug(jsonb_build_array(jsonb_build_object('kind', 'fee', 'period', v_period)));
  update public.charges set status = 'waived' where id = v_id;
  select total_cents, item_count into b from public.debit_batches where id = v_batch;

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select * from public.debit_batch_payload(%L)', v_batch),
    '22023', null, 'Die Datei wird mit einem erlassenen Posten gar nicht erst gebaut');
  return next throws_ok(
    format('select public.mark_debit_batch_generated(%L, ''sepa/x.xml'', %s, %s)',
           v_batch, b.total_cents, b.item_count),
    '22023', null, 'und nicht als erzeugt vermerkt');
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.charges where id = v_id), 'waived',
    'Die erlassene Forderung bleibt erlassen');
  return next is((select status::text from public.debit_batches where id = v_batch), 'draft',
    'Der Lauf bleibt ein Entwurf');
end; $f$;

-- ---------------------------------------------------------------------------
-- B2: Gastgebuehr
-- ---------------------------------------------------------------------------

create or replace function tests.test_b2_gastgebuehr_angekuendigt_nicht_doppelt()
returns setof text language plpgsql as $f$
declare a record; g record;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into g from tests.fixture_gastbuchung(a.auth_id, 9);
  update public.charges set status = 'notified', notified_at = now(), due_date = tests.einzug_tag()
   where booking_id = g.buchung and kind = 'guest';

  perform tests.act_as(a.auth_id);
  perform public.update_booking_players(g.buchung, '{}'::uuid[], array['Gast', 'Gast']);
  perform set_config('role', 'postgres', true);

  return next is(
    (select count(*)::integer from public.charges
      where booking_id = g.buchung and kind = 'guest' and status <> 'waived'),
    2, 'Angekuendigte Gastgebuehren entstehen beim Speichern nicht noch einmal');
end; $f$;

create or replace function tests.test_b2_gastgebuehr_im_lauf_nicht_doppelt()
returns setof text language plpgsql as $f$
declare a record; b record; g record; v_batch uuid; v_zweite uuid;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(a.member_id);
  select * into g from tests.fixture_gastbuchung(a.auth_id, 10);
  select id into v_zweite from public.charges
   where booking_id = g.buchung and kind = 'guest' and id <> g.gebuehr;
  v_batch := tests.fixture_gast_im_lauf(g.gebuehr, 'generated');
  perform tests.fixture_gast_im_lauf(v_zweite, 'generated');

  perform tests.act_as(a.auth_id);
  perform public.update_booking_players(g.buchung, '{}'::uuid[], array['Gast', 'Gast']);
  return next throws_ok(
    format('select public.update_booking_players(%L, array[%L]::uuid[], array[''Gast''])',
           g.buchung, b.member_id),
    '22023', null, 'Einen Gast austragen, dessen Gebuehr schon in der Datei steckt, wird abgewiesen');
  perform set_config('role', 'postgres', true);

  return next is(
    (select count(*)::integer from public.charges
      where booking_id = g.buchung and kind = 'guest' and status <> 'waived'),
    2, 'Gastgebuehren in einer Datei entstehen nicht noch einmal');
end; $f$;

create or replace function tests.test_b2_weniger_gaeste_nach_ankuendigung()
returns setof text language plpgsql as $f$
declare a record; b record; d record; g record; v_batch uuid; v_zweite uuid;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  select * into d from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(a.member_id);
  select * into g from tests.fixture_gastbuchung(a.auth_id, 11);
  select id into v_zweite from public.charges
   where booking_id = g.buchung and kind = 'guest' and id <> g.gebuehr;
  v_batch := tests.fixture_gast_im_lauf(g.gebuehr);
  update public.charges set status = 'notified', notified_at = now(), due_date = tests.einzug_tag()
   where id = v_zweite;

  perform tests.act_as(a.auth_id);
  perform public.update_booking_players(g.buchung, array[b.member_id, d.member_id], '{}'::text[]);
  perform set_config('role', 'postgres', true);

  return next is(
    (select count(*)::integer from public.charges
      where booking_id = g.buchung and kind = 'guest' and status <> 'waived'),
    0, 'Ohne Gaeste bleibt keine Gastgebuehr stehen');
  return next is(
    (select count(*)::integer from public.debit_items where batch_id = v_batch), 0,
    'Die Gebuehr im Entwurf ist herausgenommen');
  return next is(
    (select total_cents || '/' || item_count from public.debit_batches where id = v_batch), '0/0',
    'Summe und Anzahl ziehen nach');
end; $f$;

create or replace function tests.test_b2_storno_nach_ankuendigung()
returns setof text language plpgsql as $f$
declare a record; g record;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into g from tests.fixture_gastbuchung(a.auth_id, 12);
  update public.charges set status = 'notified', notified_at = now(), due_date = tests.einzug_tag()
   where booking_id = g.buchung and kind = 'guest';

  perform tests.act_as(a.auth_id);
  perform public.cancel_booking(g.buchung, 'Regen');
  perform set_config('role', 'postgres', true);

  return next is(
    (select count(*)::integer from public.charges
      where booking_id = g.buchung and kind = 'guest' and status <> 'waived'),
    0, 'Angekuendigte Gastgebuehren werden beim Storno erlassen');
end; $f$;

create or replace function tests.test_b2_storno_im_entwurf()
returns setof text language plpgsql as $f$
declare a record; g record; v_batch uuid;
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(a.member_id);
  select * into g from tests.fixture_gastbuchung(a.auth_id, 13);
  v_batch := tests.fixture_gast_im_lauf(g.gebuehr);

  perform tests.act_as(a.auth_id);
  perform public.cancel_booking(g.buchung, 'Regen');
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.charges where id = g.gebuehr), 'waived',
    'Die Gastgebuehr im Entwurf wird erlassen');
  return next is(
    (select count(*)::integer from public.debit_items where batch_id = v_batch), 0,
    'und aus dem Einzug genommen');
  return next is(
    (select total_cents || '/' || item_count from public.debit_batches where id = v_batch), '0/0',
    'Summe und Anzahl ziehen nach');
end; $f$;

create or replace function tests.test_b2_storno_nach_der_datei()
returns setof text language plpgsql as $f$
declare a record; g record; v_batch uuid;
begin
  select * into a from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(a.member_id);
  select * into g from tests.fixture_gastbuchung(a.auth_id, 14);
  v_batch := tests.fixture_gast_im_lauf(g.gebuehr, 'generated');

  perform tests.act_as(a.auth_id);
  perform public.cancel_booking(g.buchung, 'Regen');
  perform set_config('role', 'postgres', true);

  return next is((select status::text from public.charges where id = g.gebuehr), 'submitted',
    'Eine Gastgebuehr in der Datei wird nicht still erlassen');
  return next is(
    (select count(*)::integer from public.debit_items where batch_id = v_batch), 1,
    'und bleibt im Einzug');
  return next is(
    (select count(*)::integer from public.charges
      where booking_id = g.buchung and kind = 'guest' and status <> 'waived'),
    1, 'Die zweite, noch offene Gebuehr ist erlassen');
end; $f$;

create or replace function tests.test_b2_gastgebuehr_erst_ab_spielbeginn()
returns setof text language plpgsql as $f$
declare a record; g record; v_court uuid := tests.fixture_court(); v_type uuid; v_alt uuid;
        v_start timestamptz := now() - interval '30 minutes';
        c public.charges;
begin
  select * into a from tests.fixture_user() limit 1;
  select * into g from tests.fixture_gastbuchung(a.auth_id, 15);
  select * into c from public.charges where id = g.gebuehr;
  return next ok(not private.einziehbar(c), 'Vor Spielbeginn ist die Gastgebuehr nicht einziehbar');

  select id into v_type from public.booking_types where code = 'einzel';
  insert into public.bookings (court_id, slot, kind, booking_type_id, member_id, created_by)
  values (v_court, tstzrange(v_start, v_start + interval '1 hour', '[)'),
          'booking', v_type, a.member_id, a.member_id)
  returning id into v_alt;
  insert into public.charges (member_id, payer_id, kind, amount_cents, description, booking_id)
  values (a.member_id, a.member_id, 'guest', 1000, 'Gastgebuehr Test', v_alt)
  returning * into c;
  return next ok(private.einziehbar(c), 'Ab Spielbeginn ist sie einziehbar');
end; $f$;

select extensions.plan(1);
select extensions.pass('Tests gegen doppelte Belastung sind eingespielt');
