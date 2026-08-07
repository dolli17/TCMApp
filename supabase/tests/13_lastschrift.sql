-- ===========================================================================
-- Der Lastschriftlauf
--
-- Die drei wichtigsten Tests stehen oben:
--
--   1. Eine Forderung, deren Frist noch laeuft, kommt nicht in den Lauf - und
--      ein direkter Insert prallt am Trigger ab. Die Frist ist damit nicht
--      "verboten", sondern nicht konstruierbar.
--   2. Ein Mandat nur fuer Beitraege traegt keinen Getraenkeeinzug.
--   3. Ein Zahler mit mehreren Kindern ergibt EINE Lastschrift. Zwei Posten
--      mit derselben Mandatsreferenz wuerde validateBatch abweisen, und die
--      Bank koennte eine Rueckgabe nicht zuordnen.
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
-- ===========================================================================

/** Ein Mitglied mit Bankverbindung und Mandat. */
create or replace function tests.fixture_mandat(
  p_member_id uuid, p_scope public.mandate_scope default 'all_payments',
  p_signed date default null
)
returns text language plpgsql as $f$
declare adm record; v_konto uuid; v_ref text;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  perform tests.act_as(adm.auth_id);
  select public.add_bank_account(p_member_id, 'DE02120300000000202051', 'ZZTest Kontoinhaber')
    into v_konto;
  select public.create_sepa_mandate(p_member_id, v_konto, null,
                                    coalesce(p_signed, current_date - 30), p_scope)
    into v_ref;
  perform set_config('role', 'postgres', true);
  return v_ref;
end; $f$;

/**
 * Eine angekuendigte Forderung, deren Frist abgelaufen ist.
 *
 * notified_at wird zurueckdatiert, weil sonst jeder Test 14 Tage warten
 * muesste. Genau diese Zeitachse ist der Gegenstand der Pruefung.
 */
create or replace function tests.fixture_angekuendigt(
  p_member_id uuid, p_cents integer, p_kind public.charge_kind default 'fee',
  p_tage_her integer default 20
)
returns uuid language plpgsql as $f$
declare adm record; v_id uuid; v_faellig date;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_faellig := (now() at time zone 'Europe/Berlin')::date + 1;

  perform tests.act_as(adm.auth_id);
  select public.create_manual_charge(p_member_id, p_kind, p_cents, 'ZZTest Posten') into v_id;
  perform set_config('role', 'postgres', true);

  update public.charges
     set status = 'notified',
         notified_at = now() - make_interval(days => p_tage_her),
         due_date = v_faellig
   where id = v_id;

  return v_id;
end; $f$;

/** Ein Faelligkeitstag, der die Frist einhaelt. */
create or replace function tests.fixture_einzugstag()
returns date language sql stable as $f$
  select (now() at time zone 'Europe/Berlin')::date + 2;
$f$;

-- ---------------------------------------------------------------------------
-- Die Frist
-- ---------------------------------------------------------------------------

/**
 * Der Kern: eine frisch angekuendigte Forderung kommt nicht in den Lauf, und
 * auch ein direkter Insert kommt nicht daran vorbei.
 */
create or replace function tests.test_frist_ist_nicht_zu_umgehen()
returns setof text language plpgsql as $f$
declare adm record; u record; v_charge uuid; v_batch uuid; v_tag date;
        v_faehig boolean; v_grund text; v_mandat uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(u.member_id);
  -- Erst heute angekuendigt: die Frist laeuft noch.
  v_charge := tests.fixture_angekuendigt(u.member_id, 12000, 'fee', 0);
  v_tag := tests.fixture_einzugstag();
  select id into v_mandat from public.sepa_mandates where member_id = u.member_id;

  perform tests.act_as(adm.auth_id);
  select public.create_debit_batch('ZZTest Lauf', v_tag) into v_batch;
  select k.einzugsfaehig, k.grund into v_faehig, v_grund
  from public.debit_batch_candidates(v_tag) k where k.payer_id = u.member_id;
  perform public.add_charges_to_debit_batch(v_batch);
  perform set_config('role', 'postgres', true);

  return next is(v_faehig, false, 'Eine Forderung in laufender Frist ist nicht einzugsfaehig');
  return next ok(v_grund like '%Vorabankuendigung%', 'und der Grund sagt, warum');
  return next is(
    (select count(*)::integer from public.debit_items where batch_id = v_batch),
    0, 'Der Lauf bleibt leer');

  -- Der Riegel darunter: selbst von Hand geht es nicht.
  return next throws_ok(
    format($q$insert into public.debit_items
             (batch_id, charge_id, mandate_id, amount_cents, end_to_end_id,
              mandate_reference, mandate_signed_on, sequence_type)
             values (%L, %L, %L, 12000, 'X', 'REF', current_date - 30, 'RCUR')$q$,
           v_batch, v_charge, v_mandat),
    '22023', null,
    'Auch ein direkter Insert prallt an der Frist ab');
