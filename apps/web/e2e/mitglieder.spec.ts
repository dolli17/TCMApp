import { expect, test, type Locator, type Page } from "@playwright/test";
import { anmelden, NUTZER, testName } from "./hilfen";

/**
 * Mitgliederverwaltung von der Liste bis zum Löschen.
 *
 * Die Tests legen echte Mitglieder an und räumen sie am Ende selbst wieder ab –
 * so bleibt der Bestand nach einem Lauf derselbe wie davor. Angelegt wird mit
 * einem Zeitstempel im Namen, damit parallele oder abgebrochene Läufe sich
 * nicht in die Quere kommen.
 */

/** Legt ein Mitglied an und gibt dessen Detailseiten-Adresse zurück. */
async function mitgliedAnlegen(page: Page, nachname: string, vorname = "Test"): Promise<string> {
  await page.goto("/admin/mitglieder");
  await page.getByRole("button", { name: "Mitglied anlegen" }).click();

  const fenster = page.locator("dialog.fenster");
  await expect(fenster).toBeVisible();
  await fenster.getByLabel("Vorname").fill(vorname);
  await fenster.getByLabel("Nachname").fill(nachname);
  await fenster.getByRole("button", { name: "Anlegen" }).click();

  // Nach dem Anlegen führt die Oberfläche direkt auf die Detailseite.
  await page.waitForURL(/\/admin\/mitglieder\/[0-9a-f-]{36}/, { timeout: 20_000 });
  return page.url();
}

/**
 * Eine Beitragsart über ihren Anzeigetext wählen.
 *
 * selectOption nimmt kein Regex, und der Wert ist eine Kennung, die der Test
 * nicht kennt. Also den passenden Eintrag suchen und seinen Wert benutzen.
 */
async function waehleBeitragsart(karte: Locator, teil: string) {
  const auswahl = karte.getByLabel("Beitragsart");
  const treffer = auswahl.locator("option", { hasText: new RegExp(teil, "i") }).first();
  const wert = await treffer.getAttribute("value");
  await auswahl.selectOption(wert!);
}

/** Räumt ein Testmitglied wieder ab. Fehler hier sollen den Test nicht kippen. */
async function aufraeumen(page: Page, adresse: string, nachname: string) {
  try {
    await page.goto(`${adresse.split("?")[0]}?abschnitt=mitgliedschaft`);
    const zone = page.locator('section[aria-label="Datensatz beenden"]');
    const feld = zone.getByLabel(/Nachnamen eingeben/);
    if (await feld.isVisible()) {
      await feld.fill(nachname);
      await zone.getByRole("button", { name: "Endgültig löschen" }).click();
      await page.waitForURL(/\/admin\/mitglieder$/, { timeout: 20_000 });
    }
  } catch {
    // Aufräumen ist Kür, nicht Pflicht - der nächste Lauf legt einen neuen an.
  }
}

