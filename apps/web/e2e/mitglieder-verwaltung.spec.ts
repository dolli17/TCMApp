import { expect, test } from "@playwright/test";
import { MANNSCHAFT_TEXT } from "@tcm/core";
import { anmelden, MITSPIELER, NUTZER, PASSWORT, testName } from "./hilfen";
import { antragsLink, warteAufMails } from "./mailpit";
import { gefahrenzone, mitgliedAnlegen, mitgliedLoeschen, zeileIn } from "./verwaltung-hilfen";

/**
 * Mitglieder verwalten, was bisher kein Test auslöste: Bankverbindung
 * stilllegen, Zugang sperren, archivieren, reaktivieren, anonymisieren,
 * die Aufstellung einer Mannschaft, Spam bei den Anträgen und das
 * Zurückziehen einer Einladung durch den Mannschaftsführer.
 *
 * Jeder Test legt sein eigenes Mitglied an (ZZTest…) und räumt es wieder ab.
 * Nur das anonymisierte bleibt stehen: das ist nicht umkehrbar, und genau das
 * prüft der Test. Es trägt danach keinen Namen mehr.
 */

test.describe("Mitglied: Bank, Zugang und Datensatz beenden", () => {
  test.skip(!NUTZER.admin || !PASSWORT, "Testkonten fehlen in .env.local");

  test("eine Bankverbindung ohne Mandat stilllegen", async ({ page }) => {
    const nachname = testName("Konto");
    await anmelden(page, NUTZER.admin);
    const adresse = await mitgliedAnlegen(page, nachname);

    await page.goto(`${adresse}?teil=bank`);
    const karte = page.locator('section[aria-label="Bankverbindung und Mandat"]');
    await karte.getByRole("button", { name: "Bankverbindung hinzufügen" }).click();
    await karte.getByLabel("IBAN").fill("DE89370400440532013000");
    await karte.getByRole("button", { name: "Speichern" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("Bankverbindung gespeichert", { timeout: 20_000 });
    await expect(karte).toContainText("IBAN •••• 3000");

    await karte.getByRole("button", { name: "Bankverbindung stilllegen" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toHaveText("Bankverbindung stillgelegt.", { timeout: 20_000 });

    // Stillgelegt heißt: kein Mandat mehr darauf, und der Knopf ist weg.
    await page.reload();
    await expect(karte.getByRole("button", { name: "Bankverbindung stilllegen" })).toHaveCount(0);
    await expect(karte.getByRole("button", { name: "Mandat erteilen" })).toHaveCount(0);

    await mitgliedLoeschen(page, adresse, nachname);
  });

  test("Zugang sperren und die Sperre wieder aufheben", async ({ page }) => {
    const nachname = testName("Sperre");
    await anmelden(page, NUTZER.admin);
    const adresse = await mitgliedAnlegen(page, nachname);

    await page.goto(`${adresse}?teil=zugang`);
    const karte = page.locator('section[aria-label="Zugang"]');
    const status = karte.locator(".einstellung .titel").first();
    await expect(status).toContainText("aktiv");

    // Sperren fragt nach; Abbrechen sperrt nichts.
    await karte.getByRole("button", { name: "Zugang sperren" }).click();
    const frage = karte.getByRole("group", { name: "Zugang sperren" });
    await expect(frage).toContainText("kann sich danach nicht mehr anmelden");
    await frage.getByRole("button", { name: "Abbrechen" }).click();
    await expect(status).toContainText("aktiv");

    await karte.getByRole("button", { name: "Zugang sperren" }).click();
    await frage.getByRole("button", { name: "Wirklich sperren" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toBeVisible({ timeout: 20_000 });
    await expect(status).toContainText("gesperrt");
    await expect(karte).toContainText("Gesperrt seit");

    await karte.getByRole("button", { name: "Sperre aufheben" }).click();
    await expect(status).toContainText("aktiv", { timeout: 20_000 });
    await expect(karte.getByRole("button", { name: "Zugang sperren" })).toBeVisible();

    await mitgliedLoeschen(page, adresse, nachname);
  });

  test("archivieren, reaktivieren, wieder archivieren und anonymisieren", async ({ page }) => {
    test.setTimeout(120_000);
    const nachname = testName("Archiv");
    await anmelden(page, NUTZER.admin);
    const adresse = await mitgliedAnlegen(page, nachname);

    // Archivieren: der Hinweis nennt die Folge für die laufende Mitgliedschaft.
    let zone = await gefahrenzone(page, adresse);
    await zone.getByRole("button", { name: "Archivieren" }).click();
    let frage = zone.getByRole("group", { name: "Archivieren bestätigen" });
    await expect(frage).toContainText("Die Mitgliedschaft läuft noch");
    await frage.getByLabel("Grund").fill("ZZTest Austritt");
    await frage.getByRole("button", { name: "Wirklich archivieren" }).click();
    await expect(zone.locator(".hinweis.erfolg")).toContainText("Mitglied archiviert.", { timeout: 20_000 });
    await expect(zone.locator(".marke-klein", { hasText: "Archiviert" })).toBeVisible();

    // Archiviert: aus der laufenden Liste verschwunden, der Zugang gesperrt.
    await page.goto(`/admin/mitglieder?q=${nachname}`);
    await expect(page.getByRole("link", { name: new RegExp(nachname) })).toHaveCount(0);
    await page.goto(`${adresse}?teil=zugang`);
    await expect(page.locator('section[aria-label="Zugang"] .einstellung .titel').first()).toContainText("gesperrt");

    // Reaktivieren: mit Rückfrage, danach wieder in der Liste.
    zone = await gefahrenzone(page, adresse);
    await zone.getByRole("button", { name: "Reaktivieren" }).click();
    const zurueck = zone.getByRole("group", { name: "Reaktivieren bestätigen" });
    await expect(zurueck).toContainText("Der Zugang bleibt gesperrt");
    await zurueck.getByRole("button", { name: "Wirklich reaktivieren" }).click();
    await expect(zone.locator(".hinweis.erfolg")).toBeVisible({ timeout: 20_000 });
    await expect(zone.getByRole("button", { name: "Archivieren" })).toBeVisible();
    await page.goto(`/admin/mitglieder?q=${nachname}`);
    await expect(page.getByRole("link", { name: new RegExp(nachname) })).toHaveCount(1);

    // Wieder archivieren, dann anonymisieren: erst mit dem getippten Nachnamen.
    zone = await gefahrenzone(page, adresse);
    await zone.getByRole("button", { name: "Archivieren" }).click();
    frage = zone.getByRole("group", { name: "Archivieren bestätigen" });
    await frage.getByLabel("Grund").fill("ZZTest Löschersuchen");
    await frage.getByRole("button", { name: "Wirklich archivieren" }).click();
    await expect(zone.locator(".hinweis.erfolg")).toContainText("Mitglied archiviert.", { timeout: 20_000 });

    await zone.getByRole("button", { name: "Anonymisieren" }).click();
    const anonym = zone.getByRole("group", { name: "Anonymisieren bestätigen" });
    const knopf = anonym.getByRole("button", { name: "Wirklich anonymisieren" });
    await anonym.getByLabel("Grund").fill("ZZTest Löschersuchen");
    await expect(knopf).toBeDisabled();
    await anonym.getByLabel(/Nachnamen .* eintippen/).fill(nachname);
    await knopf.click();
    // Auf das Ende warten, nicht auf irgendeine Erfolgsmeldung: die vom
    // Archivieren steht noch da, und das Anonymisieren löscht erst den Login.
    await expect(anonym).toHaveCount(0, { timeout: 30_000 });
    await expect(zone.locator(".hinweis.fehler")).toHaveCount(0);

    // Der Name ist weg, überall auf der Seite und in den Stammdaten.
    await page.reload();
    await expect(zone.locator(".marke-klein", { hasText: "Anonymisiert" })).toBeVisible();
    await expect(zone.getByRole("button", { name: "Reaktivieren" })).toHaveCount(0);
    await expect(page.getByText(nachname)).toHaveCount(0);
    await page.goto(`${adresse}?teil=stammdaten`);
    await expect(page.getByText(nachname)).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("Hauptstraße 1");
  });
});

test.describe("Mannschaften: Aufstellung", () => {
  test.skip(!NUTZER.admin || !PASSWORT, "Testkonten fehlen in .env.local");

  test("Spieler eintragen, zum Mannschaftsführer machen, herausnehmen; am Mitglied setzen und lösen", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const mannschaft = testName("Team");
    const nachname = testName("Aufstellung");
    await anmelden(page, NUTZER.admin);

    await page.goto("/admin/mitglieder/mannschaften");
    await page.getByRole("button", { name: "Mannschaft anlegen" }).click();
    const formular = page.locator('form[aria-label="Mannschaft"]');
    await formular.getByLabel("Name").fill(mannschaft);
    await formular.getByRole("button", { name: "Speichern" }).click();
    await page.waitForURL(/\/admin\/mitglieder\/mannschaften\?bearbeiten=/, { timeout: 20_000 });
    const mannschaftsAdresse = page.url();

    const adresse = await mitgliedAnlegen(page, nachname);

    // Über die Aufstellung eintragen
    await page.goto(mannschaftsAdresse);
    const aufstellung = page.locator('section[aria-label="Aufstellung"]');
    await expect(aufstellung).toContainText("Noch niemand eingetragen.");
    await aufstellung.getByLabel("Mitglied", { exact: true }).fill(nachname);
    await aufstellung.getByRole("listbox", { name: "Gefundene Mitglieder" }).getByRole("button", { name: new RegExp(nachname) }).click();
    await expect(aufstellung.locator(".hinweis.erfolg")).toHaveText("Eingetragen.", { timeout: 20_000 });
    const zeile = aufstellung.locator(".liste-gruppe li").filter({ hasText: `${nachname}, Test` });
    await expect(zeile).toHaveCount(1);
    await expect(zeile.locator(".hinweis-rechts")).toHaveCount(0);

    // Zum Mannschaftsführer machen
    await zeile.locator("button.listenzeile").click();
    const aktionen = aufstellung.locator(`.liste-gruppe[aria-label="Aktionen für Test ${nachname}"]`);
    await aktionen.getByRole("button", { name: /Zum Mannschaftsführer machen/ }).click();
    await expect(aufstellung.locator(".hinweis.erfolg")).toHaveText("Als Mannschaftsführer eingetragen.", {
      timeout: 20_000,
    });
    await expect(zeile.locator(".hinweis-rechts")).toHaveText("Mannschaftsführer");

    // Herausnehmen
    if ((await aktionen.count()) === 0) await zeile.locator("button.listenzeile").click();
    await aktionen.getByRole("button", { name: "Herausnehmen" }).click();
    await expect(aufstellung.locator(".hinweis.erfolg")).toHaveText("Aus der Mannschaft genommen.", {
      timeout: 20_000,
    });
    await expect(aufstellung).toContainText("Noch niemand eingetragen.");

    // Vom Mitglied aus setzen: steht danach in der Aufstellung
    await page.goto(`${adresse}?teil=mitgliedschaft`);
    const karte = page.locator('section[aria-label="Mannschaft"]');
    await karte.getByLabel("Mannschaft", { exact: true }).selectOption({ label: mannschaft });
    await karte.getByRole("button", { name: "Speichern" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toBeVisible({ timeout: 20_000 });
    await page.goto(mannschaftsAdresse);
    await expect(zeile).toHaveCount(1);

    // Und wieder lösen: „keine Mannschaft“ am Mitglied leert die Aufstellung
    await page.goto(`${adresse}?teil=mitgliedschaft`);
    await karte.getByLabel("Mannschaft", { exact: true }).selectOption("");
    await karte.getByRole("button", { name: "Speichern" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toBeVisible({ timeout: 20_000 });
    await page.goto(mannschaftsAdresse);
    await expect(aufstellung).toContainText("Noch niemand eingetragen.");

    // Aufräumen: Mannschaft und Mitglied löschen
    await formular.getByRole("button", { name: "Mannschaft löschen" }).click();
    await formular.getByRole("button", { name: "Wirklich löschen" }).click();
    await page.waitForURL(/\/admin\/mitglieder\/mannschaften$/, { timeout: 20_000 });
    await expect(zeileIn(page, "Mannschaften", mannschaft)).toHaveCount(0);
    await mitgliedLoeschen(page, adresse, nachname);
  });
});

test.describe("Anträge: Spam", () => {
  test.skip(!NUTZER.admin || !PASSWORT, "Testkonten fehlen in .env.local");

  test("einen Antrag als Spam kennzeichnen: er steht danach unter Erledigt", async ({ page }) => {
    const nachname = testName("Spam");
    const email = `${nachname.toLowerCase()}@example.org`;

    await page.goto("/antrag");
    await page.getByLabel("Vorname").fill("Werbung");
    await page.getByLabel("Nachname").fill(nachname);
    await page.getByLabel("E-Mail", { exact: true }).fill(email);
    await page.getByLabel("Geburtstag").fill("1990-01-01");
    await page.getByRole("group", { name: "Geschlecht" }).getByLabel("divers").check({ force: true });
    await page.getByLabel("Telefon").fill("07223 12345");
    await page.getByLabel("Straße und Hausnummer").fill("Hauptstraße 1");
    await page.getByLabel("PLZ").fill("77815");
    await page.getByLabel("Ort", { exact: true }).fill("Muckensturm");
    await page.getByRole("button", { name: "Antrag absenden" }).click();
    await expect(page.getByRole("heading", { name: "Fast geschafft." })).toBeVisible({ timeout: 20_000 });

    // Erst der bestätigte Antrag erscheint in der Verwaltung (S22).
    const [mail] = await warteAufMails(email);
    await page.goto(antragsLink(mail!));
    await page.getByRole("button", { name: "Antrag bestätigen" }).click();
    await expect(page.getByRole("heading", { name: "Bestätigt." })).toBeVisible({ timeout: 20_000 });

    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder/antraege");
    await zeileIn(page, "Anträge", nachname).locator("button.listenzeile").click();
    const fenster = page.locator("dialog.fenster");
    await fenster.getByRole("button", { name: "Spam", exact: true }).click();
    await expect(fenster).toBeHidden({ timeout: 20_000 });

    // Aus den offenen verschwunden, unter Erledigt als Spam geführt, und es ist kein Mitglied entstanden.
    await expect(zeileIn(page, "Anträge", nachname)).toHaveCount(0);
    await page.goto("/admin/mitglieder/antraege?filter=erledigt");
    await expect(zeileIn(page, "Anträge", nachname)).toContainText("Spam");
    await page.goto(`/admin/mitglieder?q=${nachname}`);
    await expect(page.getByRole("link", { name: new RegExp(nachname) })).toHaveCount(0);
  });

  test("ein normales Mitglied kommt nicht an die Anträge und nicht an die Mannschaften", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    for (const pfad of ["/admin/mitglieder/antraege", "/admin/mitglieder/mannschaften"]) {
      await page.goto(pfad);
      await expect(page.locator(".hinweis.fehler")).toContainText(/vorbehalten/);
    }
  });
});

test.describe("Konto › Mannschaft: Einladung zurückziehen", () => {
  test.skip(!NUTZER.mitglied || !PASSWORT, "Testkonten fehlen in .env.local");

  test("der Mannschaftsführer lädt ein und zieht die Einladung zurück", async ({ page }) => {
    // Das Testmitglied ist im Seed Mannschaftsführer; Max Mitspiel spielt in keiner Mannschaft.
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/konto/mannschaft");
    const offen = page.getByTestId("offene-einladung").filter({ hasText: MITSPIELER.max });
    const toast = page.locator(".hinweis.toast.erfolg");

    // Ein abgebrochener Lauf kann die Einladung liegen gelassen haben.
    if ((await offen.count()) > 0) {
      await offen.getByRole("button", { name: "Zurückziehen" }).click();
      await expect(offen).toHaveCount(0, { timeout: 20_000 });
    }

    await page.getByLabel(MANNSCHAFT_TEXT.sucheLabel).fill("Mitspiel");
    const kandidat = page.getByTestId("kandidat").filter({ hasText: MITSPIELER.max });
    await kandidat.getByRole("button", { name: "Einladen" }).click();
    await expect(toast).toHaveText("Eingeladen.", { timeout: 20_000 });
    await expect(offen).toHaveCount(1);

    await offen.getByRole("button", { name: "Zurückziehen" }).click();
    await expect(offen).toHaveCount(0, { timeout: 20_000 });
    // Zurückgezogen heißt: wieder einladbar, nicht „Eingeladen“.
    await page.getByLabel(MANNSCHAFT_TEXT.sucheLabel).fill("Mitspiel");
    await expect(kandidat.getByRole("button", { name: "Einladen" })).toBeEnabled();
  });
});
