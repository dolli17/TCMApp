import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Die Tests laufen gegen die echte Anwendung mit echter Datenbank. Der Bestand
 * ist synthetisch, deshalb ist das unbedenklich - und aussagekraeftiger als
 * jedes Mocking, weil RLS und die Regeln in den RPCs mitgetestet werden.
 *
 * WICHTIG: gegen einen Produktionsbuild starten, nicht gegen "next dev":
 *
 *   pnpm --filter @tcm/web build && pnpm --filter @tcm/web start
 *   pnpm e2e
 *
 * Der Entwicklungsserver uebersetzt jede Route beim ersten Aufruf neu. Auf
 * einem ausgelasteten Rechner dauert das zehn Sekunden und mehr, und die Tests
 * laufen reihenweise in ihren Zeitgrenzen - ohne dass etwas kaputt waere.
 * Derselbe Durchlauf: acht Minuten mit sechs Fehlschlaegen gegen den
 * Entwicklungsserver, zwei Minuten ohne einen einzigen gegen den Build.
 */

/**
 * .env.local einlesen.
 *
 * Next.js macht das von sich aus, Playwright nicht - ohne diesen Schritt
 * stuenden DEV_USER_ADMIN und DEV_PASSWORD nur dann bereit, wenn jemand sie
 * von Hand in die Shell exportiert. Vorhandene Umgebungsvariablen haben
 * Vorrang, damit CI und ein abweichender Lauf sie ueberschreiben koennen.
 */
function ladeEnvDatei(pfad: string): void {
  let inhalt: string;
  try {
    inhalt = readFileSync(pfad, "utf8");
  } catch {
    return; // Datei fehlt - dann kommen die Werte eben aus der Umgebung.
  }

  for (const zeile of inhalt.split("\n")) {
    const treffer = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(zeile);
    const name = treffer?.[1];
    const roh = treffer?.[2];
    if (!name || roh === undefined) continue;
    if (process.env[name] !== undefined) continue;
    process.env[name] = roh.trim().replace(/^["']|["']$/g, "");
  }
}

// Playwright laedt diese Datei als CommonJS, import.meta gibt es hier nicht.
// Beide Pfade, damit der Aufruf aus apps/web und aus dem Wurzelverzeichnis
// gleichermassen funktioniert.
ladeEnvDatei(join(process.cwd(), ".env.local"));
ladeEnvDatei(join(process.cwd(), "apps", "web", ".env.local"));
export default defineConfig({
  testDir: "./e2e",
  // Räumt die Testanträge weg – vorher wie nachher. Sie zählen auf die Sperren
  // des öffentlichen Formulars; ohne das Aufräumen davor beginnt ein Lauf
  // womöglich schon am Limit.
  globalSetup: "./e2e/aufraeumen.ts",
  globalTeardown: "./e2e/aufraeumen.ts",
  fullyParallel: false, // die Tests buchen echte Plaetze und wuerden sich sonst behindern
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
