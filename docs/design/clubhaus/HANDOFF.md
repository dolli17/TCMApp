# Designkonzept „Clubhaus“ – Übergabe an die Umsetzung

Dieses Verzeichnis beschreibt das neue Design der TCM App für alle Oberflächen:
Mitglieder-App (Expo, iOS/Android), Mitglieder-Web (Next.js), Admin-Dashboard und
Kiosk-Tablet. Es ersetzt das bisherige Aussehen, **nicht** die Logik.

- `HANDOFF.md` – diese Datei: Regeln, Tokens, Komponenten, Screens, Reihenfolge
- `screens/*.dc.html` – die Entwürfe als HTML. Sie laufen nur im Design-Canvas
  (sie brauchen eine eigene Laufzeit), sind aber als Referenz lesbar: Layout,
  Abstände, Farben und Texte stehen im Markup, Beispieldaten in `renderVals()`.
  Die Farbwerte stehen dort je Screen im Objekt `T` (`dunkel` / `hell`).
- `screens/*.png` – optional: Bilder der Screens, falls aus dem Canvas exportiert.

## Grundregeln für die Umsetzung

1. **Nur Darstellung ändern.** RLS, RPCs, `create_booking`, Kontingent, Fristen der
   Vorabankündigung, Realtime-Nachladen, Zeitzonen-Logik (Europe/Berlin) bleiben
   unverändert. Keine Datenbankmigration für das Design.
2. **`packages/ui/src/tokens.ts` bleibt die einzige Quelle.** `tokens.css` wird
   daraus erzeugt (`pnpm --filter @tcm/ui build:css`), der Test in
   `tokens.test.ts` muss grün bleiben. Web liest CSS-Variablen, Expo das Objekt.
3. **Kontrast:** Text mindestens 4,5:1, ab 24 px 3:1. Die bestehende Begründung
   bei `muted` (Mitglieder bis 92 Jahre) gilt weiter. Neue Werte unten sind
   darauf ausgelegt; bei Abweichungen lieber dunkler/heller nachziehen als die
   Regel brechen.
4. **Barrierefreiheit wie bisher:** echte `<button>`/`<a>`/`Pressable` mit
   `accessibilityRole`, Touch-Ziele ≥ 44 px, `aria-label` an Icon-Knöpfen,
   `prefers-reduced-motion` respektieren.
5. **Platzhalter** in den Entwürfen (`[Betrag]`, `[Preis]`, `[Mitglied]`,
   `[Getränk 1]`, `[n]`, `[Datum]`) stehen für echte Daten aus der Datenbank.
   Belegungen und Uhrzeiten in den Entwürfen sind Beispieldaten.
6. Deutsche Bezeichner und Kommentare wie im restlichen Repo.

## 1. Farben

Vereinsfarben: **Blau** trägt die Marke, **Ballgelb** heißt „hier handeln“.
Gelb nur für die eine Hauptaktion eines Screens, eigene Termine und aktive
Auswahl – nicht als Deko.

Dunkel ist in der App der neue Standard, hell in der Verwaltung. Die
Nutzerwahl System/Hell/Dunkel bleibt (`ThemeAnbieter`, `data-theme`).

### Neue Werte für `farben` in `tokens.ts`

| Token (bestehend) | hell neu | dunkel neu | Hinweis |
|---|---|---|---|
| `bg` | `#F3F5F8` | `#07111D` | Seitengrund |
| `surf` | `#FFFFFF` | `#0E1A29` | Karten |
| `surf2` | `#EEF2F6` | `#152538` | Segmente, Chips, Leisten |
| `ink` | `#0A1624` | `#F3F7FB` | Text |
| `ink2` | `#44566B` | `#B3C2D2` | Zweittext |
| `muted` | `#5F7185` | `#8497AC` | Hilfstext; Kontrast prüfen (s. o.) |
| `line` | `#E3E8EE` | `rgba(255,255,255,.08)` | |
| `line2` | `#CBD5E0` | `rgba(255,255,255,.16)` | Feldränder |
| `chip` | `#EEF2F6` | `#152538` | wie `surf2` |
| `blue` | `#1A6FB0` | `#3A9BE0` | Links, belegte Zeiten |
| `blueInk` | `#0F4C81` | `#8CC6F0` | Text auf `blueSoft` |
| `blueSoft` | `#E2EFFA` | `rgba(58,155,224,.18)` | |
| `gold` | `#FFD21F` | `#FFD21F` | **Ballgelb**, in beiden Themes gleich |
| `goldSoft` | `#FFF6D1` | `rgba(255,210,31,.14)` | „Mitspieler gesucht“ |
| `green` | `#1E9E6A` | `#3DD68C` | frei / erledigt |
| `red` | `#D7544B` | `#FF6B61` | Fehler, Stornieren, Jetzt-Linie |

