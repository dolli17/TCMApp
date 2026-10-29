# Golden Files

Eingabe und erwartete Ausgabe der Rechenlogik aus `@tcm/core`, die die App benutzt. Die nativen Apps (Swift, Kotlin) portieren diese Funktionen und prüfen ihre Portierung gegen genau diese Dateien. So rechnen Web, Expo-App, iOS und Android dasselbe, ohne dass jemand die Regeln ein zweites Mal aus dem Code abschreiben muss.

Fahrplan des Umzugs: [`docs/native-apps.md`](../../../docs/native-apps.md).

## Format

Eine Datei je Funktion, `<funktion>.json`, als Liste:

```json
[
  {
    "name": "Tag der Umstellung auf Winterzeit, 10:00",
    "input": { "day": "2026-10-25", "minutes": 600 },
    "output": "2026-10-25T09:00:00.000Z"
  }
]
```

- **`name`** ist innerhalb der Datei eindeutig. Er eignet sich als Testname auf allen Plattformen.
- **`input`** enthält die Parameter mit ihren Namen aus der TypeScript-Signatur. Bei Funktionen mit einem Optionsobjekt (`canStartAt`, `freeCourtsNow`, `freeSlotsOfDay`, `freeGaps`, `courtStatusAt`, `bookingActions`, `umsetzZiele`) ist `input` dieses Objekt. Fehlt ein Feld, ist der Parameter nicht angegeben (`undefined`, in Swift `nil`, in Kotlin `null` bzw. der Standardwert).
- **`output`** ist das Ergebnis, wie `JSON.stringify` es schreibt. Felder, die fehlen, waren `undefined`.
- **Zeitpunkte** (`now`, `starts_at`, Rückgaben vom Typ `Date`) stehen als ISO-8601 in UTC. Die Logik rechnet immer in **Europe/Berlin**, egal in welcher Zeitzone das Gerät steht. Die Fälle enthalten Sommer, Winter und beide Umstellungstage 2026 (29.03. und 25.10.).
- **Geld** steht in ganzen Cent. `formatCents` liefert ein geschütztes Leerzeichen (U+00A0) vor dem Euro-Zeichen.

Was die Funktionen bedeuten, steht im Kommentar über der jeweiligen Funktion in `packages/core/src/`.

### Dateien, die keine Funktion sind

- **`courtStatusAt.json`** deckt den Typ `CourtStatusKind` ab: jede Art (`frei`, `eigen`, `sucht`, `belegt`, `serie`, `gesperrt`, `knapp`, `vorbei`, `schluss`, `vorlauf`) kommt mit ihrem Text vor. `freeSlotsOfDay` benutzt dieselbe Funktion je Platz.
- **`CHARGE_KIND_LABEL.json`** deckt den Typ `ChargeKind` ab: jede Forderungsart mit ihrer Bezeichnung, in der Reihenfolge von `CHARGE_KINDS`.

## Woher die Fälle kommen

Jeder Fall stammt aus einem bestehenden Vitest-Test in `packages/core/src/*.test.ts`. Die Eingaben stehen in `src/golden/faelle.ts`, mit Hinweis auf den Test, aus dem sie kommen. Die Ausgaben rechnet `scripts/build-golden.ts` mit der TypeScript-Implementierung aus. Neue Annahmen sind dabei nicht hinzugekommen: Die Vitest-Tests legen fest, was richtig ist, die Golden Files halten es für die anderen Plattformen fest. Einzige Ergänzung sind einige Fälle für `dayLabel` und `dayTag` rund um die Zeitumstellung. Deren Ausgabe kommt ebenfalls aus der Implementierung.

`src/golden/golden.test.ts` liest jede Datei, rechnet jeden Fall mit TypeScript nach und prüft, dass die Dateien zu `faelle.ts` passen. Ändert jemand die Logik, schlägt der Test fehl, bis die Dateien neu erzeugt sind:

```bash
pnpm --filter @tcm/core build:golden
```

Eine geänderte Golden-Datei im Diff bedeutet: **Swift und Kotlin müssen nachziehen.**

## In Swift (XCTest)

Die Dateien werden als Ressourcen ins Testziel kopiert. In XcodeGen reicht ein Ordnerverweis auf `packages/core/golden`. Dann liest ein Test jede Datei:

```swift
struct Fall<Input: Decodable, Output: Decodable>: Decodable {
    let name: String
    let input: Input
    let output: Output
}

struct BerlinTimeInput: Decodable { let day: String; let minutes: Int }

func testBerlinTime() throws {
    let url = Bundle(for: Self.self).url(forResource: "berlinTime", withExtension: "json")!
    let faelle = try JSONDecoder().decode([Fall<BerlinTimeInput, String>].self, from: Data(contentsOf: url))
    for fall in faelle {
        let ergebnis = Zeit.berlinTime(day: fall.input.day, minutes: fall.input.minutes)
        XCTAssertEqual(ergebnis.iso8601Millis, fall.output, fall.name)
    }
}
```

Datumsangaben mit `ISO8601DateFormatter` und `.withFractionalSeconds` lesen und schreiben. Für Berliner Zeit `TimeZone(identifier: "Europe/Berlin")` mit einem `Calendar(identifier: .gregorian)` nehmen, nie `TimeZone.current`. Für Wochentage und Monatsnamen `Locale(identifier: "de_DE")` verwenden.

## In Kotlin (JUnit)

Gradle kopiert den Ordner als Testressourcen:

```kotlin
// build.gradle.kts des Moduls mit der Logik
sourceSets["test"].resources.srcDir("../../packages/core/golden")
```

```kotlin
@Serializable data class Fall<I, O>(val name: String, val input: I, val output: O)
@Serializable data class BerlinTimeInput(val day: String, val minutes: Int)

@Test fun berlinTime() {
    val text = javaClass.getResource("/berlinTime.json")!!.readText()
    val faelle = Json.decodeFromString<List<Fall<BerlinTimeInput, String>>>(text)
    for (fall in faelle) {
        assertEquals(fall.output, Zeit.berlinTime(fall.input.day, fall.input.minutes).toString(), fall.name)
    }
}
```

Zeitrechnung mit `java.time` und `ZoneId.of("Europe/Berlin")` (ab API 26 ohne Desugaring verfügbar), Texte mit `Locale.GERMANY`. Achtung: `Instant.toString()` lässt Millisekunden weg, wenn sie null sind. Für den Vergleich `DateTimeFormatter.ISO_INSTANT` mit festen drei Nachkommastellen nehmen oder beide Seiten als `Instant` vergleichen.

Für Ausgaben, die Objekte sind (`freeSlotsOfDay`, `courtStatusAt`), lohnt sich der Vergleich als `JsonElement` statt als Datenklasse. Dann fällt auch ein Feld auf, das die Portierung zu viel liefert.
