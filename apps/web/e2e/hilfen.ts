import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Gemeinsames Rüstzeug der E2E-Tests.
 *
 * Der Anmelde-Helfer stand vorher wortgleich in zwei Dateien. Mit der dritten
 * war der Punkt erreicht, an dem sich das Herausziehen lohnt – eine Änderung
 * an der Loginseite hätte sonst an drei Stellen nachgezogen werden müssen.
 */

export const PASSWORT = process.env.DEV_PASSWORD ?? "";

// Admin, Mitglied und Kiosk-Geraet, dazu zwei Konten mit offenem Onboarding:
// neu (erwachsen, ohne Mandat) und kind (minderjaehrig).
export const NUTZER = {
  mitglied: process.env.DEV_USER_MEMBER ?? "",
  admin: process.env.DEV_USER_ADMIN ?? "",
  kiosk: process.env.DEV_USER_KIOSK ?? "",
  neu: process.env.DEV_USER_NEU ?? "",
  kind: process.env.DEV_USER_KIND ?? "",
};

/**
 * Feste UUIDs der Testkonten und der festen Mitglieder aus supabase/seed.sql
 * (T3). Bei jedem db reset dieselben, deshalb dürfen Tests direkt auf
 * /admin/mitglieder/<id> gehen statt den ersten Suchtreffer zu nehmen.
 */
export const MITGLIED_ID = {
  admin: "e2e00000-0000-4000-8000-000000000001",
  mitglied: "e2e00000-0000-4000-8000-000000000002",
  neu: "e2e00000-0000-4000-8000-000000000004",
  kind: "e2e00000-0000-4000-8000-000000000005",
  mia: "e2e00000-0000-4000-8000-000000000006",
  max: "e2e00000-0000-4000-8000-000000000007",
  kira: "e2e00000-0000-4000-8000-000000000008",
};

/**
 * Feste Mitspieler: haben im Seed keine Buchungen und spielen nur dort, wo
 * ein Test sie einträgt. Kira Kasse hat ein aktives Mandat für die Kasse.
 */
export const MITSPIELER = { mia: "Mia Mitspiel", max: "Max Mitspiel" };
export const ZAHLERIN = "Kira Kasse";

export async function anmelden(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(PASSWORT);
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

/** Ein Tag ab heute, in Berliner Zeit, als JJJJ-MM-TT. */
export function tagIn(tage: number): string {
  const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const d = new Date(`${heute}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/**
 * Ein fester Termin im Raster des Belegungsplans (Breitbild).
 *
 * Die Tests buchen nur im Fenster, das der Seed frei hält: 08:00 und 11–15 Uhr,
 * jeder Test auf seinem eigenen Platz und Tag. Das globalSetup räumt die
 * Buchungen der Testkonten dort vorher weg (testbestand-zuruecksetzen.ts).
 */
export function freieStunde(page: Page, platz: string, uhr: string): Locator {
  return page
    .locator(`.plan-raster .spalte[aria-label="${platz}"]`)
    .getByRole("button", { name: `${platz} um ${uhr} buchen` });
}

/** Den Plan eines Tages öffnen und den festen Termin anklicken. */
export async function oeffneFreieStunde(page: Page, tag: string, platz: string, uhr: string) {
  await page.goto(`/plan?tag=${tag}`);
  const zelle = freieStunde(page, platz, uhr);
  await expect(zelle, `${platz} um ${uhr} am ${tag} ist nicht frei`).toBeVisible();
  await zelle.click();
  const fenster = page.locator("dialog.fenster");
  await expect(fenster).toBeVisible();
  return fenster;
}

/** Einen festen Mitspieler über die Suche im Buchungsblatt eintragen. */
export async function mitspielerWaehlen(fenster: Locator, name: string) {
  const feld = fenster.getByLabel("Mitspieler suchen");
  if (!(await feld.isVisible())) await fenster.getByRole("button", { name: "Mitglied" }).click();
  await feld.fill(name);
  const [vorname, nachname] = name.split(" ");
  const treffer = fenster.locator(".trefferliste li button").filter({ hasText: `${nachname}, ${vorname}` });
  await expect(treffer).toHaveCount(1);
  await treffer.click();
}
