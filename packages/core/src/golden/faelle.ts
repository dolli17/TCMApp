/**
 * Golden Files: die Eingaben
 *
 * Jeder Fall stammt aus einem bestehenden Vitest-Test (Datei im Kommentar
 * ueber der Gruppe). Die Ausgaben stehen hier nicht: scripts/build-golden.ts
 * rechnet sie mit der Implementierung aus und schreibt beides nach
 * packages/core/golden/. Die Vitest-Tests halten fest, dass diese Ausgaben
 * die gewollten sind; golden.test.ts haelt fest, dass die Dateien zur
 * Implementierung passen.
 *
 * Zeitpunkte stehen als ISO-Zeitstempel in UTC, damit die Dateien ohne
 * Zeitzonenrechnung lesbar sind. Wo ein Test in Berliner Zeit denkt, rechnet
 * um() das hier einmal um.
 */

import { berlinTime, timeToMinutes } from "../booking";

export interface GoldenEingabe {
  name: string;
  input: Record<string, unknown>;
}

/** Berliner Wanduhr -> ISO in UTC */
function um(tag: string, hhmm: string): string {
  return berlinTime(tag, timeToMinutes(hhmm)).toISOString();
}

// ---------------------------------------------------------------------------
// Zeitrechnung (booking.test.ts, home.test.ts)
// ---------------------------------------------------------------------------

const berlinTimeFaelle: GoldenEingabe[] = [
  { name: "Sommer: 18:30 Berlin ist 16:30 UTC", input: { day: "2026-07-15", minutes: 1110 } },
  { name: "Winter: 18:30 Berlin ist 17:30 UTC", input: { day: "2026-01-15", minutes: 1110 } },
  { name: "Tag der Umstellung auf Sommerzeit, 10:00", input: { day: "2026-03-29", minutes: 600 } },
  { name: "Tag der Umstellung auf Winterzeit, 10:00", input: { day: "2026-10-25", minutes: 600 } },
  { name: "Mitternacht im Sommer ist in UTC noch der Vortag", input: { day: "2026-09-28", minutes: 30 } },
];

// "ist die Umkehrung von minutesOf": je Tag drei Uhrzeiten
const minutesOfUmkehrung: GoldenEingabe[] = ["2026-01-15", "2026-07-15", "2026-03-29", "2026-10-25"].flatMap(
  (tag) =>
    [480, 750, 1200].map((min) => ({
      name: `Umkehrung von berlinTime: ${tag} ${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`,
      input: { iso: berlinTime(tag, min).toISOString() },
    })),
);

const minutesOfFaelle: GoldenEingabe[] = [
  { name: "Sommerzeit: 16:30 UTC ist 18:30 Berlin", input: { iso: "2026-07-15T16:30:00Z" } },
  { name: "Winterzeit: 17:30 UTC ist 18:30 Berlin", input: { iso: "2026-01-15T17:30:00Z" } },
  ...minutesOfUmkehrung,
];

const minutesToTimeFaelle: GoldenEingabe[] = [
  { name: "halbe Stunde", input: { minutes: 510 } },
  { name: "Mitternacht", input: { minutes: 0 } },
  { name: "Schluss", input: { minutes: 1260 } },
];

const timeToMinutesFaelle: GoldenEingabe[] = [
  { name: "Schluss", input: { value: "21:00" } },
  { name: "Oeffnung", input: { value: "08:00" } },
  { name: "halbe Stunde", input: { value: "14:30" } },
  { name: "vor der Oeffnung", input: { value: "06:00" } },
];

// home.test.ts: Montag, 28.09.2026, 14:00 Berlin
const HOME_JETZT = um("2026-09-28", "14:00");

const dayLabelFaelle: GoldenEingabe[] = [
  { name: "heute", input: { startsAt: um("2026-09-28", "17:00"), now: HOME_JETZT } },
  { name: "morgen", input: { startsAt: um("2026-09-29", "17:00"), now: HOME_JETZT } },
  { name: "danach Wochentag und Datum", input: { startsAt: um("2026-10-01", "19:00"), now: HOME_JETZT } },
  // Zeitumstellung: der Tag zaehlt nach Berliner Kalender, nicht nach 24 Stunden
  {
    name: "Zeitumstellung: Samstag spaet, Termin Sonntag frueh",
    input: { startsAt: um("2026-10-25", "09:00"), now: um("2026-10-24", "23:30") },
  },
  {
    name: "Zeitumstellung: Samstag, Termin Montag",
    input: { startsAt: um("2026-10-26", "09:00"), now: um("2026-10-24", "23:30") },
  },
  {
    name: "Zeitumstellung: kurz nach Mitternacht Berlin, in UTC noch der Vortag",
    input: { startsAt: um("2026-03-29", "10:00"), now: um("2026-03-29", "00:30") },
  },
];

