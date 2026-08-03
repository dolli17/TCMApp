import { describe, expect, it } from "vitest";
import {
  canVoidSelf,
  isDebitable,
  monthlyTotalCents,
  summarizeByItem,
  type DrinkPurchase,
} from "./drinks.js";

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
