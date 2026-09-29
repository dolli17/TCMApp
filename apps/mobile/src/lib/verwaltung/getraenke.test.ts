/**
 * Getraenke der Verwaltung gegen einen nachgebildeten Client: richtige RPCs,
 * Betrags- und Datumsumwandlung vor dem Absenden, Meldungen wortgleich mit
 * dem Web.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
  istKonfiguriert: () => true,
}));

const {
  KEIN_BETRAG, entferneGeplantenPreis, inCents, naechsterSchritt, schalteGetraenk, setzePreis,
  sortiereGetraenke, speichereGetraenk,
} = await import("./getraenke");

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
});

describe("inCents", () => {
  it("liest Komma und Punkt, rundet nicht", () => {
    expect(inCents("2,50")).toBe(250);
    expect(inCents("3")).toBe(300);
    expect(inCents("2.5")).toBe(250);
    expect(inCents("2,505")).toBeNull();
    expect(inCents("zwei")).toBeNull();
  });
});

describe("speichereGetraenk", () => {
  it("legt mit Preis in Cent an", async () => {
    const e = await speichereGetraenk({ id: null, name: "Radler", beschreibung: "0,5 Liter", art: "drink", preis: "2,80" });
    expect(rpc).toHaveBeenCalledWith("upsert_drink_item", {
      p_id: null, p_name: "Radler", p_description: "0,5 Liter", p_category: "drink",
      p_price_cents: 280, p_sort_order: undefined,
    });
    expect(e).toEqual({ ok: true, meldung: "Getränk angelegt." });
  });

  it("laesst den Preis beim Bearbeiten weg, wenn leer", async () => {
    const e = await speichereGetraenk({ id: "g", name: "Radler", beschreibung: "", art: "drink", preis: " " });
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_id: "g", p_price_cents: undefined });
    expect(e.meldung).toBe("Getränk gespeichert.");
  });

  it("weist einen falschen Betrag ab, ohne zu senden", async () => {
    const e = await speichereGetraenk({ id: null, name: "X", beschreibung: "", art: "food", preis: "2,5,0" });
    expect(e).toEqual({ ok: false, meldung: KEIN_BETRAG });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("setzePreis", () => {
  it("setzt ab heute und nennt, wer den alten Preis behaelt", async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    const e = await setzePreis({ itemId: "g", preis: "3", gueltigAb: "" });
    expect(rpc).toHaveBeenCalledWith("set_drink_price", { p_item_id: "g", p_price_cents: 300, p_valid_from: undefined });
    expect(e.meldung).toBe("Preis geändert. 2 Buchungen aus diesem Monat behalten den alten Preis.");
  });

  it("plant einen Preis in der Zukunft", async () => {
    rpc.mockResolvedValue({ data: 0, error: null });
    const e = await setzePreis({ itemId: "g", preis: "3,20", gueltigAb: "01.01.2099" });
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_price_cents: 320, p_valid_from: "2099-01-01" });
    expect(e.meldung).toBe("Der neue Preis gilt ab dem 1.1.2099. Bis dahin bleibt alles beim Alten.");
  });

  it("weist falschen Betrag und falsches Datum ab", async () => {
    expect((await setzePreis({ itemId: "g", preis: "abc", gueltigAb: "" })).meldung).toBe(KEIN_BETRAG);
    expect((await setzePreis({ itemId: "g", preis: "2", gueltigAb: "32.01.2026" })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uebersetzt Fehler der Datenbank", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Nur für Admins.", code: "42501" } });
    const e = await setzePreis({ itemId: "g", preis: "2", gueltigAb: "" });
    expect(e.ok).toBe(false);
    expect(e.meldung).not.toBe("");
  });
});

describe("weitere Schreibaktionen", () => {
  it("nimmt einen geplanten Preis zurueck", async () => {
    const e = await entferneGeplantenPreis("g", "2099-01-01");
    expect(rpc).toHaveBeenCalledWith("remove_drink_price", { p_item_id: "g", p_valid_from: "2099-01-01" });
    expect(e.meldung).toBe("Der geplante Preis ist zurückgenommen.");
  });

  it("legt still und nennt noch abzurechnende Buchungen", async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    const e = await schalteGetraenk("g", false);
    expect(rpc).toHaveBeenCalledWith("set_drink_item_active", { p_id: "g", p_active: false });
    expect(e.meldung).toBe("Getränk stillgelegt. 1 Buchung wird aus diesem Monat noch abgerechnet.");
  });

  it("sortiert", async () => {
    const e = await sortiereGetraenke(["b", "a"]);
    expect(rpc).toHaveBeenCalledWith("reorder_drink_items", { p_ids: ["b", "a"] });
    expect(e.meldung).toBe("Reihenfolge gespeichert.");
  });
});

describe("naechsterSchritt", () => {
  it("nimmt den aeltesten offenen Schritt", () => {
    const s = naechsterSchritt(
      [
        { year: 2026, month: 8, status: "closed", offen: 0 },
        { year: 2026, month: 7, status: "charged", offen: 5 },
        { year: 2026, month: 9, status: "open", offen: 0 },
      ],
      "2026-09-29",
    );
    expect(s.titel).toBe("Juli 2026 ankündigen");
  });

  it("meldet alles erledigt", () => {
    expect(naechsterSchritt([{ year: 2026, month: 9, status: "open", offen: 0 }], "2026-09-29").titel)
      .toBe("Alles abgerechnet");
  });
});
