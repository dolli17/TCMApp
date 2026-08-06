import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-End gegen die laufende Anwendung und die echte Datenbank.
 *
 * Der Bestand ist synthetisch, deshalb sind echte Buchungen hier unbedenklich.
 * Der Gewinn: RLS, die Regeln in create_booking und die Fehlerübersetzung
 * werden mitgetestet - nichts davon wäre mit Mocks zu haben.
 */

import { anmelden, NUTZER } from "./hilfen";

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
  /** Auf einen kuenftigen Tag wechseln und die Navigation abwarten. */
  async function tageWeiter(page: Page, anzahl: number) {
    await page.goto("/plan");
    for (let i = 0; i < anzahl; i++) {
      const vorher = page.url();
      await page.getByRole("link", { name: /Folgetag/ }).click();
      await page.waitForURL((u) => u.toString() !== vorher);
    }
  }

  test("Klick auf eine freie Stunde öffnet ein Fenster, Escape schließt es", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await tageWeiter(page, 2);

    const freieZelle = page.locator("button.zelle.frei:not([disabled])").first();
    test.skip((await freieZelle.count()) === 0, "Kein freier Slot an diesem Tag");
    await freieZelle.click();

    const fenster = page.locator("dialog.fenster");
    await expect(fenster).toBeVisible();
    // Das native <dialog> bringt Escape mit - genau deshalb wird es benutzt.
    await page.keyboard.press("Escape");
    await expect(fenster).toHaveCount(0);
  });

  test("im Fenster :30 wählen, Mitspieler tippen, buchen und wieder stornieren", async ({
    page,
  }) => {
    await anmelden(page, NUTZER.mitglied);
    await tageWeiter(page, 3);

    const freieZelle = page.locator("button.zelle.frei:not([disabled])").first();
    test.skip((await freieZelle.count()) === 0, "Kein freier Slot an diesem Tag");
    await freieZelle.click();

    const fenster = page.locator("dialog.fenster");
    await expect(fenster).toBeVisible();

    // Beginn zur halben Stunde, falls diese Haelfte frei ist
    const halbe = fenster.locator("fieldset.startwahl button:not([disabled])").nth(1);
    if ((await halbe.count()) > 0) await halbe.click();

    // Mitspieler durch Tippen finden statt aus 300 Namen zu scrollen
    await fenster.getByLabel("Mitspieler suchen").fill("a");
    const treffer = fenster.locator(".trefferliste li").first().locator("button");
    await expect(treffer).toBeVisible();
    await treffer.click();
    await expect(fenster.locator(".marken li")).toHaveCount(1);

    await fenster.getByRole("button", { name: /buchen/i }).click();

    const rueckmeldung = page.locator(".hinweis").first();
    await expect(rueckmeldung).toBeVisible({ timeout: 15_000 });

    // Entweder gebucht oder eine verstaendliche Ablehnung - nie ein roher
    // Datenbankfehler.
    const text = (await rueckmeldung.textContent()) ?? "";
    expect(text).not.toContain("violates");
    expect(text).not.toContain("constraint");

    if (text.includes("gebucht")) {
      const eigene = page.locator("button.zelle.eigen").first();
      await expect(eigene).toBeVisible();
      await eigene.click();

      const verwalten = page.locator("dialog.fenster");
      await expect(verwalten).toBeVisible();
      await verwalten.getByRole("button", { name: "Buchung stornieren" }).click();
      await verwalten.getByRole("button", { name: "Wirklich stornieren" }).click();
      await expect(page.locator(".hinweis.erfolg")).toContainText("storniert", {
        timeout: 15_000,
      });
    }
  });

  test("Mitspieler einer eigenen Buchung austauschen", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await tageWeiter(page, 4);

    const freieZelle = page.locator("button.zelle.frei:not([disabled])").first();
    test.skip((await freieZelle.count()) === 0, "Kein freier Slot an diesem Tag");
    await freieZelle.click();

    const fenster = page.locator("dialog.fenster");
    await fenster.getByLabel("Mitspieler suchen").fill("e");
    await fenster.locator(".trefferliste li").first().locator("button").click();
    await fenster.getByRole("button", { name: /buchen/i }).click();

    const rueckmeldung = page.locator(".hinweis").first();
    await expect(rueckmeldung).toBeVisible({ timeout: 15_000 });
    test.skip(!((await rueckmeldung.textContent()) ?? "").includes("gebucht"), "Buchung abgelehnt");

    const eigene = page.locator("button.zelle.eigen").first();
    await eigene.click();

    const verwalten = page.locator("dialog.fenster");
    await expect(verwalten).toBeVisible();
    // Alten Mitspieler merken und entfernen. Beim Einzel ist genau ein
    // Mitspieler erlaubt, deshalb muss erst Platz gemacht werden.
    const alterName = (await verwalten.locator(".marken li span").first().textContent()) ?? "";
    const alterNachname = alterName.trim().split(" ").pop() ?? "";
    await verwalten.locator(".marken li button").first().click();

    // Ein anderer Treffer als der eben entfernte - sonst aendert sich nichts
    // und der Speichern-Knopf bleibt zu Recht gesperrt.
    await verwalten.getByLabel("Mitspieler suchen").fill("i");
    await verwalten
      .locator(".trefferliste li button")
      .filter({ hasNotText: alterNachname })
      .first()
      .click();
    await verwalten.getByRole("button", { name: "Mitspieler speichern" }).click();

    await expect(page.locator(".hinweis.erfolg")).toContainText("aktualisiert", {
      timeout: 15_000,
    });

    // Aufraeumen, damit der naechste Lauf denselben Slot wieder frei findet
    await page.locator("button.zelle.eigen").first().click();
    const nochmal = page.locator("dialog.fenster");
    await nochmal.getByRole("button", { name: "Buchung stornieren" }).click();
    await nochmal.getByRole("button", { name: "Wirklich stornieren" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("storniert", { timeout: 15_000 });
  });

  test("Mitspielerpflicht wird durchgesetzt", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await tageWeiter(page, 1);

    const freieZelle = page.locator("button.zelle.frei:not([disabled])").first();
    test.skip((await freieZelle.count()) === 0, "Kein freier Slot");
    await freieZelle.click();

    // Ohne Mitspieler ist der Buchen-Knopf gesperrt; die Datenbank wuerde es
    // ebenfalls ablehnen, aber der Benutzer soll es vorher sehen.
    const fenster = page.locator("dialog.fenster");
    await expect(fenster.getByRole("button", { name: /buchen/i })).toBeDisabled();
  });

  test("die Tabelle zeigt Stundenzeilen von 08 bis 20 Uhr", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan");

    const zeiten = page.locator("table.plan tbody td.zeit");
    await expect(zeiten).toHaveCount(13);
    await expect(zeiten.first()).toHaveText("08:00");
    await expect(zeiten.last()).toHaveText("20:00");
  });

  test("eine Blockung über 18:30–20:00 sperrt die Zeilen 18 und 19", async ({ page }) => {
    // Der eigentliche Grund fürs Stundenraster: eine Belegung, die nicht auf
    // der vollen Stunde beginnt, dürfte nicht zwischen die Zeilen fallen -
    // sonst sähe der 18-Uhr-Platz frei aus, obwohl er es nicht ist.
    await anmelden(page, NUTZER.mitglied);

    const heute = new Date();
    let gefunden = false;

    for (let tag = 0; tag < 14 && !gefunden; tag++) {
      const d = new Date(heute);
      d.setDate(d.getDate() + tag);
      await page.goto(`/plan?tag=${d.toISOString().slice(0, 10)}`);

      const zeilen = page.locator("table.plan tbody tr");
      const anzahl = await zeilen.count();

      for (let i = 0; i < anzahl - 1 && !gefunden; i++) {
        // Die Zeitspalte ist Spalte 0, die Plätze folgen danach.
        const spalten = zeilen.nth(i).locator("td");
        const wieviele = await spalten.count();

        for (let sp = 1; sp < wieviele; sp++) {
          const zelle = spalten.nth(sp).locator(".zelle");
          if ((await zelle.count()) === 0) continue;
          const text = (await zelle.first().textContent()) ?? "";
          if (!text.includes("18:30")) continue;

          gefunden = true;
          await expect(zelle.first()).toHaveClass(/blockung/);

          // Dieselbe Spalte muss eine Zeile tiefer ebenfalls belegt sein.
          const darunter = zeilen.nth(i + 1).locator("td").nth(sp).locator(".zelle");
          await expect(darunter.first()).toHaveClass(/blockung/);
          break;
        }
      }
    }

    expect(gefunden, "In den nächsten 14 Tagen liegt kein Training über 18:30").toBe(true);
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
    await expect(nav.getByRole("link", { name: "Einstellungen" })).toHaveCount(0);
  });

  for (const pfad of [
    "/admin/mitglieder",
    "/admin/beitraege",
    "/admin/serien",
    "/admin/einstellungen",
    "/admin/einstellungen/merkmale",
  ]) {
    test(`normales Mitglied kommt nicht an ${pfad}`, async ({ page }) => {
      await anmelden(page, NUTZER.mitglied);
      await page.goto(pfad);
      await expect(page.locator(".hinweis.fehler")).toContainText(/Administrator/);
    });
  }

  test("Admin sieht die Mitgliederliste", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder");
    await expect(page.getByRole("heading", { name: "Mitglieder" })).toBeVisible();
    await expect(page.locator("table.liste tbody tr").first()).toBeVisible();
  });

  test("Admin sieht den Beitragslauf mit Mandatslage", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/beitraege");
    await expect(page.getByRole("heading", { name: /Beitragslauf/ })).toBeVisible();
    // Die fehlende Glaeubiger-ID muss deutlich sichtbar sein
    await expect(page.locator(".hinweis.fehler").first()).toContainText(/Gläubiger|Mandat/);
  });

  test("Admin kann Serien anlegen", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/serien");
    await expect(page.getByRole("heading", { name: "Serien-Blockungen", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Vorschau" })).toBeVisible();
  });

  test("Admin kann jede fremde Buchung öffnen", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/plan");

    const fremde = page.locator("button.zelle.belegt:not(.eigen)").first();
    test.skip((await fremde.count()) === 0, "Heute ist keine fremde Buchung im Plan");

    await fremde.click();
    const fenster = page.locator("dialog.fenster");
    await expect(fenster).toBeVisible();
    await expect(fenster).toContainText("als Administrator");
    await page.keyboard.press("Escape");
  });

  test("normales Mitglied kann eine fremde Buchung nicht öffnen", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan");
    // Fremde Belegungen sind <span>, keine Schaltflaeche - es gibt nichts zu klicken.
    await expect(page.locator("button.zelle.belegt:not(.eigen)")).toHaveCount(0);
  });
});

