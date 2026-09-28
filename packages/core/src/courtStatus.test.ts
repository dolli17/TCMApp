import { describe, expect, it } from "vitest";
import { berlinTime, nextSlotMinute, timeToMinutes } from "./booking";
import { courtStatusAt, type CourtSlot } from "./courtStatus";

const TAG = "2026-09-28";
const um = (hhmm: string) => berlinTime(TAG, timeToMinutes(hhmm));
const JETZT = um("14:10");

const belegt = (von: string, bis: string, mehr: Partial<CourtSlot> = {}): CourtSlot => ({
  court_id: "p1",
  starts_at: um(von).toISOString(),
  ends_at: um(bis).toISOString(),
  kind: "booking",
  type_name: "Einzel",
  ...mehr,
});

function status(zeit: string, occupied: CourtSlot[], jetzt = JETZT) {
  return courtStatusAt({
    day: TAG,
    courtId: "p1",
    minute: timeToMinutes(zeit),
    durationMinutes: 60,
    closingMinutes: timeToMinutes("21:00"),
    occupied,
    now: jetzt,
  });
}

describe("courtStatusAt", () => {
  it("frei bis zur naechsten Belegung", () => {
    expect(status("17:00", [belegt("18:00", "19:00")])).toMatchObject({
      art: "frei",
      text: "frei 17:00 – 18:00",
    });
  });

  it("frei bis zum Schluss", () => {
    expect(status("17:00", [belegt("09:00", "10:00")])).toMatchObject({
      art: "frei",
      text: "frei bis 21:00",
    });
  });

  it("belegt bis zum Ende der Buchung", () => {
    const b = belegt("17:00", "19:00");
    expect(status("17:30", [b])).toEqual({ art: "belegt", text: "belegt bis 19:00", belegung: b });
  });

  it("die eigene Buchung", () => {
    expect(status("17:00", [belegt("17:00", "18:00", { is_own: true })])).toMatchObject({
      art: "eigen",
      text: "Deine Buchung · 17:00",
    });
  });

  it("ein Spiel, das Mitspieler sucht", () => {
    expect(
      status("17:30", [belegt("17:00", "18:00", { type_name: "Doppel", partner_wanted: true, frei: 1 })]),
    ).toMatchObject({ art: "sucht", text: "Doppel sucht 1 · 17:00" });
  });

  it("gesperrt mit Grund", () => {
    expect(
      status("17:00", [belegt("08:00", "21:00", { kind: "blocking", title: "Platzpflege" })]),
    ).toMatchObject({ art: "gesperrt", text: "gesperrt · Platzpflege" });
  });

  it("gesperrt ohne Grund", () => {
    expect(status("17:00", [belegt("08:00", "21:00", { kind: "blocking", title: " " })]).text).toBe(
      "gesperrt · ohne Grund",
    );
  });

  it("Training einer Serie", () => {
    expect(
      status("17:00", [belegt("16:00", "19:00", { series_id: "s1", title: "Training" })]),
    ).toMatchObject({ art: "serie", text: "Training bis 19:00" });
  });

  it("knapp: frei zur Minute, aber die Stunde passt nicht mehr", () => {
    const b = belegt("17:30", "18:30");
    expect(status("17:00", [b])).toEqual({ art: "knapp", text: "belegt ab 17:30", belegung: b });
  });

  it("vorbei und Schluss", () => {
    expect(status("13:00", []).art).toBe("vorbei");
    expect(status("20:30", [])).toEqual({ art: "schluss", text: "Schluss um 21:00" });
  });

  it("sieht nur den eigenen Platz", () => {
    expect(status("17:00", [{ ...belegt("17:00", "18:00"), court_id: "p2" }]).art).toBe("frei");
  });
});

describe("nextSlotMinute", () => {
  const basis = { openingMinutes: timeToMinutes("08:00"), slotMinutes: 30 };
  it("rundet auf die naechste Startzeit", () => {
    expect(nextSlotMinute({ ...basis, now: um("14:10") })).toBe(timeToMinutes("14:30"));
    expect(nextSlotMinute({ ...basis, now: um("14:30") })).toBe(timeToMinutes("14:30"));
  });
  it("vor der Oeffnung die Oeffnung", () => {
    expect(nextSlotMinute({ ...basis, now: um("06:00") })).toBe(timeToMinutes("08:00"));
  });
});
