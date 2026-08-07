import { describe, expect, it } from "vitest";
import {
  berlinTime,
  checkPlayers,
  checkQuota,
  checkSlot,
  minutesOf,
  minutesToTime,
  slotsForDay,
  timeToMinutes,
  type BookingRules,
  type BookingTypeInfo,
} from "./booking";

const REGELN: BookingRules = {
  maxOpenBookings: 2,
  leadDays: 7,
  openingTime: "08:00",
  closingTime: "21:00",
  slotMinutes: 30,
};

const EINZEL: BookingTypeInfo = {
  code: "einzel",
  name: "Einzel",
  durationMinutes: 60,
  minPlayers: 2,
  maxPlayers: 2,
  requiresPartner: true,
};

const DOPPEL: BookingTypeInfo = {
  code: "doppel",
  name: "Doppel",
  durationMinutes: 90,
  minPlayers: 3,
  maxPlayers: 4,
  requiresPartner: true,
};

/** Zeitpunkt in deutscher Ortszeit erzeugen (Sommerzeit: UTC+2). */
function lokal(tagOffset: number, stunde: number, minute = 0): Date {
  const d = new Date("2026-08-03T00:00:00+02:00");
  d.setDate(d.getDate() + tagOffset);
  d.setHours(stunde, minute, 0, 0);
  return d;
}

const JETZT = lokal(0, 9);

describe("checkSlot", () => {
  it("akzeptiert einen gueltigen Slot", () => {
    expect(checkSlot(lokal(2, 10), EINZEL, REGELN, JETZT)).toEqual({ ok: true });
  });

  it("lehnt die Vergangenheit ab", () => {
    const r = checkSlot(lokal(-1, 10), EINZEL, REGELN, JETZT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Vergangenheit/);
  });

  it("lehnt zu weiten Vorlauf ab", () => {
    const r = checkSlot(lokal(30, 10), EINZEL, REGELN, JETZT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/7 Tage/);
  });

  it("akzeptiert den letzten Tag im Vorlauffenster", () => {
    expect(checkSlot(lokal(6, 10), EINZEL, REGELN, JETZT).ok).toBe(true);
  });

  it("lehnt Zeiten ausserhalb des Rasters ab", () => {
    const r = checkSlot(lokal(2, 10, 17), EINZEL, REGELN, JETZT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Raster/);
  });

  it("akzeptiert die halbe Stunde", () => {
    expect(checkSlot(lokal(2, 10, 30), EINZEL, REGELN, JETZT).ok).toBe(true);
  });

  it("lehnt Zeiten vor der Oeffnung ab", () => {
    const r = checkSlot(lokal(2, 7), EINZEL, REGELN, JETZT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/08:00/);
  });

  it("lehnt ab, wenn die Buchung nach Schliesszeit endet", () => {
    // 20:30 plus 60 Minuten waere 21:30 - der Platz ist dann zu.
    const r = checkSlot(lokal(2, 20, 30), EINZEL, REGELN, JETZT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/21:00/);
  });

  it("akzeptiert die letzte moegliche Buchung", () => {
    expect(checkSlot(lokal(2, 20), EINZEL, REGELN, JETZT).ok).toBe(true);
  });

  it("beruecksichtigt die laengere Dauer beim Doppel", () => {
    // Doppel dauert 90 Minuten, 20:00 waere also 21:30 - zu spaet.
    expect(checkSlot(lokal(2, 20), DOPPEL, REGELN, JETZT).ok).toBe(false);
    expect(checkSlot(lokal(2, 19, 30), DOPPEL, REGELN, JETZT).ok).toBe(true);
  });
});

