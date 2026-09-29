# Verwaltung – Überarbeitung nach dem App-Standard

Ergänzt `../HANDOFF.md`. Ersetzt die Abschnitte zur Verwaltung dort
(AdminUebersicht, AdminMitglieder, AdminKasse). Entwürfe in `screens/`:

| Entwurf | Breite | Inhalt |
|---|---|---|
| `VwRegeln` | – | die acht Regeln unten als Bild |
| `VwUebersicht` | 390 | Übersicht als Home |
| `VwMitglieder` | 390 | Mitgliederliste |
| `VwMitglied` | 390 | ein Mitglied |
| `VwLauf` | 390 | Lastschriftlauf |
| `VwSerien` | 390 | Plätze & Serien, Segment Serien |
| `VwBlatt` | 390 | Formular als Blatt (Serie anlegen) |
| `VwDeskUebersicht` | 1440 | Übersicht Desktop |
| `VwDeskMitglieder` | 1440 | Mitglieder als Liste + Detail |

Nur Darstellung und Navigation. RPCs, RLS, Fristen, `@tcm/core` (debitFlow,
adminTodos …) bleiben. Die bestehenden Bausteine aus Phase 6 werden
umgebaut oder ersetzt, nicht daneben gestellt.

## Die acht Regeln

1. **Ein Menü statt drei.** `AdminReiter` (Reiterband unter der Kopfzeile)
   entfällt. Desktop: die Seitenleiste führt, Abschnitt „Verwaltung“ mit
   Übersicht, Mitglieder, Arbeitsdienst, Kasse, Plätze & Serien, Getränke,
   System. Telefon (< 768 px): für Admins ein fünfter Tab **„Admin“**
   (Schild-Symbol) in der schwebenden Leiste; er öffnet die Übersicht.
   Innerhalb eines Bereichs höchstens **ein Segment-Schalter** mit 2–3
   Teilen (derselbe wie „Belegung | Meine & offene Spiele“):
   - Mitglieder: Alle · Anträge (Zähler) · Mannschaften
   - Plätze & Serien: Plätze · Serien
   - Kasse: Forderungen · Lastschriften · Getränkemonate
   `MitgliederBereiche` (drittes Band) entfällt. Arbeitsdienst wird eigener
   Bereich in der Seitenleiste. Merkmale wandern nach System.
2. **Das Theme des Mitglieds gilt.** `VerwaltungHell` entfällt. Kein
   Umschalten beim Betreten von /admin.
3. **Listen statt Tabellen** auf allen Breiten. Zeile: Avatar oder
   Symbolkachel · Name (16/700) · eine Kontextzeile (13, muted) · rechts
   genau **ein** Hinweis (z. B. „[Betrag]“ in goldInk, „kein Mandat“ in
   redInk, „kein Zugang“ muted) · Pfeil. Die ganze Zeile ist der Link,
   Höhe ≥ 64. Gruppiert in einer Karte (Radius 22), wie `.gruppe` im Konto.
   `table.liste` wird in der Verwaltung nicht mehr benutzt – außer im
   Änderungsprotokoll und im Export.
4. **Ein gelber Knopf pro Seite**, im Kopf rechts („Anlegen“, „Serie“,
   „Jetzt prüfen“). Keine Knopfreihen in Zeilen; Aktionen liegen im
   Detail (Zeilen dort) oder im Blatt. Zerstörende Aktionen als rote
   Textzeile am Ende des Details.
5. **Formulare als Blatt.** Telefon: Bottom-Sheet wie Buchen (`Blatt`).
   Desktop: `dialog.fenster.blatt` mittig, gleicher Aufbau. Felder
   gruppiert (Label links in der Zeile, Wert rechts), Chips statt
   `<select>` bei ≤ 8 Optionen (Wochentag, Plätze), Uhrzeit/Datum als
   große Tippfelder. Folgen vor dem Absenden anzeigen (gestrichelter
   Hinweis in goldSoft: „[n] Buchungen liegen im Weg …“), Knopftext mit
   Ergebnis („Serie anlegen · [n] Termine“). `FensterKnopf` und
   `formraster` entsprechend umbauen.
6. **Ein Mitglied sieht aus wie das eigene Konto.** Die sieben Reiter
   entfallen. Kopf: Avatar 88 (Desktop 76), Name, „Nr. · Mitglied seit“,
   Marken (Art, Mannschaft, App-Zugang). Drei Schnellaktionen (Anrufen,
   E-Mail, Einladung senden). Darunter gruppierte Abschnitte mit
   Zeilen, die in eine Unterseite bzw. ein Blatt führen:
   Mitgliedschaft (Art, Mannschaft, Merkmale) · Geld (Forderungen,
   SEPA-Mandat, Konto ••1234, Beitragsarten) · Kontakt & Daten
   (Stammdaten, Notfallkontakt, Einwilligungen) · Arbeitsdienst
   (Fortschritt, Stunden eintragen). Am Ende: Änderungsprotokoll,
   Zugang sperren, Austritt eintragen (rot).
   Desktop: **Liste links (420 px), Mitglied rechts** – Auswahl per
   `?id=` in der URL, kein Seitenwechsel; `/admin/mitglieder/[id]` bleibt
   als direkte Adresse und für < 1100 px.
7. **Die Übersicht ist ein Home.** Reihenfolge: „Heute zu tun“ – die
   dringendste Aufgabe (`adminTodos`, urgent) als große Karte auf brand
   mit gelbem Knopf, die übrigen als Zeilen · „Auf einen Blick“ 2×2
   Kacheln · Beitragslauf (5 Balken + „Schritt 2 von 5 · Ankündigung“) ·
   „Bereiche“ als gruppierte Liste (nur Telefon; Desktop hat die
   Seitenleiste) · Desktop zusätzlich „Heute auf der Anlage“.
8. **Abläufe senkrecht.** Der Weg des Geldes ist am Telefon eine
   senkrechte Liste (Häkchen grün / Nummer gelb / Nummer grau umrandet,
   Satz darunter), am Desktop waagerecht. Darüber die Karte „Nächster
   Schritt“ auf brand; gesperrt mit Schloss und Grund aus der Datenbank.

## Übergang

- Alte Adressen (`/admin/mitglieder/merkmale`, `…/arbeitsdienst`,
  `?abschnitt=` am Mitglied) leiten auf die neuen Orte weiter.
- E2E: Selektoren anpassen, Verhalten nicht; Test für den Admin-Tab am
  Telefon und für Liste + Detail am Desktop ergänzen.
