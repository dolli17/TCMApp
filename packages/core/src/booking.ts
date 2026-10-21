/**
 * Buchungsregeln fuer die Oberflaeche
 *
 * WICHTIG: Das hier ist keine Absicherung. Durchgesetzt werden die Regeln
 * ausschliesslich in public.create_booking - es gibt bewusst keine
 * INSERT-Policy auf bookings, an der ein Client vorbeikommen koennte.
 *
 * Diese Funktionen dienen nur dazu, belegte oder unzulaessige Slots gar nicht
 * erst anklickbar zu machen und dem Mitglied den Grund zu nennen, bevor es
 * absendet. Weicht das Ergebnis von der Datenbank ab, gilt die Datenbank.
 */

export interface BookingRules {
  maxOpenBookings: number;
  leadDays: number;
  openingTime: string; // "08:00"
  closingTime: string; // "21:00"
  slotMinutes: number;
}

export interface BookingTypeInfo {
  code: string;
  name: string;
  durationMinutes: number;
  minPlayers: number;
  maxPlayers: number;
  requiresPartner: boolean;
}

/** Eine Zeile aus booking_types, wie Web und App sie laden. */
export interface BookingTypeRow {
  code: string;
  name: string;
  duration_minutes: number;
  min_players: number;
  max_players: number;
  requires_partner: boolean;
}

export function bookingTypeInfo(row: BookingTypeRow): BookingTypeInfo {
  return {
    code: row.code,
    name: row.name,
    durationMinutes: row.duration_minutes,
    minPlayers: row.min_players,
    maxPlayers: row.max_players,
    requiresPartner: row.requires_partner,
  };
}

export type BookingCheck =
  | { ok: true }
  | { ok: false; reason: string };

/** "08:30" → 510. */
export function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** 510 → "08:30". */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Uhrzeit in Minuten seit Mitternacht, gerechnet in Europe/Berlin. */
export function localMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

/** Dasselbe für einen ISO-Zeitstempel aus der Datenbank. */
export function minutesOf(iso: string): number {
  return localMinutes(new Date(iso));
}

/**
 * Wie weit liegt die Berliner Wanduhr zu diesem Zeitpunkt vor UTC?
 *
 * Im Winter 60 Minuten, im Sommer 120. Ermittelt wird das, indem dieselbe
 * Sekunde einmal in Berliner Zeit ausgelesen und wieder als UTC gelesen wird –
 * die Differenz ist der Versatz.
 */
function berlinOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const teil = (name: string) => Number(parts.find((p) => p.type === name)?.value ?? "0");
  // 24 statt 0 kommt bei Mitternacht vor, je nach Laufzeitumgebung.
  const stunde = teil("hour") % 24;

  const alsWaereBerlinUtc = Date.UTC(
    teil("year"),
    teil("month") - 1,
    teil("day"),
    stunde,
    teil("minute"),
    teil("second"),
  );

  return Math.round((alsWaereBerlinUtc - at.getTime()) / 60_000);
}

/**
 * Aus Tag und Uhrzeit den echten Zeitpunkt machen – in Europe/Berlin, nicht in
 * der Zeitzone des Geräts.
 *
 * Das ist der Weg zurück zu `minutesOf`. Ohne ihn schickt ein Telefon, das auf
 * einer anderen Zeitzone steht, eine um Stunden verschobene Startzeit an die
 * Datenbank – die Regeln dort rechnen in Berliner Zeit, und die Buchung landet
 * an der falschen Stelle oder wird grundlos abgewiesen.
 *
 * Der Versatz wird zweimal bestimmt: einmal grob aus der als UTC gelesenen
 * Zeit, dann noch einmal mit dem so gewonnenen Zeitpunkt. Nur dadurch stimmt
 * auch die Stunde nach einer Zeitumstellung. In der Stunde, die es zweimal
 * gibt, entscheidet sich das Ergebnis für die erste – Buchungen laufen von 8
 * bis 21 Uhr, der Sprung liegt um 3 Uhr nachts.
 */
