# TC Muckensturm – native iOS-App

Grundgerüst der nativen App (Swift 6, SwiftUI, iOS 17+, nur iPhone, Hochformat, Deutsch).
Die Expo-App in `apps/mobile` bleibt unverändert, bis diese App fertig ist. Web und Supabase bleiben.

![Anmeldung](docs/anmelden.png)

## Voraussetzungen

- Xcode 26 (getestet mit 26.3, Simulator-Runtime iOS 26.3)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`
- Für die Konfiguration „Lokal“: der lokale Supabase-Stack (`pnpm db:start` im Repo)

Ist Xcode nicht per `xcode-select` aktiv, vor jeden Xcode-Befehl
`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` setzen (unten immer mit angegeben).

## Projekt erzeugen

`project.yml` ist die Quelle. Das `.xcodeproj` wird erzeugt und nicht eingecheckt:

```bash
cd apps/ios
scripts/lokal-konfigurieren.sh   # einmalig: Konfiguration/Lokal.geheim.xcconfig anlegen
xcodegen generate
open TCMuckensturm.xcodeproj     # optional
```

Nach jeder Änderung an `project.yml` oder an neuen/gelöschten Dateien erneut `xcodegen generate`.

## Bauen und testen

```bash
cd apps/ios
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcrun simctl list devices available          # ein iPhone auswählen

# Tests (Konfiguration Lokal)
xcodebuild test -project TCMuckensturm.xcodeproj -scheme TCMuckensturm \
  -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath build/DerivedData

# Dev-Build für den Simulator, installieren und starten
xcodebuild build -project TCMuckensturm.xcodeproj -scheme "TCMuckensturm Dev" -configuration Dev \
  -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath build/DerivedData
