# Go-Live: Prod- und Dev-Umgebung

Stand: 11.10.2026 · Status: **geplant, noch nicht umgesetzt**

## Kontext
Heute gibt es nur **ein** Cloud-Projekt (`xvjqqjiweogtfpfgeoqz`, Free). Dorthin zeigen Web und alle EAS-Profile. (`scripts/e2e.sh` zeigte bis 20.10.2026 ebenfalls dorthin; seitdem läuft E2E nur noch lokal.) Daneben gibt es nur den lokalen Stack.

Für den Rollout an den ganzen Verein soll Prod geschützt sein. Entwickeln und Testen passiert in Dev und lokal, und nach Prod geht nur, was bewusst freigegeben wurde.

**Entschieden:**
- Prod wird ein **neues** Supabase-Projekt (Pro).
- Das heutige Projekt wird **Dev** (Free, Tester behalten ihre Konten).
- `main` = Dev, Branch `production` = Prod. Ein Merge auf `production` ist das Release (nach Freigabe), der Tag `vX.Y.Z` entsteht automatisch. Ablauf: `CONTRIBUTING.md` (13.10.2026, ersetzt „Git-Tag = Prod-Release“).
- Für iOS gibt es eine eigene App **„TCM Dev“**.

## Zielbild

| | Lokal | Dev | Prod |
|---|---|---|---|
| Supabase | `supabase start` | `xvjqqjiweogtfpfgeoqz` (Free-Org) | neues Projekt, Pro-Org „TC Muckensturm“, Region Frankfurt |
| Daten | `seed.sql` | Testkonten + Seed-artige Daten | nur echte Vereinsdaten (eBuSy-Import), **nie Seed** |
| Web | localhost:3000 | `dev.tennisclub-muckensturm.de` (Container `tcm-web-dev`) | `app.tennisclub-muckensturm.de` (Container `tcm-web-prod`) |
| iOS | Simulator / Personal Team | „TCM Dev“ `de.tcmuckensturm.app.dev`, Scheme `tcmdev`, TestFlight | „TCM“ `de.tcmuckensturm.app`, TestFlight → App Store |
| Mail | Mailpit | Resend, Absender `dev-noreply@…`, Betreff „[DEV]“ | Resend, `noreply@…` |
| Deploy | — | Actions bei Merge auf `main` | Actions bei Merge auf `production`, nach Freigabe |

**Warum drei Stufen (lokal, Dev, Prod):** Lokal ist die Werkbank. Dort darf `db reset` alles löschen, dort laufen pgTAP und E2E, und neue Migrationen werden dort zuerst ausprobiert. Dev ist der gemeinsame Probelauf mit den Testern; deren Konten und Daten bleiben bestehen. Prod ist der Verein.

Grundregeln:
- Keine echten Personendaten in Dev oder lokal (DSGVO).
- Keine Seed- oder Testdaten in Prod.
- Schema-Änderungen nur per Migration. Kein MCP-`apply_migration` und kein Dashboard-SQL gegen Prod.

## Schritte

### 1. Dev-Projekt in Ordnung bringen (heutiges Projekt)
- **Migrationshistorie reparieren:** Die Cloud kennt andere Versionsnummern als die Dateien. Mit `supabase migration repair` die Historie an die 58 Dateien angleichen, prüfen mit `supabase migration list`. Danach läuft auch Dev über `supabase db push`, genau wie Prod.
- **Kennzeichnung:** Projekt im Dashboard in „TCMApp **Dev**“ umbenennen. `.mcp.json` und `supabase link` zeigen nur auf Dev.
- **Auth:** Redirect-URLs und Site-URL auf `https://dev.tennisclub-muckensturm.de` sowie `tcmdev://passwort-setzen` stellen.
- **Selbstregistrierung aus (S1):** Dashboard → Authentication → Sign In / Providers → „Allow new users to sign up“ ausschalten. Sonst kann sich jemand mit der Adresse eines künftigen Mitglieds registrieren, und `loginAnlegen` übernimmt dieses Konto beim Anlegen. Lokal steht `enable_signup = false` unter `[auth]` in `supabase/config.toml`, die Cloud übernimmt das nicht von selbst. Den Provider „Email“ **nicht** abschalten, ebenso wenig `[auth.email] enable_signup`: Das sperrt alle Passwort-Anmeldungen (`email_provider_disabled`). Prüfen: `POST /auth/v1/signup` mit dem Publishable Key antwortet mit `signup_disabled`. *Dev: am 21.10.2026 ausgeschaltet.*
- **Edge-Secrets:** `SITE_URL`, `MAIL_FROM=dev-noreply@…`, einen eigenen Resend-Key für Dev.

