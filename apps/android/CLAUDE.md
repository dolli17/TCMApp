# Android-App – Hinweise für Claude

Kotlin und Compose. Alles Weitere steht in `README.md` in diesem Ordner; hier nur, was man vor der ersten Änderung wissen muss.

## Befehle

```bash
cd apps/android
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=$HOME/Library/Android/sdk
cp lokal.properties.example lokal.properties   # einmalig, Key aus `supabase status`
./gradlew test lint                            # alle Tests, Lint für devDebug (lokalDebug: :app:lintLokalDebug)
./gradlew :app:recordRoborazziLokalDebug       # Bildschirmfotos unter docs/ neu schreiben
```

- `pnpm verify` berührt diese App nicht. Der CI-Job `android` läuft nur, wenn der PR `apps/android`, die Golden Files oder die erzeugten Tokens ändert, und ist kein Pflicht-Check.
- `gradle.properties` setzt `android.builder.sdkDownload=false`: Fehlt ein SDK-Paket, bricht der Build ab. Die Liste steht in `README.md` unter „Voraussetzungen“.

## Aufbau

| Ort | Inhalt |
|---|---|
| `kern/` | reines Kotlin ohne Android: portierte Logik aus `@tcm/core`, geprüft gegen `packages/core/golden` |
| `app/…/daten` | Supabase-Client und Datenzugriff, je Bereich eine Datei |
| `app/…/bildschirme` | Oberfläche, je Tab ein Paket mit `<Tab>Graph.kt` |
| `app/…/theme` | `TcmTheme` aus `packages/ui/generated/Tokens.kt` |
| `app/…/widgets` | Glance-Widgets, im Modul `:app` |

## Regeln

- **Keine eigene Geschäftslogik.** Regeln kommen aus den RPCs (`docs/native/app-api.md`) oder werden aus `packages/core` nach `kern/` portiert und gegen die Golden Files geprüft.
- **Gleichstand mit iOS:** Was hier an Verhalten dazukommt, gehört auch nach `apps/ios`, im selben PR oder als benannter offener Punkt.
- **Neue Ziele** kommen in das Paket und den Graph ihres Tabs. `navigation/HauptTabs.kt` muss dafür nicht angefasst werden.
- **Tokens nicht von Hand ändern.** Quelle ist `packages/ui/src/tokens.ts`, erzeugt mit `pnpm --filter @tcm/ui build:native`.
- **Versionen** stehen gepinnt in `gradle/libs.versions.toml`. Neue Versionen erst, wenn sie mindestens zwei Wochen alt sind.
- **Bildschirmfotos:** Ändert sich die Oberfläche, die Fotos mit `recordRoborazziLokalDebug` neu schreiben und einchecken.
- **Verweise auf `apps/mobile`** in Kommentaren meinen die frühere Expo-App. Sie ist aus dem Repo entfernt und steht nur noch in der Git-Historie.