### Neue Tokens (ergänzen)

| Token | hell | dunkel | Wofür |
|---|---|---|---|
| `surf3` | `#E2E8EF` | `#1E3249` | aktives Segment (dunkel), gesperrte Zeit |
| `brand` | `#1466A8` | `#1466A8` | Vereinsblau-Flächen: „Als Nächstes“-Karte, Avatare, Monatskarte |
| `onGold` | `#0A1624` | `#0A1624` | Text/Icon auf Gelb – immer dunkel |
| `goldInk` | `#7A5C00` | `#FFD21F` | gelber Text auf hellem/dunklem Grund |
| `goldLine` | `#E0B400` | `#FFD21F` | gestrichelter Rand „Mitspieler gesucht“ |
| `greenInk` | `#167A52` | `#3DD68C` | grüner Text („frei bis …“) |
| `glass` | `rgba(255,255,255,.82)` | `rgba(22,36,54,.78)` | schwebende Leiste |
| `glassLine` | `rgba(10,22,36,.08)` | `rgba(255,255,255,.12)` | Rand der Leiste |
| `tabAktiv` | `#FFD21F` | `rgba(255,210,31,.14)` | Hintergrund des aktiven Tabs |
| `tabAktivInk` | `#0A1624` | `#FFD21F` | Icon/Label des aktiven Tabs |

`gold` behält seinen Namen (keine Umbenennung quer durchs Repo); nur der Wert
wechselt von Ocker auf Ballgelb. Text in `gold` auf hellem Grund ist verboten –
dafür gibt es `goldInk`.

### Schatten

Karten im Dunkeln **ohne** Schatten (Fläche + `line` reicht). Hell:
`0 1px 2px rgba(10,22,36,.05), 0 6px 20px rgba(10,22,36,.06)`.
Schwebende Leiste: hell `0 16px 40px rgba(10,22,36,.16)`, dunkel
`0 16px 40px rgba(0,0,0,.5)`. `schattenRn` entsprechend nachziehen.

## 2. Status auf dem Platz (überall gleich)

| Status | Darstellung |
|---|---|
| Frei | leere Spur (`surf2`), Text in `greenInk` |
| Deine Buchung | Fläche `gold`, Text `onGold` |
| Belegt | Fläche `blue` (Balken) bzw. `blueSoft` + `blueInk` (Raster-Block) |
| Mitspieler gesucht | `goldSoft` + 1,5 px gestrichelter Rand `goldLine` |
| Training / Serie | Schraffur 135° über `surf3` |
| Gesperrt | `surf3`, Schloss-Symbol, Text `muted` |
| Jetzt | 2 px Linie in `red` (Web/Admin) bzw. `ink` (App-Zeitleiste) |

Die Farben unterscheiden sich auch in der Helligkeit; Serien haben zusätzlich
das Muster, gesuchte Spiele die gestrichelte Kante.

## 3. Schrift, Radien, Abstände

- **Barlow** bleibt für Text, **Barlow Semi Condensed** für Uhrzeiten, Zahlen,
  Kicker. Neu: **Barlow 800** für große Titel. Beide Familien sind schon
  eingebunden (Fontsource / `@expo-google-fonts`); in Expo zusätzlich
  `Barlow_800ExtraBold` laden.
