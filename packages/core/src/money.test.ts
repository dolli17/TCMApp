import { describe, expect, it } from "vitest";
import {
  centsToAmountString,
  formatCents,
  parseAmountToCents,
  sumCents,
} from "./money.js";

describe("formatCents", () => {
  it("formatiert deutsche Betraege", () => {
    // Intl setzt ein schmales geschuetztes Leerzeichen vor das Eurozeichen.
    expect(formatCents(1900).replace(/ | /g, " ")).toBe("19,00 €");
    expect(formatCents(0).replace(/ | /g, " ")).toBe("0,00 €");
    expect(formatCents(5).replace(/ | /g, " ")).toBe("0,05 €");
  });
});

describe("centsToAmountString", () => {
  it("erzeugt das Format fuer SEPA-XML", () => {
    expect(centsToAmountString(1900)).toBe("19.00");
    expect(centsToAmountString(5)).toBe("0.05");
    expect(centsToAmountString(0)).toBe("0.00");
    expect(centsToAmountString(123456)).toBe("1234.56");
  });

  it("weist Nachkommastellen zurueck", () => {
    expect(() => centsToAmountString(19.5)).toThrow(/ganzzahlig/);
  });
});

describe("parseAmountToCents", () => {
  it("versteht Komma und Punkt", () => {
    expect(parseAmountToCents("19,00")).toBe(1900);
    expect(parseAmountToCents("19.00")).toBe(1900);
    expect(parseAmountToCents("19")).toBe(1900);
    expect(parseAmountToCents("0,05")).toBe(5);
    expect(parseAmountToCents(" 1234,56 ")).toBe(123456);
  });

  it("rundet nicht still, sondern lehnt ab", () => {
    // Bei Geld ist stilles Runden gefaehrlicher als ein Fehler.
    expect(() => parseAmountToCents("19,005")).toThrow();
    expect(() => parseAmountToCents("abc")).toThrow();
    expect(() => parseAmountToCents("")).toThrow();
  });

  it("ist die Umkehrung von centsToAmountString", () => {
    for (const cents of [0, 1, 99, 100, 1900, 123456, 999999]) {
      expect(parseAmountToCents(centsToAmountString(cents))).toBe(cents);
    }
  });
});

describe("sumCents", () => {
  it("summiert ohne Fliesskommafehler", () => {
    // In Fliesskomma waere 0.1 + 0.2 !== 0.3 - in Cent gibt es das Problem nicht.
    expect(sumCents([10, 20])).toBe(30);
    expect(sumCents(Array.from({ length: 400 }, () => 1900))).toBe(760000);
    expect(sumCents([])).toBe(0);
  });
});