const dayTagFaelle: GoldenEingabe[] = [
  { name: "heute", input: { startsAt: um("2026-09-28", "17:00"), now: HOME_JETZT } },
  { name: "morgen", input: { startsAt: um("2026-09-29", "17:00"), now: HOME_JETZT } },
  { name: "danach der Wochentag", input: { startsAt: um("2026-09-30", "17:00"), now: HOME_JETZT } },
  {
    name: "Zeitumstellung: Samstag spaet, Termin Sonntag frueh",
    input: { startsAt: um("2026-10-25", "09:00"), now: um("2026-10-24", "23:30") },
  },
  {
    name: "Zeitumstellung: Samstag, Termin Montag",
    input: { startsAt: um("2026-10-26", "09:00"), now: um("2026-10-24", "23:30") },
  },
];

const termin = (tag: string, von: string, bis: string) => ({ starts_at: um(tag, von), ends_at: um(tag, bis) });

const upcomingBookingsFaelle: GoldenEingabe[] = [
  {
    name: "laesst Vergangenes weg und behaelt, was gerade laeuft",
    input: {
      termine: [
        termin("2026-09-28", "09:00", "10:00"),
        termin("2026-09-28", "13:30", "14:30"),
        termin("2026-09-28", "17:00", "18:00"),
      ],
      now: HOME_JETZT,
    },
  },
  {
    name: "sortiert nach Beginn",
    input: {
      termine: [termin("2026-09-30", "10:00", "11:00"), termin("2026-09-28", "17:00", "18:00")],
      now: HOME_JETZT,
    },
  },
];

// ---------------------------------------------------------------------------
// Plaetze (booking.test.ts, freeSlots.test.ts, courtStatus.test.ts, home.test.ts)
// ---------------------------------------------------------------------------

const PLATZ_TAG = "2026-06-15";
const belegt = (tag: string, court: string, von: string, bis: string) => ({
  court_id: court,
  starts_at: um(tag, von),
  ends_at: um(tag, bis),
});

const pruefe = (name: string, minute: string, occupied: unknown[], jetztUm = "10:00"): GoldenEingabe => ({
  name,
  input: {
    day: PLATZ_TAG,
    courtId: "p1",
    minute: timeToMinutes(minute),
    durationMinutes: 60,
    closingMinutes: 1260,
    occupied,
    now: um(PLATZ_TAG, jetztUm),
  },
});

const mitVorlauf = (name: string, tag: string, zeit: string, now: string): GoldenEingabe => ({
  name,
  input: {
    day: tag,
    courtId: "p1",
    minute: timeToMinutes(zeit),
    durationMinutes: 60,
    closingMinutes: 1260,
    occupied: [],
    leadDays: 7,
    now,
  },
});

const P1_1830 = belegt(PLATZ_TAG, "p1", "18:30", "19:30");
const VORLAUF_SOMMER = um("2026-06-15", "10:00");
const VORLAUF_UMSTELLUNG = um("2026-10-18", "10:00");
const VORLAUF_WINTER = um("2026-10-25", "10:00");

const canStartAtFaelle: GoldenEingabe[] = [
  pruefe("freier Platz in der Zukunft", "15:00", []),
  pruefe("Vergangenes", "09:30", []),
  pruefe("endet nach Schluss", "20:30", []),
  pruefe("letzte Stunde vor Schluss", "20:00", []),
  pruefe("volle Dauer zaehlt: 18:30 belegt, 18:00 geht nicht", "18:00", [P1_1830]),
  pruefe("direkt davor geht", "17:30", [P1_1830]),
  pruefe("direkt danach geht", "19:30", [P1_1830]),
  pruefe("nur Belegungen desselben Platzes", "18:00", [belegt(PLATZ_TAG, "p2", "18:00", "19:00")]),
  mitVorlauf("letzter Vorlauftag vor der Uhrzeit von jetzt", "2026-06-22", "09:30", VORLAUF_SOMMER),
  mitVorlauf("letzter Vorlauftag genau an der Grenze", "2026-06-22", "10:00", VORLAUF_SOMMER),
  mitVorlauf("letzter Vorlauftag nach der Grenze", "2026-06-22", "10:30", VORLAUF_SOMMER),
  mitVorlauf("letzter Vorlauftag am Nachmittag", "2026-06-22", "15:00", VORLAUF_SOMMER),
  mitVorlauf("Tag davor ganz frei", "2026-06-21", "20:00", VORLAUF_SOMMER),
  mitVorlauf("Zeitumstellung: Grenze rutscht auf 09:00", "2026-10-25", "09:00", VORLAUF_UMSTELLUNG),
  mitVorlauf("Zeitumstellung: 09:30 schon zu weit", "2026-10-25", "09:30", VORLAUF_UMSTELLUNG),
  mitVorlauf("Zeitumstellung: 10:00 schon zu weit", "2026-10-25", "10:00", VORLAUF_UMSTELLUNG),
  mitVorlauf("Winterzeit: Grenze genau 10:00", "2026-11-01", "10:00", VORLAUF_WINTER),
  mitVorlauf("Winterzeit: 10:30 zu weit", "2026-11-01", "10:30", VORLAUF_WINTER),
];

