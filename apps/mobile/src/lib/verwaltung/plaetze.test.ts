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
  aendereSerie, beendeSerie, legeSerieAn, normZeit, pruefeSerie, sperre, vorschauSerie, zustandJetzt,
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

  it("zaehlt den Beginn mit, das Ende nicht", () => {
    const sperrung = {
      court_id: "a", kind: "blocking" as const, series_id: null,
      starts_at: "2026-09-29T09:00:00Z", ends_at: "2026-09-29T10:00:00Z",
    };
    expect(zustandJetzt([sperrung], Date.parse("2026-09-29T09:00:00Z"))).toEqual({
      a: { art: "gesperrt", text: "gesperrt bis 12:00" },
    });
    expect(zustandJetzt([sperrung], Date.parse("2026-09-29T10:00:00Z"))).toEqual({});
  });

  it("nimmt je Platz den ersten laufenden Eintrag", () => {
    const jetzt = Date.parse("2026-12-01T10:00:00Z");
    const z = zustandJetzt(
      [
        { court_id: "a", kind: "blocking", series_id: "s", starts_at: "2026-12-01T09:00:00Z", ends_at: "2026-12-01T11:00:00Z" },
        { court_id: "a", kind: "blocking", series_id: null, starts_at: "2026-12-01T09:30:00Z", ends_at: "2026-12-01T15:00:00Z" },
      ],
      jetzt,
    );
    // Im Winter liegt Berlin nur eine Stunde vor UTC
    expect(z).toEqual({ a: { art: "serie", text: "Serie bis 12:00" } });
  });

  it("ist ohne Eintraege leer", () => {
    expect(zustandJetzt([])).toEqual({});
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
