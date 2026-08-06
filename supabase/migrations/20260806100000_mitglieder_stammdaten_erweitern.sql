-- ===========================================================================
-- Mitglieder-Stammdaten erweitern
--
-- Die Felder kommen aus zwei Quellen: dem, was eBuSy hat und wir bisher beim
-- Import verworfen haben (Nationalitaet), und dem, was eBuSy gar nicht kennt,
-- ein Tennisverein aber braucht - Notfallkontakt, Trainer, Leistungsklasse.
--
-- Die Selbstpflege wird bei dieser Gelegenheit von einer Sperrliste auf eine
-- Erlaubnisliste umgestellt. Das ist der eigentlich wichtige Teil dieser
-- Migration: bisher war jede neue Spalte fuer Mitglieder automatisch
-- aenderbar, weil der Trigger nur die verbotenen Felder aufzaehlte.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Spielberechtigung
--
-- Fuer die Mannschaftsmeldung an den Verband: wer fuer uns spielt, wer fuer
-- einen Zweitverein und wer gar nicht am Wettspielbetrieb teilnimmt.
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.playing_right as enum ('none', 'own_club', 'second_club');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Neue Spalten
-- ---------------------------------------------------------------------------
alter table public.members
  add column if not exists emergency_contact_name     text,
  add column if not exists emergency_contact_phone    text,
  add column if not exists emergency_contact_relation text,
  add column if not exists is_trainer                 boolean not null default false,
  add column if not exists nationality_code           text,
  add column if not exists tennis_lk                  text,
  add column if not exists nuliga_id                  text,
  add column if not exists playing_right              public.playing_right not null default 'none',
  add column if not exists playing_right_since        date,
  add column if not exists invited_at                 timestamptz,
  add column if not exists login_disabled_at          timestamptz;

alter table public.members
  add constraint members_nationality_code_format
    check (nationality_code is null or nationality_code ~ '^[A-Z]{2}$');

alter table public.members
  add constraint members_emergency_contact_paarweise
    check (emergency_contact_phone is null or emergency_contact_name is not null);

comment on column public.members.emergency_contact_name is
  'Wen rufen wir an, wenn auf der Anlage etwas passiert? Das juengste Mitglied '
  'ist 6 Jahre alt - ohne diese Angabe ist der Trainingsbetrieb nicht abgesichert. '
  'eBuSy hat dafuer kein Feld; dort landete das im Freitext-Kommentar.';

comment on column public.members.is_trainer is
  'Eigenschaft der Person, keine Berechtigungsstufe. Verleiht ausdruecklich '
  'keine zusaetzlichen Rechte - das Rollenmodell bleibt zweistufig. Braucht ein '
  'Trainer spaeter mehr Rechte, ist das eine Entscheidung ueber member_roles.';

comment on column public.members.nationality_code is
  'ISO-3166-1 Alpha-2. Wird fuer die Verbandsmeldung gebraucht. Kommt aus '
  'eBuSy (nationalityCode), landete beim Import bisher nur in legacy_data.';

comment on column public.members.tennis_lk is
  'Leistungsklasse, z.B. "LK12.3". Freitext, weil der Verband das Format '
  'gelegentlich aendert und wir hier nichts erzwingen wollen.';

comment on column public.members.nuliga_id is
  'Spieler-Id in nuLiga. Eindeutig, wo gesetzt.';

comment on column public.members.invited_at is
  'Wann wurde zuletzt eine Einladung zum Login verschickt? Null = noch nie.';

comment on column public.members.login_disabled_at is
  'Gesetzt, solange der Account gesperrt ist. Die Sperre selbst sitzt in '
  'auth.users (ban_duration); diese Spalte macht sie in der Oberflaeche sichtbar.';

-- ---------------------------------------------------------------------------
-- Indizes
-- ---------------------------------------------------------------------------
create unique index if not exists members_nuliga_id_key
  on public.members (nuliga_id) where (nuliga_id is not null);

create index if not exists members_trainer_idx
  on public.members (id) where (is_trainer);

-- ---------------------------------------------------------------------------
-- Verlustfreier Import
--
-- membershipTypeId, archived und consideredActive aus eBuSy haben in unserem
-- Schema keine eigene Spalte. Ohne Ablage gingen sie beim Import verloren und
-- ein zweiter Lauf koennte sie nicht rekonstruieren.
-- ---------------------------------------------------------------------------
alter table public.memberships add column if not exists legacy_data jsonb;

comment on column public.memberships.legacy_data is
  'Rohdaten aus eBuSy, die in unserem Schema keine Spalte haben. Bleibt bis '
  'zum Cutover leer.';

-- ---------------------------------------------------------------------------
-- Selbstpflege: Spalten-Grant erweitern
--
-- Notfallkontakt und Nationalitaet darf jedes Mitglied selbst pflegen. Trainer,
-- Leistungsklasse, nuLiga-Id, Spielberechtigung und die Login-Zeitstempel
-- bekommen bewusst KEINEN Grant - niemand macht sich selbst zum Trainer, und
-- ohne Grant ist das auch dann noch wahr, wenn jemand den Trigger umbaut.
-- ---------------------------------------------------------------------------
grant update (emergency_contact_name, emergency_contact_phone,
              emergency_contact_relation, nationality_code)
  on public.members to authenticated;

-- ---------------------------------------------------------------------------
-- Der Wachtrigger, jetzt als Erlaubnisliste
--
-- Vorher zaehlte er auf, was verboten ist. Jede neue Spalte war damit
-- stillschweigend erlaubt - beim naechsten "alter table" haette ein Mitglied
-- sein Trainer-Flag setzen koennen. Jetzt gilt: erlaubt ist, was hier steht.
--
-- Die Liste ist deckungsgleich mit dem Spalten-Grant oben plus updated_at,
-- das der moddatetime-Trigger selbst setzt.
-- ---------------------------------------------------------------------------
create or replace function public.guard_member_self_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_erlaubt constant text[] := array[
    'first_name', 'last_name', 'title', 'phone', 'mobile',
    'street', 'postcode', 'city', 'country_code',
    'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
    'nationality_code', 'updated_at'
  ];
  v_alt   jsonb := to_jsonb(old);
  v_neu   jsonb := to_jsonb(new);
  v_feld  text;
begin
  -- Kein angemeldeter Nutzer: Seed, Import, Cron oder Service-Rolle.
  if (select auth.uid()) is null then return new; end if;
  if (select private.is_admin()) then return new; end if;

  for v_feld in select jsonb_object_keys(v_neu) loop
    if v_neu -> v_feld is distinct from v_alt -> v_feld
       and not (v_feld = any (v_erlaubt))
    then
      raise exception 'Das Feld "%" kann nur ein Administrator aendern.', v_feld
        using errcode = 'insufficient_privilege';
    end if;
  end loop;

  return new;
end;
$$;

comment on function public.guard_member_self_update() is
  'Erlaubnisliste fuer die Selbstpflege. Neue Spalten sind damit standardmaessig '
  'admin-only - das ist die sichere Richtung.';

revoke execute on function public.guard_member_self_update() from public, anon, authenticated;
