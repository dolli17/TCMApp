import { expect, test, type Locator, type Page } from "@playwright/test";
import { anmelden, MITGLIED_ID, NUTZER, PASSWORT, testName, ZAHLERIN } from "./hilfen";
import { istLokalerStack, sqlLokal } from "./lokale-db";
import {
  alsKonto, blatt, diesesJahr, forderungAnlegen, forderungOeffnen, mitgliedAnlegen, mitgliedBeenden, zeileIn,
} from "./verwaltung-hilfen";

/**
 * Die Geld-Abläufe der Verwaltung, die bisher kein Test auslöste:
 * Beitragsarten pflegen, Jahresbeiträge erzeugen, Forderung abhaken,
 * Arbeitsdienst eintragen und abrechnen, Einzug bis zum Abschluss,
 * Getränkemonat schließen und abrechnen.
 *
 * Alles hier wirkt sonst auf den ganzen Verein (ein Beitragslauf stellt jedem
 * Mitglied eine Forderung). Deshalb arbeitet jeder Test in einem Ausschnitt,
 * in dem nur seine eigenen Datensätze stehen:
 *
 *   Jahresbeiträge   ein eigenes Mitglied, zugeordnet für ein Jahr weit voraus
 *   Arbeitsdienst    eine eigene Beitragsart, ein eigenes Mitglied, das Vorjahr
 *   Einzug           eine eigene Forderung der Art „Sonstiges“ für Kira Kasse
 *   Getränkemonat    ein eigener, vergangener Monat mit einer Entnahme
 */

/** Die eine Beitragsart der Tests. Löschen kann die Oberfläche keine, also bleibt es bei dieser. */
const ART = { code: "zztest_e2e", name: "ZZTest Beitragsart" };

/** Vier Jahre voraus: dort hat außer dem Testmitglied niemand eine Beitragsart. */
const BEITRAGSJAHR = diesesJahr() + 4;

function erfolg(page: Page): Locator {
  return page.locator(".hinweis.erfolg");
}

/** Die Zeile der Test-Beitragsart unter Kasse › Beitragsarten. */
function artZeile(page: Page): Locator {
  return zeileIn(page, "Beitragsarten", ART.code);
}

/** Das Blatt der Test-Beitragsart öffnen. */
async function artOeffnen(page: Page): Promise<Locator> {
  await artZeile(page).locator("button.listenzeile").click();
  const fenster = blatt(page);
  await expect(fenster).toBeVisible();
  return fenster;
}

/**
 * Die Test-Beitragsart sicherstellen: anlegen, falls es sie noch nicht gibt,
 * und wieder anbieten, falls ein früherer Lauf sie stillgelegt hat.
 * Gibt zurück, ob sie neu angelegt wurde.
 */
async function beitragsartBereitstellen(page: Page): Promise<boolean> {
  await page.goto("/admin/kasse?abschnitt=arten");
  await expect(page.getByRole("heading", { name: "Arten und Preise" })).toBeVisible();

  let neu = false;
  if ((await artZeile(page).count()) === 0) {
    neu = true;
    await page.getByRole("button", { name: "Neue Beitragsart" }).click();
    const fenster = blatt(page);
    // Ohne Code und Namen bleibt der Knopf gesperrt und sagt, warum.
    await expect(fenster.getByRole("button", { name: "Beitragsart anlegen" })).toBeDisabled();
    await fenster.getByLabel("Code").fill(ART.code);
    await fenster.getByLabel("Name").fill(ART.name);
    await fenster.getByRole("button", { name: "Beitragsart anlegen" }).click();
    await expect(erfolg(page)).toHaveText("Beitragsart angelegt.", { timeout: 20_000 });
  }
  await expect(artZeile(page)).toHaveCount(1);

  if ((await artZeile(page).locator(".statusmarke", { hasText: "still" }).count()) > 0) {
    const fenster = await artOeffnen(page);
    await fenster.getByRole("button", { name: "Wieder anbieten" }).click();
    await expect(erfolg(page)).toHaveText("Beitragsart ist wieder verfügbar.", { timeout: 20_000 });
  }
  return neu;
}

