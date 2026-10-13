# Arbeitsweise: Branches, Releases, Deploy

## Umgebungen

| Branch | Umgebung | Supabase | Web | Deploy |
|---|---|---|---|---|
| — | lokal | `supabase start` | localhost:3000 | — |
| `main` | **Dev** (Abnahme mit den Testern) | Dev-Projekt | Dev-Container | automatisch bei jedem Merge |
| `production` | **Prod** (der Verein) | Prod-Projekt (Pro) | Prod-Container | bei Merge, **nach Freigabe** |

Der Code ist überall derselbe. Unterschiede gibt es nur bei Umgebungsvariablen und Secrets, und jede Umgebung hat ihre eigene Datenbank.

Ein eigenes Staging gibt es bewusst nicht: Dev mit den Testern ist die Abnahme, lokal ist die Werkbank. Wird Staging später doch nötig, kommen ein Branch `staging`, ein Environment `staging` und eine Zeile im Mapping von `deploy.yml` und `server-deploy.sh` dazu.

## Regeln

1. **Kein direkter Push** auf `main` oder `production`, alles läuft über Pull Requests. Die Rulesets setzen das durch.
2. **Arbeits-Branches** zweigen von `main` ab und heißen `feature/…`, `fix/…` oder `chore/…`. Sie gehen per **Squash-Merge** zurück nach `main`, der PR-Titel wird zur Commit-Nachricht.
3. **Release:** PR `main` → `production` mit **Merge-Commit** (kein Squash, kein Rebase), damit die Branches nicht auseinanderlaufen.
4. **Fehler, die auf Dev auffallen,** werden mit einem neuen PR auf `main` behoben, nie direkt auf `production`.
5. **Hotfix:** `hotfix/…` von `production` abzweigen, per PR mit Merge-Commit nach `production`, danach sofort PR `production` → `main` mit Merge-Commit.
6. **Datenbank:** Schemaänderungen gibt es nur als Migration in `supabase/migrations/`. Kein MCP-`apply_migration` und kein Dashboard-SQL gegen Dev oder Prod. Migrationen müssen **abwärtskompatibel** sein (erst erweitern, später aufräumen), denn alte App-Versionen sprechen weiter mit Prod, und das alte Web läuft während des Deploys kurz gegen das neue Schema.
7. **Version:** Sie steht im Feld `version` der Root-`package.json`. Jedes Prod-Release bekommt automatisch den Tag `v<version>`.

## Pull Requests

Die CI (`.github/workflows/ci.yml`) läuft bei jedem PR auf `main` oder `production`:

- **`verify`** führt `pnpm verify` aus (Typecheck, Lint, Vitest, pgTAP gegen einen lokalen Supabase-Stack im Runner) und baut danach das Web mit `next build`.
- **`release-check`** läuft nur bei PRs nach `production`. Er prüft zwei Dinge: Die Quelle ist `main` oder `hotfix/*`, und den Tag `v<version>` gibt es noch nicht.

Playwright-E2E läuft nicht in der CI, sondern lokal mit `pnpm e2e` gegen den lokalen Stack.

## Release-Ablauf

1. **Version hochzählen:** Branch `chore/release-x.y.z` mit der neuen `version` in `package.json`, PR nach `main`, Squash.
2. **Dev prüfen:** Der Merge deployt Dev automatisch, die Tester schauen drauf.
3. **Release-PR** `main` → `production` anlegen, Titel „Release vX.Y.Z“, die Checkliste unten abhaken.
4. **Mergen** mit „Create a merge commit“.
5. **Freigeben:** Der Workflow „Deploy“ wartet im Environment `production` auf dich (Actions → Review deployments).
6. Danach läuft alles automatisch:
   1. Migrationen (`supabase db push`)
   2. Edge Functions
   3. Web
   4. Smoke-Test
   5. Tag `vX.Y.Z` und GitHub-Release
7. **App:** Bei Änderungen in `apps/mobile` den Tag auschecken und `eas build --profile production` plus Submit ausführen (`apps/mobile/RELEASE.md`). App-Builds laufen bewusst nicht automatisch.

### Release-Checkliste (in den Release-PR kopieren)

```markdown
- [ ] `version` in package.json hochgezählt, CI grün
- [ ] Änderungen auf Dev von Testern geprüft
- [ ] Neue Migrationen sind abwärtskompatibel (alte App-Versionen laufen weiter)
- [ ] Neue Env-Variablen/Secrets in Prod gesetzt (Server-.env, `supabase secrets set`, eas.json)
- [ ] Einmalige Snippets für neue Features in Prod ausgeführt (Cron, Vault, siehe supabase/snippets)
- [ ] App-Build nötig? Wenn ja, nach dem Deploy `eas build --profile production`
```