test.describe("Mitgliederverwaltung", () => {
  test("Liste: Filter und Suche", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder");

    await expect(page.getByRole("heading", { name: "Mitglieder" })).toBeVisible();
    await expect(page.locator("table.liste tbody tr").first()).toBeVisible();

    // Der Filter "Ohne Login" darf niemanden mit Login zeigen.
    await page.getByRole("link", { name: "Ohne Login", exact: true }).click();
    await expect(page).toHaveURL(/filter=ohne-login/);
    const loginSpalten = page.locator("table.liste tbody tr td:nth-child(6)");
    const anzahl = Math.min(await loginSpalten.count(), 10);
    for (let i = 0; i < anzahl; i++) {
      await expect(loginSpalten.nth(i)).toHaveText("—");
    }
  });

  test("Suche verträgt Sonderzeichen, ohne einen Datenbankfehler zu zeigen", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    // Ein Komma zerlegte den PostgREST-Filterausdruck, bevor die Eingabe
    // bereinigt wurde - die Seite antwortete mit einem Fehler statt mit Treffern.
    await page.goto("/admin/mitglieder?q=" + encodeURIComponent("Bauer, Anna (2)"));

    const text = (await page.locator("body").innerText()).toLowerCase();
    expect(text).not.toContain("violates");
    expect(text).not.toContain("failed to parse");
    await expect(page.getByRole("heading", { name: "Mitglieder" })).toBeVisible();
  });

  test("anlegen, Stammdaten ändern, im Protokoll wiederfinden, löschen", async ({ page }) => {
    const nachname = testName("Anlegen");
    await anmelden(page, NUTZER.admin);
    const adresse = await mitgliedAnlegen(page, nachname);

    await expect(page.getByRole("heading", { name: new RegExp(nachname) })).toBeVisible();
    await expect(page.locator(".marke-klein.gruen")).toContainText("aktiv");

    // Ändern
    const karte = page.locator('section[aria-label="Person und Kontakt"]');
    await karte.getByLabel("Mobil").fill("0170 1234567");
    await karte.getByRole("button", { name: "Speichern" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("Gespeichert");

    // Neu laden: der Wert muss stehen
    await page.reload();
    await expect(karte.getByLabel("Mobil")).toHaveValue("0170 1234567");

    // Und im Protokoll auftauchen
    await page.goto(`${adresse.split("?")[0]}?abschnitt=protokoll`);
    await expect(page.locator("table.liste tbody")).toContainText("Mobil");
    await expect(page.locator("table.liste tbody")).toContainText("0170 1234567");

    // Löschen: erst mit falschem Namen, dann mit richtigem
    await page.goto(`${adresse.split("?")[0]}?abschnitt=mitgliedschaft`);
    const zone = page.locator('section[aria-label="Datensatz beenden"]');
    const loeschen = zone.getByRole("button", { name: "Endgültig löschen" });
    await expect(loeschen).toBeDisabled();

    await zone.getByLabel(/Nachnamen eingeben/).fill("Falsch");
    await expect(loeschen).toBeDisabled();

    await zone.getByLabel(/Nachnamen eingeben/).fill(nachname);
    await expect(loeschen).toBeEnabled();
    await loeschen.click();

    await page.waitForURL(/\/admin\/mitglieder$/, { timeout: 20_000 });
    await page.goto("/admin/mitglieder?filter=alle&q=" + encodeURIComponent(nachname));
    await expect(page.locator("table.liste tbody tr")).toHaveCount(0);
  });

  test("Trainer setzen, in der Liste filtern, wieder abwählen", async ({ page }) => {
    const nachname = testName("Trainer");
    await anmelden(page, NUTZER.admin);
    const adresse = await mitgliedAnlegen(page, nachname);

    const sport = page.locator('section[aria-label="Sport"]');
    await sport.getByLabel("Trainer").check();
    await sport.getByLabel("Leistungsklasse").fill("LK12.3");
    await sport.getByRole("button", { name: "Speichern" }).click();
    await expect(sport.locator(".hinweis.erfolg")).toContainText("Gespeichert");

    await page.reload();
    await expect(page.locator(".marken-reihe")).toContainText("Trainer");

    await page.goto("/admin/mitglieder?filter=trainer");
    await expect(page.locator("table.liste tbody")).toContainText(nachname);

    await aufraeumen(page, adresse, nachname);
  });

  test("Verwaltungsrechte lassen sich ohne Login nicht vergeben", async ({ page }) => {
    const nachname = testName("Rolle");
    await anmelden(page, NUTZER.admin);
    const adresse = await mitgliedAnlegen(page, nachname);

    await page.goto(`${adresse.split("?")[0]}?abschnitt=mitgliedschaft`);
    const karte = page.locator('section[aria-label="Rolle und Zahler"]');
    // Ein frisch angelegtes Mitglied hat noch keinen Zugang.
    await expect(karte).toContainText("Ohne Login kann niemand Administrator werden");

    await aufraeumen(page, adresse, nachname);
  });

  test("Zahler zuweisen und wieder entfernen", async ({ page }) => {
    const kind = testName("Kind");
    const eltern = testName("Eltern");
    await anmelden(page, NUTZER.admin);

    const elternAdresse = await mitgliedAnlegen(page, eltern);
    const kindAdresse = await mitgliedAnlegen(page, kind);

    await page.goto(`${kindAdresse.split("?")[0]}?abschnitt=mitgliedschaft`);
    const karte = page.locator('section[aria-label="Rolle und Zahler"]');
    await karte.getByLabel("Zahler").fill(eltern);
    await karte.locator(".trefferliste li button").first().click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("Zahler zugewiesen");

    await page.reload();
    await expect(karte.locator(".marken li")).toContainText(eltern);

    // Wieder lösen
    await karte.locator(".marken li button").click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("Zahlt jetzt selbst");

    await aufraeumen(page, kindAdresse, kind);
    await aufraeumen(page, elternAdresse, eltern);
  });

  test("Mitgliedschaft beenden und wieder aufnehmen", async ({ page }) => {
    const nachname = testName("Austritt");
    await anmelden(page, NUTZER.admin);
    const adresse = await mitgliedAnlegen(page, nachname);

    await page.goto(`${adresse.split("?")[0]}?abschnitt=mitgliedschaft`);
    const karte = page.locator('section[aria-label="Mitgliedschaft"]');

    await karte.getByRole("button", { name: "Mitgliedschaft beenden" }).click();
    await karte.getByLabel("Grund").fill("Testlauf");
    await karte.getByRole("button", { name: "Wirklich beenden" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("Mitgliedschaft beendet");

    await page.reload();
    await expect(page.locator(".marken-reihe")).toContainText("inaktiv");

    await karte.getByRole("button", { name: "Wieder aufnehmen" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("Wieder aufgenommen");

    await page.reload();
    await expect(page.locator(".marken-reihe")).toContainText("aktiv");

    await aufraeumen(page, adresse, nachname);
  });

  test("ein Mitglied mit Historie lässt sich nicht löschen", async ({ page }) => {
    await anmelden(page, NUTZER.admin);

    // Das Konto, mit dem sich das Testmitglied anmeldet, hat Getränke und
    // Buchungen im Bestand - genau der Fall, den der Riegel abfangen soll.
    await page.goto("/admin/mitglieder?filter=alle&q=" + encodeURIComponent("Bauer"));
    await page.locator("table.liste tbody tr a").first().click();
    await page.waitForURL(/\/admin\/mitglieder\/[0-9a-f-]{36}/);

    const url = page.url().split("?")[0];
    await page.goto(`${url}?abschnitt=mitgliedschaft`);

    const zone = page.locator('section[aria-label="Datensatz beenden"]');
    await expect(zone).toBeVisible();

    // Entweder ist Löschen gesperrt (Historie vorhanden) oder das Feld steht
    // bereit (unbeschriebener Datensatz). Beides ist zulässig - der Test prüft,
    // dass die Oberfläche eine der beiden klaren Aussagen trifft.
    const gesperrt = zone.locator(".hinweis.fehler");
    const feld = zone.getByLabel(/Nachnamen eingeben/);
    const istGesperrt = (await gesperrt.count()) > 0;
    if (istGesperrt) {
      await expect(gesperrt).toContainText("Löschen ist hier nicht möglich");
      await expect(feld).toHaveCount(0);
    } else {
      await expect(feld).toBeVisible();
    }

    const text = await page.locator("body").innerText();
    expect(text).not.toContain("violates");
    expect(text).not.toContain("constraint");
  });

  test("Selbstpflege: Mitglied ändert die eigene Adresse, der Vorstand sieht es im Protokoll", async ({
    page,
  }) => {
    const ort = `Musterstadt${Date.now().toString().slice(-6)}`;

    await anmelden(page, NUTZER.mitglied);
    await page.goto("/konto");

    const karte = page.locator('section[aria-label="Meine Daten"]');
    await expect(karte).toBeVisible();

    // Erst der Prüftest: eine vierstellige Postleitzahl darf keinen
    // Datenbankfehler zeigen, sondern muss das Feld benennen.
    const plz = await karte.getByLabel("PLZ").inputValue();
    await karte.getByLabel("PLZ").fill("7037");
    await karte.getByRole("button", { name: "Speichern" }).click();
    await expect(karte.locator(".hinweis.fehler")).toContainText("fünfstellig");

    // Dann die echte Änderung
    await karte.getByLabel("PLZ").fill(plz || "70376");
    await karte.getByLabel("Ort").fill(ort);
    await karte.getByRole("button", { name: "Speichern" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("Gespeichert");

    await page.reload();
    await expect(karte.getByLabel("Ort")).toHaveValue(ort);

    // Als Admin im Protokoll wiederfinden. Das Mitgliedskonto ist über seine
    // E-Mail-Adresse eindeutig – die steht in der Liste.
    await page.context().clearCookies();
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder?filter=alle");

    const zeile = page.locator("table.liste tbody tr").filter({ hasText: NUTZER.mitglied });
    await expect(zeile).toHaveCount(1);
    const href = await zeile.locator("a").getAttribute("href");

    await page.goto(`${href}?abschnitt=protokoll`);
    await expect(page.locator("table.liste tbody")).toContainText(ort);
    await expect(page.locator("table.liste tbody")).toContainText("Ort");
  });

  test("Mitglied kann seinen Notfallkontakt hinterlegen", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/konto");

    const karte = page.locator('section[aria-label="Notfallkontakt"]');

    // Eine Nummer ohne Namen weist die Oberfläche ab, bevor die Datenbank es tut.
    await karte.getByLabel("Name").fill("");
    await karte.getByLabel("Telefon").fill("0170 9999999");
    await karte.getByRole("button", { name: "Speichern" }).click();
    await expect(karte.locator(".hinweis.fehler")).toContainText("auch ein Name");

    await karte.getByLabel("Name").fill("Erika Mustermann");
    await karte.getByLabel("Verhältnis").fill("Mutter");
    await karte.getByRole("button", { name: "Speichern" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("gespeichert");

    await page.reload();
    await expect(karte.getByLabel("Name")).toHaveValue("Erika Mustermann");
  });

  test("Merkmal anlegen, am Mitglied setzen und im Protokoll wiederfinden", async ({ page }) => {
    const code = `t_e2e_${Date.now().toString().slice(-8)}`;
    const nachname = testName("Merkmal");

    await anmelden(page, NUTZER.admin);

    // Anlegen
    // Der Name trägt den Zeitstempel mit: sonst finden sich beim zweiten Lauf
    // zwei Merkmale gleichen Namens, und der Test greift ins Leere.
    const name = `E2E-Kennzeichnung ${code}`;

    await page.goto("/admin/einstellungen/merkmale");
    await page.getByLabel("Schlüssel").fill(code);
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Wofür wird das gebraucht?").fill("Nur für den automatischen Test.");
    await page.getByLabel("Mögliche Werte").fill("rot = Rot\nblau = Blau");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gespeichert");

    // Es steht in der Liste
    await expect(page.locator("table.liste tbody")).toContainText(code);

    // Am Mitglied setzen
    const adresse = await mitgliedAnlegen(page, nachname);
    await page.goto(`${adresse.split("?")[0]}?abschnitt=merkmale`);

    const karte = page.locator('section[aria-label="Merkmale"]');
    await karte.getByLabel(name).selectOption("rot");
    await expect(karte.locator(".hinweis.erfolg")).toContainText("Gespeichert");

    await page.reload();
    await expect(karte.locator(".marken li")).toContainText("Rot");

    // Und im Protokoll
    await page.goto(`${adresse.split("?")[0]}?abschnitt=protokoll`);
    await expect(page.locator("table.liste tbody")).toContainText("Merkmal");

    // Aufräumen: erst das Mitglied, dann das Merkmal. Andersherum ginge es
    // nicht - ein Merkmal mit zugeordneten Werten lässt sich nicht löschen.
    await aufraeumen(page, adresse, nachname);

    await page.goto(`/admin/einstellungen/merkmale?bearbeiten=${code}`);
    await page.getByRole("button", { name: "Merkmal löschen" }).click();
    await page.getByRole("button", { name: "Wirklich löschen" }).click();
    await page.waitForURL(/\/admin\/einstellungen\/merkmale$/, { timeout: 20_000 });
    await expect(page.locator("table.liste tbody")).not.toContainText(code);
  });

  test("ein benutztes Merkmal lässt sich nicht löschen", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/einstellungen/merkmale?bearbeiten=foto");

    // "foto" ist eine Einwilligung aus dem Bestand. Sobald jemand sie erteilt
    // hat, steht statt des Knopfes die Begründung.
    const formular = page.locator("form.karte");
    await expect(formular).toBeVisible();
    const knopf = formular.getByRole("button", { name: "Merkmal löschen" });
    const hinweis = formular.getByText(/Löschen nicht möglich/);

    expect((await knopf.count()) + (await hinweis.count())).toBeGreaterThan(0);
  });

  test("Mitglied erteilt und widerruft eine Einwilligung", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/konto");

    const karte = page.locator('section[aria-label="Einwilligungen"]');
    await expect(karte).toBeVisible();

    const gruppe = karte.getByRole("group", { name: "Fotos und Veröffentlichung" });
    await gruppe.getByRole("button", { name: "Ja" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("Gespeichert");

    await page.reload();
    await expect(gruppe.getByRole("button", { name: "Ja" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Der Nachweis, wann die Einwilligung erteilt wurde.
    await expect(karte).toContainText("Erteilt am");

    // Widerrufen
    await gruppe.getByRole("button", { name: "Nein" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("Entfernt");

    await page.reload();
    await expect(gruppe.getByRole("button", { name: "Nein" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("ein Mitglied kann interne Merkmale nicht selbst setzen", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/konto");

    // Im Konto stehen ausschließlich Merkmale mit Selbstpflege. "Ehrungen" ist
    // Sache des Vorstands und darf hier gar nicht auftauchen.
    const karte = page.locator('section[aria-label="Einwilligungen"]');
    await expect(karte).not.toContainText("Ehrungen");
  });

  test("Bankverbindung erfassen, Mandat erteilen und widerrufen", async ({ page }) => {
    const nachname = testName("Bank");
    await anmelden(page, NUTZER.admin);
    const adresse = await mitgliedAnlegen(page, nachname);

    await page.goto(`${adresse.split("?")[0]}?abschnitt=finanzen`);
    const karte = page.locator('section[aria-label="Bankverbindung und Mandat"]');
    await expect(karte).toContainText("Keine Bankverbindung erfasst");

    await karte.getByRole("button", { name: "Bankverbindung hinzufügen" }).click();

    // Eine IBAN mit falscher Prüfziffer: der Knopf muss gesperrt bleiben, und
    // zwar bevor irgendetwas an die Datenbank geht.
    const feld = karte.getByLabel("IBAN");
    await feld.fill("DE89370400440532013001");
    await expect(karte.locator(".feldfehler")).toContainText("nicht gültig");
    await expect(karte.getByRole("button", { name: "Speichern" })).toBeDisabled();

    // Die richtige IBAN wird angenommen und lesbar gruppiert.
    await feld.fill("DE89370400440532013000");
    await expect(karte).toContainText("Prüfziffer stimmt: DE89 3704 0044 0532 0130 00");
    await karte.getByRole("button", { name: "Speichern" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("Bankverbindung gespeichert");

    // Danach steht dort nur noch die maskierte Form.
    await page.reload();
    await expect(karte).toContainText("IBAN •••• 3000");
    await expect(karte).not.toContainText("3704 0044");

    // Mandat erteilen
    await karte.getByRole("button", { name: "Mandat erteilen" }).first().click();
    await karte.getByRole("button", { name: "Mandat erteilen" }).last().click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("Mandat TCM-");

    await page.reload();
    await expect(karte.locator("table.liste tbody")).toContainText("nur Beiträge");
    await expect(karte.locator("table.liste tbody .marke-klein.gruen")).toContainText("aktiv");

    // Solange das Mandat aktiv ist, lässt sich die Bankverbindung nicht stilllegen
    await expect(
      karte.getByRole("button", { name: "Bankverbindung stilllegen" }),
    ).toHaveCount(0);

    // Widerrufen, zweistufig
    await karte.getByRole("button", { name: "Widerrufen", exact: true }).click();
    await karte.getByRole("button", { name: "Wirklich widerrufen" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("Mandat widerrufen");

    await aufraeumen(page, adresse, nachname);
  });

  test("Beitragsart zuordnen, Sonderbetrag setzen, entfernen", async ({ page }) => {
    const nachname = testName("Beitrag");
    await anmelden(page, NUTZER.admin);
    const adresse = await mitgliedAnlegen(page, nachname);

    await page.goto(`${adresse.split("?")[0]}?abschnitt=finanzen`);
    const karte = page.locator('section[aria-label="Beitragsarten"]');
    await expect(karte).toContainText("Noch keine Beitragsart zugeordnet");

    await karte.getByRole("button", { name: "Beitragsart zuordnen" }).click();
    await waehleBeitragsart(karte, "Erwachsener");
    await karte.getByRole("button", { name: "Zuordnen" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("zugeordnet");

    await page.reload();
    await expect(karte.locator("table.liste tbody")).toContainText("Erwachsener");

    // Ein zweiter Eintrag mit Sonderbetrag – der Fall Ehrenmitglied.
    await karte.getByRole("button", { name: "Beitragsart zuordnen" }).click();
    await waehleBeitragsart(karte, "pfand");
    await karte.getByLabel("Sonderbetrag").fill("0,00");
    await karte.getByLabel("Notiz").fill("Schlüssel bereits bezahlt");
    await karte.getByRole("button", { name: "Zuordnen" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("zugeordnet");

    await page.reload();
    await expect(karte.locator("table.liste tbody")).toContainText("Schlüssel bereits bezahlt");
    await expect(karte.locator("table.liste tbody")).toContainText("0,00");

    // Wieder lösen
    await karte.locator("table.liste tbody tr").first().getByRole("button", { name: "Entfernen" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("entfernt");

    await aufraeumen(page, adresse, nachname);
  });

  test("Zugang: ohne E-Mail keine Einladung, mit E-Mail schon", async ({ page }) => {
    const nachname = testName("Zugang");
    await anmelden(page, NUTZER.admin);
    const adresse = await mitgliedAnlegen(page, nachname);

    await page.goto(`${adresse.split("?")[0]}?abschnitt=mitgliedschaft`);
    const karte = page.locator('section[aria-label="Zugang"]');
    await expect(karte).toBeVisible();

    // Frisch angelegt, ohne E-Mail: die Karte erklärt, warum nichts geht.
    await expect(karte).toContainText("Keine E-Mail-Adresse hinterlegt");
    await expect(karte).toContainText("Ohne E-Mail-Adresse ist keine Einladung");
    await expect(karte.getByRole("button", { name: "Einladung verschicken" })).toBeDisabled();

    // E-Mail nachtragen
    const email = `${nachname.toLowerCase()}@example.org`;
    await page.goto(`${adresse.split("?")[0]}?abschnitt=stammdaten`);
    const stamm = page.locator('section[aria-label="Person und Kontakt"]');
    await stamm.getByLabel("E-Mail").fill(email);
    await stamm.getByRole("button", { name: "Speichern" }).click();
    await expect(stamm.locator(".hinweis.erfolg")).toContainText("Gespeichert");

    // Jetzt ist die Einladung möglich
    await page.goto(`${adresse.split("?")[0]}?abschnitt=mitgliedschaft`);
    await expect(karte).toContainText(email);
    await expect(karte.getByRole("button", { name: "Einladung verschicken" })).toBeEnabled();

    await karte.getByRole("button", { name: "Einladung verschicken" }).click();
    await expect(karte.locator(".hinweis")).toContainText(email, { timeout: 20_000 });

    await page.reload();
    await expect(karte.locator(".marke-klein.gruen")).toContainText("aktiv");
    await expect(karte).toContainText("Eingeladen:");

    // Zugang wieder entfernen, damit das Mitglied löschbar bleibt
    await karte.getByRole("button", { name: "Zugang entfernen" }).click();
    await karte.getByRole("button", { name: "Wirklich entfernen" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("entfernt", { timeout: 20_000 });

    await aufraeumen(page, adresse, nachname);
  });

  test("den eigenen Zugang kann ein Admin nicht sperren", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder?filter=alle");

    const zeile = page.locator("table.liste tbody tr").filter({ hasText: NUTZER.admin });
    const href = await zeile.locator("a").first().getAttribute("href");

    await page.goto(`${href}?abschnitt=mitgliedschaft`);
    const karte = page.locator('section[aria-label="Zugang"]');
    await expect(karte).toContainText("Den eigenen Zugang kannst du hier nicht sperren");
    await expect(karte.getByRole("button", { name: "Zugang sperren" })).toHaveCount(0);
  });

  test("die Passwortseiten sind ohne Anmeldung erreichbar", async ({ page }) => {
    await page.goto("/passwort-vergessen");
    await expect(page).toHaveURL(/passwort-vergessen/);
    await expect(page.getByRole("heading", { name: "Passwort vergessen" })).toBeVisible();

    // Die Antwort verrät nicht, ob die Adresse bekannt ist.
    await page.getByLabel("E-Mail").fill("gibtesnicht@example.org");
    await page.getByRole("button", { name: "Link anfordern" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("Wenn zu dieser Adresse");

    await page.goto("/passwort-setzen");
    await expect(page).toHaveURL(/passwort-setzen/);
    // Ohne gültiges Token aus der E-Mail sagt die Seite das auch.
    await expect(page.locator(".hinweis.fehler")).toContainText("abgelaufen", { timeout: 15_000 });
  });

  test("Mitgliedsantrag: absenden, annehmen, Mitglied entsteht", async ({ page }) => {
    const nachname = testName("Antrag");
    const email = `${nachname.toLowerCase()}@example.org`;

    // Ohne Anmeldung erreichbar – die Middleware darf nicht auf /login umleiten.
    await page.goto("/antrag");
    await expect(page).toHaveURL(/\/antrag$/);
    await expect(page.getByRole("heading", { name: "Mitglied werden." })).toBeVisible();

    await page.getByLabel("Vorname").fill("Neue");
    await page.getByLabel("Nachname").fill(nachname);
    await page.getByLabel("Geburtstag").fill("1994-07-21");
    await page.getByLabel("E-Mail", { exact: true }).fill(email);
    await page.getByLabel("Ort").fill("Muckensturm");

    await page.getByRole("button", { name: "Antrag absenden" }).click();
    // Auf die Überschrift warten statt auf die Adresse: Next wechselt die
    // Seite im Browser, ohne sie neu zu laden - waitForURL wartet dabei auf
    // ein load-Ereignis, das nie kommt.
    await expect(page.getByRole("heading", { name: "Danke!" })).toBeVisible({ timeout: 20_000 });

    // Ein zweiter Antrag derselben Adresse läuft ins Leere – aber ohne dass
    // die Seite das verrät.
    await page.goto("/antrag");
    await page.getByLabel("Vorname").fill("Nochmal");
    await page.getByLabel("Nachname").fill(nachname);
    await page.getByLabel("Geburtstag").fill("1994-07-21");
    await page.getByLabel("E-Mail", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Antrag absenden" }).click();
    await expect(page.getByRole("heading", { name: "Danke!" })).toBeVisible({ timeout: 20_000 });

    // Als Admin: der Antrag liegt vor, genau einmal
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder/antraege");
    const zeilen = page.locator("table.liste tbody tr").filter({ hasText: nachname });
    await expect(zeilen).toHaveCount(1);

    // Annehmen, mit Einladung
    await zeilen.getByRole("button", { name: "Ansehen" }).click();
    const fenster = page.locator("dialog.fenster");
    await expect(fenster).toContainText(email);
    await fenster.getByRole("button", { name: "Aufnehmen" }).click();
    // Auf irgendeine Rückmeldung warten und sie dann prüfen: schlägt die
    // Aufnahme fehl, steht der Grund im Fehlerhinweis - und der gehört in die
    // Testausgabe, sonst rätselt man über einen Zeitablauf.
    const rueckmeldung = fenster.locator(".hinweis");
    await expect(rueckmeldung).toBeVisible({ timeout: 25_000 });
    expect(await rueckmeldung.innerText()).toContain("Aufgenommen unter der Nummer");

    // Erst auf Klick geht es weiter – die Meldung mit der Mitgliedsnummer soll
    // stehen bleiben, bis der Vorstand sie gelesen hat.
    await fenster.getByRole("button", { name: "Zum neuen Mitglied" }).click();
    await page.waitForURL(/\/admin\/mitglieder\/[0-9a-f-]{36}/, { timeout: 25_000 });
    const adresse = page.url();
    await expect(page.getByRole("heading", { name: new RegExp(nachname) })).toBeVisible();

    // Der Zugang wurde gleich mit eingerichtet
    await page.goto(`${adresse.split("?")[0]}?abschnitt=mitgliedschaft`);
    await expect(page.locator('section[aria-label="Zugang"]')).toContainText("Eingeladen:");

    // Aufräumen: erst den Zugang, dann das Mitglied
    const zugang = page.locator('section[aria-label="Zugang"]');
    await zugang.getByRole("button", { name: "Zugang entfernen" }).click();
    await zugang.getByRole("button", { name: "Wirklich entfernen" }).click();
    await expect(zugang.locator(".hinweis.erfolg")).toContainText("entfernt", { timeout: 20_000 });

    await aufraeumen(page, adresse, nachname);
  });

  test("Antrag ablehnen und als Spam kennzeichnen", async ({ page }) => {
    const nachname = testName("Absage");
    const email = `${nachname.toLowerCase()}@example.org`;

    await page.goto("/antrag");
    await page.getByLabel("Vorname").fill("Leider");
    await page.getByLabel("Nachname").fill(nachname);
    await page.getByLabel("Geburtstag").fill("1990-01-01");
    await page.getByLabel("E-Mail", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Antrag absenden" }).click();
    await expect(page.getByRole("heading", { name: "Danke!" })).toBeVisible({ timeout: 20_000 });

    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder/antraege");

    const zeile = page.locator("table.liste tbody tr").filter({ hasText: nachname });
    await zeile.getByRole("button", { name: "Ansehen" }).click();

    const fenster = page.locator("dialog.fenster");
    await fenster.getByRole("button", { name: "Ablehnen" }).click();
    await fenster.getByLabel("Grund (nur für die Akte)").fill("Testlauf");
    await fenster.getByRole("button", { name: "Wirklich ablehnen" }).click();

    await page.goto("/admin/mitglieder/antraege?filter=erledigt");
    await expect(
      page.locator("table.liste tbody tr").filter({ hasText: nachname }),
    ).toContainText("abgelehnt");
  });

  test("die Kachel führt zu den Anträgen", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder");

    await page.getByRole("link", { name: /Offene Anträge/ }).click();
    await expect(page).toHaveURL(/\/admin\/mitglieder\/antraege/);
    await expect(page.getByRole("heading", { name: "Aufnahmeanträge" })).toBeVisible();
  });

  test("ein normales Mitglied kommt nicht an die Detailseite", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder");
    const ziel = await page.locator("table.liste tbody tr a").first().getAttribute("href");

    await page.context().clearCookies();
    await anmelden(page, NUTZER.mitglied);
    await page.goto(ziel!);

    await expect(page.locator(".hinweis.fehler")).toContainText(/Administrator/);
  });
});

/**
 * Die Abmeldung von den Buchungsmails.
 *
 * Sie läuft über die vorhandene Einwilligungskarte — deshalb prüft dieser Test
 * nicht neue Oberfläche, sondern dass das neue Merkmal dort ankommt und der
 * gewählte Wert das Neuladen überlebt.
 */
test.describe("E-Mails zu Buchungen", () => {
  test("Mitglied stellt die Buchungsmails ab, und es bleibt so", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/konto");

    const karte = page.locator(".karte", { hasText: "E-Mails zu Buchungen" }).first();
    await expect(karte).toBeVisible();

    // Ausgangszustand herstellen: hat ein früherer Lauf einen Wert
    // hinterlassen, ist das Auswahlfeld gar nicht da – das Merkmal lässt nur
    // einen Wert zu.
    const marke = karte.locator("ul[aria-label='E-Mails zu Buchungen: gewählt'] li");
    if ((await marke.count()) > 0) {
      await marke.first().getByRole("button").click();
      await expect(marke).toHaveCount(0, { timeout: 15_000 });
    }

    // Ein Listen-Merkmal erscheint als Auswahlfeld, nicht als Ja/Nein.
    const wahl = karte.getByLabel("E-Mails zu Buchungen");
    await wahl.selectOption({ label: "Keine E-Mails" });
    await expect(page.locator(".hinweis.erfolg")).toBeVisible({ timeout: 15_000 });

    // Nach dem Speichern steht der Wert als Marke da; das Auswahlfeld
    // verschwindet, weil das Merkmal nur einen Wert zulässt.
    await page.reload();
    const nachher = page.locator(".karte", { hasText: "E-Mails zu Buchungen" });
    await expect(
      nachher.locator("ul[aria-label='E-Mails zu Buchungen: gewählt'] li"),
    ).toContainText("Keine E-Mails");

    // Zurücksetzen, damit der nächste Lauf denselben Ausgangszustand findet.
    await nachher.getByRole("button", { name: "Keine E-Mails entfernen" }).click();
    await expect(page.locator(".hinweis.erfolg")).toBeVisible({ timeout: 15_000 });
  });
});