export function berlinTime(dayIso: string, minutes: number): Date {
  const [jahr, monat, tag] = dayIso.split("-").map(Number);
  const stunde = Math.floor(minutes / 60);
  const minute = minutes % 60;

  const naiv = Date.UTC(jahr ?? 1970, (monat ?? 1) - 1, tag ?? 1, stunde, minute);
  const ersterVersuch = new Date(naiv - berlinOffsetMinutes(new Date(naiv)) * 60_000);
  return new Date(naiv - berlinOffsetMinutes(ersterVersuch) * 60_000);
}

/**
 * Der spaeteste Beginn, den create_booking jetzt noch annimmt: now() plus
 * lead_days Tage.
 *
 * Die Datenbank rechnet in UTC, ein Tag sind dort immer 24 Stunden. Ueber
 * eine Zeitumstellung hinweg verschiebt sich die Grenze deshalb auf der
 * Berliner Uhr um eine Stunde: am 18.10. um 10:00 reicht der Vorlauf bis
 * zum 25.10. um 09:00.
 */
export function latestStart(leadDays: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + leadDays * 86_400_000);
}

export function checkSlot(
  startsAt: Date,
  type: BookingTypeInfo,
  rules: BookingRules,
  now: Date = new Date(),
): BookingCheck {
  if (startsAt.getTime() < now.getTime()) {
    return { ok: false, reason: "Dieser Zeitpunkt liegt in der Vergangenheit." };
  }

  if (startsAt.getTime() > latestStart(rules.leadDays, now).getTime()) {
    return {
      ok: false,
      reason: `Es kann hoechstens ${rules.leadDays} Tage im Voraus gebucht werden.`,
    };
  }

  const start = localMinutes(startsAt);
  if (start % rules.slotMinutes !== 0) {
    return {
      ok: false,
      reason: `Startzeit muss auf ein ${rules.slotMinutes}-Minuten-Raster fallen.`,
    };
  }

  const ende = start + type.durationMinutes;
  if (start < timeToMinutes(rules.openingTime)) {
    return { ok: false, reason: `Vor ${rules.openingTime} wird nicht gespielt.` };
  }
  if (ende > timeToMinutes(rules.closingTime)) {
    return { ok: false, reason: `Die Buchung endet nach ${rules.closingTime} Uhr.` };
  }

  return { ok: true };
}

/**
 * Wie viele Mitspieler fehlen noch bis zur Untergrenze? Der Bucher zaehlt
 * mit; eine Spielform mit requires_partner braucht mindestens zwei Leute,
 * auch wenn min_players niedriger steht.
 */
export function missingPlayers(
  type: BookingTypeInfo,
  memberCount: number,
  guestCount: number,
): number {
  const gesamt = 1 + memberCount + guestCount;
  const mindestens = Math.max(type.minPlayers, type.requiresPartner ? 2 : 1);
  return Math.max(mindestens - gesamt, 0);
}

/**
 * Passt die Besetzung zur Spielform? Dieselben Grenzen wie create_booking:
 * wer Mitspieler sucht, darf unterbesetzt buchen, die Obergrenze gilt immer.
 */
export function checkPlayers(
  type: BookingTypeInfo,
  memberCount: number,
  guestCount: number,
  partnerWanted = false,
): BookingCheck {
  const gesamt = 1 + memberCount + guestCount;

  const fehlen = partnerWanted ? 0 : missingPlayers(type, memberCount, guestCount);
  if (fehlen > 0) {
    const mindestens = Math.max(type.minPlayers, type.requiresPartner ? 2 : 1);
    const rest = fehlen === 1 ? "es fehlt noch ein Mitspieler" : `es fehlen noch ${fehlen} Mitspieler`;
    return {
      ok: false,
      reason: `„${type.name}“ braucht mindestens ${mindestens} Spieler – ${rest}.`,
    };
  }
  if (gesamt > type.maxPlayers) {
    return { ok: false, reason: `„${type.name}“ erlaubt höchstens ${type.maxPlayers} Spieler.` };
  }
  return { ok: true };
}

