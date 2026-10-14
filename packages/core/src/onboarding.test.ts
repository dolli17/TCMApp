import { describe, expect, it } from "vitest";
import {
  istMinderjaehrig,
  mandatstext,
  naechsterPflichtschritt,
  onboardingSchritte,
  type OnboardingSchrittKey,
} from "./onboarding";

const ALLES_OFFEN: Record<OnboardingSchrittKey, boolean> = {
  passwort: true,
  stammdaten: false,
  rechtliches: false,
  erziehungsberechtigte: false,
  notfallkontakt: false,
  sepa: false,
  einwilligungen: false,
  tennis: false,
  einstellungen: false,
};

describe("onboardingSchritte", () => {
  it("Erwachsene: ohne Erziehungsberechtigte, Notfallkontakt optional", () => {
    const s = onboardingSchritte({ minderjaehrig: false, status: ALLES_OFFEN });
    expect(s.map((x) => x.key)).toEqual([
      "passwort", "stammdaten", "rechtliches", "notfallkontakt", "sepa",
      "einwilligungen", "tennis", "einstellungen",
    ]);
    expect(s.filter((x) => x.pflicht).map((x) => x.key)).toEqual([
      "passwort", "stammdaten", "rechtliches", "sepa",
    ]);
  });

  it("Minderjährige: Erziehungsberechtigte und Notfallkontakt sind Pflicht", () => {
    const s = onboardingSchritte({ minderjaehrig: true, status: ALLES_OFFEN });
    expect(s.filter((x) => x.pflicht).map((x) => x.key)).toEqual([
      "passwort", "stammdaten", "rechtliches", "erziehungsberechtigte", "notfallkontakt", "sepa",
    ]);
  });

  it("übernimmt den Erledigt-Status aus der Datenbank", () => {
    const s = onboardingSchritte({ minderjaehrig: false, status: { ...ALLES_OFFEN, stammdaten: true } });
    expect(s.find((x) => x.key === "stammdaten")?.erledigt).toBe(true);
    expect(s.find((x) => x.key === "sepa")?.erledigt).toBe(false);
  });
});

describe("naechsterPflichtschritt", () => {
  it("liefert den ersten offenen Pflichtschritt", () => {
    expect(naechsterPflichtschritt({ minderjaehrig: false, status: ALLES_OFFEN })).toBe("stammdaten");
  });

  it("überspringt optionale Schritte", () => {
    const status = { ...ALLES_OFFEN, stammdaten: true, rechtliches: true };
    expect(naechsterPflichtschritt({ minderjaehrig: false, status })).toBe("sepa");
    expect(naechsterPflichtschritt({ minderjaehrig: true, status })).toBe("erziehungsberechtigte");
  });

  it("null, wenn alles Pflichtige erledigt ist", () => {
    const status = { ...ALLES_OFFEN, stammdaten: true, rechtliches: true, sepa: true };
    expect(naechsterPflichtschritt({ minderjaehrig: false, status })).toBeNull();
  });
});

describe("istMinderjaehrig", () => {
  it("bis zum Tag vor dem 18. Geburtstag", () => {
    expect(istMinderjaehrig("2008-10-15", "2026-10-14")).toBe(true);
    expect(istMinderjaehrig("2008-10-14", "2026-10-14")).toBe(false);
    expect(istMinderjaehrig("2008-10-13", "2026-10-14")).toBe(false);
    expect(istMinderjaehrig("2014-01-01", "2026-10-14")).toBe(true);
    expect(istMinderjaehrig("1990-06-15", "2026-10-14")).toBe(false);
  });

  it("29. Februar: volljährig am 1. März eines Nicht-Schaltjahres", () => {
    expect(istMinderjaehrig("2008-02-29", "2026-02-28")).toBe(true);
    expect(istMinderjaehrig("2008-02-29", "2026-03-01")).toBe(false);
  });

  it("ohne Geburtsdatum nicht minderjährig", () => {
    expect(istMinderjaehrig(null, "2026-10-14")).toBe(false);
    expect(istMinderjaehrig("", "2026-10-14")).toBe(false);
  });

  it("nimmt auch Date-Objekte", () => {
    expect(istMinderjaehrig(new Date(2015, 4, 1), new Date(2026, 9, 14))).toBe(true);
  });
});

describe("mandatstext", () => {
  // Derselbe Text steht als Erwartung in supabase/tests/23_onboarding.sql
  // (private.sepa_mandatstext). Ändert sich einer, muss der andere mit.
  it("ist der Standardtext einer SEPA-Basislastschrift", () => {
    expect(
      mandatstext({ glaeubigerName: "TC Muckensturm e.V.", glaeubigerId: "DE98ZZZ09999999999", referenz: "TCM-0001-2026" }),
    ).toBe(
      "SEPA-Lastschriftmandat (SEPA-Basislastschrift)\n" +
        "\n" +
        "Zahlungsempfänger: TC Muckensturm e.V.\n" +
        "Gläubiger-Identifikationsnummer: DE98ZZZ09999999999\n" +
        "Mandatsreferenz: TCM-0001-2026\n" +
        "Zahlungsart: Wiederkehrende Zahlungen\n" +
        "\n" +
        "Ich ermächtige TC Muckensturm e.V., Zahlungen von meinem Konto mittels Lastschrift einzuziehen. " +
        "Zugleich weise ich mein Kreditinstitut an, die von TC Muckensturm e.V. auf mein Konto gezogenen Lastschriften einzulösen.\n" +
        "\n" +
        "Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages verlangen. " +
        "Es gelten dabei die mit meinem Kreditinstitut vereinbarten Bedingungen.",
    );
  });
});
