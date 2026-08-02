-- ===========================================================================
-- Fundament: Extensions, privates Schema, Enum-Typen, Rechte-Haertung
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- btree_gist wird fuer den EXCLUDE-Constraint gebraucht, der Doppelbuchungen
-- verhindert: er kombiniert Gleichheit (court_id) mit Ueberlappung (tstzrange).
create extension if not exists btree_gist with schema extensions;
create extension if not exists citext      with schema extensions;
create extension if not exists moddatetime with schema extensions;

-- ---------------------------------------------------------------------------
-- Privates Schema fuer SECURITY-DEFINER-Helfer.
-- Diese Funktionen umgehen RLS und duerfen deshalb niemals direkt vom Client
-- aufrufbar sein - sie werden ausschliesslich aus Policies heraus benutzt.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres;

-- ---------------------------------------------------------------------------
-- Enum-Typen
-- ---------------------------------------------------------------------------

-- Identitaet und Mitgliedschaft
do $$ begin
  create type public.member_status as enum ('active', 'inactive', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.membership_status as enum ('active', 'requested', 'declined', 'ended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.gender as enum ('female', 'male', 'diverse');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.salutation as enum ('female', 'male', 'none');
exception when duplicate_object then null; end $$;

-- Rollen. Bewusst ohne 'kiosk': das Kiosk-Tablet ist kein Mitglied, sondern
-- ein Geraete-Account mit eigener Datenbankrolle.
do $$ begin
  create type public.app_role as enum (
    'member', 'board', 'treasurer', 'sports_officer', 'trainer', 'bar_duty'
  );
exception when duplicate_object then null; end $$;

-- Herkunft eines Datensatzes: nativ angelegt oder aus eBuSy uebernommen.
-- Steht ab der ersten Migration bereit, damit der Cutover spaeter keine
-- Schemaaenderung braucht.
do $$ begin
  create type public.record_source as enum ('app', 'ebusy_import');
exception when duplicate_object then null; end $$;

-- SEPA
do $$ begin
  create type public.mandate_sequence as enum ('FRST', 'RCUR', 'OOFF', 'FNAL');
exception when duplicate_object then null; end $$;

-- Deckt der Mandatstext nur Beitraege ab oder alle wiederkehrenden Zahlungen?
-- Entscheidet, ob der monatliche Getraenkeeinzug ueber dieses Mandat laufen darf.
do $$ begin
  create type public.mandate_scope as enum ('fees_only', 'all_payments');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.mandate_status as enum ('active', 'revoked', 'expired');
exception when duplicate_object then null; end $$;

-- Forderungen
do $$ begin
  create type public.charge_kind as enum ('fee', 'drinks', 'deposit', 'work_duty', 'misc');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.charge_status as enum (
    'open', 'notified', 'submitted', 'settled', 'returned', 'waived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.debit_batch_status as enum ('draft', 'generated', 'submitted', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.debit_item_result as enum ('pending', 'settled', 'returned');
exception when duplicate_object then null; end $$;

-- Getraenke
do $$ begin
  create type public.billing_period_status as enum ('open', 'closed', 'charged');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.drink_category as enum ('drink', 'food', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.purchase_source as enum ('app', 'kiosk', 'bar_duty');
exception when duplicate_object then null; end $$;

-- Platzbuchung
do $$ begin
  create type public.booking_kind as enum ('booking', 'blocking');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.booking_status as enum ('active', 'cancelled');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Rechte-Haertung
--
-- Standardmaessig vergibt Supabase auf neue Tabellen im Schema public
-- automatisch Rechte an anon und authenticated. Das wird hier abgeschaltet:
-- jede Tabelle bekommt spaeter einen expliziten, minimalen Grant. Eine neu
-- angelegte Tabelle ist damit zunaechst fuer niemanden erreichbar - ein
-- vergessener Grant faellt sofort auf, statt still Daten freizugeben.
-- ---------------------------------------------------------------------------
revoke all on schema public from public;
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
