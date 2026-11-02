-- ===========================================================================
-- Mannschaftsführer lädt in seine Mannschaft ein
--
-- Wie in den anderen Dateien werden hier nur Funktionen definiert; ausgeführt
-- werden sie in 99_runtests.sql.
--
-- Merke: nach tests.act_as() besteht kein Zugriff mehr auf das Schema tests.
-- Die Rolle wird deshalb inline mit set_config zurückgesetzt.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Hilfen
-- ---------------------------------------------------------------------------

/** Eine Mannschaft mit Mannschaftsführer. */
create or replace function tests.mf_mannschaft(p_name text)
returns table (team_id uuid, member_id uuid, auth_id uuid)
language plpgsql as $f$
declare v_team uuid; v record;
begin
  insert into public.teams (name) values (p_name) returning id into v_team;
  select * into v from tests.fixture_user(null, 'MF') limit 1;
  update public.members set team_id = v_team, is_team_captain = true where id = v.member_id;
  return query select v_team, v.member_id, v.auth_id;
end; $f$;

/** Ein Spieler, wahlweise schon in einer Mannschaft. */
create or replace function tests.spieler_in(p_team uuid default null, p_first text default 'Spieler')
returns table (member_id uuid, auth_id uuid)
language plpgsql as $f$
declare v record;
begin
  select * into v from tests.fixture_user(null, p_first) limit 1;
  update public.members set team_id = p_team, mobile = '0170 1234567' where id = v.member_id;
  return query select v.member_id, v.auth_id;
end; $f$;

create or replace function tests.nachrichten(p_member uuid, p_kind text)
returns setof public.notifications language sql as $f$
  select * from public.notifications where member_id = p_member and kind = p_kind;
$f$;

-- ---------------------------------------------------------------------------
-- Tabelle und Rechte
-- ---------------------------------------------------------------------------

create or replace function tests.test_mf_einladungen_rls_lesen()
returns setof text language plpgsql as $f$
declare mf record; mf2 record; s record; x record; adm record; v_inv uuid;
begin
  select * into mf  from tests.mf_mannschaft('T RLS A') limit 1;
  select * into mf2 from tests.mf_mannschaft('T RLS B') limit 1;
  select * into s   from tests.spieler_in() limit 1;
  select * into x   from tests.spieler_in() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;
  insert into public.team_invitations (team_id, member_id, invited_by)
  values (mf.team_id, s.member_id, mf.member_id) returning id into v_inv;

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(s.auth_id);
  return next is((select count(*) from public.team_invitations where id = v_inv), 1::bigint,
                 'Der Eingeladene sieht seine Einladung');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(mf.auth_id);
  return next is((select count(*) from public.team_invitations where id = v_inv), 1::bigint,
                 'Der MF der Mannschaft sieht sie');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(mf2.auth_id);
  return next is((select count(*) from public.team_invitations where id = v_inv), 0::bigint,
                 'Der MF einer anderen Mannschaft nicht');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(x.auth_id);
  return next is((select count(*) from public.team_invitations where id = v_inv), 0::bigint,
                 'Ein Unbeteiligter nicht');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(adm.auth_id);
  return next is((select count(*) from public.team_invitations where id = v_inv), 1::bigint,
                 'Der Admin schon');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
end; $f$;

create or replace function tests.test_mf_einladungen_nur_ueber_rpcs()
returns setof text language plpgsql as $f$
declare mf record; s record; v_inv uuid;
begin
  select * into mf from tests.mf_mannschaft('T Schreiben') limit 1;
  select * into s  from tests.spieler_in() limit 1;
  insert into public.team_invitations (team_id, member_id, invited_by)
  values (mf.team_id, s.member_id, mf.member_id) returning id into v_inv;

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(mf.auth_id);
  return next throws_ok(
    format($q$insert into public.team_invitations (team_id, member_id) values (%L, %L)$q$,
           mf.team_id, mf.member_id),
    '42501', null, 'Kein direktes insert');
  return next throws_ok(
    format($q$delete from public.team_invitations where id = %L$q$, v_inv),
    '42501', null, 'Kein direktes delete');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(s.auth_id);
  return next throws_ok(
    format($q$update public.team_invitations set status = 'angenommen' where id = %L$q$, v_inv),
    '42501', null, 'Kein direktes update');
  return next throws_ok(
    format($q$update public.members set team_phone_visible = true where id = %L$q$, s.member_id),
    '42501', null, 'team_phone_visible hat keinen Spalten-Grant');
  return next throws_ok(
    format($q$update public.members set team_id = %L where id = %L$q$, mf.team_id, s.member_id),
    '42501', null, 'Sich selbst eintragen geht nicht');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Nur der MF, nur für die eigene Mannschaft
