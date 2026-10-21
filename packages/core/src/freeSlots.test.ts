import { describe, expect, it } from "vitest";
import { berlinTime, minutesToTime, timeToMinutes } from "./booking";
import type { CourtSlot } from "./courtStatus";
import { freeGaps, freeSlotsOfDay, occupancyLabel, startInGap } from "./freeSlots";

const TAG = "2026-09-28";
const um = (hhmm: string, tag = TAG) => berlinTime(tag, timeToMinutes(hhmm));

const belegt = (court: string, von: string, bis: string, mehr: Partial<CourtSlot> = {}): CourtSlot => ({
  court_id: court,
  starts_at: um(von).toISOString(),
  ends_at: um(bis).toISOString(),
  kind: "booking",
  type_name: "Doppel",
  ...mehr,
});

function zeilen(occupied: CourtSlot[], jetzt: Date, tag = TAG) {
  return freeSlotsOfDay({
    day: tag,
    courtIds: ["p1", "p2", "p3"],
    openingMinutes: timeToMinutes("08:00"),
    closingMinutes: timeToMinutes("21:00"),
    slotMinutes: 30,
    durationMinutes: 60,
    occupied,
    now: jetzt,
  });
}

const uhrzeiten = (z: ReturnType<typeof zeilen>) => z.map((r) => minutesToTime(r.minute));

describe("freeSlotsOfDay", () => {
  it("heute: naechste Halbstunde, danach volle Stunden bis Schluss minus Dauer", () => {
    expect(uhrzeiten(zeilen([], um("14:10")))).toEqual([
      "14:30", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00",
    ]);
  });

  it("heute zur vollen Stunde kommt keine Zeit doppelt", () => {
    expect(uhrzeiten(zeilen([], um("16:00"))).slice(0, 2)).toEqual(["16:00", "17:00"]);
  });

  it("am letzten Vorlauftag ist nach der Grenze nichts frei", () => {
    const z = freeSlotsOfDay({
      day: TAG, courtIds: ["p1"], openingMinutes: timeToMinutes("08:00"), closingMinutes: timeToMinutes("21:00"),
      slotMinutes: 30, durationMinutes: 60, occupied: [], leadDays: 7, now: um("14:10", "2026-09-21"),
    });
    expect(z.filter((r) => r.free > 0).map((r) => minutesToTime(r.minute))).toEqual([
      "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00",
    ]);
  });

  it("vor der Oeffnung und an kommenden Tagen ab der Oeffnung", () => {
    expect(uhrzeiten(zeilen([], um("06:00")))[0]).toBe("08:00");
    const morgen = zeilen([], um("14:10"), "2026-09-29");
    expect(uhrzeiten(morgen)[0]).toBe("08:00");
    expect(morgen).toHaveLength(13);
  });

  it("ein vergangener Tag und ein Abend nach der letzten Startzeit haben keine Zeilen", () => {
    expect(zeilen([], um("14:10"), "2026-09-27")).toEqual([]);
    expect(zeilen([], um("20:10"))).toEqual([]);
  });

  it("Status je Platz in der Reihenfolge der Plaetze und die Zahl der freien", () => {
    const [z] = zeilen(
      [
        belegt("p1", "17:00", "18:00", { is_own: true }),
        belegt("p2", "17:00", "18:00", { partner_wanted: true, frei: 1 }),
      ],
      um("16:10"),
    ).filter((r) => r.minute === timeToMinutes("17:00"));

    expect(z!.courts.map((c) => [c.courtId, c.status.art])).toEqual([
      ["p1", "eigen"], ["p2", "sucht"], ["p3", "frei"],
    ]);
    expect(z!.free).toBe(1);
  });

  it("frei heisst: eine volle Stunde passt - wie canStartAt", () => {
    const [z] = zeilen([belegt("p1", "17:30", "18:30")], um("16:10"))
      .filter((r) => r.minute === timeToMinutes("17:00"));
    expect(z!.courts[0]!.status.art).toBe("knapp");
    expect(z!.free).toBe(2);
  });
});

