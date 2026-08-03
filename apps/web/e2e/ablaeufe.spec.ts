import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-End gegen die laufende Anwendung und die echte Datenbank.
 *
 * Der Bestand ist synthetisch, deshalb sind echte Buchungen hier unbedenklich.
 * Der Gewinn: RLS, die Regeln in create_booking und die Fehlerübersetzung
 * werden mitgetestet - nichts davon wäre mit Mocks zu haben.
 */

const PASSWORT = process.env.DEV_PASSWORD ?? "";

const NUTZER = {
  mitglied: process.env.DEV_USER_MEMBER ?? "",
  vorstand: process.env.DEV_USER_BOARD ?? "",
  kassenwart: process.env.DEV_USER_TREASURER ?? "",
  sportwart: process.env.DEV_USER_SPORTS ?? "",
  kiosk: process.env.DEV_USER_KIOSK ?? "",
};

async function anmelden(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(PASSWORT);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
}

test.describe("Anmeldung", () => {
  test("ohne Anmeldung wird auf die Loginseite umgeleitet", async ({ page }) => {
    await page.goto("/plan");
    await expect(page).toHaveURL(/\/login/);
  });

  test("falsches Passwort wird abgewiesen, ohne zu verraten ob es die Adresse gibt", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("E-Mail").fill(NUTZER.mitglied);
    await page.getByLabel("Passwort").fill("definitiv-falsch");
    await page.getByRole("button", { name: "Anmelden" }).click();

    const meldung = page.locator(".hinweis.fehler");
    await expect(meldung).toBeVisible();
    await expect(meldung).toContainText("stimmt nicht");
    await expect(page).toHaveURL(/\/login/);
  });

  test("Mitglied kann sich anmelden und sieht den Belegungsplan", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await expect(page).toHaveURL(/\/plan/);
    // Der Hero traegt das Datum als Ueberschrift; "Freiplaetze" steht darueber.
    await expect(page.locator(".hero")).toContainText("Freiplätze");
    await expect(page.locator("table.plan")).toBeVisible();
    // Acht Plaetze plus Zeitspalte
    await expect(page.locator("table.plan thead th")).toHaveCount(9);
    // Am Telefon zeigt dieselbe Seite Karten statt Raster
    await expect(page.locator(".plan-listen .platzkarte")).toHaveCount(8);
  });
});

test.describe("Platzbuchung", () => {
  test("Mitglied bucht einen Platz, sieht ihn und storniert wieder", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);

    // Auf einen uebermorgigen Tag wechseln, damit der Slot sicher frei ist
    // Auf einen kuenftigen Tag wechseln und die Navigation abwarten, sonst
    // klickt der Test noch auf der alten Seite.
    await page.goto("/plan");
    for (let i = 0; i < 2; i++) {
      const vorher = page.url();
      await page.getByRole("link", { name: /Folgetag/ }).click();
      await page.waitForURL((u) => u.toString() !== vorher);
    }

    const freieZelle = page.locator("button.zelle.frei:not([disabled])").first();
    const gabEsFreie = (await freieZelle.count()) > 0;
    test.skip(!gabEsFreie, "Kein freier Slot an diesem Tag");

    await freieZelle.click();

    // Buchungsformular erscheint
    const formular = page.locator("form").filter({ has: page.locator('[name="bookingType"]') });
    await expect(formular).toBeVisible();

    // Mitspieler waehlen: die Pflicht wird serverseitig erzwungen
    const mitspieler = formular.locator('select[name="mitspieler"]').first();
    await mitspieler.selectOption({ index: 1 });

    await formular.getByRole("button", { name: /buchen/i }).click();

    const rueckmeldung = page.locator(".hinweis").first();
    await expect(rueckmeldung).toBeVisible({ timeout: 15_000 });

    // Entweder gebucht oder eine verstaendliche Ablehnung - nie ein roher
    // Datenbankfehler.
    const text = (await rueckmeldung.textContent()) ?? "";
    expect(text).not.toContain("violates");
    expect(text).not.toContain("constraint");

    if (text.includes("gebucht")) {
      // Die eigene Buchung ist im Plan sichtbar und stornierbar
      const eigene = page.locator("span.zelle.eigen").first();
      await expect(eigene).toBeVisible();

      await eigene.getByRole("button", { name: "Stornieren" }).click();
      await expect(page.locator(".hinweis.erfolg")).toContainText("storniert", {
        timeout: 15_000,
      });
    }
  });

  test("Mitspielerpflicht wird durchgesetzt", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan");
    await page.getByRole("link", { name: /Folgetag/ }).click();

    const freieZelle = page.locator("button.zelle.frei:not([disabled])").first();
    test.skip((await freieZelle.count()) === 0, "Kein freier Slot");
    await freieZelle.click();

    const formular = page.locator("form").filter({ has: page.locator('[name="bookingType"]') });
    // Ohne Mitspieler absenden
    await formular.getByRole("button", { name: /buchen/i }).click();

    const meldung = page.locator(".hinweis.fehler");
    await expect(meldung).toBeVisible({ timeout: 15_000 });
    await expect(meldung).toContainText(/Mitspieler/i);
  });
});

