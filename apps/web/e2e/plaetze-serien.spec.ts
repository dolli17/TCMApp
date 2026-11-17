import { expect, test, type Locator, type Page } from "@playwright/test";
import { anmelden, NUTZER, PASSWORT, tagIn, testName } from "./hilfen";
import { blatt, zeileIn } from "./verwaltung-hilfen";

/**
 * Plätze, Serien und Veranstaltungen: was bisher kein Test auslöste.
 *
 *   Serie            Vorschau, anlegen, einen Termin absagen, beenden
 *   Plätze           Reihenfolge ändern
 *   Buchungsarten    anlegen bzw. ändern, stilllegen
 *   Veranstaltungen  Entwurf löschen, Entwurf veröffentlichen, Teilnehmer abmelden
 *
 * Die Serie liegt morgen und in acht Tagen um 08:00 auf Platz 6 - die Stunde
 * hält der Seed frei, und kein anderer Test bucht dort.
 */

const SERIE = { platz: "Platz 6", von: "08:00", bis: "09:00" };

/** Eine Buchungsart lässt sich nicht löschen: es bleibt bei dieser einen. */
const BUCHUNGSART = { code: "zztest_art", name: "ZZTest Buchungsart" };

function erfolg(page: Page): Locator {
  return page.locator(".hinweis.erfolg");
}