describe("freeGaps", () => {
  const luecken = (occupied: CourtSlot[], jetzt: Date) =>
    freeGaps({
      day: TAG, courtId: "p1", openingMinutes: timeToMinutes("08:00"), closingMinutes: timeToMinutes("21:00"),
      slotMinutes: 30, durationMinutes: 60, occupied, now: jetzt,
    }).map((l) => `${minutesToTime(l.from)}-${minutesToTime(l.until)}`);

  it("zwischen den Belegungen, heute ab der naechsten Startzeit", () => {
    expect(luecken([belegt("p1", "16:00", "17:00"), belegt("p1", "19:00", "20:00")], um("14:10"))).toEqual([
      "14:30-16:00", "17:00-19:00", "20:00-21:00",
    ]);
  });

  it("eine Luecke kuerzer als die Dauer faellt weg, andere Plaetze zaehlen nicht", () => {
    expect(
      luecken(
        [belegt("p1", "08:00", "16:00"), belegt("p1", "16:30", "21:00"), belegt("p2", "18:00", "19:00")],
        um("06:00"),
      ),
    ).toEqual([]);
  });

  it("am letzten Vorlauftag endet die Luecke an der Grenze", () => {
    // Jetzt 21.09. 14:10, sieben Tage Vorlauf: am 28.09. beginnt bis 14:10.
    const l = freeGaps({
      day: TAG, courtId: "p1", openingMinutes: timeToMinutes("08:00"), closingMinutes: timeToMinutes("21:00"),
      slotMinutes: 30, durationMinutes: 60, occupied: [], leadDays: 7, now: um("14:10", "2026-09-21"),
    });
    expect(l.map((g) => `${minutesToTime(g.from)}-${minutesToTime(g.until)}`)).toEqual(["08:00-15:00"]);
  });

  it("ein vergangener Tag hat keine Luecken", () => {
    expect(luecken([], um("08:00", "2026-09-29"))).toEqual([]);
  });
});

describe("startInGap", () => {
  const luecke = { courtId: "p1", from: timeToMinutes("15:00"), until: timeToMinutes("17:30") };
  it("rundet aufs Raster ab und laesst die volle Stunde Platz", () => {
    expect(minutesToTime(startInGap(luecke, timeToMinutes("15:50"), 30, 60))).toBe("15:30");
    expect(minutesToTime(startInGap(luecke, timeToMinutes("17:20"), 30, 60))).toBe("16:30");
    expect(minutesToTime(startInGap(luecke, timeToMinutes("14:00"), 30, 60))).toBe("15:00");
  });
});

describe("occupancyLabel", () => {
  it("beschriftet nach der Statustabelle", () => {
    const l = (mehr: Partial<CourtSlot> & { owner_name?: string }) =>
      occupancyLabel(belegt("p1", "17:00", "19:00", mehr));
    expect(l({ is_own: true, type_name: "Einzel" })).toMatchObject({ art: "eigen", title: "Du", detail: "Einzel" });
    expect(l({ owner_name: "Eva Muster" })).toMatchObject({
      art: "belegt", title: "Eva Muster", detail: "Doppel",
      spoken: "17:00 bis 19:00 Uhr, belegt von Eva Muster, Doppel",
    });
    expect(l({ partner_wanted: true, frei: 2 })).toMatchObject({ art: "sucht", title: "sucht 2" });
    expect(l({ kind: "blocking", series_id: "s", title: "Training" })).toMatchObject({
      art: "serie", title: "Training", detail: "bis 19:00",
    });
    expect(l({ kind: "blocking", type_name: "Platzpflege", title: "Regen" })).toMatchObject({
      art: "gesperrt", title: "Platzpflege", detail: "Regen",
      spoken: "17:00 bis 19:00 Uhr, gesperrt, Platzpflege, Regen",
    });
    // Der Grund ist freiwillig: dann steht nur die Kategorie im Block.
    expect(l({ kind: "blocking", type_name: "Verbandsspiel", title: null })).toMatchObject({
      art: "gesperrt", title: "Verbandsspiel", detail: "",
      spoken: "17:00 bis 19:00 Uhr, gesperrt, Verbandsspiel",
    });
  });
});
