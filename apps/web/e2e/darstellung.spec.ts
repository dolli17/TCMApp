import { expect, test, type Page } from "@playwright/test";

/**
 * Darstellung: Theme-Wahl und die beiden Layoutzustände.
 *
 * Diese Tests greifen bewusst nicht auf Klassennamen zu, wo eine Rolle oder
 * eine Beschriftung reicht - sonst brechen sie beim nächsten Designwechsel
 * wieder, ohne dass etwas kaputt wäre.
 */

import { anmelden as anmeldenAls, freieStunde, mitspielerWaehlen, MITSPIELER, NUTZER, tagIn } from "./hilfen";

/** Der Tag nach heute in Europe/Berlin, JJJJ-MM-TT. 11–15 Uhr hält der Seed dort frei. */
const morgen = () => tagIn(1);

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

test.describe("Anmeldeseiten", () => {
  test("folgen dem gewählten Theme: hell ist weiß", async ({ page }) => {
    // Seit dem Stitch-Design gibt es keine erzwungen dunkle Bühne mehr.
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.setItem("tcm-theme", "hell");
      document.documentElement.setAttribute("data-theme", "hell");
    });
    const grund = await page.locator(".auth").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(grund).toBe("rgb(255, 255, 255)");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Willkommen zurück auf dem Platz.");
    await expect(page.getByRole("link", { name: "Antrag stellen" })).toBeVisible();
  });
});

