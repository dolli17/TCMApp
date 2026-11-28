# Design: iOS-Stil für alle Oberflächen

Stand 28.11.2026. Maßstab für iOS, Android und Web ist die iOS-App, wie sie seit
PR #146 („App im nativen Apple-Stil“) gebaut ist. Diese Datei beschreibt sie und
legt fest, wie Android und Web sie übernehmen. Sie ersetzt `clubhaus/HANDOFF.md`
und `stitch/` als Vorgabe; beide bleiben als Archiv liegen.

Grundsatz: **gleiches Aussehen, gleiche Gliederung, Bedienung der Plattform.**
Android behält Zurück-Geste, Systemleisten und Rückmeldung beim Antippen. Das Web
behält am Schreibtisch die Seitenleiste. Abläufe (etwa wie eine Buchung bestätigt
wird) werden einzeln entschieden und in Abschnitt 6 nachgetragen; dort weicht
auch iOS vom heutigen Stand ab.

Farben kommen weiter aus `packages/ui/src/tokens.ts`. Was iOS heute als festen
Wert nutzt, wird Token, bevor Android und Web es übernehmen (Abschnitt 5).

## 1. Grundlagen

**Schrift.** Die Systemschrift trägt fast alles: Titel, Listen, Nebentext.

| Plattform | Systemschrift | Größen |
|---|---|---|
| iOS | SF Pro, Textstile (`.largeTitle` … `.caption2`), Dynamic Type | wie unten |
| Android | Roboto (Standard von Compose), keine eigene `FontFamily` für diese Rollen | sp, folgt der Schriftgröße des Systems |
| Web | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | rem |

Space Grotesk und DM Sans bleiben nur dort, wo iOS sie nutzt: Belegungsraster und
Legende, Buchen-Leiste, Pillen-Knöpfe, Marken („Du bist dabei“, „läuft noch“).

| Rolle | iOS | Ungefähr (pt/sp/px) |
|---|---|---|
| Großer Titel | `.largeTitle` bold, Navigationsleiste | 34 / 700 |
| Abschnittskopf | `.footnote`, `muted`, Großbuchstaben des Systems | 13 / 400 |
| Zeile | `.body`, `ink` | 17 / 400 |
| Wichtige Zeile | `.headline` | 17 / 600 |
| Nebentext | `.subheadline` bzw. `.footnote`, `muted` oder `ink2` | 15 bzw. 13 |
| Große Zahl | `.largeTitle` bold, Ziffern gleich breit | 34 / 700 |
| Summe | `.title2` bold | 22 / 700 |

**Grund und Flächen.**

- Bildschirmgrund: hell `bg` mit `surf3` zu 50 % darüber (kühles Grau), dunkel `bg`.
- Gruppen und Zeilen: `surf`. Trennlinien: `line2`, eingerückt ab dem Text.
- Akzent für Auswahl und Links: `blue`, Linktext `blueInk`.

**Maße.** Gruppen haben den Radius und die Einzüge von `.insetGrouped`, Zeilen
mindestens 44 hoch, Abstand zwischen Gruppen 20 (`listSectionSpacing`). Radius
und Rand der Gruppen setzt das System. Gemessen am Foto `apps/ios/docs/konto-hell.png`
(402 pt breit): Rand 16, Eckradius etwa 25 (iOS rundet „continuous“, im Web und in
Android reicht ein normaler Radius).

## 2. Bausteine

