# TC Muckensturm – native Android-App

Grundgerüst der nativen App (Kotlin, Jetpack Compose, Android 8.0+ / API 26, nur Telefon,
Hochformat, Deutsch). Gegenstück zu `apps/ios` (Spur N2). Die Expo-App in `apps/mobile` bleibt
unverändert, bis diese App fertig ist. Web und Supabase bleiben.

| Anmelden (helles System) | Anmelden (dunkles System) | Kein Zugang | Tabs, hell | Tabs, dunkel |
|---|---|---|---|---|
| ![Anmelden hell](docs/anmelden-hell.png) | ![Anmelden dunkel](docs/anmelden-dunkel.png) | ![Kein Zugang](docs/kein-zugang.png) | ![Tabs hell](docs/tabs-hell.png) | ![Tabs dunkel](docs/tabs-dunkel.png) |

| Anmeldefehler | Passwort vergessen | Passwort festlegen | Emulator, angemeldet |
|---|---|---|---|
| ![Anmeldefehler](docs/anmelden-fehler.png) | ![Passwort vergessen](docs/passwort-vergessen.png) | ![Passwort festlegen](docs/passwort-setzen.png) | ![Rauchtest](docs/rauchtest-angemeldet.png) |

### Home, Glocke, Neuigkeiten

| Home, hell | Home, dunkel | Leer | Fehler | Neuigkeiten | Glocke |
|---|---|---|---|---|---|
| ![Home hell](docs/home-hell.png) | ![Home dunkel](docs/home-dunkel.png) | ![Home leer](docs/home-leer.png) | ![Home Fehler](docs/home-fehler.png) | ![Neuigkeiten](docs/neuigkeiten-dunkel.png) | ![Glocke](docs/glocke-hell.png) |

Mit Beispieldaten (`HomeBildschirmfotoTest`, `Beispiele`), JETZT ist Montag, 28.09.2026, 14:00.

### Plätze

| Freie Zeiten | Freie Zeiten, dunkel | Übersicht | Übersicht, dunkel | Buchen |
|---|---|---|---|---|
| ![Freie Zeiten hell](docs/plaetze-freie-zeiten-hell.png) | ![Freie Zeiten dunkel](docs/plaetze-freie-zeiten-dunkel.png) | ![Raster hell](docs/plaetze-raster-hell.png) | ![Raster dunkel](docs/plaetze-raster-dunkel.png) | ![Buchen hell](docs/plaetze-buchen-hell.png) |

| Buchen, dunkel | Eigene Buchung | Eigene Buchung, dunkel | Mitspielen | Sperrung |
|---|---|---|---|---|
| ![Buchen dunkel](docs/plaetze-buchen-dunkel.png) | ![Eigene Buchung hell](docs/plaetze-eigene-buchung-hell.png) | ![Eigene Buchung dunkel](docs/plaetze-eigene-buchung-dunkel.png) | ![Mitspielen](docs/plaetze-mitspielen.png) | ![Sperrung](docs/plaetze-sperrung.png) |

Beispieldaten aus `PlatzAttrappe` (`PlaetzeBildschirmfotoTest`), ohne Netz. Das Buchungsblatt
erscheint in den Bildern ohne das Fenster des `ModalBottomSheet`.

### Verein

Getränke mit Korb, Veranstaltungen, Detail mit Anmeldung, Warteliste, Arbeitsdienst (`VereinBildschirmfotoTest`, Beispieldaten, JETZT ist Dienstag, 20.10.2026, 12:00):

| Getränke, hell | Getränke, dunkel | Zuletzt und Meldung | Erinnerung an den Korb |
|---|---|---|---|
| ![Getränke hell](docs/verein-getraenke-hell.png) | ![Getränke dunkel](docs/verein-getraenke-dunkel.png) | ![Zuletzt](docs/verein-getraenke-zuletzt.png) | ![Erinnerung](docs/verein-erinnerung.png) |

