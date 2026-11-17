# Design „Stitch“ (November 2026)

Löst das Konzept „Clubhaus“ (`docs/design/clubhaus/`) ab. Die Entwürfe liegen in
Stitch im Projekt „Remix of Buro Fintech App“ (`10686709609027860289`), alle
Screens mit dem Titel „TC Muckensturm - …“. Maßstab sind die von Hand
gestalteten Screens „Home“, „Plätze (Belegungsplan Final)“ und
„Platz buchen (Standard Refined)“.

## Regeln

**Grund:** weiß. Karten liegen mit einer feinen Linie (`line`) darauf, Radius
24 bis 32.

**Vereinsblau ist der einzige Akzent, in zwei Tönen:**

- kräftig (`blue`, #1466A8) als Fläche genau einmal pro Screen: die eine
  Hauptaktion. Dazu der gewählte Tag in der Tagesleiste und Fortschrittsbalken.
- hell (`blueSoft`, #E8F1F8) mit Schrift in `blueInk` für alles Zweite und alles
  Ausgewählte: Zweitknöpfe, gewählte Chips und Optionen, der aktive Punkt der
  Navigation, Zähler, „Mitspieler gesucht“.

**Gelb heißt „deins“** und sonst nichts: eigenes Spiel im Belegungsplan,
„Dein Spiel“, die eigene Anmeldung, der „du“-Marker, der Zähler an der Glocke.
Gelb ist kein Knopf, keine Auswahl, kein Status und keine Deko.

**Rot** nur für Zerstörendes und echte Fehler.

**Knöpfe** sind überall dieselben Pillen (Space Grotesk 600, 16 px):

| Stufe | Klasse im Web | Aussehen | Beispiel |
|---|---|---|---|
| Hauptaktion | `.knopf.haupt` | kräftiges Blau, weiße Schrift, im Blatt volle Breite im Fuß | „Buchen“ |
| Zweitaktion | `.knopf` | hellblau, blaue Schrift | „Getränk buchen“, „Mitspielen“ |
| neutral | `.knopf.leise` | weiß mit Linie | „Doch nicht“ |
| zerstörend | `.knopf.gefahr` / `.gefahr-leise` | rot gefüllt nur als Bestätigung, sonst roter Text | „Wirklich stornieren“ |

**Schrift:** Space Grotesk für Titel, Zahlen, Kicker und Knöpfe, DM Sans für
Fließtext. Beide liegen auf dem eigenen Server.

## Stand der Umsetzung

- [x] Tokens (`packages/ui/src/tokens.ts`): Farben, Radien, Schriftgrößen
- [x] Web: Schriften, Knopfstufen, Navigation, Auswahl in Blau
- [x] Web: Startseite nach dem Entwurf „Home“ (ausgedünnt)
- [x] Web: Plätze als ein Raster für alle Breiten (keine „Freien Zeiten“ mehr)
- [x] Web: Anmeldung, Passwort, Antrag, Onboarding, Rechtstexte und Kiosk hell
- [x] Web: Getränke als Liste, Monatskarte weiß; Avatare, Fortschrittsbalken,
      Statusmarken und die großen Karten der Verwaltung ohne Gelb und ohne
      dunkelblaue Flächen
- [x] iOS und Android: Schriftdateien (DM Sans, Space Grotesk)
- [ ] iOS und Android: Rollen der Farben, Startseite, Screens
      (Branches `feature/design-stitch-ios`, `feature/design-stitch-android`)

## Entwürfe im Repo

`screens/` enthält die Entwürfe aus Stitch (Stand 17.11.2026) als HTML und als
gerendertes Bild (`.jpg`). Maßgeblich sind die Regeln oben: Wo ein Entwurf ihnen
widerspricht (zu viel Gelb, dunkelblaue Flächen, abweichende Knöpfe), gelten
die Regeln. Die Startseite ist `screens/start`, die Plätze sind
`screens/plaetze-belegungsplan` – es gibt keine zweite Darstellung der Plätze.
