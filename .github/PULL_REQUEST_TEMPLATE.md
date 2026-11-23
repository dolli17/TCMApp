## Was

<!-- Was ändert dieser PR? Ein bis drei Sätze oder Stichpunkte. -->

## Warum

<!-- Welches Problem löst er? Ticket oder Befund nennen, falls vorhanden. -->

## Wie geprüft

- [ ] `pnpm verify:ci` lokal grün
- [ ] `pnpm e2e` lokal grün (bei Änderungen an der Oberfläche des Webs)
- [ ] iOS-Tests (bei Änderungen an `apps/ios`)
- [ ] Android-Tests (bei Änderungen an `apps/android`)

<!-- Was wurde nicht geprüft und warum? -->

## Datenbank

<!-- Nur bei Migrationen, sonst den Abschnitt löschen. -->

- [ ] Neue Datei in `supabase/migrations/`, keine gemergte geändert
- [ ] Abwärtskompatibel: die alte App und das alte Web laufen weiter
- [ ] RLS, Policies und Rechte für neue Tabellen; `set search_path = ''` für neue Funktionen
- [ ] pgTAP-Test für die neue Regel
- [ ] `database.types.ts` und `docs/native/app-api.json` neu erzeugt

## Risiko

<!-- Niedrig, mittel oder hoch, mit einem Satz Begründung. Was passiert, wenn es schiefgeht, und wie kommt man zurück? -->

## Offen

<!-- Was bleibt liegen? Was muss nach dem Merge von Hand passieren? -->