export function checkQuota(used: number, allowed: number): BookingCheck {
  if (used >= allowed) {
    return {
      ok: false,
      reason: `Du hast bereits ${allowed} offene Buchungen. Storniere eine, um neu zu buchen.`,
    };
  }
  return { ok: true };
}

/** Alle waehlbaren Startzeiten eines Tages im erlaubten Raster. */
export function slotsForDay(
  day: Date,
  type: BookingTypeInfo,
  rules: BookingRules,
): Date[] {
  const out: Date[] = [];
  const oeffnung = timeToMinutes(rules.openingTime);
  const schluss = timeToMinutes(rules.closingTime);

  for (let m = oeffnung; m + type.durationMinutes <= schluss; m += rules.slotMinutes) {
    const d = new Date(day);
    d.setHours(Math.floor(m / 60), m % 60, 0, 0);
    out.push(d);
  }
  return out;
}

/** Eine Belegung, wie day_schedule sie liefert - nur was die Frei-Rechnung braucht. */
export interface OccupiedSlot {
  court_id: string;
  starts_at: string;
  ends_at: string;
}

/**
 * Kann auf diesem Platz um genau diese Minute eine Buchung beginnen?
 *
 * Geprueft wird gegen die volle Dauer, nicht nur gegen die Startminute -
 * sonst liesse sich 18:00 waehlen, obwohl 18:30 schon belegt ist. Jede
 * Belegung zaehlt, auch Sperrungen und Serien.
 *
 * Stand vorher je einmal im Belegungsplan des Webs und in der App; die
 * Startseite braucht dieselbe Regel ein drittes Mal.
 */
export function canStartAt(opts: {
  day: string;
  courtId: string;
  minute: number;
  durationMinutes: number;
  closingMinutes: number;
  occupied: readonly OccupiedSlot[];
  /** Buchungsvorlauf wie lead_days; ohne Angabe keine Grenze (Umsetzen kennt keinen). */
  leadDays?: number | undefined;
  now?: Date;
}): boolean {
  const jetzt = opts.now ?? new Date();
  const beginn = berlinTime(opts.day, opts.minute).getTime();
  if (beginn < jetzt.getTime()) return false;
  if (opts.leadDays !== undefined && beginn > latestStart(opts.leadDays, jetzt).getTime()) return false;
  if (opts.minute + opts.durationMinutes > opts.closingMinutes) return false;
  return !opts.occupied.some(
    (b) =>
      b.court_id === opts.courtId &&
      minutesOf(b.starts_at) < opts.minute + opts.durationMinutes &&
      minutesOf(b.ends_at) > opts.minute,
  );
}

/**
 * Die naechste Startzeit im Raster ab jetzt - vor der Oeffnung die Oeffnung.
 * Bei 30 Minuten um 15:10 also 15:30, um 15:30 genau 15:30.
 */
export function nextSlotMinute(opts: {
  openingMinutes: number;
  slotMinutes: number;
  now?: Date;
}): number {
  const zeit = opts.now ?? new Date();
  // Angebrochene Minuten zaehlen als vorbei: um 13:30:20 ist 13:30 schon
  // Vergangenheit, und canStartAt wuerde die Zeit zu Recht ablehnen.
  const angebrochen = zeit.getUTCSeconds() > 0 || zeit.getUTCMilliseconds() > 0 ? 1 : 0;
  const jetzt = localMinutes(zeit) + angebrochen;
  if (jetzt <= opts.openingMinutes) return opts.openingMinutes;
  return opts.openingMinutes + Math.ceil((jetzt - opts.openingMinutes) / opts.slotMinutes) * opts.slotMinutes;
}

export interface FreeWindow {
  courtId: string;
  /** Erste Startzeit im Raster ab jetzt, in Minuten seit Mitternacht */
  fromMinute: number;
  /** Beginn der naechsten Belegung auf diesem Platz, sonst Schluss */
  untilMinute: number;
}

