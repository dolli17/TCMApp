import { type Page } from "@playwright/test";

/**
 * Gemeinsames Rüstzeug der E2E-Tests.
 *
 * Der Anmelde-Helfer stand vorher wortgleich in zwei Dateien. Mit der dritten
 * war der Punkt erreicht, an dem sich das Herausziehen lohnt – eine Änderung
 * an der Loginseite hätte sonst an drei Stellen nachgezogen werden müssen.
 */

export const PASSWORT = process.env.DEV_PASSWORD ?? "";

// Es gibt nur noch drei Sorten von Konten: Admin, Mitglied und Kiosk-Geraet.
export const NUTZER = {
  mitglied: process.env.DEV_USER_MEMBER ?? "",
  admin: process.env.DEV_USER_ADMIN ?? "",
  kiosk: process.env.DEV_USER_KIOSK ?? "",
};

export async function anmelden(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(PASSWORT);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
}

/**
 * Ein Name, den es garantiert nur einmal gibt.
 *
 * Die Tests legen echte Mitglieder an und räumen sie selbst wieder ab. Bricht
 * ein Lauf mittendrin ab, bleibt der Datensatz liegen – mit Zeitstempel im
 * Namen ist dann wenigstens erkennbar, woher er stammt, und der nächste Lauf
 * kollidiert nicht mit ihm.
 */
export function testName(zweck: string): string {
  return `ZZTest${zweck}${Date.now().toString().slice(-8)}`;
}

/**
 * Ein Tag ("2026-08-14") so, wie ihn die Terminlisten anzeigen.
 *
 * Platz und Uhrzeit allein reichen zum Wiederfinden nicht: das Testmitglied hat
 * im Bestand weitere Buchungen auf demselben Platz zur selben Uhrzeit, nur an
 * anderen Tagen - und ein `.first()` darauf trifft die falsche.
 */
export function alsListendatum(tag: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "Europe/Berlin",
  }).format(new Date(`${tag}T12:00:00Z`));
}