-- ---------------------------------------------------------------------------

create or replace function tests.test_mf_nur_mf_darf_einladen()
returns setof text language plpgsql as $f$
declare mf record; s record; x record;
begin
  select * into mf from tests.mf_mannschaft('T Nur MF') limit 1;
  select * into s  from tests.spieler_in(mf.team_id) limit 1;
  select * into x  from tests.spieler_in() limit 1;

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(s.auth_id);
  return next throws_ok(format($q$select public.mannschaft_einladen(%L)$q$, x.member_id),
    '42501', null, 'Ein Spieler ohne MF-Häkchen lädt nicht ein');
  return next throws_ok($q$select * from public.mannschaft_kandidaten()$q$,
    '42501', null, 'und sieht keine Kandidaten');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(x.auth_id);
  return next throws_ok(format($q$select public.mannschaft_einladen(%L)$q$, x.member_id),
    '42501', null, 'Ohne Mannschaft lädt man sich nicht selbst ein');

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  update public.teams set active = false where id = mf.team_id;
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(mf.auth_id);
  return next throws_ok(format($q$select public.mannschaft_einladen(%L)$q$, x.member_id),
    '42501', null, 'Der MF einer stillgelegten Mannschaft lädt nicht ein');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
end; $f$;

create or replace function tests.test_mf_ist_mannschaftsfuehrer()
returns setof text language plpgsql as $f$
declare mf record; mf2 record;
begin
  select * into mf  from tests.mf_mannschaft('T Prüfung A') limit 1;
  select * into mf2 from tests.mf_mannschaft('T Prüfung B') limit 1;

  -- Nur intern nutzbar: authenticated darf sie nicht aufrufen.
  return next ok(not has_function_privilege('authenticated', 'private.ist_mannschaftsfuehrer(uuid)', 'execute'),
    'ist_mannschaftsfuehrer ist nicht für authenticated freigegeben');

  -- Wie aus einer RPC: Claims des Nutzers, Rolle des Eigentümers.
  perform set_config('request.jwt.claims',
    json_build_object('sub', mf.auth_id::text, 'role', 'authenticated')::text, true);
  return next ok(private.ist_mannschaftsfuehrer(mf.team_id), 'MF der eigenen Mannschaft');
  return next ok(not private.ist_mannschaftsfuehrer(mf2.team_id), 'nicht der fremden');

  perform set_config('request.jwt.claims', '{}', true);
  update public.members set login_disabled_at = now() where id = mf.member_id;
  perform set_config('request.jwt.claims',
    json_build_object('sub', mf.auth_id::text, 'role', 'authenticated')::text, true);
  return next ok(not private.ist_mannschaftsfuehrer(mf.team_id), 'ohne Zugang nicht');
  perform set_config('request.jwt.claims', '{}', true);
end; $f$;

create or replace function tests.test_mf_einladen_und_kandidaten()
returns setof text language plpgsql as $f$
declare mf record; drin record; neu record; anders record; weg record; v_team2 uuid;
        v_inv uuid; v_typ uuid; r record;
