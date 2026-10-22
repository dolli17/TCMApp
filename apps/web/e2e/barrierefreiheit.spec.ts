import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { anmelden, NUTZER } from "./hilfen";

/**
 * Automatische Prüfung auf Barrierefreiheit (U6).
 *
 * axe findet nicht alles - ob eine Beschriftung verständlich ist, sieht es
 * nicht. Was es findet, ist aber eindeutig: fehlende Namen, Kontraste unter
 * der Schwelle, falsch verschachtelte Rollen. Geprüft werden die Seiten, die
 * jedes Mitglied sieht, dazu die Verwaltung und die beiden öffentlichen
 * Formulare, jeweils hell und dunkel. Schwere Verstöße (critical, serious)
 * lassen den Test scheitern; die leichteren stehen im Bericht.
 */

const SCHWER = new Set(["critical", "serious"]);

async function pruefe(page: Page, pfad: string) {
  await page.goto(pfad);
  await page.waitForLoadState("networkidle");
  const ergebnis = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const schwer = ergebnis.violations
    .filter((v) => SCHWER.has(v.impact ?? ""))
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`);
  expect(schwer, `${pfad}\n${schwer.join("\n")}`).toEqual([]);
}

for (const schema of ["light", "dark"] as const) {
  test.describe(`axe, ${schema === "light" ? "hell" : "dunkel"}`, () => {
    test.use({ colorScheme: schema });

    test("Anmelden und Antrag", async ({ page }) => {
      await pruefe(page, "/login");
      await pruefe(page, "/antrag");
    });

    test("Seiten des Mitglieds", async ({ page }) => {
      await anmelden(page, NUTZER.mitglied);
      for (const pfad of ["/", "/plan", "/verein", "/konto"]) await pruefe(page, pfad);
    });

    test("Verwaltung", async ({ page }) => {
      await anmelden(page, NUTZER.admin);
      await pruefe(page, "/admin");
    });
  });
}
