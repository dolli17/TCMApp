import { expect, test, type Page } from "@playwright/test";

/**
 * Darstellung: Theme-Wahl und die beiden Layoutzustände.
 *
 * Diese Tests greifen bewusst nicht auf Klassennamen zu, wo eine Rolle oder
 * eine Beschriftung reicht - sonst brechen sie beim nächsten Designwechsel
 * wieder, ohne dass etwas kaputt wäre.
 */

import { anmelden as anmeldenAls, NUTZER } from "./hilfen";

const MITGLIED = NUTZER.mitglied;
const ADMIN = NUTZER.admin;

/** Ohne Angabe meldet sich hier das normale Mitglied an. */
async function anmelden(page: Page, email: string = MITGLIED) {
  await anmeldenAls(page, email);
}

test.describe("Theme", () => {
  test("die Wahl bleibt nach dem Neuladen erhalten", async ({ page }) => {
    await anmelden(page);
    await page.goto("/konto");

    await page.getByRole("group", { name: "Erscheinungsbild" }).getByRole("button", { name: "Dunkel" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dunkel");

    // Der eigentliche Punkt: nach dem Neuladen muss das Attribut sofort da
    // sein. Setzt es erst React, blitzt beim Laden das helle Theme auf.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dunkel");
  });

  test("zurück auf Systemeinstellung entfernt die Übersteuerung", async ({ page }) => {
    await anmelden(page);
    await page.goto("/konto");

    const gruppe = page.getByRole("group", { name: "Erscheinungsbild" });
    await gruppe.getByRole("button", { name: "Hell" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "hell");

    await gruppe.getByRole("button", { name: "System" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  });

  test("das dunkle Theme färbt tatsächlich um", async ({ page }) => {
    await anmelden(page);
    await page.goto("/konto");
    const gruppe = page.getByRole("group", { name: "Erscheinungsbild" });

    await gruppe.getByRole("button", { name: "Hell" }).click();
    const hell = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await gruppe.getByRole("button", { name: "Dunkel" }).click();
    const dunkel = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    expect(hell).not.toBe(dunkel);
    // #07111D - der Hintergrund des dunklen Themes
    expect(dunkel).toBe("rgb(7, 17, 29)");
  });
});

test.describe("Layout", () => {
  // "/" ist Home - mit wischbaren Reihen bis an den Rand besonders anfaellig.
  const SEITEN = ["/", "/plan", "/getraenke", "/konto"];

  test.describe("Telefon (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("Bottom-Navigation statt Seitenleiste", async ({ page }) => {
      await anmelden(page);
      await page.goto("/plan");

      await expect(page.locator(".schwebeleiste")).toBeVisible();
      await expect(page.locator(".seitenleiste")).toBeHidden();
    });

    test("der Belegungsplan zeigt Karten statt Raster", async ({ page }) => {
      // Ein Raster mit acht Spalten waere auf 390 Pixel unbedienbar.
      await anmelden(page);
      await page.goto("/plan");

      await expect(page.locator(".plan-listen")).toBeVisible();
      await expect(page.locator(".plan-raster")).toBeHidden();
      await expect(page.locator(".platzkarte")).toHaveCount(8);
    });

    for (const pfad of SEITEN) {
      test(`${pfad} scrollt nicht waagerecht`, async ({ page }) => {
        await anmelden(page);
        await page.goto(pfad);

        const ueberbreite = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(ueberbreite, `${pfad} ist ${ueberbreite}px zu breit`).toBeLessThanOrEqual(0);
      });
    }

    test("die schwebende Leiste eines Admins sprengt die Breite nicht", async ({ page }) => {
      // Auch ein Admin hat nur die vier Haupteinträge; die Glocke sitzt im
      // Seitenkopf. Vorher waren es acht Einträge, und die Leiste musste
      // seitwärts scrollen. Das Dokument darf sich in keinem Fall mitverschieben.
      await anmelden(page, ADMIN);
      await page.goto("/plan");

      // Home, Plätze, Getränke, Konto
      await expect(page.locator(".schwebeleiste a")).toHaveCount(4);
      await expect(page.locator(".seitenkopf .glocke")).toHaveCount(1);
      const ueberbreite = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(ueberbreite, `Die Seite ist ${ueberbreite}px zu breit`).toBeLessThanOrEqual(0);
    });

    test("ein Admin erreicht die Verwaltung über die Konto-Seite", async ({ page }) => {
      await anmelden(page, ADMIN);
      await page.goto("/konto");
      await page.locator("a.verwaltung-einstieg").click();
      await page.waitForURL(/\/admin$/);
    });

    test("das Buchungsfenster passt auf 390 Pixel", async ({ page }) => {
      await anmelden(page);
      await page.goto("/plan");

      const slot = page.locator(".plan-listen .slotknopf").first();
      test.skip((await slot.count()) === 0, "Heute ist keine Stunde mehr frei");
      await slot.click();

      const fenster = page.locator("dialog.fenster");
      await expect(fenster).toBeVisible();

      const breite = await fenster.evaluate((el) => el.getBoundingClientRect().width);
      expect(breite).toBeLessThanOrEqual(390);

      const ueberbreite = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(ueberbreite, `Die Seite ist ${ueberbreite}px zu breit`).toBeLessThanOrEqual(0);
    });
  });

  test.describe("Rechner (1440px)", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("Seitenleiste statt Bottom-Navigation", async ({ page }) => {
      await anmelden(page);
      await page.goto("/plan");

      await expect(page.locator(".seitenleiste")).toBeVisible();
      await expect(page.locator(".schwebeleiste")).toBeHidden();
    });

    test("der Belegungsplan zeigt das volle Raster", async ({ page }) => {
      await anmelden(page);
      await page.goto("/plan");

      await expect(page.locator("table.plan")).toBeVisible();
      await expect(page.locator(".plan-listen")).toBeHidden();
    });

    for (const pfad of SEITEN) {
      test(`${pfad} scrollt nicht waagerecht`, async ({ page }) => {
        await anmelden(page);
        await page.goto(pfad);

        const ueberbreite = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(ueberbreite, `${pfad} ist ${ueberbreite}px zu breit`).toBeLessThanOrEqual(0);
      });
    }
  });
});

test.describe("Schriften", () => {
  test("Barlow kommt vom eigenen Server, nicht von Google", async ({ page }) => {
    // Ein Aufruf an fonts.gstatic.com wuerde die IP jedes Mitglieds an Google
    // schicken - in Deutschland abgemahnt und fuer einen Verein vermeidbar.
    const fremdeAufrufe: string[] = [];
    page.on("request", (r) => {
      const url = r.url();
      if (/fonts\.(googleapis|gstatic)\.com/.test(url)) fremdeAufrufe.push(url);
    });

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    expect(fremdeAufrufe, "Aufrufe an Google Fonts").toEqual([]);
  });
});
