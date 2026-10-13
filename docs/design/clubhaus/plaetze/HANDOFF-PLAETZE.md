# Plätze in der App – Übersicht und Freie Zeiten

Ersetzt den Plätze-Screen aus Phase 4a (`apps/mobile/app/(tabs)/plaetze/index.tsx`).
Gilt genauso für das Web unter 768 px. Entwürfe in `screens/`:
`PlRaster` (Übersicht), `PlFreieZeiten` (Freie Zeiten), `PlAgenda` (optional,
Tagesansicht eines Platzes), `PlKonzepte` (Begründung).

Nur Darstellung. Buchungsregeln bleiben in `create_booking`, die Frei-Regel in
`@tcm/core` (`canStartAt`, `courtStatusAt`), Realtime und Nachladen unverändert.

## Aufbau

Oben: großer Titel, darunter Segment-Schalter **„Übersicht | Freie Zeiten“**
(Übersicht ist Standard und steht links). Die Wahl wird gemerkt
(AsyncStorage bzw. localStorage). Die Uhrzeit-Chips („Wann willst du spielen?“)
und die Mini-Zeitleisten je Platz entfallen.

## Übersicht (PlRaster)

- Tageszeile: ‹ Vortag · „Heute, Dienstag 13.10.“ (tippen öffnet die
  Tagesauswahl bis `lead_days`) · Folgetag ›.
- Raster: links feste Spalte mit „PLATZ 1“ … „PLATZ 8“ (46 px), rechts
  waagerecht wischbar die Stunden von Öffnung bis Schluss, **68 px pro
  Stunde**, Zeilenhöhe 52. Stundenköpfe oben, feine senkrechte Linien.
  Beim Öffnen auf „jetzt“ gescrollt (Startzeit = jetzt − 15 min).
- Belegungen als abgerundete Blöcke (Radius 10, 5 px Abstand), beschriftet
  mit zwei Zeilen: Du / Einzel · [Name] / Doppel · sucht 2 / Doppel ·
  Training / bis 19:00 · gesperrt / Grund. Farben nach der Statustabelle
  im HANDOFF (Du = gold, belegt = blueSoft, sucht = gestrichelt gold,
  Serie = Schraffur, gesperrt = surf3).
- Rote Jetzt-Linie über alle Zeilen.
- Freie Fläche antippen (Raster `slot_minutes`) wählt Platz + Start aus:
  gelb umrandeter Block „+ 15:00“ und unten über der Tab-Leiste eine
  helle Leiste „Platz 6 · 15:00 – 16:00 · frei bis 21:00 · [Buchen]“.
  „Buchen“ öffnet das bestehende Buchungsblatt vorbelegt.
- Belegung antippen öffnet sie im Blatt (eigene bearbeiten, Mitspielen,
  Admin wie bisher). Platznamen antippen öffnet optional `PlAgenda`.
- Legende kurz unter dem Raster.

## Freie Zeiten (PlFreieZeiten)

- Gleiche Tagesauswahl als Kacheln.
- Eine Karte mit Kopfzeile „BEGINN · 1 2 3 4 5 6 7 8 · PLATZ“.
- Eine Zeile je Startzeit (nächste freie Halbstunde, danach volle
  Stunden bis Schluss − Dauer): Uhrzeit (22, Semi Condensed) · acht
  Kästchen 18×24 in Platzreihenfolge (frei = green, belegt/gesperrt/Serie
  = surf3, sucht = gestrichelt gold, du = gold) · rechts „n frei“
  (≥ 3 grün, 1–2 ink, 0 „voll“ muted) · Pfeil. Höhe 60.
- Zeile antippen klappt auf: „17:00 – 18:00 · Welcher Platz?“, freie
  Plätze als große grüne Knöpfe (3 pro Reihe, Höhe 48) → Buchungsblatt;
  gesuchte Spiele als gestrichelte Zeile „Platz 4 · Doppel sucht noch 1 ·
  Mitspielen“; eigene Buchung als Hinweis „Du spielst um 17:00 auf Platz 1“.
  Immer nur eine Zeile offen.
- Legende als eine Zeile unter der Karte.
- Die Kästchen sind für Screenreader ausgeblendet; die Zeile hat ein
  Label wie „17:00 Uhr, 3 Plätze frei, Platz 4 sucht Mitspieler“.

## Daten

Beide Ansichten lesen dieselbe Tagesbelegung. Status je Platz und Startzeit
über `courtStatusAt`; neue reine Funktion `freeSlotsOfDay` in `@tcm/core`
(Liste der Startzeiten mit Status je Platz) mit Tests.