/** Einem Mitglied für ein Jahr eine Beitragsart zuordnen (Mitglied › Beiträge). */
async function beitragZuordnen(page: Page, adresse: string, jahr: number, art: RegExp) {
  await page.goto(`${adresse}?teil=beitraege&jahr=${jahr}`);
  const karte = page.locator('section[aria-label="Beitragsarten"]');
  await expect(karte.getByRole("heading", { name: `Beiträge ${jahr}` })).toBeVisible();
  await karte.getByRole("button", { name: "Beitragsart zuordnen" }).click();
  const auswahl = karte.getByLabel("Beitragsart");
  const wert = await auswahl.locator("option", { hasText: art }).first().getAttribute("value");
  await auswahl.selectOption(wert!);
  await karte.getByRole("button", { name: "Zuordnen" }).click();
  await expect(karte.locator(".hinweis.erfolg")).toContainText("zugeordnet", { timeout: 20_000 });
}

/** Eine Gläubiger-IBAN, falls keine gesetzt ist: ohne sie entsteht keine Bankdatei. */
async function setzeGlaeubigerIban() {
  const supabase = await alsKonto(NUTZER.admin);
  const { data } = await supabase.from("settings").select("value").eq("key", "sepa.creditor_iban").maybeSingle();
  if (!data?.value) {
    const { error } = await supabase.rpc("set_setting", {
      p_key: "sepa.creditor_iban",
      p_value: "DE89370400440532013000",
    });
    expect(error).toBeNull();
  }
}

/**
 * Einen Einzug nur aus „Sonstiges“ anlegen und auf seiner Seite landen.
 * Die anderen Tests ziehen Pfand ein; so kommen sie sich nicht in die Quere.
 */