- Größen (`schrift.groesse`, neu): `kicker 12` (Semi Condensed 700, Großbuchstaben,
  Laufweite .14em), `klein 13`, `normal 16` (vorher 15 – bessere Lesbarkeit am
  Platz), `titel 22` (Abschnitt, 700), `seitentitel 34` (800, Laufweite -0.6),
  `hero 40` (Uhrzeit auf der Termin-Karte, Semi Condensed 700).
  Web-Desktop: Seitentitel 40–44.
- Radien (`radius`, zusammengezogen): `klein 10`, `feld 16`, `knopf 16`,
  `karte 22`, `karteGross 26`, `blatt 30` (Bottom-Sheet oben), `chip 99`.
- Abstände: `rand 20` bleibt. Zwischen Abschnitten 28–30, in Karten 14–16.

## 4. Komponenten

**Schwebende Tab-Leiste (App)** – ersetzt die feste Leiste in
`apps/mobile/app/(tabs)/_layout.tsx`.
- Pille, Höhe 64, Radius 32, 16 px vom linken Rand, 26 px über dem unteren
  Safe-Area-Rand, Hintergrund `glass` + Weichzeichner
  (`expo-blur` BlurView; ohne Blur: `glass` mit höherer Deckkraft), Rand `glassLine`.
- 4 Tabs: **Home, Plätze, Getränke, Konto**. Aktiver Tab: eigene Pille
  (52 hoch) in `tabAktiv`, Icon + Label `tabAktivInk`. Inaktiv `muted`.
- Rechts daneben ein runder Knopf 64×64 in `gold` mit „+“ (`onGold`),
  `accessibilityLabel="Platz buchen"` → öffnet das Buchungsblatt.
- Die Glocke wandert in den Kopf der Screens (rund, 44, neben dem Avatar).
- Inhalte brauchen unten ~110 px Luft, damit nichts unter der Leiste liegt.
- Umsetzung über `tabBar`-Prop von `expo-router` `<Tabs>` mit eigener Komponente.

**Großer Titel-Kopf (App):** kein nativer Header mehr. Oben Safe-Area + 16,
Kicker (Datum) über dem Titel (34/800), rechts Glocke und Avatar (Initialen auf
`brand`).

**Segment-Schalter:** Container `surf2`, Radius 16, Innenabstand 4; aktives
Segment `surf3` (dunkel) bzw. `surf` mit Schatten (hell). Ersetzt die
Reiterleiste unter Plätze: nur noch **„Belegung“ | „Meine & offene Spiele“**.

**Datums-Kacheln:** 58×70, Radius 18, Wochentag (11/700) über Tageszahl (26,
Semi Condensed 700). Gewählt: `gold`/`onGold`. Sonst `surf2`/`ink2`.

**Zeit-Chips:** Höhe 38, Radius 19. Gewählt: invertiert (`ink`-Fläche,
`bg`-Text). Sonst `surf2`/`ink2`.

**Knöpfe:** Primär `gold`/`onGold`, Höhe 52–58, Radius 16–18, 800.
Sekundär `surf2` + `line`. Gefahr: Text `red`, Rand `red` 40 %. Klein: Höhe 38–40, Radius 19–20.

**Karten:** `surf`, 1 px `line`, Radius 22. Gruppierte Listen (iOS-Stil):
eine Karte, Zeilen mit Trennlinie, Zeilenhöhe ≥ 52.

**„Als Nächstes“-Karte:** Fläche `brand`, weiße Schrift, dezente Platzlinien
(weiß 13 % Deckkraft) als SVG, gelber Ball-Kreis oben rechts. Uhrzeit 40,
darunter Platz + Spielform, unten Avatare + „Details“.

**Zeitleiste je Platz:** Spur Höhe 10, Radius 5, 08–21 Uhr. Segmente nach der
Statustabelle. Senkrechte Markierung für die gewählte Uhrzeit.

**Bottom-Sheet:** Radius 30 oben, Griff 38×5, Abdunklung `rgba(3,8,14,.62)`.
Buchen, Buchung bearbeiten, Mitspielen laufen als Sheet (App) – im Web bleibt
`<dialog class="fenster">`, aber im neuen Look.

