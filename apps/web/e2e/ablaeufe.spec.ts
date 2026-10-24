import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * End-to-End gegen die laufende Anwendung und die echte Datenbank.
 *
 * Der Bestand ist synthetisch, deshalb sind echte Buchungen hier unbedenklich.
 * Der Gewinn: RLS, die Regeln in create_booking und die Fehlerübersetzung
 * werden mitgetestet - nichts davon wäre mit Mocks zu haben.
 */

import {
  alsListendatum,
  anmelden,
  freieStunde,
  mitspielerWaehlen,
  MITSPIELER,
  NUTZER,
  oeffneFreieStunde,
  PASSWORT,
  tagIn,
  ZAHLERIN,
} from "./hilfen";
import { FREMDE_BUCHUNG } from "./testbestand-zuruecksetzen";

/*
 * Feste Termine (T3): jeder Buchungstest hat seinen eigenen Platz und Tag im
 * Fenster, das der Seed frei hält (11–15 Uhr). Das globalSetup räumt dort die
 * Buchungen der Testkonten weg. Kein Test sucht mehr „die erste freie Zelle“
 * oder überspringt sich, wenn keine da ist.
 *
 *   Tag +1  Platz 1 11:00  Mitspielerpflicht (ohne Buchung)
 *           Platz 8 12:00  fremde Buchung aus dem globalSetup
 *           Platz 3 13:00  axe mit anstehender Buchung, hell (barrierefreiheit.spec.ts)
 *           Platz 3 14:00  dasselbe, dunkel
 *   Tag +2  Platz 1 11:00  Escape schließt (ohne Buchung)
 *           Platz 2 11:00  Admin storniert fremd mit Grund
 *           Platz 3, 4     buchungsregeln.spec.ts
 *   Tag +3  Platz 1 11:30  :30 buchen und stornieren
 *           Platz 6 11:00  Realtime
 *           Platz 7 14:00  Bestätigung unten am Telefon (darstellung.spec.ts)
 *   Tag +4  Platz 1 11:00  Mitspieler austauschen
 *           Platz 5 11:00  Sperrung fragt vor dem Verdrängen (sperrt den Tag)
 *   Tag +5  Platz 2 11:30  angebrochene Stunden (11:30 und 12:30)
 *           Platz 7 11:00  einzelne Stunde sperren
 *           Platz 6 12:00  Umsetzen auf belegtes Ziel
 *   Tag +6  Platz 3 11:00  Meine Buchungen und Glocke
 *           Platz 4 11:00  offene Spiele und Gäste
 *           Platz 8 11:00  Sperrung bearbeiten
 *           Platz 5 12:00  Umsetzen
 */

/** Die Buchung im Raster öffnen, über ihre Beschriftung. */
async function oeffneBuchung(page: Page, platz: string, zeit: string) {
  await page.getByRole("button", { name: `Buchung ${zeit} auf ${platz} verwalten` }).click();
  const fenster = page.locator("dialog.fenster");
  await expect(fenster).toBeVisible();
  return fenster;
}

/**
 * Die eigene Buchung im Raster stornieren.
 *
 * Gewartet wird, bis die Buchung aus dem Raster verschwunden ist, nicht auf
 * die Meldung: nach einem ersten Storno steht „storniert“ schon da, und der
 * Test liefe weiter, bevor der zweite durch ist - die Buchung blieb dann
 * liegen und stand dem nächsten Test im Weg.
 */
async function storniere(page: Page, platz: string, zeit: string) {
  const fenster = await oeffneBuchung(page, platz, zeit);
  await fenster.getByRole("button", { name: "Buchung stornieren" }).click();
  await fenster.getByRole("button", { name: "Wirklich stornieren" }).click();
  await expect(
    page.getByRole("button", { name: `Buchung ${zeit} auf ${platz} verwalten` }),
  ).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator(".hinweis.erfolg")).toContainText("storniert");
}

/**
 * Einen Tag weiter: die Datums-Kachel rechts neben der gewählten. Früher gab
 * es dafür einen Link "Folgetag", seit dem Umbau stehen die Tage als Kacheln.
 */
async function naechsterTag(page: Page) {
  const kacheln = page.locator(".datums-kacheln a");
  const aktuell = await kacheln.evaluateAll((els) =>
    els.findIndex((e) => e.getAttribute("aria-current") === "date"),
  );
  await kacheln.nth(aktuell + 1).click();
}

/**
 * Eine Gläubiger-IBAN, falls keine gesetzt ist - ohne sie baut die Kasse
 * keine Lastschriftdatei. Der lokale Seed setzt nur die Gläubiger-Id.
 */
async function setzeGlaeubigerIban() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { auth: { persistSession: false } },
  );
  const { error: anmeldeFehler } = await supabase.auth.signInWithPassword({
    email: NUTZER.admin,
    password: PASSWORT,
  });
  expect(anmeldeFehler).toBeNull();
  const { data } = await supabase.from("settings").select("value").eq("key", "sepa.creditor_iban").maybeSingle();
  if (!data?.value) {
    const { error } = await supabase.rpc("set_setting", {
      p_key: "sepa.creditor_iban",
      p_value: "DE89370400440532013000",
    });
    expect(error).toBeNull();
  }
}

/** Das Suchfeld für Mitspieler - es öffnet sich über "+ Mitglied". */
async function suchfeld(fenster: Locator) {
  const feld = fenster.getByLabel("Mitspieler suchen");
  if (!(await feld.isVisible())) await fenster.getByRole("button", { name: "Mitglied" }).click();
  return feld;
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
    await page.getByLabel("Passwort", { exact: true }).fill("definitiv-falsch");
    await page.getByRole("button", { name: "Anmelden" }).click();

    const meldung = page.locator(".hinweis.fehler");
    await expect(meldung).toBeVisible();
    await expect(meldung).toContainText("stimmt nicht");
    await expect(page).toHaveURL(/\/login/);
  });

  test("nach dem Anmelden erscheint die Startseite", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await expect(page).toHaveURL((u) => u.pathname === "/");
    await expect(page.getByRole("heading", { level: 1, name: /^Hallo, / })).toBeVisible();
    for (const abschnitt of ["Als Nächstes", "Jetzt frei", "Offene Spiele", "Neuigkeiten"]) {
      await expect(page.getByRole("heading", { level: 2, name: abschnitt })).toBeVisible();
    }
    await expect(page.getByRole("heading", { level: 2, name: /^Dein / })).toBeVisible();
    // Start steht als erster Eintrag im Menue und ist hier aktiv.
    const nav = page.getByRole("navigation", { name: "Hauptmenü" }).first();
    await expect(nav.getByRole("link").first()).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link").first()).toHaveText("Start");
  });

  test("Mitglied kann sich anmelden und sieht die Plätze", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    // Morgen: am Abend ist heute nichts mehr buchbar, und "Freie Zeiten"
    // zeigt dann statt der Kästchen nur einen Satz.
    await page.goto(`/plan?tag=${tagIn(1)}`);
    await expect(page.getByRole("heading", { level: 1, name: "Plätze", exact: true })).toBeVisible();
    await expect(page.locator(".plan-raster .raster")).toBeVisible();
    // Acht Plaetze, jeder mit eigenem Spaltenkopf
    await expect(page.locator(".raster .spalten-kopf")).toHaveCount(8);
    // Am Telefon zeigt dieselbe Seite zuerst die freien Zeiten, je Platz ein Kästchen
    await expect(page.locator(".plan-listen .fz-nummern span")).toHaveCount(8);
  });
});

test.describe("Ein Konto pro Browser", () => {
  test("meldet sich in Tab 2 ein anderes Konto an, meldet sich Tab 1 ab", async ({ page, context }) => {
    await anmelden(page, NUTZER.mitglied);
    const tab2 = await context.newPage();
    await anmelden(tab2, NUTZER.admin);

    await expect(page).toHaveURL(/\/login\?grund=anderes-konto/, { timeout: 10_000 });
    await expect(page.getByRole("status")).toContainText("anderes Konto");
    // Tab 2 bleibt im neuen Konto
    await tab2.goto("/admin");
    await expect(tab2.getByRole("navigation", { name: "Verwaltungsmenü" })).toBeVisible();
  });

  test("meldet sich Tab 2 ab, geht auch Tab 1 zur Anmeldung", async ({ page, context }) => {
    await anmelden(page, NUTZER.mitglied);
    const tab2 = await context.newPage();
    await tab2.goto("/konto");
    // Die Nutzerkarte der Seitenleiste fragt einmal nach (U28).
    await tab2.getByRole("button", { name: "Abmelden" }).first().click();
    await tab2.getByRole("group", { name: "Wirklich abmelden?" }).getByRole("button", { name: "Abmelden" }).click();
    await expect(tab2).toHaveURL(/\/login/);

    await expect(page).toHaveURL(/\/login\?grund=abgemeldet/, { timeout: 10_000 });
  });

  test("zwei Tabs mit demselben Konto bleiben angemeldet", async ({ page, context }) => {
    await anmelden(page, NUTZER.mitglied);
    const tab2 = await context.newPage();
    await tab2.goto("/plan");
    await expect(tab2.getByRole("heading", { level: 1, name: "Plätze", exact: true })).toBeVisible();
    await page.waitForTimeout(3_000);
    await expect(page).not.toHaveURL(/\/login/);
  });
});

