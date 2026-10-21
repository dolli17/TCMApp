import { describe, expect, it } from "vitest";
import {
  BENACHRICHTIGUNGS_ARTEN,
  centsAlsEingabe,
  einstellungsText,
  euroEingabeAlsCents,
  listeAusWert,
  listenOptionen,
} from "./einstellungen";

describe("einstellungsText", () => {
  it("nimmt für bekannte Schlüssel den Text aus dem Code", () => {
    const t = einstellungsText({
      key: "work_duty.hourly_rate_cents",
      label: "Stundensatz Arbeitsdienst",
      description: "Platzhalter",
    });
    expect(t.label).toBe("Stundensatz Arbeitsdienst");
    expect(t.art).toBe("euro");
    expect(t.beschreibung).not.toContain("Platzhalter");
  });

  it("fällt für unbekannte Schlüssel auf die Datenbank zurück", () => {
    expect(einstellungsText({ key: "neu.etwas", label: "Etwas", description: "Text" })).toEqual({
      label: "Etwas",
      beschreibung: "Text",
      art: "einfach",
    });
    expect(einstellungsText({ key: "neu.betrag_cents", label: null, description: null }).art).toBe("euro");
  });

  it("zeigt keinen Roh-Schlüssel und keine Cent-Angabe in Label oder Beschreibung", () => {
    for (const key of [
      "booking.display_minutes",
      "booking.guest_fee_cents",
      "sepa.mandate_text_version",
      "sepa.creditor_id",
      "notifications.mail_kinds",
    ]) {
      const t = einstellungsText({ key, label: null, description: null });
      expect(`${t.label} ${t.beschreibung}`).not.toMatch(/[a-z_]+\.[a-z_]+|Cent|Backend|Kommagetrennt/);
    }
  });
});

describe("Euro-Eingabe", () => {
  it("zeigt Cent als Euro", () => {
    expect(centsAlsEingabe(1500)).toBe("15,00");
    expect(centsAlsEingabe(5)).toBe("0,05");
    expect(centsAlsEingabe(0)).toBe("0,00");
    expect(centsAlsEingabe("1250")).toBe("12,50");
    expect(centsAlsEingabe(null)).toBe("0,00");
    expect(centsAlsEingabe("x")).toBe("");
  });

  it("rechnet die Eingabe in Cent um", () => {
    expect(euroEingabeAlsCents("15,00")).toBe("1500");
    expect(euroEingabeAlsCents("12,5")).toBe("1250");
    expect(euroEingabeAlsCents("7")).toBe("700");
    expect(euroEingabeAlsCents(" 0,99 ")).toBe("99");
    expect(euroEingabeAlsCents("15,001")).toBeNull();
    expect(euroEingabeAlsCents("abc")).toBeNull();
    expect(euroEingabeAlsCents("")).toBeNull();
  });
});

describe("Listen", () => {
  it("liest die Kommaliste", () => {
    expect(listeAusWert("a, b,,c ")).toEqual(["a", "b", "c"]);
    expect(listeAusWert("")).toEqual([]);
    expect(listeAusWert(3)).toEqual([]);
  });

  it("bietet alle bekannten Arten und behält unbekannte", () => {
    const optionen = listenOptionen("booking_cancelled,neue_art");
    expect(optionen.slice(0, BENACHRICHTIGUNGS_ARTEN.length)).toEqual(BENACHRICHTIGUNGS_ARTEN);
    expect(optionen.at(-1)).toEqual({ kind: "neue_art", label: "neue_art" });
  });

  it("hat für jede Art einen deutschen Namen", () => {
    for (const a of BENACHRICHTIGUNGS_ARTEN) expect(a.label).not.toMatch(/_/);
  });
});