| Baustein | iOS (Quelle) | So aussehen |
|---|---|---|
| Kopf | System-Navigationsleiste, großer Titel | Titel links groß, beim Scrollen klein in der Leiste. Rechts höchstens Glocke oder ein Symbol (Schloss, Plus), ohne Kreis. Kein Kicker „TC MUCKENSTURM“. |
| Glocke | `Nachrichten/Glocke.swift` | Symbol 19, Fläche 44. Abzeichen gelbe Kapsel (`gold`/`onGold`), mind. 18, oben rechts, nicht angeschnitten. |
| Gruppierte Liste | `Gruppenliste.swift` | Eine Gruppe je Abschnitt, Kopf darüber, Fußtext darunter in `muted`. |
| Zeile | `gruppenZeile`, `ZeilenPfeil` | Titel links, Wert rechts in `muted`, Chevron in `line2`. Externe Links mit Pfeil schräg nach oben. |
| Symbol-Kachel | `IconKachel` | 29×29, Radius 7, weißes Symbol 15 auf `blue`; `muted` für Rechtliches, `red` bei Gefahr. |
| Segment-Schalter | `Picker(.segmented)` | Steht als eigene Zeile ohne Gruppe unter dem Titel. Android und Web bauen das iOS-Segment nach (graue Schiene, weiße Fläche mit leichtem Schatten). |
| Datumsleiste | `PlaetzeBildschirm.swift` `Tagesleiste` | Wochentag klein darüber, Zahl im Kreis 38. Gewählt: Kreis `blue`, Zahl `onBrand`. Heute: Text `blueInk`. Keine Kacheln mit Rand. |
| Belegungsraster | `PlatzRaster.swift` | Siehe Abschnitt 3. |
| Marken | `DeinMarker`, `BlaueMarke`, `StatusmarkeAnsicht` | Kapsel, Höhe 24. Gelb nur für „du“ (Dein Spiel, Angemeldet). Blau `blueSoft`/`blueInk` für Mitspieler gesucht. Grau `surf2`/`ink2` für „läuft noch“. Rot `red` 14 % für Rückläufer. |
| Knöpfe | `Knoepfe.swift` | Pille. Haupt `blue`/`onBrand`, Zweit `blueSoft`/`blueInk`, Gefahr `red`. Höhen 40, 52, 56. In Listen lieber eine Zeile mit Text in `blueInk` als ein Knopf. |
| Blatt | `Buchungsblatt.swift`, `FormBlatt` | Von unten, gruppierte Liste darin, Titel klein in der Mitte, Abbrechen links, Haupt-Knopf unten (Abschnitt 6). |
| Mengen-Stepper | `GetraenkeAnsicht.swift` | Ohne Menge ein gefülltes Plus in `blue`. Mit Menge eine `blueSoft`-Kapsel −/Zahl/+. |
| Datumskachel | `EventKarte.swift` | 46×50, Radius 10, Monatsband `blue` oben, Tag darunter. |
| Leer / Fehler / Laden | `Gruppenliste.swift` `FehlerZeile` | Leer: eine Zeile in `muted`. Fehler: Zeile mit Warnsymbol in `redInk` und „Erneut versuchen“. Laden: Kreisel ohne Gruppe. |
| Rückmeldung | Toast, `bestaetigung` | Kapsel unten über dem Inhalt. |
| Navigation | System-`TabView` | Start, Plätze, Verein, Konto, Verwaltung (nur mit Rechten). Umriss-Symbole, Akzent `blue`. Android: Navigationsleiste von Material 3 im iOS-Look (kein Pillen-Indikator, Akzent `blue`). Web Telefon: Leiste unten, Web Schreibtisch: Seitenleiste. |

## 3. Belegungsraster

- 64 je Stunde, Kopf 38, Zeitspalte 48, Spalten mindestens 34, Blöcke Radius 5.
- Grund `surf2`, Rahmen `line`, Radius 24. Jetzt-Linie rot 1,5 mit Punkt.
- Passen nicht alle Plätze, wischt man waagerecht; der Kopf mit den Nummern bleibt stehen.
- Legende bricht um und zeigt alle Arten, auch „gesperrt“ und „vorbei“.

| Art | Fläche | Streifen links 3 / Rand | Zeichen |
|---|---|---|---|
| eigen | `gold` 32 % | `gold` | „Du“ |
| belegt | `blueSoft` | `blue` 55 % | – |
| sucht Mitspieler | `blueSoft` | `blue`, gestrichelter Rand | „+“ |
| Serie / Training | `surf3` | `ink2` 60 % | – |
| gesperrt | `surf3`, Schrägstriche | `rahmen` | – |

## 4. Gliederung der Bildschirme

Reihenfolge der Abschnitte. Die Texte stehen in `docs/begriffe.md`.

- **Start:** großer Titel „Hallo, Vorname“, darunter Datum · TC Muckensturm
  1. Heute: nächster Termin oder „Noch nichts geplant“
  2. Zwei Knöpfe „Platz buchen“, „Getränk“
  3. Jetzt frei (höchstens 3 Zeilen, „Alle N anzeigen“)
  4. Offene Spiele
  5. Demnächst im Verein