async function einzugAusSonstigem(page: Page): Promise<string> {
  await page.goto("/admin/kasse/einzug");
  await expect(page.getByRole("heading", { name: "Einzug vorbereiten" })).toBeVisible();
  for (const box of await page.getByRole("checkbox").all()) {
    if (await box.isChecked()) await box.uncheck();
  }
  await page.getByRole("checkbox", { name: /Sonstiges/ }).first().check();
  const wer = page.locator("section", { has: page.getByRole("heading", { name: "Wer ist dabei?" }) });
  await expect(wer.locator(".kachel.gruen")).toContainText("Lastschrift", { timeout: 20_000 });

  await page.getByRole("button", { name: "Ankündigen und Einzug anlegen" }).click();
  await page.getByRole("group", { name: "Rückfrage" }).getByRole("button", { name: "Ja, ankündigen" }).click();
  await page.waitForURL(/\/admin\/kasse\/lastschriften\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await expect(page.locator(".lauf-titel .statusmarke")).toHaveText("Angekündigt");
  return page.url().split("/").pop()!;
}

test.describe("Kasse: Beitragsarten und Jahresbeiträge", () => {
  test.skip(!NUTZER.admin || !PASSWORT, "Testkonten fehlen in .env.local");

  test("Beitragsart anlegen, ändern, Preis setzen, stilllegen und wieder anbieten", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await beitragsartBereitstellen(page);
    const jahr = diesesJahr();
    const stempel = `ZZTest Lauf ${Date.now().toString().slice(-8)}`;

    // Ändern: der Code steht fest, Name und Beschreibung lassen sich pflegen.
    let fenster = await artOeffnen(page);
    await expect(fenster.getByLabel("Code")).toBeDisabled();
    await expect(fenster.getByLabel("Code")).toHaveValue(ART.code);
    await fenster.getByLabel("Beschreibung").fill(stempel);
    await fenster.getByRole("button", { name: "Änderungen speichern" }).click();
    await expect(erfolg(page)).toHaveText("Beitragsart gespeichert.", { timeout: 20_000 });
    await page.reload();
    fenster = await artOeffnen(page);
    await expect(fenster.getByLabel("Beschreibung")).toHaveValue(stempel);

    // Preis: Unsinn lehnt schon das Blatt ab, ein Betrag fürs Folgejahr steht danach in der Zeile.
    await expect(fenster.getByLabel("Gilt ab Jahr")).toHaveValue(String(jahr + 1));
    await fenster.getByLabel("Jahresbeitrag").fill("viel");
    await fenster.getByRole("button", { name: "Preis setzen" }).click();
    await expect(page.locator(".hinweis.fehler")).toContainText("kein gültiger Betrag");
    const cent = Date.now() % 90 + 10;
    await fenster.getByLabel("Jahresbeitrag").fill(`123,${cent}`);
    await fenster.getByRole("button", { name: "Preis setzen" }).click();
    await expect(erfolg(page)).toHaveText(`Preis ab ${jahr + 1} gesetzt.`, { timeout: 20_000 });
    await expect(artZeile(page)).toContainText(new RegExp(`123,${cent}\\s€ ab ${jahr + 1}`));

    // Stilllegen und wieder anbieten: die Marke in der Zeile zeigt den Stand.
    fenster = await artOeffnen(page);
    await fenster.getByRole("button", { name: "Stilllegen" }).click();
    await expect(erfolg(page)).toContainText("Beitragsart stillgelegt.", { timeout: 20_000 });
    await expect(artZeile(page).locator(".statusmarke")).toHaveText("still");

    fenster = await artOeffnen(page);
    await fenster.getByRole("button", { name: "Wieder anbieten" }).click();
    await expect(erfolg(page)).toHaveText("Beitragsart ist wieder verfügbar.", { timeout: 20_000 });
    await expect(artZeile(page).locator(".statusmarke")).toHaveCount(0);
  });

  test("Jahresbeiträge: Forderungen erzeugen, ein zweites Mal nicht, als bezahlt vermerken", async ({ page }) => {
    test.setTimeout(120_000);
    const nachname = testName("Jahresbeitrag");
    await anmelden(page, NUTZER.admin);
    const adresse = await mitgliedAnlegen(page, nachname);
    await beitragZuordnen(page, adresse, BEITRAGSJAHR, /Erwachsener/);

    // Die Vorschau nennt das Mitglied, der Knopf fragt mit Anzahl und Summe nach.
    await page.goto(`/admin/kasse?abschnitt=beitraege&jahr=${BEITRAGSJAHR}`);
    await expect(page.getByRole("heading", { name: `Jahresbeiträge ${BEITRAGSJAHR}` })).toBeVisible();
    await expect(page.getByText(nachname).first()).toBeVisible();
    const karte = page.locator("section.karte", { hasText: "Forderungen erzeugen" });
    const bestaetigen = karte.getByRole("button", { name: /^\d+ Forderung(en)? über [\d.]+,\d\d\s€ erzeugen$/ });

    await karte.getByRole("button", { name: "Forderungen erzeugen" }).click();
    await expect(bestaetigen).toBeVisible();
    await karte.getByRole("button", { name: "Doch nicht" }).click();
    await expect(bestaetigen).toHaveCount(0);

    await karte.getByRole("button", { name: "Forderungen erzeugen" }).click();
    await bestaetigen.click();
    await expect(karte.locator(".hinweis.erfolg")).toContainText(/^\d+ Forderung(en)? erzeugt/, { timeout: 20_000 });

    // Ein zweiter Lauf fände nichts mehr: die Karte bietet ihn gar nicht erst an.
    await page.reload();
    await expect(karte).toContainText(`Für ${BEITRAGSJAHR} ist alles berechnet`);
    await expect(karte.getByRole("button", { name: "Forderungen erzeugen" })).toHaveCount(0);

    // Die Forderung steht offen in der Kasse, mit dem Jahr als Zeitraum.
    let fenster = await forderungOeffnen(page, { art: "fee", stand: "open" }, nachname);
    await expect(fenster.locator("dl.angaben")).toContainText(String(BEITRAGSJAHR));
    await expect(fenster.locator("dl.angaben")).toContainText("offen");

    // Überwiesen statt eingezogen: von Hand als bezahlt vermerken.
    await fenster.getByRole("button", { name: /Als bezahlt vermerken/ }).click();
    await expect(erfolg(page)).toHaveText("Die Forderung ist als bezahlt vermerkt.", { timeout: 20_000 });
    await expect(zeileIn(page, "Forderungen", nachname)).toHaveCount(0);

    await page.goto("/admin/kasse?abschnitt=forderungen&art=fee&stand=settled");
    const bezahlt = zeileIn(page, "Forderungen", nachname);
    await expect(bezahlt.locator(".statusmarke")).toHaveText("bezahlt");
    // Bezahltes lässt sich nicht mehr öffnen - kein zweites Abhaken, kein Erlassen.
    await expect(bezahlt.getByRole("button")).toHaveCount(0);

    fenster = blatt(page);
    await expect(fenster).toHaveCount(0);
    await mitgliedBeenden(page, adresse, nachname);
  });
});