test.describe("Layout", () => {
  // "/" ist Home - mit wischbaren Reihen bis an den Rand besonders anfaellig.
  const SEITEN = ["/", "/plan", "/plan/spiele", "/verein/getraenke", "/verein/veranstaltungen", "/konto", "/konto/daten", "/konto/tennis", "/konto/mannschaft"];

  test.describe("Telefon (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("Bottom-Navigation statt Seitenleiste", async ({ page }) => {
      await anmelden(page);
      await page.goto("/plan");

      await expect(page.locator(".schwebeleiste")).toBeVisible();
      await expect(page.locator(".seitenleiste")).toBeHidden();
    });

    test("die Plätze zeigen am Telefon denselben Belegungsplan", async ({ page }) => {
      // Eine Darstellung für alle Breiten (docs/design/stitch): das Raster mit
      // acht schmalen Spalten, keine zweite Ansicht "Freie Zeiten".
      await anmelden(page);
      await page.goto(`/plan?tag=${morgen()}`);

      await expect(page.locator(".plan-raster .raster")).toBeVisible();
      await expect(page.locator(".raster .spalten-kopf")).toHaveCount(8);
      await expect(page.getByRole("radio", { name: "Freie Zeiten" })).toHaveCount(0);
    });

    test("eine halbe Stunde ist am Telefon mindestens 44 Pixel hoch", async ({ page }) => {
      // U18: mit dem Finger zu treffen.
      await anmelden(page);
      await page.goto(`/plan?tag=${morgen()}`);

      const slot = await page.locator(".frei-slot").first().boundingBox();
      expect(slot!.height).toBeGreaterThanOrEqual(44);
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

    test("nach dem Buchen steht die Bestätigung unten im Bild, die Zeile ist markiert (U16)", async ({ page }) => {
      // Fester Termin: Tag +3, Platz 7, 14:00 - im Fenster, das der Seed frei
      // hält, und von keinem anderen Test belegt (siehe ablaeufe.spec.ts).
      await anmelden(page);
      await page.goto(`/plan?tag=${tagIn(3)}`);
      const eigen = page.locator('.spalte[aria-label="Platz 7"] .beleg.eigen');
      await page.getByRole("button", { name: "Platz 7 um 14:00 buchen" }).click();
      const fenster = page.locator("dialog.fenster");
      await expect(fenster).toBeVisible();
      await mitspielerWaehlen(fenster, MITSPIELER.max);
      await fenster.getByRole("button", { name: /buchen/i }).click();

      // Die Meldung steht unten, wo der Daumen war - vorher oben ausser Sicht.
      const toast = page.locator(".toast-ort .hinweis.erfolg");
      await expect(toast).toContainText("gebucht", { timeout: 15_000 });
      await expect(toast).toBeInViewport();
      expect((await toast.boundingBox())!.y).toBeGreaterThan(844 / 2);
      await expect(eigen).toHaveClass(/markiert/);

      // Aufräumen
      await eigen.click();
      await fenster.getByRole("button", { name: "Buchung stornieren" }).click();
      await fenster.getByRole("button", { name: "Wirklich stornieren" }).click();
      await expect(toast).toContainText("storniert", { timeout: 15_000 });
      await expect(eigen).toHaveCount(0);
    });

    test("die schwebende Leiste eines Admins sprengt die Breite nicht", async ({ page }) => {
      // Ein Admin hat die vier Haupteinträge und dazu den Tab „Verwaltung“
      // (docs/design/clubhaus/verwaltung, Regel 1); die Glocke sitzt im
      // Seitenkopf. Das Dokument darf sich in keinem Fall mitverschieben.
      await anmelden(page, ADMIN);
      await page.goto("/plan");

      // Start, Plätze, Verein, Konto, Verwaltung
      await expect(page.locator(".schwebeleiste a")).toHaveCount(5);
      await expect(page.locator(".seitenkopf .glocke")).toHaveCount(1);
      await expect(page.locator('a[aria-label="Platz buchen"]')).toHaveCount(0);
      const ueberbreite = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(ueberbreite, `Die Seite ist ${ueberbreite}px zu breit`).toBeLessThanOrEqual(0);
    });

    test("die Tabs eines Admins bleiben auch bei 320 px in der Leiste", async ({ page }) => {
      // „Verwaltung“ ist der längste Tab (U7). Er darf weder abgeschnitten
      // werden noch aus dem Bildschirm ragen. Einen runden Buchen-Knopf
      // neben der Leiste gibt es nicht mehr (U43).
      await anmelden(page, ADMIN);
      await page.goto("/plan");
      for (const breite of [320, 360, 390]) {
        await page.setViewportSize({ width: breite, height: 700 });
        const mass = await page.evaluate(() => {
          const leiste = document.querySelector(".schwebeleiste")!.getBoundingClientRect();
          const tabs = [...document.querySelectorAll<HTMLElement>(".schwebeleiste a")];
          return {
            leisteRechts: leiste.right,
            tabRechts: Math.max(...tabs.map((a) => a.getBoundingClientRect().right)),
            fensterRechts: document.documentElement.clientWidth,
            beschnitten: tabs.filter((a) => a.scrollWidth > a.clientWidth).map((a) => a.textContent),
          };
        });
        expect(mass.tabRechts, `${breite}px: Tab ragt aus der Leiste`).toBeLessThanOrEqual(mass.leisteRechts);
        expect(mass.leisteRechts, `${breite}px: Leiste ragt aus dem Bildschirm`).toBeLessThanOrEqual(mass.fensterRechts);
        expect(mass.beschnitten, `${breite}px`).toEqual([]);
      }
    });

    test("ein Admin erreicht die Verwaltung über den Tab „Verwaltung“", async ({ page }) => {
      await anmelden(page, ADMIN);
      await page.goto("/konto");
      const tab = page.locator(".schwebeleiste").getByRole("link", { name: "Verwaltung" });
      await tab.click();
      await page.waitForURL(/\/admin$/);
      // Auch in einem Bereich der Verwaltung bleibt der Tab hervorgehoben.
      await page.goto("/admin/kasse");
      await expect(tab).toHaveAttribute("aria-current", "page");
    });

    test("ein normales Mitglied hat keinen Tab „Verwaltung“", async ({ page }) => {
      await anmelden(page);
      await page.goto("/plan");
      await expect(page.locator(".schwebeleiste a")).toHaveCount(4);
    });

    test("das Buchungsfenster passt auf 390 Pixel", async ({ page }) => {
      await anmelden(page);
      await page.goto("/plan");

      // Eine freie Zeit im Raster oeffnet das Blatt. Morgen, damit noch etwas frei ist.
      await page.goto(`/plan?tag=${morgen()}`);
      const slot = page.locator(".plan-raster button.frei-slot").first();
      await expect(slot).toBeVisible();
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

      await expect(page.locator(".plan-raster .raster")).toBeVisible();
    });

    test("freie Zeit zeigt sich auch beim Tastatur-Fokus und öffnet mit Enter", async ({ page }) => {
      await anmelden(page);
      // Morgen statt heute: am Abend ist heute keine Stunde mehr frei.
      await page.goto(`/plan?tag=${morgen()}`);

      const uhr = "11:00";
      const frei = freieStunde(page, "Platz 1", uhr);
      await expect(frei).toBeVisible();

      // Wer mit der Tastatur kommt, sieht denselben gestrichelten Block wie mit der Maus.
      await frei.focus();
      await expect(frei.locator(".vorschau")).toBeVisible();
      await expect(frei.locator(".vorschau")).toHaveText(`+ ${uhr} buchen`);

      await page.keyboard.press("Enter");
      const fenster = page.locator("dialog.fenster");
      await expect(fenster).toBeVisible();
      await expect(fenster.locator(".fenster-kopf h2")).toContainText(uhr);
      await page.keyboard.press("Escape");
      await expect(fenster).toHaveCount(0);
    });

    test("„Jetzt frei“ öffnet das Blatt für genau diesen Platz (U68)", async ({ page }) => {
      await anmelden(page);
      await page.goto("/");

      // Am späten Abend ist heute nichts mehr frei - dann gibt es keine Karte.
      // Ab 768 px stehen nur die ersten vier Karten da.
      const karten = page.locator(".frei-reihe a:visible");
      test.skip((await karten.count()) === 0, "heute ist kein Platz mehr frei");
      const karte = karten.last();
      expect(await karte.getAttribute("href")).toMatch(/^\/plan\?buchen=jetzt&platz=/);
      const name = await karte.locator("b").first().innerText();

      await karte.click();
      const fenster = page.locator("dialog.fenster");
      await expect(fenster).toBeVisible();
      await expect(fenster.locator(".fenster-kopf")).toContainText(name);
      // Die Parameter sind aus der Adresse verschwunden: Neuladen öffnet nichts.
      await expect(page).toHaveURL(/\/plan$/);
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
  test("Die Schriften kommen vom eigenen Server, nicht von Google", async ({ page }) => {
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