### 2. Konfiguration als Code
- In `supabase/config.toml` Abschnitte `[remotes.dev]` und `[remotes.prod]` mit `project_id` anlegen, dazu jeweils `site_url` und `additional_redirect_urls`.
- Auth-Einstellungen per `supabase config push` übertragen: `otp_expiry` 86400, `enable_signup` false (nur unter `[auth]`, siehe S1), Vorlagen, SMTP über `env(...)`. Damit ist die Abweichung aus O24 behoben, und beide Projekte sind gleich eingestellt.
- Vor der ersten Nutzung gegen Dev prüfen, welche Felder `config push` tatsächlich überträgt. Was es nicht kann, kommt als Liste in die Runbook-Datei.
- **Neu: `supabase/env/README.md`** beschreibt die einmalige Einrichtung pro Umgebung:
  - Snippets `benachrichtigungs_mails_zeitplan.sql` und `benachrichtigungs_pushes_zeitplan.sql`, mit Projekt-Ref als Parameter;
  - Vault-Eintrag `iban_encryption_key`;
  - SEPA-Gläubigerdaten;
  - Kiosk-Gerät;
  - Secrets.

### 3. Prod-Projekt anlegen
- Neue Organisation „TC Muckensturm“ im Pro-Plan, Projekt `tcm-prod` in Frankfurt (eu-central-1). Starkes DB-Passwort in den Passwortmanager.
- Schema über `supabase link --project-ref <prod>` und `supabase db push` einspielen. **Kein** `db reset`, **kein** Seed.
- Den Vault-Eintrag `iban_encryption_key` erzeugen. Den Schlüssel **zusätzlich im Passwortmanager sichern**: ohne ihn sind IBANs auch aus einem Backup nicht lesbar.
- **Schlüssel:** nur neue `sb_publishable_…`/`sb_secret_…`, Legacy-JWT-Keys deaktivieren. Damit ist O1 für Prod erledigt; Dev bekommt ebenfalls neue Keys.
- **Auth:** Resend-SMTP mit eigenem Prod-API-Key, Signup aus („Allow new users to sign up“ im Dashboard, siehe S1 unter Schritt 1), Leaked-Password-Schutz an (Pro), Redirect-URLs `https://app…/passwort-setzen` und `tcm://passwort-setzen`.
- **Edge Functions** `member-login`, `notification-mails` und `notification-pushes` deployen. Die Secrets setzen, bei Push mit `PUSH_AKTIV=true`, sobald der APNs-Key da ist (O5).
- Zeitpläne und Vault-Einträge per Snippet einrichten, dann SEPA-Gläubigerdaten und Kiosk-Gerät.
- **Erstes Admin-Konto** (Vorstand) per Einladung anlegen.
- **Backups:** Pro-Tagesbackups (7 Tage). Zusätzlich ein nächtlicher `pg_dump` auf den Server per Cron und Root-Skript `deploy/db/sicherung.sh`, verschlüsselt, mit 30 Tagen Aufbewahrung. Einmal eine Wiederherstellung in ein Wegwerf-Projekt testen.
- AV-Vertrag (DPA) mit Supabase und Resend abschließen (README).

### 4. Web: zwei Container auf dem Server
- **Erledigt (13.10.2026):** `deploy/web/server-deploy.sh` (auf dem Server `/usr/local/bin/tcm-deploy`) baut einen Commit je Umgebung, aufgerufen vom Workflow „Deploy“; `deploy.sh dev|prod [ref]` bleibt als Notfall-Weg. Offen sind noch die Punkte darunter, die über das Skript hinausgehen – vor allem eigene Router-Namen und Image-Tags in der Compose-Datei, sonst stören sich Dev und Prod in Traefik.
- **`deploy/web/deploy.sh`:**
  - Neuer Aufruf `deploy.sh dev|prod [tag]`.
  - **dev** baut `origin/main` nach `/docker/tcm-web-dev`.
  - **prod** verlangt einen existierenden Tag `v*`, baut genau diesen nach `/docker/tcm-web-prod` und fragt zur Sicherheit „prod eintippen“.
  - Je Umgebung eigenes `src/`, eigene `.env`, eigener `--project-name` und eigenes Image-Tag (`tcm-web:dev`/`tcm-web:prod`).
