import { describe, expect, it } from "vitest";
import { LK_FELD_FEHLER } from "./mitspielerFilter";
import { NULIGA_ID_FEHLER, tennisEingabePruefen, tennisKurzfassung } from "./tennisAngaben";

describe("tennisEingabePruefen", () => {
  it("normalisiert die LK und schickt immer alle drei Werte", () => {
    expect(tennisEingabePruefen({ tennis_lk: "lk 14.5", nuliga_id: " 12345678 ", mannschaft_interesse: true })).toEqual({
      ok: true,
      args: { p_tennis_lk: "LK14,5", p_nuliga_id: "12345678", p_mannschaft_interesse: true },
    });
  });

  it("leere Felder werden leerer Text, das Interesse bleibt mitgeschickt", () => {
    expect(tennisEingabePruefen({ tennis_lk: "  ", nuliga_id: null, mannschaft_interesse: false })).toEqual({
      ok: true,
      args: { p_tennis_lk: "", p_nuliga_id: "", p_mannschaft_interesse: false },
    });
  });

  it("weist eine ungültige LK mit dem Text des Feldes ab", () => {
    expect(tennisEingabePruefen({ tennis_lk: "30", nuliga_id: "", mannschaft_interesse: false })).toEqual({
      ok: false,
      meldung: LK_FELD_FEHLER,
    });
    expect(tennisEingabePruefen({ tennis_lk: "14,55", nuliga_id: "", mannschaft_interesse: false }).ok).toBe(false);
  });

  it("weist eine zu lange nuLiga-ID ab", () => {
    expect(tennisEingabePruefen({ tennis_lk: "", nuliga_id: "x".repeat(40), mannschaft_interesse: false }).ok).toBe(true);
    expect(tennisEingabePruefen({ tennis_lk: "", nuliga_id: "x".repeat(41), mannschaft_interesse: false })).toEqual({
      ok: false,
      meldung: NULIGA_ID_FEHLER,
    });
  });
});

describe("tennisKurzfassung", () => {
  it("nennt, was gesetzt ist", () => {
    expect(tennisKurzfassung({ tennis_lk: "LK14,5", nuliga_id: "12345678", mannschaft_interesse: true })).toBe(
      "LK14,5 · nuLiga 12345678 · Interesse an Mannschaft",
    );
    expect(tennisKurzfassung({ tennis_lk: "LK7,0", nuliga_id: null, mannschaft_interesse: false })).toBe("LK7,0");
  });

  it("sagt, wenn nichts da ist", () => {
    expect(tennisKurzfassung({ tennis_lk: null, nuliga_id: " ", mannschaft_interesse: false })).toBe("Noch keine Angaben");
    expect(tennisKurzfassung(null)).toBe("Noch keine Angaben");
  });
});