**Schalter:** 52×32, an = `green`, Knopf weiß. `role="switch"`.

**Web/Admin-Seitenleiste:** 264 breit, Logo, darunter gelber Knopf
„Platz buchen“, Hauptmenü (Home, Belegungsplan, Getränke, Mein Konto),
Abschnitt „Verwaltung“ nur für Admins (Übersicht, Mitglieder, Kasse,
Plätze & Serien, Getränke, System), unten Nutzerkarte. Aktiver Eintrag hell:
`ink`-Fläche mit weißem Text; dunkel: `goldSoft`-Fläche mit `gold`-Text.

**Logo:** auf dunklem Grund eine weiße Variante **mit gelbem Ball**
(`packages/ui/assets/logo-weiss.png` neu anlegen – eine Übergangsversion liegt
hier als `logo-weiss.png`, hochskaliert aus dem kleinen Original; besser aus
der Vektorvorlage des Vereins erzeugen; nicht mehr per
`filter: brightness(0) invert(1)`, das färbt den Ball weiß).

**App-Icon (Vorschlag):** Fläche `brand`, Platzlinien in Perspektive, gelber Ball.

## 5. Screens

### Mitglieder-App (Expo)

| Entwurf | Route | Was sich ändert |
|---|---|---|
| `AppHome` (+ `AppHomeHell`) | **neu**: `app/(tabs)/home.tsx` (Home-Tab, erster Tab) | Neuer Startscreen, siehe unten |
| `AppPlaetze` | `app/(tabs)/plaetze/index.tsx` | Zeit zuerst; Liste aller Plätze mit Zeitleiste |
| `AppBuchen` | `src/components/BuchungsFenster.tsx` | als Bottom-Sheet |
| `AppSpiele` | `plaetze/meine.tsx` + `plaetze/offen.tsx` zusammengelegt | ein Screen, zwei Abschnitte |
| `AppGetraenke` | `app/(tabs)/getraenke.tsx` | Kacheln mit Zähler, Leiste „Eintragen“ |
| `AppKonto` | `app/(tabs)/konto.tsx` | Profilkopf, Forderungen, Arbeitsdienst, gruppierte Einstellungen |
| `AppLogin` | `app/anmelden.tsx` | Platz-Illustration, Formular auf dunklem Grund |

**Home (neu)** – Reihenfolge von oben:
1. Kicker Datum, Titel „Hallo, {Vorname}“, Glocke (Punkt bei Ungelesenem), Avatar → Konto.
2. **Als Nächstes**: waagerecht wischbare Karten der kommenden eigenen Buchungen
   (`ladeMeineBuchungen`, Ende in der Zukunft). Erste Karte groß in `brand`.
   Keine Buchung → Karte „Noch nichts geplant“ + Knopf „Platz buchen“.
3. **Schnellaktionen** (3 Kacheln): Platz buchen (gelb), Getränk eintragen,
   Mitspielen.
4. **Jetzt frei**: Plätze, die ab jetzt frei sind, mit „frei bis HH:MM“ und
   Mini-Zeitleiste. Aus `ladeTagesplan(heute)` + `startMoeglich` ableiten.
5. **Offene Spiele**: Buchungen mit `partner_wanted` und freien Plätzen (wie `offen.tsx`).
6. **Dein {Monat}**: Getränkesumme des laufenden Monats, Arbeitsdienst Ist/Soll.
7. **Neuigkeiten**: letzte Benachrichtigungen (wie `nachrichten.tsx`).

Nach dem Anmelden startet die App auf Home statt auf Plätze
(`app/index.tsx` leitet auf `/home` weiter). Nicht `(tabs)/index.tsx` nehmen –
das kollidiert mit `app/index.tsx` auf `/`.