test.describe("Abmelden nach Inaktivität", () => {
  test("nach 30 Minuten ohne Aktivität wird abgemeldet", async ({ page }) => {
    await page.clock.install();
    await anmelden(page, NUTZER.mitglied);
    await page.clock.fastForward("31:00");

    await expect(page).toHaveURL(/\/login\?grund=inaktiv/);
    await expect(page.getByRole("status")).toContainText("ohne Aktivität abgemeldet");
    // Auch wirklich abgemeldet, nicht nur umgeleitet
    await page.goto("/plan");
    await expect(page).toHaveURL(/\/login/);
  });

  test("wer etwas tut, bleibt angemeldet", async ({ page }) => {
    await page.clock.install();
    await anmelden(page, NUTZER.mitglied);
    await page.clock.fastForward("20:00");
    await page.mouse.click(5, 5);
    await page.clock.fastForward("20:00");

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { level: 1, name: /^Hallo, / })).toBeVisible();
  });

  test("ein alter Stempel meldet schon beim Seitenaufruf ab", async ({ page, context }) => {
    // Der Rechner war zugeklappt: kein Timer lief, die Middleware muss es merken.
    await anmelden(page, NUTZER.mitglied);
    const herkunft = new URL(page.url()).origin;
    // Erst weg von der App - sonst bemerkt die offene Seite den Stempel selbst
    // und leitet um, bevor die Middleware gefragt wird.
    await page.goto("about:blank");
    await context.addCookies([
      { name: "tcm_aktiv", value: String(Date.now() - 31 * 60_000), url: herkunft },
    ]);
    await page.goto("/plan");

    await expect(page).toHaveURL(/\/login\?grund=inaktiv&weiter=%2Fplan/);
    await page.goto("/plan");
    await expect(page).toHaveURL(/\/login/);
  });

  test("der Kiosk bleibt angemeldet", async ({ page }) => {
    await page.clock.install();
    await anmelden(page, NUTZER.kiosk);
    await expect(page).toHaveURL(/\/kiosk/);
    await page.clock.fastForward("31:00");

    await expect(page).toHaveURL(/\/kiosk/);
  });
});

test.describe("Platzbuchung", () => {
  /** Auf einen kuenftigen Tag wechseln und die Navigation abwarten. */
  async function tageWeiter(page: Page, anzahl: number) {
    await page.goto("/plan");
    for (let i = 0; i < anzahl; i++) {
      const vorher = page.url();
      await naechsterTag(page);
      await page.waitForURL((u) => u.toString() !== vorher);
    }
  }

  test("Klick auf eine freie Stunde öffnet ein Fenster, Escape schließt es", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await tageWeiter(page, 2);

    const freieZelle = freieStunde(page, "Platz 1", "11:00");
    await expect(freieZelle).toBeVisible();
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
    const fenster = await oeffneFreieStunde(page, tagIn(3), "Platz 1", "11:00");

    // Beginn zur halben Stunde
    await fenster.getByRole("radio", { name: "11:30" }).check();

    // Mitspieler durch Tippen finden statt aus 300 Namen zu scrollen
    await mitspielerWaehlen(fenster, MITSPIELER.mia);
    await expect(fenster.locator(".marken li")).toHaveCount(1);

    await fenster.getByRole("button", { name: /buchen/i }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gebucht", { timeout: 15_000 });

    await storniere(page, "Platz 1", "11:30");
  });

  test("Mitspieler einer eigenen Buchung austauschen", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    const fenster = await oeffneFreieStunde(page, tagIn(4), "Platz 1", "11:00");
    await mitspielerWaehlen(fenster, MITSPIELER.mia);
    await fenster.getByRole("button", { name: /buchen/i }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gebucht", { timeout: 15_000 });

    const verwalten = await oeffneBuchung(page, "Platz 1", "11:00");
    // Mia entfernen. Beim Einzel ist genau ein Mitspieler erlaubt, deshalb
    // muss erst Platz gemacht werden.
    await expect(verwalten.locator(".marken li")).toContainText(MITSPIELER.mia);
    await verwalten.locator(".marken li button").first().click();

    // Ein anderer Mitspieler als der eben entfernte - sonst aendert sich
    // nichts und der Speichern-Knopf bleibt zu Recht gesperrt.
    await mitspielerWaehlen(verwalten, MITSPIELER.max);
    await verwalten.getByRole("button", { name: "Mitspieler speichern" }).click();

    await expect(page.locator(".hinweis.erfolg")).toContainText("aktualisiert", {
      timeout: 15_000,
    });

    // Aufraeumen, damit der naechste Lauf denselben Slot wieder frei findet
    await storniere(page, "Platz 1", "11:00");
  });

  test("Mitspielerpflicht wird durchgesetzt", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    const fenster = await oeffneFreieStunde(page, tagIn(1), "Platz 1", "11:00");

    // Ohne Mitspieler ist der Buchen-Knopf gesperrt; die Datenbank wuerde es
    // ebenfalls ablehnen, aber der Benutzer soll es vorher sehen.
    await expect(fenster.getByRole("button", { name: /buchen/i })).toBeDisabled();
  });

  test("das Raster zeigt Stunden von 08 bis 20 Uhr", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan");

    const zeiten = page.locator(".raster-zeiten .stunde");
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
   *
   * Platz 2 ist an Tag +5 von 11 bis 15 Uhr frei: der Seed bucht dort nie.
   */
  test("angebrochene Stunden: Reststunde bleibt buchbar, beide Buchungen sichtbar", async ({
    page,
  }) => {
    await anmelden(page, NUTZER.mitglied);
    const platz = "Platz 2";
    const spalte = page.locator(`.plan-raster .spalte[aria-label="${platz}"]`);

    async function imFensterBuchen(uhrzeit: string) {
      const fenster = page.locator("dialog.fenster");
      await expect(fenster).toBeVisible();
      await fenster.getByRole("radio", { name: uhrzeit }).check();
      await mitspielerWaehlen(fenster, MITSPIELER.mia);
      await fenster.getByRole("button", { name: /buchen/i }).click();
      await expect(page.locator(".hinweis.erfolg")).toContainText("gebucht", { timeout: 15_000 });
    }

    await oeffneFreieStunde(page, tagIn(5), platz, "11:00");
    await imFensterBuchen("11:30");

    // 12:00 ist jetzt angebrochen, 12:30 bleibt buchbar.
    await expect(freieStunde(page, platz, "12:00")).toHaveCount(0);
    await freieStunde(page, platz, "12:30").click();
    await imFensterBuchen("12:30");

    // Beide Buchungen stehen als eigene Blöcke im Raster, nicht nur die erste.
    await expect(spalte.locator(".beleg")).toHaveCount(2);
    await expect(spalte.locator(".beleg").first()).toContainText("11:30–12:30");
    await expect(spalte.locator(".beleg").last()).toContainText("12:30–13:30");

    // Aufraeumen, damit der naechste Lauf denselben Platz wieder frei findet.
    await storniere(page, platz, "11:30");
    await storniere(page, platz, "12:30");
  });

  test("ein Training über 18:30–20:00 belegt 18 und 19 Uhr", async ({ page }) => {
    // Eine Belegung, die nicht auf der vollen Stunde beginnt, darf nicht
    // zwischen die Stunden fallen - sonst sähe der 18-Uhr-Platz frei aus,
    // obwohl er es nicht ist. Im Raster steht sie als ein Block über die ganze
    // Dauer, und keine Startzeit, die in sie hineinreicht, ist buchbar.
    await anmelden(page, NUTZER.mitglied);

    const heute = new Date();
    let gefunden = false;

    for (let tag = 0; tag < 14 && !gefunden; tag++) {
      const d = new Date(heute);
      d.setDate(d.getDate() + tag);
      await page.goto(`/plan?tag=${d.toISOString().slice(0, 10)}`);

      const training = page.locator(".plan-raster .beleg", { hasText: "18:30–20:00" }).first();
      if ((await training.count()) === 0) continue;
      gefunden = true;

      // Serientermine sind Training: schraffiert, nicht als Sperrung.
      await expect(training).toHaveClass(/serie/);

      const spalte = training.locator("xpath=ancestor::div[contains(@class,'spalte')]");
      const platz = (await spalte.getAttribute("aria-label")) ?? "";
      for (const uhr of ["18:00", "18:30", "19:00", "19:30"]) {
        await expect(
          spalte.getByRole("button", { name: `${platz} um ${uhr} buchen` }),
          `${uhr} dürfte auf ${platz} nicht buchbar sein`,
        ).toHaveCount(0);
      }
    }

    expect(gefunden, "In den nächsten 14 Tagen liegt kein Training über 18:30").toBe(true);
  });
});

