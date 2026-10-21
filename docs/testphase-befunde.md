# Testphase – Befunde

Sammelstelle für Fehler, Lücken und Auffälligkeiten aus der Testphase (Start: Oktober 2026),
damit sie gebündelt abgearbeitet werden können. Neue Befunde unten in **Offen** ergänzen;
Erledigtes mit Commit nach **Behoben** verschieben.

Stand: 21.10.2026

Legende Priorität: **P1** blockiert Tester oder ist ein Sicherheitsthema · **P2** vor externen
Testern bzw. App Store · **P3** Komfort, Aufräumen.

---

## Offen

### Sicherheit und Betrieb

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| O1 | P1 | Der **Resend-API-Key** und der **legacy Service-Role-Key** standen im Klartext im Chatverlauf. | Vor dem Echtbetrieb rotieren: in Resend einen neuen Key erzeugen, in den Supabase-Secrets (`RESEND_API_KEY`) und im Auth-SMTP-Passwort ersetzen. Supabase auf die neuen `sb_secret_…`-Keys umstellen, den Vault-Eintrag `notification_mails_key` ersetzen und den legacy JWT-Key deaktivieren. |
| O2 | P2 | Die **Supabase-Cloud läuft im Free-Tier** und schläft nach Inaktivität ein (HTTP 521). | Vor externen TestFlight-Testern und der Beta-Prüfung von Apple auf **Supabase Pro** umstellen, sonst scheitert die Prüfung. |