begin
  select * into mf     from tests.mf_mannschaft('T Einladen') limit 1;
  select * into drin   from tests.spieler_in(mf.team_id, 'Drin') limit 1;
  select * into neu    from tests.spieler_in(null, 'Zzneu') limit 1;
  insert into public.teams (name) values ('T Anders') returning id into v_team2;
  select * into anders from tests.spieler_in(v_team2, 'Zzanders') limit 1;
  select * into weg    from tests.spieler_in(null, 'Zzweg') limit 1;
  update public.members set status = 'inactive' where id = weg.member_id;
  select id into v_typ from public.member_attribute_types where code = 'mannschaft_interesse';
  insert into public.member_attribute_values (member_id, attribute_type_id, text_value)
  values (anders.member_id, v_typ, 'ja');

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(mf.auth_id);
  v_inv := public.mannschaft_einladen(neu.member_id);
  return next ok(v_inv is not null, 'Der MF lädt ein');

  return next throws_ok(format($q$select public.mannschaft_einladen(%L)$q$, neu.member_id),
    '23514', 'Dieses Mitglied ist schon eingeladen.', 'Nicht doppelt');
  return next throws_ok(format($q$select public.mannschaft_einladen(%L)$q$, drin.member_id),
    '23514', 'Dieses Mitglied steht schon im Kader.', 'Nicht wer schon im Kader steht');
  return next throws_ok(format($q$select public.mannschaft_einladen(%L)$q$, weg.member_id),
    '23514', 'Nur aktive Mitglieder mit Zugang können eingeladen werden.', 'Nicht wer nicht aktiv ist');

  return next ok(not exists (select 1 from public.mannschaft_kandidaten('Drin')),
    'Kandidaten ohne den eigenen Kader');
  return next ok(not exists (select 1 from public.mannschaft_kandidaten('Zzweg')),
    'und ohne Inaktive');
  select * into r from public.mannschaft_kandidaten('Zzneu');
  return next ok(r.eingeladen, 'Eingeladene sind markiert');
  select * into r from public.mannschaft_kandidaten('Zza');
  return next is(r.aktuelle_mannschaft, 'T Anders', 'Wer woanders spielt, zeigt die Mannschaft');
  return next ok(r.mannschaft_interesse, 'und das Interesse');
  return next is((select k.member_id from public.mannschaft_kandidaten('Zz') k limit 1), anders.member_id,
    'Interessenten stehen zuerst');
  return next is((select count(*) from public.mannschaft_kandidaten('%')), 0::bigint,
    'Platzhalter in der Suche zählen wörtlich');
  return next ok((select count(*) from public.mannschaft_kandidaten()) <= 50, 'Höchstens 50');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);

  return next is((select body from tests.nachrichten(neu.member_id, 'team_invited') limit 1),
    format('%s lädt dich in die Mannschaft T Einladen ein.', private.member_label(mf.member_id)),
    'Der Eingeladene bekommt eine Nachricht');
  return next ok('team_invited' = any (private.notification_push_kinds()), 'Sie geht per Push');
  return next ok(not ('team_invited' = any (private.notification_mail_kinds())), 'nicht per Mail');
end; $f$;

-- ---------------------------------------------------------------------------
-- Annehmen, ablehnen, wechseln
-- ---------------------------------------------------------------------------

create or replace function tests.test_mf_annehmen()
returns setof text language plpgsql as $f$
declare mf record; mf2 record; s record; v_inv uuid; v_inv2 uuid; v_dritte uuid; e record; m public.members;
        v_mf_name text;
