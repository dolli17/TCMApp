# iOS-App – Hinweise für Claude

SwiftUI, eine Abhängigkeit (`supabase-swift`, exakt gepinnt in `project.yml`). Alles Weitere steht in `README.md` in diesem Ordner; hier nur, was man vor der ersten Änderung wissen muss.

## Befehle

```bash
cd apps/ios
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
scripts/lokal-konfigurieren.sh        # einmalig: Konfiguration/Lokal.geheim.xcconfig
xcodegen generate                     # nach jeder Änderung an project.yml und nach neuen oder gelöschten Dateien
xcodebuild test -project TCMuckensturm.xcodeproj -scheme TCMuckensturm \
  -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath build/DerivedData
```

- `project.yml` ist die Quelle. Das `.xcodeproj` wird erzeugt und nicht eingecheckt.
- `pnpm verify` berührt diese App nicht. Der CI-Job `ios` läuft nur, wenn der PR `apps/ios`, die Golden Files oder die erzeugten Tokens ändert, und ist kein Pflicht-Check.
- Bauen und Testen geht nur auf einem Mac, nicht in Cloud-Sitzungen.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `TCMuckensturm/Kern` | Rechenlogik aus `@tcm/core` als reine Funktionen, geprüft gegen `packages/core/golden` |
| `TCMuckensturm/Daten` | Supabase-Client und Datenzugriff, je Bereich eine Datei |
| `TCMuckensturm/Bildschirme` | Oberfläche, je Tab ein Ordner |
| `TCMuckensturm/Theme` | Farben und Schrift aus `packages/ui/generated/Tokens.swift` |
| `TCMWidgets` | Widgets, Code gemeinsam mit der App unter `Gemeinsam/` |

## Regeln

- **Keine eigene Geschäftslogik.** Regeln kommen aus den RPCs (`docs/native/app-api.md`) oder werden aus `packages/core` nach `Kern/` portiert und gegen die Golden Files geprüft.
- **Gleichstand mit Android:** Was hier an Verhalten dazukommt, gehört auch nach `apps/android`, im selben PR oder als benannter offener Punkt.
- **Tokens nicht von Hand ändern.** Quelle ist `packages/ui/src/tokens.ts`, erzeugt mit `pnpm --filter @tcm/ui build:native`.
- **Abmelden nur über `Sitzung.abmelden()`.**
- **Neue Versionen von Abhängigkeiten** erst, wenn sie mindestens zwei Wochen alt sind.
- **Schlüssel:** `Konfiguration/*.xcconfig` enthält nur Publishable Keys. `*.geheim.xcconfig` wird nicht eingecheckt.
- **Simulator nie per AppleScript oder System Events steuern,** Eingaben landen sonst in anderen Fenstern. Für Abläufe die UI-Tests nehmen.
