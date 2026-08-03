-- pgTAP wird nur fuer die Testsuite gebraucht. Vor dem Produktivgang kann die
-- Extension entfernt werden; sie legt keine eigenen Daten an.
create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
revoke all on schema tests from public, anon, authenticated;
grant usage on schema tests to postgres;
