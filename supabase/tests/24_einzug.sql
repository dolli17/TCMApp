-- ===========================================================================
-- Der Einzug: ankuendigen und Lauf anlegen in einem Schritt
--
-- Die wichtigsten Zusagen:
--
--   1. Der Einzug nimmt genau die gewaehlten Forderungen - nicht alles, was
--      zufaellig auch angekuendigt ist.
--   2. Angekuendigt wird nur, wer eingezogen werden kann. Ohne gueltiges
--      Mandat bleibt die Forderung offen, und es geht keine Nachricht raus.
--   3. Die Frist haelt: ein zu frueher Abbuchungstag wird abgewiesen, bevor
--      irgendetwas angekuendigt ist.
--
-- Fixtures aus 02_rls.sql (fixture_user, act_as) und 13_lastschrift.sql
-- (fixture_mandat).
-- ===========================================================================

/** Eine offene Forderung mit eigenem Zeitraum, damit Seed-Daten nicht mitlaufen. */
create or replace function tests.fixture_offen(
  p_member_id uuid, p_cents integer, p_kind public.charge_kind, p_period text
)
returns uuid language plpgsql as $f$
declare adm record; v_id uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  perform tests.act_as(adm.auth_id);
  select public.create_manual_charge(p_member_id, p_kind, p_cents, 'ZZTest Einzug') into v_id;
  perform set_config('role', 'postgres', true);
  update public.charges set period_label = p_period where id = v_id;
  return v_id;
end; $f$;

create or replace function tests.einzug_tag()
returns date language sql stable as $f$
  select (now() at time zone 'Europe/Berlin')::date
         + public.setting_int('sepa.prenotification_days') + 1;
$f$;

create or replace function tests.test_einzug_nimmt_genau_die_auswahl()
returns setof text language plpgsql as $f$
declare v_tag date := tests.einzug_tag(); adm record; a record; b record; v_beitrag uuid; v_getraenk uuid; v_fremd uuid;
        r record; v_period text := 'ZZ-' || substr(gen_random_uuid()::text, 1, 8);
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(a.member_id);
  perform tests.fixture_mandat(b.member_id);
  v_beitrag  := tests.fixture_offen(a.member_id, 18500, 'fee', v_period);
  v_getraenk := tests.fixture_offen(a.member_id, 1200, 'drinks', v_period);
  v_fremd    := tests.fixture_offen(b.member_id, 9000, 'fee', v_period || 'x');

  perform tests.act_as(adm.auth_id);
  select * into r from public.einzug_vorbereiten(
    v_tag,
    jsonb_build_array(jsonb_build_object('kind', 'fee', 'period', v_period)),
    'ZZTest Einzug');
  perform set_config('role', 'postgres', true);

  return next is(r.lastschriften, 1, 'Eine Lastschrift');
  return next is(r.summe_cents, 18500, 'ueber genau die gewaehlte Forderung');
  return next is(
    (select array_agg(charge_id) from public.debit_items where batch_id = r.batch_id),
    array[v_beitrag], 'Im Lauf steht nur die Beitragsforderung');
  return next is(
    (select status::text from public.charges where id = v_beitrag), 'notified',
    'Sie ist angekuendigt');
  return next is(
    (select due_date from public.charges where id = v_beitrag), v_tag,
    'zum Abbuchungstag des Laufs');
  return next is(
    (select collection_date from public.debit_batches where id = r.batch_id), v_tag,
    'Lauf und Ankuendigung haben denselben Tag');
  return next is(
    (select status::text from public.charges where id = v_getraenk), 'open',
    'Die Getraenke derselben Person bleiben offen');
  return next is(
    (select status::text from public.charges where id = v_fremd), 'open',
    'Ein anderer Zeitraum bleibt offen');
  return next is(
    (select count(*)::integer from public.notifications
      where member_id = a.member_id and kind = 'charge_announced'),
    1, 'Das Mitglied bekommt eine Ankuendigung');
end; $f$;

create or replace function tests.test_einzug_ohne_mandat_wird_nicht_angekuendigt()
returns setof text language plpgsql as $f$
declare v_tag date := tests.einzug_tag(); adm record; a record; ohne record; v_mit uuid; v_ohne uuid; r record;
        v_grund text; v_period text := 'ZZ-' || substr(gen_random_uuid()::text, 1, 8);
        v_gruppen jsonb;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into ohne from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(a.member_id);
  v_mit  := tests.fixture_offen(a.member_id, 5000, 'work_duty', v_period);
  v_ohne := tests.fixture_offen(ohne.member_id, 5000, 'work_duty', v_period);
  v_gruppen := jsonb_build_array(jsonb_build_object('kind', 'work_duty', 'period', v_period));

  perform tests.act_as(adm.auth_id);
  select v.grund into v_grund
  from public.einzug_vorschau(v_tag, v_gruppen) v
  where v.member_id = ohne.member_id and not v.einzugsfaehig;
  select * into r from public.einzug_vorbereiten(v_tag, v_gruppen);
  perform set_config('role', 'postgres', true);

  return next ok(v_grund like '%Mandat%', 'Die Vorschau nennt das fehlende Mandat');
  return next is(r.ausnahmen, 1, 'Der Einzug zaehlt eine Ausnahme');
  return next is(
    (select status::text from public.charges where id = v_ohne), 'open',
    'Die Forderung ohne Mandat bleibt offen');
  return next is(
    (select count(*)::integer from public.notifications
      where member_id = ohne.member_id and kind = 'charge_announced'),
    0, 'und es geht keine Ankuendigung raus');
  return next is(
    (select status::text from public.charges where id = v_mit), 'notified',
    'Die andere geht mit');
