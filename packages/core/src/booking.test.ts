import { describe, expect, it } from "vitest";
import {
  berlinTime,
  bookingActions,
  bookingTypeInfo,
  canStartAt,
  checkPlayers,
  checkQuota,
  checkSlot,
  freeCourtsNow,
  latestStart,
  missingPlayers,
  minutesOf,
  minutesToTime,
  otherPlayersLabel,
  slotsForDay,
  timeToMinutes,
  umsetzZiele,
  type BookingRules,
  type BookingTypeInfo,
  type OccupiedSlot,
  type UmsetzBuchung,
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

  // B12: ein Doppel mit einem Mitspieler lehnt create_booking ab. Die
  // Meldung soll sagen, wie viele noch fehlen - nicht nur die Untergrenze.
  it("sagt beim Doppel mit einem Mitspieler, dass noch einer fehlt", () => {
    const r = checkPlayers(DOPPEL, 1, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("„Doppel“ braucht mindestens 3 Spieler – es fehlt noch ein Mitspieler.");
  });

  it("sagt beim leeren Doppel, dass zwei fehlen - nicht nur einer", () => {
    const r = checkPlayers(DOPPEL, 0, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("„Doppel“ braucht mindestens 3 Spieler – es fehlen noch 2 Mitspieler.");
  });

  it("laesst mit „Mitspieler gesucht“ unterbesetzt buchen, wie create_booking", () => {
    expect(checkPlayers(DOPPEL, 1, 0, true).ok).toBe(true);
    expect(checkPlayers(EINZEL, 0, 0, true).ok).toBe(true);
    // Die Obergrenze gilt trotzdem.
    expect(checkPlayers(EINZEL, 2, 0, true).ok).toBe(false);
  });
});

describe("bookingTypeInfo", () => {
  it("macht aus der Tabellenzeile die Spielform", () => {
    expect(
      bookingTypeInfo({
        code: "doppel", name: "Doppel", duration_minutes: 90, min_players: 3, max_players: 4, requires_partner: true,
      }),
    ).toEqual(DOPPEL);
  });
});

describe("missingPlayers", () => {
  it("zaehlt den Bucher mit", () => {
    expect(missingPlayers(DOPPEL, 0, 0)).toBe(2);
    expect(missingPlayers(DOPPEL, 1, 0)).toBe(1);
    expect(missingPlayers(DOPPEL, 1, 1)).toBe(0);
    expect(missingPlayers(EINZEL, 0, 0)).toBe(1);
    expect(missingPlayers(EINZEL, 0, 1)).toBe(0);
  });

  it("verlangt einen Partner auch dann, wenn min_players 1 waere", () => {
    expect(missingPlayers({ ...EINZEL, minPlayers: 1 }, 0, 0)).toBe(1);
    expect(missingPlayers({ ...EINZEL, minPlayers: 1, requiresPartner: false }, 0, 0)).toBe(0);
  });
});

describe("otherPlayersLabel", () => {
  it("nennt die Spanne neben dem Bucher aus der Buchungsart", () => {
    expect(otherPlayersLabel(EINZEL)).toBe("1 weitere Person");
    expect(otherPlayersLabel(DOPPEL)).toBe("2–3 weitere Personen");
    expect(otherPlayersLabel({ ...DOPPEL, minPlayers: 4 })).toBe("3 weitere Personen");
    expect(otherPlayersLabel({ ...DOPPEL, minPlayers: 1, requiresPartner: false })).toBe("bis zu 3 weitere Personen");
  });

  it("bleibt leer, wenn niemand mitspielen kann", () => {
    expect(otherPlayersLabel({ ...EINZEL, minPlayers: 1, maxPlayers: 1, requiresPartner: false })).toBe("");
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

describe("canStartAt und freeCourtsNow", () => {
  // Ein Sommertag: Berlin liegt zwei Stunden vor UTC. Genau da ist frueher
  // eine Regel auseinandergelaufen, als nur eine Stelle die Zeitzone kannte.
  const TAG = "2026-06-15";
  const um = (hhmm: string) => berlinTime(TAG, timeToMinutes(hhmm));
  const belegt = (court: string, von: string, bis: string): OccupiedSlot => ({
    court_id: court,
    starts_at: um(von).toISOString(),
    ends_at: um(bis).toISOString(),
  });
  const basis = {
    day: TAG,
    openingMinutes: timeToMinutes("08:00"),
    closingMinutes: timeToMinutes("21:00"),
    slotMinutes: 30,
    durationMinutes: 60,
  };

  describe("canStartAt", () => {
    const pruefe = (minute: string, occupied: OccupiedSlot[], jetzt = "10:00") =>
      canStartAt({
        day: TAG,
        courtId: "p1",
        minute: timeToMinutes(minute),
        durationMinutes: 60,
        closingMinutes: timeToMinutes("21:00"),
        occupied,
        now: um(jetzt),
      });

    it("erlaubt einen freien Platz in der Zukunft", () => {
      expect(pruefe("15:00", [])).toBe(true);
    });

    it("lehnt Vergangenes ab", () => {
      expect(pruefe("09:30", [])).toBe(false);
    });

    it("lehnt ab, wenn die Buchung nach Schluss endet", () => {
      expect(pruefe("20:30", [])).toBe(false);
      expect(pruefe("20:00", [])).toBe(true);
    });

    it("prueft die volle Dauer, nicht nur die Startminute", () => {
      // 18:00 waere frei, aber 18:30 ist belegt - die Stunde passt nicht mehr.
      expect(pruefe("18:00", [belegt("p1", "18:30", "19:30")])).toBe(false);
      // Direkt anschliessend geht: Ende 18:30 beruehrt Beginn 18:30 nicht.
      expect(pruefe("17:30", [belegt("p1", "18:30", "19:30")])).toBe(true);
      expect(pruefe("19:30", [belegt("p1", "18:30", "19:30")])).toBe(true);
    });

    it("sieht nur Belegungen desselben Platzes", () => {
      expect(pruefe("18:00", [belegt("p2", "18:00", "19:00")])).toBe(true);
    });

    it("ohne leadDays gibt es keine Grenze nach vorn", () => {
      expect(pruefe("15:00", [])).toBe(true);
    });
  });

  // B11: create_booking lehnt ab, was nach now() + lead_days Tagen beginnt.
  // Die Datenbank rechnet in UTC, ein Tag sind dort genau 24 Stunden.
  describe("canStartAt mit Vorlauf", () => {
    const frei = (tag: string, zeit: string, jetzt: Date, leadDays = 7) =>
      canStartAt({
        day: tag,
        courtId: "p1",
        minute: timeToMinutes(zeit),
        durationMinutes: 60,
        closingMinutes: timeToMinutes("21:00"),
        occupied: [],
        leadDays,
        now: jetzt,
      });

    it("am letzten Vorlauftag nur bis zur Uhrzeit von jetzt", () => {
      const jetzt = berlinTime("2026-06-15", timeToMinutes("10:00"));
      expect(frei("2026-06-22", "09:30", jetzt)).toBe(true);
      // Genau die Grenze laesst die Datenbank noch zu.
      expect(frei("2026-06-22", "10:00", jetzt)).toBe(true);
      expect(frei("2026-06-22", "10:30", jetzt)).toBe(false);
      expect(frei("2026-06-22", "15:00", jetzt)).toBe(false);
      // Davor ist alles frei.
      expect(frei("2026-06-21", "20:00", jetzt)).toBe(true);
    });

    it("rechnet ueber die Zeitumstellung am 25.10. in echten 24 Stunden", () => {
      // 18.10. 10:00 Sommerzeit ist 08:00 UTC. Sieben Tage spaeter, am 25.10.,
      // gilt Winterzeit - 08:00 UTC ist dann 09:00 Berliner Zeit, nicht 10:00.
      const jetzt = berlinTime("2026-10-18", timeToMinutes("10:00"));
      expect(jetzt.toISOString()).toBe("2026-10-18T08:00:00.000Z");
      expect(frei("2026-10-25", "09:00", jetzt)).toBe(true);
      expect(frei("2026-10-25", "09:30", jetzt)).toBe(false);
      expect(frei("2026-10-25", "10:00", jetzt)).toBe(false);
    });

    it("rechnet am 25.10. selbst richtig, wenn jetzt Winterzeit ist", () => {
      // 25.10. 10:00 Winterzeit ist 09:00 UTC; am 01.11. ist es wieder 10:00.
      const jetzt = berlinTime("2026-10-25", timeToMinutes("10:00"));
      expect(frei("2026-11-01", "10:00", jetzt)).toBe(true);
      expect(frei("2026-11-01", "10:30", jetzt)).toBe(false);
    });
  });

  describe("latestStart", () => {
    it("ist jetzt plus leadDays mal 24 Stunden", () => {
      const jetzt = new Date("2026-10-18T08:00:00Z");
      expect(latestStart(7, jetzt).toISOString()).toBe("2026-10-25T08:00:00.000Z");
    });
  });

  describe("freeCourtsNow", () => {
    it("beginnt bei der naechsten Startzeit im Raster", () => {
      const frei = freeCourtsNow({ ...basis, courtIds: ["p1"], occupied: [], now: um("15:10") });
      expect(frei).toEqual([{ courtId: "p1", fromMinute: 930, untilMinute: 1260 }]);
    });

    it("findet auch Sekunden nach einer Startzeit freie Plaetze", () => {
      const frei = freeCourtsNow({
        ...basis, courtIds: ["p1"], occupied: [], now: new Date(um("15:30").getTime() + 20_000),
      });
      expect(frei).toEqual([{ courtId: "p1", fromMinute: 960, untilMinute: 1260 }]);
    });

    it("beginnt genau jetzt, wenn jetzt eine Startzeit ist", () => {
      const frei = freeCourtsNow({ ...basis, courtIds: ["p1"], occupied: [], now: um("15:30") });
      expect(frei[0]?.fromMinute).toBe(930);
    });

    it("beginnt vor der Oeffnung mit der Oeffnung", () => {
      const frei = freeCourtsNow({ ...basis, courtIds: ["p1"], occupied: [], now: um("06:15") });
      expect(frei[0]).toEqual({ courtId: "p1", fromMinute: 480, untilMinute: 1260 });
    });

    it("ist frei bis zur naechsten Belegung", () => {
      const frei = freeCourtsNow({
        ...basis,
        courtIds: ["p1"],
        occupied: [belegt("p1", "09:00", "10:00"), belegt("p1", "17:00", "18:00")],
        now: um("15:10"),
      });
      expect(minutesToTime(frei[0]!.untilMinute)).toBe("17:00");
    });

    it("laesst Plaetze weg, auf denen jetzt nichts mehr beginnen kann", () => {
      const frei = freeCourtsNow({
        ...basis,
        courtIds: ["p1", "p2"],
        // Auf p1 laeuft gerade ein Spiel, auf p2 beginnt eins innerhalb der Stunde.
        occupied: [belegt("p1", "15:00", "16:00"), belegt("p2", "16:00", "17:00")],
        now: um("15:10"),
      });
      expect(frei).toEqual([]);
    });

    it("liefert nichts mehr, wenn keine volle Stunde bis Schluss bleibt", () => {
      expect(freeCourtsNow({ ...basis, courtIds: ["p1"], occupied: [], now: um("20:10") })).toEqual([]);
    });

    it("sortiert nach der laengsten freien Zeit, sonst nach Platzreihenfolge", () => {
      const frei = freeCourtsNow({
        ...basis,
        courtIds: ["p1", "p2", "p3", "p4"],
        occupied: [belegt("p1", "17:00", "18:00"), belegt("p3", "19:00", "20:00")],
        now: um("15:10"),
      });
      expect(frei.map((f) => f.courtId)).toEqual(["p2", "p4", "p3", "p1"]);
    });
  });
});

describe("umsetzZiele", () => {
  const TAG = "2026-06-15";
  const um = (hhmm: string, tag = TAG) => berlinTime(tag, timeToMinutes(hhmm));
  const belegt = (court: string, von: string, bis: string, id = "fremd") => ({
    booking_id: id,
    court_id: court,
    starts_at: um(von).toISOString(),
    ends_at: um(bis).toISOString(),
  });
  // Die Buchung, die umgesetzt wird: Platz 1, 14 bis 15 Uhr.
  const BUCHUNG: UmsetzBuchung = belegt("p1", "14:00", "15:00", "meine");
  const ziele = (opts: {
    occupied?: ReturnType<typeof belegt>[];
    jetzt?: string;
    day?: string;
    booking?: UmsetzBuchung;
  }) =>
    umsetzZiele({
      booking: opts.booking ?? BUCHUNG,
      day: opts.day ?? TAG,
      courtIds: ["p1", "p2"],
      openingMinutes: timeToMinutes("08:00"),
      closingMinutes: timeToMinutes("21:00"),
      slotMinutes: 30,
      occupied: opts.occupied ?? [BUCHUNG],
      now: um(opts.jetzt ?? "10:00"),
    });
  const hat = (liste: { courtId: string; minute: number }[], court: string, zeit: string) =>
    liste.some((z) => z.courtId === court && z.minute === timeToMinutes(zeit));

  it("bietet freie Plaetze und Zeiten, aber nicht die Lage, in der die Buchung schon liegt", () => {
    const liste = ziele({});
    expect(hat(liste, "p2", "14:00")).toBe(true);
    expect(hat(liste, "p1", "16:00")).toBe(true);
    expect(hat(liste, "p1", "14:00")).toBe(false);
  });

  it("zaehlt die eigene alte Lage nicht als belegt", () => {
    const liste = ziele({});
    expect(hat(liste, "p1", "14:30")).toBe(true);
    expect(hat(liste, "p1", "13:30")).toBe(true);
  });

  it("laesst belegte Zeiten aus, ueber die volle Dauer", () => {
    const liste = ziele({ occupied: [BUCHUNG, belegt("p2", "16:30", "17:30")] });
    expect(hat(liste, "p2", "16:00")).toBe(false);
    expect(hat(liste, "p2", "17:00")).toBe(false);
    expect(hat(liste, "p2", "15:30")).toBe(true);
    expect(hat(liste, "p2", "17:30")).toBe(true);
  });

  it("haelt Vergangenheit und Schluss ein und behaelt die Dauer", () => {
    const liste = ziele({});
    expect(hat(liste, "p2", "09:30")).toBe(false);
    expect(hat(liste, "p2", "10:00")).toBe(true);
    expect(hat(liste, "p2", "20:00")).toBe(true);
    expect(hat(liste, "p2", "20:30")).toBe(false);
  });

  it("bietet auch andere Tage an, ohne Buchungsvorlauf", () => {
    const liste = ziele({ day: "2026-07-20", occupied: [] });
    expect(hat(liste, "p1", "08:00")).toBe(true);
    expect(hat(liste, "p1", "14:00")).toBe(true);
  });

  it("setzt eine laufende Buchung nur auf andere Plaetze zur selben Zeit", () => {
    const liste = ziele({ jetzt: "14:20" });
    expect(liste).toEqual([{ courtId: "p2", minute: timeToMinutes("14:00") }]);
  });

  it("findet fuer eine laufende Buchung nichts, wenn der andere Platz belegt ist", () => {
    expect(ziele({ jetzt: "14:20", occupied: [BUCHUNG, belegt("p2", "14:30", "15:30")] })).toEqual([]);
  });

  it("bietet eine laufende Buchung nicht an einem anderen Tag an", () => {
    expect(ziele({ jetzt: "14:20", day: "2026-06-16", occupied: [] })).toEqual([]);
  });

  it("hat fuer eine vergangene Buchung keine Ziele", () => {
    expect(ziele({ jetzt: "15:00" })).toEqual([]);
  });
});

// B13: Was die RPCs bei einer Buchung erlauben - cancel_booking,
// update_booking_players, leave_booking und join_booking.
describe("bookingActions", () => {
  const JETZT_B = new Date("2026-10-25T09:00:00Z"); // 10:00 Berlin, Winterzeit
  const spaeter = "2026-10-25T10:00:00Z";
  const begonnen = "2026-10-25T08:30:00Z";
  const genauJetzt = JETZT_B.toISOString();

  const aktionen = (b: Partial<Parameters<typeof bookingActions>[0]> & { startsAt: string }) =>
    bookingActions({ own: false, now: JETZT_B, ...b });

  it("der Bucher storniert und aendert Mitspieler bis Spielbeginn", () => {
    expect(aktionen({ startsAt: spaeter, own: true })).toEqual({
      cancel: true, editPlayers: true, leave: false, join: false,
    });
    expect(aktionen({ startsAt: begonnen, own: true })).toEqual({
      cancel: false, editPlayers: false, leave: false, join: false,
    });
  });

  it("zu Spielbeginn gilt die Buchung als begonnen, wie lower(slot) <= now()", () => {
    expect(aktionen({ startsAt: genauJetzt, own: true }).cancel).toBe(false);
    expect(aktionen({ startsAt: genauJetzt, joined: true }).leave).toBe(false);
    expect(aktionen({ startsAt: genauJetzt, partnerWanted: true, free: 1 }).join).toBe(false);
  });

  it("mit Platzrechten auch waehrend der Spielzeit und fuer fremde Buchungen", () => {
    expect(aktionen({ startsAt: begonnen, managesCourts: true })).toEqual({
      cancel: true, editPlayers: true, leave: false, join: false,
    });
    expect(aktionen({ startsAt: begonnen, own: true, managesCourts: true }).cancel).toBe(true);
  });

  it("fremde Buchungen ohne Platzrechte: weder stornieren noch aendern", () => {
    expect(aktionen({ startsAt: spaeter })).toEqual({
      cancel: false, editPlayers: false, leave: false, join: false,
    });
  });

  it("ein Mitspieler traegt sich nur vor Spielbeginn aus", () => {
    expect(aktionen({ startsAt: spaeter, joined: true }).leave).toBe(true);
    expect(aktionen({ startsAt: begonnen, joined: true }).leave).toBe(false);
    // Platzrechte aendern daran nichts - leave_booking kennt keine Ausnahme.
    expect(aktionen({ startsAt: begonnen, joined: true, managesCourts: true }).leave).toBe(false);
  });

  it("der Bucher traegt sich nicht aus, er storniert", () => {
    expect(aktionen({ startsAt: spaeter, own: true, joined: true }).leave).toBe(false);
  });

  it("mitspielen nur, wenn gesucht wird, Platz frei ist und noch nicht begonnen", () => {
    expect(aktionen({ startsAt: spaeter, partnerWanted: true, free: 1 }).join).toBe(true);
    expect(aktionen({ startsAt: begonnen, partnerWanted: true, free: 1 }).join).toBe(false);
    expect(aktionen({ startsAt: spaeter, partnerWanted: false, free: 1 }).join).toBe(false);
    expect(aktionen({ startsAt: spaeter, partnerWanted: true, free: 0 }).join).toBe(false);
    expect(aktionen({ startsAt: spaeter, partnerWanted: true, free: 1, own: true }).join).toBe(false);
    expect(aktionen({ startsAt: spaeter, partnerWanted: true, free: 1, joined: true }).join).toBe(false);
  });
});
