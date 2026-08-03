import { describe, expect, it } from "vitest";
import {
  formatIban,
  ibanCheckDigits,
  isValidIban,
  maskIban,
  normalizeIban,
} from "./iban";

describe("isValidIban", () => {
  it("akzeptiert gueltige IBANs", () => {
    expect(isValidIban("DE89370400440532013000")).toBe(true);
    expect(isValidIban("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(isValidIban("de89370400440532013000")).toBe(true);
    expect(isValidIban("GB82WEST12345698765432")).toBe(true);
    expect(isValidIban("AT611904300234573201")).toBe(true);
    expect(isValidIban("CH9300762011623852957")).toBe(true);
  });

  it("erkennt falsche Pruefziffern", () => {
    expect(isValidIban("DE88370400440532013000")).toBe(false);
    expect(isValidIban("DE00370400440532013000")).toBe(false);
  });

  it("erkennt vertauschte Ziffern", () => {
    // Der haeufigste Tippfehler ueberhaupt - genau dagegen ist die Pruefziffer da.
    expect(isValidIban("DE89370400440532013000")).toBe(true);
    expect(isValidIban("DE89370400440532010300")).toBe(false);
  });

  it("prueft die Laenge je Land", () => {
    expect(isValidIban("DE8937040044053201300")).toBe(false);
    expect(isValidIban("DE893704004405320130000")).toBe(false);
  });

  it("lehnt Unsinn ab", () => {
    expect(isValidIban("")).toBe(false);
    expect(isValidIban(null)).toBe(false);
    expect(isValidIban(undefined)).toBe(false);
    expect(isValidIban("keine iban")).toBe(false);
    expect(isValidIban("1234567890")).toBe(false);
    expect(isValidIban("DE89-3704-0044-0532-0130-00")).toBe(true);
  });
});

describe("ibanCheckDigits", () => {
  it("berechnet die Pruefziffern einer bekannten IBAN", () => {
    expect(ibanCheckDigits("370400440532013000")).toBe("89");
  });

  it("erzeugt IBANs, die die Pruefung bestehen", () => {
    for (const bban of [
      "370400440532013000",
      "100500000123456789",
      "600501010405665356",
    ]) {
      const iban = `DE${ibanCheckDigits(bban)}${bban}`;
      expect(isValidIban(iban)).toBe(true);
    }
  });
});

describe("Darstellung", () => {
  it("normalisiert", () => {
    expect(normalizeIban(" de89 3704-0044 ")).toBe("DE8937040044");
  });

  it("formatiert in Vierergruppen", () => {
    expect(formatIban("DE89370400440532013000")).toBe(
      "DE89 3704 0044 0532 0130 00",
    );
  });

  it("maskiert bis auf die letzten vier Stellen", () => {
    expect(maskIban("DE89370400440532013000")).toBe("DE89 •••• 3000");
    expect(maskIban("kurz")).toBe("••••");
  });
});
