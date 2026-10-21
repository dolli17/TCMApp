import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { anmelden, NUTZER, PASSWORT, ZAHLERIN } from "./hilfen";

/**
 * Die SEPA-Datei Ende zu Ende (T5).
 *
 * Bisher endete der Einzug in den E2E beim Hinweis „Die Datei ist erzeugt“.
 * Ob in der Datei steht, was die Bank einziehen soll, prüften nur die
 * Unit-Tests von pain008.ts gegen selbst gebaute Eingaben. Hier geht es den
 * ganzen Weg: Forderung anlegen, Einzug ankündigen, Datei erzeugen, über den
 * Knopf herunterladen und die XML gegen drei unabhängige Quellen halten - die
 * Rückfrage in der Oberfläche, die Posten in der Datenbank und die festen
 * Testdaten von Kira Kasse aus supabase/seed.sql.
 *
 * Im Einzug können neben Kira weitere offene Pfand-Forderungen landen (andere
 * Tests lassen welche liegen). Deshalb vergleicht der Test Anzahl und Summe
 * mit Oberfläche und Datenbank, nicht mit festen Zahlen; Kiras eigene Zeile
 * prüft er wörtlich.
 */

/** Aus supabase/seed.sql: Kiras Bankverbindung und Mandat. */
const KIRA = {
  iban: "DE02120300000000202051",
  mandat: "TCM-E2E-KASSE",
  sequenz: "RCUR",
};

/** Die Kasse als Admin, für Einstellungen und den Blick auf die Posten. */
async function alsAdmin() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { auth: { persistSession: false } },
  );
  const { error } = await supabase.auth.signInWithPassword({ email: NUTZER.admin, password: PASSWORT });
  expect(error).toBeNull();
  return supabase;
}

/** Prüfsumme nach ISO 13616: (Rest der umgestellten Ziffernfolge) mod 97 = 1. */
function ibanGueltig(iban: string): boolean {
  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  const ziffern = umgestellt.replace(/[A-Z]/g, (b) => String(b.charCodeAt(0) - 55));
  let rest = 0;
  for (const z of ziffern) rest = (rest * 10 + Number(z)) % 97;
  return rest === 1;
}

/** "1.234,50 €" -> 123450 */
function euroZuCent(text: string): number {
  return Math.round(Number(text.replace(/[^\d,]/g, "").replace(",", ".")) * 100);
}

/** "123.45" -> 12345 */
function betragZuCent(text: string): number {
  return Math.round(Number(text) * 100);
}

interface Transaktion {
  endToEnd: string;
  betrag: string;
  waehrung: string;
  mandat: string;
  unterschrieben: string;
  name: string;
  iban: string;
  verwendung: string;
  sequenz: string;
}

interface Datei {
  fehler: string | null;
  namensraum: string;
  kopf: { anzahl: string; summe: string };
  bloecke: {
    anzahl: string;
    summe: string;
    faellig: string;
    sequenz: string;
    glaeubigerIban: string;
    glaeubigerId: string;
  }[];
  transaktionen: Transaktion[];
}

/** Die XML im Browser lesen: DOMParser gibt es dort, in Node nicht. */
async function lies(page: Page, xml: string): Promise<Datei> {
  return page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const fehler = doc.getElementsByTagName("parsererror")[0]?.textContent ?? null;
    const alle = (wo: Element | Document, name: string) => [...wo.getElementsByTagNameNS("*", name)];
    const eins = (wo: Element | Document, name: string) => alle(wo, name)[0]?.textContent?.trim() ?? "";
    const kopf = alle(doc, "GrpHdr")[0]!;
    return {
      fehler,
      namensraum: doc.documentElement.namespaceURI ?? "",
      kopf: { anzahl: eins(kopf, "NbOfTxs"), summe: eins(kopf, "CtrlSum") },
      bloecke: alle(doc, "PmtInf").map((b) => ({
        anzahl: eins(b, "NbOfTxs"),
        summe: eins(b, "CtrlSum"),
        faellig: eins(b, "ReqdColltnDt"),
        sequenz: eins(b, "SeqTp"),
        glaeubigerIban: eins(alle(b, "CdtrAcct")[0]!, "IBAN"),
        // Das innerste Id: das äußere umfasst auch SchmeNm ("SEPA").
        glaeubigerId: eins(alle(alle(b, "CdtrSchmeId")[0]!, "Othr")[0]!, "Id"),
      })),
      transaktionen: alle(doc, "PmtInf").flatMap((b) =>
        alle(b, "DrctDbtTxInf").map((t) => ({
          endToEnd: eins(t, "EndToEndId"),
          betrag: eins(t, "InstdAmt"),
          waehrung: alle(t, "InstdAmt")[0]?.getAttribute("Ccy") ?? "",
          mandat: eins(t, "MndtId"),
          unterschrieben: eins(t, "DtOfSgntr"),
          name: eins(alle(t, "Dbtr")[0]!, "Nm"),
          iban: eins(alle(t, "DbtrAcct")[0]!, "IBAN"),
          verwendung: eins(t, "Ustrd"),
          sequenz: eins(b, "SeqTp"),
        })),
      ),
    };
  }, xml);
}