begin
  select * into mf  from tests.mf_mannschaft('T Neu') limit 1;
  select * into mf2 from tests.mf_mannschaft('T Alt') limit 1;
  select * into s   from tests.spieler_in(mf2.team_id) limit 1;
  insert into public.team_invitations (team_id, member_id, invited_by)
  values (mf.team_id, s.member_id, mf.member_id) returning id into v_inv;
  -- Eine zweite offene Einladung, die mit dem Annehmen erledigt ist.
  insert into public.teams (name) values ('T Dritte') returning id into v_dritte;
  insert into public.team_invitations (team_id, member_id)
  values (v_dritte, s.member_id) returning id into v_inv2;
  v_mf_name := private.member_label(mf.member_id);

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(s.auth_id);
  select * into e from public.meine_mannschaft_einladungen() where id = v_inv;
  return next is(e.team_name, 'T Neu', 'Die Einladung erscheint beim Spieler');
  return next is(e.wechsel_von, 'T Alt', 'mit der bisherigen Mannschaft');
  return next ok(e.annehmen_moeglich, 'Annehmen geht');
  return next is(e.hinweis, 'Du wechselst damit aus T Alt in T Neu.', 'mit Wechselhinweis');
  return next is(e.eingeladen_von, v_mf_name, 'und nennt den MF');

  perform public.mannschaft_einladung_beantworten(v_inv, true, true);
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);

  select * into m from public.members where id = s.member_id;
  return next is(m.team_id, mf.team_id, 'Nach dem Annehmen steht er in der neuen Mannschaft');
  return next ok(m.team_phone_visible, 'mit Zustimmung zum Telefon');
  return next ok(not m.is_team_captain, 'als Spieler');
  return next is((select status from public.team_invitations where id = v_inv), 'angenommen', 'Status angenommen');
  return next is((select status from public.team_invitations where id = v_inv2), 'zurueckgezogen',
    'Weitere offene Einladungen sind geschlossen');
  return next is((select body from tests.nachrichten(mf.member_id, 'team_invitation_answered') limit 1),
    format('%s hat die Einladung in T Neu angenommen.', private.member_label(s.member_id)),
    'Der MF erfährt es');
  return next is((select count(*) from tests.nachrichten(mf2.member_id, 'team_left')), 1::bigint,
    'Der alte MF erfährt vom Wechsel');
  return next ok(exists (select 1 from public.change_log
                          where row_id = s.member_id and table_name = 'members' and diff ? 'team_id'),
    'Die Kaderänderung steht im Protokoll');

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(s.auth_id);
  return next throws_ok(format($q$select public.mannschaft_einladung_beantworten(%L, true)$q$, v_inv),
    '23514', 'Diese Einladung ist nicht mehr offen.', 'Zweimal annehmen geht nicht');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
end; $f$;

create or replace function tests.test_mf_ablehnen_und_mf_sperre()
returns setof text language plpgsql as $f$
declare mf record; mf2 record; v_inv uuid; e record;
begin
  select * into mf  from tests.mf_mannschaft('T Ziel') limit 1;
  select * into mf2 from tests.mf_mannschaft('T Eigene') limit 1;
  insert into public.team_invitations (team_id, member_id, invited_by)
  values (mf.team_id, mf2.member_id, mf.member_id) returning id into v_inv;

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(mf2.auth_id);
  select * into e from public.meine_mannschaft_einladungen() where id = v_inv;
  return next ok(not e.annehmen_moeglich, 'Ein MF kann nicht wechseln');
  return next is(e.hinweis, 'Du bist Mannschaftsführer von T Eigene. Das kann nur der Vorstand ändern.',
    'und bekommt den Hinweis');
  return next throws_ok(format($q$select public.mannschaft_einladung_beantworten(%L, true)$q$, v_inv),
    '23514', 'Du bist Mannschaftsführer von T Eigene. Das kann nur der Vorstand ändern.',
    'Annehmen wird abgewiesen');
  perform public.mannschaft_einladung_beantworten(v_inv, false);
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);

  return next is((select team_id from public.members where id = mf2.member_id), mf2.team_id,
    'Er bleibt in seiner Mannschaft');
  return next is((select status from public.team_invitations where id = v_inv), 'abgelehnt', 'Ablehnen geht');
  return next is((select body from tests.nachrichten(mf.member_id, 'team_invitation_answered') limit 1),
    format('%s hat die Einladung in T Ziel abgelehnt.', private.member_label(mf2.member_id)),
    'Der einladende MF erfährt es');
end; $f$;

create or replace function tests.test_mf_fremde_einladung_beantworten()
returns setof text language plpgsql as $f$
declare mf record; s record; x record; v_inv uuid;
begin
  select * into mf from tests.mf_mannschaft('T Fremd') limit 1;
  select * into s  from tests.spieler_in() limit 1;
  select * into x  from tests.spieler_in() limit 1;
  insert into public.team_invitations (team_id, member_id, invited_by)
  values (mf.team_id, s.member_id, mf.member_id) returning id into v_inv;

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(x.auth_id);
  return next throws_ok(format($q$select public.mannschaft_einladung_beantworten(%L, true)$q$, v_inv),
    'P0002', 'Diese Einladung gibt es nicht.', 'Fremde Einladungen lassen sich nicht beantworten');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
end; $f$;

-- ---------------------------------------------------------------------------
-- Verfall und Zurückziehen
-- ---------------------------------------------------------------------------

