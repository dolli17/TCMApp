# Begriffe in der Oberfläche

Stand: 21.10.2026 (U7, U11). Web und App nennen dieselbe Sache gleich. Wer einen neuen Text schreibt, nimmt den Begriff aus der linken Spalte.

## Bereiche

| Begriff | Wofür | Nicht |
|---|---|---|
| **Start** | Die Startseite (`/`, App-Tab `home`). Menü und Tab heißen gleich. | Home |
| **Plätze** | Der Bereich zum Buchen (`/plan`, App-Tab `plaetze`): Menü, Tab und Seitentitel. | Belegungsplan, Platzplan |
| **Belegung** | Die Ansicht mit dem Raster aller Plätze, Segment neben „Meine & offene Spiele“. Im Text: „in der Belegung“. | Belegungsplan |
| **Verein** | Getränke und Veranstaltungen (`/verein`). | |
| **Konto** | Der eigene Bereich (`/konto`): Menü, Tab und Avatar. Die Seite selbst trägt den Namen des Mitglieds. Darunter „Meine Daten“ usw. | Mein Konto, Profil |
| **Verwaltung** | Alles für Vorstand und Platzwart (`/admin`, App-Tab `verwaltung`): Abschnitt in der Seitenleiste, Tab am Telefon, Titel der Übersicht. | Admin, Administration, Dashboard |
| **System** | Bereich der Verwaltung für selten geänderte Werte (`/admin/system`). | Einstellungen (das ist ein Abschnitt der Kasse) |

## Rollen

| Begriff | Wofür |
|---|---|
| **Vorstand**, **App Admin**, **Platzwart** | Die Rollen, wie sie `ROLLEN` in `@tcm/core` nennt. „App Admin“ ist nur der Name dieser Rolle, kein Bereich. |
| **volle Rechte** | Vorstand oder App Admin. Sperrhinweis: „… ist dem Vorstand und den App Admins vorbehalten.“ |
| **Spieler**, **Mitglied** | Ohne besondere Rolle. In der Seitenleiste steht „Mitglied“. |

## Geld und Bank

| Begriff | Wofür | Nicht |
|---|---|---|
| **Bankdatei** | Die Datei mit den Lastschriften, die im Onlinebanking hochgeladen wird. Knopf: „Bankdatei erzeugen“. | pain.008, Lastschriftdatei, SEPA-XML |
| **Format der Bankdatei** | Die Einstellung `sepa.pain_version`. Die Fassungsnummer steht nur in Klammern daneben. | pain-Version |
| **Einzug** | Ein Lauf mit Abbuchungstag, von „Angekündigt“ bis „Abgeschlossen“. | Batch, Lastschriftlauf |
| **bisheriges Vereinsprogramm eBuSy** | Woher Gläubiger-ID und alte Mandate stammen. | eBuSy-Backend |
| **Beträge in Euro** | Eingaben und Anzeigen immer in Euro („15,00“). Cent gibt es nur in der Datenbank. | Angaben in Cent |

## Einstellungen

Namen und Erklärungen der Einstellungen stehen in `packages/core/src/einstellungen.ts`, nicht in `settings.label`/`settings.description`. Die Oberfläche zeigt nie den Schlüssel (`booking.lead_days`). Listen von Benachrichtigungsarten sind Häkchen mit deutschen Namen (`BENACHRICHTIGUNGS_ARTEN`). Kommt eine neue Einstellung oder Art dazu, gehört ihr Text dorthin.