end; $f$;

create or replace function tests.test_einzug_frist_und_rechte()
returns setof text language plpgsql as $f$
declare v_tag date := tests.einzug_tag(); adm record; a record; v_id uuid; v_period text := 'ZZ-' || substr(gen_random_uuid()::text, 1, 8);
        v_gruppen jsonb;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(a.member_id);
  v_id := tests.fixture_offen(a.member_id, 5000, 'fee', v_period);
  v_gruppen := jsonb_build_array(jsonb_build_object('kind', 'fee', 'period', v_period));

  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select * from public.einzug_vorbereiten(%L::date, %L::jsonb)',
           (now() at time zone 'Europe/Berlin')::date + 3, v_gruppen),
    '22023', null, 'Ein Abbuchungstag vor Ablauf der Frist wird abgewiesen');
  perform set_config('role', 'postgres', true);
  return next is(
    (select status::text from public.charges where id = v_id), 'open',
    'und nichts ist angekuendigt');

  perform tests.act_as(a.auth_id);
  return next throws_ok(
    format('select * from public.einzug_vorbereiten(%L::date, %L::jsonb)', v_tag, v_gruppen),
    '42501', null, 'Ein Mitglied darf keinen Einzug vorbereiten');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_einzug_holt_ruecklaeufer_neu()
returns setof text language plpgsql as $f$
declare v_tag date := tests.einzug_tag(); adm record; a record; v_id uuid; r record; v_period text := 'ZZ-' || substr(gen_random_uuid()::text, 1, 8);
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(a.member_id);
  v_id := tests.fixture_offen(a.member_id, 6200, 'fee', v_period);
  update public.charges set status = 'returned', notified_at = now() - interval '60 days',
         due_date = current_date - 40 where id = v_id;

  perform tests.act_as(adm.auth_id);
  return next is(
    (select g.anzahl from public.einzug_gruppen() g
      where g.period_label = v_period and g.ruecklaeufer),
    1, 'Der Ruecklaeufer steht als eigene Gruppe bereit');
  select * into r from public.einzug_vorbereiten(
    v_tag,
    jsonb_build_array(jsonb_build_object('kind', 'fee', 'period', v_period, 'returned', true)));
  perform set_config('role', 'postgres', true);

  return next is(r.forderungen, 1, 'Er geht in den neuen Einzug');
  return next is(
    (select due_date from public.charges where id = v_id), v_tag,
    'neu angekuendigt zum neuen Tag');
end; $f$;

create or replace function tests.test_einzug_mitglied_herausnehmen()
returns setof text language plpgsql as $f$
declare v_tag date := tests.einzug_tag(); adm record; a record; v_id uuid; r record; v_e2e text;
        v_period text := 'ZZ-' || substr(gen_random_uuid()::text, 1, 8);
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(a.member_id);
  v_id := tests.fixture_offen(a.member_id, 4000, 'fee', v_period);

  perform tests.act_as(adm.auth_id);
  select * into r from public.einzug_vorbereiten(
    v_tag, jsonb_build_array(jsonb_build_object('kind', 'fee', 'period', v_period)));
  perform set_config('role', 'postgres', true);
  select end_to_end_id into v_e2e from public.debit_items where batch_id = r.batch_id limit 1;

  perform tests.act_as(adm.auth_id);
  perform public.einzug_mitglied_entfernen(r.batch_id, v_e2e);
  perform set_config('role', 'postgres', true);

  return next is(
    (select count(*)::integer from public.debit_items where batch_id = r.batch_id), 0,
    'Das Mitglied ist aus dem Einzug heraus');
  return next is(
    (select status::text from public.charges where id = v_id), 'open',
    'und seine Forderung wieder offen');
  return next is(
    (select item_count from public.debit_batches where id = r.batch_id), 0,
    'Die Summen des Laufs sind nachgezogen');

  perform tests.act_as(adm.auth_id);
  return next lives_ok(
    format('select public.einzug_loeschen(%L::uuid)', r.batch_id),
    'Ein leerer Einzug laesst sich loeschen');
  perform set_config('role', 'postgres', true);
  return next is(
    (select count(*)::integer from public.debit_batches where id = r.batch_id), 0,
    'und ist danach weg');

  -- Fuer die naechste Pruefung noch einmal: ein Einzug mit Datei.
  perform tests.act_as(adm.auth_id);
  select * into r from public.einzug_vorbereiten(
    v_tag, jsonb_build_array(jsonb_build_object('kind', 'fee', 'period', v_period)));
  perform set_config('role', 'postgres', true);
  select end_to_end_id into v_e2e from public.debit_items where batch_id = r.batch_id limit 1;
  update public.debit_batches set status = 'generated' where id = r.batch_id;
  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select public.einzug_loeschen(%L::uuid)', r.batch_id),
    '22023', null, 'Ein Einzug mit Datei laesst sich nicht loeschen');
  perform set_config('role', 'postgres', true);
  perform tests.act_as(adm.auth_id);
  return next throws_ok(
    format('select public.einzug_mitglied_entfernen(%L::uuid, %L)', r.batch_id, v_e2e),
    '22023', null, 'Nach dem Erzeugen der Datei geht das nicht mehr');
  perform set_config('role', 'postgres', true);
end; $f$;

select extensions.plan(1);
select extensions.pass('Tests fuer den Einzug sind eingespielt');