| Veranstaltungen, hell | Veranstaltungen, dunkel | Angemeldet, hell | Angemeldet, dunkel | Anmelden | Warteliste | Arbeitsdienst |
|---|---|---|---|---|---|---|
| ![Liste hell](docs/verein-veranstaltungen-hell.png) | ![Liste dunkel](docs/verein-veranstaltungen-dunkel.png) | ![Detail hell](docs/verein-veranstaltung-hell.png) | ![Detail dunkel](docs/verein-veranstaltung-dunkel.png) | ![Anmelden](docs/verein-veranstaltung-anmelden.png) | ![Warteliste](docs/verein-veranstaltung-warteliste.png) | ![Arbeitsdienst](docs/verein-arbeitsdienst.png) |

Die Bilder bis auf das letzte entstehen ohne Gerät (Robolectric + Roborazzi, `BildschirmfotoTest`).
Die Anmeldeseiten sind wie in iOS und Expo immer dunkel; „hell“ zeigt, dass ein helles System daran
nichts ändert. Das letzte Bild ist der Rauchtest im Emulator: Variante `lokal`, angemeldet als
`mitglied@tcm.local` gegen den lokalen Stack (vorher: `docs/rauchtest-anmelden.png`). Gebaut mit
targetSdk 36, gelaufen auf dem API-35-Emulator.

### Konto (Spur A4)

| Konto, hell | Konto, dunkel | Ganze Seite | Meine Daten | Einwilligungen | Mandat | Passwort | Kündigung |
|---|---|---|---|---|---|---|---|
| ![Konto hell](docs/konto-hell.png) | ![Konto dunkel](docs/konto-dunkel.png) | ![Ganze Seite](docs/konto-ganz-hell.png) | ![Meine Daten](docs/konto-daten-dunkel.png) | ![Einwilligungen](docs/konto-einwilligungen-hell.png) | ![Mandat](docs/konto-bank-hell.png) | ![Passwort](docs/konto-passwort-hell.png) | ![Kündigung](docs/konto-kuendigung-hell.png) |

Weitere Bilder (je hell und dunkel, mit Ladefehler, beim Laden) unter `docs/konto-*.png`, aus
`KontoBildfotoTest` mit Beispieldaten ohne Netz.

### Verwaltung (Spur A7)

| Plätze | Plätze, dunkel | Serien | Serien, dunkel | Sperren | Serie anlegen | Serie ändern | Schrift 200 % |
|---|---|---|---|---|---|---|---|
| ![Plätze hell](docs/verwaltung-plaetze-hell.png) | ![Plätze dunkel](docs/verwaltung-plaetze-dunkel.png) | ![Serien hell](docs/verwaltung-serien-hell.png) | ![Serien dunkel](docs/verwaltung-serien-dunkel.png) | ![Sperren](docs/verwaltung-sperren-dunkel.png) | ![Serie anlegen](docs/verwaltung-serie-anlegen-hell.png) | ![Serie ändern](docs/verwaltung-serie-hell.png) | ![Schrift 200 %](docs/verwaltung-plaetze-schrift-200.png) |

Beispieldaten aus `VerwaltungAttrappe` (`VerwaltungBildschirmfotoTest`), ohne Netz; weitere unter
`docs/verwaltung-*.png`.

## Voraussetzungen

Gebaut mit AGP 9.4.1 (Kotlin ist darin eingebaut, kein Plugin `org.jetbrains.kotlin.android`),
Kotlin 2.4.21, `compileSdk` 37, `targetSdk` 36 (Mindestwert von Google Play), `minSdk` 26.
Versionen stehen gepinnt in `gradle/libs.versions.toml` und sind mindestens zwei Wochen alt.

- **JDK 21** (z. B. `brew install openjdk@21`). Gradle lädt sich selbst über den Wrapper (9.8.1).
- **Android SDK** mit genau diesen Paketen (`sdkmanager`):
  `platform-tools`, `platforms;android-37.0`, `build-tools;37.0.0` (`build-tools;36.0.0` ist die
  Vorgabe von AGP 9.4, die App setzt 37.0.0), für den Emulator zusätzlich `emulator` und
  `system-images;android-35;google_apis;arm64-v8a` (AVD z. B. `tcm-pixel`).
  `gradle.properties` setzt `android.builder.sdkDownload=false`: Fehlt etwas, bricht der Build ab,
  statt still weitere Pakete zu laden.
