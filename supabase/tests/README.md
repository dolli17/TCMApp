# Datenbank-Testsuite

pgTAP-Tests für Constraints, RLS und die Buchungs-RPCs.

## Ausführen

**Lokal** (braucht Docker):

```bash
pnpm db:start          # supabase start
pnpm db:test           # supabase test db
```

**Gegen ein Remote-Projekt** – die Testfunktionen einmal einspielen, dann:

```sql
set search_path = extensions, public, tests;
select * from runtests('tests'::name);

-- Nur eine Gruppe:
select * from runtests('tests'::name, '^test_rpc');
```

`runtests()` führt jede Testfunktion in einer eigenen Transaktion aus und rollt
sie danach zurück. Die Tests hinterlassen also keinen Zustand – auch nicht die
`auth.users`-Einträge, die sie für die Rollentests anlegen.

## Aufbau

| Datei | Inhalt |
|---|---|
| `01_constraints.sql` | Doppelbuchungsschutz, Intervallform, Mitspieler-Regeln, gesperrte Abrechnungsperioden, Preisbildung, Idempotenz des Beitragslaufs |
| `02_rls.sql` | Rollentrennung, Zahler-Beziehung, Bankdaten, Kiosk-Abgrenzung, `anon`, Vollständigkeitsprüfung |
| `03_rpc_bookings.sql` | Das Regelwerk über `create_booking`: Kontingent, Vorlauf, Öffnungszeiten, Zeitraster, Storno |

## Zwei Tests, die besonders wichtig sind

**`test_rls_auf_allen_tabellen`** iteriert über `pg_class` und schlägt fehl,
sobald eine Tabelle ohne RLS oder ohne Policy hinzukommt. Ein vergessener
Schutz fällt damit sofort auf, statt still Daten freizugeben.

**`test_rpc_kontingent_ueber_mitspieler`** belegt, dass die Buchungsgrenze auch
über Mitspielerschaft zählt. Ohne das könnte eine Vierergruppe reihum buchen
und hätte faktisch unbegrenzt Plätze – die Regel wäre eine Empfehlung statt
einer Regel.

## Rollenwechsel in Tests

Die Tests setzen `request.jwt.claims` und `role` genau so, wie PostgREST es zur
Laufzeit tut:

```sql
perform tests.act_as(auth_id);          -- als angemeldetes Mitglied
perform tests.act_as_anon();            -- als nicht angemeldeter Besucher
perform set_config('role', 'postgres', true);   -- zurück zum Eigentümer
```

Nach einem Wechsel auf `authenticated` besteht **kein** Zugriff mehr auf das
Schema `tests`. Alle Helferaufrufe und Zeitberechnungen müssen deshalb vorher
passieren – sonst stirbt der Test mit `permission denied for schema tests`.