**Plätze:** Datums-Kacheln (heute bis `lead_days`, wie bisher), darunter
„Wann willst du spielen?“ mit Zeit-Chips im Raster `slot_minutes`. Darunter
eine gruppierte Karte mit allen Plätzen: Name, Statuszeile zur gewählten Zeit
(„frei 17:00 – 18:00“, „belegt bis 19:00“, „Deine Buchung · 17:00“,
„Doppel sucht 1 · 17:00“, „gesperrt · Grund“), rechts „Buchen“ / „Mitspielen“ /
Pfeil, darunter die Zeitleiste mit Markierung. Legende unter der Liste.
Die bisherigen freien Stunden-Marken entfallen – die Feinwahl :00/:30 passiert im Sheet.

**Buchen-Sheet:** Kicker „Platz X · Wochentag, TT.MM.“, Uhrzeit groß,
Segmente „Beginn“ (:00/:30) und „Spielform“, „Wer spielt mit?“ (Chips mit
Avatar, „+ Mitglied“, „+ Gast · Gebühr“), Schalter „Mitspieler gesucht“ mit
Erklärung, gelber Knopf „Platz X buchen“, darunter „Stornieren geht bis
Spielbeginn“. Fehlermeldungen aus `create_booking` über dem Knopf.

### Mitglieder-Web (Next.js, `apps/web`)

| Entwurf | Route | Was sich ändert |
|---|---|---|
| `WebHome` | **neu**: `src/app/page.tsx` zeigt Home statt Redirect nach `/plan` | Inhalte wie App-Home, 12er-Raster (8 + 4) |
| `WebPlan` | `src/app/plan/page.tsx`, `Belegungsplan.tsx` | Raster mit Blöcken über die volle Dauer statt Zellen je Stunde |

Unter 768 px zeigt das Web die App-Screens (schwebende Leiste statt
`.bottomnav`, Liste mit Zeitleisten statt Raster) – dieselbe Aufteilung wie heute.

**Belegungsplan Desktop:** Kopf mit Titel und Datums-Kacheln rechts, Legende,
Raster: Zeitspalte 64 px + 8 Platzspalten, 44 px pro Stunde. Belegungen als
abgerundete Blöcke (Radius 11, 5 px Innenabstand zur Spalte) über ihre ganze
Dauer mit Uhrzeit + Name. Freie Zeit beim Überfahren: gestrichelter Block
„+ HH:MM buchen“. Rote Jetzt-Linie mit Uhrzeit-Marke. Spaltenkopf: Platzname +
Status („frei bis 17:00“ grün / „gesperrt“).

### Verwaltung (hell als Standard)

| Entwurf | Route |
|---|---|
| `AdminUebersicht` | `src/app/admin/page.tsx` |
| `AdminMitglieder` | `src/app/admin/mitglieder/page.tsx` |
| `AdminKasse` | `src/app/admin/kasse/lastschriften/[id]/page.tsx` |

- **Übersicht:** 4 Kennzahl-Kacheln (klickbar), „Beitragslauf · der Weg des
  Geldes“ als 5-Schritt-Fortschritt (Forderung → Ankündigung → Lastschriftlauf →
  Datei → Rückläufer), „Heute auf der Anlage“ (8 Zeitleisten mit Jetzt-Linie),
  rechts „Heute zu tun“ mit je einem Knopf.
- **Mitglieder:** Reiter (Liste, Anträge mit Zähler, Mannschaften, Merkmale,
  Arbeitsdienst), Suche + Filter-Chips, Tabelle mit Avatar, Mitgliedschaft,
  Mannschaft, SEPA-Mandat (grün „liegt vor“ / rot „fehlt“), Offen, App-Zugang.
- **Lastschriftlauf:** Status-Marke im Titel, derselbe 5-Schritt-Fortschritt,
  Tabelle „Je Zahler“, rechts Karte „Nächster Schritt“ in `brand`: Knopf
  „pain.008 erzeugen“ bleibt gesperrt (Schloss), bis die Frist abgelaufen ist –
  der Grund steht dabei. Die Sperre kommt weiterhin aus der Datenbank.

### Kiosk (`src/app/kiosk`, `KioskOberflaeche.tsx`)