- **Plätze:** Titel mit Unterzeile „N Plätze · 08 bis 21 Uhr“ → Segment „Belegung | Meine & offene Spiele“ → Datumsleiste → Kontingent → Legende → Raster → Buchen-Leiste unten.
  Spiele: Deine Termine, Offene Spiele.
- **Verein:** Segment „Getränke | Veranstaltungen | Arbeitsdienst“.
  - Getränke: Dein Monat (eine Zeile mit Summe, führt zu „Zuletzt“) → je Kategorie eine Gruppe mit Steppern → Korbleiste unten.
  - Veranstaltungen: Gruppen je Monat → „Vergangene Veranstaltungen“.
  - Arbeitsdienst: Dein Stand → Kommende Einsätze → Geleistet.
- **Konto:** Profilzeile (Avatar 60, Name, Marken; führt zu „Persönlich“ und „Einstellungen“) → Abrechnung (eine Zeile „Offen · N Posten“, führt zu den Posten) → Arbeitsdienst (Stunden mit Balken) → Datenschutz, Impressum → Abmelden → Mitgliedschaft kündigen.
- **Verwaltung (App):** Segment „Plätze | Serien“ → Jetzt / Laufend → Hinweis aufs Web.

### Nur im Web

Verwaltung am Schreibtisch und Kiosk gibt es in der App nicht. Sie übernehmen die
Bausteine aus Abschnitt 2:

- **Verwaltung:** großer Titel, gruppierte Listen statt Karten, Segment statt
  Reiter, Tabellen als Gruppe mit Zeilen. Breite Inhalte (Tabellen, Raster)
  dürfen die volle Breite nutzen, Listen höchstens 720.
- **Kiosk:** bleibt immer dunkel und dreispaltig, Kacheln und Knöpfe in den
  Formen von Abschnitt 2.
- **Schreibtisch allgemein:** Seitenleiste wie die Seitenleiste von iPadOS
  (gruppierte Liste auf dem Grund), Inhalt mittig mit höchstens 720 Breite,
  wo es nur Listen sind.

## 5. Neue Tokens

iOS nutzt diese Werte heute fest im Code. Sie kommen nach `tokens.ts`, iOS
liest sie danach ebenfalls aus `Tokens.swift`.

| Wert | Heute in iOS | Token (Vorschlag) |
|---|---|---|
| Grund hell `surf3` 50 % über `bg` | `Gruppenliste.swift` | Farbe `gruppenGrund` (hell/dunkel) |
| Radius Gruppe 25 (gemessen), Symbol-Kachel 7, Datumskachel 10, Rasterblock 5 | fest bzw. System | `radius.gruppe`, `radius.kachel`, `radius.block` |
| Abstand zwischen Gruppen 20, Rand 16 (gemessen) | fest bzw. System | `abstand.gruppe`, `abstand.gruppenRand` |
| Zeilenhöhe mindestens 44 | System | `groesse.zeile` |
| Schriftgrößen der Textstile | System | `schrift.rolle.*` (nur für Android und Web; iOS bleibt bei den Textstilen) |
| Schatten `black` 12–25 % | fest | bestehende `schatten`-Tokens |

`schrift.groesse.seitentitel` und `hero` nutzt iOS nicht mehr; sie fallen weg,
sobald Android und Web umgestellt sind.

## 6. Entschiedene Abläufe

- **Bestätigen im Blatt (28.11.2026):** überall ein großer Haupt-Knopf unten,
  der sagt, was passiert („Platz 2 buchen“, „Speichern“). Kein Haken oben rechts,
  auch nicht in iOS. Abbrechen bleibt oben links.
- **Raster am Telefon (28.11.2026):** Spalten mindestens 34 breit; passen nicht
  alle Plätze, wischt man waagerecht, Zeitspalte und Kopf bleiben stehen.

## 7. Bildschirmfotos zum Vergleich

- iOS: UI-Tests mit `TEST_RUNNER_TCM_SCREENSHOTS`, siehe `apps/ios/README.md`.
- Android: `./gradlew :app:recordRoborazziLokalDebug`, Bilder in `apps/android/docs`.
- Web: noch keine. Jeder PR der Angleichung legt Fotos vom Telefon und vom
  Schreibtisch, hell und dunkel, in die PR-Beschreibung.
