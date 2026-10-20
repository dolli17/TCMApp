/**
 * E2E läuft nur gegen den lokalen Stack, nie gegen Dev oder Prod (T1).
 *
 * Die Tests legen Mitglieder an, buchen Plätze und räumen in aufraeumen.ts
 * Anträge weg. Gegen die Cloud wäre das ein Eingriff in echte Daten. Früher
 * hat scripts/e2e.sh die Root-.env exportiert, die auf die Cloud zeigt, und
 * exportierte Variablen schlagen .env.local - der Lauf ging dann still gegen
 * die Cloud.
 *
 * Deshalb prüft playwright.config.ts das hier, bevor irgendein globalSetup
 * läuft. Die Prüfung schaut nur auf die Adressen und baut keine Verbindung auf.
 */

const LOKAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/.*)?$/;

export function istLokaleAdresse(adresse: string | undefined): boolean {
  return LOKAL.test((adresse ?? "").trim());
}

export function pruefeLokaleUmgebung(): void {
  const pruefungen: Array<[string, string | undefined]> = [
    ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
    ["E2E_BASE_URL", process.env.E2E_BASE_URL ?? "http://localhost:3000"],
  ];
  if (process.env.SUPABASE_FUNCTIONS_URL) {
    pruefungen.push(["SUPABASE_FUNCTIONS_URL", process.env.SUPABASE_FUNCTIONS_URL]);
  }

  const falsch = pruefungen.filter(([, wert]) => !istLokaleAdresse(wert));
  if (falsch.length === 0) return;

  const zeilen = falsch.map(([name, wert]) => `  ${name}=${wert ?? "(nicht gesetzt)"}`);
  throw new Error(
    [
      "E2E läuft nur gegen den lokalen Stack (127.0.0.1/localhost). Abbruch, bevor ein Test läuft:",
      ...zeilen,
      "Lokalen Stack starten (pnpm db:start) und apps/web/.env.local verwenden;",
      "keine Cloud-Adressen in der Shell exportieren.",
    ].join("\n"),
  );
}
