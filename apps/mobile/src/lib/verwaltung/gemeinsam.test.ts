import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let einstellungen: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve(einstellungen) }),
    }),
  },
}));

const {
  datumZuDeutsch,
  deutschZuDatum,
  deutschZuIso,
  heuteInBerlin,
  isoZuDeutsch,
  ladeEinstellungen,
  oderWirf,
} = await import("./gemeinsam");

describe("oderWirf", () => {
  it("gibt die Daten ohne Fehler", () => {
    expect(oderWirf({ data: [1], error: null })).toEqual([1]);
  });

  it("wirft einen uebersetzten Satz statt der Rohmeldung", () => {
    expect(() =>
      oderWirf({ data: null, error: { message: "permission denied for table x", code: "42501" } }),
    ).toThrow("Dafür fehlt dir die Berechtigung.");
  });
});

describe("heuteInBerlin", () => {
  afterEach(() => vi.useRealTimers());

  it("nimmt den Tag in Berlin, nicht den des Geraets", () => {
    vi.useFakeTimers();
    // 23:30 UTC am 31.12. ist in Berlin schon Neujahr.
    vi.setSystemTime(new Date("2026-12-31T23:30:00Z"));
    expect(heuteInBerlin()).toBe("2027-01-01");
    // Sommerzeit: 22:30 UTC ist 00:30 MESZ.
    vi.setSystemTime(new Date("2026-07-14T22:30:00Z"));
    expect(heuteInBerlin()).toBe("2026-07-15");
  });
});

describe("isoZuDeutsch", () => {
  it("dreht ISO ins deutsche Format", () => {
    expect(isoZuDeutsch("2026-09-29")).toBe("29.09.2026");
    expect(isoZuDeutsch("2026-09-29T10:00:00Z")).toBe("29.09.2026");
  });

  it("laesst Leeres leer und Unbekanntes stehen", () => {
    expect(isoZuDeutsch(null)).toBe("");
    expect(isoZuDeutsch(undefined)).toBe("");
    expect(isoZuDeutsch("")).toBe("");
    expect(isoZuDeutsch("morgen")).toBe("morgen");
  });
});

describe("deutschZuIso", () => {
  it("versteht deutsche Schreibweisen", () => {
    expect(deutschZuIso("29.09.2026")).toBe("2026-09-29");
    expect(deutschZuIso(" 1.2.26 ")).toBe("2026-02-01");
    expect(deutschZuIso("2026-09-29")).toBe("2026-09-29");
  });

  it("lehnt unmoegliche Tage ab", () => {
    expect(deutschZuIso("31.02.2026")).toBeNull();
    expect(deutschZuIso("29.02.2026")).toBeNull();
    expect(deutschZuIso("29.02.2028")).toBe("2028-02-29");
    expect(deutschZuIso("0.1.2026")).toBeNull();
    expect(deutschZuIso("1.13.2026")).toBeNull();
  });

  it("lehnt anderes ab", () => {
    expect(deutschZuIso("")).toBeNull();
    expect(deutschZuIso("29/09/2026")).toBeNull();
    expect(deutschZuIso("29.09.026")).toBeNull();
  });
});

describe("ladeEinstellungen", () => {
  const alle = [
    { key: "buchung.max", value: 2 },
    { key: "buchung.vorlauf", value: 7 },
    { key: "mail.absender", value: "x" },
  ];

  beforeEach(() => {
    einstellungen = { data: alle, error: null };
  });

  it("gibt ohne Praefix alles", async () => {
    expect(await ladeEinstellungen()).toEqual(alle);
  });

  it("filtert nach Praefixen", async () => {
    expect((await ladeEinstellungen(["buchung."])).map((e) => e.key)).toEqual([
      "buchung.max",
      "buchung.vorlauf",
    ]);
    expect((await ladeEinstellungen(["mail.", "buchung.max"])).map((e) => e.key)).toEqual([
      "buchung.max",
      "mail.absender",
    ]);
  });

  it("wirft bei Fehlern einen Satz", async () => {
    einstellungen = { data: null, error: { message: "permission denied", code: "42501" } };
    await expect(ladeEinstellungen()).rejects.toThrow("Dafür fehlt dir die Berechtigung.");
  });
});

describe("Datum zwischen Waehler und Formular", () => {
  it("lokaler Tag als TT.MM.JJJJ", () => {
    expect(datumZuDeutsch(new Date(1934, 2, 5))).toBe("05.03.1934");
    expect(datumZuDeutsch(new Date(2014, 11, 31, 23, 59))).toBe("31.12.2014");
  });

  it("zurueck zum lokalen Datum, ungueltig gibt null", () => {
    const d = deutschZuDatum("05.03.1934")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([1934, 2, 5]);
    expect(deutschZuDatum("31.02.2014")).toBeNull();
    expect(deutschZuDatum("")).toBeNull();
  });

  it("Hin und zurueck ergibt dasselbe ISO-Datum", () => {
    expect(deutschZuIso(datumZuDeutsch(deutschZuDatum("29.02.2000")!))).toBe("2000-02-29");
  });
});
