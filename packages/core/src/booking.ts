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

export type BookingCheck =
  | { ok: true }
  | { ok: false; reason: string };

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Lokale Uhrzeit in Minuten seit Mitternacht, in Europe/Berlin. */
function localMinutes(date: Date): number {
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

export function checkSlot(
  startsAt: Date,
  type: BookingTypeInfo,
  rules: BookingRules,
  now: Date = new Date(),
): BookingCheck {
  if (startsAt.getTime() < now.getTime()) {
    return { ok: false, reason: "Dieser Zeitpunkt liegt in der Vergangenheit." };
  }

  const grenze = now.getTime() + rules.leadDays * 86_400_000;
  if (startsAt.getTime() > grenze) {
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

export function checkPlayers(
  type: BookingTypeInfo,
  memberCount: number,
  guestCount: number,
): BookingCheck {
  const gesamt = 1 + memberCount + guestCount;

  if (type.requiresPartner && gesamt < 2) {
    return {
      ok: false,
      reason: `Fuer "${type.name}" musst du mindestens einen Mitspieler angeben.`,
    };
  }
  if (gesamt < type.minPlayers) {
    return { ok: false, reason: `"${type.name}" braucht mindestens ${type.minPlayers} Spieler.` };
  }
  if (gesamt > type.maxPlayers) {
    return { ok: false, reason: `"${type.name}" erlaubt hoechstens ${type.maxPlayers} Spieler.` };
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