- Für die Variante `lokal`: der lokale Supabase-Stack (`pnpm db:start` im Repo).

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=$HOME/Library/Android/sdk
```

## Bauen und testen

```bash
cd apps/android
cp lokal.properties.example lokal.properties   # einmalig, Key aus `supabase status` (Publishable)
./gradlew test lint                            # alle Tests und Lint
./gradlew :app:assembleLokalDebug              # APK für den Emulator
./gradlew :app:installLokalDebug               # auf ein laufendes Gerät/Emulator
./gradlew :app:recordRoborazziLokalDebug       # Bildschirmfotos nach docs/ neu schreiben
```

`pnpm verify` im Repo-Wurzelverzeichnis berührt `apps/android` nicht (kein Teil des
pnpm-Workspace). Eine CI für Android gibt es noch nicht.

### Rauchtest im Emulator

```bash
$ANDROID_HOME/emulator/emulator -avd tcm-pixel -no-window -no-audio -no-snapshot &
adb wait-for-device
./gradlew :app:installLokalDebug
adb shell am start -n de.tcmuckensturm.app.lokal/de.tcmuckensturm.app.HauptActivity
# E-Mail und Passwort per `adb shell input tap/text` eintragen (Seed: mitglied@tcm.local, Passwort aus supabase/seed.sql)
adb exec-out screencap -p > docs/rauchtest-angemeldet.png
adb emu kill
```

Der Emulator erreicht den lokalen Stack des Rechners unter `http://10.0.2.2:54321`. Klartext-HTTP
ist nur in der Variante `lokal` und nur für `10.0.2.2`, `127.0.0.1` und `localhost` erlaubt
(`src/lokal/res/xml/netzwerk.xml`).

## Varianten

| Variante | Supabase | Paket | Name | URL-Schema | SITE_URL |
|---|---|---|---|---|---|
| `lokal` (nur Debug) | lokaler Stack, Werte aus `lokal.properties` (gitignored, Vorlage `lokal.properties.example`) | `de.tcmuckensturm.app.lokal` | TCM Lokal | `tcmlokal` | – |
| `dev` | Dev-Projekt, Werte wie `apps/ios/Konfiguration/Dev.xcconfig` (öffentlicher Publishable Key) | `de.tcmuckensturm.app.dev` | TCM Dev | `tcmdev` | `https://dev.tennisclub-muckensturm.de` |
| `prod` | **TODO** – Werte fehlen noch, die App zeigt „Konfiguration fehlt“ | `de.tcmuckensturm.app` | TC Muckensturm | `tcm` | `https://app.tennisclub-muckensturm.de` |

- Die Werte kommen als `BuildConfig` (`SUPABASE_URL`, `SUPABASE_KEY`, `SITE_URL`, `URL_SCHEMA`) in
  `start/Umgebung.kt`. Fehlt etwas, zeigt die App den Hinweis statt abzustürzen.
- **Prod-Paket gegen das Dev-Backend** (wie `TestFlight.xcconfig` in iOS):
  `./gradlew :app:bundleProdRelease -Ptcm.prodBackend=dev`.
- **Versionsnummer:** `-Ptcm.versionCode=<n>` (Standard 1).
- **Signieren:** Debug mit dem Debug-Schlüssel von Android. Release nur, wenn ein Keystore angegeben
  ist, über Gradle-Properties oder Umgebung: `tcm.keystore`/`TCM_KEYSTORE`,
  `tcm.keystorePasswort`/`TCM_KEYSTORE_PASSWORT`, `tcm.keyAlias`/`TCM_KEY_ALIAS`,
  `tcm.keyPasswort`/`TCM_KEY_PASSWORT`. Keystores (`*.keystore`, `*.jks`) sind gitignored.