## Hotfix-Ablauf

1. `git switch -c hotfix/kurzbeschreibung origin/production`
2. Den Fehler beheben und die Patch-Version in `package.json` hochzählen, zum Beispiel 1.2.0 → 1.2.1.
3. PR nach `production` und mit Merge-Commit mergen. Das Deploy läuft wie beim Release, mit Freigabe und Tag.
4. **Sofort danach** einen PR `production` → `main` öffnen und mit Merge-Commit mergen, sonst ginge der Fix beim nächsten Release verloren.

## Rückweg

- **Web:** Actions → Deploy → „Run workflow“ öffnen, unter „Use workflow from“ den vorherigen Tag wählen und die Umgebung angeben. Dabei wird nur das Web neu gebaut, Datenbank und Functions bleiben, wie sie sind.
- **Notfall ohne Actions:** `./deploy/web/deploy.sh prod v1.2.0` vom Mac aus. Auch das baut nur das Web.
- **Datenbank:** Eine Gegen-Migration als normalen Fix bzw. Hotfix ausrollen. Im Ernstfall aus dem Backup wiederherstellen (`docs/goLive.md`).

## Einrichtung

### GitHub (Repo `dolli17/TCMApp`)

- **Merge-Optionen:** Squash und Merge-Commit an, Rebase aus. Squash-Titel aus dem PR-Titel. Head-Branches nach dem Merge automatisch löschen.
- **Ruleset `main`:** PR Pflicht (0 Approvals), Status-Check `verify` Pflicht, erlaubte Merge-Arten Squash und Merge (Merge nur für Hotfix-Rückführungen), kein Force-Push, kein Löschen, kein Bypass.
- **Ruleset `production`:** PR Pflicht, Checks `verify` und `release-check` Pflicht, nur Merge-Commit, kein Force-Push, kein Löschen, kein Bypass.
- **Ruleset Tags `v*`:** Löschen und Ändern verboten.
- **Environment `dev`:** Deploy-Branches `main` und Tags `v*`.
- **Environment `production`:** Deploy-Branches `production` und Tags `v*`, Required Reviewer `dolli17`.
- **Notfall:** Ein Ruleset kurz deaktivieren, den Schritt im PR bzw. Commit begründen und das Ruleset danach sofort wieder aktivieren.

Das Repo ist öffentlich. PRs aus Forks bekommen keine Secrets, und die CI braucht auch keine.

| Name im Environment | Art | Inhalt |
|---|---|---|
| `SUPABASE_PROJECT_REF` | Variable | Projekt-Ref. Fehlt sie, deployt der Workflow nichts. |
| `WEB_URL` | Variable | `https://…` der Umgebung, für den Smoke-Test |
| `DEPLOY_HOST` | Variable | `deploy@187.124.4.243` |
| `SUPABASE_ACCESS_TOKEN` | Secret | Supabase-Personal-Access-Token (für `link`, `db push`, `functions deploy`). Ein DB-Passwort ist nicht nötig: die CLI meldet sich damit über eine temporäre Login-Rolle an. |
| `DEPLOY_SSH_KEY` | Secret | privater SSH-Schlüssel (ed25519), nur für den Forced-Command |
| `DEPLOY_KNOWN_HOSTS` | Secret | Zeile aus `ssh-keyscan 187.124.4.243` |

### Server

- Ein Benutzer `deploy` in der Gruppe `docker`, Besitzer von `/docker/tcm-web*/src`.
- `deploy/web/server-deploy.sh` liegt als `/usr/local/bin/tcm-deploy` auf dem Server. Wenn sich das Skript ändert, muss es dort von Hand nachgezogen werden.
- `~deploy/.ssh/authorized_keys` erlaubt dem Schlüssel aus Actions nur dieses Skript:
  ```
  command="/usr/local/bin/tcm-deploy",restrict ssh-ed25519 AAAA… github-actions
  ```
- Je Umgebung gibt es ein Verzeichnis mit Checkout `src/` und `.env` (`APP_DOMAIN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`): Dev liegt unter `/docker/tcm-web`, Prod unter `/docker/tcm-web-prod`.
- Die `NEXT_PUBLIC_*`-Werte werden beim Build ins Image eingebacken. Deshalb baut jede Umgebung ihr eigenes Image.

### Supabase je Projekt (einmalig)

Was nicht über Migrationen läuft, steht in `docs/goLive.md`: Auth-Einstellungen, Edge-Secrets, Vault-Einträge, die Snippets in `supabase/snippets/`, SEPA-Gläubigerdaten und das Kiosk-Gerät.