describe("checkPlayers", () => {
  it("verlangt beim Einzel einen Mitspieler", () => {
    expect(checkPlayers(EINZEL, 0, 0).ok).toBe(false);
    expect(checkPlayers(EINZEL, 1, 0).ok).toBe(true);
  });

  it("akzeptiert einen Gast als Mitspieler", () => {
    expect(checkPlayers(EINZEL, 0, 1).ok).toBe(true);
  });

  it("begrenzt die Spielerzahl nach oben", () => {
    expect(checkPlayers(EINZEL, 2, 0).ok).toBe(false);
    expect(checkPlayers(DOPPEL, 3, 0).ok).toBe(true);
    expect(checkPlayers(DOPPEL, 4, 0).ok).toBe(false);
  });

  it("verlangt beim Doppel mindestens drei", () => {
    expect(checkPlayers(DOPPEL, 1, 0).ok).toBe(false);
    expect(checkPlayers(DOPPEL, 1, 1).ok).toBe(true);
  });
});

describe("checkQuota", () => {
  it("erlaubt bis zur Grenze", () => {
    expect(checkQuota(0, 2).ok).toBe(true);
    expect(checkQuota(1, 2).ok).toBe(true);
  });

  it("blockt ab der Grenze", () => {
    const r = checkQuota(2, 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Storniere/);
  });
});

describe("slotsForDay", () => {
  it("erzeugt alle Startzeiten im Raster", () => {
    const slots = slotsForDay(lokal(1, 0), EINZEL, REGELN);
    // 08:00 bis 20:00 in Halbstundenschritten = 25 moegliche Starts
    expect(slots).toHaveLength(25);
    expect(slots[0]!.getHours()).toBe(8);
    expect(slots.at(-1)!.getHours()).toBe(20);
  });

  it("beruecksichtigt die Dauer der Buchungsart", () => {
    const slots = slotsForDay(lokal(1, 0), DOPPEL, REGELN);
    // Doppel dauert 90 Minuten, letzter Start also 19:30
    expect(slots.at(-1)!.getHours()).toBe(19);
    expect(slots.at(-1)!.getMinutes()).toBe(30);
  });
});

describe("Zeitrechnung in Europe/Berlin", () => {
  it("liest die Uhrzeit unabhaengig von der Geraetezeitzone", () => {
    // 2026-07-15 18:30 Berlin = 16:30 UTC (Sommerzeit)
    expect(minutesOf("2026-07-15T16:30:00Z")).toBe(18 * 60 + 30);
    // 2026-01-15 18:30 Berlin = 17:30 UTC (Winterzeit)
    expect(minutesOf("2026-01-15T17:30:00Z")).toBe(18 * 60 + 30);
  });

  it("baut den Zeitpunkt im Sommer richtig", () => {
    const d = berlinTime("2026-07-15", 18 * 60 + 30);
    expect(d.toISOString()).toBe("2026-07-15T16:30:00.000Z");
  });

  it("baut den Zeitpunkt im Winter richtig", () => {
    const d = berlinTime("2026-01-15", 18 * 60 + 30);
    expect(d.toISOString()).toBe("2026-01-15T17:30:00.000Z");
  });

  it("stimmt auch am Tag der Zeitumstellung", () => {
    // 29.03.2026 ist der Umstellungstag; um 10 Uhr gilt bereits Sommerzeit.
    const d = berlinTime("2026-03-29", 10 * 60);
    expect(d.toISOString()).toBe("2026-03-29T08:00:00.000Z");
    // 25.10.2026 zurueck auf Winterzeit.
    const w = berlinTime("2026-10-25", 10 * 60);
    expect(w.toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });

  it("ist die Umkehrung von minutesOf", () => {
    for (const tag of ["2026-01-15", "2026-07-15", "2026-03-29", "2026-10-25"]) {
      for (const min of [8 * 60, 12 * 60 + 30, 20 * 60]) {
        expect(minutesOf(berlinTime(tag, min).toISOString())).toBe(min);
      }
    }
  });

  it("formatiert Minuten als Uhrzeit", () => {
    expect(minutesToTime(510)).toBe("08:30");
    expect(minutesToTime(0)).toBe("00:00");
    expect(timeToMinutes("21:00")).toBe(1260);
  });
});
