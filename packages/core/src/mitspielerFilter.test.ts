import { describe, expect, it } from "vitest";
import {
  KEIN_FILTER,
  istEingeschraenkt,
  lkNormalisieren,
  lkZahl,
  partnerFilterAusEingabe,
  partnerFilterAusZeile,
  partnerFilterText,
} from "./mitspielerFilter";
import { translateDbError } from "./errors";

describe("lkZahl", () => {
  it("liest die üblichen Schreibweisen", () => {
    expect(lkZahl("LK12,3")).toBe(12.3);
    expect(lkZahl("12.3")).toBe(12.3);
    expect(lkZahl("12")).toBe(12);
    expect(lkZahl(" lk 3,0 ")).toBe(3);
    expect(lkZahl("LK 25")).toBe(25);
    expect(lkZahl("1")).toBe(1);
  });

  it("gibt null für Unlesbares und außerhalb 1–25", () => {
    expect(lkZahl(null)).toBeNull();
    expect(lkZahl("")).toBeNull();
    expect(lkZahl("gut")).toBeNull();
    expect(lkZahl("0,9")).toBeNull();
    expect(lkZahl("25,1")).toBeNull();
    expect(lkZahl("12,34")).toBeNull();
    expect(lkZahl("-3")).toBeNull();
  });
});

describe("lkNormalisieren", () => {
  it("speichert einheitlich als LKxx,x", () => {
    expect(lkNormalisieren("14,5")).toEqual({ ok: true, wert: "LK14,5" });
    expect(lkNormalisieren("LK 14.5")).toEqual({ ok: true, wert: "LK14,5" });
    expect(lkNormalisieren("7")).toEqual({ ok: true, wert: "LK7,0" });
  });

  it("lässt leer zu", () => {
    expect(lkNormalisieren("  ")).toEqual({ ok: true, wert: null });
    expect(lkNormalisieren(null)).toEqual({ ok: true, wert: null });
  });

  it("weist ungültige Eingaben mit deutschem Text ab", () => {
    const e = lkNormalisieren("30");
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.meldung).toMatch(/zwischen 1 und 25/);
    expect(lkNormalisieren("14,55").ok).toBe(false);
    expect(lkNormalisieren("Anfänger").ok).toBe(false);
  });
});

describe("partnerFilterAusEingabe", () => {
  it("1 bis 25 und alle heißt: keine Einschränkung", () => {
    expect(partnerFilterAusEingabe("1", "25", "")).toEqual({ ok: true, filter: KEIN_FILTER });
    expect(partnerFilterAusEingabe("", "", null)).toEqual({ ok: true, filter: KEIN_FILTER });
  });

  it("übernimmt Grenzen und Geschlecht", () => {
    expect(partnerFilterAusEingabe("10", "16,5", "male")).toEqual({
      ok: true,
      filter: { lkVon: 10, lkBis: 16.5, fuer: "male" },
    });
    expect(partnerFilterAusEingabe("1", "16", "female")).toEqual({
      ok: true,
      filter: { lkVon: null, lkBis: 16, fuer: "female" },
    });
  });

  it("lehnt von > bis und Unlesbares ab", () => {
    expect(partnerFilterAusEingabe("16", "10", null).ok).toBe(false);
    expect(partnerFilterAusEingabe("0", "10", null).ok).toBe(false);
    expect(partnerFilterAusEingabe("5", "26", null).ok).toBe(false);
  });

  it("ignoriert unbekannte Werte für „für wen“", () => {
    const e = partnerFilterAusEingabe("", "", "diverse");
    expect(e.ok && e.filter.fuer).toBeNull();
  });
});

describe("partnerFilterAusZeile", () => {
  it("liest Zahl, Text und null", () => {
    expect(partnerFilterAusZeile({ lk_von: 10, lk_bis: "16.0", fuer: "male" })).toEqual({
      lkVon: 10, lkBis: 16, fuer: "male",
    });
    expect(partnerFilterAusZeile({})).toEqual(KEIN_FILTER);
    expect(partnerFilterAusZeile({ lk_von: null, lk_bis: null, fuer: null })).toEqual(KEIN_FILTER);
  });

  it("behandelt die Ränder 1 und 25 als offen", () => {
    expect(partnerFilterAusZeile({ lk_von: 1, lk_bis: 25 })).toEqual(KEIN_FILTER);
    expect(istEingeschraenkt(partnerFilterAusZeile({ lk_von: 1, lk_bis: 25 }))).toBe(false);
  });
});

describe("partnerFilterText", () => {
  it("beschriftet wie im Vertrag", () => {
    expect(partnerFilterText({ lkVon: 10, lkBis: 16, fuer: "male" })).toBe("LK 10–16 · Herren");
    expect(partnerFilterText({ lkVon: null, lkBis: 16, fuer: null })).toBe("bis LK 16");
    expect(partnerFilterText({ lkVon: 10, lkBis: null, fuer: null })).toBe("ab LK 10");
    expect(partnerFilterText({ lkVon: null, lkBis: null, fuer: "female" })).toBe("Damen");
    expect(partnerFilterText({ lkVon: 8.5, lkBis: 12.5, fuer: null })).toBe("LK 8,5–12,5");
    expect(partnerFilterText({ lkVon: 12, lkBis: 12, fuer: null })).toBe("LK 12");
  });

  it("ohne Einschränkung kein Zusatz", () => {
    expect(partnerFilterText(KEIN_FILTER)).toBeNull();
  });
});

describe("join_booking lehnt ab", () => {
  it("die Meldung aus der Datenbank kommt unverändert an", () => {
    expect(
      translateDbError({
        code: "23514",
        message: "Diese Suche richtet sich an andere Spieler (LK oder Damen/Herren).",
      }),
    ).toBe("Diese Suche richtet sich an andere Spieler (LK oder Damen/Herren).");
  });
});