- **App Links:** `autoVerify` für `https://app.tennisclub-muckensturm.de/passwort-setzen` und
  `https://dev.tennisclub-muckensturm.de/passwort-setzen`. Die Prüfung gelingt erst, wenn das Web
  unter `/.well-known/assetlinks.json` die Fingerprints liefert (`ANDROID_APP_FINGERPRINTS`, Spur
  N3); bis dahin öffnet der Link das Web, und die App kommt über das eigene Schema an den Link.

## Aufbau

```
apps/android
├── kern/          reines Kotlin/JVM, ohne Android: portierte Logik aus @tcm/core
├── app/           die App (Compose)
│   └── src/main/kotlin/de/tcmuckensturm/app/
│       ├── start/        Umgebung, Sitzung (Weiche), StartLogik, Passwortlink, PasswortAblauf
│       ├── daten/        Supabase-Client, Sitzungsspeicher, Verschluesselung, Fehlerform, Zugangsdaten
│       ├── theme/        TcmTheme aus packages/ui/generated/Tokens.kt, Schriften, Erscheinungsbild
│       ├── navigation/   HauptTab (die Tabs), HauptTabs (ein NavHost)
│       └── bildschirme/  anmeldung, keinzugang, onboarding, home, plaetze, verein, konto, verwaltung
└── docs/          Bildschirmfotos
```

Für parallele Spuren gilt:

- **Je Tab ein Paket** unter `bildschirme/` mit einer Datei `<Tab>Graph.kt`: ein
  `@Serializable data object <Tab>Graph` (Ziel des Tabs), ein Startziel und
  `NavGraphBuilder.<tab>Graph(nav)`. Weitere Ziele eines Tabs kommen in dessen Paket und Graph.
  `navigation/HauptTabs.kt` bindet die Graphen ein und muss dafür nicht angefasst werden.
- **Datenzugriff je Bereich in einer eigenen Datei** unter `daten/` (wie `Zugangsdaten.kt`):
  `Platzdaten.kt`, `Startdaten.kt`, `Vereinsdaten.kt`, `Kontodaten.kt` … Nur RPCs aus
  `docs/native/app-api.md`, Fehlertexte über `translateDbError` bzw. `Meldung`.
- **Kernlogik** nach `kern/` (Paket `de.tcmuckensturm.kern`), je Thema eine Datei, geprüft gegen die
  Golden Files.
- Sprung in einen anderen Tab: `LocalZuTab.current(HauptTab.VEREIN)`. Sitzung und Client:
  `LocalSitzung.current`.
- Ein Modul `:widgets` (Glance) folgt in der Widget-Spur; es liest dieselbe Sitzung
  (`Sitzungsspeicher.fuer(context)`).

## Was schon da ist

- **Start-Logik** (`start/StartLogik.kt`, wie `StartLogik.swift`): ohne Sitzung „Anmelden“, sonst
  `mein_zugang`: kein Zugang (`zugangsGrund`) → „Kein Zugang“ (meldet ab), Onboarding offen →
  Platzhalter, sonst Tabs Home, Plätze, Verein, Konto und „Verwaltung“ bei Platzrechten
  (`ich().roles`). Die Weiche (`start/Sitzung.kt`) folgt `sessionStatus` von supabase-kt.
- **Sitzung** (`daten/Sitzungsspeicher.kt`): als JSON, AES-256-GCM-verschlüsselt mit einem Schlüssel
  im Android Keystore (Alias `tcm-sitzung`), abgelegt in einem DataStore. Kein
  `EncryptedSharedPreferences` (abgekündigt). Was nicht entschlüsselt werden kann (neuer Schlüssel
  nach Neuinstallation, Sicherung), gilt als abgemeldet und wird gelöscht. Keine Cloud-Sicherung
  (`allowBackup=false`).
- **Anmelden, Passwort vergessen, Passwort festlegen** wie in iOS, Texte wortgleich mit der
  Expo-App: Autofill über `ContentType` (Benutzername/E-Mail, Passwort, neues Passwort), Fehler über
  `kern/Anmeldefehler.kt`, Link-Auswertung `start/Passwortlink.kt` (`token_hash` + `type`,
  übergangsweise Sitzung im Fragment, Fehler im Link), Rückfrage, wenn schon ein anderes Konto
  angemeldet ist, 15 s Frist beim Einlösen. Der Client nutzt `FlowType.IMPLICIT` wie supabase-js.
