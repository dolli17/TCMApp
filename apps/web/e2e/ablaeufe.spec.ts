import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-End gegen die laufende Anwendung und die echte Datenbank.
 *
 * Der Bestand ist synthetisch, deshalb sind echte Buchungen hier unbedenklich.
 * Der Gewinn: RLS, die Regeln in create_booking und die Fehlerübersetzung
 * werden mitgetestet - nichts davon wäre mit Mocks zu haben.
 */

import { alsListendatum, anmelden, NUTZER } from "./hilfen";

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

  /**
   * Zwei Defekte auf einmal, weil sie dieselbe Stelle betreffen:
   *
   * 1. Pro Zelle wurde nur die erste Belegung gezeichnet. Zwei Buchungen, die
   *    dieselbe Anzeigestunde beruehren (08:30-09:30 und 09:30-10:30), sahen
   *    aus wie eine - die zweite fehlte im Plan vollstaendig.
   * 2. War :00 belegt, liess sich :30 nicht mehr anklicken, obwohl der Platz
   *    zu der Zeit frei stand.
   */
  test("angebrochene Stunden: Reststunde bleibt buchbar, beide Buchungen sichtbar", async ({
    page,
  }) => {
    await anmelden(page, NUTZER.mitglied);
    await tageWeiter(page, 5);

    const zeile = (uhr: string) =>
      page
        .locator("table.plan tbody tr")
        .filter({ has: page.locator(`td.zeit:text-is("${uhr}")`) });

    /** Eine Spalte pro Platz, Spalte 0 ist die Zeitangabe. */
    const feld = (uhr: string, spalte: number) => zeile(uhr).locator("td").nth(spalte);

    // Einen Platz suchen, der 08 bis 10 Uhr komplett frei ist - sonst kollidiert
    // der Test mit dem Bestand oder mit einer Trainingsserie.
    const spalten = await feld("08:00", 0).locator("xpath=../td").count();
    let spalte = 0;
    for (let s = 1; s < spalten && spalte === 0; s++) {
      const freieZellen = await Promise.all(
        ["08:00", "09:00", "10:00"].map(async (uhr) => {
          const zellen = feld(uhr, s).locator(".zelle");
          return (await zellen.count()) === 1
            && (await feld(uhr, s).locator("button.zelle.frei:not(.rest):not([disabled])").count()) === 1;
        }),
      );
      if (freieZellen.every(Boolean)) spalte = s;
    }
    test.skip(spalte === 0, "Kein Platz ist an diesem Tag von 08 bis 11 Uhr durchgehend frei");

    async function imFensterBuchen(uhrzeit: string) {
      const fenster = page.locator("dialog.fenster");
      await expect(fenster).toBeVisible();
      await fenster.locator("fieldset.startwahl button", { hasText: uhrzeit }).click();
      await fenster.getByLabel("Mitspieler suchen").fill("a");
      await fenster.locator(".trefferliste li").first().locator("button").click();
      await fenster.getByRole("button", { name: /buchen/i }).click();
      await expect(page.locator(".hinweis.erfolg")).toContainText("gebucht", { timeout: 15_000 });
    }

    await feld("08:00", spalte).locator("button.zelle.frei").click();
    await imFensterBuchen("08:30");

    // 09:00 ist jetzt angebrochen: die erste Haelfte belegt, die zweite frei.
    const rest = feld("09:00", spalte).locator("button.zelle.rest");
    await expect(rest).toHaveText(/ab 09:30 frei/);
    await rest.click();
    await imFensterBuchen("09:30");

    // Beide Buchungen stehen in der 09-Uhr-Zeile, nicht nur die erste.
    await expect(feld("09:00", spalte).locator(".zelle.belegt")).toHaveCount(2);

    // Aufraeumen, damit der naechste Lauf denselben Platz wieder frei findet.
    for (let i = 0; i < 2; i++) {
      await page.locator("button.zelle.eigen").first().click();
      const fenster = page.locator("dialog.fenster");
      await fenster.getByRole("button", { name: "Buchung stornieren" }).click();
      await fenster.getByRole("button", { name: "Wirklich stornieren" }).click();
      await expect(page.locator(".hinweis.erfolg")).toContainText("storniert", { timeout: 15_000 });
    }
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
    // Seit dem Umbau steht dort ein Eintrag statt fünf.
    await expect(nav.getByRole("link", { name: "Verwaltung" })).toHaveCount(0);
  });

  for (const pfad of [
    "/admin",
    "/admin/mitglieder",
    "/admin/beitraege",
    "/admin/plaetze",
    "/admin/getraenke",
    "/admin/system",
    "/admin/mitglieder/merkmale",
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
    await page.goto("/admin/plaetze");
    await expect(page.getByRole("heading", { name: "Serien", exact: true })).toBeVisible();
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
    // Die Buchungsregeln stehen seit dem Umbau bei den Plätzen.
    await page.goto("/admin/plaetze");

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
    await page.goto("/admin/plaetze");
    await expect(page.locator("section.einstellungen", { hasText: "Buchungsregeln" })).toContainText(
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

/**
 * Meine Buchungen und die Glocke.
 *
 * Das Zusammenspiel laesst sich nur ueber zwei Konten pruefen: der eine traegt
 * ein, der andere muss es erfahren. Der Admin uebernimmt hier die Rolle des
 * Buchers, weil er als einziger neben dem Mitglied ein bekanntes Konto hat.
 */
test.describe("Meine Buchungen und Benachrichtigungen", () => {
  test("eingetragen werden, benachrichtigt werden, in der eigenen Liste stehen", async ({
    page,
  }) => {
    // 1. Wie heisst das Testmitglied? Der Name steht in der Seitenleiste.
    await anmelden(page, NUTZER.mitglied);
    const name = ((await page.locator(".seitenleiste .fuss span").first().textContent()) ?? "").trim();
    expect(name.length, "Der Name des Testmitglieds ist nicht lesbar").toBeGreaterThan(2);
    // Voller Name, nicht nur der Nachname: "Bauer" gibt es im Testbestand
    // mehrfach, und der erste Treffer waere die falsche Person.
    const [vorname, ...rest] = name.split(" ");
    const alsListenzeile = `${rest.join(" ")}, ${vorname}`;

    // 2. Der Admin bucht und traegt das Mitglied als Mitspieler ein.
    await anmelden(page, NUTZER.admin);
    await page.goto("/plan");
    for (let i = 0; i < 6; i++) {
      const vorher = page.url();
      await page.getByRole("link", { name: /Folgetag/ }).click();
      await page.waitForURL((u) => u.toString() !== vorher);
    }
    const listendatum = alsListendatum(new URL(page.url()).searchParams.get("tag") ?? "");

    const freieZelle = page.locator("button.zelle.frei:not(.rest):not([disabled])").first();
    test.skip((await freieZelle.count()) === 0, "Kein freier Slot an diesem Tag");
    await freieZelle.click();

    const fenster = page.locator("dialog.fenster");
    await fenster.getByLabel("Mitspieler suchen").fill(name);
    const treffer = fenster
      .locator(".trefferliste li button")
      .filter({ hasText: alsListenzeile })
      .first();
    await expect(treffer).toBeVisible();
    await treffer.click();
    await expect(fenster.locator(".marken li")).toContainText(name);

    // Platz und Startzeit merken: das Testmitglied hat im Bestand weitere
    // Termine, und "der erste in der Liste" waere irgendeiner davon.
    const platz = ((await fenster.locator(".fenster-kopf h2").textContent()) ?? "").trim();
    const buchenKnopf = fenster.getByRole("button", { name: /buchen/i });
    const startzeit = /(\d{2}:\d{2})/.exec((await buchenKnopf.textContent()) ?? "")?.[1] ?? "";
    expect(startzeit, "Der Buchen-Knopf nennt keine Startzeit").toMatch(/^\d{2}:\d{2}$/);

    await buchenKnopf.click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gebucht", { timeout: 15_000 });

    // 3. Das Mitglied sieht die Glocke und findet die Buchung bei sich.
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan/meine");

    const glocke = page.locator(".seitenleiste button.glocke");
    await expect(glocke.locator(".glocke-zahl")).toBeVisible();
    await glocke.click();

    const nachrichten = page.locator("dialog.fenster .nachrichtenliste li");
    await expect(nachrichten.first()).toContainText("Du bist als Mitspieler eingetragen", {
      timeout: 15_000,
    });
    await page.keyboard.press("Escape");

    // Als Mitspieler steht dort Austragen, nicht Stornieren.
    const termin = page
      .locator(".terminliste .termin")
      .filter({ hasText: platz })
      .filter({ hasText: startzeit })
      .filter({ hasText: listendatum })
      .first();
    await expect(termin).toBeVisible();
    await expect(termin.getByRole("button", { name: "Austragen" })).toBeVisible();

    // 4. Nach dem Lesen ist der Zaehler weg.
    await page.reload();
    await expect(page.locator(".seitenleiste .glocke-zahl")).toHaveCount(0);

    // 5. Aufraeumen: der Bucher storniert ueber seine eigene Liste.
    await anmelden(page, NUTZER.admin);
    await page.goto("/plan/meine");
    const eigener = page
      .locator(".terminliste .termin")
      .filter({ hasText: platz })
      .filter({ hasText: startzeit })
      .filter({ hasText: listendatum })
      .first();
    await eigener.getByRole("button", { name: "Stornieren" }).click();
    await eigener.getByRole("button", { name: "Wirklich stornieren" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("storniert", { timeout: 15_000 });
  });
});

/**
 * Mitspieler gesucht und der Gast-Knopf.
 *
 * Beides zusammen in einem Test, weil beides an derselben Buchung haengt: der
 * Admin schreibt eine Buchung mit Gast aus, das Mitglied tritt bei, und die
 * Gastgebuehr taucht in seinem Konto auf.
 */
test.describe("Offene Spiele und Gäste", () => {
  test("ausschreiben, beitreten, Gastgebühr im Konto, Storno erlässt sie", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/plan");
    // Sechs Tage, nicht sieben: der Vorlauf betraegt 7 x 24 Stunden ab jetzt,
    // und eine Buchung um 08:00 am siebten Tag liegt knapp dahinter.
    for (let i = 0; i < 6; i++) {
      const vorher = page.url();
      await page.getByRole("link", { name: /Folgetag/ }).click();
      await page.waitForURL((u) => u.toString() !== vorher);
    }
    const listendatum = alsListendatum(new URL(page.url()).searchParams.get("tag") ?? "");

    const freieZelle = page.locator("button.zelle.frei:not(.rest):not([disabled])").first();
    test.skip((await freieZelle.count()) === 0, "Kein freier Slot an diesem Tag");
    await freieZelle.click();

    const fenster = page.locator("dialog.fenster");
    await expect(fenster).toBeVisible();

    // Doppel: vier Plätze, damit nach Bucher, Gast und Beitretendem noch Luft
    // bleibt und die Buchung ausgeschrieben werden kann.
    await fenster.locator("select[name='bookingType']").selectOption("doppel");
    await fenster.getByRole("button", { name: "+ Gast" }).click();
    await expect(fenster.locator(".marken li.gast")).toHaveCount(1);
    await expect(fenster.locator(".gasthinweis")).toContainText("10,00 €");

    await fenster.getByLabel("Mitspieler gesucht").check();

    const platz = ((await fenster.locator(".fenster-kopf h2").textContent()) ?? "").trim();
    const buchenKnopf = fenster.getByRole("button", { name: /buchen/i });
    const startzeit = /(\d{2}:\d{2})/.exec((await buchenKnopf.textContent()) ?? "")?.[1] ?? "";
    await buchenKnopf.click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gebucht", { timeout: 15_000 });

    // Der Plan markiert die Buchung als offen.
    await expect(page.locator(".zelle.sucht-mitspieler").first()).toBeVisible();

    // Die Gastgebühr steht als Forderung im Konto des Buchers.
    await page.goto("/konto");
    await expect(page.getByText(/Gastgebuehr/).first()).toBeVisible();

    // Ein anderes Mitglied findet das offene Spiel und trägt sich ein.
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan/offen");
    const spiel = page
      .locator(".terminliste .termin")
      .filter({ hasText: platz })
      .filter({ hasText: startzeit })
      .filter({ hasText: listendatum })
      .first();
    await expect(spiel).toBeVisible();
    await spiel.getByRole("button", { name: "Mitspielen" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("eingetragen", { timeout: 15_000 });

    // Der Bucher wird benachrichtigt und storniert; die Gebühr wird erlassen.
    await anmelden(page, NUTZER.admin);
    await page.goto("/plan/meine");
    await expect(page.locator(".seitenleiste .glocke-zahl")).toBeVisible();

    const eigener = page
      .locator(".terminliste .termin")
      .filter({ hasText: platz })
      .filter({ hasText: startzeit })
      .filter({ hasText: listendatum })
      .first();
    await eigener.getByRole("button", { name: "Stornieren" }).click();
    await eigener.getByRole("button", { name: "Wirklich stornieren" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("storniert", { timeout: 15_000 });

    // Erlassen, nicht geloescht: dass eine Gebuehr entstanden und wieder
    // weggefallen ist, gehört zur Kontohistorie.
    await page.goto("/konto");
    await expect(page.locator("tr", { hasText: /Gastgebuehr/ }).first()).toContainText("erlassen");
  });
});

/**
 * Platzverwaltung.
 *
 * Der Kern ist die zweistufige Sperrung: erst zählen, dann fragen, dann
 * verdrängen. Eine Sperrung, die zehn Buchungen wortlos wegräumt, wäre die
 * Art von Funktion, die man nach dem ersten Einsatz wieder ausbaut.
 */
test.describe("Plätze und Sperrungen", () => {
  test("normales Mitglied kommt nicht an die Platzverwaltung", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/admin/plaetze");
    await expect(page.locator(".hinweis.fehler")).toBeVisible();
  });

  test("Platz anlegen, umbenennen, stilllegen", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/plaetze");

    const name = `ZZPlatz${Date.now().toString().slice(-6)}`;
    const anlegen = page.locator("section", { hasText: "Neuen Platz anlegen" }).last();
    // exact, sonst trifft "Name" auch das Feld "Kurzname".
    await anlegen.getByLabel("Name", { exact: true }).fill(name);
    await anlegen.getByLabel("Kurzname").fill("ZZ");
    await page.getByRole("button", { name: "Platz anlegen" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("angelegt", { timeout: 15_000 });

    const zeile = page.locator("table.liste tr", { hasText: name });
    await expect(zeile).toBeVisible();
    await expect(zeile).toContainText("im Plan");

    await zeile.getByRole("button", { name: "Stilllegen" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("stillgelegt", { timeout: 15_000 });
    await expect(page.locator("table.liste tr", { hasText: name })).toContainText("stillgelegt");
  });

  test("Sperrung fragt vor dem Verdrängen und blockiert danach den Slot", async ({ page }) => {
    // Erst eine Buchung anlegen, die im Weg liegt.
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan");
    for (let i = 0; i < 4; i++) {
      const vorher = page.url();
      await page.getByRole("link", { name: /Folgetag/ }).click();
      await page.waitForURL((u) => u.toString() !== vorher);
    }
    const tag = new URL(page.url()).searchParams.get("tag") ?? "";
    expect(tag).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const freieZelle = page.locator("button.zelle.frei:not(.rest):not([disabled])").first();
    test.skip((await freieZelle.count()) === 0, "Kein freier Slot an diesem Tag");
    await freieZelle.click();

    const fenster = page.locator("dialog.fenster");
    await fenster.getByLabel("Mitspieler suchen").fill("a");
    await fenster.locator(".trefferliste li button").first().click();
    await fenster.getByRole("button", { name: /buchen/i }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gebucht", { timeout: 15_000 });

    // Jetzt den ganzen Tag auf allen Plätzen sperren.
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/plaetze");

    const sperren = page.locator("section", { hasText: "Plätze sperren" }).first();
    await sperren.getByRole("button", { name: "Alle" }).click();
    await sperren.getByLabel("Tag").fill(tag);
    await sperren.getByLabel("Grund").fill("ZZTest Platzpflege");
    await sperren.getByRole("button", { name: "Sperren" }).click();

    // Ohne Bestätigung passiert nichts – der Knopf nennt die Zahl.
    const verdraengen = page.getByRole("button", { name: /verdrängen/ });
    await expect(verdraengen).toBeVisible({ timeout: 15_000 });
    await verdraengen.click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gesperrt", { timeout: 15_000 });

    // Der Tag ist im Plan durchgehend blockiert.
    await page.goto(`/plan?tag=${tag}`);
    await expect(page.locator("button.zelle.frei:not(.rest):not([disabled])")).toHaveCount(0);
    await expect(page.locator(".zelle.blockung").first()).toContainText("ZZTest Platzpflege");

    // Aufräumen: sonst bleibt der Tag für jeden weiteren Lauf gesperrt, und die
    // Tests davor würden sich still selbst überspringen. Nebenbei belegt das,
    // dass ein Admin eine Blockung auch wieder aufheben kann.
    const blockungen = page.locator("button.zelle.blockung");
    for (let runde = 0; runde < 20; runde++) {
      const vorher = await blockungen.count();
      if (vorher === 0) break;
      await blockungen.first().click();
      const fenster = page.locator("dialog.fenster");
      // Bei einer Blockung heißt der Knopf „Sperrung aufheben“ – dort sitzt
      // niemand, dessen Buchung storniert würde.
      await fenster.getByRole("button", { name: "Sperrung aufheben" }).click();
      await fenster.getByRole("button", { name: "Wirklich stornieren" }).click();
      // Auf den neu gerenderten Plan warten statt auf die Erfolgsmeldung: die
      // steht schon da, während die Tabelle noch die alte ist, und der nächste
      // Klick ginge dann ins Leere.
      await expect.poll(() => blockungen.count(), { timeout: 15_000 }).toBeLessThan(vorher);
    }
    await expect(blockungen).toHaveCount(0);
  });
});

/**
 * Realtime.
 *
 * Zwei getrennte Browsersitzungen, sonst ist es kein Beweis: die eine bucht,
 * die andere muss es ohne Neuladen erfahren. Der Test greift bewusst nicht in
 * die Datenbank – er prüft den Weg, den die Mitglieder auch gehen.
 */
test.describe("Der Plan aktualisiert sich von selbst", () => {
  test("was der eine bucht, sieht der andere ohne Neuladen", async ({ browser }) => {
    const zuschauer = await browser.newContext();
    const bucher = await browser.newContext();
    const seiteA = await zuschauer.newPage();
    const seiteB = await bucher.newPage();

    try {
      await anmelden(seiteA, NUTZER.mitglied);
      await anmelden(seiteB, NUTZER.admin);

      // Beide auf denselben Tag, weit genug weg vom Bestand der anderen Tests.
      await seiteB.goto("/plan");
      for (let i = 0; i < 3; i++) {
        const vorher = seiteB.url();
        await seiteB.getByRole("link", { name: /Folgetag/ }).click();
        await seiteB.waitForURL((u) => u.toString() !== vorher);
      }
      const tag = new URL(seiteB.url()).searchParams.get("tag") ?? "";
      await seiteA.goto(`/plan?tag=${tag}`);
      await expect(seiteA.locator("table.plan")).toBeVisible();

      const belegtVorher = await seiteA.locator(".zelle.belegt").count();

      const freieZelle = seiteB.locator("button.zelle.frei:not(.rest):not([disabled])").first();
      test.skip((await freieZelle.count()) === 0, "Kein freier Slot an diesem Tag");
      await freieZelle.click();

      const fenster = seiteB.locator("dialog.fenster");
      await fenster.getByLabel("Mitspieler suchen").fill("a");
      await fenster.locator(".trefferliste li button").first().click();
      await fenster.getByRole("button", { name: /buchen/i }).click();
      await expect(seiteB.locator(".hinweis.erfolg")).toContainText("gebucht", { timeout: 15_000 });

      // Ohne jede Interaktion auf Seite A: der Hinweis erscheint und der Plan
      // zeigt eine Belegung mehr.
      await expect(seiteA.getByText("Der Plan wurde aktualisiert.")).toBeVisible({
        timeout: 20_000,
      });
      await expect(seiteA.locator(".zelle.belegt")).toHaveCount(belegtVorher + 1, {
        timeout: 20_000,
      });

      // Aufräumen
      await seiteB.locator("button.zelle.eigen").first().click();
      const verwalten = seiteB.locator("dialog.fenster");
      await verwalten.getByRole("button", { name: "Buchung stornieren" }).click();
      await verwalten.getByRole("button", { name: "Wirklich stornieren" }).click();
      await expect(seiteB.locator(".hinweis.erfolg")).toContainText("storniert", {
        timeout: 15_000,
      });
    } finally {
      await zuschauer.close();
      await bucher.close();
    }
  });
});

/**
 * Was in Stufe D liegen geblieben war.
 *
 * Drei Dinge, die der Vorstand im Alltag braucht: einen Grund beim Stornieren
 * einer fremden Buchung, das Sperren einer einzelnen Stunde ohne Umweg über
 * das Verwaltungsmenü, und das Ändern einer Serie statt Beenden-und-neu.
 */
test.describe("Serien ändern, sperren, Gründe nennen", () => {
  test("Admin storniert fremd mit Grund, das Mitglied liest ihn in der Glocke", async ({
    page,
  }) => {
    // Das Mitglied bucht.
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan");
    for (let i = 0; i < 2; i++) {
      const vorher = page.url();
      await page.getByRole("link", { name: /Folgetag/ }).click();
      await page.waitForURL((u) => u.toString() !== vorher);
    }
    const tag = new URL(page.url()).searchParams.get("tag") ?? "";

    const freieZelle = page.locator("button.zelle.frei:not(.rest):not([disabled])").first();
    test.skip((await freieZelle.count()) === 0, "Kein freier Slot an diesem Tag");
    await freieZelle.click();

    const fenster = page.locator("dialog.fenster");
    await fenster.getByLabel("Mitspieler suchen").fill("a");
    await fenster.locator(".trefferliste li button").first().click();
    await fenster.getByRole("button", { name: /buchen/i }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gebucht", { timeout: 15_000 });

    // Der Admin storniert sie mit Grund.
    await anmelden(page, NUTZER.admin);
    await page.goto(`/plan?tag=${tag}`);
    const fremde = page.locator("button.zelle.belegt").first();
    await fremde.click();

    const verwalten = page.locator("dialog.fenster");
    await verwalten.getByRole("button", { name: "Buchung stornieren" }).click();
    // Ohne Grund bleibt der Knopf gesperrt – bei einer fremden Buchung ist er Pflicht.
    await expect(verwalten.getByRole("button", { name: "Wirklich stornieren" })).toBeDisabled();
    await verwalten.getByLabel("Grund").fill("ZZTest Platz unbespielbar");
    await verwalten.getByRole("button", { name: "Wirklich stornieren" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("storniert", { timeout: 15_000 });

    // Das Mitglied findet den Grund in der Nachricht.
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan");
    await page.locator(".seitenleiste button.glocke").click();
    await expect(page.locator("dialog.fenster .nachrichtenliste li").first()).toContainText(
      "ZZTest Platz unbespielbar",
      { timeout: 15_000 },
    );
  });

  test("eine einzelne Stunde direkt aus dem Plan sperren", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/plan");
    for (let i = 0; i < 5; i++) {
      const vorher = page.url();
      await page.getByRole("link", { name: /Folgetag/ }).click();
      await page.waitForURL((u) => u.toString() !== vorher);
    }
    const tag = new URL(page.url()).searchParams.get("tag") ?? "";

    const freieZelle = page.locator("button.zelle.frei:not(.rest):not([disabled])").first();
    test.skip((await freieZelle.count()) === 0, "Kein freier Slot an diesem Tag");
    await freieZelle.click();

    const fenster = page.locator("dialog.fenster");
    await fenster.getByRole("button", { name: "Stattdessen sperren" }).click();
    await fenster.getByLabel("Grund der Sperrung").fill("ZZTest Regen");
    await fenster.getByRole("button", { name: "Sperren", exact: true }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gesperrt", { timeout: 15_000 });

    const blockung = page.locator(".zelle.blockung", { hasText: "ZZTest Regen" }).first();
    await expect(blockung).toBeVisible();

    // Aufräumen – eine Sperrung ohne Serie heißt „Sperrung aufheben“.
    await page.goto(`/plan?tag=${tag}`);
    await page.locator("button.zelle.blockung", { hasText: "ZZTest Regen" }).first().click();
    const auf = page.locator("dialog.fenster");
    await auf.getByRole("button", { name: "Sperrung aufheben" }).click();
    await auf.getByRole("button", { name: "Wirklich stornieren" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("storniert", { timeout: 15_000 });
  });

  test("Serie bearbeiten statt beenden und neu anlegen", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/plaetze");

    // Auf der Platzseite stehen drei Tabellen (Plätze, Buchungsarten, Serien) -
    // ein .first() träfe die falsche.
    const serien = page.locator("section.karte", { hasText: "Angelegte Serien" });
    const zeile = serien.locator("table.liste tbody tr").first();
    test.skip((await zeile.count()) === 0, "Keine Serie im Bestand");
    const vorher = ((await zeile.locator("td").first().textContent()) ?? "").trim();

    await zeile.getByRole("button", { name: "Bearbeiten" }).click();

    const fenster = page.locator("dialog.fenster");
    await expect(fenster).toBeVisible();
    const neu = `${vorher} ZZ`;
    await fenster.getByLabel("Titel").fill(neu);
    await fenster.getByRole("button", { name: "Änderung speichern" }).click();

    await expect(page.locator(".hinweis.erfolg")).toContainText("geändert", { timeout: 20_000 });
    await expect(serien.locator("table.liste tbody tr").first()).toContainText(neu);

    // Zurückbenennen, damit der nächste Lauf denselben Bestand vorfindet.
    await serien.locator("table.liste tbody tr").first().getByRole("button", { name: "Bearbeiten" }).click();
    const nochmal = page.locator("dialog.fenster");
    await nochmal.getByLabel("Titel").fill(vorher);
    await nochmal.getByRole("button", { name: "Änderung speichern" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("geändert", { timeout: 20_000 });
  });
});

/**
 * Der Vorstandsbereich.
 *
 * Vorher standen fünf Verwaltungspunkte nebeneinander im Menü und
 * Zusammengehörendes lag an verschiedenen Orten — die Buchungsregeln in einer
 * allgemeinen Einstellungsliste, die Buchungsarten bei den Plätzen. Dieser Test
 * prüft, dass jetzt ein Punkt ins Reiterband führt und die Regeln bei ihrer
 * Sache stehen.
 */
test.describe("Verwaltung", () => {
  test("ein Menüpunkt führt in sechs Bereiche", async ({ page }) => {
    await anmelden(page, NUTZER.admin);

    const nav = page.getByRole("navigation", { name: "Hauptmenü" }).first();
    await nav.getByRole("link", { name: "Verwaltung" }).click();
    await page.waitForURL(/\/admin$/);

    const reiter = page.getByRole("navigation", { name: "Verwaltung" });
    for (const name of ["Übersicht", "Mitglieder", "Plätze", "Getränke", "Beiträge", "System"]) {
      await expect(reiter.getByRole("link", { name })).toBeVisible();
    }
  });

  test("die Buchungsregeln stehen bei den Plätzen", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/plaetze");

    // Alles zum Platz auf einer Seite: sperren, Serien, Plätze, Arten, Regeln.
    await expect(page.getByRole("heading", { name: "Plätze sperren" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Serien", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Buchungsarten" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Buchungsregeln" })).toBeVisible();
    await expect(page.getByText("booking.opening_time")).toBeVisible();
  });

  test("die Lastschrift steht bei den Beiträgen, mit Jahresschalter", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/beitraege");

    await expect(page.getByRole("heading", { name: "Lastschrift" })).toBeVisible();
    await expect(page.getByText("sepa.creditor_id")).toBeVisible();

    const jahr = new Date().getFullYear();
    await page.getByRole("link", { name: `‹ ${jahr - 1}` }).click();
    await expect(page.getByRole("heading", { name: `Beitragslauf ${jahr - 1}` })).toBeVisible();
  });

  test("die Merkmale sind über die Mitglieder erreichbar", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder");

    await page.getByRole("link", { name: /Merkmale/ }).first().click();
    await page.waitForURL(/\/admin\/mitglieder\/merkmale$/);
    await expect(page.getByRole("heading", { name: "Merkmale" }).first()).toBeVisible();
  });

  test("die Getränkekarte steht bei den Getränken", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/getraenke");

    await expect(page.getByRole("heading", { name: "Getränkekarte" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Preis ändern" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Abrechnung" })).toBeVisible();

    // Ein neues Getränk ohne Preis waere unsichtbar und unbuchbar - der Knopf
    // bleibt deshalb gesperrt, bis ein Preis dasteht.
    await page.getByLabel("Name").fill("ZZTest Limonade");
    await expect(page.getByRole("button", { name: "Getränk anlegen" })).toBeDisabled();
  });

  test("ein geplanter Preis ist sichtbar und lässt sich zurücknehmen", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/getraenke");

    const karte = page.locator("section.karte", { hasText: "Preis ändern" });
    const getraenk = await karte.locator("select").first().inputValue();

    // Zehn Tage voraus: die Erhoehung darf heute noch nichts kosten.
    const stichtag = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await karte.getByLabel("Neuer Preis").fill("9,99");
    await karte.getByLabel("Gültig ab").fill(stichtag);
    await karte.getByRole("button", { name: "Preis setzen" }).click();

    await expect(page.locator(".hinweis.erfolg")).toContainText("gilt ab", { timeout: 20_000 });

    // Ohne diese Zeile bliebe eine terminierte Erhoehung bis zum Stichtag
    // unsichtbar - und wuerde ein zweites Mal eingetragen.
    const geplant = page.locator("li.termin", { hasText: "9,99" });
    await expect(geplant).toBeVisible();

    await geplant.getByRole("button", { name: "Zurücknehmen" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("zurückgenommen", {
      timeout: 20_000,
    });
    await expect(page.locator("li.termin", { hasText: "9,99" })).toHaveCount(0);

    // Der heutige Preis war zu keinem Zeitpunkt betroffen.
    await expect(karte.locator("select").first()).toHaveValue(getraenk);
    await expect(page.locator("table.liste")).not.toContainText("9,99");
  });

  test("alte Adressen leiten auf die neuen um", async ({ page }) => {
    await anmelden(page, NUTZER.admin);

    for (const [alt, neu] of [
      ["/admin/serien", "/admin/plaetze"],
      ["/admin/einstellungen", "/admin/system"],
      ["/admin/einstellungen/merkmale", "/admin/mitglieder/merkmale"],
    ]) {
      await page.goto(alt!);
      await expect(page).toHaveURL(new RegExp(`${neu}$`));
    }
  });
});