const freiJetzt = (name: string, courtIds: string[], occupied: unknown[], now: string): GoldenEingabe => ({
  name,
  input: {
    day: PLATZ_TAG,
    courtIds,
    openingMinutes: 480,
    closingMinutes: 1260,
    slotMinutes: 30,
    durationMinutes: 60,
    occupied,
    now,
  },
});

const freeCourtsNowFaelle: GoldenEingabe[] = [
  freiJetzt("beginnt bei der naechsten Startzeit im Raster", ["p1"], [], um(PLATZ_TAG, "15:10")),
  freiJetzt(
    "Sekunden nach einer Startzeit: die naechste",
    ["p1"],
    [],
    new Date(Date.parse(um(PLATZ_TAG, "15:30")) + 20_000).toISOString(),
  ),
  freiJetzt("genau zur Startzeit", ["p1"], [], um(PLATZ_TAG, "15:30")),
  freiJetzt("vor der Oeffnung die Oeffnung", ["p1"], [], um(PLATZ_TAG, "06:15")),
  freiJetzt(
    "frei bis zur naechsten Belegung",
    ["p1"],
    [belegt(PLATZ_TAG, "p1", "09:00", "10:00"), belegt(PLATZ_TAG, "p1", "17:00", "18:00")],
    um(PLATZ_TAG, "15:10"),
  ),
  freiJetzt(
    "laesst Plaetze weg, auf denen jetzt nichts beginnen kann",
    ["p1", "p2"],
    [belegt(PLATZ_TAG, "p1", "15:00", "16:00"), belegt(PLATZ_TAG, "p2", "16:00", "17:00")],
    um(PLATZ_TAG, "15:10"),
  ),
  freiJetzt("keine volle Stunde bis Schluss", ["p1"], [], um(PLATZ_TAG, "20:10")),
  freiJetzt(
    "sortiert nach der laengsten freien Zeit, sonst nach Platzreihenfolge",
    ["p1", "p2", "p3", "p4"],
    [belegt(PLATZ_TAG, "p1", "17:00", "18:00"), belegt(PLATZ_TAG, "p3", "19:00", "20:00")],
    um(PLATZ_TAG, "15:10"),
  ),
];

// freeSlots.test.ts und courtStatus.test.ts: Montag, 28.09.2026
const RASTER_TAG = "2026-09-28";
const slot = (court: string, von: string, bis: string, mehr: Record<string, unknown> = {}, typ = "Doppel") => ({
  ...belegt(RASTER_TAG, court, von, bis),
  kind: "booking",
  type_name: typ,
  ...mehr,
});

const zeilen = (name: string, occupied: unknown[], now: string, tag = RASTER_TAG, mehr = {}): GoldenEingabe => ({
  name,
  input: {
    day: tag,
    courtIds: ["p1", "p2", "p3"],
    openingMinutes: 480,
    closingMinutes: 1260,
    slotMinutes: 30,
    durationMinutes: 60,
    occupied,
    now,
    ...mehr,
  },
});

const freeSlotsOfDayFaelle: GoldenEingabe[] = [
  zeilen("heute: naechste Halbstunde, danach volle Stunden", [], um(RASTER_TAG, "14:10")),
  zeilen("heute zur vollen Stunde keine Zeit doppelt", [], um(RASTER_TAG, "16:00")),
  {
    name: "am letzten Vorlauftag ist nach der Grenze nichts frei",
    input: {
      day: RASTER_TAG,
      courtIds: ["p1"],
      openingMinutes: 480,
      closingMinutes: 1260,
      slotMinutes: 30,
      durationMinutes: 60,
      occupied: [],
      leadDays: 7,
      now: um("2026-09-21", "14:10"),
    },
  },
  zeilen("vor der Oeffnung ab der Oeffnung", [], um(RASTER_TAG, "06:00")),
  zeilen("kommender Tag ab der Oeffnung", [], um(RASTER_TAG, "14:10"), "2026-09-29"),
  zeilen("vergangener Tag", [], um(RASTER_TAG, "14:10"), "2026-09-27"),
  zeilen("Abend nach der letzten Startzeit", [], um(RASTER_TAG, "20:10")),
  zeilen(
    "Status je Platz: eigen, sucht, frei",
    [
      slot("p1", "17:00", "18:00", { is_own: true }),
      slot("p2", "17:00", "18:00", { partner_wanted: true, frei: 1 }),
    ],
    um(RASTER_TAG, "16:10"),
  ),
  zeilen("knapp: eine volle Stunde passt nicht", [slot("p1", "17:30", "18:30")], um(RASTER_TAG, "16:10")),
];

const status = (name: string, zeit: string, occupied: unknown[], mehr = {}): GoldenEingabe => ({
  name,
  input: {
    day: RASTER_TAG,
    courtId: "p1",
    minute: timeToMinutes(zeit),
    durationMinutes: 60,
    closingMinutes: 1260,
    occupied,
    now: um(RASTER_TAG, "14:10"),
    ...mehr,
  },
});

