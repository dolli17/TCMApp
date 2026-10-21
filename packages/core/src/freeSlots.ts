/**
 * Die Startzeiten eines Tages mit dem Status jedes Platzes - fuer die Ansicht
 * "Freie Zeiten" (docs/design/clubhaus/plaetze, PlFreieZeiten).
 *
 * Eine Zeile je Startzeit: heute zuerst die naechste Startzeit im Raster
 * (um 14:10 also 14:30), danach volle Stunden bis Schluss minus Dauer. An
 * einem kommenden Tag ab der Oeffnung. Ein vergangener Tag hat keine Zeilen.
 *
 * Der Status je Platz kommt aus courtStatusAt, frei ist also, was canStartAt
 * erlaubt. Durchgesetzt wird die Regel weiterhin nur in create_booking.
 */

import {
  berlinTime, canStartAt, latestStart, minutesOf, minutesToTime, nextSlotMinute, type OccupiedSlot,
} from "./booking";
import { courtStatusAt, type CourtSlot, type CourtStatus } from "./courtStatus";
import { blockingLabel, occupancyKind, type TimelineKind } from "./home";

export interface FreeSlotRow<T extends CourtSlot = CourtSlot> {
  /** Startzeit in Minuten seit Mitternacht */
  minute: number;
  /** Ein Eintrag je Platz, in der Reihenfolge von courtIds */
  courts: { courtId: string; status: CourtStatus<T> }[];
  /** Wie viele Plaetze zu dieser Zeit frei sind */
  free: number;
}

export function freeSlotsOfDay<T extends CourtSlot>(opts: {
  day: string;
  courtIds: readonly string[];
  openingMinutes: number;
  closingMinutes: number;
  slotMinutes: number;
  durationMinutes: number;
  occupied: readonly T[];
  /** Abstand der Zeilen nach der ersten; Vorgabe eine volle Stunde */
  stepMinutes?: number;
  /** Buchungsvorlauf wie lead_days, siehe canStartAt. */
  leadDays?: number | undefined;
  now?: Date;
}): FreeSlotRow<T>[] {
  const jetzt = opts.now ?? new Date();
  const schritt = opts.stepMinutes ?? 60;
  const letzte = opts.closingMinutes - opts.durationMinutes;

  // Liegt der Schluss schon hinter uns, gibt es nichts mehr zu buchen.
  if (berlinTime(opts.day, opts.closingMinutes).getTime() <= jetzt.getTime()) return [];

  const heute = berlinTime(opts.day, 0).getTime() <= jetzt.getTime();
  const erste = heute
    ? nextSlotMinute({ openingMinutes: opts.openingMinutes, slotMinutes: opts.slotMinutes, now: jetzt })
    : opts.openingMinutes;

  const minuten: number[] = [];
  if (erste <= letzte) minuten.push(erste);
  for (let m = Math.floor(erste / schritt) * schritt + schritt; m <= letzte; m += schritt) {
    minuten.push(m);
  }

  return minuten.map((minute) => {
    const courts = opts.courtIds.map((courtId) => ({
      courtId,
      status: courtStatusAt({
        day: opts.day,
        courtId,
        minute,
        durationMinutes: opts.durationMinutes,
        closingMinutes: opts.closingMinutes,
        occupied: opts.occupied,
        leadDays: opts.leadDays,
        now: jetzt,
      }),
    }));
    return { minute, courts, free: courts.filter((c) => c.status.art === "frei").length };
  });
}

// ---------------------------------------------------------------------------
// Uebersicht als Raster (PlRaster)
// ---------------------------------------------------------------------------

export interface FreeGap {
  courtId: string;
  /** Fruehester Beginn im Raster, der canStartAt besteht */
  from: number;
  /** Beginn der naechsten Belegung, sonst Schluss */
  until: number;
}

/**
 * Die freien Flaechen eines Platzes, in die eine volle Buchung passt - im
 * Raster die Stellen, die sich antippen lassen. Heute erst ab der naechsten
 * Startzeit; eine Luecke kuerzer als die Dauer faellt weg.
 */
