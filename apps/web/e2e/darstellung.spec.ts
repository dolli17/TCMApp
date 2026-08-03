import { expect, test, type Page } from "@playwright/test";

/**
 * Darstellung: Theme-Wahl und die beiden Layoutzustände.
 *
 * Diese Tests greifen bewusst nicht auf Klassennamen zu, wo eine Rolle oder
 * eine Beschriftung reicht - sonst brechen sie beim nächsten Designwechsel
 * wieder, ohne dass etwas kaputt wäre.
 */

const PASSWORT = process.env.DEV_PASSWORD ?? "";
const MITGLIED = process.env.DEV_USER_MEMBER ?? "";

async function anmelden(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(MITGLIED);
  await page.getByLabel("Passwort").fill(PASSWORT);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
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
    // #091622 - der Hintergrund des dunklen Themes
    expect(dunkel).toBe("rgb(9, 22, 34)");
  });
});

test.describe("Layout", () => {
  const SEITEN = ["/plan", "/getraenke", "/konto"];

  test.describe("Telefon (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("Bottom-Navigation statt Seitenleiste", async ({ page }) => {
      await anmelden(page);
      await page.goto("/plan");

      await expect(page.locator(".bottomnav")).toBeVisible();
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
  });

  test.describe("Rechner (1440px)", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("Seitenleiste statt Bottom-Navigation", async ({ page }) => {
      await anmelden(page);
      await page.goto("/plan");

      await expect(page.locator(".seitenleiste")).toBeVisible();
      await expect(page.locator(".bottomnav")).toBeHidden();
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
