# Supabase – Hinweise für Claude

Hier liegen die Geschäftsregeln der App: Tabellen mit RLS, RPCs, Edge Functions und ihre Tests.

## Befehle

```bash
pnpm db:start     # lokaler Stack (Docker)
pnpm db:reset     # alle Migrationen und seed.sql neu einspielen
pnpm db:test      # pgTAP
pnpm db:types     # packages/core/src/database.types.ts neu erzeugen
pnpm test:functions   # Edge Functions unter Deno, ohne Stack
```

Nach jeder Migration: `pnpm db:reset && pnpm db:types && pnpm --filter @tcm/core build:app-api`, und die geänderten Dateien einchecken. Die CI bricht ab, wenn `database.types.ts` nicht zu den Migrationen passt.

## Migrationen

- **Neue Datei, nie eine gemergte ändern.** Name `<Zeitstempel>_<thema>.sql`, der Zeitstempel muss jünger sein als die neueste Migration auf `main`. Die CI prüft das.
- **Abwärtskompatibel:** erst erweitern, später aufräumen. Alte App-Versionen sprechen weiter mit der Datenbank, und das alte Web läuft während des Deploys kurz gegen das neue Schema.
- **Kopfkommentar:** was sich ändert, warum, und weshalb es abwärtskompatibel ist. Die vorhandenen Dateien zeigen die Form.
- **Neue Tabelle:** RLS einschalten, Policies schreiben, Rechte einzeln vergeben. Automatische Rechte für `anon` und `authenticated` gibt es nicht, die erste Migration entzieht sie.
- **Neue Funktion:** `set search_path = ''`, Namen voll qualifizieren, `execute` gezielt vergeben. `security definer` nur, wenn die Funktion die Rechte selbst prüft.
- **Nichts an Dev oder Prod von Hand:** kein `supabase db push`, kein MCP-`apply_migration`, kein Dashboard-SQL. Ausrollen tut der Deploy-Workflow.

## Tests (pgTAP)

- Die Dateien unter `tests/` definieren nur Funktionen `tests.test_…`. Ausgeführt werden sie von `99_runtests.sql`, jede in einer eigenen Transaktion, die danach zurückgerollt wird.
- Neue Regel heißt neuer Test: der Normalfall und mindestens ein abgelehnter Fall, als die Rolle, die es betrifft.
- Die lokale Datenbank ist zwischen allen Worktrees geteilt. Reste aus E2E-Läufen können einzelne Tests kippen; dann `pnpm db:reset`, aber nur nach Absprache.

## Edge Functions

- `member-login`, `mitgliedsantrag`, `notification-mails`, `notification-pushes`. Die Tests unter `functions/_tests` laufen ohne Stack, `Deno.serve` und `fetch` sind in `attrappe.ts` abgefangen.
- Secrets stehen nie im Code und nie in `config.toml`. Lokal kommen sie aus dem Stack, in Dev und Prod aus den Edge-Secrets des Projekts.

## Was hier sonst liegt

- `seed.sql`: erfundener Testbestand für den lokalen Stack. Das Passwort darin gilt nur lokal.
- `snippets/`: Skripte, die von Hand in ein Cloud-Projekt eingespielt werden. Nicht ausführen.
- `config.toml`: gilt für den lokalen Stack. Die Auth-Werte sind für die E2E-Suite gelockert und gehören so nicht nach Prod. Nur ändern, wenn die Aufgabe das ausdrücklich verlangt.