const courtStatusAtFaelle: GoldenEingabe[] = [
  status("frei bis zur naechsten Belegung", "17:00", [slot("p1", "18:00", "19:00", {}, "Einzel")]),
  status("frei bis zum Schluss", "17:00", [slot("p1", "09:00", "10:00", {}, "Einzel")]),
  status("belegt bis zum Ende der Buchung", "17:30", [slot("p1", "17:00", "19:00", {}, "Einzel")]),
  status("die eigene Buchung", "17:00", [slot("p1", "17:00", "18:00", { is_own: true }, "Einzel")]),
  status("ein Spiel, das Mitspieler sucht", "17:30", [
    slot("p1", "17:00", "18:00", { partner_wanted: true, frei: 1 }, "Doppel"),
  ]),
  status("gesperrt mit Kategorie und Grund", "17:00", [
    slot("p1", "08:00", "21:00", { kind: "blocking", title: "Regen" }, "Platzpflege"),
  ]),
  status("gesperrt ohne Grund", "17:00", [
    slot("p1", "08:00", "21:00", { kind: "blocking", title: " " }, "Verbandsspiel"),
  ]),
  status("Training einer Serie", "17:00", [
    slot("p1", "16:00", "19:00", { kind: "blocking", series_id: "s1", title: "Training" }, "Einzel"),
  ]),
  status("knapp: frei zur Minute, aber die Stunde passt nicht", "17:00", [
    slot("p1", "17:30", "18:30", {}, "Einzel"),
  ]),
  status("vorbei", "13:00", []),
  status("Schluss", "20:30", []),
  status("sieht nur den eigenen Platz", "17:00", [slot("p2", "17:00", "18:00", {}, "Einzel")]),
  status("Vorlauf: noch frei", "14:00", [], { leadDays: 7, now: um("2026-09-21", "14:10") }),
  status("Vorlauf: buchbar ab 14:30", "14:30", [], { leadDays: 7, now: um("2026-09-21", "14:10") }),
  status("Vorlauf: buchbar ab 17:00", "17:00", [], { leadDays: 7, now: um("2026-09-21", "14:10") }),
];

// home.test.ts, timelineSegments: "unterscheidet die Arten nach der Statustabelle"
const occupancyKindFaelle: GoldenEingabe[] = [
  { name: "Buchung", input: { b: { kind: "booking" } } },
  { name: "eigene Buchung", input: { b: { kind: "booking", is_own: true } } },
  { name: "sucht Mitspieler mit freiem Platz", input: { b: { kind: "booking", partner_wanted: true, frei: 1 } } },
  { name: "sucht, aber kein Platz frei", input: { b: { kind: "booking", partner_wanted: true, frei: 0 } } },
  { name: "Sperrung", input: { b: { kind: "blocking" } } },
  { name: "Serie: blocking mit series_id", input: { b: { kind: "blocking", series_id: "s1" } } },
  { name: "Serie bleibt Serie, auch wenn sie dem Mitglied gehoert", input: { b: { kind: "booking", series_id: "s1", is_own: true } } },
];

// booking.test.ts, B13. 10:00 Berlin am 25.10.2026 (Winterzeit)
const AKTION_JETZT = "2026-10-25T09:00:00.000Z";
const SPAETER = "2026-10-25T10:00:00Z";
const BEGONNEN = "2026-10-25T08:30:00Z";
const aktion = (name: string, b: Record<string, unknown>): GoldenEingabe => ({
  name,
  input: { own: false, now: AKTION_JETZT, ...b },
});

const bookingActionsFaelle: GoldenEingabe[] = [
  aktion("Bucher vor Spielbeginn", { startsAt: SPAETER, own: true }),
  aktion("Bucher nach Spielbeginn", { startsAt: BEGONNEN, own: true }),
  aktion("Bucher genau zu Spielbeginn", { startsAt: AKTION_JETZT, own: true }),
  aktion("Mitspieler genau zu Spielbeginn", { startsAt: AKTION_JETZT, joined: true }),
  aktion("mitspielen genau zu Spielbeginn", { startsAt: AKTION_JETZT, partnerWanted: true, free: 1 }),
  aktion("Platzrechte waehrend der Spielzeit", { startsAt: BEGONNEN, managesCourts: true }),
  aktion("Bucher mit Platzrechten waehrend der Spielzeit", { startsAt: BEGONNEN, own: true, managesCourts: true }),
  aktion("fremde Buchung ohne Platzrechte", { startsAt: SPAETER }),
  aktion("Mitspieler vor Spielbeginn", { startsAt: SPAETER, joined: true }),
  aktion("Mitspieler nach Spielbeginn", { startsAt: BEGONNEN, joined: true }),
  aktion("Mitspieler mit Platzrechten nach Spielbeginn", { startsAt: BEGONNEN, joined: true, managesCourts: true }),
  aktion("Bucher, der auch eingetragen ist", { startsAt: SPAETER, own: true, joined: true }),
  aktion("mitspielen: gesucht, frei, nicht begonnen", { startsAt: SPAETER, partnerWanted: true, free: 1 }),
  aktion("mitspielen: schon begonnen", { startsAt: BEGONNEN, partnerWanted: true, free: 1 }),
  aktion("mitspielen: nicht gesucht", { startsAt: SPAETER, partnerWanted: false, free: 1 }),
  aktion("mitspielen: kein Platz frei", { startsAt: SPAETER, partnerWanted: true, free: 0 }),
  aktion("mitspielen: eigene Buchung", { startsAt: SPAETER, partnerWanted: true, free: 1, own: true }),
  aktion("mitspielen: schon eingetragen", { startsAt: SPAETER, partnerWanted: true, free: 1, joined: true }),
];

