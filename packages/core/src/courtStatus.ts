/**
 * Was ist auf einem Platz zu einer gewaehlten Uhrzeit los?
 *
 * Die Statuszeile der Platzliste ("frei 17:00 – 18:00", "belegt bis 19:00",
 * "Deine Buchung · 17:00", "Doppel sucht 1 · 17:00", "gesperrt · Grund").
 * Ob gebucht werden kann, entscheidet dieselbe Regel wie ueberall:
 * canStartAt. Durchgesetzt wird sie weiterhin nur in create_booking.
 */

import { berlinTime, canStartAt, minutesOf, minutesToTime, type OccupiedSlot } from "./booking";
import { occupancyKind, type OccupancyFlags } from "./home";

export type CourtStatusKind =
  | "frei"
  | "eigen"
  | "sucht"
  | "belegt"
  | "serie"
  | "gesperrt"
  /** Um diese Zeit ist nichts, aber eine volle Stunde passt nicht mehr hinein. */
  | "knapp"
  /** Die Zeit ist schon vorbei. */
  | "vorbei"
  /** Eine volle Stunde endete nach Schluss. */
  | "schluss";

export type CourtSlot = OccupiedSlot &
  OccupancyFlags & {
    title?: string | null;
    type_name?: string | null;
  };

export interface CourtStatus<T extends CourtSlot = CourtSlot> {
  art: CourtStatusKind;
  text: string;
  /** Die Belegung, um die es geht - zum Oeffnen im Blatt. */
  belegung?: T;
}

export function courtStatusAt<T extends CourtSlot>(opts: {
  day: string;
  courtId: string;
  minute: number;
  durationMinutes: number;
  closingMinutes: number;
  occupied: readonly T[];
  now?: Date;
}): CourtStatus<T> {
  const jetzt = opts.now ?? new Date();
  const eigene = opts.occupied
    .filter((b) => b.court_id === opts.courtId)
    .slice()
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  // Liegt zu dieser Minute etwas auf dem Platz?
  const jetztDa = eigene.find(
    (b) => minutesOf(b.starts_at) <= opts.minute && minutesOf(b.ends_at) > opts.minute,
  );
  if (jetztDa) return beschreibe(jetztDa);

  if (canStartAt({ ...opts, now: jetzt })) {
    const naechste = eigene.find((b) => minutesOf(b.starts_at) >= opts.minute);
    const bis = naechste ? minutesOf(naechste.starts_at) : opts.closingMinutes;
    return {
      art: "frei",
      text:
        bis >= opts.closingMinutes
          ? `frei bis ${minutesToTime(opts.closingMinutes)}`
          : `frei ${minutesToTime(opts.minute)} – ${minutesToTime(bis)}`,
    };
  }

  if (berlinTime(opts.day, opts.minute).getTime() < jetzt.getTime()) {
    return { art: "vorbei", text: "vorbei" };
  }
  if (opts.minute + opts.durationMinutes > opts.closingMinutes) {
    return { art: "schluss", text: `Schluss um ${minutesToTime(opts.closingMinutes)}` };
  }
  const gleichDanach = eigene.find(
    (b) => minutesOf(b.starts_at) > opts.minute && minutesOf(b.starts_at) < opts.minute + opts.durationMinutes,
  );
  if (!gleichDanach) return { art: "knapp", text: "nicht frei" };
  return {
    art: "knapp",
    text: `belegt ab ${minutesToTime(minutesOf(gleichDanach.starts_at))}`,
    belegung: gleichDanach,
  };
}

function beschreibe<T extends CourtSlot>(b: T): CourtStatus<T> {
  const von = minutesToTime(minutesOf(b.starts_at));
  const bis = minutesToTime(minutesOf(b.ends_at));
  const art = occupancyKind(b);
  switch (art) {
    case "gesperrt":
      return { art, text: `gesperrt · ${b.title?.trim() || "ohne Grund"}`, belegung: b };
    case "serie":
      return { art, text: `${b.title?.trim() || b.type_name || "Serie"} bis ${bis}`, belegung: b };
    case "eigen":
      return { art, text: `Deine Buchung · ${von}`, belegung: b };
    case "sucht":
      return { art, text: `${b.type_name ?? "Spiel"} sucht ${b.frei ?? 1} · ${von}`, belegung: b };
    default:
      return { art: "belegt", text: `belegt bis ${bis}`, belegung: b };
  }
}
