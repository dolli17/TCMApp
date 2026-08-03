import { defineConfig, devices } from "@playwright/test";

/**
 * Die Tests laufen gegen die echte Anwendung mit echter Datenbank. Der Bestand
 * ist synthetisch, deshalb ist das unbedenklich - und aussagekraeftiger als
 * jedes Mocking, weil RLS und die Regeln in den RPCs mitgetestet werden.
 */
export default defineConfig({
  testDir: "./e2e",
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