create or replace function tests.test_mf_verfall()
returns setof text language plpgsql as $f$
declare mf record; s record; v_inv uuid; v_neu uuid; v_suche text;
begin
  select * into mf from tests.mf_mannschaft('T Verfall') limit 1;
  select * into s  from tests.spieler_in() limit 1;
  v_suche := (select last_name from public.members where id = s.member_id);
  insert into public.team_invitations (team_id, member_id, invited_by, created_at, expires_at)
  values (mf.team_id, s.member_id, mf.member_id, now() - interval '31 days', now() - interval '1 day')
  returning id into v_inv;

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(s.auth_id);
  return next is((select count(*) from public.meine_mannschaft_einladungen()), 0::bigint,
    'Verfallene Einladungen erscheinen nicht');
  return next throws_ok(format($q$select public.mannschaft_einladung_beantworten(%L, true)$q$, v_inv),
    '23514', 'Diese Einladung ist abgelaufen.', 'und lassen sich nicht annehmen');

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(mf.auth_id);
  return next is(jsonb_array_length(public.meine_mannschaft() -> 'offene_einladungen'), 0,
    'Der MF sieht sie nicht mehr als offen');
  return next ok(not (select k.eingeladen from public.mannschaft_kandidaten(v_suche) k where k.member_id = s.member_id),
    'und kann neu einladen');
  v_neu := public.mannschaft_einladen(s.member_id);
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);

  return next is(v_neu, v_inv, 'Neu einladen erneuert dieselbe Einladung');
  return next ok((select expires_at > now() + interval '29 days' from public.team_invitations where id = v_inv),
    'mit neuer Frist von 30 Tagen');
end; $f$;

create or replace function tests.test_mf_zurueckziehen()
returns setof text language plpgsql as $f$
declare mf record; mf2 record; s record; v_inv uuid;
begin
  select * into mf  from tests.mf_mannschaft('T Zurück') limit 1;
  select * into mf2 from tests.mf_mannschaft('T Zurück Fremd') limit 1;
  select * into s   from tests.spieler_in() limit 1;
  insert into public.team_invitations (team_id, member_id, invited_by)
  values (mf.team_id, s.member_id, mf.member_id) returning id into v_inv;

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(mf2.auth_id);
  return next throws_ok(format($q$select public.mannschaft_einladung_zurueckziehen(%L)$q$, v_inv),
    '42501', null, 'Ein fremder MF zieht nicht zurück');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(s.auth_id);
  return next throws_ok(format($q$select public.mannschaft_einladung_zurueckziehen(%L)$q$, v_inv),
    '42501', null, 'Der Eingeladene auch nicht (er lehnt ab)');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(mf.auth_id);
  perform public.mannschaft_einladung_zurueckziehen(v_inv);
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(s.auth_id);
  return next throws_ok(format($q$select public.mannschaft_einladung_beantworten(%L, true)$q$, v_inv),
    '23514', 'Diese Einladung ist nicht mehr offen.', 'Zurückgezogene lassen sich nicht annehmen');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  return next is((select status from public.team_invitations where id = v_inv), 'zurueckgezogen',
    'Der MF zieht zurück');
end; $f$;

-- ---------------------------------------------------------------------------
-- Austragen und austreten
-- ---------------------------------------------------------------------------

create or replace function tests.test_mf_austragen()
returns setof text language plpgsql as $f$
declare mf record; mf2 record; s record; s2 record; m public.members;
begin
  select * into mf  from tests.mf_mannschaft('T Austragen') limit 1;
  select * into mf2 from tests.mf_mannschaft('T Austragen Fremd') limit 1;
  select * into s   from tests.spieler_in(mf.team_id) limit 1;
  select * into s2  from tests.spieler_in(mf.team_id) limit 1;
  update public.members set team_phone_visible = true where id = s.member_id;

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(mf2.auth_id);
  return next throws_ok(format($q$select public.mannschaft_austragen(%L)$q$, s.member_id),
    '42501', null, 'Ein fremder MF trägt nicht aus');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(s2.auth_id);
  return next throws_ok(format($q$select public.mannschaft_austragen(%L)$q$, s.member_id),
    '42501', null, 'Ein Spieler trägt keinen anderen aus');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(mf.auth_id);
  return next throws_ok(format($q$select public.mannschaft_austragen(%L)$q$, mf.member_id),
    '23514', 'Als Mannschaftsführer kannst du nicht austreten. Das kann nur der Vorstand ändern.',
    'Der MF trägt sich nicht selbst aus');
  perform public.mannschaft_austragen(s.member_id);
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);

  select * into m from public.members where id = s.member_id;
  return next ok(m.team_id is null, 'Der MF trägt einen Spieler aus');
  return next ok(not m.team_phone_visible, 'Die Zustimmung zum Telefon fällt weg');
  return next is((select body from tests.nachrichten(s.member_id, 'team_removed') limit 1),
    'Du bist nicht mehr in der Mannschaft T Austragen.', 'Der Ausgetragene erfährt es');