test.describe("Arbeitsdienst", () => {
  test.skip(!NUTZER.admin || !PASSWORT, "Testkonten fehlen in .env.local");

  /** Die Zeile der Test-Beitragsart in „Soll-Stunden je Beitragsart“. */
  function sollZeile(page: Page, jahr: number): Locator {
    return zeileIn(page, `Soll-Stunden ${jahr}`, ART.name);
  }

  async function sollSetzen(page: Page, jahr: number, stunden: string) {
    await sollZeile(page, jahr).locator("button.listenzeile").click();
    const fenster = blatt(page);
    await fenster.getByLabel(`Soll-Stunden für ${ART.name}`).fill(stunden);
    await fenster.getByRole("button", { name: "Setzen" }).click();
  }

  test("Soll-Stunden setzen, Einsatz eintragen, Vorjahr abrechnen", async ({ page }) => {
    test.setTimeout(150_000);
    const nachname = testName("Dienst");
    const jahr = diesesJahr();
    const vorjahr = jahr - 1;

    await anmelden(page, NUTZER.admin);
    await beitragsartBereitstellen(page);

    // Laufendes Jahr: Soll setzen und wieder auf 0 - die Zeile zeigt beides.
    await page.goto("/admin/arbeitsdienst");
    await sollSetzen(page, jahr, "5");
    await expect(erfolg(page)).toHaveText("Soll auf 5 Stunden gesetzt.", { timeout: 20_000 });
    await expect(sollZeile(page, jahr).locator(".hinweis-rechts")).toHaveText("5 h", { timeout: 20_000 });
    await sollSetzen(page, jahr, "0");
    await expect(erfolg(page)).toHaveText("Diese Beitragsart leistet keinen Arbeitsdienst mehr.", { timeout: 20_000 });
    await expect(sollZeile(page, jahr).locator(".hinweis-rechts")).not.toHaveText("5 h", { timeout: 20_000 });

    // Vorjahr: dort hat nur die Test-Beitragsart ein Soll. Nach der ersten
    // Abrechnung eines Jahres sperrt die Datenbank dessen Regeln; ein späterer
    // Lauf findet die 6 Stunden dann schon vor.
    await page.getByRole("navigation", { name: "Jahr" }).getByRole("link", { name: `‹ ${vorjahr}` }).click();
    await expect(page).toHaveURL(new RegExp(`jahr=${vorjahr}`));
    if ((await sollZeile(page, vorjahr).locator(".hinweis-rechts").textContent())?.trim() !== "6 h") {
      await sollSetzen(page, vorjahr, "6");
      await expect(erfolg(page)).toHaveText("Soll auf 6 Stunden gesetzt.", { timeout: 20_000 });
    }
    await expect(sollZeile(page, vorjahr).locator(".hinweis-rechts")).toHaveText("6 h", { timeout: 20_000 });

    // Ein Mitglied mit dieser Beitragsart im Vorjahr schuldet die 6 Stunden.
    const adresse = await mitgliedAnlegen(page, nachname);
    await beitragZuordnen(page, adresse, vorjahr, new RegExp(ART.name));

    await page.goto(`/admin/arbeitsdienst?jahr=${vorjahr}&q=${nachname}`);
    const zeile = zeileIn(page, `Arbeitsdienst ${vorjahr}`, nachname);
    await expect(zeile).toContainText("0 von 6 h");
    await expect(zeile.locator(".betrag")).toHaveText("6 h");

    // Einsatz eintragen: das Jahr ergibt sich aus dem Tag, also ein Tag im Vorjahr.
    await zeile.getByRole("button", { name: /Einsatz eintragen$/ }).click();
    let fenster = blatt(page);
    await fenster.getByLabel("Stunden").fill("2");
    await fenster.getByLabel("Am").fill(`${vorjahr}-06-14`);
    await fenster.getByLabel("Was wurde gemacht").fill("ZZTest Platzaufbau");
    await fenster.getByRole("button", { name: "Eintragen" }).click();
    await expect(erfolg(page)).toHaveText("2 Stunden eingetragen.", { timeout: 20_000 });
    await expect(zeile).toContainText("2 von 6 h · 1 Einsatz");
    await expect(zeile.locator(".betrag")).toHaveText("4 h");

    // Jahresausgleich: erst die Rückfrage, dann wird aus den vier Stunden eine Forderung.
    await page.goto(`/admin/arbeitsdienst?jahr=${vorjahr}`);
    const ausgleich = page.locator("section.karte", { hasText: `Jahresausgleich ${vorjahr}` });
    const bestaetigen = ausgleich.getByRole("button", { name: /^\d+ Forderung(en)? über [\d.]+,\d\d\s€ erzeugen$/ });
    await ausgleich.getByRole("button", { name: "Jahr abrechnen" }).click();
    await expect(bestaetigen).toBeVisible();
    await ausgleich.getByRole("button", { name: "Doch nicht" }).click();
    await expect(bestaetigen).toHaveCount(0);
    await ausgleich.getByRole("button", { name: "Jahr abrechnen" }).click();
    await bestaetigen.click();
    await expect(erfolg(page)).toContainText(/^\d+ Mitglied(er)? abgerechnet, \d+ Forderung(en)? entstanden\.$/, {
      timeout: 20_000,
    });
    await expect(ausgleich).toContainText(`Für ${vorjahr} ist bereits alles abgerechnet.`);

    // Abgerechnet heißt eingefroren: die Zeile nimmt keinen Einsatz mehr an.
    await page.goto(`/admin/arbeitsdienst?jahr=${vorjahr}&q=${nachname}`);
    await expect(zeile.locator(".statusmarke")).toHaveText("abgerechnet");
    await expect(zeile.getByRole("button")).toHaveCount(0);

    // Die Forderung steht in der Kasse und nennt die fehlenden Stunden.
    fenster = await forderungOeffnen(page, { art: "work_duty", stand: "open" }, nachname);
    await expect(fenster).toContainText(`Arbeitsdienst ${vorjahr}: 4 von 6 Stunden nicht geleistet`);

    // Aufräumen: Forderung erlassen, Mitglied archivieren und anonymisieren.
    await fenster.getByRole("button", { name: "Erlassen" }).click();
    await fenster.getByLabel("Grund").fill("ZZTest Aufräumen");
    await fenster.getByRole("button", { name: "Wirklich erlassen" }).click();
    await expect(erfolg(page)).toContainText("erlassen", { timeout: 20_000 });
    await mitgliedBeenden(page, adresse, nachname);
  });
});

