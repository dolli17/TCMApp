import { describe, expect, it } from "vitest";
import {
  KONTOLOESCHUNG_NACHRICHT_MAX,
  KONTOLOESCHUNG_TEXT,
  kontoloeschungMeldung,
  kontoloeschungPruefen,
} from "./kontoloeschung";

describe("kontoloeschungPruefen", () => {
  it("leere oder fehlende Nachricht wird null", () => {
    expect(kontoloeschungPruefen("")).toEqual({ ok: true, nachricht: null });
    expect(kontoloeschungPruefen("   ")).toEqual({ ok: true, nachricht: null });
    expect(kontoloeschungPruefen(undefined)).toEqual({ ok: true, nachricht: null });
  });

  it("schneidet Leerraum ab", () => {
    expect(kontoloeschungPruefen("  Ich ziehe weg. ")).toEqual({ ok: true, nachricht: "Ich ziehe weg." });
  });

  it("erlaubt genau die Grenze und lehnt darüber ab", () => {
    expect(kontoloeschungPruefen("a".repeat(KONTOLOESCHUNG_NACHRICHT_MAX)).ok).toBe(true);
    const zuLang = kontoloeschungPruefen("a".repeat(KONTOLOESCHUNG_NACHRICHT_MAX + 1));
    expect(zuLang).toEqual({ ok: false, meldung: "Die Nachricht ist zu lang (höchstens 1000 Zeichen)." });
  });
});

describe("kontoloeschungMeldung", () => {
  it("unterscheidet neuen und schon vorliegenden Antrag", () => {
    expect(kontoloeschungMeldung(true)).toBe(KONTOLOESCHUNG_TEXT.eingegangen);
    expect(kontoloeschungMeldung(false)).toBe("Dein Antrag liegt schon vor. Der Vorstand kümmert sich darum.");
  });
});