end; $f$;

/**
 * Angekuendigt war der 15., eingezogen wird nicht am 10.
 *
 * Leicht zu uebersehen: die 14 Tage koennen laengst um sein und der Einzug
 * trotzdem zu frueh, weil ein spaeterer Tag angekuendigt wurde.
 */
create or replace function tests.test_einzug_nicht_vor_angekuendigtem_tag()
returns setof text language plpgsql as $f$
declare adm record; u record; v_charge uuid; v_batch uuid; v_faehig boolean; v_grund text;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(u.member_id);
  v_charge := tests.fixture_angekuendigt(u.member_id, 9000, 'fee', 30);

  -- Frist laengst um, aber angekuendigt war morgen.
  update public.charges set due_date = (now() at time zone 'Europe/Berlin')::date + 10
   where id = v_charge;

  perform tests.act_as(adm.auth_id);
  select k.einzugsfaehig, k.grund into v_faehig, v_grund
  from public.debit_batch_candidates((now() at time zone 'Europe/Berlin')::date + 3) k
  where k.payer_id = u.member_id;
  perform set_config('role', 'postgres', true);

  return next is(v_faehig, false, 'Vor dem angekuendigten Tag wird nicht eingezogen');
  return next ok(v_grund like '%Angekuendigt war%', 'und der Grund nennt den Tag');
end; $f$;

/** Ein belegter Lauf laesst sich nicht vorziehen. */
create or replace function tests.test_faelligkeit_nicht_vorziehbar()
returns setof text language plpgsql as $f$
declare adm record; u record; v_batch uuid; v_tag date;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(u.member_id);
  perform tests.fixture_angekuendigt(u.member_id, 5000);
  v_tag := tests.fixture_einzugstag();

  perform tests.act_as(adm.auth_id);
  select public.create_debit_batch('ZZTest Vorziehen', v_tag + 10) into v_batch;
  perform public.add_charges_to_debit_batch(v_batch);
  perform set_config('role', 'postgres', true);

  return next throws_ok(
    format('update public.debit_batches set collection_date = %L where id = %L',
           v_tag, v_batch),
    '22023', null,
    'Ein belegter Lauf laesst sich nicht vorziehen');
end; $f$;

-- ---------------------------------------------------------------------------
-- Mandate
-- ---------------------------------------------------------------------------

/**
 * Ein Beitragsmandat traegt den Beitrag, aber nicht die Getraenke.
 *
 * Zieht der Verein trotzdem ein, kann das Mitglied 13 Monate lang
 * widersprechen statt der ueblichen acht Wochen.
 */
create or replace function tests.test_beitragsmandat_traegt_keine_getraenke()
returns setof text language plpgsql as $f$
declare adm record; u record; v_tag date; v_faehig boolean; v_grund text;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(u.member_id, 'fees_only');
  perform tests.fixture_angekuendigt(u.member_id, 4500, 'drinks');
  v_tag := tests.fixture_einzugstag();

  perform tests.act_as(adm.auth_id);
  select k.einzugsfaehig, k.grund into v_faehig, v_grund
  from public.debit_batch_candidates(v_tag) k where k.payer_id = u.member_id;
  perform set_config('role', 'postgres', true);

  return next is(v_faehig, false, 'Ein Beitragsmandat traegt keinen Getraenkeeinzug');
  return next ok(v_grund like '%Beitraege%', 'und sagt das auch');
end; $f$;

/** Derselbe Zahler mit Beitragsforderung geht dagegen mit. */
create or replace function tests.test_beitragsmandat_traegt_den_beitrag()
returns setof text language plpgsql as $f$
declare adm record; u record; v_tag date; v_faehig boolean;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(u.member_id, 'fees_only');
  perform tests.fixture_angekuendigt(u.member_id, 19000, 'fee');
  v_tag := tests.fixture_einzugstag();

  perform tests.act_as(adm.auth_id);
  select k.einzugsfaehig into v_faehig
  from public.debit_batch_candidates(v_tag) k where k.payer_id = u.member_id;
  perform set_config('role', 'postgres', true);

  return next is(v_faehig, true, 'Der Beitrag geht mit einem Beitragsmandat mit');