test.describe("Admin-Dashboard", () => {
  test("Einstellung ändern, neu laden, Wert steht", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/einstellungen");

    const feld = page.getByLabel("Buchungsvorlauf in Tagen");
    await expect(feld).toBeVisible();
    const alt = await feld.inputValue();
    const neu = alt === "7" ? "8" : "7";

    await feld.fill(neu);
    await page
      .locator("section.einstellungen")
      .filter({ has: page.getByLabel("Buchungsvorlauf in Tagen") })
      .getByRole("button", { name: "Speichern" })
      .click();
    await expect(page.locator(".hinweis.erfolg").first()).toContainText("gespeichert", {
      timeout: 15_000,
    });

    await page.reload();
    await expect(page.getByLabel("Buchungsvorlauf in Tagen")).toHaveValue(neu);

    // Wieder zuruecksetzen, damit der naechste Lauf denselben Ausgangspunkt hat
    await page.getByLabel("Buchungsvorlauf in Tagen").fill(alt);
    await page
      .locator("section.einstellungen")
      .filter({ has: page.getByLabel("Buchungsvorlauf in Tagen") })
      .getByRole("button", { name: "Speichern" })
      .click();
    await expect(page.locator(".hinweis.erfolg").first()).toBeVisible({ timeout: 15_000 });
  });

  test("das Kontingent erklärt, dass 0 unbegrenzt bedeutet", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/einstellungen");
    await expect(page.locator("section.einstellungen").first()).toContainText(
      "0 bedeutet unbegrenzt",
    );
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
