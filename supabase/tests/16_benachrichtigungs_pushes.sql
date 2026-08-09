-- ===========================================================================
-- Benachrichtigungen als Push: die Datenbankseite
--
-- Der Versand laeuft in einer Edge Function und ist hier nicht pruefbar. Was
-- entscheidet - wer bekommt was, geht es zweimal raus, und stoert der neue
-- Verbraucher den Mailversand? - liegt dagegen in SQL.
--
-- Der letzte Punkt ist der eigentliche Grund fuer diese Datei: seit dem Push
-- gibt es zwei Laeufe ueber dieselbe Warteschlange, und der naheliegende
-- Fehler waere, dass sie sich die Nachrichten gegenseitig wegnehmen.
--
-- Wie in den anderen Dateien werden nur Funktionen definiert; ausgefuehrt
-- werden sie in 99_runtests.sql.
-- ===========================================================================

/** Ein Mitglied mit angemeldetem Geraet. */
create or replace function tests.fixture_user_mit_geraet()
returns table (member_id uuid, auth_id uuid, token text) language plpgsql as $f$
declare u record; v_token text;
begin
  select * into u from tests.fixture_user() limit 1;
  v_token := 'ExponentPushToken[zz-' || substr(u.member_id::text, 1, 8) || ']';

  insert into public.push_tokens (member_id, token, platform, device_name)
  values (u.member_id, v_token, 'ios', 'Testgeraet');

  return query select u.member_id, u.auth_id, v_token;
end; $f$;

create or replace function tests.lege_push_nachricht_an(p_member_id uuid, p_kind text)
returns uuid language sql as $f$
  insert into public.notifications (member_id, kind, title, body)
  values (p_member_id, p_kind, 'ZZPush ' || p_kind, 'Text zu ' || p_kind)
  returning id;
$f$;

-- ---------------------------------------------------------------------------

create or replace function tests.test_push_wird_geliefert_und_abgehakt()
returns setof text language plpgsql as $f$
declare u record; v_id uuid; v_zeilen integer;
begin
  select * into u from tests.fixture_user_mit_geraet() limit 1;
  v_id := tests.lege_push_nachricht_an(u.member_id, 'booking_cancelled');

  select count(*)::integer into v_zeilen
  from public.claim_notification_pushes() c where c.member_id = u.member_id;

  return next is(v_zeilen, 1, 'Die Nachricht geht an das angemeldete Geraet');
  return next isnt(
    (select pushed_at from public.notifications where id = v_id), null,
    'Sie ist danach abgehakt');
end; $f$;

create or replace function tests.test_push_kein_doppelversand()
returns setof text language plpgsql as $f$
declare u record; v_zeilen integer;
begin
  -- Der wichtigste Test: das Abhaken passiert im selben Zug wie das Abholen,
  -- damit ein Absturz beim Senden hoechstens eine Nachricht kostet statt
  -- dreihundert doppelte zu erzeugen.
  select * into u from tests.fixture_user_mit_geraet() limit 1;
  perform tests.lege_push_nachricht_an(u.member_id, 'booking_cancelled');

  perform public.claim_notification_pushes();

  select count(*)::integer into v_zeilen
  from public.claim_notification_pushes() c where c.member_id = u.member_id;
  return next is(v_zeilen, 0, 'Der zweite Lauf liefert nichts mehr');
end; $f$;

create or replace function tests.test_push_und_mail_stoeren_sich_nicht()
returns setof text language plpgsql as $f$
declare u record; v_mail text; v_push integer; v_mails integer;
begin
  -- Die Regression, die der zweite Verbraucher einfuehren kann: teilten sich
  -- beide eine Abhak-Spalte, bekaeme nur der schnellere Lauf etwas.
  select * into u from tests.fixture_user_mit_geraet() limit 1;
  v_mail := 'zzpush-' || substr(u.member_id::text, 1, 8) || '@example.org';
  update public.members set email = v_mail where id = u.member_id;

  perform tests.lege_push_nachricht_an(u.member_id, 'booking_cancelled');

  select count(*)::integer into v_push
  from public.claim_notification_pushes() c where c.member_id = u.member_id;

  select count(*)::integer into v_mails
  from public.claim_notification_mails() c where c.member_id = u.member_id;

  return next is(v_push, 1, 'Der Push bekommt die Nachricht');
  return next is(v_mails, 1, 'Und die Mail bekommt sie auch');
