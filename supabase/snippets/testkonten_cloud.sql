-- ===========================================================================
-- Testkonten in der Cloud neu aufsetzen (vor dem Ausrollen an Tester)
--
-- Von Hand im SQL-Editor bzw. per MCP ausfuehren, NICHT als Migration: die
-- Konten gehoeren zur Testumgebung, nicht zum Schema.
--
-- Was passiert:
--   1. Alle Logins ausser dem Kiosk werden geloescht. Die Mitglieder bleiben;
--      members.auth_user_id wird ueber den Fremdschluessel geleert. Alle
--      Admin-Rollen fallen weg - Admin sind danach nur die Tester (+admin).
--   2. Je Testperson zwei neue Mitglieder mit Login, je mit eigener Adresse:
--        Mitglied  (Rolle member)
--        Admin     (Rollen member, admin)
--      Ein Login gehoert genau einem Mitglied (members.auth_user_id unique),
--      deshalb zwei Mitgliederzeilen fuer eine Person. Bei Gmail eignen sich
--      name+mitglied@ / name+admin@; GMX, web.de und T-Online nehmen "+" nicht
--      zuverlaessig an - dort zwei echte Adressen verwenden.
--   3. 200 Seed-Mitglieder mit @example.org-Adresse bekommen einen Login mit
--      gemeinsamem Passwort. Mails an diese Adressen kommen nie an - die
--      Konten sind nur zum Anmelden da.
--   4. Optional: Seed-Mitglieder ohne Login bekommen echte Adressen von
--      Testern; den Login erzeugt der Admin ueber "Einladung verschicken".
--   5. Ein Konto fuer Apples Pruefer (TestFlight -> Testinformationen).
--
-- Vor dem Ausfuehren die Platzhalter <<...>> ersetzen. Die Passwoerter
-- gehoeren nicht ins Repo; im Repo steht nur diese Vorlage.
--
-- Logins entstehen direkt in auth.users wie in supabase/seed.sql: die
-- Token-Spalten muessen '' sein, nicht null, sonst antwortet GoTrue beim
-- Anmelden mit HTTP 500.
-- ===========================================================================

create temp table _tester (vorname text, nachname text, mail_mitglied text, mail_admin text);
create temp table _einladung (vorname text, nachname text, email text);

insert into _tester values
  -- ('Lucas', 'Dollmann', 'lucas.dollmann2003+mitglied@gmail.com', 'lucas.dollmann2003+admin@gmail.com'),
  <<TESTER>>;

-- Optional, sonst diese Zeile leer lassen:
-- insert into _einladung values ('Anna', 'Beispiel', 'anna@example.com');  -- Name null = Seed-Name behalten
<<EINLADUNGEN>>

create function pg_temp.login_anlegen(p_email text, p_passwort text)
returns uuid language plpgsql as $f$
declare v_auth uuid := extensions.gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    v_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    lower(p_email), extensions.crypt(p_passwort, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
  ) values (
    extensions.gen_random_uuid(), v_auth, v_auth::text, 'email',
    jsonb_build_object('sub', v_auth::text, 'email', lower(p_email), 'email_verified', true),
    now(), now(), now()
  );
  return v_auth;
end $f$;

do $$
declare
  v_pw_tester  constant text := '<<PASSWORT_TESTER>>';
  v_pw_200     constant text := '<<PASSWORT_200>>';
  v_pw_pruefer constant text := '<<PASSWORT_PRUEFER>>';
  t record; m record; v_member uuid; v_auth uuid; v_rolle text; v_mail text;