- **Kein Zugang** wie iOS (`kern/Zugang.kt`).
- **Abmelden** zentral in `Sitzung.abmelden()` (global, ohne Netz nur lokal).
- **Theme:** Farben, Abstände, Radien und Schrift aus `packages/ui/generated/Tokens.kt` (als
  Quellverzeichnis eingebunden, nicht kopiert), Hell/Dunkel/System in einem DataStore
  (`erscheinungsbild`), Barlow und Barlow Semi Condensed unter `res/font` (Lizenz:
  `assets/lizenzen/OFL-Barlow.txt`).
- **Home** (`bildschirme/home`, `bildschirme/nachrichten`, `daten/Startdaten.kt`) wie iOS: Kopf mit
  Name, Glocke (Zähler, Blatt, gelesen markieren) und Avatar, „Als Nächstes“, Schnellaktionen,
  „Jetzt frei“ mit Zeitleiste, offene Spiele, „Dein Stand“ (Getränke, Arbeitsdienst), Neuigkeiten
  der letzten 7 Tage, Bildschirm „Neuigkeiten“, Herunterziehen zum Aktualisieren. Jeder Abschnitt
  lädt für sich (`Abschnitt`), Texte als reine Funktionen in `HomeLogik`. „Demnächst im Verein“
  fehlt noch; Getränke, Veranstaltungen und Einträge der Glocke führen über `LocalZuVerein` direkt
  zum Ziel im Tab Verein.
- **Plätze** (`bildschirme/plaetze`, `daten/Platzdaten.kt`, wie iOS): Tagwahl über `lead_days`,
  Ansichten „Freie Zeiten“ und „Übersicht“ (Raster Plätze × Zeit, gemerkt), belegt/frei/eigene/
  Sperre, Pull-to-refresh, Realtime-Kanal `plan-<datum>` auf `bookings` (höchstens ein Nachladen je
  Sekunde) und Nachladen beim Zurückkommen in den Vordergrund. Buchungsblatt mit Art, Mitspielern
  (Mitgliedersuche), Gästen, „Mitspieler gesucht“ und Kontingent; eigene Buchung (Mitspieler ändern,
  stornieren mit Grund, Mitspielersuche, Serientermin absagen), Mitspielen; mit Platzrechten Sperren
  und Umsetzen mit Rückfrage vor dem Verdrängen. Reine Ansichtslogik in `PlaetzeLogik.kt`.
- **Kern** (`kern/`): Zeit (`berlinTime`, `dayTag`, `minutesOf`, `timeToMinutes`, `minutesToTime`,
  `dayLabel` …), Startseite (`upcomingBookings`, `bookingKicker`, `relativeTimeLabel`,
  `groupNotifications`, `occupancyKind`, Zeitleiste …), Belegung (`canStartAt`, `freeCourtsNow`),
  Platzplan (`freeSlotsOfDay`, `freeGaps`, `bookingActions`, `checkPlayers`, `umsetzZiele` …),
  offene Spiele, `Geld.formatCents`,
  `translateDbError`, Anmeldefehler, `zugangsGrund`, `sichererWeiterPfad`, für das Konto
  `memberProfileSchema` (`Profil.kt`), Kündigung (`Kontoloeschung.kt`), `CHARGE_KIND_LABEL` und
  `merkmalBeschreibung` (`Merkmaltexte.kt`), `Zahlen.deutsch`.