export function freeGaps(opts: {
  day: string;
  courtId: string;
  openingMinutes: number;
  closingMinutes: number;
  slotMinutes: number;
  durationMinutes: number;
  occupied: readonly OccupiedSlot[];
  /** Buchungsvorlauf wie lead_days, siehe canStartAt. */
  leadDays?: number | undefined;
  now?: Date;
}): FreeGap[] {
  const jetzt = opts.now ?? new Date();
  const out: FreeGap[] = [];
  let luecke: FreeGap | null = null;

  for (let m = opts.openingMinutes; m + opts.durationMinutes <= opts.closingMinutes; m += opts.slotMinutes) {
    if (canStartAt({ ...opts, minute: m, now: jetzt })) {
      if (luecke && m <= luecke.until - opts.durationMinutes + opts.slotMinutes) {
        luecke.until = Math.max(luecke.until, m + opts.durationMinutes);
        continue;
      }
      luecke = { courtId: opts.courtId, from: m, until: m + opts.durationMinutes };
      out.push(luecke);
    }
  }

  // Bis zur naechsten Belegung oder zum Schluss verlaengern - auch das
  // Stueck, in dem keine volle Stunde mehr beginnen kann, ist frei. Nicht
  // aber ueber den Vorlauf hinaus: dahinter laesst sich nichts antippen.
  const grenze = opts.leadDays === undefined ? null : latestStart(opts.leadDays, jetzt).getTime();
  const imVorlauf = (l: FreeGap) =>
    grenze !== null &&
    berlinTime(opts.day, l.until - opts.durationMinutes + opts.slotMinutes).getTime() > grenze;
  for (const l of out) {
    if (imVorlauf(l)) continue;
    const naechste = opts.occupied
      .filter((b) => b.court_id === opts.courtId && minutesOf(b.starts_at) >= l.until)
      .map((b) => minutesOf(b.starts_at));
    l.until = Math.min(opts.closingMinutes, ...naechste);
  }
  return out;
}

/**
 * Die Startzeit fuer eine angetippte Minute in einer Luecke: abgerundet aufs
 * Raster und so begrenzt, dass die volle Dauer hineinpasst.
 */
export function startInGap(gap: FreeGap, minute: number, slotMinutes: number, durationMinutes: number): number {
  const spaetestens = gap.from + Math.floor((gap.until - durationMinutes - gap.from) / slotMinutes) * slotMinutes;
  const gerastert = gap.from + Math.floor((minute - gap.from) / slotMinutes) * slotMinutes;
  return Math.min(spaetestens, Math.max(gap.from, gerastert));
}

export interface OccupancyLabel {
  art: TimelineKind;
  /** Erste Zeile im Block, fett */
  title: string;
  /** Zweite Zeile */
  detail: string;
  /** Fuer Screenreader, ohne Platz */
  spoken: string;
}

/**
 * Wie eine Belegung im Raster beschriftet ist: "Du / Einzel",
 * "[Name] / Doppel", "sucht 2 / Doppel", "Training / bis 19:00",
 * "Platzpflege / Grund" (Kategorie der Sperrung, darunter der Grund, falls es einen gibt).
 */
export function occupancyLabel(
  b: CourtSlot & { owner_name?: string | null },
): OccupancyLabel {
  const von = minutesToTime(minutesOf(b.starts_at));
  const bis = minutesToTime(minutesOf(b.ends_at));
  const art = occupancyKind(b);
  const typ = b.type_name ?? "Spiel";
  const zeit = `${von} bis ${bis} Uhr`;

  switch (art) {
    case "eigen":
      return { art, title: "Du", detail: typ, spoken: `${zeit}, deine Buchung, ${typ}` };
    case "sucht":
      return {
        art, title: `sucht ${b.frei ?? 1}`, detail: typ,
        spoken: `${zeit}, ${typ} sucht noch ${b.frei ?? 1} Mitspieler`,
      };
    case "serie": {
      const name = b.title?.trim() || b.type_name || "Serie";
      return { art, title: name, detail: `bis ${bis}`, spoken: `${zeit}, ${name}` };
    }
    case "gesperrt": {
      const { kategorie, grund } = blockingLabel(b);
      return {
        art, title: kategorie, detail: grund ?? "",
        spoken: `${zeit}, gesperrt, ${kategorie}${grund ? `, ${grund}` : ""}`,
      };
    }
    default: {
      const wer = b.owner_name?.trim() || "belegt";
      return { art, title: wer, detail: typ, spoken: `${zeit}, belegt von ${wer}, ${typ}` };
    }
  }
}