// ---------------------------------------------------------------------------
// Belegungsplan und Buchungsblatt (freeSlots.test.ts, booking.test.ts, home.test.ts)
// ---------------------------------------------------------------------------

const luecken = (name: string, occupied: unknown[], now: string, mehr = {}): GoldenEingabe => ({
  name,
  input: {
    day: RASTER_TAG,
    courtId: "p1",
    openingMinutes: 480,
    closingMinutes: 1260,
    slotMinutes: 30,
    durationMinutes: 60,
    occupied,
    now,
    ...mehr,
  },
});

const freeGapsFaelle: GoldenEingabe[] = [
  luecken(
    "zwischen den Belegungen, heute ab der naechsten Startzeit",
    [slot("p1", "16:00", "17:00"), slot("p1", "19:00", "20:00")],
    um(RASTER_TAG, "14:10"),
  ),
  luecken(
    "eine Luecke kuerzer als die Dauer faellt weg, andere Plaetze zaehlen nicht",
    [slot("p1", "08:00", "16:00"), slot("p1", "16:30", "21:00"), slot("p2", "18:00", "19:00")],
    um(RASTER_TAG, "06:00"),
  ),
  luecken("am letzten Vorlauftag endet die Luecke an der Grenze", [], um("2026-09-21", "14:10"), { leadDays: 7 }),
  luecken("ein vergangener Tag hat keine Luecken", [], um("2026-09-29", "08:00")),
];

const LUECKE = { courtId: "p1", from: 900, until: 1050 };
const startInGapFaelle: GoldenEingabe[] = [
  { name: "rundet aufs Raster ab", input: { gap: LUECKE, minute: 950, slotMinutes: 30, durationMinutes: 60 } },
  { name: "laesst die volle Stunde Platz", input: { gap: LUECKE, minute: 1040, slotMinutes: 30, durationMinutes: 60 } },
  { name: "vor der Luecke ihr Beginn", input: { gap: LUECKE, minute: 840, slotMinutes: 30, durationMinutes: 60 } },
];

const beschriftung = (name: string, mehr: Record<string, unknown>): GoldenEingabe => ({
  name,
  input: { b: slot("p1", "17:00", "19:00", mehr) },
});

const occupancyLabelFaelle: GoldenEingabe[] = [
  beschriftung("eigene Buchung", { is_own: true, type_name: "Einzel" }),
  beschriftung("fremde Buchung mit Namen", { owner_name: "Eva Muster" }),
  beschriftung("sucht Mitspieler", { partner_wanted: true, frei: 2 }),
  beschriftung("Training einer Serie", { kind: "blocking", series_id: "s", title: "Training" }),
  beschriftung("Sperrung mit Grund", { kind: "blocking", type_name: "Platzpflege", title: "Regen" }),
  beschriftung("Sperrung ohne Grund", { kind: "blocking", type_name: "Verbandsspiel", title: null }),
];

const blockingLabelFaelle: GoldenEingabe[] = [
  { name: "Kategorie und Grund, getrimmt", input: { b: { type_name: "Platzpflege", title: " Regen " } } },
  { name: "leerer Grund faellt weg", input: { b: { type_name: "Verbandsspiel", title: "  " } } },
  { name: "ohne Kategorie", input: { b: { type_name: null, title: null } } },
];

// booking.test.ts: EINZEL und DOPPEL
const EINZEL = { code: "einzel", name: "Einzel", durationMinutes: 60, minPlayers: 2, maxPlayers: 2, requiresPartner: true };
const DOPPEL = { code: "doppel", name: "Doppel", durationMinutes: 90, minPlayers: 3, maxPlayers: 4, requiresPartner: true };

const besetzung = (
  name: string, type: Record<string, unknown>, memberCount: number, guestCount: number, partnerWanted?: boolean,
): GoldenEingabe => ({
  name,
  input: partnerWanted === undefined
    ? { type, memberCount, guestCount }
    : { type, memberCount, guestCount, partnerWanted },
});

const checkPlayersFaelle: GoldenEingabe[] = [
  besetzung("Einzel ohne Mitspieler", EINZEL, 0, 0),
  besetzung("Einzel mit einem Mitglied", EINZEL, 1, 0),
  besetzung("Einzel mit einem Gast", EINZEL, 0, 1),
  besetzung("Einzel mit zu vielen", EINZEL, 2, 0),
  besetzung("Doppel mit vier", DOPPEL, 3, 0),
  besetzung("Doppel mit fuenf", DOPPEL, 4, 0),
  besetzung("Doppel mit einem Mitspieler: es fehlt noch einer", DOPPEL, 1, 0),
  besetzung("Doppel mit Mitglied und Gast", DOPPEL, 1, 1),
  besetzung("leeres Doppel: es fehlen zwei", DOPPEL, 0, 0),
  besetzung("Mitspieler gesucht: Doppel unterbesetzt", DOPPEL, 1, 0, true),
  besetzung("Mitspieler gesucht: Einzel allein", EINZEL, 0, 0, true),
  besetzung("Mitspieler gesucht: Obergrenze gilt", EINZEL, 2, 0, true),
];

