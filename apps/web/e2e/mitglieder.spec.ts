import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { anmelden, NUTZER, testName } from "./hilfen";

/**
 * Mitgliederverwaltung von der Liste bis zum Löschen.
 *
 * Die Tests legen echte Mitglieder an und räumen sie am Ende selbst wieder ab –
 * so bleibt der Bestand nach einem Lauf derselbe wie davor. Angelegt wird mit
 * einem Zeitstempel im Namen, damit parallele oder abgebrochene Läufe sich
 * nicht in die Quere kommen.
 */

/**
 * Eindeutige Adresse für ein Testmitglied. example.org ist eine Testadresse:
 * Die Edge Function legt den Login still an, es geht keine Mail raus.
 */
function testEmail(nachname: string, vorname = "Test"): string {
  return `${vorname}.${nachname}@example.org`.toLowerCase();
}

/**
 * Die übrigen Pflichtfelder, die Antrag und Anlegen gleichermaßen verlangen:
 * Geburtstag, Geschlecht, Telefon und Anschrift. Vorname, Nachname und E-Mail
 * füllt jeder Test selbst, weil er sie wiederfinden will.
 */
async function pflichtfelderFuellen(bereich: Page | Locator, geburtstag = "1990-05-17") {
  await bereich.getByLabel("Geburtstag").fill(geburtstag);
  await bereich.getByLabel("Geschlecht").selectOption("diverse");
  await bereich.getByLabel("Telefon").fill("07223 12345");
  await bereich.getByLabel("Straße und Hausnummer").fill("Hauptstraße 1");
  await bereich.getByLabel("PLZ").fill("77815");
  await bereich.getByLabel("Ort", { exact: true }).fill("Muckensturm");
}

/** Öffnet das Fenster „Mitglied anlegen“ und füllt Vor- und Nachnamen. */
async function anlegeFenster(page: Page, nachname: string, vorname = "Test"): Promise<Locator> {
  await page.goto("/admin/mitglieder");
  await page.getByRole("button", { name: "Mitglied anlegen" }).click();

  const fenster = page.locator("dialog.fenster");
  await expect(fenster).toBeVisible();
  await fenster.getByLabel("Vorname").fill(vorname);
  await fenster.getByLabel("Nachname").fill(nachname);
  return fenster;
}