### iOS-App und TestFlight

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| O5 | P1 | **Push-Mitteilungen funktionieren nicht.** EAS kann den APNs-Key mit dem App-Store-Connect-API-Schlüssel nicht anlegen; dafür ist ein Apple-Login nötig. | Im Apple-Developer-Portal unter *Keys* einen APNs-Key anlegen und mit `npx eas-cli credentials -p ios` hochladen. Danach die Edge Function `notification-pushes` deployen, `EXPO_ACCESS_TOKEN` und `PUSH_AKTIV` setzen und den Zeitplan einrichten (`supabase/snippets/benachrichtigungs_pushes_zeitplan.sql`). Zum Schluss einen neuen Build erstellen. |
| O6 | P2 | **Expo SDK 52 / React Native 0.76** bauen nur mit festgelegtem EAS-Image `macos-sequoia-15.6-xcode-26.2`. Mit `latest` (Xcode 26.6+) scheitert `fmt` (consteval-Fehler). | Expo-SDK-Upgrade einplanen, danach das Image wieder auf `latest` bzw. ein neueres stellen. |
| O7 | P2 | **TestFlight intern:** Bisher sind nur Lucas und Robin Tester. Moritz' Einladung zu App Store Connect ist noch offen (bis 12.10.). Chris, Wolfgang, Ladi und Maren fehlen. | Apple-IDs der restlichen Tester einsammeln, sie in App Store Connect einladen (Rolle Marketing, nur diese App) und nach Annahme in die Gruppe „Team (Expo)“ eintragen. |
| O8 | P2 | **App-Icon** ist ein Platzhalter (`apps/mobile/assets/icon.svg`). | Echtes Logo in hoher Auflösung beschaffen. |
| O9 | P2 | **Apple-Regel 5.1.1(v):** In der App gibt es keinen Weg, das Löschen des Kontos zu beantragen. | **DB erledigt (PR #58):** RPC `konto_loeschung_beantragen` mit Tabelle `account_deletion_requests`, Mail und Push an Admins und Vorstand, höchstens ein Antrag je 24 h. **Offen:** Oberfläche im Konto-Tab. |
| O10 | P2 | **Store-Eintrag** fehlt: Screenshots, Beschreibung, Altersfreigabe, App-Datenschutzangaben. | Vor der externen Beta bzw. dem App Store anlegen; Alternative: „Nicht gelistet“. |

### Verwaltung

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| O24 | P1 | **Web erledigt (PR C, Onboarding im Web):** Aktion `einladung_erneut` in `member-login` (unbestätigter Login: `inviteUserByEmail` für den bestehenden Login; bestätigt, aber Onboarding offen: Recovery-Link; der Login bleibt), Lesen über `einladung_status` aus `auth.users`. Statusmarken „Einladung ausstehend“, „abgelaufen“ und „Onboarding offen“ in Übersicht, Zugang-Karte und Mitgliederliste (Filter „Onboarding offen“). **Offen:** dasselbe in der App-Verwaltung. Ursprünglicher Befund: **Abgelaufene Einladungen lassen sich aus der Verwaltung nicht neu senden, und Links gelten nur 1 Stunde.** Beobachtet am 11.10. bei Ladi: Er wurde am 09.10. eingeladen, beide Links waren abgelaufen. (1) In der Cloud gilt jeder Mail-Link (Einladung, „Passwort vergessen“) nur **1 Stunde** (`mailer_otp_exp = 3600`); möglich sind maximal 24 Stunden. (2) Beim Einladen wird der Login sofort mit dem Mitglied verknüpft. `member_login_state.hat_zugang` ist deshalb `true`, auch wenn die Einladung **nie angenommen** wurde. Die Verwaltung zeigt „App-Zugang aktiv“ und nur „Passwort zurücksetzen“, „Sperren“ und „Entfernen“. Der Knopf „Einladung verschicken“ erscheint nur ohne Login (`LoginKarte.tsx`, App `Zugang.tsx`), und `member-login/einladen` lehnt mit „hat bereits einen Zugang“ ab. | ~~`mailer_otp_exp` auf **86400**~~ (erledigt am 11.10.: Cloud per Management-API, lokal `otp_expiry` in `supabase/config.toml`). Hinweis „Der Link gilt 24 Stunden“ in `supabase/templates/einladung.html`. `member_login_state` um `angenommen` (bestätigt oder schon angemeldet) und `einladung_abgelaufen` erweitern. Neue Aktion `erneut_einladen` in `member-login`: `inviteUserByEmail` für den unbestätigten Login; bei Fehler löschen, neu einladen und neu verknüpfen, Admin-Rolle behalten. Web und App: Status **„Einladung ausstehend“** bzw. „abgelaufen“ statt „App-Zugang aktiv“, Knopf **„Einladung erneut senden“**, auch als Statusmarke in der Mitgliederübersicht. pgTAP-Tests für die neuen Felder. **Workaround bis dahin:** Neuversand über die Auth-Schnittstelle (so am 11.10. für Ladi gemacht). „Zugang entfernen“ und „Einladung verschicken“ gibt es seit der Login-Pflicht nicht mehr. |
| O23 | P2 | ~~**Die Admin-Rolle ist nicht auffindbar.**~~ **Erledigt:** Zeile „Rollen“ in der Übersicht (Web und App), alle Rollen in der Karte „Rollen und Zahler“. In der Mitgliederübersicht (Verwaltung → Mitglieder → Mitglied) gibt es keine Zeile für die Rolle. Der Schalter „Verwaltungsrechte“ sitzt in der Karte „Rolle und Zahler“ auf der Unterseite `?teil=mitgliedschaft`, und die erreicht man nur über die Zeile **„Mannschaft“** (`apps/web/src/components/MitgliedUebersicht.tsx:147`). | Im Abschnitt **Mitgliedschaft** eine eigene Zeile **„Rolle“** mit Hinweis „Mitglied“ bzw. „Admin“, die direkt zum Schalter führt. Die Rolle gehört zur Mitgliedschaft, nicht zur Mannschaft. Die Zeile „Mannschaft“ führt dann nur noch zur Mannschaft. Rolle und Zahler eventuell auf eine eigene Unterseite (`?teil=rolle`) trennen. In der App (`Mitgliedschaft.tsx`, Karte „Rolle und Zahler“) gleich ziehen. |

### Inhalte und Rechtliches

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| O12 | P2 | **Datenschutz und Impressum** enthalten noch `[[Platzhalter]]`. | Echte Angaben des Vereins eintragen. Die Datenschutzerklärung muss auch Resend als Mail-Dienstleister und Supabase nennen. |
| O13 | P3 | Beschreibungen von Forderungen sind in ASCII („Getraenke …“, „Gastgebuehr …“). | Entweder beim Erzeugen echte Umlaute schreiben (SQL-Funktionen `charge_billing_period`, Gastgebühr), oder bewusst so lassen. Die Art-Marken machen sie lesbar. |

### Testdaten und Testkonten

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| O14 | P3 | Jede Testperson steht **zweimal** in der Mitgliederliste (Mitglied und Admin), weil ein Login genau einem Mitglied gehört. Das zählt auch in den Statistiken mit. | Für die Testphase hinnehmen. Beim echten Import bekommt jeder Vorstand **ein** Konto mit Admin-Rolle. Optional ein Merkmal „Testkonto“ zum Filtern. |
| O15 | P3 | **GMX und T-Online** nehmen Plus-Adressen (`name+zusatz@…`) nicht zuverlässig an. Maren hat deshalb zwei echte Adressen bekommen. | Bei weiteren Testern ohne Gmail zwei echte Adressen nutzen. |
| O16 | P3 | Beim Aufräumen der 199 Seed-Mitglieder hat der **abgeschlossene Lastschriftlauf „Getränke“** Posten verloren (jetzt 45 Lastschriften, 185,80 €). Die Summen sind neu berechnet, der Lauf passt aber nicht mehr zur damals erzeugten Datei. | Testdaten, unkritisch. Vor dem Echtbetrieb ohnehin den gesamten Testbestand ersetzen. |
| O17 | P3 | Vor dem Echtbetrieb muss der **gesamte Testbestand** raus: 200 Seed-Mitglieder, Testkonten, Prüferkonto, Testläufe. Danach folgt der Import aus eBuSy. | Eigenes Aufräum-Skript; danach `tools/import` gegen die Cloud. |

### Tests und Entwicklung

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| O19 | P3 | **Testlauf-Rückstände:** Ein früherer E2E-Lauf hat dem lokalen Testmitglied die Admin-Rolle gegeben. Danach schlugen Berechtigungstests fehl, bis `db:reset` lief. | Die betroffenen Verwaltungstests sollen vergebene Rollen wieder entziehen; oder vor jedem Lauf `db:reset`. |
| O20 | P3 | Die Abläufe „Einladung über den Server“ und „Passwort-vergessen-Link in Tab 2“ sind nur einmalig mit dem lokalen Mail-Postfach (Mailpit) geprüft, nicht als dauerhafte E2E-Tests. | Hilfsfunktion für Mailpit in `apps/web/e2e/hilfen.ts` und dauerhafte Tests daraus machen. |
| O26 | P3 | **E2E „ein Mitglied mit Historie lässt sich nicht löschen“ (`apps/web/e2e/mitglieder.spec.ts:296`) scheitert nur im Gesamtlauf.** Einzeln auf frischer DB besteht er. Er sucht nach „Bauer“ und nimmt den ersten Treffer; im Gesamtlauf ist das je nach dem, was vorherige Tests angelegt haben, ein anderer Datensatz (beobachtet: der des Admins). Der Test hängt also von der Reihenfolge ab. Gefunden beim Gesamtlauf zu PR #40 am 19.10. | Den Datensatz eindeutig wählen, z. B. über die Mitgliedsnummer oder die ID des Testmitglieds statt über den ersten Treffer der Suche. |

### Härtung vor dem Go-Live (Audit 20.10.2026)

Vier Audits, nur lesend, am Stand `e4dd27b`: Security, Bugs, Testing, UI/UX. Plan und Reihenfolge der Wellen: Härtungsplan (bis zum Go-Live keine großen neuen Funktionen). „Geprüft“ heißt: am Code von Hand nachgesehen. Alles andere stammt aus dem Audit und wird beim Fix zuerst mit einem roten Test belegt.

#### Security

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| S1 | P1 | **Konto-Übernahme:** `loginAnlegen` in `member-login/index.ts:~600` übernimmt ein vorhandenes Auth-Konto mit gleicher E-Mail. Lokal sind `enable_signup = true` und `enable_confirmations = false` gesetzt, die Mindestlänge des Passworts ist 6. Wer sich mit der Adresse eines künftigen Mitglieds registriert, bekommt dessen Konto. | PR #46: Signup lokal aus. Die Übernahme bleibt, weil jedes Konto von der Verwaltung stammt. Die Mindestlänge bleibt bei 6 (abgestimmt). Dev: „Allow new users to sign up“ am 21.10.2026 ausgeschaltet. Offen nur noch Prod, beim Aufbau des Prod-Projekts (goLive.md). |
| S2 | P2 | Open Redirect über `?weiter=` (`apps/web/src/app/login/page.tsx:66`) | PR #43 |
| S3 | P2 | `istDienstschluessel()` in `notification-mails`/`-pushes` liest die JWT-Rolle ohne Signaturprüfung. Das ist nur sicher, solange `verify_jwt` an ist. | PR #46: zeitkonstanter Vergleich, sonst prüft Auth die Signatur |
| S4 | P2 | Keine CSP und keine Permissions-Policy, HSTS ohne `includeSubDomains` | PR #55: CSP mit Nonce (Middleware), Permissions-Policy, HSTS `includeSubDomains` (auch Traefik), E2E `sicherheit.spec.ts` |
| S5 | P2 | App: Tokens liegen in AsyncStorage, Einladung und Recovery laufen im Implicit Flow über `tcm://` | PR #53: Sitzung im Schlüsselbund (Stücke ab 2 KB, Umzug aus AsyncStorage), Mail-Links mit `token_hash` + `verifyOtp`. Das Fragment gilt übergangsweise weiter, Rest unter S20. |
| S6 | P3 | `submit_membership_application`: `p_ip` setzt der Aufrufer selbst, die Sperre lässt sich umgehen | IP serverseitig ermitteln *(Migration)* |
| S7 | P2 | CSV-Injection im Teilnehmer-Export (`csvFeld`) | PR #43 |
| S8 | P3 | `private.*`-Funktionen sind für PUBLIC ausführbar. `private` ist nicht per API erreichbar, betroffen ist also nur die Tiefenverteidigung. | Revoke + Default-Privileges, pgTAP-Test für Funktionsrechte *(Migration)* |
| S9 | P2 | Middleware lässt ohne Env-Variablen alles durch | PR #43 |
| S10 | P3 | Export-Route ohne eigene Rollenprüfung | PR #43 |
| S11 | P2 | `SUPABASE_ACCESS_TOKEN` gilt in `deploy.yml` für den ganzen Job, auch für `pnpm install`. Unklar ist, woher der IBAN-Vault-Schlüssel in Prod kommt (siehe O1). | Token nur für die Steps, die ihn brauchen. Runbook für den Schlüssel. |
| S12 | P1 | **Ausgetretene und archivierte Mitglieder behalten vollen Zugang.** *Geprüft.* `private.is_member()`, `current_member_id()`, `is_admin()` und `has_role()` prüfen weder `status` noch `login_disabled_at`. `archive_member` sperrt den Login nicht, `end_membership` entzieht keine Rollen. Ein ausgeschiedener Vorstand sieht weiter IBANs. Gleicher Befund wie B3. | **Erledigt (PR #47):** `private.hat_zugang` in allen fünf Rechtefunktionen (auch `darf_plaetze`): nicht archiviert, kein `login_disabled_at`, aktiv oder Austrittsdatum heute oder später. `archive_member` setzt den Sperrvermerk, das Web bannt danach das Auth-Konto (`login_deaktivieren`). `end_membership` nimmt bei Austritt zu heute die Rollen, `reactivate_membership` gibt alte Rollen nicht zurück. |
| S13 | P1 | **Löschen und Anonymisieren entfernen die Daten nicht vollständig (DSGVO Art. 17).** Im `change_log` bleiben der ganze Datensatz und alle alten Werte stehen. `anonymize_member` lässt `guardian_*` stehen. Anträge bleiben mit Name, Adresse und Geburtsdatum erhalten. Für `privacy.change_log_days` gibt es keinen Aufräumlauf. | Log-Zeilen schwärzen, `guardian_*` leeren, Antrag schwärzen, pg_cron für die Aufbewahrung *(Migration)* |
| S14 | P2 | `next` 15.5.22 hat kritische Advisories (u. a. im Image Optimizer), `sharp`/`postcss` hohe | **Erledigt (PR #49):** `next` 15.5.28, über `pnpm.overrides` `next>sharp` 0.35.5 und `next>postcss` 8.5.31. `pnpm audit` meldet für `apps/web` nichts mehr. Die Reste in Expo und den Root-Devtools gehören zu S28. |
| S15 | P2 | Jedes Mitglied liest die komplette Buchungshistorie aller Mitglieder mit allen Spalten (`cancellation_reason`, `cancelled_by`, `created_by`, `booking_code`) | Spalten-Grant und zeitliche Begrenzung *(Migration)* |
| S16 | P2 | Admin-Konten nur mit Passwort: TOTP aus, `secure_password_change = false`, Leaked-Password-Schutz auf Dev aus | TOTP für admin/board, aal2 in `is_admin`, Re-Auth beim Passwortwechsel |
| S17 | P3 | Mitglieder lesen ihre eigenen `notes`, `import_notes`, `legacy_data` | Spalten-Grant *(Migration)* |
| S18 | P3 | `member-login`: Ein Admin kann sich oder alle anderen Admins sperren. `email_aendern` ändert auch Admin-Adressen ohne Hinweis an die alte Adresse. | Schutz für den letzten Admin, Hinweis-Mail an die alte Adresse |
| S19 | P3 | Eine Sperre wirkt erst nach Ablauf des JWT (bis 1 h) | Mit S12 erledigt (PR #47): Die Prüfung liest bei jeder Anfrage die Datenbank. |
| S20 | P3 | Login-CSRF über das `#access_token`-Fragment in `passwort-setzen` | **Teilweise** (PR #53): Die Mailvorlagen liefern `token_hash`, App und Web lösen ihn mit `verifyOtp` ein. Übergangsweise nehmen beide noch `#access_token` an. Offen: Cloud-Mailvorlagen auf token_hash umstellen, danach Fragment-Zweig in App und Web entfernen (`docs/goLive.md`, Schritt 1). |
| S21 | P3 | Freitext ohne Längengrenze (`guest_name`, `cancellation_reason`, Namen) | CHECK-Constraints *(Migration)* |
| S22 | P3 | Globaler Deckel von 20 Anträgen pro Stunde: Mit Fake-Anträgen lassen sich alle echten blockieren | Captcha oder Bestätigungsmail |
| S23 | P3 | Rechtstexte sind nach der Zustimmung noch änderbar | Trigger: Text einer zugestimmten Version unveränderlich *(Migration)* |
| S24 | P3 | Am Kiosk bucht man ohne PIN für jedes Mitglied | Design-Entscheidung festhalten oder Push an das Mitglied |
| S25 | P3 | **Schema `tests` mit 53 pgTAP-Funktionen liegt auf Dev.** Die Tests liefen also einmal gegen die Cloud. | Bereinigung mit Lucas abstimmen (kein DDL von Claude). Für Prod ausschließen. |
| S26 | P3 | `register_push_token` hängt ein fremdes Token auf das eigene Konto um | Umhängen nur bei stillgelegtem Token *(Migration)* |
| S27 | P3 | Kinder erteilen die Elternzustimmung und das SEPA-Mandat selbst | Bestätigung per Mail an die Eltern |
| S28 | P3 | `pnpm audit`: kritische/hohe Lücken in Expo-Build-Werkzeugen (nur zur Build-Zeit) | Expo-Patchupdate, `pnpm.overrides` |

#### Bugs

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| B1 | P1 | **Doppelte Belastung:** *Geprüft.* `waive_charge`/`settle_charge_manually` sperren nur `submitted`/`settled`. Eine Forderung im laufenden Einzug (`notified`) lässt sich also erlassen oder als bezahlt abhaken und wird trotzdem eingezogen. `mark_debit_batch_generated` überschreibt danach den Status. | **Erledigt (PR #51):** Im Einzugsentwurf nehmen `waive_charge`/`settle_charge_manually` den Posten heraus (Summe und Anzahl ziehen nach), nach erzeugter oder eingereichter Datei abgewiesen. Datei bauen und `mark_debit_batch_generated` brechen bei erlassenen oder bezahlten Posten ab und setzen nur angekündigte auf `submitted`. |
| B2 | P1 | Eine Gastgebühr entsteht doppelt bzw. wird beim Storno nicht erlassen, sobald sie angekündigt ist (`sync_guest_charges`, `waive_guest_charges` zählen nur `open`) | **Erledigt (PR #51):** `sync_guest_charges` zählt alles außer `waived`; Wegfall und Storno erlassen auch angekündigte und nehmen sie aus dem Entwurf. In einer erzeugten Datei bleibt die Gebühr stehen (einmal eingezogen), Gast austragen wird dann abgewiesen. `einziehbar` nimmt Gastgebühren erst ab Spielbeginn. |
| B3 | P1 | Archivierte Mitglieder können buchen und sich anmelden | **Erledigt mit S12 (PR #47)** |
| B4 | P2 | `archive_member` räumt Gastgebühren, Veranstaltungsanmeldungen, Wartelisten und Mitspielerplätze nicht auf. Ein Archivierter rückt sogar nach. | **Erledigt (PR #47):** `archive_member` erlässt Gastgebühren abgesagter Buchungen, gibt Mitspielerplätze frei (Nachricht an den Bucher), meldet von künftigen Veranstaltungen und Wartelisten ab. `event_nachruecken` lässt Archivierte aus. |
| B5 | P2 | Archivieren bei offenem Einzug: Die Lastschrift auf das widerrufene Mandat landet in der Datei | **Erledigt (PR #47):** `archive_member` nimmt das Mitglied aus Einzügen ohne Datei, die Forderungen sind wieder offen. |
| B6 | P2 | `join_booking` ohne `for update`: Wer gleichzeitig „Mitspielen“ tippt, überbucht | **Erledigt (PR #58):** `join_booking`, `update_booking_players` und `leave_booking` lesen die Buchung mit `for update`. |
| B7 | P2 | Lastschriftdatei lässt sich nach einem Teilfehler nie wieder erzeugen (Upsert ohne UPDATE-Policy im Bucket `sepa`) | Eindeutiger Pfad je Versuch |
| B8 | P2 | Kiosk: Während der 2,5 s Bestätigung bucht der Nächste in den Korb des Vorgängers | **Erledigt (PR #54):** Korb, Person und Suche sind nach der Buchung sofort leer. Tippen in der Bestätigung bricht den Timer ab. Während des Sendens gesperrt. |
| B9 | P2 | Mails und Pushes gehen nach einem Teilfehler doppelt raus (`release_*` gibt alle IDs frei) | **Erledigt (PR #58):** `versandstapel.ts` (@tcm/core, per Symlink in beiden Functions) gibt nach einem Teilfehler nur frei, was nicht rausging; bei Pushes bleibt abgehakt, was ein Gerät erreicht hat. |
| B10 | P2 | SEPA-Mandat im Onboarding scheitert zwischen 0 und 2 Uhr: `signed_on` ist das Berliner Datum, die Constraint prüft gegen `current_date` (UTC) | **Erledigt (PR #58):** Die Constraint prüft gegen `(now() at time zone 'Europe/Berlin')::date`. |
| B11 | P2 | Am letzten Vorlauftag zeigt der Plan Zeiten als frei, die der Server ablehnt (`canStartAt` ohne `leadDays`) | **Erledigt (PR #56):** `canStartAt` und alles darauf (`courtStatusAt`, `freeGaps`, `freeSlotsOfDay`, `freeCourtsNow`) prüft `leadDays` wie `create_booking`: jetzt plus lead_days mal 24 Stunden (UTC), über die Zeitumstellung eine Stunde verschoben. Status „buchbar ab …“. Web und App reichen `lead_days` durch. |
| B12 | P2 | Clients prüfen `min_players` nicht (Doppel mit einem Mitspieler) | **Erledigt (PR #56):** Buchungsblatt in Web und App prüft mit `checkPlayers` (kennt jetzt „Mitspieler gesucht“) und sagt, wie viele Mitspieler fehlen. Server geprüft, pgTAP-Test ergänzt. |
| B13 | P2 | Stornieren, Austragen und Mitspielen werden auch für begonnene Buchungen angeboten | **Erledigt (PR #56):** `bookingActions` in `@tcm/core` (Regeln aus `cancel_booking`, `update_booking_players`, `leave_booking`, `join_booking`), genutzt im Buchungsblatt und in „Meine & offene Spiele“ in Web und App. |
| B14 | P2 | Ein Ladefehler sieht aus wie „nichts da“ (`/konto`, Belegungsplan, Kasse) | PR #55: Fehlerzustand mit „Erneut versuchen“ in `/konto`, Belegungsplan und Kasse |
| B15 | P3 | `current_drink_price` nutzt das UTC-Datum: Nachts gilt am Umstellungstag noch der alte Preis | `private.heute()` *(Migration)* |
| B16 | P3 | UTC-Datum als „heute“ in sechs Web-Formularen und mehreren SQL-Vorgaben. In der Neujahrsnacht wird der Beitrag des Vorjahres zugewiesen. | `berlinDay`, `private.heute()` |
| B17 | P3 | Wird der Anmeldeschluss verschoben, kommt keine neue Erinnerung | `reminder_sent_at` zurücksetzen |
| B18 | P3 | Web-Getränkekarte verliert Eingaben während des Sendens | **Erledigt (PR #54):** +/− sind während `laeuft` gesperrt, ebenso in der App und am Kiosk. |
| B19 | P3 | App-Tab „Konto“ lädt bei Fokus nicht nach | `useFocusEffect` |
| B20 | P3 | Teilfehler bei der E-Mail-Änderung wird als Gesamtfehler gemeldet | Meldung differenzieren |
| B21 | P2 | `end_membership` setzt den Status sofort auf inaktiv, auch beim Austritt zum Jahresende. Bis zum Austrittsdatum hat das Mitglied Zugang (S12), fehlt aber in `member_directory` (Mitspielerwahl, Kiosk) und `record_purchase` weist es ab. Gefunden bei S12. | **Erledigt (PR #58):** `member_directory` und `record_purchase` prüfen `hat_zugang`, gleiche Regel wie Login und Rechte, ohne Zeitgeber. Gesperrte fallen dabei aus dem Verzeichnis. |
| B22 | P3 | Ausgetretene (Datum vorbei) werden nicht gebannt: Die Anmeldung gelingt, danach sind alle Seiten leer, weil die Datenbank nichts mehr liefert. Gefunden bei S12. | Nach der Anmeldung einen Hinweis „Kein Zugang mehr“ zeigen und abmelden (Web und App) |
| B23 | P3 | `update_member` kann `status` direkt auf `archived` setzen und umgeht damit das Aufräumen von `archive_member` (B4, B5). Zugang und Nachrücken sind trotzdem gesperrt. Gefunden bei S12. | **Erledigt (PR #58):** `update_member` setzt nur aktiv oder inaktiv, archiviert nicht und holt nicht aus dem Archiv (dazu B26). |
| B24 | P2 | Eine Sperrung lässt sich in der App weder bearbeiten noch aufheben (vom Nutzer gemeldet). *Geprüft:* `cancel_booking` und das Blatt funktionieren, aber in der Ansicht „Freie Zeiten“ ließ sich eine Sperrung gar nicht öffnen, in Verwaltung → Plätze stand nur „gesperrt bis …“ ohne Weg dorthin, und nach dem Aufheben hieß es „Buchung storniert“. Bearbeiten gab es nirgends. | **Erledigt (PR #50):** Neue RPC `update_blocking` (Zeit, Plätze, Kategorie, Grund; Rechte, Überschneidung und `p_force` wie `create_blocking`). App und Web: „Sperrung bearbeiten“ im Blatt, Sperrungen auch in „Freie Zeiten“ öffnen, eigene Meldung beim Aufheben, gesperrte Plätze in der Platzliste verlinken auf den Plan. |
| B25 | P3 | Der Grund war beim Sperren Pflicht (`create_blocking`: „Bitte einen Grund angeben.“, Check `bookings_owner_present`). | **Erledigt (PR #50):** Grund freiwillig in `create_blocking` und `update_blocking`, Check gelockert. Ohne Grund nennen Storno und Nachricht die Kategorie. |
| B26 | P3 | Archivierte Mitglieder lassen sich nicht reaktivieren: Die Oberfläche verweist auf eine Reaktivierung, die es nicht gibt, und seit B23 geht es auch nicht mehr über `update_member`. | Eigene RPC `reactivate_member`, später. |

Verdacht, beim Fix klären: Abbuchungstag ist kein Bankarbeitstag (Samstag, 25.12.); Mindestbetrag 5 € je Auswahl; veraltete Antworten beim schnellen Tageswechsel in der App.

#### Testing

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| T1 | P1 | `scripts/e2e.sh` sourct die Root-`.env` und läuft damit gegen die Cloud | eigener PR (`chore/e2e-nur-lokal`) |
| T2 | P2 | E2E läuft nicht in CI | **Erledigt (PR #52):** Job `e2e` in `ci.yml` (noch kein Pflicht-Check): lokaler Stack mit Edge Runtime und Mailpit im Runner, `.env.local` aus `supabase status`, `scripts/e2e.sh --project=chromium`, Bericht und Traces als Artefakt. Auth-Rate-Limits des lokalen Stacks in `config.toml` angehoben (Anmeldungen 1000/5 min, Mails 100/h). Erster Lauf: 139 bestanden, 0 übersprungen. |
| T3 | P2 | E2E nicht deterministisch: 18 datenabhängige `test.skip`, „erster Treffer“ bei Mitspielern und Buchungen. Die Testkonten wandern bei jedem `db reset` (`gen_random_uuid`, Ursache von O26). | **Erledigt (PR #57):** Feste UUIDs (`e2e00000-…`) für alle Testkonten, der übrige Bestand mit festen IDs per `md5`. Dazu Mia/Max Mitspiel und Kira Kasse (mit Mandat) als feste Mitglieder. Der Seed bucht nie um 08:00 und 11–15 Uhr. Jeder Buchungstest hat dort seinen festen Platz und Tag. Neues globalSetup `testbestand-zuruecksetzen.ts` (Buchungen, Sperrungen, Glocke, Rollen, Vorlauf, fremde Buchung; O19). Keine datenabhängigen `test.skip` mehr. Serie im Seed vor den Zufallsbuchungen (Serien-Flake), „Historie“ über die feste ID (O26). B13 prüft das offene Blatt über den Spielbeginn. CI: 145 bestanden, 0 übersprungen. |
| T4 | P2 | pgTAP ohne direkte Tests für u. a. `remove_charge_from_debit_batch`, `fee_run_preview`, `debit_batch_items`, `event_veroeffentlichen`, `event_loeschen`, `update_membership`, `my_booking_quota`, `remove_push_token`, `guard_member_self_update` (GUC-Umgehung) | Nach der Lückenliste aus dem Audit ergänzen |
| T5 | P2 | Die SEPA-Datei wird nicht Ende-zu-Ende geprüft | E2E: Datei laden, Summe, Anzahl, IBANs prüfen |
| T6 | P2 | Edge Functions ohne Tests | Deno-Tests für `member-login` mit abgefangenem `Deno.serve` und `fetch`-Router, ohne die Funktion umzubauen |
| T7 | P3 | Mail-Abläufe nur einmalig geprüft (O20) | Mailpit-Helfer, dauerhafte E2E |
| T8 | P3 | App: nur 3 von 11 lib-Modulen getestet | Unit-Tests, manuelle Checkliste in `RELEASE.md` (kein Maestro) |

#### UI/UX

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| U1 | P2 | Im Web gibt es kein `loading.tsx`/`error.tsx`/`not-found.tsx` | PR #55: `error.tsx` für `/`, `/plan`, `/verein`, `/konto`, `/admin`, `not-found`, `global-error`, Komponente `Fehlerzustand`. **Kein `loading.tsx`:** Damit rendert jeder Link-Prefetch Root- und Admin-Layout samt DB-Abfragen (8,8 KB statt 0,2 KB je Prefetch, 24 allein auf der Mitgliederliste). In der CI hingen dadurch die Navigationen. Ladeanzeige erst nach einem schlankeren Layout oder mit `prefetch={false}` in Listen. |
| U2 | P2 | Rohe Supabase-Meldungen (`admin/mitglieder/page.tsx:86` u. a.), App `useLaden` | Web: PR #55 (`translateDbError` erkennt auch Verbindungsfehler, kein Rohtext). Offen: App `useLaden` |
| U3 | P3 | Nirgends „Erneut versuchen“, Pull-to-Refresh nur in 2 Dateien | Retry und Pull-to-Refresh |
| U4 | P3 | ~50× `#fff` statt Token, Avatarfarben doppelt | `onBrand`-Token, Avatarfarben nach `@tcm/ui` |
| U5 | P2 | App: feste Schriftgrößen, keine Prüfung großer Systemschrift | Hauptbildschirme bei größter Stufe prüfen |
| U6 | P3 | App: Tipp-Elemente ohne `accessibilityLabel`. Im Web keine axe-Prüfung. | Labels, `@axe-core/playwright` |
| U7 | P3 | Begriffe: Admin/Verwaltung, Belegungsplan/Plätze, Konto/Mein Konto, Home/Start | `docs/begriffe.md`, angleichen |
| U8 | P3 | Durchklick-Protokoll | Screenshots aller Routen (begonnen im Audit) |
| U9 | P1 | **„Einzug abschließen“ geht mit einem Klick, auch vor Ablauf der Rückläuferfrist.** Danach lassen sich Rückläufer nicht mehr erfassen (`LastschriftLauf.tsx:166-176, 227-229`). | **Erledigt (PR #48):** Vor Ablauf der Frist (Abbuchung + 56 Tage, `RUECKLAUF_TAGE`) ist der Knopf gesperrt und zeigt „Abschließen ab …“. Die Server-Aktion prüft die Frist ebenfalls. Rückläufer lassen sich auch nach dem Abschluss erfassen; die DB erlaubte das schon. |
| U10 | P2 | Datei erzeugen, „eingereicht“ und „Ankündigen“ (Massenmail) laufen ohne Rückfrage | **Erledigt (PR #48):** Ankündigen, Datei erzeugen und „eingereicht“ fragen vorher nach, mit Anzahl, Summe und Abbuchungstag (`.hinweis.rueckfrage`). Die App hat keine Kasse. |
| U11 | P2 | Fachbegriffe: „pain.008 erzeugen“, „eBuSy-Backend“ | „Bankdatei erzeugen“ |
| U12 | P2 | Systemseite zeigt Roh-Schlüssel und Cent-Beträge („1500“) und hat mehrere Speichern-Knöpfe | Checkboxen mit deutschen Namen, Euro-Eingabe |
| U13 | P2 | Fehlertexte in Rot zu kontrastarm (~3,2:1) | Token `redInk` |
| U14 | P2 | Hauptknopf im Dunkelmodus: Weiß auf `#3A9BE0` = 3,0:1 | dunkleres Blau |
| U15 | P2 | Grüne Kacheln „Freie Zeiten“ und Gefahr-Knöpfe unter AA | `greenInk`, dunkleres Rot |
| U16 | P2 | Die Bestätigung nach Buchen oder Getränk erscheint oben außer Sicht | Toast unten, Block hervorheben |
| U17 | P2 | **Getränke-Korb geht beim Verlassen still verloren.** „+“ wirkt wie gebucht, dem Verein fehlt das Geld. | **Erledigt (PR #54):** Der Korb bleibt erhalten (Web: `sessionStorage` je Konto, App: Speicher außerhalb des Bildschirms) und die Leiste zeigt „Noch nicht eingetragen“. Beim Verlassen mit vollem Korb kommt eine Rückfrage (Web: Links und `beforeunload`, App: Erinnerung beim Verlassen). |
| U18 | P2 | Platzraster am Telefon schwer zu treffen (34 px je halbe Stunde), Titel abgeschnitten | „Freie Zeiten“ als Standard, Ziele ≥ 44 px |
| U19 | P2 | Netzwerk- und Rate-Limit-Fehler erscheinen als „Passwort stimmt nicht“ | Web: PR #55 (Login, Passwort vergessen/setzen; `anmeldeFehlerText` in core) |
| U20 | P2 | App „Passwort setzen“: Ladekreis ohne Ende, wenn der Link kein Token hat | PR #53: Meldung mit „Neuen Link anfordern“ und „Zurück zur Anmeldung“, Frist 15 s |
| U21 | P2 | 115 DB-Fehlertexte und Einstellungstexte mit ae/oe/ue (vgl. O13) | Migration mit echten Umlauten *(Migration)* |
| U22 | P2 | App-Formulare ohne Autofill und ohne Fehler am Feld. Geburtsdatum als Freitext. | Props durchreichen, Datumsauswahl |
| U23 | P3 | Aufnahmeantrag: Fehlermeldung oben, außer Sicht. `autoComplete="off"` in den Stammdaten. | Meldung beim Knopf, echte `autoComplete` |
| U24 | P3 | Tippziele 40 statt 44 (Segmente, Chips, Vortag/Folgetag) | 44 |
| U25 | P3 | Kasse am Telefon: Segmentleiste abgeschnitten, „Ausnahmen“ ohne Link | Umbruch, Links |
| U26 | P3 | Deaktivierter Gold-Knopf ohne Begründung | neutrale Optik, Grund daneben |
| U27 | P3 | Leerzustände ohne Handlung | einheitliche Leer-Komponente |
| U28 | P3 | Doppelte Einstiege (zweimal „Platz buchen“ plus FAB). Abmelden ohne Text und ohne Rückfrage. | aufräumen |
| U29 | P3 | Legende und Feldränder unter 3:1 | kräftigere Rahmen |
| U30 | P3 | Englische Reste und Fachbegriffe: „Home“, „Login“, „LK“, „nuLiga-ID“ | „Start“, „Zugang“, Hilfetexte |
| U31 | P3 | Gebührenhinweis steht unter dem Anmeldeknopf. App „Passwort vergessen“ ohne Spam-Hinweis. Kein Passwort-anzeigen-Schalter. | angleichen |
| U32 | P3 | Mitgliederliste mit zwei Filtersystemen | zusammenführen |
| U33 | P2 | Beim Sperren in der App war die Kategorie fest „Platzpflege“. Im Plan stand „gesperrt“ statt der Kategorie. | **Erledigt (PR #50):** Kategorie (Buchungsart mit `applies_to = 'blocking'`) wählbar in App und Web. Im Plan oben die Kategorie, darunter der Grund, falls es einen gibt (`blockingLabel` in `@tcm/core`). |
| U34 | P2 | App, Tab Plätze: zwei Segmentleisten übereinander, Stundenbeschriftung rechts abgeschnitten, Legende von der Tab-Leiste verdeckt. | **Erledigt (PR #50):** Übersicht/Freie Zeiten über einen Raster/Liste-Umschalter rechts in der Datumszeile. Raster-Schrift wächst nur begrenzt mit (große Schrift ließ die Stunden ineinanderlaufen), Zeilen 46 statt 52 pt, damit die Legende ohne Scrollen über der Leiste steht. Knöpfe im Blatt mit Mindesthöhe. |

### Noch nicht live geprüft

| # | Was | Wie prüfen |
|---|---|---|
| L1 | **Benachrichtigungs-Mail** über Resend an einen echten Empfänger, ausgelöst durch den Zeitplan. | Ein Testkonto als Mitspieler buchen. Innerhalb von 5 Minuten sollte eine Mail kommen, und Resend zeigt „Delivered“. |
| L2 | **„Passwort vergessen“** live mit einem Testkonto. | Auf der Anmeldeseite anfordern, Link öffnen, Passwort setzen. |
| L3 | **Admin setzt das Passwort zurück** über die Verwaltung (`member-login` → `passwort_zuruecksetzen`, impliziter Link). | Verwaltung → Mitglied → Zugang → Passwort zurücksetzen. |
| L4 | **Testadressen** in der Verwaltung: Passwort-Reset wird gesperrt, Anlegen und Einladen legen den Login still an (`createUser`, keine Mail). | Bei einem `@example.org`-Mitglied „Passwort zurücksetzen lassen“: Erwartet ist die Meldung „Das ist eine Testadresse“. Ein Mitglied mit `@example.org` anlegen: Erwartet ist „Zugang … eingerichtet“, und in Resend erscheint keine Mail. |
| L5 | **Buchung umsetzen** (`move_booking`, Mail und Push `booking_moved`). Bisher nur per pgTAP geprüft, die Oberfläche kommt mit einem eigenen PR. | Als Platzwart eine fremde Buchung auf einen freien Platz setzen. Bucher und Mitspieler bekommen „Deine Platzbuchung wurde verlegt“ mit altem und neuem Ort. |

---

## Behoben

| Befund | Ursache | Commit |
|---|---|---|
| Nach der Ankündigung stand die Kasse bis zum Fälligkeitstag auf „Vorabankündigung läuft – bis dahin ist nichts zu tun“, obwohl Lauf und Datei sofort erzeugt werden durften. Wie Läufe aufgebaut sind, war unklar. | Die 14 Tage galten in der Anzeige als eigener Schritt; sie sind nur eine Bedingung an den Abbuchungstag. Ankündigung und Lauf waren zwei Vorgänge mit je eigenem Datum, ein Lauf entstand leer. Neu: **Einzug** (`einzug_vorbereiten`) kündigt an und legt den Lauf mit genau diesen Forderungen in einem Schritt an; ohne gültiges Mandat keine Ankündigung. Kasse neu gegliedert: Start (Zu tun), Einzüge, Forderungen, Abrechnen, Einstellungen. | #35 und dieser PR |
| O11: Die App-Kasse war nur per Typecheck geprüft. | Hinfällig: Die App hat keine Kasse mehr, Kasse und Verwaltung der Finanzen gibt es nur im Web. | – |
| O25: Ein Kiosk-Konto ließ sich mit einem Mitglied verknüpfen. | `link_auth_user` prüfte nur `members`, nicht `kiosk_devices`. Neu: `private.login_pruefen` weist Kiosk-Konten ab und gilt für `link_auth_user` und `create_member` (Login-Pflicht, Migration `20261014105338`). Zusätzlich prüft `member-login` beim Übernehmen eines vorhandenen Kontos, dass es kein Kiosk-Konto ist. | dieser PR |
| O3: Eine geänderte E-Mail blieb in `auth.users` die alte. | Die Verwaltung änderte nur `members.email`. Neu: Aktion `email_aendern` in `member-login`. Sie ändert zuerst das Mitglied über `update_member` mit dem Token des Admins, danach den Login (`updateUserById`). Lehnt der Login ab, setzt sie das Mitglied auf die alte Adresse zurück. | dieser PR |
| O4: Löschen und Anonymisieren ließen das Konto in `auth.users` verwaist zurück. | Beide liefen als RPC direkt aus dem Web. Neu: Aktion `loeschen` (Art `loeschen` oder `anonymisieren`) in `member-login`. Erst die RPC mit dem Token des Admins, dann `deleteUser`. | dieser PR |
| O18: E2E-Tests mit Einladung scheiterten lokal (`member-login` → 503). | Der Container `supabase_edge_runtime` fehlte. Ein beendetes `supabase functions serve` entfernt ihn, und `supabase start` legt ihn bei laufendem Stack nicht neu an. Außerdem bindet er die Functions des Checkouts ein, der ihn gestartet hat. Neu: `apps/web/e2e/edge-functions.ts` als zweites `globalSetup`. Läuft die Runtime nicht oder mit den Functions eines anderen Checkouts, startet es `supabase functions serve` für die Dauer des Laufs und beendet es danach. Das gilt nur gegen den lokalen Stack. | dieser PR |
| O21: Eine Person konnte zur selben Zeit auf zwei Plätzen eingetragen sein. | Der Ausschluss `bookings_no_overlap` gilt nur pro Platz. Neu: `private.spielt_schon` prüft pro Person (Bucher oder Mitspieler, aktive Buchungen, halboffene Zeiträume). Aufgerufen in `create_booking` (Bucher und Mitspieler), `update_booking_players` (neu hinzukommende Mitspieler), `join_booking` und per Trigger beim Verschieben. Meldung „X spielt zu dieser Zeit schon auf Platz Y“. Entscheidung Serien/Training: Das sind Blockungen ohne Person (kein Bucher, keine Mitspieler). Sie werden nicht geprüft und `create_series`/`update_series` bleiben unverändert. Ein Training blockiert also keine Person, und Admin-Serien brechen nicht. Bestehende Doppelungen und der Import bleiben unberührt, geprüft wird nur, was neu dazukommt. | dieser PR |
| Bei „Offene Spiele“ war nicht zu erkennen, wer sucht (O22). | Die Karte zeigte nur Kürzel-Avatare bzw. den Namen klein in der Unterzeile. Jetzt Kopfzeile „Robin Heinzler sucht einen Mitspieler“ (bei eigener Buchung „Du suchst …“) und „Schon dabei: …“, in Web und App aus `offenesSpielText` in `@tcm/core`. | `fb5ee2a` (#16) |
| Die Glocke zeigte eine Zahl, die Liste war leer. | Admins sahen über RLS die ungelesenen Mitteilungen aller Mitglieder; Liste und „gelesen“ arbeiten nur mit den eigenen. Neue RPC `my_unread_notification_count`. | `c5a9950` |
| Arbeitsdienst, Gastgebühr, Pfand und Sonstiges kamen nie in einen Lastschriftlauf. | Die Oberfläche konnte nur Beiträge und Getränke ankündigen. Jetzt „Zur Ankündigung bereit“ für jede Art. | `30b0bef` |
| In der Kasse waren „Beitragslauf“ und Lastschriftlauf nicht zu unterscheiden, und die Art einer Forderung war unsichtbar. | Begriffe vermischt, keine Art-Marken. Neue Gliederung, Art-Marken, Art-Filter, Läufe nach Art. | `30b0bef` |
| Mails an Testadressen (`@example.org`, `.local`) hätten die Absenderreputation bei Resend gefährdet; 448 alte Mitteilungen warteten auf Versand. | Keine Sperre im Versand. `public.ist_testadresse` sperrt Benachrichtigungen, Einladungen und Passwort-Reset dorthin. | `72b1520` |
| Der Zeitplan für Benachrichtigungsmails wurde abgewiesen („Nicht angemeldet“). | Schlüsselumstellung bei Supabase: anderer gültiger Dienstschlüssel in der Funktionsumgebung als im Vault. Jetzt zählt die Rolle im Token. | `12f0f6c` |
| Jeder Einladungslink meldete „abgelaufen“. | Einladungen kommen im impliziten Verfahren (`#access_token`), der Browser-Client erwartete PKCE (`?code`). | `249fc0c` |
| iOS-Build 9 wurde von Apple abgelehnt (ITMS-90725, iOS 18.2 SDK). | EAS nahm für SDK 52 ein altes Image. Image fest auf Xcode 26.2 (`latest` scheitert an `fmt`). | `249fc0c` |
| „Passwort festlegen“ erschien im Menü des noch angemeldeten Kontos; ein fehlerhafter Link hätte das Passwort des falschen Kontos geändert. | Die Seite fiel auf die bestehende Sitzung zurück. Jetzt kein Rückgriff mehr, Anzeige des Kontos, Anmeldeseiten ohne Menü. | `da06083` |
| Mit einem Link für ein anderes Konto blieb die alte Sitzung bei Supabase gültig. | Die Sitzung wurde nur im Browser ersetzt. Jetzt Abmelden vor dem Wechsel, bei PKCE Beenden der alten Sitzung mit ihrem eigenen Token. | `20e5878` |
| Im selben Browser waren in zwei Tabs zwei Konten angemeldet. | Tabs teilen Cookies, zeigten aber das alte Konto weiter an. `KontoWaechter` plus BroadcastChannel melden andere Tabs ab. | `4312a37` |
| Nach der Abmeldung wegen Inaktivität stand auf der Anmeldeseite der falsche Grund. | Wettlauf zwischen Inaktivitätsprüfung und `KontoWaechter` im selben Tab. | `4312a37` |
| Deploy auf dem Server scheiterte mit „dubious ownership“. | Der Checkout gehört seit dem Server-Agenten dem Benutzer `claude`. Für root als `safe.directory` eingetragen. | Server-Konfiguration |