/**
 * Welche Plaetze sind ab jetzt frei - und bis wann?
 *
 * "Ab jetzt" heisst: ab der naechsten Startzeit im Raster (bei 30 Minuten um
 * 15:10 also 15:30), frueh am Morgen ab der Oeffnung. Frei ist ein Platz, wenn
 * dort zu dieser Zeit eine Buchung beginnen koennte - dieselbe Regel wie
 * canStartAt. Frei bis zur naechsten Belegung, sonst bis zum Schluss.
 *
 * Sortiert nach der laengsten freien Zeit; bei Gleichstand bleibt die
 * Reihenfolge der Plaetze.
 */
export function freeCourtsNow(opts: {
  day: string;
  courtIds: readonly string[];
  openingMinutes: number;
  closingMinutes: number;
  slotMinutes: number;
  durationMinutes: number;
  occupied: readonly OccupiedSlot[];
  leadDays?: number | undefined;
  now?: Date;
}): FreeWindow[] {
  const jetzt = opts.now ?? new Date();
  const ab = nextSlotMinute({ ...opts, now: jetzt });

  const out: FreeWindow[] = [];
  for (const courtId of opts.courtIds) {
    const frei = canStartAt({
      day: opts.day,
      courtId,
      minute: ab,
      durationMinutes: opts.durationMinutes,
      closingMinutes: opts.closingMinutes,
      occupied: opts.occupied,
      leadDays: opts.leadDays,
      now: jetzt,
    });
    if (!frei) continue;

    const naechste = opts.occupied
      .filter((b) => b.court_id === courtId && minutesOf(b.ends_at) > ab)
      .map((b) => minutesOf(b.starts_at));
    out.push({ courtId, fromMinute: ab, untilMinute: Math.min(opts.closingMinutes, ...naechste) });
  }

  return out
    .map((f, i) => ({ f, i }))
    .sort((a, b) => b.f.untilMinute - a.f.untilMinute || a.i - b.i)
    .map(({ f }) => f);
}

/** Eine Buchung, die umgesetzt werden soll - wie day_schedule sie liefert. */
export interface UmsetzBuchung extends OccupiedSlot {
  booking_id: string;
}

export interface UmsetzZiel {
  courtId: string;
  /** Startzeit in Minuten seit Mitternacht (Berlin) */
  minute: number;
}

const berlinTag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" });

/**
 * Wohin laesst sich eine Buchung umsetzen?
 *
 * Dieselbe Frei-Regel wie canStartAt, nur ohne die Buchung selbst: wer eine
 * halbe Stunde nach hinten rutscht, ueberschneidet sich allein mit der eigenen
 * alten Lage. Die Dauer bleibt. Die Lage, in der die Buchung schon liegt,
 * zaehlt nicht als Ziel.
 *
 * Eine laufende Buchung darf nur den Platz wechseln: dann kommen nur andere
 * Plaetze zur selben Zeit in Frage, und nur am Tag der Buchung. Eine
 * vergangene Buchung hat keine Ziele. Den Buchungsvorlauf gibt es beim
 * Umsetzen nicht.
 *
 * Wie bei canStartAt: occupied ist die Belegung des Zieltags, courtIds sind
 * die aktiven Plaetze. Durchgesetzt wird alles in public.move_booking.
 */