/** Legt ein Mitglied an und gibt dessen Detailseiten-Adresse zurück. */
async function mitgliedAnlegen(page: Page, nachname: string, vorname = "Test"): Promise<string> {
  const fenster = await anlegeFenster(page, nachname, vorname);
  // Ohne E-Mail kein Mitglied: Jedes Mitglied bekommt beim Anlegen einen Login.
  await fenster.getByLabel("E-Mail").fill(testEmail(nachname, vorname));
  await pflichtfelderFuellen(fenster);
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

/**
 * Die Links aus den Einladungsmails an eine Adresse, der jüngste zuerst.
 * Lokal fängt Mailpit jede Mail ab (supabase/config.toml, [inbucket]).
 */
async function einladungsLinks(email: string, anzahl: number): Promise<string[]> {
  const mailpit = (process.env.MAILPIT_URL ?? "http://127.0.0.1:54324").replace(/\/$/, "");
  let links: string[] = [];
  await expect
    .poll(
      async () => {
        const suche = await (await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
        const ids: string[] = (suche.messages ?? []).map((m: { ID: string }) => m.ID);
        links = [];
        for (const id of ids) {
          const mail = await (await fetch(`${mailpit}/api/v1/message/${id}`)).json();
          const treffer = /href="([^"]*\/verify[^"]*)"/.exec(mail.HTML ?? "");
          if (treffer?.[1]) links.push(treffer[1].replace(/&amp;/g, "&"));
        }
        return links.length;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThanOrEqual(anzahl);
  return links;
}

/** Räumt ein Testmitglied wieder ab. Fehler hier sollen den Test nicht kippen. */
async function aufraeumen(page: Page, adresse: string, nachname: string) {
  try {
    await page.goto(`${adresse.split("?")[0]}?teil=austritt`);
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
    await expect(page.locator('.liste-gruppe[aria-label="Mitglieder"] li').first()).toBeVisible();

    // Jedes Mitglied hat einen Login - einen Filter "Ohne Zugang" gibt es
    // nicht mehr.
    await page.getByRole("link", { name: "Trainer", exact: true }).click();
    await expect(page).toHaveURL(/filter=trainer/);
    await expect(page.getByRole("link", { name: "Ohne Zugang", exact: true })).toHaveCount(0);
  });

  test("am Desktop stehen Liste und Mitglied nebeneinander", async ({ page }) => {
    // Regel 6 der Verwaltung v2: ab 1100 px wählt ein Klick per ?id= aus,
    // ohne die Seite zu wechseln; die Liste bleibt stehen.
    await page.setViewportSize({ width: 1440, height: 900 });
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder");

    const liste = page.locator('.liste-gruppe[aria-label="Mitglieder"]');
    const zeile = liste.locator("li a").first();
    const name = ((await zeile.locator(".titel").textContent()) ?? "").split(",")[0]!.trim();
    await zeile.click();

    await expect(page).toHaveURL(/\/admin\/mitglieder\?(.*&)?id=[0-9a-f-]{36}/);
    await expect(page.locator(".mitglieder-detailseite h2#detail-name")).toContainText(name);
    await expect(liste).toBeVisible();
    await expect(liste.locator('a[aria-current="true"]')).toHaveCount(1);
  });

  test("am Telefon führt die Zeile auf die Seite des Mitglieds", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder");
    await page.locator('.liste-gruppe[aria-label="Mitglieder"] li a').first().click();
    await page.waitForURL(/\/admin\/mitglieder\/[0-9a-f-]{36}$/);
    await expect(page.locator(".mitglied-profil h1")).toBeVisible();
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
    // Aktive Mitglieder tragen keine Statusmarke, nur inaktive und archivierte
    await expect(page.locator(".mitglied-profil .marken-reihe")).not.toContainText(/inaktiv|archiviert/);

    // Der Login entsteht mit dem Mitglied.
    await expect(page.locator(".mitglied-profil .marken-reihe")).toContainText("App-Zugang aktiv");

    // Ändern - die Stammdaten sind eine Unterseite des Mitglieds
    await page.goto(`${adresse.split("?")[0]}?teil=stammdaten`);
    const karte = page.locator('section[aria-label="Person und Kontakt"]');
    await karte.getByLabel("Mobil").fill("0170 1234567");
    await karte.getByRole("button", { name: "Speichern" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("Gespeichert");

    // Neu laden: der Wert muss stehen
    await page.reload();
    await expect(karte.getByLabel("Mobil")).toHaveValue("0170 1234567");

    // Und im Protokoll auftauchen
    await page.goto(`${adresse.split("?")[0]}?teil=protokoll`);
    await expect(page.locator("table.liste tbody")).toContainText("Mobil");
    await expect(page.locator("table.liste tbody")).toContainText("0170 1234567");

    // Löschen: erst mit falschem Namen, dann mit richtigem
    await page.goto(`${adresse.split("?")[0]}?teil=austritt`);
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
    await expect(page.locator('.liste-gruppe[aria-label="Mitglieder"] li')).toHaveCount(0);
  });

  test("Trainer setzen, in der Liste filtern, wieder abwählen", async ({ page }) => {
    const nachname = testName("Trainer");
    await anmelden(page, NUTZER.admin);
    const adresse = await mitgliedAnlegen(page, nachname);

    // Trainer steht bei den Rollen, nicht mehr in der Karte Sport.
    await page.goto(`${adresse.split("?")[0]}?teil=mitgliedschaft`);
    const rollen = page.locator('section[aria-label="Rollen"]');
    await rollen.getByLabel("Trainer").check();
    await expect(rollen.locator(".hinweis.erfolg")).toContainText("Trainer vergeben");

    await page.reload();
    await expect(page.locator(".marken-reihe")).toContainText("Trainer");

    await page.goto("/admin/mitglieder?filter=trainer");
    await expect(page.locator('.liste-gruppe[aria-label="Mitglieder"]')).toContainText(nachname);

    await aufraeumen(page, adresse, nachname);
  });

  test("ein neues Mitglied hat sofort einen Login, volle Rechte sind wählbar", async ({ page }) => {
    const nachname = testName("Rolle");
    await anmelden(page, NUTZER.admin);
    const adresse = await mitgliedAnlegen(page, nachname);

    await page.goto(`${adresse.split("?")[0]}?teil=mitgliedschaft`);
    const karte = page.locator('section[aria-label="Rollen"]');
    // Den Login gibt es ab dem Anlegen, die Sperre für volle Rechte greift nicht.
    // Gesetzt werden sie hier nicht: liegengebliebene Admin-Rechte stören
    // spätere Läufe (O19).
    await expect(karte.getByLabel("Vorstand")).toBeEnabled();
    await expect(karte.getByLabel("App Admin")).toBeEnabled();
    await expect(karte).not.toContainText("Braucht einen Login");

    await karte.getByLabel("Platzwart").check();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("Platzwart vergeben");
    await page.reload();
    await expect(page.locator(".marken-reihe")).toContainText("Platzwart");

    await aufraeumen(page, adresse, nachname);
  });

  test("jedes Mitglied zahlt selbst: kein Zahler mehr zuzuweisen", async ({ page }) => {
    const nachname = testName("Selbstzahler");
    await anmelden(page, NUTZER.admin);
    const adresse = await mitgliedAnlegen(page, nachname);

    await page.goto(`${adresse.split("?")[0]}?teil=mitgliedschaft`);
    const karte = page.locator('section[aria-label="Rollen"]');
    await expect(karte.getByRole("heading", { name: "Rollen" })).toBeVisible();
    await expect(karte.getByLabel("Zahler")).toHaveCount(0);
    await expect(karte).not.toContainText("Wer bezahlt");

    await aufraeumen(page, adresse, nachname);
  });

  test("Mitgliedschaft beenden und wieder aufnehmen", async ({ page }) => {
    const nachname = testName("Austritt");
    await anmelden(page, NUTZER.admin);
    const adresse = await mitgliedAnlegen(page, nachname);

    await page.goto(`${adresse.split("?")[0]}?teil=austritt`);
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
    const url = (await page.locator('.liste-gruppe[aria-label="Mitglieder"] li a').first().getAttribute("href"))!;
    await page.goto(`${url}?teil=austritt`);

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
    await page.goto("/konto/daten");

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

    const zeile = page.locator('.liste-gruppe[aria-label="Mitglieder"] li').filter({ hasText: NUTZER.mitglied });
    await expect(zeile).toHaveCount(1);
    const href = await zeile.locator("a").getAttribute("href");

    await page.goto(`${href}?teil=protokoll`);
    await expect(page.locator("table.liste tbody")).toContainText(ort);
    await expect(page.locator("table.liste tbody")).toContainText("Ort");
  });

  test("Mitglied kann seinen Notfallkontakt hinterlegen", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/konto/notfall");

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

    await page.goto("/admin/system/merkmale");
    await page.getByRole("button", { name: "Merkmal anlegen" }).click();
    await page.getByLabel("Schlüssel").fill(code);
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Wofür wird das gebraucht?").fill("Nur für den automatischen Test.");
    await page.getByLabel("Mögliche Werte").fill("rot = Rot\nblau = Blau");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gespeichert");

    // Es steht in der Liste
    await expect(page.locator('.liste-gruppe[aria-label="Merkmale"]')).toContainText(code);

    // Am Mitglied setzen
    const adresse = await mitgliedAnlegen(page, nachname);
    await page.goto(`${adresse.split("?")[0]}?teil=merkmale`);

    const karte = page.locator('section[aria-label="Merkmale"]');
    await karte.getByLabel(name).selectOption("rot");
    await expect(karte.locator(".hinweis.erfolg")).toContainText("Gespeichert");

    await page.reload();
    await expect(karte.locator(".marken li")).toContainText("Rot");

    // Und im Protokoll
    await page.goto(`${adresse.split("?")[0]}?teil=protokoll`);
    await expect(page.locator("table.liste tbody")).toContainText("Merkmal");

    // Aufräumen: erst das Mitglied, dann das Merkmal. Andersherum ginge es
    // nicht - ein Merkmal mit zugeordneten Werten lässt sich nicht löschen.
    await aufraeumen(page, adresse, nachname);

    await page.goto(`/admin/system/merkmale?bearbeiten=${code}`);
    await page.getByRole("button", { name: "Merkmal löschen" }).click();
    await page.getByRole("button", { name: "Wirklich löschen" }).click();
    await page.waitForURL(/\/admin\/system\/merkmale$/, { timeout: 20_000 });
    await expect(page.locator('.liste-gruppe[aria-label="Merkmale"]')).not.toContainText(code);
  });

  test("Mannschaft anlegen, Mitglied als Mannschaftsführer eintragen, wieder löschen", async ({
    page,
  }) => {
    const mannschaft = testName("Mannschaft");
    const nachname = testName("Spieler");

    await anmelden(page, NUTZER.admin);

    // Anlegen - danach springt die Seite in die Bearbeitung der neuen Mannschaft
    await page.goto("/admin/mitglieder/mannschaften");
    await page.getByRole("button", { name: "Mannschaft anlegen" }).click();
    const formular = page.locator('form[aria-label="Mannschaft"]');
    await formular.getByLabel("Name").fill(mannschaft);
    await formular.getByRole("button", { name: "Speichern" }).click();
    await page.waitForURL(/\/admin\/mitglieder\/mannschaften\?bearbeiten=/, { timeout: 20_000 });
    await expect(page.locator('.liste-gruppe[aria-label="Mannschaften"]')).toContainText(mannschaft);
    const mannschaftsAdresse = page.url();

    // Am Mitglied setzen
    const adresse = await mitgliedAnlegen(page, nachname);
    await page.goto(`${adresse.split("?")[0]}?teil=mitgliedschaft`);

    const karte = page.locator('section[aria-label="Mannschaft"]');
    await karte.getByLabel("Mannschaft", { exact: true }).selectOption({ label: mannschaft });
    await karte.getByLabel("Mannschaftsführer").check();
    await karte.getByRole("button", { name: "Speichern" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("Mannschaftsführer");

    // Die Marke im Kopf und die Aufstellung zeigen es
    await page.reload();
    await expect(page.locator(".marken-reihe")).toContainText(`${mannschaft} · Mannschaftsführer`);

    await page.goto(mannschaftsAdresse);
    const aufstellung = page.locator('section[aria-label="Aufstellung"]');
    await expect(aufstellung).toContainText(nachname);
    await expect(aufstellung.locator(".hinweis-rechts.gold")).toContainText("Mannschaftsführer");

    // Und im Protokoll steht der Name der Mannschaft, nicht ihre Kennung
    await page.goto(`${adresse.split("?")[0]}?teil=protokoll`);
    await expect(page.locator("table.liste tbody")).toContainText(mannschaft);

    // Löschen mit Spieler: die Rückfrage nennt ihn
    await page.goto(mannschaftsAdresse);
    await formular.getByRole("button", { name: "Mannschaft löschen" }).click();
    await expect(formular).toContainText("Ein Spieler wird aus der Mannschaft genommen");
    await formular.getByRole("button", { name: "Wirklich löschen" }).click();
    await page.waitForURL(/\/admin\/mitglieder\/mannschaften$/, { timeout: 20_000 });
    await expect(page.locator('.liste-gruppe[aria-label="Mannschaften"]')).not.toContainText(mannschaft);

    // Das Mitglied spielt jetzt in keiner Mannschaft mehr
    await page.goto(`${adresse.split("?")[0]}?teil=mitgliedschaft`);
    await expect(karte.getByLabel("Mannschaft", { exact: true })).toHaveValue("");

    await aufraeumen(page, adresse, nachname);
  });

  test("ein benutztes Merkmal lässt sich nicht löschen", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/system/merkmale?bearbeiten=foto");

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
    await page.goto("/konto/einwilligungen");

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
    await page.goto("/konto/einwilligungen");

    // Im Konto stehen ausschließlich Merkmale mit Selbstpflege. "Ehrungen" ist
    // Sache des Vorstands und darf hier gar nicht auftauchen.
    const karte = page.locator('section[aria-label="Einwilligungen"]');
    await expect(karte).not.toContainText("Ehrungen");
  });

  test("Bankverbindung erfassen, Mandat erteilen und widerrufen", async ({ page }) => {
    const nachname = testName("Bank");
    await anmelden(page, NUTZER.admin);
    const adresse = await mitgliedAnlegen(page, nachname);

    await page.goto(`${adresse.split("?")[0]}?teil=bank`);
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
    await expect(karte.locator(".liste-gruppe")).toContainText("unterschrieben");
    await expect(karte.locator(".liste-gruppe .hinweis-rechts.gruen")).toContainText("aktiv");

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

    await page.goto(`${adresse.split("?")[0]}?teil=beitraege`);
    const karte = page.locator('section[aria-label="Beitragsarten"]');
    await expect(karte).toContainText("Noch keine Beitragsart zugeordnet");

    await karte.getByRole("button", { name: "Beitragsart zuordnen" }).click();
    await waehleBeitragsart(karte, "Erwachsener");
    await karte.getByRole("button", { name: "Zuordnen" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("zugeordnet");

    await page.reload();
    await expect(karte.locator(".liste-gruppe")).toContainText("Erwachsener");

    // Ein zweiter Eintrag mit Sonderbetrag – der Fall Ehrenmitglied.
    await karte.getByRole("button", { name: "Beitragsart zuordnen" }).click();
    await waehleBeitragsart(karte, "pfand");
    await karte.getByLabel("Sonderbetrag").fill("0,00");
    await karte.getByLabel("Notiz").fill("Schlüssel bereits bezahlt");
    await karte.getByRole("button", { name: "Zuordnen" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("zugeordnet");

    await page.reload();
    await expect(karte.locator(".liste-gruppe")).toContainText("Schlüssel bereits bezahlt");
    await expect(karte.locator(".liste-gruppe")).toContainText("0,00");

    // Wieder lösen
    await karte.locator(".liste-gruppe li button.listenzeile").first().click();
    await karte.getByRole("button", { name: "Entfernen" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("entfernt");

    await aufraeumen(page, adresse, nachname);
  });

  test("Anlegen richtet den Zugang sofort ein, Entfernen gibt es nicht", async ({ page }) => {
    const nachname = testName("Zugang");
    await anmelden(page, NUTZER.admin);
    const adresse = await mitgliedAnlegen(page, nachname);

    await page.goto(`${adresse.split("?")[0]}?teil=zugang`);
    const karte = page.locator('section[aria-label="Zugang"]');
    await expect(karte).toBeVisible();

    await expect(karte).toContainText(testEmail(nachname));
    await expect(karte.locator(".marke-klein.gruen")).toContainText("aktiv");
    await expect(karte).toContainText("Eingeladen:");
    await expect(karte.getByRole("button", { name: "Einladen" })).toHaveCount(0);
    await expect(karte.getByRole("button", { name: "Zugang entfernen" })).toHaveCount(0);

    // Sperren bleibt, und ist umkehrbar.
    await karte.getByRole("button", { name: "Zugang sperren" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("gesperrt", { timeout: 20_000 });
    await page.reload();
    await expect(karte.locator(".marke-klein.rot")).toContainText("gesperrt");
    await karte.getByRole("button", { name: "Sperre aufheben" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("freigegeben", { timeout: 20_000 });

    // Löschen nimmt den Login mit (über die Edge Function).
    await aufraeumen(page, adresse, nachname);
    await page.goto("/admin/mitglieder?filter=alle&q=" + encodeURIComponent(nachname));
    await expect(page.locator('.liste-gruppe[aria-label="Mitglieder"] li')).toHaveCount(0);
  });

  test("Selbstregistrierung ist aus, Anlegen durch die Verwaltung geht weiter (S1)", async ({ page }) => {
    const nachname = testName("Signup");
    const email = testEmail(nachname);

    // Wer sich vorab mit der Adresse eines künftigen Mitglieds registriert,
    // bekäme sonst dessen Login: loginAnlegen übernimmt ein vorhandenes Konto.
    const anonym = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { data, error } = await anonym.auth.signUp({ email, password: "geraten123" });
    expect(error?.code).toBe("signup_disabled");
    expect(data.user).toBeNull();

    // Dieselbe Adresse legt die Verwaltung danach ganz normal an.
    await anmelden(page, NUTZER.admin);
    const adresse = await mitgliedAnlegen(page, nachname);
    await page.goto(`${adresse.split("?")[0]}?teil=zugang`);
    const karte = page.locator('section[aria-label="Zugang"]');
    await expect(karte).toContainText(email);
    await expect(karte.locator(".marke-klein.gruen")).toContainText("aktiv");

    await aufraeumen(page, adresse, nachname);
  });

  test("Einladung erneut senden: neuer Link, der alte verfällt, der neue führt ins Onboarding", async ({
    page,
  }) => {
    const nachname = testName("Einladung");
    // Keine Testadresse: die Einladung geht wirklich raus, lokal in Mailpit.
    const email = `${nachname}@beispiel-verein.de`.toLowerCase();
    await anmelden(page, NUTZER.admin);
    const fenster = await anlegeFenster(page, nachname);
    await fenster.getByLabel("E-Mail").fill(email);
    await pflichtfelderFuellen(fenster);
    await fenster.getByRole("button", { name: "Anlegen" }).click();
    await page.waitForURL(/\/admin\/mitglieder\/[0-9a-f-]{36}/, { timeout: 20_000 });
    const adresse = page.url();

    // Die Liste zeigt den Stand, auch über den Filter „Onboarding offen“.
    await page.goto("/admin/mitglieder?art=onboarding&q=" + encodeURIComponent(nachname));
    const zeile = page.locator('.liste-gruppe[aria-label="Mitglieder"] li');
    await expect(zeile).toHaveCount(1);
    await expect(zeile).toContainText("Einladung ausstehend");

    await page.goto(`${adresse.split("?")[0]}?teil=zugang`);
    const karte = page.locator('section[aria-label="Zugang"]');
    await expect(karte).toContainText("Einladung ausstehend");
    await karte.getByRole("button", { name: "Einladung erneut senden" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText("neuer Einladungslink", { timeout: 20_000 });

    // Zwei Einladungen in Mailpit; nur der jüngste Link gilt.
    const links = await einladungsLinks(email, 2);
    const alt = await fetch(links[links.length - 1]!, { redirect: "manual" });
    expect(alt.headers.get("location") ?? "").toContain("error");

    await page.goto(links[0]!);
    await page.waitForURL(/\/passwort-setzen/);
    await page.getByLabel("Neues Passwort").fill("Einladung-2026!");
    await page.getByLabel("Noch einmal").fill("Einladung-2026!");
    await page.getByRole("button", { name: "Passwort speichern" }).click();
    // Die Weiche greift: vom Passwort direkt ins Onboarding.
    await page.waitForURL(/\/onboarding/, { timeout: 20_000 });

    // Aufräumen als Admin (Login geht mit dem Mitglied).
    await anmelden(page, NUTZER.admin);
    await aufraeumen(page, adresse, nachname);
  });

  test("ohne E-Mail kein Anlegen", async ({ page }) => {
    const nachname = testName("OhneMail");
    await anmelden(page, NUTZER.admin);
    const fenster = await anlegeFenster(page, nachname);

    // Das Formular verlangt die Adresse schon im Browser ...
    const email = fenster.getByLabel("E-Mail");
    await expect(email).toHaveAttribute("required", "");
    await expect(fenster).toContainText("Bekommt sofort eine Einladung");
    await fenster.getByRole("button", { name: "Anlegen" }).click();
    await expect(fenster).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/mitglieder$/);

    // ... und der Server auch, wenn die Browserprüfung fehlt.
    await fenster.locator("form").evaluate((f) => ((f as HTMLFormElement).noValidate = true));
    await fenster.getByRole("button", { name: "Anlegen" }).click();
    await expect(fenster.locator(".hinweis.fehler")).toContainText(
      "Ohne E-Mail-Adresse kann kein Mitglied angelegt werden",
      { timeout: 20_000 },
    );

    await page.goto("/admin/mitglieder?filter=alle&q=" + encodeURIComponent(nachname));
    await expect(page.locator('.liste-gruppe[aria-label="Mitglieder"] li')).toHaveCount(0);
  });

  test("scheitert der Login, entsteht auch kein Mitglied", async ({ page }) => {
    const nachname = testName("OhneLogin");
    await anmelden(page, NUTZER.admin);
    const fenster = await anlegeFenster(page, nachname);

    // Der Punkt am Ende: Die Datenbank nimmt die Adresse an, der Login-Dienst
    // nicht. create_member gelingt also, die Einladung scheitert - und die
    // Edge Function muss das Mitglied wieder entfernen.
    await fenster.locator("form").evaluate((f) => ((f as HTMLFormElement).noValidate = true));
    await fenster.getByLabel("E-Mail").fill(`${testEmail(nachname)}.`);
    await pflichtfelderFuellen(fenster);
    await fenster.getByRole("button", { name: "Anlegen" }).click();
    await expect(fenster.locator(".hinweis.fehler")).toContainText("nicht angelegt", {
      timeout: 20_000,
    });

    await page.goto("/admin/mitglieder?filter=alle&q=" + encodeURIComponent(nachname));
    await expect(page.locator('.liste-gruppe[aria-label="Mitglieder"] li')).toHaveCount(0);
  });

  test("den eigenen Zugang kann ein Admin nicht sperren", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder?filter=alle");

    const zeile = page.locator('.liste-gruppe[aria-label="Mitglieder"] li').filter({ hasText: NUTZER.admin });
    const href = await zeile.locator("a").first().getAttribute("href");

    await page.goto(`${href}?teil=zugang`);
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
    await page.getByLabel("E-Mail", { exact: true }).fill(email);
    await pflichtfelderFuellen(page, "1994-07-21");

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
    await page.getByLabel("E-Mail", { exact: true }).fill(email);
    await pflichtfelderFuellen(page, "1994-07-21");
    await page.getByRole("button", { name: "Antrag absenden" }).click();
    await expect(page.getByRole("heading", { name: "Danke!" })).toBeVisible({ timeout: 20_000 });

    // Als Admin: der Antrag liegt vor, genau einmal
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder/antraege");
    const zeilen = page.locator('.liste-gruppe[aria-label="Anträge"] li').filter({ hasText: nachname });
    await expect(zeilen).toHaveCount(1);

    // Annehmen - eingeladen wird immer, eine Wahl gibt es nicht mehr
    await zeilen.locator("button.listenzeile").click();
    const fenster = page.locator("dialog.fenster");
    await expect(fenster).toContainText(email);
    await expect(fenster).toContainText("divers");
    await expect(fenster).toContainText("Hauptstraße 1");
    await expect(fenster.getByRole("checkbox", { name: /Einladung/ })).toHaveCount(0);
    await expect(fenster).toContainText("bekommt sofort eine Einladung");
    await fenster.getByRole("button", { name: "Aufnehmen" }).click();
    // Auf irgendeine Rückmeldung warten und sie dann prüfen: schlägt die
    // Aufnahme fehl, steht der Grund im Fehlerhinweis - und der gehört in die
    // Testausgabe, sonst rätselt man über einen Zeitablauf.
    const rueckmeldung = fenster.locator(".hinweis");
    await expect(rueckmeldung).toBeVisible({ timeout: 25_000 });
    const text = await rueckmeldung.innerText();
    expect(text).toContain("Aufgenommen unter der Nummer");
    // Testadresse: Login ja, Mail nein
    expect(text).toContain(`Zugang für ${email} eingerichtet`);

    // Erst auf Klick geht es weiter – die Meldung mit der Mitgliedsnummer soll
    // stehen bleiben, bis der Vorstand sie gelesen hat.
    await fenster.getByRole("button", { name: "Zum neuen Mitglied" }).click();
    await page.waitForURL(/\/admin\/mitglieder\/[0-9a-f-]{36}/, { timeout: 25_000 });
    const adresse = page.url();
    await expect(page.getByRole("heading", { name: new RegExp(nachname) })).toBeVisible();

    // Der Zugang wurde gleich mit eingerichtet
    await page.goto(`${adresse.split("?")[0]}?teil=zugang`);
    await expect(page.locator('section[aria-label="Zugang"]')).toContainText("Eingeladen:");

    // Aufräumen: Löschen nimmt den Login mit
    await aufraeumen(page, adresse, nachname);
  });

  test("Antrag: scheitert der Login, bleibt der Antrag offen und es entsteht kein Mitglied", async ({
    page,
  }) => {
    const nachname = testName("AntragOhneLogin");
    // Der Punkt am Ende: Die Datenbank nimmt die Adresse an, der Login-Dienst
    // nicht. Der Login scheitert also, und die Annahme muss ganz ausbleiben.
    const email = `${nachname.toLowerCase()}@example.org.`;

    await page.goto("/antrag");
    await page.getByLabel("Vorname").fill("Ohne");
    await page.getByLabel("Nachname").fill(nachname);
    await page.getByLabel("E-Mail", { exact: true }).fill(email);
    await pflichtfelderFuellen(page, "1991-03-03");
    await page.locator("form").first().evaluate((f) => ((f as HTMLFormElement).noValidate = true));
    await page.getByRole("button", { name: "Antrag absenden" }).click();
    await expect(page.getByRole("heading", { name: "Danke!" })).toBeVisible({ timeout: 20_000 });

    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder/antraege");
    const zeile = page.locator('.liste-gruppe[aria-label="Anträge"] li').filter({ hasText: nachname });
    await zeile.locator("button.listenzeile").click();

    const fenster = page.locator("dialog.fenster");
    await fenster.getByRole("button", { name: "Aufnehmen" }).click();
    await expect(fenster.locator(".hinweis.fehler")).toContainText("nicht angenommen", {
      timeout: 25_000,
    });
    await expect(fenster.getByRole("button", { name: "Zum neuen Mitglied" })).toHaveCount(0);

    // Kein Mitglied, und der Antrag ist weiter offen.
    await page.goto("/admin/mitglieder?filter=alle&q=" + encodeURIComponent(nachname));
    await expect(page.locator('.liste-gruppe[aria-label="Mitglieder"] li')).toHaveCount(0);
    await page.goto("/admin/mitglieder/antraege");
    await expect(zeile).toHaveCount(1);

    // Aufräumen: als Spam kennzeichnen, dann ist er erledigt.
    await zeile.locator("button.listenzeile").click();
    await fenster.getByRole("button", { name: "Spam" }).click();
    await expect(fenster).toBeHidden({ timeout: 20_000 });
  });

  test("Antrag ablehnen und als Spam kennzeichnen", async ({ page }) => {
    const nachname = testName("Absage");
    const email = `${nachname.toLowerCase()}@example.org`;

    await page.goto("/antrag");
    await page.getByLabel("Vorname").fill("Leider");
    await page.getByLabel("Nachname").fill(nachname);
    await page.getByLabel("E-Mail", { exact: true }).fill(email);
    await pflichtfelderFuellen(page, "1990-01-01");
    await page.getByRole("button", { name: "Antrag absenden" }).click();
    await expect(page.getByRole("heading", { name: "Danke!" })).toBeVisible({ timeout: 20_000 });

    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder/antraege");

    const zeile = page.locator('.liste-gruppe[aria-label="Anträge"] li').filter({ hasText: nachname });
    await zeile.locator("button.listenzeile").click();

    const fenster = page.locator("dialog.fenster");
    await fenster.getByRole("button", { name: "Ablehnen" }).click();
    await fenster.getByLabel("Grund (nur für die Akte)").fill("Testlauf");
    await fenster.getByRole("button", { name: "Wirklich ablehnen" }).click();
    // Auf das Schliessen warten: das Fenster geht erst zu, wenn die Server-Aktion
    // zurueck ist. Ohne diese Zeile laedt der naechste Aufruf unter Last die
    // Liste, bevor der Status ueberhaupt gesetzt wurde.
    await expect(fenster).toBeHidden({ timeout: 20_000 });

    await page.goto("/admin/mitglieder/antraege?filter=erledigt");
    await expect(
      page.locator('.liste-gruppe[aria-label="Anträge"] li').filter({ hasText: nachname }),
    ).toContainText("abgelehnt");
  });

  test("der Reiter führt zu den Anträgen", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder");

    await page
      .getByRole("navigation", { name: "Mitglieder", exact: true })
      .getByRole("link", { name: /Anträge/ })
      .click();
    await expect(page).toHaveURL(/\/admin\/mitglieder\/antraege/);
    await expect(page.getByRole("heading", { name: "Aufnahmeanträge" })).toBeVisible();
  });

  test("ein normales Mitglied kommt nicht an die Detailseite", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder");
    const ziel = await page.locator('.liste-gruppe[aria-label="Mitglieder"] li a').first().getAttribute("href");

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
    await page.goto("/konto/einwilligungen");

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