- **`deploy/web/docker-compose.yml`:**
  - Router-Namen und `container_name` aus `${UMGEBUNG}` ableiten, damit sich Dev und Prod in Traefik nicht überschneiden.
  - Den bisherigen `TEST_DOMAIN`-Router entfernen.
- **Neues Build-Arg `NEXT_PUBLIC_UMGEBUNG`** (Dockerfile und Compose):
  - In Dev ein gut sichtbares Band „TESTUMGEBUNG“ oben im Layout (`apps/web/src/app/layout.tsx`, kleine Komponente).
  - In Dev `robots: noindex`.
- **DNS bei IONOS:** `dev` als A- und AAAA-Eintrag auf den Server.
- **Umstellung:** Der heutige Container wird zu `tcm-web-dev`. `app.` zeigt erst auf Prod, wenn Prod fertig ist; bis dahin kann `app.` auf Dev bleiben.

### 5. iOS: Dev-App und Prod-App
- **`apps/mobile/app.json` → `app.config.ts`:**
  - Abhängig von `APP_VARIANT=dev`: Name „TCM Dev“, Bundle-ID und Package `de.tcmuckensturm.app.dev`, Scheme `tcmdev`, Icon mit Band „DEV“.
  - Sonst bleibt alles wie heute.
  - Redirect-Ziele in `anmelden.tsx` und `konto.tsx` nehmen das Scheme aus der Konfiguration.
- **`apps/mobile/eas.json`:**
  - `base` enthält keine Supabase-Werte mehr.
  - Profil **`dev`** (store-Distribution, `APP_VARIANT=dev`, Dev-URL/Key/SITE_URL) für TestFlight der Dev-App.
  - Profil **`production`** mit Prod-URL/Key und `app.`-SITE_URL.
  - `simulator` und `preview` zeigen auf Dev.
  - Submit-Profile `dev` und `production` mit je eigener `ascAppId`.
- **App Store Connect:** zweite App „TCM Dev“ anlegen (neue Bundle-ID; Push-Capability und APNs-Key gelten für beide). Die Tester kommen in deren interne TestFlight-Gruppe. Die echte App bekommt später die Mitglieder.
- **Vorsicht:** Ein alter Build 11 zeigt auf das heutige Projekt, also nach der Umstellung auf **Dev**. Für den Rollout braucht es deshalb einen neuen `production`-Build gegen Prod.
- **Migrationen bleiben rückwärtskompatibel:** Alte App-Versionen sprechen weiter mit Prod. Erst erweitern, später aufräumen.

### 6. Lokal und Schutz vor Verwechslung
- **`scripts/e2e.sh`** lädt nicht mehr die Cloud-`.env`, sondern immer den lokalen Stack. E2E läuft nie gegen Dev oder Prod. **Erledigt (20.10.2026):** zusätzlich bricht `apps/web/playwright.config.ts` vor dem ersten Test ab, wenn eine Adresse nicht lokal ist.
- **Env-Dateien:** Root-`.env` und `apps/mobile/.env` zeigen auf Dev. Es gibt **keine** Prod-Schlüssel auf dem Mac außer im Passwortmanager. `.env.example` bekommt Platzhalter statt der echten Ref.
- **Prod-Datenbank** nur über ein neues Skript `scripts/prod-migrate.sh <tag>`:
  - prüft, ob der Tag existiert und der Arbeitsbaum sauber ist;
  - zeigt `supabase migration list` und die ausstehenden Migrationen;
  - verlangt „prod eintippen“;
  - führt dann `db push` aus und linkt danach zurück auf Dev.
- **Server-Agent `claude-rc`:** abgeschaltet (13.10.2026), sein Deploy-Key wird entfernt. Deployt wird nur noch über GitHub Actions mit einem Schlüssel, der auf dem Server ausschließlich `tcm-deploy` aufrufen darf.

