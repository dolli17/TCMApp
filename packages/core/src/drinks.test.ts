import { describe, expect, it } from "vitest";
import {
  basketAfterBatch,
  basketReminder,
  basketSummary,
  canVoidSelf,
  changeBasket,
  drinkBatchReport,
  isDebitable,
  MAX_DRINK_QUANTITY,
  monthlyTotalCents,
  parseBasket,
  summarizeByItem,
  type DrinkPurchase,
} from "./drinks";
import { formatCents } from "./money";

function kauf(over: Partial<DrinkPurchase> = {}): DrinkPurchase {
  return {
    id: crypto.randomUUID(),
    memberId: "m1",
    drinkItemId: "bier",
    quantity: 1,
    unitPriceCents: 250,
    createdAt: new Date().toISOString(),
    voidedAt: null,
    ...over,
  };
}

describe("monthlyTotalCents", () => {
  it("summiert Menge mal Einzelpreis", () => {
    expect(
      monthlyTotalCents([
        kauf({ quantity: 2, unitPriceCents: 250 }),
        kauf({ quantity: 1, unitPriceCents: 150 }),
      ]),
    ).toBe(650);
  });

  it("laesst stornierte Buchungen weg", () => {
    expect(
      monthlyTotalCents([
        kauf({ quantity: 2, unitPriceCents: 250 }),
        kauf({ quantity: 5, unitPriceCents: 250, voidedAt: new Date().toISOString() }),
      ]),
    ).toBe(500);
  });

  it("eine Preisaenderung veraendert alte Buchungen nicht", () => {
    // Der Preis steckt in der Buchung, nicht in der Preisliste. Wer vor der
    // Erhoehung gekauft hat, zahlt weiterhin den alten Preis.
    const vorher = kauf({ quantity: 1, unitPriceCents: 250 });
    const nachher = kauf({ quantity: 1, unitPriceCents: 300 });
    expect(monthlyTotalCents([vorher, nachher])).toBe(550);
  });

  it("leerer Monat ergibt null", () => {
    expect(monthlyTotalCents([])).toBe(0);
  });
});

describe("summarizeByItem", () => {
  it("fasst je Artikel zusammen", () => {
    const zeilen = summarizeByItem([
      kauf({ drinkItemId: "bier", quantity: 2, unitPriceCents: 250 }),
      kauf({ drinkItemId: "bier", quantity: 1, unitPriceCents: 250 }),
      kauf({ drinkItemId: "wasser", quantity: 4, unitPriceCents: 150 }),
    ]);

    const bier = zeilen.find((z) => z.drinkItemId === "bier");
    expect(bier?.quantity).toBe(3);
    expect(bier?.totalCents).toBe(750);

    const wasser = zeilen.find((z) => z.drinkItemId === "wasser");
    expect(wasser?.quantity).toBe(4);
    expect(wasser?.totalCents).toBe(600);
  });

  it("fasst auch bei unterschiedlichen Preisen desselben Artikels korrekt zusammen", () => {
    const zeilen = summarizeByItem([
      kauf({ drinkItemId: "bier", quantity: 1, unitPriceCents: 250 }),
      kauf({ drinkItemId: "bier", quantity: 1, unitPriceCents: 300 }),
    ]);
    expect(zeilen[0]!.quantity).toBe(2);
    expect(zeilen[0]!.totalCents).toBe(550);
  });
});

describe("canVoidSelf", () => {
  const jetzt = new Date("2026-08-03T12:00:00Z");

  it("erlaubt Storno innerhalb des Fensters", () => {
    const k = kauf({ createdAt: new Date("2026-08-03T11:50:00Z").toISOString() });
    expect(canVoidSelf(k, 15, jetzt)).toBe(true);
  });

  it("verweigert nach Ablauf", () => {
    const k = kauf({ createdAt: new Date("2026-08-03T11:40:00Z").toISOString() });
    expect(canVoidSelf(k, 15, jetzt)).toBe(false);
  });

  it("genau auf der Grenze ist noch erlaubt", () => {
    const k = kauf({ createdAt: new Date("2026-08-03T11:45:00Z").toISOString() });
    expect(canVoidSelf(k, 15, jetzt)).toBe(true);
  });

  it("bereits storniert bleibt storniert", () => {
    const k = kauf({
      createdAt: new Date("2026-08-03T11:59:00Z").toISOString(),
      voidedAt: new Date().toISOString(),
    });
    expect(canVoidSelf(k, 15, jetzt)).toBe(false);
  });
});

