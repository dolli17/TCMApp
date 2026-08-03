import { describe, expect, it } from "vitest";
import {
  feeLinesForMember,
  priceForYear,
  totalFeeCents,
  type FeePrice,
  type FeeType,
  type MemberFee,
} from "./fees";

const TYPEN: FeeType[] = [
  { id: "t1", code: "erwachsener", name: "Erwachsener" },
  { id: "t2", code: "schluesselpfand", name: "Schluesselpfand" },
  { id: "t3", code: "beitragsbefreit", name: "Beitragsbefreit" },
  { id: "t4", code: "jugend", name: "Kinder und Jugendliche" },
];

const PREISE: FeePrice[] = [
  { feeTypeId: "t1", validFromYear: 2025, amountCents: 18000 },
  { feeTypeId: "t1", validFromYear: 2026, amountCents: 19000 },
  { feeTypeId: "t2", validFromYear: 2025, amountCents: 5000 },
  { feeTypeId: "t3", validFromYear: 2025, amountCents: 0 },
  { feeTypeId: "t4", validFromYear: 2026, amountCents: 9000 },
];

describe("priceForYear", () => {
  it("nimmt den Preis des Jahres", () => {
    expect(priceForYear(PREISE, "t1", 2026)).toBe(19000);
    expect(priceForYear(PREISE, "t1", 2025)).toBe(18000);
  });

  it("traegt den letzten bekannten Preis fort", () => {
    // Fuer 2027 wurde nichts gepflegt, also gilt der Preis von 2026 weiter.
    expect(priceForYear(PREISE, "t1", 2027)).toBe(19000);
    // Schluesselpfand hat nur einen Eintrag von 2025.
    expect(priceForYear(PREISE, "t2", 2026)).toBe(5000);
  });

  it("liefert null vor dem ersten gepflegten Jahr", () => {
    expect(priceForYear(PREISE, "t1", 2024)).toBeNull();
    expect(priceForYear(PREISE, "t4", 2025)).toBeNull();
  });
});

describe("feeLinesForMember", () => {
  it("berechnet einen einfachen Jahresbeitrag", () => {
    const fees: MemberFee[] = [{ feeTypeId: "t1", year: 2026 }];
    const lines = feeLinesForMember(fees, TYPEN, PREISE, 2026);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.amountCents).toBe(19000);
    expect(totalFeeCents(lines)).toBe(19000);
  });

  it("addiert zwei Beitragsarten", () => {
    // Der haeufigste Doppelfall im Bestand: Beitrag plus Schluesselpfand.
    const fees: MemberFee[] = [
      { feeTypeId: "t1", year: 2026 },
      { feeTypeId: "t2", year: 2026 },
    ];
    const lines = feeLinesForMember(fees, TYPEN, PREISE, 2026);
    expect(lines).toHaveLength(2);
    expect(totalFeeCents(lines)).toBe(24000);
  });

  it("beitragsbefreit ergibt null Euro, nicht keine Position", () => {
    const fees: MemberFee[] = [{ feeTypeId: "t3", year: 2026 }];
    const lines = feeLinesForMember(fees, TYPEN, PREISE, 2026);
    expect(lines).toHaveLength(1);
    expect(totalFeeCents(lines)).toBe(0);
  });

  it("beachtet einen Sonderbetrag am Mitglied", () => {
    const fees: MemberFee[] = [
      { feeTypeId: "t1", year: 2026, overrideAmountCents: 9500 },
    ];
    const lines = feeLinesForMember(fees, TYPEN, PREISE, 2026);
    expect(lines[0]!.amountCents).toBe(9500);
    expect(lines[0]!.isOverride).toBe(true);
  });

  it("ein Sonderbetrag von null ist gueltig und nicht 'kein Wert'", () => {
    const fees: MemberFee[] = [
      { feeTypeId: "t1", year: 2026, overrideAmountCents: 0 },
    ];
    expect(totalFeeCents(feeLinesForMember(fees, TYPEN, PREISE, 2026))).toBe(0);
  });

  it("ignoriert andere Jahre", () => {
    const fees: MemberFee[] = [
      { feeTypeId: "t1", year: 2025 },
      { feeTypeId: "t1", year: 2026 },
    ];
    expect(totalFeeCents(feeLinesForMember(fees, TYPEN, PREISE, 2026))).toBe(19000);
    expect(totalFeeCents(feeLinesForMember(fees, TYPEN, PREISE, 2025))).toBe(18000);
  });

  it("meldet einen fehlenden Preis, statt still null zu berechnen", () => {
    // Sonst wuerde ein Mitglied beitragsfrei, weil jemand den Preis vergessen hat.
    const fees: MemberFee[] = [{ feeTypeId: "t4", year: 2025 }];
    expect(() => feeLinesForMember(fees, TYPEN, PREISE, 2025)).toThrow(
      /kein Preis/,
    );
  });

  it("meldet eine unbekannte Beitragsart", () => {
    const fees: MemberFee[] = [{ feeTypeId: "gibtesnicht", year: 2026 }];
    expect(() => feeLinesForMember(fees, TYPEN, PREISE, 2026)).toThrow(
      /Unbekannte Beitragsart/,
    );
  });

  it("summiert einen ganzen Verein ohne Rundungsfehler", () => {
    const lines = Array.from({ length: 400 }, () => ({
      feeTypeId: "t1",
      feeTypeName: "Erwachsener",
      amountCents: 19000,
      isOverride: false,
    }));
    expect(totalFeeCents(lines)).toBe(7_600_000);
  });
});