/** "2026-11-18" als "18.11.2026", wie die Serienliste das Enddatum zeigt. */
function alsDatum(tag: string): string {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${tag}T12:00:00Z`));
}

function wochentag(tag: string): string {
  return new Intl.DateTimeFormat("de-DE", { weekday: "long", timeZone: "UTC" }).format(new Date(`${tag}T12:00:00Z`));
}

/** Der Block einer Blockung im Raster des Plans, über seinen Titel. */
function block(page: Page, titel: string): Locator {
  return page.locator(`.plan-raster .spalte[aria-label="${SERIE.platz}"] .beleg`, { hasText: titel });
}

/** Die laufende Serie in der Liste öffnen und beenden. */
async function serieBeenden(page: Page, zeile: Locator) {
  await zeile.locator("button.listenzeile").click();
  const fenster = page.getByRole("dialog", { name: "Serie bearbeiten" });
  await fenster.getByRole("button", { name: "Serie beenden" }).click();
  await fenster.getByRole("button", { name: /^\d+ Termine absagen$/ }).click();
}

test.describe("Serien", () => {
  test.skip(!NUTZER.admin || !NUTZER.mitglied || !PASSWORT, "Testkonten fehlen in .env.local");

  test("Vorschau, anlegen, einen Termin absagen, Serie beenden", async ({ page }) => {
    test.setTimeout(120_000);
    const titel = testName("Serie");
    const erster = tagIn(1);
    const zweiter = tagIn(8);

    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/plaetze?ansicht=serien");

    // Was ein abgebrochener Lauf von heute liegen ließ, stünde im Weg: erst beenden.
    const reste = zeileIn(page, "Serien", /^ZZTestSerie/).filter({ hasText: `bis ${alsDatum(zweiter)}` });
    while ((await reste.count()) > 0) {
      await serieBeenden(page, reste.first());
      await expect(erfolg(page)).toContainText("Serie beendet", { timeout: 20_000 });
      await page.reload();
    }

    // Formular: ohne Titel keine Vorschau, mit Titel nennt sie die Zahl der Termine.
    await page.getByRole("button", { name: "Serie anlegen" }).click();
    const formular = page.locator(".serienformular");
    await expect(formular.getByRole("button", { name: "Vorschau" })).toBeDisabled();
    await formular.getByLabel("Titel").fill(titel);
    await formular.getByRole("button", { name: wochentag(erster), exact: true }).click();
    await formular.getByLabel("Von").fill(SERIE.von);
    await formular.getByLabel("Bis").first().fill(SERIE.bis);
    await formular.getByRole("button", { name: SERIE.platz, exact: true }).click();
    await formular.getByLabel("Ab").fill(erster);
    await formular.getByLabel("Bis").last().fill(zweiter);

    await formular.getByRole("button", { name: "Vorschau" }).click();
    await expect(formular.locator(".folgen")).toContainText("2 Termine, nichts im Weg.", { timeout: 20_000 });

    // Wer nach der Vorschau etwas ändert, muss neu prüfen.
    await formular.getByLabel("Titel").fill(`${titel} `);
    await expect(formular.locator(".folgen")).toHaveCount(0);
    await formular.getByLabel("Titel").fill(titel);
    await formular.getByRole("button", { name: "Vorschau" }).click();

    await formular.getByRole("button", { name: "Serie anlegen · 2 Termine" }).click();
    await expect(formular.locator(".hinweis.erfolg")).toBeVisible({ timeout: 20_000 });

    // In der Liste steht sie mit Wochentag, Zeit, Platz und Enddatum.
    await page.goto("/admin/plaetze?ansicht=serien");
    const zeile = zeileIn(page, "Serien", titel);
    await expect(zeile).toContainText(`${wochentag(erster)} · ${SERIE.von} – ${SERIE.bis}`);
    await expect(zeile).toContainText(`${SERIE.platz} · bis ${alsDatum(zweiter)}`);

    // Im Plan liegt sie an beiden Tagen, und die Stunde ist nicht mehr buchbar.
    for (const tag of [erster, zweiter]) {
      await page.goto(`/plan?tag=${tag}`);
      await expect(block(page, titel)).toHaveCount(1);
      await expect(page.getByRole("button", { name: `${SERIE.platz} um ${SERIE.von} buchen` })).toHaveCount(0);
    }

    // Ein einzelner Termin fällt aus: der erste, mit Grund. Der zweite bleibt.
    await page.goto(`/plan?tag=${erster}`);
    await block(page, titel).click();
    const fenster = blatt(page);
    await fenster.getByRole("button", { name: "Fällt diese Woche aus" }).click();
    await fenster.getByLabel(/^Grund/).fill("ZZTest Ferien");
    await fenster.getByRole("button", { name: "Termin wirklich absagen" }).click();
    await expect(block(page, titel)).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: `${SERIE.platz} um ${SERIE.von} buchen` })).toBeVisible();
    await page.goto(`/plan?tag=${zweiter}`);
    await expect(block(page, titel)).toHaveCount(1);

    // Serie beenden: der verbliebene Termin wird abgesagt, der Plan ist wieder frei.
    await page.goto("/admin/plaetze?ansicht=serien");
    await serieBeenden(page, zeile);
    await expect(erfolg(page)).toHaveText("Serie beendet. 1 künftige Termin wurde abgesagt.", { timeout: 20_000 });
    await page.goto(`/plan?tag=${zweiter}`);
    await expect(page.locator(".plan-raster")).toBeVisible();
    await expect(block(page, titel)).toHaveCount(0);
    await page.goto("/admin/plaetze?ansicht=serien");
    await expect(zeile).not.toContainText(`bis ${alsDatum(zweiter)}`);
  });

  test("ein normales Mitglied kann einen Serientermin nicht absagen", async ({ page }) => {
    // Das Jugendtraining aus dem Seed: Dienstag 18:30 auf Platz 8.
    await anmelden(page, NUTZER.mitglied);
    let gefunden = false;
    for (let tag = 0; tag < 8 && !gefunden; tag++) {
      await page.goto(`/plan?tag=${tagIn(tag)}`);
      const training = page.locator(".plan-raster .beleg", { hasText: "18:30–20:00" }).first();
      if ((await training.count()) === 0) continue;
      gefunden = true;
      // Für Mitglieder ist der Block höchstens Anzeige: ein Klick bietet kein Absagen an.
      await training.click({ timeout: 3_000 }).catch(() => undefined);
      await expect(page.getByRole("button", { name: "Fällt diese Woche aus" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Termin wirklich absagen" })).toHaveCount(0);
    }
    expect(gefunden, "In den nächsten 8 Tagen liegt kein Training über 18:30").toBe(true);
  });
});

test.describe("Plätze und Buchungsarten", () => {
  test.skip(!NUTZER.admin || !PASSWORT, "Testkonten fehlen in .env.local");

  test("die Reihenfolge der Plätze ändern", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/plaetze");

    // Ein eigener Platz, damit die Spalten der echten Plätze stehen bleiben.
    const name = `ZZPlatz${Date.now().toString().slice(-6)}`;
    await page.getByRole("button", { name: "Neuen Platz anlegen" }).click();
    await blatt(page).getByLabel("Name", { exact: true }).fill(name);
    await blatt(page).getByLabel("Kurzname").fill("ZZ");
    await blatt(page).getByRole("button", { name: "Platz anlegen" }).click();
    await expect(erfolg(page)).toContainText("angelegt", { timeout: 15_000 });
    // Die Liste kommt erst nach der Meldung neu vom Server.
    await expect(zeileIn(page, "Plätze", name)).toHaveCount(1, { timeout: 15_000 });

    // Die Zeilen der Plätze; die letzte Zeile der Liste ist „Neuen Platz anlegen“.
    const namen = async () =>
      (await page.locator('.liste-gruppe[aria-label="Plätze"] > li .titel').allTextContents())
        .map((t) => t.trim())
        .filter((t) => t !== "Neuen Platz anlegen");
    // Die Liste lädt nach der Meldung neu; erst lesen, wenn der Platz darin steht.
    await expect
      .poll(async () => (await namen()).includes(name), { timeout: 15_000 })
      .toBe(true);
    const vorher = await namen();
    const stelle = vorher.indexOf(name);
    expect(stelle).toBeGreaterThan(0);

    // Eins nach vorne: der Platz tauscht mit seinem Nachbarn.
    const zeile = zeileIn(page, "Plätze", name);
    await zeile.locator("button.listenzeile").click();
    await blatt(page).getByRole("button", { name: "Im Plan weiter nach vorne" }).click();
    await expect(erfolg(page)).toHaveText("Reihenfolge gespeichert.", { timeout: 15_000 });
    await page.reload();
    const getauscht = [...vorher];
    [getauscht[stelle - 1], getauscht[stelle]] = [getauscht[stelle]!, getauscht[stelle - 1]!];
    expect(await namen()).toEqual(getauscht);

    // Und zurück: der Plan steht wieder wie vorher.
    await zeile.locator("button.listenzeile").click();
    await blatt(page).getByRole("button", { name: "Im Plan weiter nach hinten" }).click();
    await expect(erfolg(page)).toHaveText("Reihenfolge gespeichert.", { timeout: 15_000 });
    await page.reload();
    expect(await namen()).toEqual(vorher);

    // Aufräumen: löschen lässt sich ein Platz nicht, also stilllegen.
    await zeile.locator("button.listenzeile").click();
    await blatt(page).getByRole("button", { name: "Stilllegen" }).click();
    await expect(erfolg(page)).toContainText("stillgelegt", { timeout: 15_000 });
  });

  test("Buchungsart anlegen oder ändern, stilllegen", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/plaetze");
    const liste = page.locator('.liste-gruppe[aria-label="Buchungsarten"]');
    const zeile = liste.locator("> li").filter({ hasText: BUCHUNGSART.name });
    const name = `${BUCHUNGSART.name} ${Date.now().toString().slice(-6)}`;

    // Erster Lauf: anlegen. Jeder weitere: dieselbe Art wieder öffnen.
    if ((await zeile.count()) === 0) {
      await liste.getByRole("button", { name: "Neue Buchungsart" }).click();
      const neu = blatt(page);
      await expect(neu.getByRole("button", { name: "Speichern" })).toBeDisabled();
      await neu.getByLabel("Code").fill(BUCHUNGSART.code);
      await neu.getByLabel("Name").fill(BUCHUNGSART.name);
      await neu.getByLabel("Wofür").selectOption("blocking");
      await neu.getByRole("button", { name: "Speichern" }).click();
      await expect(erfolg(page)).toHaveText("Buchungsart gespeichert.", { timeout: 15_000 });
    }
    await expect(zeile).toHaveCount(1);

    // Ändern: der Code steht fest; Name, Dauer und „aktiv“ lassen sich pflegen.
    await zeile.locator("button.listenzeile").click();
    let fenster = blatt(page);
    await expect(fenster.getByLabel("Code")).toBeDisabled();
    await expect(fenster.getByLabel("Code")).toHaveValue(BUCHUNGSART.code);
    await fenster.getByLabel("Name").fill(name);
    await fenster.getByLabel("Dauer in Minuten").fill("90");
    await fenster.getByLabel(/^Aktiv/).check();
    await fenster.getByRole("button", { name: "Speichern" }).click();
    await expect(erfolg(page)).toHaveText("Buchungsart gespeichert.", { timeout: 15_000 });
    await expect(zeile.locator(".titel")).toHaveText(name);
    await expect(zeile).toContainText("90");
    await expect(zeile.locator(".hinweis-rechts", { hasText: "still" })).toHaveCount(0);

    // Stilllegen: die Art bleibt für alte Buchungen stehen, wird aber nicht mehr angeboten.
    await zeile.locator("button.listenzeile").click();
    fenster = blatt(page);
    await fenster.getByLabel(/^Aktiv/).uncheck();
    await fenster.getByRole("button", { name: "Speichern" }).click();
    await expect(erfolg(page)).toHaveText("Buchungsart gespeichert.", { timeout: 15_000 });
    await expect(zeile.locator(".hinweis-rechts")).toHaveText("still");

    await page.goto("/admin/plaetze?ansicht=serien");
    await page.getByRole("button", { name: "Serie anlegen" }).click();
    await expect(page.locator(".serienformular").getByLabel("Art").locator("option", { hasText: BUCHUNGSART.name })).toHaveCount(0);
  });
});

test.describe("Veranstaltungen: Entwurf, Veröffentlichen, Abmelden", () => {
  test.skip(!NUTZER.admin || !PASSWORT, "Testkonten fehlen in .env.local");

  /** "2026-11-06T19:00" in n Tagen, wie ein datetime-local-Feld es erwartet. */
  function inTagen(n: number, uhr = "19:00"): string {
    return `${tagIn(n)}T${uhr}`;
  }

  /** Einen Termin als Entwurf speichern und auf seiner Seite landen. */
  async function entwurf(page: Page, titel: string): Promise<string> {
    await page.goto("/admin/veranstaltungen/neu");
    await page.getByRole("button", { name: "Fest", exact: true }).click();
    await page.getByLabel("Titel").fill(titel);
    await page.getByLabel("Beginn", { exact: true }).fill(inTagen(25));
    await page.getByLabel("Ende", { exact: true }).fill(inTagen(25, "23:00"));
    await page.getByLabel("Ort").fill("Clubhaus");
    await page.getByRole("button", { name: "Als Entwurf speichern" }).click();
    await page.waitForURL(/\/admin\/veranstaltungen\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    return page.url();
  }

  test("ein Entwurf lässt sich löschen", async ({ page }) => {
    const titel = testName("Entwurf");
    await anmelden(page, NUTZER.admin);
    const adresse = await entwurf(page, titel);
    await expect(page.getByRole("heading", { level: 1, name: titel })).toBeVisible();

    // Löschen fragt im Knopf nach; Abbrechen löscht nichts.
    const rueckfrage = page.getByRole("group", { name: "Rückfrage" });
    await page.getByRole("button", { name: "Löschen", exact: true }).click();
    await expect(rueckfrage).toContainText("Den Entwurf endgültig löschen?");
    await rueckfrage.getByRole("button", { name: "Abbrechen" }).click();
    await expect(rueckfrage).toHaveCount(0);

    await page.getByRole("button", { name: "Löschen", exact: true }).click();
    await rueckfrage.getByRole("button", { name: "Ja, löschen" }).click();
    await page.waitForURL(/\/admin\/veranstaltungen$/, { timeout: 20_000 });
    await expect(page.getByRole("link", { name: new RegExp(titel) })).toHaveCount(0);

    // Die Seite des Entwurfs gibt es nicht mehr.
    const antwort = await page.goto(adresse);
    expect(antwort?.status()).toBe(404);
  });

  test("einen Entwurf veröffentlichen, einen Teilnehmer nachtragen und wieder abmelden", async ({ page }) => {
    const titel = testName("Abend");
    await anmelden(page, NUTZER.admin);
    const adresse = await entwurf(page, titel);
    const id = adresse.split("/").pop()!;

    // Ein Entwurf ist für Mitglieder unsichtbar.
    await page.goto("/verein/veranstaltungen");
    await expect(page.getByText(titel)).toHaveCount(0);

    // Der eigene Knopf auf der Seite des Entwurfs, ohne Nachricht an alle Mitglieder.
    await page.goto(adresse);
    await page.getByLabel("Mitglieder benachrichtigen").uncheck();
    await page.getByRole("button", { name: "Veröffentlichen" }).click();
    await expect(page.getByRole("status")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Anmeldung offen")).toBeVisible();
    await expect(page.getByRole("button", { name: "Veröffentlichen" })).toHaveCount(0);
    // Veröffentlichtes lässt sich nur noch absagen, nicht mehr löschen.
    await expect(page.getByRole("button", { name: "Löschen", exact: true })).toHaveCount(0);
    await page.goto("/verein/veranstaltungen");
    await expect(page.getByText(titel).first()).toBeVisible();

    // Nachtragen und wieder abmelden.
    await page.goto(adresse);
    await page.getByLabel("Mitglied nachtragen").fill("Mitspiel, Mia");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Angemeldet", { timeout: 20_000 });
    const zeile = page.locator("tr", { hasText: "Mitspiel, Mia" });
    await expect(zeile).toHaveCount(1);

    await zeile.getByRole("button", { name: "Mitspiel, Mia abmelden" }).click();
    await zeile.getByRole("button", { name: "Ja, abmelden" }).click();
    await expect(page.getByRole("status")).toContainText("Abgemeldet", { timeout: 20_000 });
    // Die Zeile bleibt als Beleg stehen, aber abgemeldet und ohne weitere Knöpfe.
    await expect(zeile).toContainText("abgemeldet");
    await expect(zeile.getByRole("button", { name: "Mitspiel, Mia abmelden" })).toHaveCount(0);

    // Aufräumen: absagen (löschen geht nach dem Veröffentlichen nicht mehr).
    await page.getByRole("button", { name: "Absagen" }).click();
    await page.getByRole("button", { name: "Ja, absagen" }).click();
    await expect(page.getByText("Abgesagt", { exact: true })).toBeVisible({ timeout: 20_000 });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