- **Konto** (`bildschirme/konto/`, wie `Bildschirme/Konto/` in iOS): Profilkopf, Abrechnung
  (`my_charges` plus laufende Getränke, zurückgebuchte Lastschriften), Arbeitsdienst, Einstellungen
  als Bottom Sheets: Meine Daten und Notfallkontakt (geprüft mit `kern/Profil.kt`, dann
  `save_my_profile` nur mit geänderten Feldern bzw. `save_my_notfallkontakt`), Einwilligungen
  (`member_attributes`, nur selbst pflegbare), Bankverbindung & Mandat (nur lesen, IBAN nur mit den
  letzten vier Stellen), Passwort ändern (`Sitzung.passwortSpeichern(imKonto = true)`: ohne Sitzung
  „neu anmelden“ statt „Link abgelaufen“), Mitgliedschaft kündigen beantragen
  (`kern/Kontoloeschung.kt`). Erscheinungsbild System/Hell/Dunkel wirkt sofort und bleibt
  gespeichert. Abmelden mit Rückfrage über `Sitzung.abmelden()`. Gespeichert meldet eine Snackbar.
  Datenzugriff nur über RPCs (`daten/Kontodaten.kt`, Getränke und Arbeitsdienst aus
  `daten/Startdaten.kt`). Stunden stehen deutsch mit Komma (`kern/Zahlen.kt`: „6,5 / 10 h“). Der
  Inhalt liegt im `KontoModell` (ViewModel) und lädt beim Zurückkehren in den Tab still nach. Der Push-Schalter ist eine gesperrte Platzhalterzeile (`TODO` für die
  Push-Spur), oben rechts die Glocke aus `bildschirme/nachrichten`.
- **Verwaltung** (`bildschirme/verwaltung/`, `daten/Verwaltungsdaten.kt`, wie
  `Bildschirme/Verwaltung/` in iOS): Tab nur mit Platzrechten oder Admin (`ich()`), Segmente
  „Plätze“ und „Serien“ (klebt beim Rollen). Plätze zum Lesen mit dem Zustand von jetzt (frei,
  gesperrt bis …, Serie bis …, stillgelegt; aus `court_overview` und `day_schedule`); eine
  Sperrung führt in den Tab Plätze. Blätter: Plätze sperren (`create_blocking`, zweistufig mit
  Rückfrage vor dem Verdrängen), Serie anlegen (`preview_series` als Vorschau, dann
  `create_series`), Serie ändern (`update_series`, zweistufig) oder beenden (`end_series`, mit
  Rückfrage). Die Meldung steht danach unter dem gelben Knopf. Unten der Weg ins Web (Admins
  `SITE_URL/admin`, Platzwart `SITE_URL/admin/plaetze`) als Custom Tab (`androidx.browser`),
  ohne Webadresse (lokal) nur der Satz. Uhrzeit und Datum werden getippt (HH:MM, TT.MM.JJJJ) wie
  in iOS und Expo; reine Logik in `VerwaltungLogik.kt`.

### Tab Verein (`bildschirme/verein`, wie `Bildschirme/Verein` in iOS)

- **Reiter** Getränke und Veranstaltungen unter dem Kopf mit Segmenten, gemerkt unter
  `tcm-verein-reiter` (SharedPreferences), beim ersten Mal Getränke. Darüber eine Veranstaltung im
  Detail (`VeranstaltungZiel`), Zurück-Pfeil und -Geste über den NavHost.
- **Getränke:** laufender Monat (`sumOpenDrinks`), Karte als Kacheln mit Zähler, Korb erst mit
  „Eintragen“ gebucht (je Artikel `record_drink_purchase`, nacheinander), Rückmeldung als Snackbar
  (`drinkBatchReport`), Fehlgeschlagenes bleibt im Korb. „Zuletzt“ mit Zurücknehmen im Stornofenster
  (`drink_void_window_minutes`, Takt alle 30 s).
- **Korb** in `VereinZustand`, gehalten von `VereinTab` in `HauptTabs`: übersteht Reiter- und
  Tab-Wechsel, ist mit dem Abmelden weg. Wer die Getränke mit vollem Korb verlässt, bekommt die
  Rückfrage „Noch nicht eingetragen“ mit dem Weg zurück.
- **Veranstaltungen** nach Monat, Vergangenes umschaltbar; **Detail** mit Eckdaten, Belegung als
  Zahl, Anmelden mit Begleitpersonen und Bemerkung, Ändern, Abmelden mit Rückfrage, Warteliste mit
  Platz, eigene Forderung aus `meine_forderung_*`.