### 7. Release-Ablauf
**Ersetzt durch `CONTRIBUTING.md` (13.10.2026):** PR `main` → `production`, Freigabe im Environment, dann automatisch Migrationen, Functions, Web, Tag. Der folgende ursprüngliche Plan bleibt nur zur Nachvollziehbarkeit stehen; `scripts/prod-migrate.sh` entfällt.
1. Entwickeln lokal (`db reset`, `pnpm verify`, E2E).
2. Push auf `main`, dann `deploy.sh dev` und Migrationen per `supabase db push` auf Dev; Tester prüfen dort.
3. Freigabe: `git tag v1.x.y && git push --tags`.
4. Dann nach Prod:
   1. `scripts/prod-migrate.sh v1.x.y` (Migrationen);
   2. `supabase functions deploy` gegen Prod, falls Functions geändert wurden;
   3. `deploy.sh prod v1.x.y`;
   4. bei App-Änderungen `eas build --profile production` und submit.
5. **Rückweg:**
   - Web: `deploy.sh prod <vorheriger Tag>`.
   - Datenbank: neue Gegen-Migration oder Wiederherstellung aus Backup bzw. PITR (PITR kostet extra; vorerst Tagesbackup plus eigener Dump).

### 8. Optional später
- ~~GitHub Actions~~: erledigt, siehe `.github/workflows/` und `CONTRIBUTING.md`.
- Uptime-Prüfung für `app.` (z. B. UptimeRobot) und Mail an dich.
- EAS Update (OTA) mit Kanälen `dev`/`production` für schnelle JS-Korrekturen.

### 9. Go-Live-Reihenfolge
1. Schritte 1, 2, 6: Dev sauber, Absicherungen, Tests grün.
2. Schritt 4: Web als Dev auf `dev.` umziehen, Tester-Links umstellen. Einladungen und Mails nennen dann `dev.`.
3. Schritt 5: Dev-App in TestFlight, Tester wechseln.
4. Schritt 3: Prod aufsetzen, Leerlauf-Probe mit einem Admin.
5. Restliche Befunde aus `docs/testphase-befunde.md` abarbeiten, dann eBuSy-Import nach Prod (O17).
6. `app.` zeigt auf Prod, Prod-App in TestFlight bzw. App Store, Mitglieder einladen.

## Kritische Dateien
- **Neu:**
  - `apps/mobile/app.config.ts` (ersetzt `app.json`)
  - `scripts/prod-migrate.sh`
  - `deploy/db/sicherung.sh`
  - `supabase/env/README.md`
  - `docs/release-ablauf.md`
  - Komponente für das Dev-Band
- **Ändern:**
  - `deploy/web/deploy.sh`, `deploy/web/docker-compose.yml`, `apps/web/Dockerfile`
  - `apps/mobile/eas.json`
  - `supabase/config.toml`
  - `scripts/e2e.sh`, `.env.example`
  - `apps/web/src/app/layout.tsx`
  - `README.md`, `apps/mobile/RELEASE.md`
- **Wiederverwenden:**
  - Snippets in `supabase/snippets/`
  - `public.ist_testadresse`
  - vorhandene `PFAD_KOPF`/Layout-Logik für das Band

## Was du selbst tun musst
- Supabase Pro-Org und Zahlungsmittel einrichten.
- In Prod beim Aufbau im Dashboard „Allow new users to sign up“ ausschalten (S1). Dev ist seit 21.10.2026 erledigt.
- DNS-Eintrag `dev` bei IONOS.
- Zweite App in App Store Connect anlegen; geht auch per API, wenn du mich lässt.
- Zwei neue Resend-Keys erzeugen.
- Passwortmanager-Einträge anlegen.
- AV-Verträge abschließen.

## Verifikation
- **Dev:** `supabase migration list` zeigt lokal und remote gleich. Ein `db push` ohne Änderungen meldet nichts zu tun.
- `deploy.sh dev` bringt `dev.` mit Band „TESTUMGEBUNG“ ans Laufen. `deploy.sh prod` ohne Tag bricht ab.
- **Einladung aus Dev:** Die Mail kommt von `dev-noreply@` mit „[DEV]“ und der Link zeigt auf `dev.`. Dasselbe in Prod zeigt auf `app.`.
- **Beide Apps** liegen auf dem iPhone. Ein Login in „TCM Dev“ mit einem Testkonto funktioniert, in „TCM“ nicht, weil es das Konto in Prod nicht gibt.
- **Prod-Probe:** Admin einladen, Passwort setzen, Platz buchen, Getränk buchen, Lastschrift-Entwurf mit Gläubigerdaten. Danach alles wieder löschen.
- **Backup:** Dump wiederherstellen in ein Wegwerf-Projekt, IBAN mit dem gesicherten Schlüssel entschlüsseln.
- Lokal `pnpm verify` und E2E grün, nachweislich gegen `127.0.0.1`.
