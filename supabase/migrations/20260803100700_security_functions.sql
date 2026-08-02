-- ===========================================================================
-- Sicherheitsfundament: Helferfunktionen, Kiosk-Geraete, IBAN-Verschluesselung
--
-- Alle Helfer liegen im Schema private und laufen als SECURITY DEFINER. Sie
-- umgehen damit RLS - genau deshalb darf sie niemand direkt aufrufen. Das
-- EXECUTE-Recht wird anon und authenticated ausdruecklich entzogen; benutzt
-- werden sie ausschliesslich innerhalb von Policies.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Kiosk-Geraete
--
-- Das Tablet an der Theke ist kein Mitglied, sondern ein eigener Account. Es
-- darf Getraenke fuer beliebige Mitglieder buchen, aber keine Personendaten
-- lesen - sonst haette ein frei zugaengliches Geraet im Clubheim Zugriff auf
-- alle Bankverbindungen.
-- ---------------------------------------------------------------------------
create table public.kiosk_devices (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  name         text not null,
  location     text,
  active       boolean not null default true,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.members (id) on delete set null
);

create index kiosk_devices_active_idx     on public.kiosk_devices (active);
create index kiosk_devices_created_by_idx on public.kiosk_devices (created_by);

-- ---------------------------------------------------------------------------
-- Wer bin ich?
-- ---------------------------------------------------------------------------
create or replace function private.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.members m
  where m.auth_user_id = (select auth.uid());
$$;

comment on function private.current_member_id() is
  'Mitglieds-Id des angemeldeten Nutzers, oder null. Basis fast aller Policies.';

-- ---------------------------------------------------------------------------
-- Rollenpruefung
--
-- Die Identitaet wird intern selbst gegen auth.uid() geprueft - die Funktion
-- laesst sich also nicht mit fremden Werten missbrauchen.
-- ---------------------------------------------------------------------------
create or replace function private.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.member_roles mr
    join public.members m on m.id = mr.member_id
    where m.auth_user_id = (select auth.uid())
      and mr.role = p_role
  );
$$;

create or replace function private.has_any_role(p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.member_roles mr
    join public.members m on m.id = mr.member_id
    where m.auth_user_id = (select auth.uid())
      and mr.role = any (p_roles)
  );
$$;

-- Vorstand: darf alles sehen und verwalten.
create or replace function private.is_board()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('board'::public.app_role);
$$;

-- Kassenwart: zusaetzlich Bankverbindungen, Mandate, Lastschriftlaeufe.
-- Der Vorstand ist eingeschlossen, damit der Verein nicht handlungsunfaehig
-- wird, wenn der Kassenwart ausfaellt.
create or replace function private.is_treasurer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array['treasurer', 'board']::public.app_role[]);
$$;

-- Sportwart: Plaetze, Buchungsarten, Serien.
create or replace function private.is_sports_officer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array['sports_officer', 'board']::public.app_role[]);
$$;

create or replace function private.is_trainer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array['trainer', 'sports_officer', 'board']::public.app_role[]);
$$;

create or replace function private.is_bar_duty()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array['bar_duty', 'board']::public.app_role[]);
$$;

-- ---------------------------------------------------------------------------
-- Ist der Aufrufer ein aktives Kiosk-Geraet?
-- ---------------------------------------------------------------------------
create or replace function private.is_kiosk()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.kiosk_devices d
    where d.auth_user_id = (select auth.uid())
      and d.active
  );
$$;

-- ---------------------------------------------------------------------------
-- Darf ich die Daten dieses Mitglieds sehen?
--
-- Eigene Daten immer. Fremde nur, wenn ich fuer die Person bezahle - das
-- deckt Eltern ab, deren Kinder keinen eigenen Login haben.
-- ---------------------------------------------------------------------------
create or replace function private.can_view_member(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_member_id = private.current_member_id()
    or exists (
      select 1
      from public.members m
      where m.id = p_member_id
        and m.billing_payer_id = private.current_member_id()
    );
$$;

comment on function private.can_view_member(uuid) is
  'Eigene Daten oder die von Personen, fuer die ich zahle (Kinder, Partner).';

-- ---------------------------------------------------------------------------
-- IBAN-Verschluesselung
--
-- Der Schluessel liegt in Supabase Vault, nicht im Code und nicht im Repo.
-- Beide Funktionen sind privat: der Client bekommt die IBAN nie im Klartext
-- aus der Datenbank, sondern hoechstens die letzten vier Stellen.
-- ---------------------------------------------------------------------------
create or replace function private.encrypt_iban(p_iban text)
returns bytea
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'iban_encryption_key';

  if v_key is null then
    raise exception 'Vault-Secret "iban_encryption_key" fehlt. IBANs koennen nicht gespeichert werden.'
      using errcode = 'no_data_found';
  end if;

  return extensions.pgp_sym_encrypt(p_iban, v_key);
end;
$$;

create or replace function private.decrypt_iban(p_encrypted bytea)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'iban_encryption_key';

  if v_key is null then
    raise exception 'Vault-Secret "iban_encryption_key" fehlt.'
      using errcode = 'no_data_found';
  end if;

  return extensions.pgp_sym_decrypt(p_encrypted, v_key);
end;
$$;

-- ---------------------------------------------------------------------------
-- Zugriff auf die Helfer entziehen
--
-- Sie umgehen RLS. Waeren sie aufrufbar, koennte ein angemeldetes Mitglied
-- ueber decrypt_iban jede Bankverbindung im Verein auslesen.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema private from public, anon, authenticated;

revoke execute on function public.setting_int(text)  from public, anon;
revoke execute on function public.setting_text(text) from public, anon;
revoke execute on function public.setting_time(text) from public, anon;
grant  execute on function public.setting_int(text)  to authenticated;
grant  execute on function public.setting_text(text) to authenticated;
grant  execute on function public.setting_time(text) to authenticated;
