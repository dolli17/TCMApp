/**
 * Plaetze & Serien der Verwaltung gegen einen nachgebildeten Client:
 * richtige RPCs mit richtigen Parametern, Zeit- und Datumsumwandlung vor dem
 * Absenden, Meldungen wortgleich mit dem Web.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
  istKonfiguriert: () => true,
}));

const {
  aendereSerie, beendeSerie, legeSerieAn, normZeit, pruefeSerie, schaltePlatz, sortierePlaetze,
  speichereBuchungsart, speicherePlatz, sperre, verschoben, vorschauSerie, zustandJetzt,
} = await import("./plaetze");

const PLATZ = "11111111-1111-4111-8111-111111111111";

const SERIE = {
  courtId: PLATZ,
  bookingTypeCode: "training",
  weekday: 2,
  startTime: "18:30",
  endTime: "20:00",
  validFrom: "01.10.2026",
  validTo: "31.10.2026",
  title: "Training Herren",
};

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
});

describe("normZeit", () => {
  it("nimmt kurze Stunden und Punkt an", () => {
    expect(normZeit("8:00")).toBe("08:00");
    expect(normZeit(" 18.30 ")).toBe("18:30");
    expect(normZeit("24:00")).toBe("24:00");
  });
  it("weist Unsinn ab", () => {
    expect(normZeit("25:00")).toBeNull();
    expect(normZeit("8:60")).toBeNull();
    expect(normZeit("acht")).toBeNull();
  });
});

describe("verschoben", () => {
  it("tauscht mit dem Nachbarn und bleibt an den Raendern stehen", () => {
    expect(verschoben(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(verschoben(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(verschoben(["a", "b"], 0, -1)).toBeNull();
    expect(verschoben(["a", "b"], 1, 1)).toBeNull();
  });
});

describe("zustandJetzt", () => {
  it("nennt laufende Sperrung und Serie, nicht aber Buchungen", () => {
    const jetzt = Date.parse("2026-09-29T10:00:00Z");
    const z = zustandJetzt(
      [
        { court_id: "a", kind: "blocking", series_id: null, starts_at: "2026-09-29T09:00:00Z", ends_at: "2026-09-29T12:00:00Z" },
        { court_id: "b", kind: "blocking", series_id: "s", starts_at: "2026-09-29T09:00:00Z", ends_at: "2026-09-29T11:00:00Z" },
        { court_id: "c", kind: "booking", starts_at: "2026-09-29T09:00:00Z", ends_at: "2026-09-29T11:00:00Z" },
        { court_id: "d", kind: "blocking", starts_at: "2026-09-29T12:00:00Z", ends_at: "2026-09-29T13:00:00Z" },
      ],
      jetzt,
    );
    // 12:00 UTC ist 14:00 in Berlin (Sommerzeit)
    expect(z).toEqual({
      a: { art: "gesperrt", text: "gesperrt bis 14:00" },
      b: { art: "serie", text: "Serie bis 13:00" },
    });
  });
});

describe("Plaetze", () => {
  it("legt an mit null als Id", async () => {
    const e = await speicherePlatz({ id: null, name: "Platz 7", kurzname: "P7", zusatz: "" });
    expect(rpc).toHaveBeenCalledWith("upsert_court", {
      p_id: null, p_name: "Platz 7", p_short_name: "P7", p_subline: "", p_position: undefined,
    });
    expect(e).toEqual({ ok: true, meldung: "Platz angelegt." });
  });

  it("warnt beim Stilllegen vor offenen Buchungen", async () => {
    rpc.mockResolvedValue({ data: 3, error: null });
    const e = await schaltePlatz(PLATZ, false);
    expect(rpc).toHaveBeenCalledWith("set_court_active", { p_id: PLATZ, p_active: false });
    expect(e.meldung).toBe(
      "Platz stillgelegt. Achtung: 3 künftige Buchungen liegen noch darauf – bitte sperren und die Betroffenen informieren.",
    );
  });

  it("sortiert", async () => {
    const e = await sortierePlaetze(["b", "a"]);
    expect(rpc).toHaveBeenCalledWith("reorder_courts", { p_ids: ["b", "a"] });
    expect(e.meldung).toBe("Reihenfolge gespeichert.");
  });

  it("uebersetzt Fehler", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Nur für Admins.", code: "42501" } });
    const e = await sortierePlaetze([]);
    expect(e.ok).toBe(false);
    expect(e.meldung).not.toBe("");
  });
});

describe("speichereBuchungsart", () => {
  const ART = {
    code: " doppel ", name: "Doppel", art: "booking" as const, dauer: "90", minSpieler: "4", maxSpieler: "4",
    brauchtPartner: true, zaehltAufKontingent: false, aktiv: true,
  };

  it("wandelt die getippten Zahlen", async () => {
    await speichereBuchungsart(ART);
    expect(rpc).toHaveBeenCalledWith("upsert_booking_type", {
      p_code: "doppel", p_name: "Doppel", p_applies_to: "booking", p_duration_minutes: 90,
      p_min_players: 4, p_max_players: 4, p_requires_partner: true, p_counts_towards_quota: false,
      p_active: true, p_sort_order: undefined,
    });
  });

  it("weist unsinnige Dauer ab, ohne zu senden", async () => {
    expect((await speichereBuchungsart({ ...ART, dauer: "10" })).ok).toBe(false);
    expect((await speichereBuchungsart({ ...ART, minSpieler: "zwei" })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("sperre", () => {
  const SPERRE = {
    platzIds: [PLATZ], tag: "11.08.2026", von: "8:00", bis: "21:00", artCode: "platzpflege",
    grund: "Regen", verdraengen: false,
  };

  it("rechnet die Zeiten in Berliner Zeit", async () => {
    rpc.mockResolvedValue({ data: [{ created_count: 1, displaced_count: 0 }], error: null });
    const e = await sperre(SPERRE);
    expect(rpc).toHaveBeenCalledWith("create_blocking", {
      p_court_ids: [PLATZ],
      p_von: "2026-08-11T06:00:00.000Z",
      p_bis: "2026-08-11T19:00:00.000Z",
      p_type_code: "platzpflege",
      p_title: "Regen",
      p_force: false,
    });
    expect(e).toEqual({ ok: true, meldung: "1 Platz gesperrt." });
  });

  it("liest die Zahl der Kollisionen aus dem Fehler", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "3 Buchungen liegen im gewählten Zeitraum.", code: "P0001" } });
    const e = await sperre(SPERRE);
    expect(e.ok).toBe(false);
    expect(e.kollisionen).toBe(3);
  });

  it("meldet Verdraengte", async () => {
    rpc.mockResolvedValue({ data: [{ created_count: 2, displaced_count: 4 }], error: null });
    const e = await sperre({ ...SPERRE, verdraengen: true });
    expect(e.meldung).toBe("2 Plätze gesperrt, 4 Buchungen verdrängt. Die Betroffenen wurden benachrichtigt.");
  });

  it("weist unlesbares Datum und Uhrzeit ab", async () => {
    expect((await sperre({ ...SPERRE, tag: "31.02.2026" })).meldung).toBe("Das Datum bitte als TT.MM.JJJJ angeben.");
    expect((await sperre({ ...SPERRE, von: "8 Uhr" })).meldung).toBe("Uhrzeit als HH:MM angeben.");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("Serien", () => {
  it("prueft mit dem Schema des Webs", () => {
    expect(pruefeSerie({ ...SERIE, endTime: "17:00" })).toEqual({
      ok: false, meldung: "Die Endzeit muss nach der Startzeit liegen.",
    });
    expect(pruefeSerie({ ...SERIE, validTo: "01.09.2026" })).toEqual({
      ok: false, meldung: "Das Enddatum darf nicht vor dem Startdatum liegen.",
    });
    expect(pruefeSerie({ ...SERIE, title: " " }).ok).toBe(false);
  });

  it("Vorschau mit ISO-Daten", async () => {
    rpc.mockResolvedValue({ data: [{ starts_at: "x", ends_at: "y", conflict_booking_id: null }], error: null });
    const r = await vorschauSerie({ ...SERIE, startTime: "9:00", endTime: "10:30" });
    expect(rpc).toHaveBeenCalledWith("preview_series", {
      p_court_id: PLATZ, p_weekday: 2, p_start_time: "09:00", p_end_time: "10:30",
      p_valid_from: "2026-10-01", p_valid_to: "2026-10-31",
    });
    expect(r.ok).toBe(true);
    expect(r.termine).toHaveLength(1);
  });

  it("legt an und nennt Termine und Verdraengte", async () => {
    rpc.mockResolvedValue({ data: [{ created_count: 5, displaced_count: 2, series_id: "s" }], error: null });
    const e = await legeSerieAn({ ...SERIE, verdraengen: true });
    expect(rpc).toHaveBeenCalledWith("create_series", expect.objectContaining({
      p_booking_type_code: "training", p_title: "Training Herren", p_displace: true,
    }));
    expect(e.meldung).toBe("Serie angelegt: 5 Termine, 2 bestehende Buchungen verdrängt und die Betroffenen benachrichtigt.");
  });

  it("aendert und liest Kollisionen aus dem Fehler", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "2 Termine kollidieren mit Buchungen.", code: "P0001" } });
    const e = await aendereSerie({
      seriesId: "s", startTime: "18:00", endTime: "19:30", titel: "T", validTo: "", verdraengen: false,
    });
    expect(rpc).toHaveBeenCalledWith("update_series", {
      p_series_id: "s", p_start_time: "18:00", p_end_time: "19:30", p_title: "T", p_valid_to: undefined, p_displace: false,
    });
    expect(e.kollisionen).toBe(2);
  });

  it("meldet die neue Lage", async () => {
    rpc.mockResolvedValue({ data: [{ created_count: 1, displaced_count: 0, cancelled_count: 1 }], error: null });
    const e = await aendereSerie({
      seriesId: "s", startTime: "18:00", endTime: "19:30", titel: "T", validTo: "31.12.2026", verdraengen: false,
    });
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_valid_to: "2026-12-31" });
    expect(e.meldung).toBe("Serie geändert: 1 künftige Termin steht in der neuen Lage.");
  });

  it("beendet", async () => {
    rpc.mockResolvedValue({ data: 4, error: null });
    const e = await beendeSerie("s");
    expect(rpc).toHaveBeenCalledWith("end_series", { p_series_id: "s", p_ab: undefined });
    expect(e.meldung).toBe("Serie beendet. 4 künftige Termine wurden abgesagt.");
  });
});