test.describe("Getränke", () => {
  test("Mitglied bucht ein Getränk und nimmt es zurück", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    // Die alte Adresse aus Lesezeichen fuehrt in den Bereich Verein.
    await page.goto("/getraenke");
    await expect(page).toHaveURL(/\/verein\/getraenke$/);

    await expect(page.getByRole("heading", { name: "Was nimmst du?" })).toBeVisible();

    const vorher = await page.locator(".zuletzt li").count();
    // Sammeln und auf einmal eintragen
    await page.getByRole("button", { name: /eins mehr/ }).first().click();
    await page.getByRole("button", { name: "Eintragen" }).click();

    await expect(page.locator(".hinweis.erfolg")).toContainText("Eingetragen", { timeout: 15_000 });
    await expect(page.locator(".zuletzt li")).toHaveCount(vorher + 1);
    // U16: die Meldung ist im Bild, die neue Zeile hervorgehoben
    await expect(page.locator(".toast-ort .hinweis.erfolg")).toBeInViewport();
    await expect(page.locator(".zuletzt li.markiert")).toHaveCount(1);

    // Innerhalb des Zeitfensters muss die Ruecknahme moeglich sein
    await page.locator(".zuletzt li").first().getByRole("button", { name: "Zurücknehmen" }).click();
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
    "/admin/kasse",
    "/admin/plaetze",
    "/admin/getraenke",
    "/admin/system",
    "/admin/system/merkmale",
    "/admin/arbeitsdienst",
  ]) {
    test(`normales Mitglied kommt nicht an ${pfad}`, async ({ page }) => {
      await anmelden(page, NUTZER.mitglied);
      await page.goto(pfad);
      await expect(page.locator(".hinweis.fehler")).toContainText(/vorbehalten/);
    });
  }

  test("Admin sieht die Mitgliederliste", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/mitglieder");
    await expect(page.getByRole("heading", { name: "Mitglieder" })).toBeVisible();
    await expect(page.locator('.liste-gruppe[aria-label="Mitglieder"] li').first()).toBeVisible();
  });

  test("Admin sieht die Jahresbeiträge mit Mandatslage", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/kasse?abschnitt=beitraege");
    await expect(page.getByRole("heading", { name: /Jahresbeiträge/ }).first()).toBeVisible();
    // Die fehlende Glaeubiger-ID muss deutlich sichtbar sein
    await expect(page.locator(".hinweis.fehler").first()).toContainText(/Gläubiger|Mandat/);
  });

  test("Admin kann Serien anlegen", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/plaetze?ansicht=serien");
    await expect(page.getByRole("heading", { name: "Laufend", exact: true })).toBeVisible();
    // Das Formular steht im Fenster hinter dem Kopfknopf.
    await page.getByRole("button", { name: "Serie anlegen" }).click();
    await expect(page.getByRole("button", { name: "Vorschau" })).toBeVisible();
  });

  // Die fremde Buchung legt das globalSetup an (Mia Mitspiel, testbestand-zuruecksetzen.ts).
  test("Admin kann jede fremde Buchung öffnen", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto(`/plan?tag=${tagIn(FREMDE_BUCHUNG.inTagen)}`);

    const fenster = await oeffneBuchung(page, FREMDE_BUCHUNG.platz, FREMDE_BUCHUNG.zeit);
    await expect(fenster).toContainText("mit Platzrechten");
    await page.keyboard.press("Escape");
  });

  test("normales Mitglied kann eine fremde Buchung nicht öffnen", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto(`/plan?tag=${tagIn(FREMDE_BUCHUNG.inTagen)}`);
    // Die Buchung steht im Plan ...
    await expect(
      page.locator(`.plan-raster .spalte[aria-label="${FREMDE_BUCHUNG.platz}"] .beleg`).first(),
    ).toBeVisible();
    // ... aber fremde Belegungen sind <span>, keine Schaltflaeche - es gibt nichts zu klicken.
    await expect(page.locator(".plan-raster button.beleg.belegt")).toHaveCount(0);
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

    // Namensauswahl vorhanden: die Suche liefert Trefferzeilen
    await page.getByPlaceholder("Name eingeben…").fill("a");
    await expect(page.locator(".kiosk-treffer button").first()).toBeVisible();

    // Aber keine Mitgliederverwaltung
    await page.goto("/admin/mitglieder");
    await expect(page.locator(".hinweis.fehler")).toBeVisible();
  });

  test("Kiosk bucht ein Getränk auf ein Mitglied", async ({ page }) => {
    await anmelden(page, NUTZER.kiosk);
    await page.goto("/kiosk");

    // Ein festes Mitglied statt des ersten Treffers zu "a".
    await page.getByPlaceholder("Name eingeben…").fill("Mitspiel");
    await page.locator(".kiosk-treffer button").filter({ hasText: "Max" }).click();

    // Tippen zählt eins dazu, eingetragen wird erst über den gelben Knopf
    await page.locator(".kiosk-kacheln .kachel-knopf").first().click();
    await page.getByRole("button", { name: /^Für .+ eintragen$/ }).click();

    await expect(page.locator(".hinweis.erfolg")).toContainText("Eingetragen", {
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
    const name = ((await page.locator(".seitenleiste .nutzerkarte .name").textContent()) ?? "").trim();
    expect(name.length, "Der Name des Testmitglieds ist nicht lesbar").toBeGreaterThan(2);
    // Voller Name, nicht nur der Nachname: "Bauer" gibt es im Testbestand
    // mehrfach, und der erste Treffer waere die falsche Person.
    const [vorname, ...rest] = name.split(" ");
    const alsListenzeile = `${rest.join(" ")}, ${vorname}`;

    // 2. Der Admin bucht und traegt das Mitglied als Mitspieler ein.
    await anmelden(page, NUTZER.admin);
    const tag = tagIn(6);
    const listendatum = alsListendatum(tag);
    const fenster = await oeffneFreieStunde(page, tag, "Platz 3", "11:00");
    await (await suchfeld(fenster)).fill(name);
    const treffer = fenster
      .locator(".trefferliste li button")
      .filter({ hasText: alsListenzeile })
      .first();
    await expect(treffer).toBeVisible();
    await treffer.click();
    await expect(fenster.locator(".marken li")).toContainText(name);

    const platz = "Platz 3";
    const startzeit = "11:00";
    await fenster.getByRole("button", { name: /buchen/i }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gebucht", { timeout: 15_000 });

    // 3. Das Mitglied sieht die Glocke und findet die Buchung bei sich.
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan/meine");

    const glocke = page.locator(".seitenkopf button.glocke");
    await expect(glocke.locator(".glocke-zahl")).toBeVisible();
    await glocke.click();

    const nachrichten = page.locator("dialog.fenster .nachrichtenliste li");
    await expect(nachrichten.first()).toContainText("Du bist als Mitspieler eingetragen", {
      timeout: 15_000,
    });
    await page.keyboard.press("Escape");

    // Als Mitspieler steht dort Austragen, nicht Stornieren.
    const termin = page
      .locator("section.meine .termin")
      .filter({ hasText: platz })
      .filter({ hasText: startzeit })
      .filter({ hasText: listendatum })
      .first();
    await expect(termin).toBeVisible();
    await expect(termin.getByRole("button", { name: "Austragen" })).toBeVisible();

    // 4. Nach dem Lesen ist der Zaehler weg.
    await page.reload();
    await expect(page.locator(".seitenkopf .glocke-zahl")).toHaveCount(0);

    // 5. Aufraeumen: der Bucher storniert ueber seine eigene Liste.
    await anmelden(page, NUTZER.admin);
    await page.goto("/plan/meine");
    const eigener = page
      .locator("section.meine .termin")
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
    // Sechs Tage, nicht sieben: der Vorlauf betraegt 7 x 24 Stunden ab jetzt,
    // und eine Buchung am Vormittag des siebten Tages liegt je nach Uhrzeit
    // dahinter.
    const tag = tagIn(6);
    const listendatum = alsListendatum(tag);
    const platz = "Platz 4";
    const startzeit = "11:00";
    const fenster = await oeffneFreieStunde(page, tag, platz, startzeit);

    // Doppel: vier Plätze, damit nach Bucher, Gast und Beitretendem noch Luft
    // bleibt und die Buchung ausgeschrieben werden kann.
    await fenster.getByRole("radio", { name: "Doppel" }).check();
    await fenster.getByRole("button", { name: /Gast hinzufügen/ }).click();
    await expect(fenster.locator(".marken li.gast")).toHaveCount(1);
    await expect(fenster.locator(".gasthinweis")).toContainText("10,00 €");

    await fenster.getByLabel("Mitspieler gesucht").check();
    await fenster.getByRole("button", { name: /buchen/i }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gebucht", { timeout: 15_000 });

    // Der Plan markiert die Buchung als offen. Fuer den Bucher bleibt sie
    // "Deine Buchung" (gelb) und traegt die Marke "sucht 1".
    await expect(page.locator(".plan-raster .beleg.eigen .sucht-marke").first()).toBeVisible();

    // Die Gastgebühr steht als Forderung im Konto des Buchers.
    await page.goto("/konto");
    await expect(page.getByText(/Gastgeb(ue|ü)hr/).first()).toBeVisible();

    // Ein anderes Mitglied findet das offene Spiel und trägt sich ein.
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan/offen");
    const spiel = page
      .locator("section.offen .termin")
      .filter({ hasText: platz })
      .filter({ hasText: startzeit })
      .filter({ hasText: listendatum })
      .first();
    await expect(spiel).toBeVisible();
    // Die Kopfzeile nennt, wer sucht (O22) - nicht "Du", das ist ein anderes Mitglied
    await expect(spiel.locator("strong")).toHaveText(/^(?!Du ).+ sucht (einen|\d+) Mitspieler$/);
    await spiel.getByRole("button", { name: "Mitspielen" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("eingetragen", { timeout: 15_000 });

    // Der Bucher wird benachrichtigt und storniert; die Gebühr wird erlassen.
    await anmelden(page, NUTZER.admin);
    await page.goto("/plan/meine");
    await expect(page.locator(".seitenkopf .glocke-zahl")).toBeVisible();

    const eigener = page
      .locator("section.meine .termin")
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
    await expect(page.locator(".frueher .forderung", { hasText: /Gastgeb(ue|ü)hr/ }).first()).toContainText("erlassen");
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
    // Anlegen über die letzte Zeile der Liste, das Formular steht im Blatt.
    await page.getByRole("button", { name: "Neuen Platz anlegen" }).click();
    const anlegen = page.locator("dialog.fenster");
    // exact, sonst trifft "Name" auch das Feld "Kurzname".
    await anlegen.getByLabel("Name", { exact: true }).fill(name);
    await anlegen.getByLabel("Kurzname").fill("ZZ");
    await anlegen.getByRole("button", { name: "Platz anlegen" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("angelegt", { timeout: 15_000 });

    // Die Plätze stehen als Listenzeilen; Stilllegen steht im Blatt des Platzes.
    const zeile = page.locator('.liste-gruppe[aria-label="Plätze"] li', { hasText: name });
    await expect(zeile).toBeVisible();
    await expect(zeile).toContainText("im Plan");

    await zeile.locator("button.listenzeile").click();
    await page.locator("dialog.fenster").getByRole("button", { name: "Stilllegen" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("stillgelegt", { timeout: 15_000 });
    await expect(
      page.locator('.liste-gruppe[aria-label="Plätze"] li', { hasText: name }),
    ).toContainText("stillgelegt");
  });

  test("Sperrung fragt vor dem Verdrängen und blockiert danach den Slot", async ({ page }) => {
    // Erst eine Buchung anlegen, die im Weg liegt.
    await anmelden(page, NUTZER.mitglied);
    const tag = tagIn(4);
    const fenster = await oeffneFreieStunde(page, tag, "Platz 5", "11:00");
    await mitspielerWaehlen(fenster, MITSPIELER.max);
    await fenster.getByRole("button", { name: /buchen/i }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gebucht", { timeout: 15_000 });

    // Jetzt den ganzen Tag auf allen Plätzen sperren.
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/plaetze");

    // Das Sperrformular steht im Fenster hinter dem Kopfknopf.
    await page.getByRole("button", { name: "Plätze sperren" }).click();
    const sperren = page.locator("dialog.fenster section", { hasText: "Plätze sperren" }).first();
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
    await expect(page.locator(".plan-raster button.frei-slot")).toHaveCount(0);
    await expect(page.locator(".plan-raster .beleg.gesperrt").first()).toContainText("ZZTest Platzpflege");

    // Aufräumen: sonst bleibt der Tag für jeden weiteren Lauf gesperrt, und die
    // Tests davor würden sich still selbst überspringen. Nebenbei belegt das,
    // dass ein Admin eine Blockung auch wieder aufheben kann.
    const blockungen = page.locator(".plan-raster button.beleg.gesperrt");
    for (let runde = 0; runde < 20; runde++) {
      const vorher = await blockungen.count();
      if (vorher === 0) break;
      await blockungen.first().click();
      const fenster = page.locator("dialog.fenster");
      // Bei einer Blockung heißt der Knopf „Sperrung aufheben“ – dort sitzt
      // niemand, dessen Buchung storniert würde.
      await fenster.getByRole("button", { name: "Sperrung aufheben" }).click();
      await fenster.getByRole("button", { name: "Wirklich aufheben" }).click();
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

      // Beide auf denselben Tag, der Bucher auf seinen festen Termin.
      const tag = tagIn(3);
      await seiteA.goto(`/plan?tag=${tag}`);
      await expect(seiteA.locator(".plan-raster .raster")).toBeVisible();

      const belegtVorher = await seiteA.locator(".plan-raster .beleg").count();

      const fenster = await oeffneFreieStunde(seiteB, tag, "Platz 6", "11:00");
      await mitspielerWaehlen(fenster, MITSPIELER.max);
      await fenster.getByRole("button", { name: /buchen/i }).click();
      await expect(seiteB.locator(".hinweis.erfolg")).toContainText("gebucht", { timeout: 15_000 });

      // Ohne jede Interaktion auf Seite A: der Hinweis erscheint und der Plan
      // zeigt eine Belegung mehr.
      await expect(seiteA.getByText("Der Plan wurde aktualisiert.")).toBeVisible({
        timeout: 20_000,
      });
      await expect(seiteA.locator(".plan-raster .beleg")).toHaveCount(belegtVorher + 1, {
        timeout: 20_000,
      });

      // Aufräumen
      await storniere(seiteB, "Platz 6", "11:00");
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
    const tag = tagIn(2);
    const fenster = await oeffneFreieStunde(page, tag, "Platz 2", "11:00");
    await mitspielerWaehlen(fenster, MITSPIELER.max);
    await fenster.getByRole("button", { name: /buchen/i }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gebucht", { timeout: 15_000 });

    // Der Admin storniert sie mit Grund.
    await anmelden(page, NUTZER.admin);
    await page.goto(`/plan?tag=${tag}`);
    const verwalten = await oeffneBuchung(page, "Platz 2", "11:00");
    await verwalten.getByRole("button", { name: "Buchung stornieren" }).click();
    // Ohne Grund bleibt der Knopf gesperrt – bei einer fremden Buchung ist er Pflicht.
    await expect(verwalten.getByRole("button", { name: "Wirklich stornieren" })).toBeDisabled();
    await verwalten.getByLabel("Grund").fill("ZZTest Platz unbespielbar");
    await verwalten.getByRole("button", { name: "Wirklich stornieren" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("storniert", { timeout: 15_000 });

    // Das Mitglied findet den Grund in der Nachricht.
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan");
    await page.locator(".seitenkopf button.glocke").click();
    await expect(page.locator("dialog.fenster .nachrichtenliste li").first()).toContainText(
      "ZZTest Platz unbespielbar",
      { timeout: 15_000 },
    );
  });

  test("eine einzelne Stunde direkt aus dem Plan sperren", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    const tag = tagIn(5);
    const fenster = await oeffneFreieStunde(page, tag, "Platz 7", "11:00");
    await fenster.getByRole("button", { name: "Stattdessen sperren" }).click();
    await fenster.getByLabel("Grund (freiwillig)").fill("ZZTest Regen");
    await fenster.getByRole("button", { name: "Sperren", exact: true }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gesperrt", { timeout: 15_000 });

    const blockung = page.locator(".plan-raster .beleg.gesperrt", { hasText: "ZZTest Regen" }).first();
    await expect(blockung).toBeVisible();

    // Aufräumen – eine Sperrung ohne Serie heißt „Sperrung aufheben“.
    await page.goto(`/plan?tag=${tag}`);
    await page.locator(".plan-raster button.beleg.gesperrt", { hasText: "ZZTest Regen" }).first().click();
    const auf = page.locator("dialog.fenster");
    await auf.getByRole("button", { name: "Sperrung aufheben" }).click();
    await auf.getByRole("button", { name: "Wirklich aufheben" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("aufgehoben", { timeout: 15_000 });
  });

  test("Sperrung ohne Grund anlegen, bearbeiten und aufheben", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    const tag = tagIn(6);
    const fenster = await oeffneFreieStunde(page, tag, "Platz 8", "11:00");

    // Sperren ohne Grund, nur mit Kategorie: im Block steht die Kategorie.
    await fenster.getByRole("button", { name: "Stattdessen sperren" }).click();
    await fenster.getByLabel("Kategorie").selectOption({ label: "Verbandsspiel" });
    await fenster.getByRole("button", { name: "Sperren", exact: true }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gesperrt", { timeout: 15_000 });
    const blockung = page.locator(".plan-raster button.beleg.gesperrt", { hasText: "Verbandsspiel" }).first();
    await expect(blockung).toBeVisible();

    // Bearbeiten: andere Kategorie, ein Grund, eine halbe Stunde länger.
    await blockung.click();
    const blatt = page.locator("dialog.fenster");
    await blatt.getByRole("button", { name: "Sperrung bearbeiten" }).click();
    await blatt.getByLabel("Kategorie").selectOption({ label: "Platzpflege" });
    await blatt.getByLabel("Grund (freiwillig)").fill("ZZTest Nässe");
    const bis = blatt.getByLabel("Bis");
    const [h, m] = (await bis.inputValue()).split(":").map(Number);
    const neu = h! * 60 + m! + 30;
    await bis.fill(`${String(Math.floor(neu / 60)).padStart(2, "0")}:${String(neu % 60).padStart(2, "0")}`);
    await blatt.getByRole("button", { name: "Änderungen speichern" }).click();

    // Bis 12:30 ist Platz 8 frei, es muss also nichts verdrängt werden.
    await expect(page.locator(".hinweis.erfolg")).toContainText("Sperrung geändert", { timeout: 15_000 });

    // Oben die Kategorie, darunter der Grund.
    await page.goto(`/plan?tag=${tag}`);
    const geaendert = page.locator(".plan-raster button.beleg.gesperrt", { hasText: "ZZTest Nässe" }).first();
    await expect(geaendert.locator(".wer")).toContainText("Platzpflege");
    await expect(geaendert.locator(".mit")).toContainText("ZZTest Nässe");

    // Aufräumen und dabei das Aufheben prüfen.
    await geaendert.click();
    const auf = page.locator("dialog.fenster");
    await auf.getByRole("button", { name: "Sperrung aufheben" }).click();
    await auf.getByRole("button", { name: "Wirklich aufheben" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("aufgehoben", { timeout: 15_000 });
    await expect(page.locator(".plan-raster .beleg.gesperrt", { hasText: "ZZTest Nässe" })).toHaveCount(0);
  });

  test("Serie bearbeiten statt beenden und neu anlegen", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/plaetze?ansicht=serien");

    // Auf der Platzseite stehen drei Tabellen (Plätze, Buchungsarten, Serien) -
    // ein .first() träfe die falsche.
    const serien = page.locator('section[aria-labelledby="h-serien"]');
    // Das Jugendtraining aus dem Seed; das globalSetup stellt seinen Titel her.
    const zeile = serien.locator(".liste-gruppe li").first();
    await expect(zeile).toContainText("Jugendtraining");
    const vorher = ((await zeile.locator(".titel").textContent()) ?? "").trim();

    // Ein Tippen auf die Zeile öffnet das Blatt zum Ändern.
    await zeile.locator("button.listenzeile").click();

    const fenster = page.locator("dialog.fenster");
    await expect(fenster).toBeVisible();
    const neu = `${vorher} ZZ`;
    await fenster.getByLabel("Titel").fill(neu);
    await fenster.getByRole("button", { name: "Änderung speichern" }).click();

    await expect(page.locator(".hinweis.erfolg")).toContainText("geändert", { timeout: 20_000 });
    await expect(serien.locator(".liste-gruppe li").first()).toContainText(neu);

    // Zurückbenennen, damit der nächste Lauf denselben Bestand vorfindet.
    await serien.locator(".liste-gruppe li").first().locator("button.listenzeile").click();
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
  test("die Seitenleiste führt in sieben Bereiche, ohne zweites Menü", async ({ page }) => {
    await anmelden(page, NUTZER.admin);

    // Ein Menü statt drei (docs/design/clubhaus/verwaltung, Regel 1): die
    // Seitenleiste fuehrt die Bereiche einzeln, ein Reiterband gibt es nicht mehr.
    const nav = page.getByRole("navigation", { name: "Verwaltungsmenü" });
    await nav.getByRole("link", { name: "Übersicht" }).click();
    await page.waitForURL(/\/admin$/);

    for (const name of [
      "Übersicht", "Mitglieder", "Arbeitsdienst", "Kasse", "Plätze & Serien", "Getränke", "System",
    ]) {
      await expect(nav.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
    }
    await expect(page.getByRole("navigation", { name: "Verwaltung", exact: true })).toHaveCount(0);
  });

  test("die Buchungsregeln stehen bei den Plätzen", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/plaetze");

    // Alles zum Platz in einem Bereich; Serien sind das zweite Segment.
    await expect(page.getByRole("button", { name: "Plätze sperren" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Plätze und Serien" }).getByRole("link", { name: "Serien" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Buchungsarten" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Buchungsregeln" })).toBeVisible();
    // Deutsche Namen statt Schlüssel (U12)
    await expect(page.getByLabel("Öffnungszeit", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Gastgebühr (€)")).toBeVisible();
    await expect(page.getByText("booking.opening_time")).toHaveCount(0);
  });

  test("die Lastschrift steht in der Kasse, mit Jahresschalter", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/kasse?abschnitt=regeln");

    await expect(page.getByRole("heading", { name: "Lastschrift" })).toBeVisible();
    await expect(page.getByLabel("Gläubiger-Identifikationsnummer")).toBeVisible();
    await expect(page.getByLabel("Format der Bankdatei")).toBeVisible();
    await expect(page.getByText("sepa.creditor_id")).toHaveCount(0);

    const jahr = new Date().getFullYear();
    await page.goto("/admin/kasse?abschnitt=beitraege");
    await page.getByRole("link", { name: `‹ ${jahr - 1}` }).click();
    await expect(page.getByRole("heading", { name: `Jahresbeiträge ${jahr - 1}` })).toBeVisible();
  });

  test("die Kasse führt über drei Segmente, Zu tun steht darüber", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/kasse");

    // Drei Teile (Regel 1); was zu tun ist und die Kennzahlen stehen darüber (U50)
    const segmente = page.getByRole("navigation", { name: "Kasse", exact: true });
    for (const name of ["Forderungen", "Lastschriften", "Getränkemonate"]) {
      await expect(segmente.getByRole("link", { name })).toBeVisible();
    }
    await expect(segmente.getByRole("link")).toHaveCount(3);
    await expect(segmente.getByRole("link", { name: "Forderungen" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Zu tun" })).toBeVisible();
    await expect(page.getByText("Noch nicht eingezogen")).toBeVisible();

    // Unter „Forderungen“ stehen auch alle Quellen von Forderungen
    const quellen = page.locator('.liste-gruppe[aria-label="Abrechnungen"]');
    for (const name of [/^Jahresbeiträge \d{4}/, /^Arbeitsdienst \d{4}/, /^Gastgebühren/]) {
      await expect(quellen.getByRole("link", { name })).toBeVisible();
    }
    await expect(quellen.getByRole("button", { name: /Forderung anlegen/ })).toBeVisible();

    await segmente.getByRole("link", { name: "Getränkemonate" }).click();
    await expect(page.getByRole("heading", { name: "Getränkemonate" })).toBeVisible();

    await segmente.getByRole("link", { name: "Lastschriften" }).click();
    await expect(page.getByRole("heading", { name: "So läuft das Geld" })).toBeVisible();

    // Beitragsarten und Regeln stehen als Zeilen am Ende
    const einrichtung = page.locator('.liste-gruppe[aria-label="Einrichtung der Kasse"]');
    for (const name of [/^Beitragsarten/, /^Regeln/]) {
      await expect(einrichtung.getByRole("link", { name })).toBeVisible();
    }
    await einrichtung.getByRole("link", { name: /^Beitragsarten/ }).click();
    await expect(page.getByRole("heading", { name: "Beitragsarten" })).toBeVisible();
    // Ohne diese Tabelle liessen sich keine Jahresbeitraege erzeugen - sie war der
    // fehlende Unterbau.
    await expect(page.locator('.liste-gruppe[aria-label="Beitragsarten"] li').first()).toBeVisible();
  });

  test("der Hauptknopf der Kasse ist der nächste Schritt", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/kasse");

    // Gelb ist genau ein Knopf im Kopf: „Einzug vorbereiten“, wenn es etwas
    // einzuziehen gibt, sonst die erste Aufgabe aus „Zu tun“ (U50). Deren
    // Zeile nennt die Aktion dann nicht noch einmal (U63).
    const kopf = page.locator(".verwaltung-kopf .aktionen .knopf.gold");
    const zeilen = page.locator('.liste-gruppe[aria-label="Zu tun"] li');
    const aktionen = await zeilen.locator(".hinweis-rechts").allTextContents();
    if (aktionen.includes("Einzug vorbereiten")) {
      await expect(kopf).toHaveText("Einzug vorbereiten");
    } else if ((await zeilen.count()) > 0) {
      const erste = zeilen.first();
      await expect(kopf).toHaveCount(1);
      await expect(erste.locator(".hinweis-rechts")).toHaveCount(0);
      expect(await kopf.getAttribute("href")).toBe(await erste.locator("a").first().getAttribute("href"));
    } else {
      await expect(kopf).toHaveCount(0);
    }
  });

  test("die Jahresbeiträge erzeugen Forderungen, ein zweites Mal nicht", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    // Ein Jahr, das der Seed nicht kennt: der Lauf soll hier nichts zu tun
    // finden und das auch sagen, statt schweigend Erfolg zu melden.
    await page.goto("/admin/kasse?abschnitt=beitraege&jahr=2029");

    await expect(page.getByRole("heading", { name: "Forderungen erzeugen" })).toBeVisible();
    await expect(
      page.locator("section.karte", { hasText: "Forderungen erzeugen" }),
    ).toContainText("Für 2029 ist alles berechnet");
  });

  test("ein Einzug lässt keinen Abbuchungstag vor Ablauf der Frist zu", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/kasse/einzug");
    await expect(page.getByRole("heading", { name: "Einzug vorbereiten" })).toBeVisible();

    // Das Feld nimmt kein zu frühes Datum an - die Frist wird nicht erst beim
    // Absenden geprüft. Die Frist selbst prüft 24_einzug.sql.
    const feld = page.getByLabel("Abbuchungstag");
    const min = await feld.getAttribute("min");
    const inDreizehnTagen = new Date(Date.now() + 13 * 86_400_000).toISOString().slice(0, 10);
    expect(min).not.toBeNull();
    expect(min! > inDreizehnTagen).toBe(true);
    await expect(feld).toHaveValue(min!);
  });

  test("Forderungen lassen sich nach Stand filtern", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/kasse?abschnitt=forderungen");

    // Der Stand ist ein Auswahlfeld, die Art die eine Chipreihe (U51)
    await page.getByLabel("Stand").selectOption("returned");
    await expect(page).toHaveURL(/stand=returned/);
    await expect(page.getByLabel("Stand")).toHaveValue("returned");
  });

  test("der Arbeitsdienst ist ein eigener Bereich", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin");

    await page.getByRole("navigation", { name: "Verwaltungsmenü" }).getByRole("link", { name: "Arbeitsdienst" }).click();
    await page.waitForURL(/\/admin\/arbeitsdienst$/);

    await expect(page.getByRole("heading", { name: "Arbeitsdienst" })).toBeVisible();
    // Ohne diese Karte schuldet niemand etwas — sie ist die Grundlage.
    await expect(
      page.getByRole("heading", { name: "Soll-Stunden je Beitragsart" }),
    ).toBeVisible();

    // Suche und Stand-Chips (U48)
    const stand = page.getByRole("navigation", { name: "Stand" });
    await stand.getByRole("link", { name: "Offen" }).click();
    await expect(page).toHaveURL(/stand=offen/);
    await expect(page.getByLabel("Arbeitsdienst durchsuchen")).toBeVisible();

    // Das laufende Jahr lässt sich nicht abrechnen: es können noch Stunden kommen.
    await expect(
      page.locator("section.karte", { hasText: "Jahresausgleich" }),
    ).toContainText("läuft noch");
  });

  test("die Merkmale stehen unter System", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/system");

    await page.getByRole("link", { name: /Merkmale/ }).first().click();
    await page.waitForURL(/\/admin\/system\/merkmale$/);
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
    await page.getByRole("button", { name: "Getränk anlegen" }).click();
    const fenster = page.locator("dialog.fenster");
    await fenster.getByLabel("Name").fill("ZZTest Limonade");
    await expect(fenster.getByRole("button", { name: "Getränk anlegen" })).toBeDisabled();
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
    // Die Seite zeigt auch die Getränkemonate als Tabelle - gemeint ist die Karte.
    await expect(
      page.locator('.liste-gruppe[aria-label="Getränke"]'),
    ).not.toContainText("9,99");
  });

  test("die Einzüge sagen, was zum Einziehen noch fehlt", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/kasse/lastschriften");

    // Die Lastschriften sind ein Segment der Kasse; alte Adressen leiten dorthin.
    await expect(page).toHaveURL(/\/admin\/kasse\?abschnitt=lastschriften/);
    await expect(page.getByRole("heading", { name: "Laufend" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Abgeschlossen" })).toBeVisible();
    // „Einzug vorbereiten“ steht nur im Kopf, wenn es etwas einzuziehen gibt
    // (U50); das prüft „der Hauptknopf der Kasse ist der nächste Schritt“.

    // Ohne Gläubiger-ID und Vereins-IBAN lässt sich keine Datei bauen. Das muss
    // hier stehen und nicht erst beim Klick auf „erzeugen" - einmal, als
    // Hinweis mit dem Weg ins Feld (U50).
    const fehlt = page.locator(".hinweis.gold");
    if (await fehlt.count()) {
      await expect(fehlt).toHaveCount(1);
      await expect(fehlt).toContainText(/Gläubiger|IBAN/);
      await fehlt.getByRole("link", { name: "Jetzt eintragen" }).click();
      await expect(page).toHaveURL(/abschnitt=regeln#(iban|glaeubiger-id)$/);
      await expect(page.locator(":focus")).toHaveAttribute("id", /^(iban|glaeubiger-id)$/);
    }
  });

  test("alte Kassen-Adressen führen zu den neuen Abschnitten", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/kasse?abschnitt=lauf");
    await expect(page.getByRole("heading", { name: /^Jahresbeiträge \d{4}/ })).toBeVisible();
    await page.goto("/admin/kasse?abschnitt=getraenke");
    await expect(page.getByRole("heading", { name: "Getränkemonate" })).toBeVisible();
    // Die fünf Segmente von früher landen bei den drei neuen (U50)
    for (const [alt, neu] of [["start", /\/admin\/kasse$/], ["einzuege", /abschnitt=lastschriften/], ["abrechnen", /abschnitt=forderungen/], ["einstellungen", /\/admin\/kasse#einstellungen$/]] as const) {
      await page.goto(`/admin/kasse?abschnitt=${alt}`);
      await expect(page).toHaveURL(neu);
    }
  });

  test("Forderungen zeigen ihre Art und lassen sich danach filtern", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/kasse?abschnitt=forderungen");

    const arten = page.getByRole("navigation", { name: "Art" });
    await expect(arten.getByRole("link", { name: "Alle Arten" })).toHaveAttribute("aria-current", "true");
    await arten.getByRole("link", { name: "Beitrag" }).click();
    await expect(page).toHaveURL(/art=fee/);
    await expect(arten.getByRole("link", { name: "Beitrag" })).toHaveAttribute("aria-current", "true");

    // Jede Zeile trägt ihre Art als Marke - gefiltert also nur „Beitrag“
    const marken = page.locator('.liste-gruppe[aria-label="Forderungen"] .marke-klein');
    const anzahl = await marken.count();
    for (let i = 0; i < Math.min(anzahl, 20); i++) {
      await expect(marken.nth(i)).toHaveText("Beitrag");
    }
  });

  test("ein Einzug kündigt an und legt die Lastschrift in einem Schritt an", async ({ page }) => {
    await anmelden(page, NUTZER.admin);

    // Eine eigene Forderung, damit der Test nicht vom Bestand abhängt
    await page.goto("/admin/kasse?abschnitt=forderungen");
    await page.getByRole("button", { name: /Forderung anlegen/ }).first().click();
    const fenster = page.locator("dialog.fenster");
    await fenster.getByLabel("Mitglied").fill(ZAHLERIN);
    await fenster.getByLabel("Art").selectOption("deposit");
    await fenster.getByLabel("Betrag in Euro").fill("12,50");
    await fenster.getByLabel("Beschreibung").fill("ZZTest Pfand Einzug");
    await fenster.getByRole("button", { name: "Forderung anlegen" }).click();
    await expect(fenster.locator(".hinweis.erfolg")).toBeVisible({ timeout: 20_000 });

    // Start nennt sie unter „Zu tun“ und führt mit Vorauswahl weiter
    await page.goto("/admin/kasse");
    const zuTun = page.locator('.liste-gruppe[aria-label="Zu tun"]');
    await zuTun.getByRole("link", { name: /Pfand · noch nicht eingezogen/ }).click();
    await page.waitForURL(/\/admin\/kasse\/einzug\?gruppe=/);
    await expect(page.getByRole("checkbox", { name: /Pfand/ })).toBeChecked();

    // Ein Tag, ein Name, eine Vorschau
    await expect(page.getByLabel("Bezeichnung")).toHaveValue("Pfand");
    const wer = page.locator("section", { has: page.getByRole("heading", { name: "Wer ist dabei?" }) });
    await expect(wer.locator(".kachel.gruen")).toContainText("Lastschrift", { timeout: 20_000 });

    await page.getByRole("button", { name: "Ankündigen und Einzug anlegen" }).click();
    await page.getByRole("group", { name: "Rückfrage" }).getByRole("button", { name: "Ja, ankündigen" }).click();
    await page.waitForURL(/\/admin\/kasse\/lastschriften\/[0-9a-f-]{36}$/, { timeout: 20_000 });

    // Angekündigt - und die Datei ist sofort dran, ohne auf die Frist zu warten
    await expect(page.locator(".lauf-titel .statusmarke")).toHaveText("Angekündigt");
    await expect(page.getByText("Bankdatei erzeugen und im Onlinebanking einreichen")).toBeVisible();
    await expect(page.getByRole("button", { name: "Bankdatei erzeugen" })).toBeEnabled();
    await expect(page.getByRole("heading", { name: "Stand" })).toBeVisible();

    // Bis zur Datei lässt sich ein Mitglied herausnehmen; die Forderung ist dann wieder offen
    await page.getByRole("button", { name: `${ZAHLERIN}: aus dem Einzug nehmen` }).click();
    await page.locator("dialog.fenster").getByRole("button", { name: "Aus dem Einzug nehmen" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("wieder offen", { timeout: 20_000 });
    await expect(page.locator(".lauf-titel .statusmarke")).toHaveText("Leer");

    // Ein leerer Einzug lässt sich löschen
    await page.getByRole("button", { name: "Leeren Einzug löschen" }).click();
    await page.waitForURL(/abschnitt=lastschriften/, { timeout: 20_000 });
  });

  test("eine Forderung im Einzugsentwurf erlassen nimmt sie aus dem Einzug (B1)", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    const beschreibung = `ZZTest Pfand Erlassen ${Date.now().toString().slice(-6)}`;

    await page.goto("/admin/kasse?abschnitt=forderungen");
    await page.getByRole("button", { name: /Forderung anlegen/ }).first().click();
    const fenster = page.locator("dialog.fenster");
    await fenster.getByLabel("Mitglied").fill(ZAHLERIN);
    await fenster.getByLabel("Art").selectOption("deposit");
    await fenster.getByLabel("Betrag in Euro").fill("13,70");
    await fenster.getByLabel("Beschreibung").fill(beschreibung);
    await fenster.getByRole("button", { name: "Forderung anlegen" }).click();
    await expect(fenster.locator(".hinweis.erfolg")).toBeVisible({ timeout: 20_000 });

    await page.goto("/admin/kasse/einzug");
    await page.getByRole("checkbox", { name: /Pfand/ }).first().check();
    const wer = page.locator("section", { has: page.getByRole("heading", { name: "Wer ist dabei?" }) });
    await expect(wer.locator(".kachel.gruen")).toContainText("Lastschrift", { timeout: 20_000 });
    await page.getByRole("button", { name: "Ankündigen und Einzug anlegen" }).click();
    await page.getByRole("group", { name: "Rückfrage" }).getByRole("button", { name: "Ja, ankündigen" }).click();
    await page.waitForURL(/\/admin\/kasse\/lastschriften\/[0-9a-f-]{36}$/, { timeout: 20_000 });

    // Angekündigt und im Entwurf - in der Kasse trotzdem erlassbar
    await page.goto("/admin/kasse?abschnitt=forderungen&stand=notified&art=deposit");
    await page.locator('.liste-gruppe[aria-label="Forderungen"] li', { hasText: beschreibung }).getByRole("button").click();
    const blatt = page.locator("dialog.fenster");
    await expect(blatt).toContainText("wird sie dort herausgenommen");
    await blatt.getByRole("button", { name: "Erlassen" }).click();
    await blatt.getByLabel("Grund").fill("ZZTest Versehen");
    await blatt.getByRole("button", { name: "Wirklich erlassen" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("erlassen", { timeout: 20_000 });

    // Die Datenbank: erlassen und kein Posten mehr im Einzug
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      { auth: { persistSession: false } },
    );
    await supabase.auth.signInWithPassword({ email: NUTZER.admin, password: PASSWORT });
    const { data: forderung } = await supabase
      .from("charges").select("id, status").like("description", `${beschreibung}%`).single();
    expect(forderung?.status).toBe("waived");
    const { count } = await supabase
      .from("debit_items").select("id", { count: "exact", head: true }).eq("charge_id", forderung!.id);
    expect(count).toBe(0);
  });

  test("Ankündigen, Datei und Einreichen fragen nach; abschließen erst nach der Frist", async ({ page }) => {
    // Ohne Gläubiger-IBAN entsteht keine Datei, und der Seed setzt keine.
    await setzeGlaeubigerIban();
    await anmelden(page, NUTZER.admin);

    await page.goto("/admin/kasse?abschnitt=forderungen");
    await page.getByRole("button", { name: /Forderung anlegen/ }).first().click();
    const fenster = page.locator("dialog.fenster");
    await fenster.getByLabel("Mitglied").fill(ZAHLERIN);
    await fenster.getByLabel("Art").selectOption("deposit");
    await fenster.getByLabel("Betrag in Euro").fill("7,50");
    await fenster.getByLabel("Beschreibung").fill("ZZTest Pfand Rückfrage");
    await fenster.getByRole("button", { name: "Forderung anlegen" }).click();
    await expect(fenster.locator(".hinweis.erfolg")).toBeVisible({ timeout: 20_000 });

    await page.goto("/admin/kasse/einzug");
    await page.getByRole("checkbox", { name: /Pfand/ }).first().check();
    const tag = await page.getByLabel("Abbuchungstag").inputValue();
    const abbuchung = tag.split("-").reverse().join(".");
    const wer = page.locator("section", { has: page.getByRole("heading", { name: "Wer ist dabei?" }) });
    await expect(wer.locator(".kachel.gruen")).toContainText("Lastschrift", { timeout: 20_000 });

    // Ankündigen: erst die Rückfrage mit Anzahl, Summe und Tag; Abbrechen schickt nichts
    const rueckfrage = page.getByRole("group", { name: "Rückfrage" });
    await page.getByRole("button", { name: "Ankündigen und Einzug anlegen" }).click();
    await expect(rueckfrage).toContainText(/\d+ Lastschrift(en)?, [\d.]+,\d\d\s€, Abbuchung am/);
    await expect(rueckfrage).toContainText(`${abbuchung} – wirklich ankündigen?`);
    await rueckfrage.getByRole("button", { name: "Abbrechen" }).click();
    await expect(rueckfrage).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/kasse\/einzug/);

    await page.getByRole("button", { name: "Ankündigen und Einzug anlegen" }).click();
    await rueckfrage.getByRole("button", { name: "Ja, ankündigen" }).click();
    await page.waitForURL(/\/admin\/kasse\/lastschriften\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const marke = page.locator(".lauf-titel .statusmarke");
    await expect(marke).toHaveText("Angekündigt");

    // Datei: Rückfrage, Abbrechen lässt den Einzug offen
    await page.getByRole("button", { name: "Bankdatei erzeugen" }).click();
    await expect(rueckfrage).toContainText(`Abbuchung am ${abbuchung} – Bankdatei jetzt erzeugen?`);
    await rueckfrage.getByRole("button", { name: "Abbrechen" }).click();
    await expect(marke).toHaveText("Angekündigt");
    await page.getByRole("button", { name: "Bankdatei erzeugen" }).click();
    await rueckfrage.getByRole("button", { name: "Ja, Bankdatei erzeugen" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("Die Datei ist erzeugt", { timeout: 20_000 });
    await expect(marke).toHaveText("Bankdatei erzeugt");

    // Eingereicht: ebenfalls erst nach Rückfrage
    await page.getByRole("button", { name: "Im Onlinebanking eingereicht" }).click();
    await expect(rueckfrage).toContainText(`Abbuchung am ${abbuchung} – wirklich als eingereicht vermerken?`);
    await rueckfrage.getByRole("button", { name: "Abbrechen" }).click();
    await expect(marke).toHaveText("Bankdatei erzeugt");
    await page.getByRole("button", { name: "Im Onlinebanking eingereicht" }).click();
    await rueckfrage.getByRole("button", { name: "Ja, eingereicht" }).click();
    await expect(marke).toHaveText("Eingereicht", { timeout: 20_000 });

    // Vor Ablauf der Rückbuchungsfrist ist Abschließen gesperrt und nennt den Tag
    const abschliessen = page.getByRole("button", { name: /^Abschließen ab \d\d\.\d\d\.\d{4}$/ });
    await expect(abschliessen).toBeDisabled();
    await expect(page.getByRole("button", { name: "Einzug abschließen" })).toHaveCount(0);

    // Rückläufer lassen sich erfassen; das gibt die Forderung auch wieder frei
    await page.getByRole("button", { name: `${ZAHLERIN}: Rücklastschrift erfassen` }).first().click();
    const blatt = page.locator("dialog.fenster");
    await blatt.getByLabel("Grund der Rückgabe").fill("ZZTest Konto nicht gedeckt");
    await blatt.getByRole("button", { name: "Als zurückgebucht vermerken" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("Zurückgebucht", { timeout: 20_000 });
  });

  test("die Lastschriftdatei ist keinem normalen Mitglied zugänglich", async ({ page }) => {
    // Der Route Handler läuft nicht durch app/admin/layout.tsx — er muss sich
    // selbst schützen. Vergisst man das, liegt eine Datei mit dreihundert
    // IBANs offen im Netz.
    await anmelden(page, NUTZER.mitglied);
    const antwort = await page.request.get(
      "/admin/kasse/lastschriften/00000000-0000-0000-0000-000000000000/datei",
    );
    expect(antwort.status()).toBe(403);
  });

  test("alte Adressen leiten auf die neuen um", async ({ page }) => {
    await anmelden(page, NUTZER.admin);

    for (const [alt, neu] of [
      ["/admin/serien", "/admin/plaetze"],
      ["/admin/einstellungen", "/admin/system"],
      ["/admin/einstellungen/merkmale", "/admin/system/merkmale"],
      ["/admin/mitglieder/merkmale", "/admin/system/merkmale"],
      ["/admin/mitglieder/arbeitsdienst", "/admin/arbeitsdienst"],
      ["/admin/beitraege", "/admin/kasse"],
    ]) {
      await page.goto(alt!);
      await expect(page).toHaveURL(new RegExp(`${neu}$`));
    }
  });
});

/**
 * Buchung umsetzen.
 *
 * Steht ein Platz unter Wasser, legt die Platzverwaltung die Buchung auf einen
 * freien Platz, statt sie zu stornieren. Bucher und Mitspieler erfahren es
 * über die Glocke; ist das Ziel inzwischen belegt, sagt das Blatt es, statt
 * still zu scheitern.
 */
test.describe("Buchung umsetzen", () => {
  /** Einen festen Termin buchen, mit einem festen Mitspieler. */
  async function bucheFesteZeit(page: Page, tag: string, platz: string, zeit: string, mitspieler: string) {
    const fenster = await oeffneFreieStunde(page, tag, platz, zeit);
    await mitspielerWaehlen(fenster, mitspieler);
    await fenster.getByRole("button", { name: /buchen/i }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gebucht", { timeout: 15_000 });
    return { platz, zeit };
  }

  const oeffne = oeffneBuchung;

  /** Was im Umsetzbereich gerade gewählt ist. */
  async function gewaehltesZiel(fenster: Locator) {
    const platz = (await fenster.locator("fieldset.umsetz-plaetze input:checked").getAttribute("aria-label")) ?? "";
    const minute = Number(await fenster.locator("fieldset.umsetz-zeiten input:checked").getAttribute("value"));
    const zeit = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    return { platz, zeit };
  }

  test("der Admin setzt eine fremde Buchung um, das Mitglied liest „verlegt“ in der Glocke", async ({
    page,
  }) => {
    const tag = tagIn(6);

    // Das Mitglied bucht.
    await anmelden(page, NUTZER.mitglied);
    const alt = await bucheFesteZeit(page, tag, "Platz 5", "12:00", MITSPIELER.mia);

    // Der Admin setzt sie um – ohne Grund geht es bei einer fremden Buchung nicht.
    await anmelden(page, NUTZER.admin);
    await page.goto(`/plan?tag=${tag}`);
    const fenster = await oeffne(page, alt.platz, alt.zeit);
    await fenster.getByRole("button", { name: "Umsetzen", exact: true }).click();

    const ziel = await gewaehltesZiel(fenster);
    // Vorgewählt ist ein anderer Platz zur selben Zeit.
    expect(ziel.platz).not.toBe(alt.platz);
    expect(ziel.zeit).toBe(alt.zeit);

    const knopf = fenster.getByRole("button", { name: "Hierhin umsetzen" });
    await expect(knopf).toBeDisabled();
    await fenster.getByLabel("Grund", { exact: true }).fill("ZZTest Platz unter Wasser");
    await knopf.click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("umgesetzt", { timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: `Buchung ${ziel.zeit} auf ${ziel.platz} verwalten` }),
    ).toBeVisible();

    // Das Mitglied liest es in der Glocke, mit Grund.
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan");
    await page.locator(".seitenkopf button.glocke").click();
    const nachricht = page.locator("dialog.fenster .nachrichtenliste li").first();
    await expect(nachricht).toContainText("verlegt", { timeout: 15_000 });
    await expect(nachricht).toContainText("ZZTest Platz unter Wasser");
    await page.keyboard.press("Escape");

    // Aufräumen: das Mitglied storniert die eigene Buchung am neuen Platz.
    await page.goto(`/plan?tag=${tag}`);
    await storniere(page, ziel.platz, ziel.zeit);
  });

  test("ist das Ziel inzwischen belegt, zeigt das Blatt den Fehler", async ({ page, context }) => {
    // Nicht Tag +7: eine Buchung am Vormittag liegt dort je nach Uhrzeit
    // hinter dem Vorlauf von 7 x 24 Stunden.
    const tag = tagIn(5);
    const zielTag = tagIn(6);

    await anmelden(page, NUTZER.admin);
    const alt = await bucheFesteZeit(page, tag, "Platz 6", "12:00", MITSPIELER.mia);

    // Umsetzen auf einen anderen Tag: dessen Belegung lädt das Blatt nach.
    const fenster = await oeffne(page, alt.platz, alt.zeit);
    await fenster.getByRole("button", { name: "Umsetzen", exact: true }).click();
    await fenster.getByLabel("Tag", { exact: true }).fill(zielTag);
    await expect(fenster.locator("fieldset.umsetz-zeiten input:checked")).toHaveCount(1, { timeout: 15_000 });
    const ziel = await gewaehltesZiel(fenster);

    // Währenddessen bucht jemand genau dieses Ziel – hier der Admin im zweiten Tab.
    const zweiter = await context.newPage();
    await zweiter.goto(`/plan?tag=${zielTag}`);
    await zweiter.getByRole("button", { name: `${ziel.platz} um ${ziel.zeit} buchen` }).click();
    const buchen = zweiter.locator("dialog.fenster");
    await mitspielerWaehlen(buchen, MITSPIELER.max);
    await buchen.getByRole("button", { name: /buchen/i }).click();
    await expect(zweiter.locator(".hinweis.erfolg")).toContainText("gebucht", { timeout: 15_000 });

    // Das Blatt im ersten Tab weiß davon nichts – die Datenbank schon.
    await fenster.getByRole("button", { name: "Hierhin umsetzen" }).click();
    await expect(fenster.locator(".hinweis.fehler")).toContainText("bereits belegt", { timeout: 15_000 });

    // Aufräumen: beide Buchungen wieder weg.
    await storniere(zweiter, ziel.platz, ziel.zeit);
    await zweiter.close();

    await page.goto(`/plan?tag=${tag}`);
    await storniere(page, alt.platz, alt.zeit);
  });
});