end; $f$;

create or replace function tests.test_mf_austreten()
returns setof text language plpgsql as $f$
declare mf record; s record; x record;
begin
  select * into mf from tests.mf_mannschaft('T Austreten') limit 1;
  select * into s  from tests.spieler_in(mf.team_id) limit 1;
  select * into x  from tests.spieler_in() limit 1;

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(x.auth_id);
  return next throws_ok(format($q$select public.mannschaft_austragen(%L)$q$, x.member_id),
    '23514', 'Du bist in keiner Mannschaft.', 'Ohne Mannschaft kein Austritt');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(s.auth_id);
  perform public.mannschaft_austragen(s.member_id);
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);

  return next ok((select team_id is null from public.members where id = s.member_id), 'Ein Spieler tritt selbst aus');
  return next is((select body from tests.nachrichten(mf.member_id, 'team_left') limit 1),
    format('%s ist aus T Austreten ausgetreten.', private.member_label(s.member_id)), 'Der MF erfährt es');
end; $f$;

-- ---------------------------------------------------------------------------
-- Telefon nur mit Zustimmung
-- ---------------------------------------------------------------------------

create or replace function tests.test_mf_telefon_nur_mit_zustimmung()
returns setof text language plpgsql as $f$
declare mf record; ja record; nein record; x record; v jsonb;
begin
  select * into mf   from tests.mf_mannschaft('T Telefon') limit 1;
  select * into ja   from tests.spieler_in(mf.team_id, 'Ja') limit 1;
  select * into nein from tests.spieler_in(mf.team_id, 'Nein') limit 1;
  select * into x    from tests.spieler_in() limit 1;
  update public.members set mobile = null, phone = '07223 1234' where id = nein.member_id;

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(ja.auth_id);
  perform public.set_team_phone_visible(true);
  v := public.meine_mannschaft();
  return next ok(v ->> 'telefon_sichtbar' = 'true', 'Der Spieler stimmt zu');
  return next ok(not exists (select 1 from jsonb_array_elements(v -> 'kader') k where k ->> 'telefon' is not null),
    'Ein Spieler sieht keine Telefonnummern');
  return next is(jsonb_array_length(v -> 'offene_einladungen'), 0, 'und keine offenen Einladungen');
  return next is(v ->> 'ich_bin_mf', 'false', 'und ist kein MF');

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(mf.auth_id);
  v := public.meine_mannschaft();
  return next is((select k ->> 'telefon' from jsonb_array_elements(v -> 'kader') k
                   where k ->> 'member_id' = ja.member_id::text), '0170 1234567',
    'Der MF sieht die Nummer bei Zustimmung');
  return next ok((select k ->> 'telefon' is null from jsonb_array_elements(v -> 'kader') k
                   where k ->> 'member_id' = nein.member_id::text),
    'ohne Zustimmung nicht');
  return next is((v -> 'kader' -> 0 ->> 'member_id'), mf.member_id::text, 'Der MF steht oben im Kader');
  return next is((select count(*) from public.members where id = ja.member_id), 0::bigint,
    'Über die Tabelle sieht der MF fremde Mitglieder nicht');

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  update public.members set team_phone_visible = true where id = nein.member_id;
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(mf.auth_id);
  return next is((select k ->> 'telefon' from jsonb_array_elements(public.meine_mannschaft() -> 'kader') k
                   where k ->> 'member_id' = nein.member_id::text), '07223 1234',
    'Ohne Mobil gilt das Telefon');

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(x.auth_id);
  return next ok(public.meine_mannschaft() is null, 'Ohne Mannschaft ist meine_mannschaft null');
  return next throws_ok($q$select public.set_team_phone_visible(true)$q$,
    '23514', 'Das geht nur, wenn du in einer Mannschaft bist.', 'Zustimmung nur mit Mannschaft');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