export function umsetzZiele(opts: {
  booking: UmsetzBuchung;
  day: string;
  courtIds: readonly string[];
  openingMinutes: number;
  closingMinutes: number;
  slotMinutes: number;
  occupied: readonly (OccupiedSlot & { booking_id?: string | null })[];
  now?: Date;
}): UmsetzZiel[] {
  const jetzt = opts.now ?? new Date();
  const beginn = new Date(opts.booking.starts_at);
  const ende = new Date(opts.booking.ends_at);
  if (ende.getTime() <= jetzt.getTime()) return [];

  const dauer = Math.round((ende.getTime() - beginn.getTime()) / 60_000);
  const andere = opts.occupied.filter((b) => b.booking_id !== opts.booking.booking_id);
  const out: UmsetzZiel[] = [];

  if (beginn.getTime() <= jetzt.getTime()) {
    if (opts.day !== berlinTag.format(beginn)) return [];
    const minute = minutesOf(opts.booking.starts_at);
    for (const courtId of opts.courtIds) {
      if (courtId === opts.booking.court_id) continue;
      // Die Zeit steht schon fest: weder Vergangenheit noch Schluss sind hier
      // eine Frage, nur ob der Platz frei ist.
      const frei = canStartAt({
        day: opts.day,
        courtId,
        minute,
        durationMinutes: dauer,
        closingMinutes: Number.POSITIVE_INFINITY,
        occupied: andere,
        now: beginn,
      });
      if (frei) out.push({ courtId, minute });
    }
    return out;
  }

  // Das Raster zaehlt wie in der Datenbank ab Mitternacht, nicht ab Oeffnung.
  const erste = Math.ceil(opts.openingMinutes / opts.slotMinutes) * opts.slotMinutes;
  for (const courtId of opts.courtIds) {
    for (let minute = erste; minute + dauer <= opts.closingMinutes; minute += opts.slotMinutes) {
      const dortSchon =
        courtId === opts.booking.court_id &&
        berlinTime(opts.day, minute).getTime() === beginn.getTime();
      if (dortSchon) continue;
      const frei = canStartAt({
        day: opts.day,
        courtId,
        minute,
        durationMinutes: dauer,
        closingMinutes: opts.closingMinutes,
        occupied: andere,
        now: jetzt,
      });
      if (frei) out.push({ courtId, minute });
    }
  }
  return out;
}

/** Was der Betrachter an einer Buchung tun darf. */
export interface BookingActions {
  /** Stornieren (cancel_booking) */
  cancel: boolean;
  /** Mitspieler aendern (update_booking_players) */
  editPlayers: boolean;
  /** Sich als Mitspieler austragen (leave_booking) */
  leave: boolean;
  /** Sich als Mitspieler eintragen (join_booking) */
  join: boolean;
}

/**
 * Welche Knoepfe eine Buchung bekommt - abgelesen aus den RPCs, damit Web
 * und App nichts anbieten, was die Datenbank ablehnt.
 *
 * Begonnen ist eine Buchung ab ihrem Beginn (lower(slot) <= now()). Danach
 * duerfen nur noch Platzrechte (darf_plaetze) stornieren und die Besetzung
 * aendern - etwa wenn ein Platz waehrend der Spielzeit gesperrt wird.
 * Austragen und Mitspielen enden mit dem Beginn fuer alle.
 *
 * Nicht geprueft wird, was die Liste nicht weiss: ob nach dem Austragen
 * noch genug Spieler bleiben oder ob das Kontingent reicht. Das sagt die
 * Datenbank beim Absenden.
 */
export function bookingActions(opts: {
  startsAt: string | Date;
  /** Der Betrachter hat gebucht. */
  own: boolean;
  /** Der Betrachter ist als Mitspieler eingetragen. */
  joined?: boolean;
  partnerWanted?: boolean;
  /** Freie Plaetze bis max_players */
  free?: number;
  /** Platzrechte: Admin oder Platzwart */
  managesCourts?: boolean;
  now?: Date;
}): BookingActions {
  const jetzt = opts.now ?? new Date();
  const begonnen = new Date(opts.startsAt).getTime() <= jetzt.getTime();
  const platzrechte = opts.managesCourts === true;
  const verwalten = (opts.own || platzrechte) && (!begonnen || platzrechte);
  return {
    cancel: verwalten,
    editPlayers: verwalten,
    leave: !opts.own && opts.joined === true && !begonnen,
    join:
      !opts.own && opts.joined !== true && opts.partnerWanted === true &&
      (opts.free ?? 0) > 0 && !begonnen,
  };
}