end; $f$;

/** Ohne Mandat kein Einzug. */
create or replace function tests.test_ohne_mandat_kein_einzug()
returns setof text language plpgsql as $f$
declare adm record; u record; v_tag date; v_faehig boolean; v_grund text; v_batch uuid;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  perform tests.fixture_angekuendigt(u.member_id, 7000);
  v_tag := tests.fixture_einzugstag();

  perform tests.act_as(adm.auth_id);
  select k.einzugsfaehig, k.grund into v_faehig, v_grund
  from public.debit_batch_candidates(v_tag) k where k.payer_id = u.member_id;
  select public.create_debit_batch('ZZTest Ohne Mandat', v_tag) into v_batch;
  perform public.add_charges_to_debit_batch(v_batch);
  perform set_config('role', 'postgres', true);

  return next is(v_faehig, false, 'Ohne Mandat ist niemand einzugsfaehig');
  return next ok(v_grund like '%kein Mandat%', 'und der Grund sagt es');
  return next is(
    (select count(*)::integer from public.debit_items where batch_id = v_batch),
    0, 'und es entsteht kein Posten');
end; $f$;

/** Ein seit ueber 36 Monaten ungenutztes Mandat ist erloschen. */
create or replace function tests.test_erloschenes_mandat_faellt_heraus()
returns setof text language plpgsql as $f$
declare adm record; u record; v_tag date; v_faehig boolean; v_grund text;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(u.member_id, 'all_payments', current_date - 1200);
  perform tests.fixture_angekuendigt(u.member_id, 8000);
  v_tag := tests.fixture_einzugstag();

  perform tests.act_as(adm.auth_id);
  select k.einzugsfaehig, k.grund into v_faehig, v_grund
  from public.debit_batch_candidates(v_tag) k where k.payer_id = u.member_id;
  perform set_config('role', 'postgres', true);

  return next is(v_faehig, false, 'Ein erloschenes Mandat traegt keinen Einzug mehr');
  return next ok(v_grund like '%36 Monaten%', 'und der Grund nennt die Frist');
end; $f$;

-- ---------------------------------------------------------------------------
-- Buendelung und Mindestbetrag
-- ---------------------------------------------------------------------------

/**
 * Ein Zahler, drei Kinder, EINE Lastschrift.
 *
 * validateBatch weist zwei Posten mit derselben Mandatsreferenz ab - zu Recht,
 * denn die Bank koennte eine Rueckgabe nicht zuordnen. Deshalb teilen sich
 * alle Posten eines Zahlers eine end_to_end_id.
 */
create or replace function tests.test_familie_ergibt_eine_lastschrift()
returns setof text language plpgsql as $f$
declare adm record; eltern record; k1 record; k2 record; k3 record;
        v_batch uuid; v_tag date; v record; v_anzahl integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into eltern from tests.fixture_user() limit 1;
  select * into k1 from tests.fixture_user() limit 1;
  select * into k2 from tests.fixture_user() limit 1;
  select * into k3 from tests.fixture_user() limit 1;

  update public.members set billing_payer_id = eltern.member_id
   where id in (k1.member_id, k2.member_id, k3.member_id);

  perform tests.fixture_mandat(eltern.member_id);
  perform tests.fixture_angekuendigt(k1.member_id, 9000);
  perform tests.fixture_angekuendigt(k2.member_id, 9000);
  perform tests.fixture_angekuendigt(k3.member_id, 9000);
  v_tag := tests.fixture_einzugstag();

  perform tests.act_as(adm.auth_id);
  select public.create_debit_batch('ZZTest Familie', v_tag) into v_batch;
  select * into v from public.add_charges_to_debit_batch(v_batch);
  perform set_config('role', 'postgres', true);

  select count(distinct end_to_end_id)::integer into v_anzahl
  from public.debit_items where batch_id = v_batch;

  return next is(v.aufgenommen, 3, 'Alle drei Forderungen sind aufgenommen');
  return next is(v_anzahl, 1, 'Sie teilen sich EINE Kennung - eine Lastschrift');
  return next is(
    (select item_count from public.debit_batches where id = v_batch),
    1, 'Der Lauf zaehlt eine Lastschrift');
  return next is(
    (select total_cents from public.debit_batches where id = v_batch),
    27000, 'ueber den Gesamtbetrag');
