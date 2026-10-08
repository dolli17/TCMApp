/**
 * Die Kasse gegen einen nachgebildeten Supabase-Client.
 *
 * Getestet wird, was hier Logik ist: die richtigen Parameter an die RPCs, die
 * Meldungen wie im Web und vor allem die SEPA-Datei - Buendeln je Zahler,
 * Ablage im Bucket, danach mark_debit_batch_generated mit Summe und Anzahl.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PayloadZeile } from "./kasse";

const rpc = vi.fn();
const upload = vi.fn();
const download = vi.fn();
const bucket = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    storage: {
      from: (name: string) => {
        bucket(name);
        return {
          upload: (...args: unknown[]) => upload(...args),
          download: (...args: unknown[]) => download(...args),
        };
      },
    },
    from: () => {
      const k: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "neq", "not", "order", "limit"]) k[m] = () => k;
      k.maybeSingle = () => Promise.resolve({ data: null, error: null });
      k.then = (f: (w: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(f);
      return k;
    },
  },
  istKonfiguriert: () => true,
}));

const kasse = await import("./kasse");

const LAUF = "0f8c1d2e-3a4b-4c5d-8e9f-a0b1c2d3e4f5";

/** Eine Zeile von debit_batch_payload mit gueltigen Testdaten. */
function zeile(teil: Partial<PayloadZeile>): PayloadZeile {
  return {
    amount_cents: 12000,
    collection_date: "2026-10-20",
    creditor_bic: null,
    creditor_iban: "DE89370400440532013000",
    creditor_id: "DE98ZZZ09999999999",
    creditor_name: "TC Muckensturm",
    debtor_iban: "DE02120300000000202051",
    debtor_name: "Anna Meier",
    end_to_end_id: "TCM-2026-0001",
    kind: "fee",
    mandate_last_used_on: null,
    mandate_reference: "TCM-M-0001",
    mandate_signed_on: "2025-01-10",
    pain_version: "pain.008.001.08",
    remittance_info: "Beitrag 2026 Anna",
    sequence_type: "RCUR",
    ...teil,
  };
}

beforeEach(() => {
  rpc.mockReset();
  upload.mockReset();
  download.mockReset();
  bucket.mockReset();
});

describe("baueLastschriftLauf", () => {
  it("buendelt je Kennung: Betraege addiert, Verwendungszwecke aneinander", () => {
    const lauf = kasse.baueLastschriftLauf(LAUF, [
      zeile({ amount_cents: 12000, remittance_info: "Beitrag 2026 Anna" }),
      zeile({ amount_cents: 6000, remittance_info: "Beitrag 2026 Ben" }),
      zeile({
        end_to_end_id: "TCM-2026-0002", debtor_name: "Carl Kurz", mandate_reference: "TCM-M-0002",
        amount_cents: 9000, remittance_info: "Beitrag 2026 Carl",
      }),
    ], new Date("2026-09-29T10:00:00Z"));

    expect(lauf.items).toHaveLength(2);
    expect(lauf.items[0]).toMatchObject({
      endToEndId: "TCM-2026-0001",
      amountCents: 18000,
      remittanceInfo: "Beitrag 2026 Anna, Beitrag 2026 Ben",
    });
    expect(lauf.items[1]!.amountCents).toBe(9000);
    expect(lauf.messageId).toBe("TCM-0f8c1d2e3a4b4c5d8e9fa0b1");
    expect(lauf.paymentInfoId).toBe("TCM-PMT-0f8c1d2e3a4b4c5d8e9f");
    expect(lauf.creationDateTime).toBe("2026-09-29T10:00:00.000Z");
    expect(lauf.creditor.bic).toBeUndefined();
    expect(lauf.painVersion).toBe("pain.008.001.08");
  });

  it("uebergibt lastUsedOn, damit alte, aber benutzte Mandate nicht als erloschen gelten", () => {
    const lauf = kasse.baueLastschriftLauf(LAUF, [zeile({ mandate_last_used_on: "2026-01-15" })]);
    expect(lauf.items[0]!.mandate).toMatchObject({ lastUsedOn: "2026-01-15", status: "active" });
  });
});

