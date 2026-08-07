# TCM App – Vereins-App des TC Muckensturm

Ablösung der bisherigen eBuSy-Lösung durch eine eigene App für iOS, Android und Web.
Rund 300 aktive Mitglieder, 8 Sandplätze.

## Module

| Modul | Inhalt |
|---|---|
| Mitgliederverwaltung | Stammdaten, Mitgliedschaften, Rollen, Zahler-Beziehungen |
| Einstellungen | Alle Regelwerte im Admin-Dashboard änderbar |
| Freiplatzbuchung | 8 Plätze, 60-Minuten-Buchungen zur vollen oder halben Stunde, Serien-Blockungen |
| Getränkeabrechnung | Self-Service in der App und Kiosk-Tablet, monatliche Abrechnung |
| Beiträge & SEPA | Jahresbeitragslauf, Mandatsverwaltung, `pain.008`-Export |
| Arbeitsdienst | Soll-/Ist-Stunden, Ausgleich in Geld zum Jahresende |

## Der Weg des Geldes

Fünf Zustände, jeder mit eigenem Riegel. Er gilt für jede Forderungsart gleich –
Beitrag, Getränke, Arbeitsdienst, Gastgebühr:

```
Forderung entsteht → Vorabankündigung → Lastschriftlauf → Datei → Rückläufer
   charges.open        .notified          debit_items      pain.008   .returned
```

**Zwei Regeln tragen den Ablauf.** Angekündigt und eingezogen wird **je Zahler**,
nicht je Forderung: ein Elternteil mit zwei Kindern liest eine Nachricht über den
Gesamtbetrag und sieht eine Buchung auf dem Kontoauszug. Und die
**Vorabankündigungsfrist ist nicht umgehbar** – sie hängt an der Forderung
(`notified_at`), wird bei der Auswahl geprüft und noch einmal im Trigger auf
`debit_items`; die direkten Schreibrechte auf beide Tabellen sind entzogen.

**Wo die App endet:** bei der fertigen `.xml`. Der Vorstand lädt sie im
Onlinebanking hoch; von der Bank kommt keine Rückmeldung. Rückläufer trägt
deshalb ein Mensch ein – über die `EndToEndId`, also genau das Feld, das ein
späterer `camt`-Import liefern würde.

## Technik

- **Backend**: Supabase (Postgres, Auth, RLS, Edge Functions, Storage)
- **Mobile**: Expo / React Native
- **Web**: Next.js (Mitglieder-Web, Admin-Dashboard, Kiosk)
- **Tests**: pgTAP (Datenbank), Vitest (Logik), Playwright (E2E)

## Struktur

```
apps/web         Next.js – Mitglieder-Web, Admin-Dashboard, Kiosk-Route
apps/mobile      Expo – Mitglieder-App für iOS und Android
packages/core    Geschäftslogik, Zod-Schemas, generierte Datenbank-Typen
packages/ui      geteilte Komponenten
supabase/        Migrationen, RLS-Policies, RPCs, Edge Functions, pgTAP-Tests
tools/import     eBuSy-Import (läuft erst zum Cutover)
```

## Zwei Dinge, die das Design tragen

**Doppelbuchungen sind durch die Datenbank ausgeschlossen**, nicht durch Anwendungslogik:

```sql
alter table bookings add constraint bookings_no_overlap
  exclude using gist (court_id with =, slot with &&)
  where (status = 'active');
```

Zwei gleichzeitige Anfragen auf denselben Slot können nicht beide durchkommen – unabhängig
davon, was der Client tut.

**Buchungsregeln laufen serverseitig.** Direkte Inserts auf `bookings` sind per RLS verboten;
der einzige Weg führt über die Funktion `create_booking`, die alle Regeln prüft – inklusive des
Kontingents jedes eingetragenen Mitspielers. Das Kontingent steht derzeit auf **0**, also
unbegrenzt; die Regel bleibt vollständig im Code, damit der Vorstand sie in knappen Zeiten
über das Admin-Dashboard wieder einschalten kann.

## Rollen

Es gibt genau zwei Stufen: **Admin** und **Mitglied**. Admins sehen und ändern alles –
Mitglieder, Beiträge, Serien, Einstellungen und jede fremde Buchung. Alle anderen sehen ihre
eigenen Daten und verwalten ihre eigenen Buchungen bis zum Spielbeginn. Zwischenrollen
(Kassenwart, Sportwart, Trainer, Thekendienst) gibt es bewusst nicht mehr: sie waren in einem
Verein dieser Größe schwerer zu pflegen als sie nützten.

## Anzeige und Buchung

Der Belegungsplan zeigt **volle Stunden von 08 bis 21 Uhr**. Gebucht wird zur vollen oder
halben Stunde, immer **60 Minuten** – die Feinwahl passiert im Buchungsfenster. Eine Belegung
sperrt **jede Stunde, die sie berührt**: das Dienstagstraining von 18:30 bis 20:00 wäre sonst
im Stundenraster unsichtbar und der 18-Uhr-Platz sähe frei aus.

## Entwicklung

```bash
corepack enable pnpm
pnpm install
cp .env.example .env      # ausfüllen
pnpm db:reset             # Schema + synthetischer Testbestand
pnpm test                 # Unit- und Datenbanktests
pnpm dev                  # Web-App
```

Während der gesamten Entwicklung enthält die Datenbank **ausschließlich synthetische Daten**.
Echte Mitgliederdaten kommen erst beim Cutover ins Spiel.

## Datenschutz

Die App verarbeitet Bankverbindungen und Geburtsdaten Minderjähriger. Vor dem Produktivgang
werden ein Verzeichnis von Verarbeitungstätigkeiten und ein AV-Vertrag mit Supabase (EU-Region)
benötigt. Zugangsdaten gehören ausschließlich in `.env` bzw. Supabase Vault – niemals ins Repo.