end; $f$;

/**
 * Die Kennung bleibt unter 35 Zeichen und unterscheidet die Zahler.
 *
 * Gefunden im ersten echten Durchstich: die Kennung war 45 Zeichen lang und
 * wurde beim Schreiben der Datei gekuerzt - am Ende, wo der Zahler steht. Aus
 * 300 unterscheidbaren Lastschriften wurden 300 mit derselben Kennung, ohne
 * dass irgendetwas fehlgeschlagen waere. Die Bank haette keine Rueckgabe mehr
 * zuordnen koennen.
 */
create or replace function tests.test_kennung_bleibt_kurz_und_eindeutig()
returns setof text language plpgsql as $f$
declare adm record; a record; b record; v_batch uuid; v_tag date;
        v_laenge integer; v_verschieden integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into a from tests.fixture_user() limit 1;
  select * into b from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(a.member_id);
  perform tests.fixture_mandat(b.member_id);
  perform tests.fixture_angekuendigt(a.member_id, 19000);
  perform tests.fixture_angekuendigt(b.member_id, 19000);
  v_tag := tests.fixture_einzugstag();

  perform tests.act_as(adm.auth_id);
  select public.create_debit_batch('ZZTest Kennung', v_tag) into v_batch;
  perform public.add_charges_to_debit_batch(v_batch);
  perform set_config('role', 'postgres', true);

  select max(length(end_to_end_id))::integer, count(distinct end_to_end_id)::integer
    into v_laenge, v_verschieden
  from public.debit_items where batch_id = v_batch;

  return next cmp_ok(v_laenge, '<=', 35,
    'Die Kennung passt in die 35 Zeichen der Datei');
  return next is(v_verschieden, 2,
    'Zwei Zahler bekommen zwei verschiedene Kennungen');
end; $f$;

/**
 * Zwei kleine Monate ueberschreiten den Mindestbetrag zusammen.
 *
 * Die Schwelle wirkt je Zahler ueber alle offenen Forderungen, nicht je
 * Forderung - sonst bliebe ein Getraenkekonto mit 3 Euro im Monat ewig liegen.
 */
create or replace function tests.test_mindestbetrag_gilt_je_zahler()
returns setof text language plpgsql as $f$
declare adm record; u record; v_tag date; v_erst boolean; v_dann boolean;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(u.member_id);
  -- drinks.min_debit_cents steht auf 500.
  perform tests.fixture_angekuendigt(u.member_id, 300, 'drinks');
  v_tag := tests.fixture_einzugstag();

  perform tests.act_as(adm.auth_id);
  select k.einzugsfaehig into v_erst
  from public.debit_batch_candidates(v_tag) k where k.payer_id = u.member_id;
  perform set_config('role', 'postgres', true);

  perform tests.fixture_angekuendigt(u.member_id, 300, 'misc');

  perform tests.act_as(adm.auth_id);
  select k.einzugsfaehig into v_dann
  from public.debit_batch_candidates(v_tag) k where k.payer_id = u.member_id;
  perform set_config('role', 'postgres', true);

  return next is(v_erst, false, '3,00 Euro allein werden nicht eingezogen');
  return next is(v_dann, true, 'zusammen mit dem naechsten Posten aber schon');
end; $f$;

/** Zweimal aufnehmen nimmt nichts doppelt. */
create or replace function tests.test_zweites_aufnehmen_nimmt_nichts_doppelt()
returns setof text language plpgsql as $f$
declare adm record; u record; v_batch uuid; v_tag date; v record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(u.member_id);
  perform tests.fixture_angekuendigt(u.member_id, 15000);
  v_tag := tests.fixture_einzugstag();

  perform tests.act_as(adm.auth_id);
  select public.create_debit_batch('ZZTest Doppelt', v_tag) into v_batch;
  perform public.add_charges_to_debit_batch(v_batch);
  select * into v from public.add_charges_to_debit_batch(v_batch);
  perform set_config('role', 'postgres', true);

  return next is(v.aufgenommen, 0, 'Der zweite Durchlauf nimmt nichts mehr auf');
  return next is(
    (select count(*)::integer from public.debit_items where batch_id = v_batch),
    1, 'Es bleibt bei einem Posten');