const missingPlayersFaelle: GoldenEingabe[] = [
  besetzung("leeres Doppel", DOPPEL, 0, 0),
  besetzung("Doppel mit einem", DOPPEL, 1, 0),
  besetzung("Doppel mit Mitglied und Gast", DOPPEL, 1, 1),
  besetzung("leeres Einzel", EINZEL, 0, 0),
  besetzung("Einzel mit Gast", EINZEL, 0, 1),
  besetzung("Partner noetig, auch wenn min_players 1 waere", { ...EINZEL, minPlayers: 1 }, 0, 0),
  besetzung("ohne Partnerpflicht", { ...EINZEL, minPlayers: 1, requiresPartner: false }, 0, 0),
];

const otherPlayersLabelFaelle: GoldenEingabe[] = [
  { name: "Einzel", input: { type: EINZEL } },
  { name: "Doppel", input: { type: DOPPEL } },
  { name: "Doppel mit vier Pflicht", input: { type: { ...DOPPEL, minPlayers: 4 } } },
  { name: "ohne Untergrenze", input: { type: { ...DOPPEL, minPlayers: 1, requiresPartner: false } } },
  { name: "niemand kann mitspielen", input: { type: { ...EINZEL, minPlayers: 1, maxPlayers: 1, requiresPartner: false } } },
];

// booking.test.ts, umsetzZiele: Platz 1, 14 bis 15 Uhr am 15.06.2026
const umsetzSlot = (court: string, von: string, bis: string, id = "fremd") => ({
  booking_id: id,
  ...belegt(PLATZ_TAG, court, von, bis),
});
const UMSETZ_BUCHUNG = umsetzSlot("p1", "14:00", "15:00", "meine");
const umsetzen = (
  name: string, opts: { occupied?: unknown[]; jetzt?: string; day?: string } = {},
): GoldenEingabe => ({
  name,
  input: {
    booking: UMSETZ_BUCHUNG,
    day: opts.day ?? PLATZ_TAG,
    courtIds: ["p1", "p2"],
    openingMinutes: 480,
    closingMinutes: 1260,
    slotMinutes: 30,
    occupied: opts.occupied ?? [UMSETZ_BUCHUNG],
    now: um(PLATZ_TAG, opts.jetzt ?? "10:00"),
  },
});

const umsetzZieleFaelle: GoldenEingabe[] = [
  umsetzen("freie Plaetze und Zeiten, ohne die eigene Lage"),
  umsetzen("belegte Zeiten ueber die volle Dauer ausgelassen", {
    occupied: [UMSETZ_BUCHUNG, umsetzSlot("p2", "16:30", "17:30")],
  }),
  umsetzen("anderer Tag ohne Buchungsvorlauf", { day: "2026-07-20", occupied: [] }),
  umsetzen("laufende Buchung nur auf andere Plaetze zur selben Zeit", { jetzt: "14:20" }),
  umsetzen("laufende Buchung, anderer Platz belegt", {
    jetzt: "14:20", occupied: [UMSETZ_BUCHUNG, umsetzSlot("p2", "14:30", "15:30")],
  }),
  umsetzen("laufende Buchung nicht an einem anderen Tag", { jetzt: "14:20", day: "2026-06-16", occupied: [] }),
  umsetzen("vergangene Buchung hat keine Ziele", { jetzt: "15:00" }),
];

// ---------------------------------------------------------------------------
// Getraenke und Geld (drinks.test.ts, home.test.ts, money.test.ts)
// ---------------------------------------------------------------------------

const changeBasketFaelle: GoldenEingabe[] = [
  { name: "erster Artikel", input: { basket: {}, itemId: "bier", delta: 1 } },
  { name: "einer mehr", input: { basket: { bier: 1 }, itemId: "bier", delta: 1 } },
  { name: "einer weniger", input: { basket: { bier: 2 }, itemId: "bier", delta: -1 } },
  { name: "bei 0 faellt der Artikel heraus", input: { basket: { bier: 1 }, itemId: "bier", delta: -1 } },
  { name: "nicht unter 0", input: { basket: {}, itemId: "bier", delta: -1 } },
  { name: "begrenzt auf die Hoechstmenge", input: { basket: { bier: 50 }, itemId: "bier", delta: 1 } },
  { name: "anderer Artikel kommt dazu", input: { basket: { bier: 50 }, itemId: "wasser", delta: 1 } },
];

const sumOpenDrinksFaelle: GoldenEingabe[] = [
  {
    name: "zaehlt Zurueckgenommenes nicht mit",
    input: {
      kaeufe: [
        { total_cents: 250, voided_at: null },
        { total_cents: 180, voided_at: "2026-09-01T10:00:00Z" },
        { total_cents: 120, voided_at: null },
      ],
    },
  },
];

