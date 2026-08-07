-- ===========================================================================
-- Benachrichtigungen per E-Mail: die Datenbankseite
--
-- Der Versand selbst laeuft in einer Edge Function und ist hier nicht pruefbar.
-- Alles, was entscheidet - wer bekommt was, und geht es zweimal raus? - liegt
-- dagegen in SQL und wird hier vollstaendig abgedeckt.
--
-- Wie in den anderen Dateien werden nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
-- ===========================================================================

/** Ein Mitglied mit Adresse - fixture_user() legt sie ohne an. */
create or replace function tests.fixture_user_mit_mail()
returns table (member_id uuid, auth_id uuid, email text) language plpgsql as $f$
declare u record; v_mail text;
begin
  select * into u from tests.fixture_user() limit 1;
  v_mail := 'zztest-' || substr(u.member_id::text, 1, 8) || '@example.org';
  update public.members set email = v_mail where id = u.member_id;
  return query select u.member_id, u.auth_id, v_mail;
end; $f$;

/** Setzt die Wahl bei "E-Mails zu Buchungen". */
create or replace function tests.setze_mailwahl(p_member_id uuid, p_wert text)
returns void language plpgsql as $f$
declare v_typ uuid; v_option uuid;
begin
  select id into v_typ from public.member_attribute_types where code = 'booking_mail';
  select id into v_option from public.member_attribute_options
   where attribute_type_id = v_typ and value = p_wert;

  delete from public.member_attribute_values
   where member_id = p_member_id and attribute_type_id = v_typ;

  insert into public.member_attribute_values (member_id, attribute_type_id, option_id)
  values (p_member_id, v_typ, v_option);
end; $f$;

create or replace function tests.lege_nachricht_an(p_member_id uuid, p_kind text)
returns uuid language sql as $f$
  insert into public.notifications (member_id, kind, title, body)
  values (p_member_id, p_kind, 'ZZTest ' || p_kind, 'Text zu ' || p_kind)
  returning id;
$f$;

-- ---------------------------------------------------------------------------
-- Abholen
-- ---------------------------------------------------------------------------

create or replace function tests.test_mail_wichtige_art_wird_geliefert()
returns setof text language plpgsql as $f$
declare u record; v_id uuid; v_zeilen integer; v_posten integer; v_mail text;
begin
  select * into u from tests.fixture_user_mit_mail() limit 1;
  v_id := tests.lege_nachricht_an(u.member_id, 'booking_displaced');

  select count(*)::integer into v_zeilen
  from public.claim_notification_mails() c where c.member_id = u.member_id;
  return next is(v_zeilen, 1, 'Eine verdraengte Buchung wird zum Versand gegeben');

  return next isnt(
    (select mailed_at from public.notifications where id = v_id), null,
    'und ist danach abgehakt');
end; $f$;

/**
 * Der wichtigste Test der Datei: ein zweiter Lauf darf dieselbe Nachricht nicht
 * noch einmal ausliefern. Sonst bekaeme ein Mitglied dieselbe Absage so oft,
 * wie der Zeitgeber tickt.
 */
create or replace function tests.test_mail_kein_doppelversand()
returns setof text language plpgsql as $f$
declare u record; v_zeilen integer;
begin
  select * into u from tests.fixture_user_mit_mail() limit 1;
  perform tests.lege_nachricht_an(u.member_id, 'booking_cancelled');

  perform public.claim_notification_mails();

  select count(*)::integer into v_zeilen
  from public.claim_notification_mails() c where c.member_id = u.member_id;
  return next is(v_zeilen, 0, 'Der zweite Lauf liefert nichts mehr');
end; $f$;

create or replace function tests.test_mail_ohne_adresse_wird_abgehakt()
returns setof text language plpgsql as $f$
declare u record; v_id uuid; v_zeilen integer;
begin
  -- fixture_user() legt bewusst kein E-Mail-Feld an.
  select * into u from tests.fixture_user() limit 1;
  v_id := tests.lege_nachricht_an(u.member_id, 'booking_displaced');

  select count(*)::integer into v_zeilen
  from public.claim_notification_mails() c where c.member_id = u.member_id;
  return next is(v_zeilen, 0, 'Ohne Adresse geht nichts raus');
  return next isnt(
    (select mailed_at from public.notifications where id = v_id), null,
    'die Nachricht wird trotzdem abgehakt, sonst bleibt sie ewig im Index');
end; $f$;

create or replace function tests.test_mail_unwichtige_art_bleibt_liegen()
returns setof text language plpgsql as $f$
declare u record; v_id uuid; v_zeilen integer;
begin
  select * into u from tests.fixture_user_mit_mail() limit 1;
  v_id := tests.lege_nachricht_an(u.member_id, 'player_joined');

  select count(*)::integer into v_zeilen
  from public.claim_notification_mails() c where c.member_id = u.member_id;
  return next is(v_zeilen, 0, 'Ein Mitspieler, der beitritt, ist keine Mail wert');
  return next isnt(
    (select mailed_at from public.notifications where id = v_id), null,
    'auch das wird abgehakt');
