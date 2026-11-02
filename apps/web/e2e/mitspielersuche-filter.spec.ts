import { expect, test, type Page } from "@playwright/test";
import { alsListendatum, anmelden, NUTZER, oeffneFreieStunde, tagIn } from "./hilfen";

/**
 * Mitspielersuche mit „Nur für …“ (Vereinsentscheidung vom 02.11.2026).
 *
 * Fester Termin: Tag +6, Platz 2, 13:00 (im Fenster, das der Seed frei hält;
 * das globalSetup räumt dort die Buchungen der Testkonten weg).
 *
 * Das Testmitglied (mitglied@) hat im Seed keine LK und ist als Dame
 * eingetragen. Eine Suche „LK 10–16 · Herren“ schließt es also gleich doppelt
 * aus: open_matches zeigt sie nicht, und join_booking lehnt ab, wenn es über
 * den Plan doch versucht wird. Erst mit 1–25 und Alle darf es mitspielen.
 */

const TAG = tagIn(6);
const PLATZ = "Platz 2";
const ZEIT = "13:00";

function offeneKarte(page: Page) {
  return page
    .locator("section.offen .termin")
    .filter({ hasText: PLATZ })
    .filter({ hasText: ZEIT })
    .filter({ hasText: alsListendatum(TAG) });
}

async function oeffneBuchung(page: Page) {
  await page.goto(`/plan?tag=${TAG}`);
  await page.getByRole("button", { name: `Buchung ${ZEIT} auf ${PLATZ} verwalten` }).click();
  const fenster = page.locator("dialog.fenster");
  await expect(fenster).toBeVisible();
  return fenster;
}

test.describe("Mitspielersuche mit Filter", () => {
  test("Nur für LK 10–16 · Herren: anderes Mitglied sieht nichts und wird abgewiesen, gelockert darf es mitspielen", async ({
    page,
  }) => {
    // Fünf Anmeldungen und drei Schreibvorgänge - mehr als die 45 s Vorgabe.
    test.setTimeout(120_000);

    // Admin bucht ein Doppel, sucht Mitspieler und schränkt ein.
    await anmelden(page, NUTZER.admin);
    const fenster = await oeffneFreieStunde(page, TAG, PLATZ, ZEIT);
    await fenster.getByRole("radio", { name: "Doppel" }).check();
    await fenster.getByLabel("Mitspieler gesucht").check();

    const filter = fenster.locator("fieldset.suchfilter");
    await expect(filter).toBeVisible();
    // Ungültiger Bereich: der Hinweis steht über dem Knopf.
    await filter.getByLabel("LK von").fill("16");
    await filter.getByLabel("LK bis").fill("10");
    await expect(fenster.locator(".hinweis.besetzung")).toContainText("kleinere Zahl");

    await filter.getByLabel("LK von").fill("10");
    await filter.getByLabel("LK bis").fill("16");
    await filter.getByRole("radio", { name: "Herren" }).check();
    await fenster.getByRole("button", { name: /buchen/i }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gebucht", { timeout: 15_000 });

    // Der Bucher sieht seine Suche mit dem Zusatz.
    await page.goto("/plan/spiele");
    await expect(offeneKarte(page).locator(".offen-filter")).toHaveText("LK 10–16 · Herren");

    // Das Mitglied passt nicht: keine Karte unter „Offene Spiele“ ...
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan/spiele");
    await expect(page.locator("section.offen")).toBeVisible();
    await expect(offeneKarte(page)).toHaveCount(0);

    // ... und über den Plan lehnt join_booking mit verständlichem Text ab.
    const fremd = await oeffneBuchung(page);
    await expect(fremd.locator(".gesucht-text")).toContainText("LK 10–16 · Herren");
    await fremd.getByRole("button", { name: "Mitspielen" }).click();
    await expect(fremd.getByRole("alert")).toContainText("Diese Suche richtet sich an andere Spieler", {
      timeout: 15_000,
    });

    // Der Bucher lockert die Suche auf 1–25 und Alle.
    await anmelden(page, NUTZER.admin);
    const eigen = await oeffneBuchung(page);
    const block = eigen.locator(".suchfilter-block");
    await expect(block.getByLabel("LK von")).toHaveValue("10");
    await expect(block.getByLabel("LK bis")).toHaveValue("16");
    await expect(block.getByRole("radio", { name: "Herren" })).toBeChecked();
    await block.getByLabel("LK von").fill("1");
    await block.getByLabel("LK bis").fill("25");
    await block.getByRole("radio", { name: "Alle" }).check();
    await block.getByRole("button", { name: "Suche anpassen" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("angepasst", { timeout: 15_000 });

    // Jetzt sieht das Mitglied die Suche ohne Zusatz und trägt sich ein.
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan/spiele");
    const karte = offeneKarte(page);
    await expect(karte).toHaveCount(1);
    await expect(karte.locator(".offen-filter")).toHaveCount(0);
    await karte.getByRole("button", { name: "Mitspielen" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("eingetragen", { timeout: 15_000 });

    // Aufräumen: der Admin storniert.
    await anmelden(page, NUTZER.admin);
    const ende = await oeffneBuchung(page);
    await ende.getByRole("button", { name: "Buchung stornieren" }).click();
    await ende.getByRole("button", { name: "Wirklich stornieren" }).click();
    await expect(
      page.getByRole("button", { name: `Buchung ${ZEIT} auf ${PLATZ} verwalten` }),
    ).toHaveCount(0, { timeout: 15_000 });
  });
});