end; $f$;

-- ---------------------------------------------------------------------------
-- Die Datei
-- ---------------------------------------------------------------------------

/** Der Bausatz fuer die Datei kommt vollstaendig und mit Klartext-IBAN. */
create or replace function tests.test_payload_liefert_alles_fuer_die_datei()
returns setof text language plpgsql as $f$
declare adm record; u record; v_batch uuid; v_tag date; p record; v_log integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(u.member_id);
  perform tests.fixture_angekuendigt(u.member_id, 19000);
  v_tag := tests.fixture_einzugstag();

  perform tests.act_as(adm.auth_id);
  select public.create_debit_batch('ZZTest Datei', v_tag) into v_batch;
  perform public.add_charges_to_debit_batch(v_batch);
  select * into p from public.debit_batch_payload(v_batch) limit 1;
  perform set_config('role', 'postgres', true);

  return next is(p.debtor_iban, 'DE02120300000000202051',
    'Die IBAN kommt im Klartext - ohne sie laesst sich keine Datei bauen');
  return next is(p.amount_cents, 19000, 'mit dem Betrag');
  return next ok(p.end_to_end_id is not null, 'und einer Kennung');
  return next ok(p.mandate_reference is not null, 'und der Mandatsreferenz');
  return next is(p.collection_date, v_tag, 'sowie dem Faelligkeitstag');

  select count(*)::integer into v_log from public.change_log
   where table_name = 'debit_batches' and row_id = v_batch and action = 'read';
  return next is(v_log, 1,
    'Jeder Zugriff auf die Klartext-IBANs steht im Aenderungsprotokoll');
end; $f$;

/** Nach dem Erzeugen ist der Lauf zu. */
create or replace function tests.test_erzeugter_lauf_ist_unveraenderlich()
returns setof text language plpgsql as $f$
declare adm record; u record; v_batch uuid; v_tag date; v_summe integer; v_anzahl integer;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(u.member_id);
  perform tests.fixture_angekuendigt(u.member_id, 12000);
  v_tag := tests.fixture_einzugstag();

  perform tests.act_as(adm.auth_id);
  select public.create_debit_batch('ZZTest Fertig', v_tag) into v_batch;
  perform public.add_charges_to_debit_batch(v_batch);
  select total_cents, item_count into v_summe, v_anzahl
  from public.debit_batches where id = v_batch;
  perform public.mark_debit_batch_generated(v_batch, 'sepa/test.xml', v_summe, v_anzahl);

  return next is(
    (select status::text from public.debit_batches where id = v_batch),
    'generated', 'Der Lauf gilt als erzeugt');
  return next is(
    (select status::text from public.charges c
      join public.debit_items i on i.charge_id = c.id
      where i.batch_id = v_batch limit 1),
    'submitted', 'und die Forderungen als eingereicht');

  return next throws_ok(
    format('select public.debit_batch_payload(%L)', v_batch), '22023', null,
    'Die Datei laesst sich kein zweites Mal erzeugen');
  return next throws_ok(
    format('select public.add_charges_to_debit_batch(%L)', v_batch), '22023', null,
    'und es kommt nichts mehr dazu');
  perform set_config('role', 'postgres', true);
end; $f$;

/** Eine Datei, die nicht zum Lauf passt, wird nicht abgenommen. */
create or replace function tests.test_falsche_summe_wird_abgewiesen()
returns setof text language plpgsql as $f$
declare adm record; u record; v_batch uuid; v_tag date;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(u.member_id);
  perform tests.fixture_angekuendigt(u.member_id, 12000);
  v_tag := tests.fixture_einzugstag();

  perform tests.act_as(adm.auth_id);
  select public.create_debit_batch('ZZTest Summe', v_tag) into v_batch;
  perform public.add_charges_to_debit_batch(v_batch);

  return next throws_ok(
    format('select public.mark_debit_batch_generated(%L, ''x'', 99999, 1)', v_batch),
    '22023', null,
    'Eine Datei mit anderer Summe als der Lauf wird nicht abgenommen');
  perform set_config('role', 'postgres', true);
end; $f$;

