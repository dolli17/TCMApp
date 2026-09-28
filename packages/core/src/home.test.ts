import { describe, expect, it } from "vitest";
import { berlinTime, timeToMinutes } from "./booking";
import {
  berlinDay,
  bookingKicker,
  dayLabel,
  dayTag,
  relativeTimeLabel,
  sumOpenDrinks,
  timelinePosition,
  timelineSegments,
  upcomingBookings,
} from "./home";

// Montag, 28. September 2026, 14:00 in Berlin (Sommerzeit)
const TAG = "2026-09-28";
const um = (tag: string, hhmm: string) => berlinTime(tag, timeToMinutes(hhmm));
const JETZT = um(TAG, "14:00");

describe("berlinDay", () => {
  it("rechnet in Berliner Zeit, nicht in UTC", () => {
    // 00:30 in Berlin ist in UTC noch der Vortag
    expect(berlinDay(um(TAG, "00:30"))).toBe(TAG);
  });
});

describe("upcomingBookings", () => {
  const t = (von: string, bis: string, tag = TAG) => ({
    starts_at: um(tag, von).toISOString(),
    ends_at: um(tag, bis).toISOString(),
  });

  it("laesst Vergangenes weg und behaelt, was gerade laeuft", () => {
    const liste = [t("09:00", "10:00"), t("13:30", "14:30"), t("17:00", "18:00")];
    expect(upcomingBookings(liste, JETZT)).toEqual([liste[1], liste[2]]);
  });

  it("sortiert nach Beginn", () => {
    const spaeter = t("10:00", "11:00", "2026-09-30");
    const frueher = t("17:00", "18:00");
    expect(upcomingBookings([spaeter, frueher], JETZT)).toEqual([frueher, spaeter]);
  });
});

describe("bookingKicker", () => {
  const kicker = (tag: string, von: string, bis: string) =>
    bookingKicker(um(tag, von).toISOString(), um(tag, bis).toISOString(), JETZT);

  it("heute mit Abstand", () => {
    expect(kicker(TAG, "17:00", "18:00")).toBe("Heute · in 3 Stunden");
    expect(kicker(TAG, "15:00", "16:00")).toBe("Heute · in 1 Stunde");
    expect(kicker(TAG, "14:30", "15:30")).toBe("Heute · in 30 Minuten");
  });

  it("heute, schon begonnen", () => {
    expect(kicker(TAG, "13:30", "14:30")).toBe("Heute · läuft gerade");
  });

  it("morgen und spaeter", () => {
    expect(kicker("2026-09-29", "09:00", "10:00")).toBe("Morgen");
    expect(kicker("2026-09-30", "18:00", "19:00")).toBe("Mittwoch · 30.09.");
  });
});

describe("dayLabel", () => {
  it("heute, morgen, dann Wochentag mit Datum", () => {
    expect(dayLabel(um(TAG, "17:00").toISOString(), JETZT)).toBe("Heute");
    expect(dayLabel(um("2026-09-29", "17:00").toISOString(), JETZT)).toBe("Morgen");
    expect(dayLabel(um("2026-10-01", "19:00").toISOString(), JETZT)).toBe("Donnerstag, 01.10.");
  });
});

describe("dayTag", () => {
  it("heute, morgen, dann der Wochentag", () => {
    expect(dayTag(um(TAG, "17:00").toISOString(), JETZT)).toBe("HEUTE");
    expect(dayTag(um("2026-09-29", "17:00").toISOString(), JETZT)).toBe("MORGEN");
    expect(dayTag(um("2026-09-30", "17:00").toISOString(), JETZT)).toBe("MI");
  });
});

describe("relativeTimeLabel", () => {
  const vor = (minuten: number) => new Date(JETZT.getTime() - minuten * 60_000).toISOString();

  it("am selben Tag in Minuten und Stunden", () => {
    expect(relativeTimeLabel(vor(0), JETZT)).toBe("gerade eben");
    expect(relativeTimeLabel(vor(5), JETZT)).toBe("vor 5 Min.");
    expect(relativeTimeLabel(vor(125), JETZT)).toBe("vor 2 Std.");
  });

  it("gestern, dann Wochentag, dann Datum", () => {
    expect(relativeTimeLabel(um("2026-09-27", "20:00").toISOString(), JETZT)).toBe("gestern");
    expect(relativeTimeLabel(um("2026-09-26", "10:00").toISOString(), JETZT)).toBe("Sa");
    expect(relativeTimeLabel(um("2026-09-10", "10:00").toISOString(), JETZT)).toBe("10.09.");
  });
});

describe("sumOpenDrinks", () => {
  it("zaehlt Zurueckgenommenes nicht mit", () => {
    expect(
      sumOpenDrinks([
        { total_cents: 250, voided_at: null },
        { total_cents: 180, voided_at: "2026-09-01T10:00:00Z" },
        { total_cents: 120, voided_at: null },
      ]),
    ).toBe(370);
  });
});

describe("timelineSegments", () => {
  const AUF = timeToMinutes("08:00");
  const ZU = timeToMinutes("21:00");
  const b = (von: string, bis: string, mehr: object = {}) => ({
    starts_at: um(TAG, von).toISOString(),
    ends_at: um(TAG, bis).toISOString(),
    kind: "booking",
    ...mehr,
  });

  it("legt eine Belegung prozentual auf 08-21 Uhr", () => {
    const [s] = timelineSegments([b("08:00", "09:00")], AUF, ZU);
    expect(s!.left).toBe(0);
    expect(s!.width).toBeCloseTo(100 / 13);
  });

  it("schneidet an Oeffnung und Schluss ab", () => {
    const [s] = timelineSegments([b("20:30", "22:00")], AUF, ZU);
    expect(s!.left + s!.width).toBeCloseTo(100);
  });

  it("unterscheidet die Arten nach der Statustabelle", () => {
    const arten = timelineSegments(
      [
        b("09:00", "10:00"),
        b("10:00", "11:00", { is_own: true }),
        b("11:00", "12:00", { partner_wanted: true, frei: 1 }),
        b("12:00", "13:00", { partner_wanted: true, frei: 0 }),
        b("13:00", "14:00", { kind: "blocking" }),
        b("14:00", "15:00", { series_id: "s1" }),
      ],
      AUF,
      ZU,
    ).map((s) => s.art);
    // Sperrung flach, Serie (Training) schraffiert - zwei verschiedene Arten
    expect(arten).toEqual(["belegt", "eigen", "sucht", "belegt", "gesperrt", "serie"]);
  });

  it("eine Serie bleibt Serie, auch wenn sie dem Mitglied selbst gehoert", () => {
    const [s] = timelineSegments([b("16:00", "19:00", { series_id: "s1", is_own: true })], AUF, ZU);
    expect(s!.art).toBe("serie");
  });
});

describe("timelinePosition", () => {
  it("begrenzt auf 0 bis 100", () => {
    expect(timelinePosition(timeToMinutes("06:00"), 480, 1260)).toBe(0);
    expect(timelinePosition(timeToMinutes("14:30"), 480, 1260)).toBe(50);
    expect(timelinePosition(timeToMinutes("22:00"), 480, 1260)).toBe(100);
  });
});