describe("dateiErzeugen", () => {
  it("baut die Datei, legt sie im Bucket sepa ab und markiert den Lauf", async () => {
    rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === "debit_batch_payload"
          ? {
              data: [
                zeile({ amount_cents: 12000 }),
                zeile({ amount_cents: 6000, remittance_info: "Beitrag 2026 Ben" }),
                zeile({
                  end_to_end_id: "TCM-2026-0002", debtor_name: "Carl Kurz",
                  mandate_reference: "TCM-M-0002", amount_cents: 9000,
                }),
              ],
              error: null,
            }
          : { data: null, error: null },
      ),
    );
    upload.mockResolvedValue({ data: {}, error: null });

    const e = await kasse.dateiErzeugen(LAUF);

    expect(e).toEqual({
      ok: true,
      meldung: "Die Datei ist erzeugt: 2 Lastschriften. Jetzt herunterladen und im Onlinebanking einreichen.",
    });
    expect(bucket).toHaveBeenCalledWith("sepa");
    const [pfad, xml, optionen] = upload.mock.calls[0]!;
    expect(pfad).toMatch(new RegExp(`^${LAUF}/.+\\.xml$`));
    expect(xml).toContain("<CstmrDrctDbtInitn>");
    expect(xml).toContain("270.00");
    expect(optionen).toEqual({ contentType: "application/xml", upsert: true });
    expect(rpc).toHaveBeenLastCalledWith("mark_debit_batch_generated", {
      p_batch_id: LAUF,
      p_storage_path: pfad,
      p_total_cents: 27000,
      p_item_count: 2,
    });
  });

  it("meldet einen leeren Lauf, ohne etwas abzulegen", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const e = await kasse.dateiErzeugen(LAUF);
    expect(e).toEqual({ ok: false, meldung: "Der Lauf enthält keine Posten." });
    expect(upload).not.toHaveBeenCalled();
  });

  it("gibt die Beanstandungen von buildPain008 wieder und legt nichts ab", async () => {
    rpc.mockResolvedValue({ data: [zeile({ debtor_iban: "DE00123" })], error: null });
    const e = await kasse.dateiErzeugen(LAUF);
    expect(e.ok).toBe(false);
    expect(e.meldung.length).toBeGreaterThan(0);
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith("mark_debit_batch_generated", expect.anything());
  });

  it("markiert den Lauf nicht, wenn die Ablage scheitert", async () => {
    rpc.mockResolvedValue({ data: [zeile({})], error: null });
    upload.mockResolvedValue({ data: null, error: { message: "new row violates row-level security policy" } });
    const e = await kasse.dateiErzeugen(LAUF);
    expect(e).toEqual({
      ok: false,
      meldung: "Die Datei ließ sich nicht ablegen. (new row violates row-level security policy)",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("ladeLastschriftdatei", () => {
  it("laedt mit der Sitzung aus dem Bucket und nimmt den Dateinamen aus dem Pfad", async () => {
    download.mockResolvedValue({ data: new Blob(["<xml/>"]), error: null });
    const e = await kasse.ladeLastschriftdatei(`${LAUF}/TCM-lauf.xml`);
    expect(bucket).toHaveBeenCalledWith("sepa");
    expect(e).toMatchObject({ ok: true, daten: { name: "TCM-lauf.xml", xml: "<xml/>" } });
  });

  it("sagt, wenn es noch keine Datei gibt", async () => {
    const e = await kasse.ladeLastschriftdatei(null);
    expect(e).toEqual({ ok: false, meldung: "Zu diesem Lauf gibt es noch keine Datei." });
    expect(download).not.toHaveBeenCalled();
  });
});

describe("Schreibaktionen", () => {
  it("postenAufnehmen nennt Aufgenommene und Uebersprungene", async () => {
    rpc.mockResolvedValue({ data: [{ aufgenommen: 3, uebersprungen: 1, summe_cents: 0 }], error: null });
    const e = await kasse.postenAufnehmen(LAUF, null);
    expect(rpc).toHaveBeenCalledWith("add_charges_to_debit_batch", { p_batch_id: LAUF, p_payer_ids: undefined });
    expect(e.meldung).toBe("3 Forderungen aufgenommen, 1 Zahler bleibt außen vor.");
  });

  it("postenAufnehmen ohne Einzugsfaehige", async () => {
    rpc.mockResolvedValue({ data: [{ aufgenommen: 0, uebersprungen: 0, summe_cents: 0 }], error: null });
    expect((await kasse.postenAufnehmen(LAUF, null)).meldung).toBe("Es war nichts Einzugsfähiges dabei.");
  });

  it("laufAnlegen gibt die neue Id zurueck", async () => {
    rpc.mockResolvedValue({ data: "neu-1", error: null });
    const e = await kasse.laufAnlegen({ titel: "Beitragslauf 2027", faelligAm: "2027-01-15" });
    expect(rpc).toHaveBeenCalledWith("create_debit_batch", { p_title: "Beitragslauf 2027", p_collection_date: "2027-01-15" });
    expect(e).toEqual({ ok: true, meldung: "Der Lauf ist angelegt.", daten: "neu-1" });
  });

  it("beitragslaufStarten meldet den zweiten Klick nicht als Erfolg mit null", async () => {
    rpc.mockResolvedValue({ data: [{ erzeugt: 0, uebersprungen: 5, summe_cents: 0 }], error: null });
    expect((await kasse.beitragslaufStarten({ jahr: 2026, faelligAm: null })).meldung).toBe(
      "Es gab nichts Neues zu erzeugen.",
    );
    rpc.mockResolvedValue({ data: [{ erzeugt: 2, uebersprungen: 5, summe_cents: 0 }], error: null });
    expect((await kasse.beitragslaufStarten({ jahr: 2026, faelligAm: "2026-01-15" })).meldung).toBe(
      "2 Forderungen erzeugt, 5 bestanden schon.",
    );
    expect(rpc).toHaveBeenLastCalledWith("fee_run_execute", { p_year: 2026, p_due_date: "2026-01-15" });
  });

  it("forderungenAnkuendigen nennt Forderungen und Zahler", async () => {
    rpc.mockResolvedValue({ data: [{ angekuendigt: 3, empfaenger: 1, faellig_am: "", summe_cents: 0 }], error: null });
    const e = await kasse.forderungenAnkuendigen({ faelligAm: "2026-10-20", art: "drinks", zeitraum: "2026-08" });
    expect(rpc).toHaveBeenCalledWith("announce_charges", {
      p_due_date: "2026-10-20", p_kind: "drinks", p_period_label: "2026-08", p_charge_ids: undefined,
    });
    expect(e.meldung).toBe("3 Forderungen angekündigt, 1 Zahler wurde benachrichtigt.");
  });

  it("monatSchliessen und monatAbrechnen", async () => {
    rpc.mockResolvedValue({ data: [{ buchungen: 12, mitglieder: 4, summe_cents: 0 }], error: null });
    expect((await kasse.monatSchliessen(2026, 8)).meldung).toBe(
      "Monat geschlossen. 12 Entnahmen von 4 Mitgliedern stehen jetzt fest.",
    );
    rpc.mockResolvedValue({ data: [{ erzeugt: 1, summe_cents: 0 }], error: null });
    expect((await kasse.monatAbrechnen(2026, 8, null)).meldung).toBe("1 Forderung erzeugt.");
    expect(rpc).toHaveBeenLastCalledWith("charge_billing_period", { p_year: 2026, p_month: 8, p_due_date: undefined });
  });

  it("forderungAbhaken laesst einen leeren Vermerk weg", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await kasse.forderungAbhaken("f1", "");
    expect(rpc).toHaveBeenCalledWith("settle_charge_manually", { p_charge_id: "f1", p_note: undefined });
  });

  it("beitragsartUmschalten nennt noch zugewiesene Mitglieder", async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    expect((await kasse.beitragsartUmschalten("a1", false)).meldung).toBe(
      "Beitragsart stillgelegt. 2 Mitglieder haben sie dieses Jahr noch zugewiesen.",
    );
  });

  it("ruecklaeuferErfassen und laufAbschliessen", async () => {
    rpc.mockResolvedValue({ data: [{ forderungen: 2, payer_name: "Anna Meier", summe_cents: 0 }], error: null });
    expect((await kasse.ruecklaeuferErfassen({ kennung: "K1", grund: "Widerspruch", am: null })).meldung).toBe(
      "Zurückgebucht: 2 Forderungen stehen wieder offen. Anna Meier wurde benachrichtigt.",
    );
    rpc.mockResolvedValue({ data: [{ eingezogen: 9, zurueck: 1, summe_cents: 0 }], error: null });
    expect((await kasse.laufAbschliessen(LAUF)).meldung).toBe("Lauf abgeschlossen: 9 eingezogen, 1 zurückgebucht.");
  });

  it("uebersetzt Datenbankfehler und wirft nie", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom", code: "42501" } });
    const e = await kasse.laufEingereicht(LAUF, null);
    expect(e.ok).toBe(false);
    expect(typeof e.meldung).toBe("string");
  });
});

describe("plusTage", () => {
  it("rechnet ueber Monatsgrenzen auf dem Kalendertag", () => {
    expect(kasse.plusTage("2026-09-29", 15)).toBe("2026-10-14");
    expect(kasse.plusTage("2026-12-31", 1)).toBe("2027-01-01");
  });
});