test.describe("Einzug: herausnehmen, löschen, abschließen", () => {
  test.skip(!NUTZER.admin || !PASSWORT, "Testkonten fehlen in .env.local");

  test("ein Mitglied aus dem Einzug nehmen, den leeren Einzug löschen", async ({ page }) => {
    const beschreibung = `ZZTest Sonstiges Entfernen ${Date.now().toString().slice(-6)}`;
    await anmelden(page, NUTZER.admin);
    await forderungAnlegen(page, { mitglied: ZAHLERIN, art: "misc", betrag: "11,30", beschreibung });
    const id = await einzugAusSonstigem(page);

    // Bis zur Bankdatei lässt sich ein Mitglied herausnehmen; seine Forderung ist dann wieder offen.
    await page.getByRole("button", { name: `${ZAHLERIN}: aus dem Einzug nehmen` }).click();
    await blatt(page).getByRole("button", { name: "Aus dem Einzug nehmen" }).click();
    await expect(erfolg(page)).toHaveText(
      "Das Mitglied ist aus dem Einzug genommen. Seine Forderungen sind wieder offen.",
      { timeout: 20_000 },
    );
    await expect(page.locator(".lauf-titel .statusmarke")).toHaveText("Leer");
    await expect(page.getByText("In diesem Einzug steht keine Lastschrift.")).toBeVisible();

    // Ein leerer Einzug lässt sich löschen; seine Seite gibt es danach nicht mehr.
    await page.getByRole("button", { name: "Leeren Einzug löschen" }).click();
    await page.waitForURL(/abschnitt=lastschriften/, { timeout: 20_000 });
    await expect(page.locator(`a[href$="/admin/kasse/lastschriften/${id}"]`)).toHaveCount(0);

    // Die Forderung ist wieder da und nicht mehr angekündigt. Aufräumen: erlassen.
    const fenster = await forderungOeffnen(page, { art: "misc", stand: "open" }, beschreibung);
    await fenster.getByRole("button", { name: "Erlassen" }).click();
    await fenster.getByLabel("Grund").fill("ZZTest Aufräumen");
    await fenster.getByRole("button", { name: "Wirklich erlassen" }).click();
    await expect(erfolg(page)).toContainText("erlassen", { timeout: 20_000 });
  });

  test("nach der Rückbuchungsfrist abschließen: die Forderung gilt als bezahlt", async ({ page }) => {
    test.skip(!istLokalerStack(), "dreht den Abbuchungstag per psql zurück, nur gegen den lokalen Stack");
    test.setTimeout(120_000);
    const beschreibung = `ZZTest Sonstiges Abschluss ${Date.now().toString().slice(-6)}`;
    await setzeGlaeubigerIban();
    await anmelden(page, NUTZER.admin);
    await forderungAnlegen(page, { mitglied: ZAHLERIN, art: "misc", betrag: "9,40", beschreibung });
    const id = await einzugAusSonstigem(page);

    const marke = page.locator(".lauf-titel .statusmarke");
    const rueckfrage = page.getByRole("group", { name: "Rückfrage" });
    await page.getByRole("button", { name: "Bankdatei erzeugen" }).click();
    await rueckfrage.getByRole("button", { name: "Ja, Bankdatei erzeugen" }).click();
    await expect(marke).toHaveText("Bankdatei erzeugt", { timeout: 20_000 });
    await page.getByRole("button", { name: "Im Onlinebanking eingereicht" }).click();
    await rueckfrage.getByRole("button", { name: "Ja, eingereicht" }).click();
    await expect(marke).toHaveText("Eingereicht", { timeout: 20_000 });

    // Vor Ablauf der acht Wochen ist der Knopf gesperrt und nennt den Tag.
    await expect(page.getByRole("button", { name: /^Abschließen ab \d\d\.\d\d\.\d{4}$/ })).toBeDisabled();

    // Die Zeit lässt sich nicht vorspulen, der Abbuchungstag schon: zehn Wochen
    // zurück. Ein Trigger verbietet das Vorziehen, sobald Posten am Einzug
    // hängen (zu Recht: die Ankündigung nennt den Tag). Für diese eine Zeile
    // ist er ausgesetzt - anders kommt kein Test hinter die Rückbuchungsfrist.
    sqlLokal(
      `begin;
       set local session_replication_role = replica;
       update public.debit_batches set collection_date = (now() at time zone 'Europe/Berlin')::date - 70
        where id = '${id}';
       commit;`,
      "Der Abbuchungstag ließ sich nicht zurückdrehen",
    );
    await page.reload();
    await page.getByRole("button", { name: "Einzug abschließen" }).click();
    await expect(erfolg(page)).toHaveText("Einzug abgeschlossen: 1 eingezogen.", { timeout: 20_000 });
    await expect(marke).toHaveText("Abgeschlossen");
    await expect(page.getByText("Abgeschlossen. Die Bankdatei bleibt als Beleg am Einzug")).toBeVisible();
    await expect(zeileIn(page, "Je Mitglied", ZAHLERIN).locator(".statusmarke")).toHaveText("eingezogen");

    // Die Forderung ist damit bezahlt.
    await page.goto("/admin/kasse?abschnitt=forderungen&art=misc&stand=settled");
    await expect(zeileIn(page, "Forderungen", beschreibung).locator(".statusmarke")).toHaveText("bezahlt");
  });
});

