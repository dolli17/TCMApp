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
| `04_mitglieder.sql` | Selbstpflege-Erlaubnisliste, Änderungsprotokoll, Mitglieder-RPCs |
| `05_meine_buchungen.sql` | `my_bookings`, `leave_booking`, Benachrichtigungen |
| `06_mitspieler_gesucht.sql` | `join_booking`, `set_partner_wanted`, `open_matches`, Gastgebühr |
| `07_platzverwaltung.sql` | Sperrungen, Serien beenden, Plätze und Buchungsarten |
| `08_serien_aendern.sql` | `update_series`, `cancel_series_occurrence`, `series_id` im Tagesplan |
| `09_benachrichtigungs_mails.sql` | Auswahl, Bündelung und Abhaken der Mailbenachrichtigungen |
| `10_getraenkekarte.sql` | Preise, Preishistorie, Karte pflegen |
| `99_runtests.sql` | Führt die Suite aus |

Die Dateien `01` bis `10` **definieren nur Funktionen**. Ausgeführt wird alles in
`99_runtests.sql` – die Nummer sorgt dafür, dass `pg_prove` erst definiert und dann
ausführt. Jede Definitionsdatei schließt mit einem `plan(1)` plus `pass()`; ohne
Plan hält `pg_prove` eine Datei für kaputt und meldet „No subtests run".

## Zwei Fallen

**Umbenannte Testfunktionen bleiben liegen.** `create or replace` legt die neue
Funktion an, löscht die alte aber nicht – sie läuft in der Suite weiter mit und
schlägt fehl, während dieselbe Datei einzeln grün ist. Nach jedem Umbenennen oder
Löschen einer Testfunktion deshalb `pnpm db:reset`.

**Ein Admin kommt an `public.members` nicht per direktem `UPDATE`.** Die Policy
`members_admin_all` erlaubt ihm jede Zeile, aber `authenticated` hat auf der Tabelle
nur einen *Spalten*-Grant. Alles außerhalb dieser Liste – `is_trainer`, `status`,
`billing_payer_id`, `email` – geht ausschließlich über eine `security definer`-RPC.
Ein Test, der einen Admin direkt schreiben lässt, prüft die falsche Sache.

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