test.describe("SEPA-Datei", () => {
  test("Einzug anlegen, Datei herunterladen: Summe, Anzahl, IBANs, Mandate und Fälligkeit stimmen (T5)", async ({
    page,
    playwright,
  }) => {
    const supabase = await alsAdmin();

    // Ohne Gläubiger-IBAN entsteht keine Datei, und der Seed setzt keine.
    const einstellung = async (key: string) =>
      (await supabase.from("settings").select("value").eq("key", key).maybeSingle()).data?.value as
        | string
        | null
        | undefined;
    if (!(await einstellung("sepa.creditor_iban"))) {
      const { error } = await supabase.rpc("set_setting", {
        p_key: "sepa.creditor_iban",
        p_value: "DE89370400440532013000",
      });
      expect(error).toBeNull();
    }
    const glaeubigerIban = String(await einstellung("sepa.creditor_iban")).replace(/\s/g, "");
    const glaeubigerId = String(await einstellung("sepa.creditor_id"));

    // Eine eigene Forderung mit einem Betrag, den sonst niemand hat.
    const beschreibung = `ZZTest SEPA-Datei ${Date.now().toString().slice(-6)}`;
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/kasse?abschnitt=abrechnen");
    await page.getByRole("button", { name: "Forderung anlegen" }).first().click();
    const fenster = page.locator("dialog.fenster");
    await fenster.getByLabel("Mitglied").fill(ZAHLERIN);
    await fenster.getByLabel("Art").selectOption("deposit");
    await fenster.getByLabel("Betrag in Euro").fill("23,45");
    await fenster.getByLabel("Beschreibung").fill(beschreibung);
    await fenster.getByRole("button", { name: "Forderung anlegen" }).click();
    await expect(fenster.locator(".hinweis.erfolg")).toBeVisible({ timeout: 20_000 });

    // Einzug: Pfand wählen, Tag merken, Rückfrage mit Anzahl und Summe lesen
    await page.goto("/admin/kasse/einzug");
    await page.getByRole("checkbox", { name: /Pfand/ }).first().check();
    const tag = await page.getByLabel("Abbuchungstag").inputValue();
    const wer = page.locator("section", { has: page.getByRole("heading", { name: "Wer ist dabei?" }) });
    await expect(wer.locator(".kachel.gruen")).toContainText("Lastschrift", { timeout: 20_000 });

    await page.getByRole("button", { name: "Ankündigen und Einzug anlegen" }).click();
    const rueckfrage = page.getByRole("group", { name: "Rückfrage" });
    const frage = (await rueckfrage.textContent()) ?? "";
    const treffer = /(\d+) Lastschrift(?:en)?, ([\d.]+,\d\d)\s€/.exec(frage);
    expect(treffer, `Rückfrage: ${frage}`).not.toBeNull();
    const angekuendigt = { anzahl: Number(treffer![1]), summe: euroZuCent(treffer![2]!) };

    await rueckfrage.getByRole("button", { name: "Ja, ankündigen" }).click();
    await page.waitForURL(/\/admin\/kasse\/lastschriften\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const laufId = new URL(page.url()).pathname.split("/").pop()!;

    // Datei erzeugen und über den Knopf herunterladen, wie die Kasse es tut
    await page.getByRole("button", { name: "pain.008 erzeugen" }).click();
    await rueckfrage.getByRole("button", { name: "Ja, Datei erzeugen" }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("Die Datei ist erzeugt", { timeout: 20_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Datei herunterladen" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.xml$/);
    const xml = await readFile((await download.path())!, "utf8");
    const datei = await lies(page, xml);

    // Wohlgeformt, richtiges Format
    expect(datei.fehler).toBeNull();
    expect(datei.namensraum).toMatch(/^urn:iso:std:iso:20022:tech:xsd:pain\.008\.001\.\d\d$/);

    // Anzahl und Summe: Kopf, Blöcke und Zeilen stimmen untereinander ...
    const zeilen = datei.transaktionen;
    const zeilenSumme = zeilen.reduce((s, t) => s + betragZuCent(t.betrag), 0);
    expect(Number(datei.kopf.anzahl)).toBe(zeilen.length);
    expect(betragZuCent(datei.kopf.summe)).toBe(zeilenSumme);
    expect(datei.bloecke.reduce((s, b) => s + Number(b.anzahl), 0)).toBe(zeilen.length);
    expect(datei.bloecke.reduce((s, b) => s + betragZuCent(b.summe), 0)).toBe(zeilenSumme);

    // ... mit der Rückfrage beim Ankündigen ...
    expect(zeilen.length).toBe(angekuendigt.anzahl);
    expect(zeilenSumme).toBe(angekuendigt.summe);

    // ... und mit den Posten des Laufs in der Datenbank.
    const { data: posten, error: postenFehler } = await supabase
      .from("debit_items")
      .select("end_to_end_id, amount_cents, mandate_reference, mandate_signed_on, sequence_type")
      .eq("batch_id", laufId);
    expect(postenFehler).toBeNull();
    expect(posten).toHaveLength(zeilen.length);
    const nachId = new Map(zeilen.map((t) => [t.endToEnd, t]));
    expect(nachId.size, "EndToEndIds sind eindeutig").toBe(zeilen.length);
    for (const p of posten!) {
      const t = nachId.get(p.end_to_end_id);
      expect(t, `Posten ${p.end_to_end_id} fehlt in der Datei`).toBeTruthy();
      expect(betragZuCent(t!.betrag)).toBe(p.amount_cents);
      expect(t!.mandat).toBe(p.mandate_reference);
      expect(t!.unterschrieben).toBe(p.mandate_signed_on);
      expect(t!.sequenz, `Sequenztyp von ${t!.name}`).toBe(p.sequence_type);
    }

    // Jede Zeile: Euro, gültige IBAN, Mandat; jeder Block: Tag und Gläubiger
    for (const t of zeilen) {
      expect(t.waehrung).toBe("EUR");
      expect(t.iban, `IBAN von ${t.name}`).toMatch(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/);
      expect(ibanGueltig(t.iban), `Prüfsumme der IBAN von ${t.name}`).toBe(true);
      expect(t.mandat).not.toBe("");
    }
    for (const b of datei.bloecke) {
      expect(b.faellig).toBe(tag);
      expect(b.glaeubigerIban).toBe(glaeubigerIban);
      expect(b.glaeubigerId).toBe(glaeubigerId);
    }

    // Kiras Zeile wörtlich: Betrag, Bankverbindung und Mandat aus dem Seed
    const kira = zeilen.filter((t) => t.verwendung.includes(beschreibung));
    expect(kira).toHaveLength(1);
    expect(kira[0]).toMatchObject({
      betrag: "23.45",
      waehrung: "EUR",
      name: ZAHLERIN,
      iban: KIRA.iban,
      mandat: KIRA.mandat,
      sequenz: KIRA.sequenz,
    });

    // Ohne Anmeldung gibt es die Datei nicht, auch mit bekannter Adresse.
    const fremd = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    const ohneAnmeldung = await fremd.get(`/admin/kasse/lastschriften/${laufId}/datei`, { maxRedirects: 0 });
    expect(ohneAnmeldung.status()).not.toBe(200);
    expect(await ohneAnmeldung.text()).not.toContain(KIRA.iban);
    await fremd.dispose();
  });
});