test.describe("Getränkemonat", () => {
  test.skip(!NUTZER.admin || !PASSWORT, "Testkonten fehlen in .env.local");
  test.skip(!istLokalerStack(), "legt einen vergangenen Monat per psql an, nur gegen den lokalen Stack");

  /**
   * Der Monat der Tests: sechs Monate zurück. Der Seed bucht nur die letzten
   * 40 Tage, dort steht also sonst nichts. Schließen und Abrechnen gehen je
   * Monat genau einmal - deshalb räumt der Test seinen Monat vorher und
   * nachher per psql weg, sonst liefe er nur ein einziges Mal.
   */
  function testmonat(): { jahr: number; monat: number; label: string; titel: string } {
    const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
    const d = new Date(Date.UTC(Number(heute.slice(0, 4)), Number(heute.slice(5, 7)) - 1 - 6, 15));
    const jahr = d.getUTCFullYear();
    const monat = d.getUTCMonth() + 1;
    return {
      jahr,
      monat,
      label: `${jahr}-${String(monat).padStart(2, "0")}`,
      titel: new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(d),
    };
  }

  function wegraeumen(m: { jahr: number; monat: number; label: string }) {
    sqlLokal(
      `begin;
       delete from public.charges where kind = 'drinks' and period_label = '${m.label}';
       update public.billing_periods set status = 'open', closed_at = null, charged_at = null, closed_by = null
        where year = ${m.jahr} and month = ${m.monat};
       delete from public.drink_purchases p using public.billing_periods b
        where b.id = p.billing_period_id and b.year = ${m.jahr} and b.month = ${m.monat};
       delete from public.billing_periods where year = ${m.jahr} and month = ${m.monat};
       commit;`,
      "Der Testmonat ließ sich nicht wegräumen",
    );
  }

  test("Monat schließen, abrechnen, die Forderung steht in der Kasse", async ({ page }) => {
    const m = testmonat();
    wegraeumen(m);
    // Zwei Entnahmen von Kira Kasse mitten im Testmonat, zum heutigen Preis.
    sqlLokal(
      `with zeitraum as (
         insert into public.billing_periods (year, month) values (${m.jahr}, ${m.monat}) returning id
       )
       insert into public.drink_purchases
         (member_id, drink_item_id, quantity, unit_price_cents, source, billing_period_id, created_at)
       select '${MITGLIED_ID.kira}', i.id, 2, 150, 'kiosk', z.id, make_timestamptz(${m.jahr}, ${m.monat}, 15, 18, 0, 0, 'Europe/Berlin')
         from zeitraum z, (select id from public.drink_items order by sort_order, name limit 1) i;`,
      "Der Testmonat ließ sich nicht anlegen",
    );

    try {
      await anmelden(page, NUTZER.admin);
      await page.goto("/admin/kasse?abschnitt=getraenkemonate");
      const zeile = zeileIn(page, "Getränkemonate", m.titel);
      await expect(zeile).toContainText("1 Entnahmen · 1 Mitglieder");
      await expect(zeile).toContainText(/3,00\s€/);

      // Schritt 1: schließen friert die Summe ein.
      await zeile.getByRole("button", { name: /Monat schließen$/ }).click();
      let fenster = blatt(page);
      await expect(fenster).toContainText("Schließen friert die Summe ein");
      await fenster.getByRole("button", { name: "Monat schließen" }).click();
      await expect(erfolg(page)).toHaveText(
        "Monat geschlossen. 1 Entnahmen von 1 Mitgliedern stehen jetzt fest.",
        { timeout: 20_000 },
      );

      // Schritt 2: erst jetzt bietet die Zeile das Abrechnen an.
      await zeile.getByRole("button", { name: /Forderungen erzeugen$/ }).click();
      fenster = blatt(page);
      await expect(fenster).toContainText("geschlossen");
      await fenster.getByRole("button", { name: "Forderungen erzeugen" }).click();
      await expect(erfolg(page)).toHaveText("1 Forderung erzeugt.", { timeout: 20_000 });
      await expect(zeile).toContainText("1 Forderungen");

      // Die Forderung nennt Monat und Entnahmen; als Nächstes steht der Einzug an.
      await zeile.getByRole("button", { name: /Einzug vorbereiten$/ }).click();
      await expect(blatt(page).getByRole("link", { name: "Einzug vorbereiten" })).toHaveAttribute(
        "href",
        new RegExp(`/admin/kasse/einzug\\?gruppe=drinks.*${m.label}`),
      );
      fenster = await forderungOeffnen(page, { art: "drinks", stand: "open" }, `${m.label} (1 Entnahmen)`);
      await expect(fenster).toContainText(ZAHLERIN);
      await expect(fenster.locator("dl.angaben")).toContainText(/3,00\s€/);
    } finally {
      wegraeumen(m);
    }
  });
});