Dunkel, drei Spalten, alles ≥ 48 px hoch: **1 Wer nimmt etwas?** (Suche,
große Trefferzeilen, „Zuletzt an der Theke“) · **2 Was?** (6 große Kacheln,
Zähler als gelber Kreis) · **3 Eintragen** (helle Spalte mit Zusammenfassung,
Knopf „Für {Vorname} eintragen“, 76 hoch). Nach dem Eintragen zurück auf Schritt 1.

## 6. Reihenfolge der Umsetzung

Jede Phase ist ein eigener PR und für sich lauffähig.

1. **Tokens:** `tokens.ts` nach Abschnitt 1–3 anpassen und ergänzen,
   `build:css`, Tests. `globals.css` und `apps/mobile/src/lib/stil.ts` auf
   neue Radien/Größen ziehen. Logo-Variante anlegen.
   *Fertig, wenn:* App und Web in beiden Themes laufen, Kontrasttest besteht.
2. **Navigation:** schwebende Tab-Leiste (App), Seitenleiste neu (Web ≥ 768),
   schwebende Leiste im Web < 768, Glocke in den Kopf.
3. **Home** in App und Web (neue Route), Start nach Login auf Home.
4. **Plätze:** Zeit-zuerst-Liste (App + Web mobil), Buchen-Sheet,
   „Meine & offene Spiele“ zusammengelegt, Desktop-Raster mit Blöcken.
5. **Getränke, Konto, Anmelden.**
6. **Verwaltung:** Übersicht, Mitglieder, Lastschriftlauf; übrige Admin-Seiten
   (Plätze & Serien, Getränke, System, Anträge, Mannschaften) mit denselben
   Bausteinen nachziehen.
7. **Kiosk.**

Nach jeder Phase: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e`
(`apps/web/e2e`, besonders `darstellung.spec.ts`) – Selektoren anpassen, wo
sich Struktur ändert, Verhalten nicht.

## 7. Noch nicht entworfen

Nachrichten als eigene Seite, Passwort vergessen/setzen, Mitgliedsantrag,
Datenschutz/Impressum, Plätze & Serien, Getränkeverwaltung, System,
Anträge/Mannschaften/Merkmale/Arbeitsdienst im Admin. Diese Seiten aus den
Bausteinen oben ableiten; im Zweifel nachfragen statt erfinden.

## 8. Stand der Umsetzung

Stand: 28.09.2026, nach Phase 7. Jede Phase ist ein eigener PR auf `main`
(#1 bis #7, dazu dieser). Geprüft wurde jeweils mit `pnpm lint`,
`pnpm typecheck`, `pnpm test` und `pnpm e2e`.

### Umgesetzt

| Phase | Inhalt |
|---|---|
| 1 Tokens | neue Farben, Schatten, Radien und Größen in `tokens.ts`, `tokens.css` daraus erzeugt; `.immer-dunkel` (Anmeldung, Kiosk) und seit Phase 7 `.immer-hell` (Eintragen-Spalte des Kiosks); weiße Logovariante mit gelbem Ball |
| 2 Navigation | schwebende Tab-Leiste in der App, Seitenleiste im Web ab 768 px, schwebende Leiste darunter, Glocke im Kopf |
| 3 Home | neue Startseite in App und Web, Start nach dem Login auf Home; Regel „jetzt frei“ in `@tcm/core` (`freeCourtsNow`) |
| 4 Plätze | Zeit zuerst (App und Web mobil), Buchen als Blatt, „Meine & offene Spiele“ zusammengelegt, Raster mit Blöcken im Web |
| 5 | Getränke (Kacheln mit Zähler, Sammelauswahl über `drinkBatchReport`), Konto, Anmeldeseiten mit Bühne |
| 6a Verwaltung | Übersicht (Kennzahlen, Weg des Geldes, Anlage heute, Heute zu tun), Mitgliederliste, Lastschriftlauf; `debitFlow`/`adminTodos` in `@tcm/core` |
| 6b Verwaltung | Mitglied-Detail mit Reitern, Anträge, Mannschaften, Merkmale, Arbeitsdienst, Kasse, Lastschriftläufe, Plätze & Serien, Getränke, System – mit den Bausteinen aus 6a (Kennzahl, Statusmarke, Tabellenkarte, Reiter, Filter-Chips, Fenster, Nächster Schritt, Geldweg) |
| 7 | Kiosk (drei Spalten, immer dunkel), Nachrichten in App (Blatt an der Glocke) und Web, Rechtstexte und Antrag auf der Bühne, App-Icon und Splash, Aufräumen |

### Abweichungen vom Entwurf

- **`muted`:** hell `#596A7D` statt `#5F7185`, dunkel `#879AAE` statt
  `#8497AC`. Die Entwurfswerte lagen auf einzelnen Flächen knapp unter 4,5:1
  (dunkel 4,36:1); die neuen halten 4,5:1 auf allen Flächen. Begründung in
  `packages/ui/src/tokens.ts`, geprüft von `tokens.test.ts`.
