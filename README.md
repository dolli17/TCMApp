# TCM App – Vereins-App des TC Muckensturm

Ablösung der bisherigen eBuSy-Lösung durch eine eigene App für iOS, Android und Web.
Rund 300 aktive Mitglieder, 8 Sandplätze.

## Module

| Modul | Inhalt |
|---|---|
| Mitgliederverwaltung | Stammdaten, Mitgliedschaften, Rollen, Zahler-Beziehungen |
| Freiplatzbuchung | 8 Plätze, Kontingent- und Vorlaufregeln, Serien-Blockungen |
| Getränkeabrechnung | Self-Service in der App und Kiosk-Tablet, monatliche Abrechnung |
| Beiträge & SEPA | Jahresbeitragslauf, Mandatsverwaltung, `pain.008`-Export |
| Arbeitsdienst | Soll-/Ist-Stunden, Ausgleich in Geld zum Jahresende |

## Technik

- **Backend**: Supabase (Postgres, Auth, RLS, Edge Functions, Storage)
- **Mobile**: Expo / React Native
- **Web**: Next.js (Mitglieder-Web, Vorstands-Dashboard, Kiosk)
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
Kontingents jedes eingetragenen Mitspielers.

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