const formatCentsFaelle: GoldenEingabe[] = [
  { name: "Beitrag", input: { cents: 1900 } },
  { name: "null", input: { cents: 0 } },
  { name: "Cent", input: { cents: 5 } },
];

const chargeKindFaelle: GoldenEingabe[] = ["fee", "drinks", "work_duty", "event", "guest", "deposit", "misc"].map(
  (kind) => ({ name: kind, input: { kind } }),
);

// ---------------------------------------------------------------------------
// Texte (errors.test.ts, veranstaltungen-mitglieder.test.ts, zugang.test.ts,
// offeneSpiele.test.ts, merkmaltexte.test.ts, weiterleitung.test.ts)
// ---------------------------------------------------------------------------

const fehler = (name: string, error: unknown): GoldenEingabe => ({ name, input: { error } });

const translateDbErrorFaelle: GoldenEingabe[] = [
  fehler("Constraint am Namen in der Meldung", {
    message: 'duplicate key value violates unique constraint "members_email_key"',
    code: "23505",
  }),
  fehler("Constraint nur in details", {
    message: "irgendwas",
    details: "Key (member_id)=(…) conflicts with memberships_one_open_per_member",
  }),
  fehler("nuLiga-Id", { message: "members_nuliga_id_key" }),
  fehler("Notfallkontakt", { message: "members_emergency_contact_paarweise" }),
  fehler("RPC-Meldung mit Punkt wird durchgereicht", {
    message: "Der letzte Administrator kann die Rolle nicht abgeben.",
    code: "23514",
  }),
  fehler("Doppelbelegung einer Person wird durchgereicht", {
    message: "Robin Heinzler spielt zu dieser Zeit schon auf Platz 2.",
    code: "23514",
  }),
  fehler("Meldung ohne Satzzeichen nicht", { message: "something went wrong", code: "23514" }),
  fehler("Meldung mit violates nicht", {
    message: 'new row violates row-level security policy for table "members".',
    code: "42501",
  }),
  fehler("Fehlercode 42501", { code: "42501" }),
  fehler("Fehlercode 23P01", { code: "23P01" }),
  fehler("Fehlercode P0002", { code: "P0002" }),
  fehler("technischer Text mit unbekanntem Code", {
    message: "Cannot coerce the result to a single JSON object",
    code: "PGRST116",
  }),
  fehler("technischer Text ohne Code", { message: "permission denied for table members" }),
  ...[
    "TypeError: fetch failed",
    "TypeError: Failed to fetch",
    "NetworkError when attempting to fetch resource.",
    "Load failed",
    "Network request failed",
  ].map((message) => fehler(`keine Verbindung: ${message}`, { message, details: "", code: "" })),
  fehler("keine Verbindung in details", { message: "x", details: "Error: connect ECONNREFUSED 127.0.0.1:54321" }),
  fehler("leerer Fehler", {}),
  fehler("kein Fehler", null),
];

const fest = {
  id: "fest",
  status: "published",
  starts_at: "2026-11-06T18:00:00.000Z",
  ends_at: "2026-11-06T22:30:00.000Z",
};
const dienst = { ...fest, id: "dienst", starts_at: "2026-11-14T08:00:00.000Z", ends_at: "2026-11-14T12:00:00.000Z" };
const dezember = { ...fest, id: "dez", starts_at: "2026-12-11T18:00:00.000Z", ends_at: null };
const oktober = { ...fest, id: "okt", starts_at: "2026-10-10T16:00:00.000Z", ends_at: null };

const eventMonatsGruppenFaelle: GoldenEingabe[] = [
  {
    name: "Kommendes der Reihe nach",
    input: { liste: [dezember, dienst, fest, oktober], now: "2026-10-20T10:00:00.000Z" },
  },
  {
    name: "Vergangenes neueste zuerst",
    input: { liste: [oktober, fest, dienst], now: "2026-11-08T10:00:00.000Z", vergangen: true },
  },
];

const zugangsGrundFaelle: GoldenEingabe[] = [
  ...["archiviert", "gesperrt", "ausgetreten", "unbekannt"].map((wert) => ({
    name: `übernimmt ${wert}`,
    input: { wert },
  })),
  { name: "null", input: { wert: null } },
  { name: "fehlt", input: {} },
  { name: "leer", input: { wert: "" } },
  { name: "fremder Wert", input: { wert: "admin" } },
  { name: "Markup", input: { wert: "<script>" } },
];

const spiel = (frei: number, players: string[] = [], owner_name: string | null = "Robin Heinzler") => ({
  owner_name,
  players,
  frei,
});