- **Glocke:** zeigt weiter die Zahl der ungelesenen Nachrichten statt nur
  eines Punktes – die Zahl gab es vorher schon.
- **Verwaltung am Telefon (App):** kein fünfter Tab; eine Karte auf der
  Konto-Seite führt hinein. Im Web bleibt das Reiterband der Verwaltung
  zusätzlich zur Seitenleiste stehen.
- **Verwaltung hell:** gilt, solange niemand ein Theme gewählt hat. Wer
  einmal ausdrücklich wählt – auch „System“ –, dessen Wahl gilt überall.
- **Mitgliederliste:** neben den Chips des Entwurfs bleibt eine leise Zeile
  mit den bisherigen Bestandsfiltern (Ohne Zugang, Trainer, Admins,
  Archiviert, Alle Datensätze). Einen Export gibt es nicht, deshalb auch
  keinen Knopf.
- **Lastschriftlauf:** „pain.008 erzeugen“ ist gesperrt, solange nichts im
  Lauf ist; als Begründung stehen die Sätze aus `debit_batch_candidates`.
  Das Datum „ab …“ ist der angekündigte Fälligkeitstag (`charges.due_date`).
  Keine Frist wird im Client gerechnet.
- **Mitglied-Detail:** der Reiter „Forderungen“ zeigt neben der
  Beitragskarte die Forderungen des Mitglieds als Liste (nur Anzeige).
- **Getränke (Verwaltung):** die Getränkemonate stehen zusätzlich zur Kasse
  auch hier, weil „Nächster Schritt“ auf sie verweist.
- **Nachrichten:** gelesen markiert wird wie bisher beim Öffnen; die
  Hervorhebung auf `goldSoft` bleibt stehen, bis „Alle als gelesen“ sie
  wegnimmt. Gruppiert nach Heute / Gestern / Diese Woche / Früher
  (`groupNotifications`).
- **Kiosk:** „Zuletzt an der Theke“ merkt sich das Gerät selbst (lokal, nur
  die Kennungen); der Kiosk darf keine Buchungen lesen. Mehr als sechs
  Getränke scrollen innerhalb des 2×3-Rasters. Tippen = +1, langes Drücken
  oder der kleine Knopf = −1.

### Bewusst offen

- Die Seiten aus Abschnitt 7 ohne eigenen Entwurf sind aus den Bausteinen
  abgeleitet, nicht gestaltet: Passwort vergessen/setzen, Mitgliedsantrag,
  Datenschutz/Impressum, die Verwaltungsseiten aus 6b.
- **Logo:** `logo-weiss.png` ist weiter die hochskalierte Übergangsversion;
  besser aus der Vektorvorlage des Vereins erzeugen.
- **App-Icon und Splash:** nach dem Vorschlag in Abschnitt 4 als SVG in
  `apps/mobile/assets` (`icon.svg`, `adaptive-icon.svg`, `splash-icon.svg`),
  PNGs mit `rsvg-convert` gebaut. Auf einem Gerät und im App Store noch nicht
  geprüft; ein Favicon für das Web fehlt.
- **Rechtstexte:** Datenschutz und Impressum enthalten noch Platzhalter in
  `[[…]]`, die der Vorstand füllen muss.
- **Nachrichten als eigene Seite im Web:** weiter nur das Fenster an der
  Glocke.
