# Native Apps: Umzug von Expo auf Swift und Kotlin

Stand: 30.10.2026 · Status: **iOS und Android funktional fertig, Test auf Dev läuft**

- **iOS** (`apps/ios`): alle Screens aus C, Widgets, Push-Anmeldung. Build 0.3.0 (17) liegt in TestFlight (Prod-Bundle gegen das Dev-Backend), hochgeladen mit `apps/ios/scripts/testflight.sh`.
- **Android** (`apps/android`): alle Screens aus C, Glance-Widgets, Push über FCM (ohne Firebase-Werte ausgeschaltet). compileSdk 37, targetSdk 36 (Pflicht bei Google Play), minSdk 26. Noch nicht veröffentlicht: Play Console und Release-Keystore fehlen.

## Kontext
Die Mitglieder-App ist heute eine Expo-App (React Native) in `apps/mobile`. Sie läuft auf iOS über TestFlight, Android ist nie veröffentlicht worden. Web (`apps/web`) und Supabase bleiben, wie sie sind. Nur die App wird neu gebaut, und zwar nativ, eine je Plattform.

**Entschieden (29.10.2026):**
- **iOS:** Swift und SwiftUI, ab **iOS 17**.
- **Android:** Kotlin und Jetpack Compose, ab **API 26** (Android 8.0).
- **Warum:** vor allem **Widgets** (nächste Buchung, freie Plätze jetzt). Die gibt es nur nativ: WidgetKit bzw. Glance. Dazu kommen Systemfunktionen ohne Brücke (Keychain mit App Group, Live Activities, App Intents), weniger Abhängigkeiten von Expo-Versionen und ein Verhalten, das sich wie das System anfühlt.
- **Die Expo-App bleibt bis zum Umstieg**, unverändert und weiter lieferbar. Es gibt keinen Parallelbetrieb mit zwei Apps im Store.
- **Keine Bestandsnutzer:** iOS nur TestFlight, Android nie veröffentlicht. Es gibt also keine Migration von Daten auf Geräten. Wer die neue App installiert, meldet sich einmal neu an.
- **Umstieg über dieselbe Bundle-ID** `de.tcmuckensturm.app` (iOS) bzw. dasselbe Package (Android). Der erste native Build bekommt eine **Buildnummer größer als 16**, damit TestFlight ihn als Nachfolger der Expo-Builds annimmt. Die Dev-App bleibt wie in [`goLive.md`](goLive.md) (Schritt 5) geplant: „TCM Dev“, `de.tcmuckensturm.app.dev`.

**Grundsatz:** Die Regeln bleiben in der Datenbank. Die Apps zeigen an und rufen RPCs auf. Was sie selbst rechnen (Zeitraster, Knöpfe einer Buchung, Texte), ist aus `@tcm/core` portiert und gegen dieselben Golden Files geprüft wie die TypeScript-Fassung.

## Unterlagen

- [`native/app-api.md`](native/app-api.md): Was die App mit Supabase spricht, also 51 RPCs, 9 Tabellenzugriffe, Realtime und Auth, mit Parametern und den Fehlertexten, die die App behandelt. Maschinenlesbar in [`native/app-api.json`](native/app-api.json), erzeugt aus `packages/core/src/database.types.ts`.
- [`packages/core/golden/`](../packages/core/golden/README.md): Golden Files für die Rechenlogik aus `@tcm/core`, mit Anleitung für XCTest und JUnit.
- `packages/ui/generated/Tokens.swift` und `Tokens.kt`: Farben (hell, dunkel, System), Abstände, Radien, Schatten und Schrift aus `packages/ui/src/tokens.ts`. Neu erzeugen mit `pnpm --filter @tcm/ui build:native`. Ein Test prüft, dass die eingecheckten Dateien aktuell sind.
- Design: `docs/design/clubhaus/` (wie für die Expo-App).

## Spuren

Die Arbeit läuft in parallelen Branches mit getrennten Bereichen:

| Spur | Branch | Bereich |
|---|---|---|
| N1 Grundlagen | `chore/native-grundlagen` | dieser Fahrplan, API-Vertrag, Golden Files, Token-Generator. Kein App-Code. |
| N2 iOS-Gerüst | `feature/ios-geruest` | `apps/ios`: Projekt, Fundament (Phase B iOS) |
| N3 Universal Links | `feature/universal-links` | `apps/web` `.well-known` (`apple-app-site-association`, `assetlinks.json`), Teil von Phase A |
| A1 Android-Gerüst | `feature/android-geruest` | `apps/android`: Gradle-Projekt (`:app`, `:kern`), Fundament (Phase B Android), Anmeldung und Kein Zugang, Tabs als Platzhalter. Einzelheiten in [`apps/android/README.md`](../apps/android/README.md). |
| N6 Backend-RPCs | `feature/app-rpcs` | `supabase/migrations`, Tests und API-Vertrag: Ersatz der Tabellenzugriffe, Push-Anbieter (Phase A). Einzige Spur mit Migrationen. |

Danach je Tab eine Spur, iOS als N4–N13 (bis PR #108), Android als A2–A9 (PRs #111–#118: Home, Konto, Verein, Plätze, Onboarding und Push, Verwaltung, Widgets, Aufräumrunde). Migrationen gibt es dabei immer nur in **einer** Spur gleichzeitig (siehe `CONTRIBUTING.md`, „Parallel arbeiten“).

## Phasen

### A. Backend vorbereiten
Damit beide Apps gegen einen schmalen, stabilen Vertrag bauen, nicht gegen Tabellen.

- **API-Vertrag festhalten:** `docs/native/app-api.md` und `app-api.json`. *Erledigt mit N1.* Der Test in `packages/core` schlägt an, sobald die Expo-App eine neue RPC aufruft oder das Schema sich ändert und die JSON nicht neu erzeugt ist.
- **Tabellenzugriffe durch RPCs/Views ersetzen:** Die 9 direkten Zugriffe (`courts`, `booking_types`, `members` mit zwei `update`, `member_roles`, `memberships`, `sepa_mandates`, `charges`, `settings`, `push_tokens`) bekommen RPCs bzw. Views. *Erledigt mit N6* (Branch `feature/app-rpcs`): `ich()`, `mein_profil()`, `save_my_profile(…)`, `save_my_notfallkontakt(…)`, `mein_mandat()`, `courts_aktiv()`, `booking_types_aktiv(…)`, `drink_void_window_minutes()`, `push_token_aktiv(…)` und die eigene Forderung in `events_fuer_mitglied`, beschrieben in `app-api.md` unter „Neu für die nativen Apps“. Alles **abwärtskompatibel**: Die Expo-App liest bis zum Umstieg weiter direkt, die Tabellen-Grants bleiben bis zum Aufräumen danach.
- **Rechenlogik:** Was die App selbst rechnet, kommt entweder auf den Server (als Feld in einer RPC, etwa die Knöpfe einer Buchung) oder wird portiert und mit den **Golden Files** geprüft. Faustregel: Portieren, was offline oder im Widget gebraucht wird (Zeit, Raster, freie Plätze jetzt, Texte), auf den Server, was ohnehin eine Abfrage braucht. Ändert sich eine Golden-Datei im Diff, ziehen Swift und Kotlin nach.
- **Push direkt über APNs und FCM** statt über den Expo-Push-Dienst:
  - Spalte `provider` in `push_tokens` (`expo`, `apns`, `fcm`, Standard `expo`), `register_push_token` bekommt `p_provider` mit Standard `expo`. Die Expo-App funktioniert also unverändert weiter. *Erledigt mit N6*, dazu liefert `claim_notification_pushes` je Empfänger `geraete` mit Marke und Anbieter. `tokens` enthält bis zum Umbau der Function nur Expo-Marken.
  - Die Edge Function `notification-pushes` verschickt je nach `provider`: Expo-Tokens weiter über `exp.host`, APNs per HTTP/2 mit JWT aus dem `.p8`-Schlüssel, FCM über die HTTP-v1-API mit Dienstkonto. Ungültige Tokens werden wie heute über `disabled_at` abgeschaltet. *Erledigt mit N7*, Einzelheiten unter [Push](#push).
  - **Übergang:** Solange Expo-Tokens aktiv sind, bleibt der Expo-Zweig. Nach dem Umstieg laufen sie aus (deinstalliert oder überschrieben). Den Zweig entfernen, wenn 30 Tage lang kein Expo-Token mehr `last_seen_at` erneuert hat.
- **Universal Links und App Links statt `tcm://`:** Passwort- und Einladungslinks (`/passwort-setzen?token_hash=…`) und Push-Ziele öffnen die App über `https://app.tennisclub-muckensturm.de/…` (Dev: `dev.…`). Dazu kommen `apple-app-site-association` und `assetlinks.json` (Spur N3) und neue Redirect-URLs in Supabase Auth (`goLive.md`, Schritt 1 und 2). `tcm://` bleibt für die Expo-App erlaubt, bis sie entfernt ist.

### B. Fundament je Plattform

**iOS** (`apps/ios`):
- Swift 6 (strikte Nebenläufigkeit), SwiftUI, Observation (`@Observable`), keine Drittanbieter-Architektur.
- Projekt mit **XcodeGen** (`project.yml` im Repo, `.xcodeproj` nicht eingecheckt), damit Merges nicht an der Projektdatei scheitern.
- **supabase-swift** für Auth, PostgREST-RPCs und Realtime.
- Sitzung in der **Keychain mit App Group**, damit Widgets dieselbe Anmeldung lesen.
- Tokens aus `packages/ui/generated/Tokens.swift`, Schrift Barlow und Barlow Semi Condensed als gebündelte Dateien (OFL).
- Ziele: App, Widget-Erweiterung, Unit-Tests (Logik gegen Golden Files), UI-Tests.

**Android** (`apps/android`):
- Kotlin, Jetpack Compose, ViewModel mit `StateFlow`, Navigation Compose.
- Gradle mit **Kotlin DSL** und **Version Catalog** (`gradle/libs.versions.toml`).
- **supabase-kt** (Auth, Postgrest, Realtime), Ktor-Client.
- Sitzung verschlüsselt mit einem Schlüssel aus dem **Android Keystore**.
- Tokens aus `packages/ui/generated/Tokens.kt` (Paket `de.tcmuckensturm.app.ui.tokens`), Schriften unter `res/font`.
- Module: `app`, Logik (reines Kotlin, testbar ohne Gerät, Golden Files als Testressourcen), Widget (Glance).

### C. Screens
In dieser Reihenfolge, jeweils iOS und Android, und jeder Schritt ist für sich testbar:

1. **Anmeldung und Onboarding:** Anmelden, Passwort vergessen und setzen (über Universal Link), Kein Zugang, der Onboarding-Assistent mit allen Schritten.
2. **Plätze:** Belegungsplan mit Realtime, freie Zeiten, Buchen, Mitspieler, Stornieren, offene Spiele.
3. **Home:** nächste Termine, freie Plätze jetzt, Neuigkeiten, Glocke, Arbeitsdienst.
4. **Verein:** Getränke mit Korb, Veranstaltungen mit An- und Abmeldung, Nachrichten.
5. **Konto:** Stammdaten, Notfallkontakt, Merkmale, Forderungen, Mandat, Mitgliedschaft, Push an/aus, Konto löschen beantragen, Abmelden.
6. **Verwaltung** (Platzrechte): Sperren, Serien, Umsetzen.

Maßstab ist die Expo-App: gleiche Texte, gleiche Regeln, gleiche Fehlermeldungen (`app-api.md`).

### D. Widgets
- **Nächste Buchung:** Platz, Uhrzeit, Mitspieler, „Heute · in 2 Stunden“ (`bookingKicker`, `dayLabel`). Daten aus `my_bookings`.
- **Freie Plätze jetzt:** welche Plätze ab der nächsten Startzeit frei sind und bis wann (`freeCourtsNow` aus `day_schedule` und `booking_settings`).
- Beide lesen die Sitzung aus der App Group bzw. dem gemeinsamen Speicher und laden im Zeitplan (WidgetKit-Timeline bzw. Glance mit WorkManager), nicht per Realtime. Ein Tippen öffnet den passenden Bildschirm über einen Universal Link.

### E. Tests, Release, Umstieg
- **Tests:** XCTest und XCUITest bzw. JUnit und Compose-UI-Tests, gegen den **lokalen Stack** (`pnpm db:start`), nie gegen Dev oder Prod. Der iOS-Simulator erreicht ihn unter `localhost`, der Android-Emulator unter `10.0.2.2`. Testkonten wie bei E2E aus `supabase/seed.sql`. Golden Files laufen ohne Stack.
- **Release iOS:** Fastlane (`match`, `pilot`) oder direkt die App-Store-Connect-API. Kein EAS mehr. Die Buildnummer setzt die Pipeline (> 16).
- **Release Android:** Gradle Play Publisher in den internen Test-Track, später Produktion.
- **Umstieg:** Erst wenn beide Apps alle Screens aus C können und die Tester sie auf Dev abgenommen haben. Dann den ersten nativen Build unter `de.tcmuckensturm.app` an TestFlight bzw. den Play-Track geben.
- **Aufräumen danach:** `apps/mobile` entfernen, den Expo-Zweig in `notification-pushes` und die Spalte `provider = 'expo'` auslaufen lassen, `tcm://` aus den Redirect-URLs streichen, die direkten Tabellen-Grants der Phase A zurücknehmen. Jedes davon ist ein eigener PR, die Migrationen wieder abwärtskompatibel.

## Push
`supabase/functions/notification-pushes` teilt die Empfänger nach `geraete` (aus `claim_notification_pushes`) auf. Fehlt `geraete`, gehen die `tokens` wie bisher an Expo.

| Anbieter | Weg | Gerät stilllegen bei |
|---|---|---|
| `expo` | `exp.host`, Stapel zu 100, unverändert | `DeviceNotRegistered` |
| `apns` | `api.push.apple.com` (bzw. `api.sandbox.…`), HTTP/2, `apns-push-type: alert`, `apns-topic` = Bundle-ID. ES256-JWT aus dem `.p8`-Schlüssel, 50 Minuten zwischengespeichert. | 410, 400 `BadDeviceToken` |
| `fcm` | `fcm.googleapis.com/v1/projects/<id>/messages:send`. OAuth2-Zugriffstoken aus dem Dienstkonto (RS256-JWT gegen `oauth2.googleapis.com/token`), bis 5 Minuten vor Ablauf zwischengespeichert. | 404, `UNREGISTERED`, `INVALID_ARGUMENT` am Feld `message.token` |

- **Inhalt:** Titel und Text aus `pushvorlage.ts` wie bei Expo, Badge = Zahl der Posten. Bei APNs und FCM kommen als Daten `ziel` (Pfad wie in der Expo-App), `kind` (wenn alle Posten dieselbe Art haben) und `event_id` (wenn es um genau eine Veranstaltung geht) mit. Bei APNs stehen sie neben `aps` auf oberster Ebene, bei FCM in `data`.
- **Fehler:** APNs und FCM gehen je Gerät, bis zu 20 gleichzeitig. Netzfehler, 5xx, 429 und abgelehnte Anmeldung (APNs 403, FCM 401) gelten als vorübergehend. Dann gibt die Function die Benachrichtigung wieder frei, aber nur, wenn sie auf keinem anderen Gerät des Mitglieds angekommen ist, und antwortet mit 502. Andere 4xx (etwa `DeviceTokenNotForTopic`, das auch bei falscher Bundle-ID kommt) werden geloggt, ohne Stilllegen und ohne Freigabe.
- **Konfiguration** (Edge-Secrets, `supabase secrets set`, Namen auch in `.env.example`). Fehlt etwas, werden die Geräte dieses Anbieters übersprungen und nur gezählt geloggt (ohne Marken), Expo läuft weiter. `PUSH_AKTIV=true` gilt für alle drei Wege.

| Variable | Inhalt |
|---|---|
| `APNS_KEY_ID` | Key-ID des APNs-Schlüssels (10 Zeichen) |
| `APNS_TEAM_ID` | `93Z2KKGMV7` |
| `APNS_PRIVATE_KEY` | Inhalt der `.p8`-Datei (Zeilenumbrüche echt oder als `\n`) |
| `APNS_BUNDLE_ID` | `de.tcmuckensturm.app` |
| `APNS_UMGEBUNG` | `production` (Standard) oder `sandbox`. Marken aus Xcode-Debug-Builds gelten nur in der Sandbox; eine Marke aus der falschen Umgebung beantwortet Apple mit `BadDeviceToken`, und sie wird stillgelegt. Dev mit TestFlight-Builds: `production`. |
| `FCM_SERVICE_ACCOUNT` | JSON-Datei des Firebase-Dienstkontos (braucht `project_id`, `client_email`, `private_key`) |

- **Was der Verein noch besorgen muss:** im Apple-Developer-Konto unter *Certificates, Identifiers & Profiles → Keys* einen Schlüssel mit „Apple Push Notifications service (APNs)“ anlegen, die `.p8`-Datei laden (geht nur einmal) und die Key-ID notieren; die App-ID `de.tcmuckensturm.app` braucht die Fähigkeit Push Notifications. Für Android ein Firebase-Projekt mit der Android-App `de.tcmuckensturm.app` anlegen, die Cloud Messaging API (V1) ist dort an, und unter *Projekteinstellungen → Dienstkonten* einen privaten Schlüssel als JSON erzeugen. Beides gehört in den Passwortmanager und als Secret in Dev und Prod.
- **HTTP/2:** APNs spricht nur HTTP/2. Das `fetch` von Deno handelt es per ALPN aus; am 29.10.2026 mit Deno 2.9.6 gegen beide APNs-Rechner geprüft (Antwort 403 `MissingProviderToken` mit `apns-id`). Die Edge Runtime nutzt dasselbe `fetch` von Deno. Gegen die Edge Runtime selbst ist es erst mit echtem Schlüssel auf Dev nachzuweisen.

## Offene Voraussetzungen
Alles hier entscheidest du selbst. Ohne diese Punkte bleiben die betroffenen Teile liegen.

| Was | Wofür | Stand |
|---|---|---|
| **Android-SDK lokal** (Android Studio oder Command-line Tools, Emulator-Image API 34+) | Phase B Android, Tests | installiert am 30.10.2026: Command-line Tools, Plattformen 35 und 37, Build-Tools 35–37, Emulator mit Image API 35 (AVD `tcm-pixel`), JDK 21 |
| **Plattenplatz** | Xcode-Simulatoren, Android-SDK und Emulator, Gradle-Cache brauchen zusammen leicht 30–50 GB | knapp (am 30.10.2026 rund 20–25 GB frei) |
| **Google Play Console** (einmalig 25 $) und **Firebase-Projekt** (FCM) mit Dienstkonto-Schlüssel | Android-Release, Push auf Android (`FCM_SERVICE_ACCOUNT`, siehe [Push](#push)) | nicht angelegt |
| **Eigener APNs-Schlüssel (.p8)** im Apple-Developer-Konto des Vereins, mit Key-ID und Team-ID als Edge-Secret | Push direkt über APNs (Phase A). Heute verwaltet EAS den Push-Schlüssel. Die Function ist bereit (N7), es fehlen nur die Secrets, siehe [Push](#push). | offen |
| **macOS-Runner in CI** (GitHub Actions) | iOS-Build und -Tests in der CI. Für das öffentliche Repo sind die Standard-Runner frei, größere macOS-Runner kosten extra, und die Jobs laufen lange. Alternative: nur lokal testen und per Fastlane hochladen. | offen, Kosten und Laufzeit abwägen |

## Kritische Dateien
- `packages/core/src/*.ts`: Logik, die portiert wird. Jede Änderung zieht die Golden Files nach (`pnpm --filter @tcm/core build:golden`).
- `packages/core/src/database.types.ts`: Grundlage für `app-api.json` (`pnpm db:types`, danach `build:app-api`).
- `packages/ui/src/tokens.ts`: Quelle für CSS, Swift und Kotlin.
- `supabase/functions/notification-pushes/`: Push-Versand (Phase A).
- `apps/mobile/app.json`, `apps/mobile/eas.json`: Bundle-ID und Buildnummern bis zum Umstieg.