end; $f$;

create or replace function tests.test_mf_kader_sortierung()
returns setof text language plpgsql as $f$
declare mf record; a record; b record; c record; v jsonb;
begin
  select * into mf from tests.mf_mannschaft('T Sortierung') limit 1;
  select * into a from tests.spieler_in(mf.team_id, 'A') limit 1;
  select * into b from tests.spieler_in(mf.team_id, 'B') limit 1;
  select * into c from tests.spieler_in(mf.team_id, 'C') limit 1;
  update public.members set tennis_lk = null where id = a.member_id;
  update public.members set tennis_lk = 'LK 12,5' where id = b.member_id;
  update public.members set tennis_lk = '8' where id = c.member_id;

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(mf.auth_id);
  v := public.meine_mannschaft();
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  return next is(array(select k ->> 'member_id' from jsonb_array_elements(v -> 'kader') k),
    array[mf.member_id::text, c.member_id::text, b.member_id::text, a.member_id::text],
    'MF zuerst, dann nach LK aufsteigend, ohne LK zuletzt');
end; $f$;

-- ---------------------------------------------------------------------------
-- Vorstand
-- ---------------------------------------------------------------------------

create or replace function tests.test_mf_admin_zuordnung_schliesst_einladungen()
returns setof text language plpgsql as $f$
declare mf record; mf2 record; s record; adm record; v_inv uuid; v_inv2 uuid;
begin
  select * into mf  from tests.mf_mannschaft('T Admin A') limit 1;
  select * into mf2 from tests.mf_mannschaft('T Admin B') limit 1;
  select * into s   from tests.spieler_in(mf2.team_id) limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;
  update public.members set team_phone_visible = true where id = s.member_id;
  insert into public.team_invitations (team_id, member_id, invited_by)
  values (mf.team_id, s.member_id, mf.member_id) returning id into v_inv;
  insert into public.team_invitations (team_id, member_id)
  values (mf2.team_id, mf.member_id) returning id into v_inv2;

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(adm.auth_id);
  perform public.set_member_team(s.member_id, mf.team_id);
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);

  return next is((select status from public.team_invitations where id = v_inv), 'zurueckgezogen',
    'set_member_team schließt die Einladung in dieselbe Mannschaft');
  return next is((select status from public.team_invitations where id = v_inv2), 'offen',
    'andere bleiben offen');
  return next ok(not (select team_phone_visible from public.members where id = s.member_id),
    'und setzt die Zustimmung beim Wechsel zurück');

  update public.members set status = 'archived' where id = mf.member_id;
  return next ok((select team_id is null and not team_phone_visible from public.members where id = mf.member_id),
    'Archivieren nimmt aus der Mannschaft');
end; $f$;

create or replace function tests.test_mf_admin_austragen_und_zurueckziehen()
returns setof text language plpgsql as $f$
declare mf record; s record; x record; adm record; v_inv uuid;
begin
  select * into mf  from tests.mf_mannschaft('T Admin C') limit 1;
  select * into s   from tests.spieler_in(mf.team_id) limit 1;
  select * into x   from tests.spieler_in() limit 1;
  select * into adm from tests.fixture_user('admin') limit 1;
  insert into public.team_invitations (team_id, member_id, invited_by)
  values (mf.team_id, x.member_id, mf.member_id) returning id into v_inv;

  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  perform tests.act_as(adm.auth_id);
  perform public.mannschaft_austragen(s.member_id);
  perform public.mannschaft_einladung_zurueckziehen(v_inv);
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '{}', true);
  return next ok((select team_id is null from public.members where id = s.member_id), 'Der Admin trägt aus');
  return next is((select status from public.team_invitations where id = v_inv), 'zurueckgezogen',
    'und zieht Einladungen zurück');
end; $f$;

select extensions.plan(1);
select extensions.pass('Tests zum Einladen in die Mannschaft sind eingespielt');
select * from extensions.finish();
