import { expect, test, type Locator, type Page } from "@playwright/test";
import { anmelden, NUTZER, PASSWORT } from "./hilfen";
import { blatt, zeileIn } from "./verwaltung-hilfen";

/**
 * Die Getränkekarte pflegen: anlegen, ändern, Reihenfolge, stilllegen und
 * wieder anbieten.
 *
 * Ein Getränk lässt sich nicht löschen (seine Buchungen hängen daran). Die
 * Tests arbeiten deshalb mit genau einem, das am Ende stillgelegt ist: der
 * erste Lauf legt es an, jeder weitere bietet es wieder an und ändert es.
 */

const GETRAENK = "ZZTest Brause";

function erfolg(page: Page): Locator {
  return page.locator(".hinweis.erfolg");
}

function zeile(page: Page): Locator {
  return zeileIn(page, "Getränke", GETRAENK);
}

async function oeffnen(page: Page): Promise<Locator> {
  await zeile(page).locator("button.listenzeile").click();
  const fenster = blatt(page);
  await expect(fenster).toContainText("Getränk bearbeiten");
  return fenster;
}

/** Die Namen der Karte in ihrer Reihenfolge. */
async function reihenfolge(page: Page): Promise<string[]> {
  return (await page.locator('.liste-gruppe[aria-label="Getränke"] > li .titel').allTextContents()).map((t) => t.trim());
}

test.describe("Getränkekarte pflegen", () => {
  test.skip(!NUTZER.admin || !NUTZER.mitglied || !PASSWORT, "Testkonten fehlen in .env.local");

  test("anlegen, ändern, verschieben, stilllegen und wieder anbieten", async ({ page }) => {
    test.setTimeout(90_000);
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/getraenke");
    await expect(page.getByRole("heading", { name: "Getränkekarte" })).toBeVisible();

    // Erster Lauf: anlegen, mit Preis - ohne Preis wäre es unbuchbar.
    if ((await zeile(page).count()) === 0) {
      await page.getByRole("button", { name: "Getränk anlegen" }).click();
      const neu = blatt(page);
      await neu.getByLabel("Name").fill(GETRAENK);
      await expect(neu.getByRole("button", { name: "Getränk anlegen" })).toBeDisabled();
      await neu.getByLabel("Preis").fill("1,10");
      await neu.getByRole("button", { name: "Getränk anlegen" }).click();
      await expect(neu.locator(".hinweis.erfolg")).toHaveText("Getränk angelegt.", { timeout: 20_000 });
      await page.reload();
    }
    await expect(zeile(page)).toHaveCount(1);

    // Ein früherer Lauf hat es stillgelegt: wieder anbieten.
    if ((await zeile(page).locator(".statusmarke", { hasText: "stillgelegt" }).count()) > 0) {
      const fenster = await oeffnen(page);
      await fenster.getByRole("button", { name: "Wieder anbieten" }).click();
      await expect(erfolg(page)).toHaveText("Getränk ist wieder in der Karte.", { timeout: 20_000 });
    }
    await expect(zeile(page).locator(".statusmarke")).toHaveCount(0);

    // Ändern: Beschreibung und Preis; der neue Preis gilt sofort.
    const cent = (Date.now() % 80) + 10;
    const beschreibung = `0,33 Liter, Lauf ${Date.now().toString().slice(-6)}`;
    let fenster = await oeffnen(page);
    await fenster.getByLabel("Beschreibung").fill(beschreibung);
    await fenster.getByLabel(/^Preis/).fill(`1,${cent}`);
    await fenster.getByRole("button", { name: "Änderungen speichern" }).click();
    // Das Blatt schließt sich nach dem Speichern; die Zeile zeigt das Ergebnis.
    await expect(fenster).toBeHidden({ timeout: 20_000 });
    await expect(zeile(page)).toContainText(beschreibung);
    await expect(zeile(page).locator(".betrag")).toHaveText(new RegExp(`^1,${cent}\\s€$`));

    // Das Mitglied sieht es in seiner Karte, zum neuen Preis.
    const mitglied = await page.context().browser()!.newContext();
    const theke = await mitglied.newPage();
    await anmelden(theke, NUTZER.mitglied);
    await theke.goto("/verein/getraenke");
    await expect(theke.getByText(GETRAENK).first()).toBeVisible();

    // Reihenfolge: eins nach oben und wieder zurück.
    const vorher = await reihenfolge(page);
    const platz = vorher.indexOf(GETRAENK);
    expect(platz).toBeGreaterThan(0);
    fenster = await oeffnen(page);
    await fenster.getByRole("button", { name: "Weiter nach oben" }).click();
    await expect(erfolg(page)).toHaveText("Reihenfolge gespeichert.", { timeout: 20_000 });
    await page.reload();
    expect((await reihenfolge(page)).indexOf(GETRAENK)).toBe(platz - 1);

    fenster = await oeffnen(page);
    await fenster.getByRole("button", { name: "Weiter nach unten" }).click();
    await expect(erfolg(page)).toHaveText("Reihenfolge gespeichert.", { timeout: 20_000 });
    await page.reload();
    expect(await reihenfolge(page)).toEqual(vorher);

    // Stilllegen: aus der Karte der Mitglieder verschwunden, in der Verwaltung markiert.
    fenster = await oeffnen(page);
    await fenster.getByRole("button", { name: "Stilllegen" }).click();
    await expect(erfolg(page)).toContainText("Getränk stillgelegt.", { timeout: 20_000 });
    await expect(zeile(page).locator(".statusmarke")).toHaveText("stillgelegt");
    await theke.reload();
    await expect(theke.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(theke.getByText(GETRAENK)).toHaveCount(0);
    await mitglied.close();
  });
});
