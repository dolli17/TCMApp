import { describe, expect, it } from "vitest";
import {
  CHARGE_KINDS, CHARGE_KIND_LABEL, CHARGE_KIND_TON, chargeKindsText, debitBatchTitle,
  sortChargeKinds,
} from "./forderungen";

describe("Forderungsarten", () => {
  it("hat fuer jede Art Bezeichnung und Farbe", () => {
    for (const k of CHARGE_KINDS) {
      expect(CHARGE_KIND_LABEL[k]).toBeTruthy();
      expect(CHARGE_KIND_TON[k]).toBeTruthy();
    }
    expect(CHARGE_KINDS).toHaveLength(6);
  });

  it("sortiert in Vereinsreihenfolge und laesst Unbekanntes weg", () => {
    expect(sortChargeKinds(["misc", "fee", "quatsch", "drinks"])).toEqual(["fee", "drinks", "misc"]);
    expect(sortChargeKinds(null)).toEqual([]);
  });

  it("beschreibt eine Auswahl", () => {
    expect(chargeKindsText(null)).toBe("alle Arten");
    expect(chargeKindsText([...CHARGE_KINDS])).toBe("alle Arten");
    expect(chargeKindsText(["drinks", "fee"])).toBe("Beitrag, Getränke");
  });
});

describe("debitBatchTitle", () => {
  it("nennt Datum und, wenn eingeschraenkt, die Arten", () => {
    expect(debitBatchTitle("2026-11-15")).toBe("Lastschrift 15.11.2026");
    expect(debitBatchTitle("2026-11-15", ["fee"])).toBe("Lastschrift 15.11.2026 · Beitrag");
  });
});