/** Beim Einreichen wird das Mandat fortgeschrieben. */
create or replace function tests.test_einreichen_haelt_das_mandat_am_leben()
returns setof text language plpgsql as $f$
declare adm record; u record; v_batch uuid; v_tag date; v_summe integer; v_anzahl integer;
        v_vorher date; v_nachher date;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  perform tests.fixture_mandat(u.member_id);
  perform tests.fixture_angekuendigt(u.member_id, 12000);
  v_tag := tests.fixture_einzugstag();

  select last_used_on into v_vorher from public.sepa_mandates where member_id = u.member_id;

  perform tests.act_as(adm.auth_id);
  select public.create_debit_batch('ZZTest Einreichen', v_tag) into v_batch;
  perform public.add_charges_to_debit_batch(v_batch);
  select total_cents, item_count into v_summe, v_anzahl
  from public.debit_batches where id = v_batch;
  perform public.mark_debit_batch_generated(v_batch, 'sepa/x.xml', v_summe, v_anzahl);
  perform public.mark_debit_batch_submitted(v_batch);
  perform set_config('role', 'postgres', true);

  select last_used_on into v_nachher from public.sepa_mandates where member_id = u.member_id;

  return next ok(v_vorher is null, 'Vorher war das Mandat nie benutzt');
  return next is(v_nachher, v_tag,
    'Nach dem Einreichen traegt es den Einzugstag - das haelt die 36-Monats-Frist offen');
  return next is(
    (select status::text from public.debit_batches where id = v_batch),
    'submitted', 'und der Lauf gilt als eingereicht');
end; $f$;

/** Nur ein erzeugter Lauf laesst sich einreichen. */
create or replace function tests.test_entwurf_nicht_einreichbar()
returns setof text language plpgsql as $f$
declare adm record; v_batch uuid; v_tag date;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_tag := tests.fixture_einzugstag();

  perform tests.act_as(adm.auth_id);
  select public.create_debit_batch('ZZTest Entwurf', v_tag) into v_batch;
  return next throws_ok(
    format('select public.mark_debit_batch_submitted(%L)', v_batch), '22023', null,
    'Ein Entwurf laesst sich nicht als eingereicht vermerken');
  perform set_config('role', 'postgres', true);
end; $f$;

/** Ein leerer Lauf ergibt keine Datei. */
create or replace function tests.test_leerer_lauf_ergibt_keine_datei()
returns setof text language plpgsql as $f$
declare adm record; v_batch uuid; v_tag date;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  v_tag := tests.fixture_einzugstag();

  perform tests.act_as(adm.auth_id);
  select public.create_debit_batch('ZZTest Leer', v_tag) into v_batch;
  return next throws_ok(
    format('select public.mark_debit_batch_generated(%L, ''x'', 0, 0)', v_batch),
    '22023', null,
    'Ein Lauf ohne Posten ergibt keine Datei');
  perform set_config('role', 'postgres', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------

/**
 * An den RPCs vorbei geht nichts.
 *
 * Solange authenticated direkt in debit_batches schreiben darf, waere jede
 * Fristpruefung eine Empfehlung.
 */
create or replace function tests.test_keine_direkten_schreibrechte()
returns setof text language plpgsql as $f$
begin
  return next is(
    (select count(*)::integer from information_schema.role_table_grants
      where grantee = 'authenticated' and table_name in ('debit_batches', 'debit_items')
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
    0, 'authenticated schreibt weder in debit_batches noch in debit_items');
end; $f$;

/** Nur Administratoren sehen den Bausatz fuer die Datei. */
create or replace function tests.test_payload_nur_admin()
returns setof text language plpgsql as $f$
declare u record; adm record; v_batch uuid; v_tag date;
begin
  select * into adm from tests.fixture_user('admin') limit 1;
  select * into u from tests.fixture_user() limit 1;
  v_tag := tests.fixture_einzugstag();

  perform tests.act_as(adm.auth_id);
  select public.create_debit_batch('ZZTest Rechte', v_tag) into v_batch;
  perform set_config('role', 'postgres', true);

  perform tests.act_as(u.auth_id);
  return next throws_ok(
    format('select public.debit_batch_payload(%L)', v_batch), '42501', null,
    'Ein normales Mitglied bekommt keine Klartext-IBANs');
  return next throws_ok(
    format('select public.create_debit_batch(''X'', %L)', v_tag), '42501', null,
    'und legt auch keinen Lauf an');
  perform set_config('role', 'postgres', true);
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer den Lastschriftlauf sind eingespielt');
select * from extensions.finish();