xcrun simctl boot "iPhone 17"
xcrun simctl install booted build/DerivedData/Build/Products/Dev-iphonesimulator/TCMuckensturm.app
xcrun simctl launch booted de.tcmuckensturm.app.dev
xcrun simctl io booted screenshot docs/anmelden.png
```

Die Tests laufen in der App als Host. Sie decken ab: `Umgebung` (Info.plist-Werte), den
Schlüsselbund-Speicher gegen den echten Simulator-Schlüsselbund (eigener Test-Dienst, auch mit
App Group), die Zuordnung der Anmeldefehler (dieselben Fälle wie
`packages/core/src/anmeldefehler.test.ts`), die Start-Logik als reine Funktion sowie das Lesen der
Token-Farben und das Laden der Schriften.

`pnpm verify` im Repo-Wurzelverzeichnis berührt `apps/ios` nicht. Eine CI für iOS gibt es noch
nicht (braucht einen macOS-Runner).

## Konfigurationen

| Konfiguration | Supabase | Bundle-ID | Name auf dem Home-Bildschirm |
|---|---|---|---|
| `Lokal` | lokaler Stack (`127.0.0.1:54321`), Werte aus `Konfiguration/Lokal.geheim.xcconfig` (gitignored) | `de.tcmuckensturm.app.lokal` | TCM Lokal |
| `Dev` | Dev-Projekt, Werte aus `apps/mobile/eas.json` (öffentlicher Publishable Key) | `de.tcmuckensturm.app.dev` | TCM Dev |
| `Prod` | **TODO** – Werte fehlen noch, der Build zeigt den Hinweis „Konfiguration fehlt“ | `de.tcmuckensturm.app` | TC Muckensturm |

- Werte stehen in `Konfiguration/*.xcconfig` und kommen über die `Info.plist` (`TCMSupabaseURL`,
  `TCMSupabaseKey`, `TCMSiteURL`, `TCMAppGroup`) in die App (`App/Umgebung.swift`).
- In xcconfig beginnt mit `//` ein Kommentar. Adressen deshalb als `https:/$()/beispiel.de`.
- `scripts/lokal-konfigurieren.sh` liest `apps/mobile/.env` und nimmt die Werte nur, wenn die
  Adresse lokal ist; sonst `apps/web/.env.local`. „Lokal“ läuft so nie gegen Dev oder Prod. Von
  Hand geht es mit `Konfiguration/Lokal.geheim.xcconfig.example`.
- Schemes: `TCMuckensturm` (Run/Test mit Lokal, Archive mit Dev), `TCMuckensturm Dev` (Run/Archive mit Dev).
- Team `93Z2KKGMV7`, automatisches Signieren.
- Entitlements (`TCMuckensturm/TCMuckensturm.entitlements`): App Group `group.<Bundle-ID>`
  (für Prod also `group.de.tcmuckensturm.app`), zugleich Access Group des Schlüsselbunds;
  Associated Domains `applinks:app.tennisclub-muckensturm.de` und `applinks:dev.tennisclub-muckensturm.de`.

## Aufbau

```
TCMuckensturm/
  App/            Einstieg, Umgebung, Sitzung (Weiche, An-/Abmelden), StartLogik (reine Funktion)
  Daten/          Supabase-Client, Schlüsselbund-Speicher, Anmeldefehler, Zugang (mein_zugang)
  Theme/          Tokens (vorläufig, siehe unten), Farben und Schrift für SwiftUI
  Bildschirme/    Anmeldung, Kein Zugang, Platzhalter (Onboarding, Tabs)
  Ressourcen/     Assets (App-Icon, Logo, Markenblau), Schriften (Barlow, OFL)
TCMuckensturmTests/
```

- **Abhängigkeiten:** nur `supabase-swift`, exakt gepinnt auf 2.55.4 (in `project.yml`). Neue
  Versionen erst, wenn sie mindestens zwei Wochen alt sind.
- **Sitzung:** im Schlüsselbund mit `kSecAttrAccessibleAfterFirstUnlock` (`Daten/Schluesselbund.swift`),
  wie `apps/mobile/src/lib/supabase.ts`. Anders als expo-secure-store gibt es keine 2-KB-Grenze,
  das Teilen in Stücke entfällt.
- **Start-Logik** wie `apps/mobile/app/index.tsx`: ohne Sitzung → Anmelden; mit Sitzung →
  `mein_zugang()`: kein Zugang → „Kein Zugang mehr“ (meldet ab), Onboarding offen → Platzhalter,
  sonst Tabs Home / Plätze / Verein / Konto (Platzhalter).
- **Abmelden** nur in `Sitzung.abmelden()`.
- **Tokens:** `Theme/Tokens.swift` ist eine Abschrift von `packages/ui/src/tokens.ts` mit denselben
  Namen (`Tokens.farben.hell.blue`, `Tokens.abstand.rand`, `Tokens.radius.feld`). Sobald
  `packages/ui/generated/Tokens.swift` erzeugt wird (Spur N1), ersetzt die erzeugte Datei diese.
- **Schrift:** Barlow und Barlow Semi Condensed als TTF aus `@expo-google-fonts` (Version 0.4.1),
  Lizenz SIL OFL 1.1 in `Ressourcen/Schriften/OFL.txt`.

## Was noch fehlt

- Prod-Werte (`Konfiguration/Prod.xcconfig`) und ein App-Store-Eintrag für die native App
- Passwort vergessen/setzen, Universal Links (Behandlung), Onboarding, alle Tabs, Verwaltung
- Push (inkl. Push-Token-Abmeldung in `Sitzung.abmelden()`), Widgets
- Übernahme der Sitzung aus der Expo-App (expo-secure-store), damit Mitglieder nach dem Umstieg angemeldet bleiben
- App Groups und Associated Domains im Apple Developer Portal für `.dev`/`.lokal` registrieren (für Geräte-Builds)
- `Package.resolved` ist nicht eingecheckt (liegt im erzeugten `.xcodeproj`): die transitiven Pakete von supabase-swift werden beim ersten Bauen aufgelöst
- CI für iOS (macOS-Runner)