end; $f$;

create or replace function tests.test_push_ohne_geraet_wird_abgehakt()
returns setof text language plpgsql as $f$
declare u record; v_id uuid; v_zeilen integer;
begin
  -- Ohne Geraet gibt es nichts zu senden. Abgehakt wird trotzdem, sonst
  -- bliebe die Nachricht ewig im Teilindex und jeder Lauf saehe sie erneut an.
  select * into u from tests.fixture_user() limit 1;
  v_id := tests.lege_push_nachricht_an(u.member_id, 'booking_cancelled');

  select count(*)::integer into v_zeilen
  from public.claim_notification_pushes() c where c.member_id = u.member_id;

  return next is(v_zeilen, 0, 'Ohne Geraet geht nichts raus');
  return next isnt(
    (select pushed_at from public.notifications where id = v_id), null,
    'Abgehakt wird sie trotzdem');
end; $f$;

create or replace function tests.test_push_stillgelegtes_geraet_wird_uebersprungen()
returns setof text language plpgsql as $f$
declare u record; v_zeilen integer;
begin
  select * into u from tests.fixture_user_mit_geraet() limit 1;
  update public.push_tokens set disabled_at = now() where token = u.token;
  perform tests.lege_push_nachricht_an(u.member_id, 'booking_cancelled');

  select count(*)::integer into v_zeilen
  from public.claim_notification_pushes() c where c.member_id = u.member_id;
  return next is(v_zeilen, 0, 'Ein stillgelegtes Geraet bekommt nichts mehr');
end; $f$;

create or replace function tests.test_push_nur_gewaehlte_arten()
returns setof text language plpgsql as $f$
declare u record; v_zeilen integer;
begin
  select * into u from tests.fixture_user_mit_geraet() limit 1;

  -- Direkt in die Tabelle statt ueber set_setting: die RPC verlangt einen
  -- angemeldeten Administrator, und hier geht es nicht um ihre Rechtepruefung,
  -- sondern um die Wirkung der Einstellung.
  update public.settings
     set value = '"booking_cancelled"'::jsonb
   where key = 'notifications.push_kinds';

  perform tests.lege_push_nachricht_an(u.member_id, 'player_joined');

  select count(*)::integer into v_zeilen
  from public.claim_notification_pushes() c where c.member_id = u.member_id;
  return next is(v_zeilen, 0, 'Was nicht in der Liste steht, geht nicht raus');
end; $f$;

create or replace function tests.test_push_token_umzug()
returns setof text language plpgsql as $f$
declare a record; b record; v_besitzer uuid; v_anzahl integer;
begin
  -- Das Familientelefon: meldet sich ein zweites Mitglied an, muss die Marke
  -- umziehen. Bliebe sie beim ersten, bekaeme der Vorbesitzer die Nachrichten
  -- des Nachfolgers.
  select * into a from tests.fixture_user_mit_geraet() limit 1;
  select * into b from tests.fixture_user() limit 1;

  perform set_config('request.jwt.claim.sub', b.auth_id::text, true);
  perform public.register_push_token(a.token, 'ios', 'Familientelefon');
  perform set_config('request.jwt.claim.sub', null, true);

  select member_id into v_besitzer from public.push_tokens where token = a.token;
  select count(*)::integer into v_anzahl from public.push_tokens where token = a.token;

  return next is(v_besitzer, b.member_id, 'Die Marke gehoert jetzt dem zweiten Mitglied');
  return next is(v_anzahl, 1, 'Und existiert nur einmal');
end; $f$;

create or replace function tests.test_rls_push_tokens_fremd_unsichtbar()
returns setof text language plpgsql as $f$
declare a record; b record; v_sichtbar integer;
begin
  select * into a from tests.fixture_user_mit_geraet() limit 1;
  select * into b from tests.fixture_user() limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', b.auth_id::text, true);

  select count(*)::integer into v_sichtbar
  from public.push_tokens where token = a.token;

  reset role;
  return next is(v_sichtbar, 0, 'Fremde Geraete sind nicht sichtbar');
end; $f$;

-- Diese Datei definiert nur Testfunktionen; ausgefuehrt werden sie in
-- 99_runtests.sql. Ohne Plan haelt pg_prove die Datei fuer kaputt.
select extensions.plan(1);
select extensions.pass('Tests fuer die Push-Benachrichtigungen sind eingespielt');
select * from extensions.finish();
