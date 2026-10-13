# Hinweise für Claude

- **Git:** Arbeitsweise steht in `CONTRIBUTING.md`. Arbeite immer auf einem Branch `feature/…`, `fix/…` oder `chore/…` von `main` und öffne einen PR. Pushe nie direkt auf `main` oder `production` und merge keine Release-PRs nach `production` ohne ausdrückliche Anweisung.
- **Datenbank:** Schemaänderungen nur als neue Datei in `supabase/migrations/`, abwärtskompatibel. Kein MCP-`apply_migration`, kein `execute_sql` mit DDL und kein Dashboard-SQL gegen Dev oder Prod. Ausrollen tut der Deploy-Workflow.
- **Prüfen vor dem PR:** `pnpm verify` (braucht den lokalen Stack: `pnpm db:start`). E2E läuft lokal mit `pnpm e2e`, nie gegen Dev oder Prod.
- **Fahrplan Dev/Prod:** `docs/goLive.md`. Offene Befunde: `docs/testphase-befunde.md`.