- **Sprung von außen:** `LocalZuVerein.current(VereinZiel.Veranstaltung(id))` (auch `Getraenke`,
  `Veranstaltungen`) wechselt den Tab und öffnet das Ziel. `EventKarte` (mit `aufforderung`) ist für
  Home gedacht.
- Laden und Schreiben: `daten/Vereinsdaten.kt` (eigene Getränke und Name über `Startdaten`), Kern:
  `kern/Veranstaltungen.kt`, `Getraenke.kt`, Forderungsarten aus `Merkmaltexte.kt` (Konto).
  Kopf, Karte, Leerzustand und Fehlerzeile aus `bildschirme/Bausteine.kt`, die Glocke aus `nachrichten`.

## Tests

- `:kern` (JUnit 5): ein generischer Lader für `packages/core/golden/*.json` (als Testressource
  eingebunden) prüft jede Datei auf Lesbarkeit und jeden Fall der portierten Funktionen
  (`KernGoldenTest`, `StartseiteGoldenTest`, `KontoGoldenTest`, für den Verein `VereinGoldenTest`: alle `event*`,
  `basket*`, `changeBasket`, `canVoidSelf`, `drinkBatchReport`, `formatCents`), dazu `StartseiteTest`,
  `AnmeldefehlerTest` mit den Fällen aus `anmeldefehler.test.ts`, `ProfilTest` (Fälle aus `schemas.test.ts` und
  `kontoloeschung.test.ts`) und `ZahlenTest`.
- `:app` (JUnit 4, Robolectric, nur Variante `lokalDebug`): `StartLogikTest`, `PasswortlinkTest`
  (Fälle aus `apps/mobile/src/lib/passwortlink.test.ts`), `PasswortAblaufTest`, `UmgebungTest`,
  `SitzungsspeicherTest` (Verschlüsselung, Unlesbares, Löschen), `FehlerformTest`, `StartdatenTest`, `HomeLogikTest`, `ThemeTest`
  (Schriften, Farbschema) `BildschirmfotoTest`, `HomeBildschirmfotoTest`, für das Konto
  `KontoLogikTest` (Fälle aus `KontoTests.swift`), `ErscheinungsbildSpeicherTest` und `KontoBildfotoTest`, für Plätze
  `PlaetzeLogikTest`, `PlaetzeModellTest` (gegen `PlatzAttrappe`, inkl. Drossel) und
  `PlaetzeBildschirmfotoTest`, für den Verein `VereinLogikTest` (Texte, Decoding, Korb und Erinnerung)
  und `VereinBildschirmfotoTest`, für die Verwaltung `VerwaltungLogikTest` (Fälle aus
  `VerwaltungTests.swift`), `VerwaltungModellTest` (gegen `VerwaltungAttrappe`) und
  `VerwaltungBildschirmfotoTest` (inkl. Sprung in den Tab Plätze und Web-Link je nach Rechten).
- Der Android Keystore fehlt in Robolectric. Die Tests des Sitzungsspeichers nehmen deshalb einen
  Software-Schlüssel; der echte Keystore läuft im Emulator-Rauchtest.

## Was fehlt

- Screens: Onboarding, Widget (`:widgets`).
- Konto: Push-Schalter „Mitteilungen aufs Handy“ (Push-Spur).
- Home: „Demnächst im Verein“ (die Karte gibt es schon: `EventKarte(e, jetzt, aufforderung = true)`).
- Push (FCM): Anmeldung des Tokens und Abmeldung beim Abmelden (`TODO` in `Sitzung.abmelden()`).
- Prod-Werte (Supabase-URL und -Key), Release-Keystore, Fingerprints in `assetlinks.json`.
- R8/Minify ist für Release noch aus (Regeln für supabase-kt/Ktor/Serialization fehlen).
- CI für Android.
- Emulator-Image für API 36/37: Der Rauchtest läuft auf API 35, das Verhalten unter targetSdk 36
  auf einem Android-16-Gerät ist noch nicht geprüft.