test.describe("Getränke", () => {
  test("Mitglied bucht ein Getränk und nimmt es zurück", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/getraenke");

    await expect(page.getByRole("heading", { name: "Getränke" })).toBeVisible();

    const vorher = await page.locator("table.liste tbody tr").count();
    await page.locator(".kachel-reihe button.kachel").first().click();

    await expect(page.locator(".hinweis.erfolg")).toContainText("Gebucht", { timeout: 15_000 });
    await expect(page.locator("table.liste tbody tr")).toHaveCount(vorher + 1);

    // Innerhalb des Zeitfensters muss die Ruecknahme moeglich sein
    await page
      .locator("table.liste tbody tr")
      .first()
      .getByRole("button", { name: "Zurücknehmen" })
      .click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("Zurückgenommen", {
      timeout: 15_000,
    });
  });
});

test.describe("Berechtigungen", () => {
  test("normales Mitglied sieht keine Verwaltungspunkte", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    const nav = page.getByRole("navigation", { name: "Hauptmenü" }).first();
    await expect(nav.getByRole("link", { name: "Mitglieder" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Beiträge" })).toHaveCount(0);
  });

  test("normales Mitglied kommt nicht an die Mitgliederliste", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/admin/mitglieder");
    await expect(page.locator(".hinweis.fehler")).toContainText("Vorstand");
  });

  test("normales Mitglied kommt nicht an den Beitragslauf", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/admin/beitraege");
    await expect(page.locator(".hinweis.fehler")).toContainText(/Kassenwart|Vorstand/);
  });

  test("Vorstand sieht die Mitgliederliste", async ({ page }) => {
    await anmelden(page, NUTZER.vorstand);
    await page.goto("/admin/mitglieder");
    await expect(page.getByRole("heading", { name: "Mitglieder" })).toBeVisible();
    await expect(page.locator("table.liste tbody tr").first()).toBeVisible();
  });

  test("Kassenwart sieht den Beitragslauf mit Mandatslage", async ({ page }) => {
    await anmelden(page, NUTZER.kassenwart);
    await page.goto("/admin/beitraege");
    await expect(page.getByRole("heading", { name: /Beitragslauf/ })).toBeVisible();
    // Die fehlende Glaeubiger-ID muss deutlich sichtbar sein
    await expect(page.locator(".hinweis.fehler").first()).toContainText(
      /Gläubiger|Mandat/,
    );
  });

  test("Sportwart kann Serien anlegen", async ({ page }) => {
    await anmelden(page, NUTZER.sportwart);
    await page.goto("/admin/serien");
    await expect(
      page.getByRole("heading", { name: "Serien-Blockungen", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Vorschau" })).toBeVisible();
  });
});

test.describe("Kiosk", () => {
  test("Kiosk-Gerät landet an der Theke und sieht die Namensliste", async ({ page }) => {
    await anmelden(page, NUTZER.kiosk);
    await expect(page).toHaveURL(/\/kiosk/);
    await expect(page.getByRole("heading", { name: /Theke/, level: 1 })).toBeVisible();

    // Namensauswahl vorhanden
    await expect(page.locator(".kachel-reihe button.kachel").first()).toBeVisible();

    // Aber keine Mitgliederverwaltung
    await page.goto("/admin/mitglieder");
    await expect(page.locator(".hinweis.fehler")).toBeVisible();
  });

  test("Kiosk bucht ein Getränk auf ein Mitglied", async ({ page }) => {
    await anmelden(page, NUTZER.kiosk);
    await page.goto("/kiosk");

    await page.getByPlaceholder("Name eingeben…").fill("a");
    await page.locator(".kachel-reihe button.kachel").first().click();

    // Jetzt erscheint die Getraenkekarte
    await expect(page.getByText(/anderes Mitglied/)).toBeVisible();
    await page.locator(".kachel-reihe button.kachel").first().click();

    await expect(page.locator(".hinweis.erfolg")).toContainText("gebucht", {
      timeout: 15_000,
    });
  });
});
