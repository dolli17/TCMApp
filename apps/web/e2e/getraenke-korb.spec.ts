import { expect, test } from "@playwright/test";

/**
 * Der Getränke-Korb (U17, B18) und der Kiosk nach einer Buchung (B8).
 *
 * U17: Mit "+" ist nichts gebucht. Wer die Seite mit vollem Korb verlässt,
 * wird gefragt, und der Korb ist bei der Rückkehr noch da.
 * B18: Während des Sendens ist die Karte gesperrt.
 * B8: Nach der Buchung sind Korb und Person am Kiosk sofort leer; wer in der
 * Bestätigung schon tippt, beginnt neu, und der Timer nimmt ihm nichts weg.
 */

import { anmelden, NUTZER } from "./hilfen";

test.describe("Getränke-Korb", () => {
  test("ein voller Korb fragt beim Verlassen und ist bei der Rückkehr noch da", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/verein/getraenke");

    const leiste = page.getByRole("region", { name: "Gewählte Getränke" });
    const mehr = page.getByRole("button", { name: /eins mehr/ }).first();
    await mehr.click();
    await mehr.click();
    await expect(leiste).toContainText("2 Getränke");
    await expect(leiste).toContainText("Noch nicht eingetragen");

    const veranstaltungen = page.getByRole("navigation", { name: "Bereich" }).getByRole("link", { name: "Veranstaltungen" });

    // Abbrechen: man bleibt bei den Getränken.
    let frage = "";
    page.once("dialog", (d) => {
      frage = d.message();
      void d.dismiss();
    });
    await veranstaltungen.click();
    await expect.poll(() => frage).toContain("noch nicht eingetragen");
    await expect(page).toHaveURL(/\/verein\/getraenke$/);
    await expect(leiste).toContainText("2 Getränke");

    // Bestätigen: man geht, der Korb bleibt gemerkt.
    page.once("dialog", (d) => void d.accept());
    await veranstaltungen.click();
    await expect(page).toHaveURL(/\/verein\/veranstaltungen$/);

    await page.getByRole("navigation", { name: "Bereich" }).getByRole("link", { name: "Getränke" }).click();
    await expect(page).toHaveURL(/\/verein\/getraenke$/);
    await expect(leiste).toContainText("2 Getränke");
    await expect(leiste).toContainText("Noch nicht eingetragen");

    // Aufräumen: leerer Korb, keine Rückfrage mehr.
    const weniger = page.getByRole("button", { name: /eins weniger/ }).first();
    await weniger.click();
    await weniger.click();
    await expect(leiste).toHaveCount(0);
    let gefragt = false;
    page.on("dialog", (d) => {
      gefragt = true;
      void d.dismiss();
    });
    await veranstaltungen.click();
    await expect(page).toHaveURL(/\/verein\/veranstaltungen$/);
    expect(gefragt, "Ohne Korb darf es keine Rückfrage geben").toBe(false);
  });

  test("während des Sendens ist die Karte gesperrt", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/verein/getraenke");

    // Server-Aktionen gehen als POST an die Seite - kurz aufhalten, damit
    // der Zustand "wird eingetragen" sichtbar bleibt.
    await page.route("**/verein/getraenke", async (route) => {
      if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    const vorher = await page.locator(".zuletzt li").count();
    const mehr = page.getByRole("button", { name: /eins mehr/ }).first();
    await mehr.click();
    await page.getByRole("button", { name: "Eintragen" }).click();

    await expect(page.getByRole("button", { name: "Wird eingetragen…" })).toBeVisible();
    await expect(mehr).toBeDisabled();
    await expect(page.getByRole("button", { name: /eins weniger/ }).first()).toBeDisabled();

    await expect(page.locator(".hinweis.erfolg")).toContainText("Eingetragen", { timeout: 15_000 });
    await expect(page.locator(".zuletzt li")).toHaveCount(vorher + 1);
    await expect(mehr).toBeEnabled();

    // Aufräumen: die Buchung wieder zurücknehmen.
    await page.unroute("**/verein/getraenke");
    await page.locator(".zuletzt li").first().getByRole("button", { name: "Zurücknehmen" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("Zurückgenommen", { timeout: 15_000 });
  });
});

test.describe("Kiosk nach der Buchung", () => {
  test("Korb und Person sind sofort leer, der Nächste bucht in einen neuen Korb", async ({ page }) => {
    await anmelden(page, NUTZER.kiosk);
    await page.goto("/kiosk");

    const suche = page.getByPlaceholder("Name eingeben…");
    const treffer = page.locator(".kiosk-treffer button");
    const kachel = page.locator(".kiosk-kacheln .kachel-knopf").first();
    const posten = page.locator(".kiosk-eintragen .posten li");

    // Der Erste bucht zwei.
    await suche.fill("a");
    await treffer.first().click();
    await kachel.click();
    await kachel.click();
    await page.getByRole("button", { name: /^Für .+ eintragen$/ }).click();
    await expect(page.locator(".kiosk-fertig")).toContainText("Eingetragen", { timeout: 15_000 });

    // Noch in der Bestätigung: nichts mehr gewählt, niemand mehr ausgewählt.
    await expect(page.locator(".kiosk-kacheln li.an")).toHaveCount(0);
    await expect(suche).toHaveValue("");

    // Der Nächste wählt sich und tippt eins - in einen leeren Korb.
    await suche.fill("e");
    const name = ((await treffer.nth(1).locator(".name").textContent()) ?? "").trim();
    await treffer.nth(1).click();
    await kachel.click();
    await expect(page.locator(".kiosk-fertig")).toHaveCount(0);
    await expect(page.locator(".kiosk-eintragen .wer")).toHaveText(name);
    await expect(posten).toHaveCount(1);
    await expect(posten.first()).toContainText("× 1");

    // Der alte Timer (2,5 s) darf den neuen Vorgang nicht zurücksetzen.
    await page.waitForTimeout(3_000);
    await expect(page.locator(".kiosk-eintragen .wer")).toHaveText(name);
    await expect(posten.first()).toContainText("× 1");

    // Nicht buchen - von vorn.
    await page.getByRole("button", { name: "Von vorn" }).click();
    await expect(posten).toHaveCount(0);
  });
});