end; $f$;

create or replace function tests.test_mail_wahl_keine_und_alle()
returns setof text language plpgsql as $f$
declare a record; b record; v_zeilen integer;
begin
  select * into a from tests.fixture_user_mit_mail() limit 1;
  select * into b from tests.fixture_user_mit_mail() limit 1;
  perform tests.setze_mailwahl(a.member_id, 'keine');
  perform tests.setze_mailwahl(b.member_id, 'alle');

  perform tests.lege_nachricht_an(a.member_id, 'booking_displaced');
  perform tests.lege_nachricht_an(b.member_id, 'player_joined');

  create temporary table zz_lauf on commit drop as
    select * from public.claim_notification_mails();

  select count(*)::integer into v_zeilen from zz_lauf where member_id = a.member_id;
  return next is(v_zeilen, 0, 'Wer abbestellt hat, bekommt auch Wichtiges nicht');

  select count(*)::integer into v_zeilen from zz_lauf where member_id = b.member_id;
  return next is(v_zeilen, 1, 'Wer alles will, bekommt auch den Beitritt');
end; $f$;

create or replace function tests.test_mail_altes_bleibt_ungesendet()
returns setof text language plpgsql as $f$
declare u record; v_id uuid; v_zeilen integer;
begin
  select * into u from tests.fixture_user_mit_mail() limit 1;
  v_id := tests.lege_nachricht_an(u.member_id, 'booking_displaced');
  update public.notifications set created_at = now() - interval '3 days' where id = v_id;

  select count(*)::integer into v_zeilen
  from public.claim_notification_mails() c where c.member_id = u.member_id;
  return next is(v_zeilen, 0, 'Eine Sperrung von vorgestern wird nicht mehr gemailt');
  return next isnt(
    (select mailed_at from public.notifications where id = v_id), null,
    'aber abgehakt, damit sie den Index nicht verstopft');
end; $f$;

/**
 * Buendelung: eine Serienanlage erzeugt viele Benachrichtigungen fuer dieselbe
 * Person. Sie muessen als eine Zeile herauskommen, sonst wird daraus ein
 * Dutzend Einzelmails innerhalb einer Sekunde.
 */
create or replace function tests.test_mail_wird_je_empfaenger_gebuendelt()
returns setof text language plpgsql as $f$
declare u record; v_zeilen integer; v_posten integer;
begin
  select * into u from tests.fixture_user_mit_mail() limit 1;
  for i in 1..12 loop
    perform tests.lege_nachricht_an(u.member_id, 'booking_displaced');
  end loop;

  select count(*)::integer, max(jsonb_array_length(c.items))
    into v_zeilen, v_posten
  from public.claim_notification_mails() c where c.member_id = u.member_id;

  return next is(v_zeilen, 1, 'Zwoelf Nachrichten ergeben eine Mail');
  return next is(v_posten, 12, 'mit zwoelf Posten darin');
end; $f$;

-- ---------------------------------------------------------------------------
-- Freigeben und Berechtigung
-- ---------------------------------------------------------------------------

create or replace function tests.test_mail_freigeben_erlaubt_neuen_versuch()
returns setof text language plpgsql as $f$
declare u record; v_id uuid; v_zeilen integer; v_ids uuid[];
begin
  select * into u from tests.fixture_user_mit_mail() limit 1;
  v_id := tests.lege_nachricht_an(u.member_id, 'booking_removed');

  select c.notification_ids into v_ids
  from public.claim_notification_mails() c where c.member_id = u.member_id;

  return next is(public.release_notification_mails(v_ids), 1, 'Eine Nachricht wird freigegeben');
  return next is(
    (select mailed_at from public.notifications where id = v_id), null,
    'Der Haken ist wieder weg');

  select count(*)::integer into v_zeilen
  from public.claim_notification_mails() c where c.member_id = u.member_id;
  return next is(v_zeilen, 1, 'und der naechste Lauf nimmt sie wieder mit');
end; $f$;

create or replace function tests.test_mail_nur_dienst_oder_admin()
returns setof text language plpgsql as $f$
declare u record;
begin
  select * into u from tests.fixture_user_mit_mail() limit 1;

  perform tests.act_as(u.auth_id);
  return next throws_ok('select * from public.claim_notification_mails()',
    '42501', null, 'Ein gewoehnliches Mitglied holt keine Mails ab');
  return next throws_ok('select public.release_notification_mails(''{}''::uuid[])',
    '42501', null, 'und gibt auch keine frei');
  perform set_config('role', 'postgres', true);
end; $f$;

create or replace function tests.test_mail_admin_darf_anstossen()
returns setof text language plpgsql as $f$
declare adm record;
begin
  select * into adm from tests.fixture_user('admin') limit 1;

  perform tests.act_as(adm.auth_id);
  return next lives_ok('select * from public.claim_notification_mails()',
    'Ein Admin darf den Versand von Hand anstossen - sonst waere er ohne '
    'Zeitgeber nicht pruefbar');
  perform set_config('role', 'postgres', true);
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer den Mailversand sind eingespielt');
select * from extensions.finish();
