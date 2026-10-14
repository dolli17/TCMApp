import { expect, test, type Page } from "@playwright/test";
import { anmelden, NUTZER } from "./hilfen";

/**
 * Pflicht-Onboarding nach dem ersten Login.
 *
 * neu@ und kind@ setzt das globalSetup vor jedem Lauf zurück
 * (onboarding-zuruecksetzen.ts). Die Tests in dieser Datei bauen
 * aufeinander auf: neu@ schließt ab, danach prüft der Vorstand das Mandat.
 */

test.describe.configure({ mode: "serial" });

/** Eine gültige Test-IBAN (Prüfziffer stimmt). */
const IBAN = "DE89 3704 0044 0532 0130 00";

async function schritt(page: Page, titel: string) {
  await expect(page.getByRole("heading", { level: 1, name: `${titel}.` })).toBeVisible({ timeout: 20_000 });
}

test.describe("Onboarding", () => {
  test("neu@: gesperrt bis zum Mandat, danach ist alles offen", async ({ page }) => {
    await anmelden(page, NUTZER.neu);
    await expect(page).toHaveURL(/\/onboarding/);

    // Die Sperre: jeder andere Pfad führt zurück ins Onboarding.
    await page.goto("/plan");
    await expect(page).toHaveURL(/\/onboarding/);
    await page.goto("/konto");
    await expect(page).toHaveURL(/\/onboarding/);
    // Kein Menü der App im Onboarding, aber Abmelden.
    await expect(page.locator(".seitenleiste")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Abmelden" })).toBeVisible();
    // Die Rechtstexte bleiben lesbar.
    await page.goto("/satzung");
    await expect(page.getByRole("heading", { level: 1, name: "Satzung." })).toBeVisible();
    await expect(page.getByText(/Version 1, gültig ab/)).toBeVisible();

    // Schritt: Deine Daten - vorbelegt, nur bestätigen.
    await page.goto("/onboarding");
    await schritt(page, "Deine Daten");
    await expect(page.getByLabel("Vorname")).toHaveValue("Nora");
    await page.getByRole("button", { name: "Daten bestätigen" }).click();

    // Schritt: Rechtliches - erst mit allen drei Häkchen.
    await schritt(page, "Satzung und Datenschutz");
    const weiter = page.getByRole("button", { name: "Zustimmen und weiter" });
    await expect(weiter).toBeDisabled();
    await page.getByLabel(/Ich akzeptiere die Satzung/).check();
    await page.getByLabel(/Ich akzeptiere die Beitragsordnung/).check();
    await page.getByLabel(/Datenschutzerklärung zur Kenntnis genommen/).check();
    await weiter.click();

    // Schritt: Notfallkontakt - bei Erwachsenen freiwillig.
    await schritt(page, "Notfallkontakt");
    await page.getByRole("button", { name: "Überspringen" }).click();

    // Schritt: Mandat
    await schritt(page, "SEPA-Lastschriftmandat");
    await expect(page.locator(".mandatstext")).toContainText("Gläubiger-Identifikationsnummer: DE98ZZZ09999999999");
    await expect(page.locator(".mandatstext")).toContainText("Ich ermächtige");
    await expect(page.locator("dt", { hasText: "Beitragsart" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Kontoinhaber/ })).toHaveValue("Nora Neumitglied");

    const knopf = page.getByRole("button", { name: "Mandat erteilen und Konto freischalten" });
    await page.getByLabel("IBAN").fill("DE89370400440532013001");
    await page.getByLabel("IBAN").blur();
    await expect(page.getByText("Diese IBAN ist nicht gültig")).toBeVisible();
    await page.getByLabel(/Ich erteile dieses SEPA-Lastschriftmandat/).check();
    await expect(knopf).toBeDisabled();

    await page.getByLabel("IBAN").fill(IBAN);
    await expect(page.getByText("Diese IBAN ist nicht gültig")).toHaveCount(0);
    await knopf.click();

    // Freigeschaltet: jetzt die freiwilligen Schritte, alle überspringbar.
    await schritt(page, "Einwilligungen");
    await expect(page.getByText(/Optional · Schritt 1 von 3/)).toBeVisible();
    // Nichts vorausgewählt.
    for (const box of await page.locator(".schalter input[type=checkbox]").all()) {
      await expect(box).not.toBeChecked();
    }
    await page.getByRole("button", { name: "Überspringen" }).click();
    await schritt(page, "Tennis");
    await page.getByRole("button", { name: "Überspringen" }).click();
    await schritt(page, "App-Einstellungen");
    await page.getByRole("button", { name: "Überspringen" }).click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });

    // Jetzt ist der Plan erreichbar, und das Onboarding führt zurück nach Home.
    await page.goto("/plan");
    await expect(page).toHaveURL(/\/plan/);
    await page.goto("/onboarding");
    await expect(page).toHaveURL((u) => u.pathname === "/");

    // Das Mandat steht unter Konto → Bank, ohne Hinweis auf Überweisung.
    await page.goto("/konto/bank");
    await expect(page.getByText("Online erteilt am")).toBeVisible();
    await expect(page.getByText("•••• 3000")).toBeVisible();
    await expect(page.getByText(/TCM-/)).toBeVisible();
    await expect(page.getByText(/Überweisung/)).toHaveCount(0);
  });

  test("der Vorstand sieht das online erteilte Mandat", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder?filter=alle&q=Neumitglied");
    const zeile = page.locator('.liste-gruppe[aria-label="Mitglieder"] li').filter({ hasText: "Nora" });
    const href = await zeile.locator("a").first().getAttribute("href");
    await page.goto(`${href}?teil=bank`);
    const karte = page.locator('section[aria-label="Bankverbindung und Mandat"]');
    await expect(karte).toContainText("•••• 3000");
    await expect(karte.locator(".liste-gruppe .hinweis-rechts.gruen")).toContainText("aktiv");
  });

  test("kind@: Erziehungsberechtigte sind Pflicht, der Notfallkontakt ist vorbelegt", async ({ page }) => {
    await anmelden(page, NUTZER.kind);
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByText("Du richtest das Konto für Kian Neumitglied ein.")).toBeVisible();

    await schritt(page, "Deine Daten");
    await page.getByRole("button", { name: "Daten bestätigen" }).click();
    await schritt(page, "Satzung und Datenschutz");
    await page.getByLabel(/Ich akzeptiere die Satzung/).check();
    await page.getByLabel(/Ich akzeptiere die Beitragsordnung/).check();
    await page.getByLabel(/Datenschutzerklärung zur Kenntnis genommen/).check();
    await page.getByRole("button", { name: "Zustimmen und weiter" }).click();

    // Ohne die Erziehungsberechtigten geht es nicht weiter, auch nicht per Adresse.
    await schritt(page, "Erziehungsberechtigte");
    await page.goto("/onboarding?schritt=sepa");
    await schritt(page, "Erziehungsberechtigte");

    await page.getByLabel("Name der/des Erziehungsberechtigten").fill("Erika Neumitglied");
    await page.getByLabel("Telefon der/des Erziehungsberechtigten").fill("0170 7654321");
    // Ohne Zustimmung lehnt die Datenbank ab.
    await page.getByRole("button", { name: "Speichern und weiter" }).click();
    await expect(page.locator(".hinweis.fehler")).toContainText("zustimmen");
    await page.getByLabel(/stimme ich der Mitgliedschaft von Kian/).check();
    await page.getByRole("button", { name: "Speichern und weiter" }).click();

    // Notfallkontakt: Pflicht, kein Überspringen, vorbelegt mit den Eltern.
    await schritt(page, "Notfallkontakt");
    await expect(page.getByRole("button", { name: "Überspringen" })).toHaveCount(0);
    await expect(page.getByLabel("Name")).toHaveValue("Erika Neumitglied");
    await expect(page.getByLabel("Telefon")).toHaveValue("0170 7654321");
    await page.getByRole("button", { name: "Speichern und weiter" }).click();

    // Mandat: Kontoinhaber ist ein Elternteil.
    await schritt(page, "SEPA-Lastschriftmandat");
    await expect(page.getByText("Name des Elternteils, dem das Konto gehört.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Kontoinhaber/ })).toHaveValue("Erika Neumitglied");

    // Noch gesperrt.
    await page.goto("/plan");
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test("Bestand: mitglied@ sieht kein Onboarding", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await expect(page).not.toHaveURL(/\/onboarding/);
    await page.goto("/plan");
    await expect(page).toHaveURL(/\/plan/);
    await page.goto("/onboarding");
    await expect(page).toHaveURL((u) => u.pathname === "/");
  });

  test("Satzung und Beitragsordnung sind ohne Anmeldung lesbar", async ({ page }) => {
    await page.goto("/beitragsordnung");
    await expect(page.getByRole("heading", { level: 1, name: "Beitragsordnung." })).toBeVisible();
    await page.goto("/datenschutz");
    await expect(page.getByText(/Version 1, gültig ab/)).toBeVisible();
  });
});