begin
  -- 1. Alte Logins weg (ausser Kiosk). Der Fremdschluessel leert
  --    members.auth_user_id; ein Admin ohne Login darf es nicht geben.
  -- Admin sind danach nur noch die +admin-Konten der Tester. Der Seed hat
  -- auch Mitgliedern ohne Login die Rolle gegeben; die landeten sonst unter
  -- den 200 Konten.
  delete from public.member_roles where role = 'admin';
  -- Konten, deren Adresse fuer den Seed ueberschrieben wurde (@tcm.local),
  -- verlieren sie wieder.
  update public.members set email = null where email like '%@tcm.local';
  delete from auth.users where id not in (select auth_user_id from public.kiosk_devices);

  -- 2. Tester: je zwei Mitglieder
  for t in select * from _tester loop
    foreach v_rolle in array array['mitglied', 'admin'] loop
      v_mail := lower(case v_rolle when 'admin' then t.mail_admin else t.mail_mitglied end);
      -- Aus einem frueheren Lauf schon da? Dann wiederverwenden - loeschen
      -- ginge nicht, sobald das Mitglied gebucht hat.
      select id into v_member from public.members where email = v_mail;
      if v_member is null then
        insert into public.members (first_name, last_name, email, status, birthday)
        values (t.vorname, t.nachname, v_mail, 'active', date '1990-01-01')
        returning id into v_member;
      end if;
      v_auth := pg_temp.login_anlegen(v_mail, v_pw_tester);
      update public.members set auth_user_id = v_auth where id = v_member;
      insert into public.member_roles (member_id, role) values (v_member, 'member') on conflict do nothing;
      if v_rolle = 'admin' then
        insert into public.member_roles (member_id, role) values (v_member, 'admin') on conflict do nothing;
      end if;
    end loop;
  end loop;

  -- 4. Einladungen zuerst, damit die 200 sie nicht wegnehmen
  for t in select * from _einladung loop
    -- Adresse aus einem frueheren Lauf schon vergeben? Dann bleibt es dabei.
    continue when exists (select 1 from public.members where email = lower(t.email));
    select mm.id into v_member from public.members mm
     where mm.auth_user_id is null and mm.status = 'active'
       and mm.email like '%@example.org'
       and mm.birthday <= current_date - interval '18 years'
     order by mm.last_name, mm.first_name
     limit 1;
    update public.members
       set email = lower(t.email),
           first_name = coalesce(t.vorname, first_name),
           last_name  = coalesce(t.nachname, last_name)
     where id = v_member;
  end loop;

  -- 3. 200 Mitgliedskonten mit gemeinsamem Passwort
  for m in
    select mm.id, mm.email from public.members mm
     where mm.auth_user_id is null and mm.status = 'active'
       and mm.email like '%@example.org'
       and mm.birthday <= current_date - interval '18 years'
     order by mm.last_name desc, mm.first_name desc
     limit 200
  loop
    v_auth := pg_temp.login_anlegen(m.email, v_pw_200);
    update public.members set auth_user_id = v_auth where id = m.id;
    insert into public.member_roles (member_id, role) values (m.id, 'member') on conflict do nothing;
  end loop;

  -- 5. Pruefer fuer Apple: ein gewoehnliches Mitglied mit Historie
  select id into v_member from public.members
   where email = 'appreview@tennisclub-muckensturm.de';
  if v_member is null then
    select mm.id into v_member from public.members mm
     where mm.auth_user_id is null and mm.status = 'active'
       and mm.email like '%@example.org'
       and mm.birthday <= current_date - interval '18 years'
     order by mm.first_name limit 1;
  end if;
  v_auth := pg_temp.login_anlegen('appreview@tennisclub-muckensturm.de', v_pw_pruefer);
  update public.members set auth_user_id = v_auth, email = 'appreview@tennisclub-muckensturm.de'
   where id = v_member;
  insert into public.member_roles (member_id, role) values (v_member, 'member') on conflict do nothing;
end $$;

-- Kontrolle
select
  (select count(*) from auth.users) as logins,
  (select count(*) from public.kiosk_devices) as kiosk,
  (select count(*) from public.members m join _tester t
    on m.email in (lower(t.mail_mitglied), lower(t.mail_admin)) where m.auth_user_id is not null) as tester_konten,
  (select count(*) from public.member_roles where role = 'admin') as admins,
  (select count(*) from public.members m join _einladung e on lower(e.email) = m.email
    where m.auth_user_id is null) as einladungen_offen;