describe("isDebitable", () => {
  it("zieht erst ab dem Mindestbetrag ein", () => {
    expect(isDebitable(499, 500)).toBe(false);
    expect(isDebitable(500, 500)).toBe(true);
    expect(isDebitable(1250, 500)).toBe(true);
  });

  it("null Euro wird nicht eingezogen", () => {
    expect(isDebitable(0, 500)).toBe(false);
  });
});

describe("drinkBatchReport", () => {
  it("nennt alles, wenn alles klappt", () => {
    expect(
      drinkBatchReport([
        { name: "Bier", quantity: 2, ok: true },
        { name: "Wasser still", quantity: 1, ok: true },
      ]),
    ).toEqual({ ok: true, text: "Eingetragen: 2× Bier, 1× Wasser still." });
  });

  it("sagt, welcher fehlschlug und warum - und was trotzdem steht", () => {
    expect(
      drinkBatchReport([
        { name: "Bier", quantity: 2, ok: true },
        { name: "Cola", quantity: 1, ok: false, message: "Der Artikel ist nicht mehr auf der Karte." },
      ]),
    ).toEqual({
      ok: false,
      text: "Nicht eingetragen: 1× Cola (Der Artikel ist nicht mehr auf der Karte). Eingetragen: 2× Bier.",
    });
  });

  it("wenn nichts klappt, steht nur der Fehler da", () => {
    expect(drinkBatchReport([{ name: "Cola", quantity: 3, ok: false }])).toEqual({
      ok: false,
      text: "Nicht eingetragen: 3× Cola.",
    });
  });
});

describe("Getraenke-Korb", () => {
  const karte = [
    { id: "bier", price_cents: 250 },
    { id: "wasser", price_cents: 150 },
    { id: "ohnePreis", price_cents: null },
  ];

  it("zaehlt hoch und runter, bei 0 faellt der Artikel heraus", () => {
    let korb = changeBasket({}, "bier", 1);
    korb = changeBasket(korb, "bier", 1);
    expect(korb).toEqual({ bier: 2 });
    korb = changeBasket(korb, "bier", -1);
    korb = changeBasket(korb, "bier", -1);
    expect(korb).toEqual({});
    expect(changeBasket({}, "bier", -1)).toEqual({});
  });

  it("begrenzt auf die Hoechstmenge und laesst den alten Korb unberuehrt", () => {
    const alt = { bier: MAX_DRINK_QUANTITY };
    expect(changeBasket(alt, "bier", 1)).toEqual({ bier: MAX_DRINK_QUANTITY });
    const neu = changeBasket(alt, "wasser", 1);
    expect(alt).toEqual({ bier: MAX_DRINK_QUANTITY });
    expect(neu).toEqual({ bier: MAX_DRINK_QUANTITY, wasser: 1 });
  });

  it("fasst in der Reihenfolge der Karte zusammen und ignoriert Artikel, die es nicht mehr gibt", () => {
    const s = basketSummary(karte, { wasser: 1, bier: 2, weg: 4, ohnePreis: 1 });
    expect(s.lines.map((a) => a.id)).toEqual(["bier", "wasser", "ohnePreis"]);
    expect(s.count).toBe(4);
    expect(s.totalCents).toBe(650);
    expect(basketSummary(karte, {})).toEqual({ lines: [], count: 0, totalCents: 0 });
  });

  it("behaelt nach dem Eintragen nur, was nicht geklappt hat", () => {
    expect(
      basketAfterBatch([
        { id: "bier", name: "Bier", quantity: 2, ok: true },
        { id: "wasser", name: "Wasser", quantity: 3, ok: false, message: "Gesperrt." },
      ]),
    ).toEqual({ wasser: 3 });
  });

  it("liest einen gemerkten Korb und verwirft Unsinn", () => {
    expect(parseBasket(JSON.stringify({ bier: 2 }))).toEqual({ bier: 2 });
    expect(parseBasket(null)).toEqual({});
    expect(parseBasket("kaputt{")).toEqual({});
    expect(parseBasket("[1,2]")).toEqual({});
    expect(parseBasket(JSON.stringify({ a: 0, b: -1, c: 1.5, d: "2", e: 999 }))).toEqual({
      e: MAX_DRINK_QUANTITY,
    });
  });

  it("erinnert mit Menge und Betrag", () => {
    expect(basketReminder(1, 250)).toBe(`1 Getränk (${formatCents(250)}) ist noch nicht eingetragen.`);
    expect(basketReminder(3, 650)).toBe(`3 Getränke (${formatCents(650)}) sind noch nicht eingetragen.`);
  });
});