const offenesSpielTextFaelle: GoldenEingabe[] = [
  { name: "sucht einen", input: { spiel: spiel(1) } },
  { name: "sucht drei", input: { spiel: spiel(3) } },
  { name: "eigene Buchung, einer", input: { spiel: spiel(1), eigenes: true } },
  { name: "eigene Buchung, zwei", input: { spiel: spiel(2), eigenes: true } },
  { name: "noch niemand dabei", input: { spiel: spiel(2) } },
  { name: "eine Person dabei", input: { spiel: spiel(1, ["Anna Schmidt"]) } },
  { name: "leere Namen fallen weg", input: { spiel: spiel(1, ["Anna Schmidt", "", "Max Gast"]) } },
  { name: "ohne Namen des Buchers", input: { spiel: spiel(1, [], null) } },
  { name: "Name des Buchers nur Leerzeichen", input: { spiel: spiel(1, [], "  ") } },
];

const FOTO =
  "Darf die Person auf Fotos der Website, in Aushängen und in der Presse erscheinen? " +
  "Bei Minderjährigen erteilen die Erziehungsberechtigten die Einwilligung.";
const BUCHUNGSMAIL =
  "Ob Änderungen an deinen Platzbuchungen zusätzlich per E-Mail kommen. In der App siehst du sie in jedem Fall.";

const merkmalBeschreibungFaelle: GoldenEingabe[] = [
  { name: "duzt das Mitglied im Konto", input: { code: "foto", beschreibung: FOTO, sicht: "mitglied" } },
  { name: "neutraler Text in der Verwaltung", input: { code: "foto", beschreibung: FOTO, sicht: "verwaltung" } },
  {
    name: "Verwaltung spricht nicht von deinen Buchungen",
    input: { code: "booking_mail", beschreibung: BUCHUNGSMAIL, sicht: "verwaltung" },
  },
  {
    name: "Mitglied behaelt den Buchungsmail-Text",
    input: { code: "booking_mail", beschreibung: BUCHUNGSMAIL, sicht: "mitglied" },
  },
  {
    name: "alter Text ohne Umlaute",
    input: {
      code: "booking_mail",
      beschreibung:
        "Ob Aenderungen an deinen Platzbuchungen zusaetzlich per E-Mail kommen. In der App siehst du sie in jedem Fall.",
      sicht: "verwaltung",
    },
  },
  { name: "vom Vorstand geaendert", input: { code: "foto", beschreibung: "Eigener Text.", sicht: "mitglied" } },
  {
    name: "unbekanntes Merkmal",
    input: { code: "ehrung", beschreibung: "Vom Verein verliehen.", sicht: "mitglied" },
  },
];

const sichererWeiterPfadFaelle: GoldenEingabe[] = [
  ...["/", "/plan", "/plan?tag=2026-10-20#oben", "/admin/mitglieder/abc"].map((wert) => ({
    name: `eigene Seite: ${wert}`,
    input: { wert },
  })),
  { name: "null", input: { wert: null } },
  { name: "fehlt", input: {} },
  { name: "leer", input: { wert: "" } },
  { name: "Zahl", input: { wert: 42 } },
  ...[
    "https://boese.example",
    "http://boese.example/plan",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "boese.example",
    "plan",
    "//boese.example",
    "///boese.example",
    "/\\boese.example",
    "/\\/boese.example",
    "/plan\\..\\x",
    "/\t/boese.example",
    "/\n/boese.example",
    "/\r/boese.example",
    "/plan\u0000",
  ].map((wert) => ({ name: `abgewiesen: ${JSON.stringify(wert)}`, input: { wert } })),
  { name: "eigener Fallback", input: { wert: "//boese.example", fallback: "/home" } },
];

/** Alle Dateien: Name der Datei (ohne .json) -> Faelle */
export const faelle: Record<string, GoldenEingabe[]> = {
  berlinTime: berlinTimeFaelle,
  minutesOf: minutesOfFaelle,
  minutesToTime: minutesToTimeFaelle,
  timeToMinutes: timeToMinutesFaelle,
  dayLabel: dayLabelFaelle,
  dayTag: dayTagFaelle,
  upcomingBookings: upcomingBookingsFaelle,
  canStartAt: canStartAtFaelle,
  freeCourtsNow: freeCourtsNowFaelle,
  freeSlotsOfDay: freeSlotsOfDayFaelle,
  courtStatusAt: courtStatusAtFaelle,
  occupancyKind: occupancyKindFaelle,
  bookingActions: bookingActionsFaelle,
  freeGaps: freeGapsFaelle,
  startInGap: startInGapFaelle,
  occupancyLabel: occupancyLabelFaelle,
  blockingLabel: blockingLabelFaelle,
  checkPlayers: checkPlayersFaelle,
  missingPlayers: missingPlayersFaelle,
  otherPlayersLabel: otherPlayersLabelFaelle,
  umsetzZiele: umsetzZieleFaelle,
  changeBasket: changeBasketFaelle,
  sumOpenDrinks: sumOpenDrinksFaelle,
  formatCents: formatCentsFaelle,
  CHARGE_KIND_LABEL: chargeKindFaelle,
  translateDbError: translateDbErrorFaelle,
  eventMonatsGruppen: eventMonatsGruppenFaelle,
  zugangsGrund: zugangsGrundFaelle,
  offenesSpielText: offenesSpielTextFaelle,
  merkmalBeschreibung: merkmalBeschreibungFaelle,
  sichererWeiterPfad: sichererWeiterPfadFaelle,
};
