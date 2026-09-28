/**
 * Aufbereitung fuer die Startseite
 *
 * Reine Funktionen, die App und Web gleich brauchen: welche Termine noch
 * kommen, wie ein Termin ueberschrieben wird, wie alt eine Nachricht ist, was
 * im Monat an Getraenken aufgelaufen ist und wie eine Belegung auf der kleinen
 * Zeitleiste liegt. Gerechnet wird in Europe/Berlin, wie ueberall.
 */

import { minutesOf } from "./booking";

const BERLIN = "Europe/Berlin";
const tagFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: BERLIN });
const wochentagLang = new Intl.DateTimeFormat("de-DE", { weekday: "long", timeZone: BERLIN });
const wochentagKurz = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: BERLIN });
/** "30.09." - der Schlusspunkt kommt von Intl selbst */
const tagMonat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: BERLIN });

/** "2026-09-28" fuer diesen Zeitpunkt in Berlin */
export function berlinDay(zeit: Date): string {
  return tagFormat.format(zeit);
}

/** Abstand in Kalendertagen (Berlin) von a nach b */
function tageZwischen(a: Date, b: Date): number {
  const tag = (d: Date) => Date.parse(berlinDay(d) + "T00:00:00Z");
  return Math.round((tag(b) - tag(a)) / 86_400_000);
}

/** Wochentag ohne den Punkt, den Intl anhaengt: "Mi" statt "Mi." */
function kurzerWochentag(zeit: Date): string {
  return wochentagKurz.format(zeit).replace(".", "");
}

/** Termine, die noch nicht vorbei sind, der naechste zuerst. */
export function upcomingBookings<T extends { starts_at: string; ends_at: string }>(
  termine: readonly T[],
  now: Date = new Date(),
): T[] {
  return termine
    .filter((t) => new Date(t.ends_at).getTime() > now.getTime())
    .slice()
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/**
 * Die Zeile ueber der Uhrzeit einer Terminkarte.
 *
 * Heute: wie lange noch ("Heute · in 3 Stunden", "Heute · läuft gerade").
 * Morgen: "Morgen". Danach Wochentag und Datum: "Mittwoch · 30.09.".
 */
export function bookingKicker(startsAt: string, endsAt: string, now: Date = new Date()): string {
  const beginn = new Date(startsAt);
  const tage = tageZwischen(now, beginn);

  if (tage <= 0) {
    if (beginn.getTime() <= now.getTime()) {
      return new Date(endsAt).getTime() > now.getTime() ? "Heute · läuft gerade" : "Heute";
    }
    const minuten = Math.round((beginn.getTime() - now.getTime()) / 60_000);
    if (minuten < 60) return `Heute · in ${minuten} ${minuten === 1 ? "Minute" : "Minuten"}`;
    const stunden = Math.round(minuten / 60);
    return `Heute · in ${stunden} ${stunden === 1 ? "Stunde" : "Stunden"}`;
  }
  if (tage === 1) return "Morgen";
  return `${wochentagLang.format(beginn)} · ${tagMonat.format(beginn)}`;
}

/** Der Tag eines Termins in Worten: "Heute", "Morgen", "Donnerstag, 01.10." */
export function dayLabel(startsAt: string, now: Date = new Date()): string {
  const beginn = new Date(startsAt);
  const tage = tageZwischen(now, beginn);
  if (tage === 0) return "Heute";
  if (tage === 1) return "Morgen";
  return `${wochentagLang.format(beginn)}, ${tagMonat.format(beginn)}`;
}

/** Kurzer Tag fuer die Datumsmarke eines offenen Spiels: "HEUTE", "MORGEN", "MI". */
export function dayTag(startsAt: string, now: Date = new Date()): string {
  const tage = tageZwischen(now, new Date(startsAt));
  if (tage <= 0) return "HEUTE";
  if (tage === 1) return "MORGEN";
  return kurzerWochentag(new Date(startsAt)).toUpperCase();
}

/**
 * Wie alt ist eine Nachricht? "gerade eben", "vor 5 Min.", "vor 2 Std.",
 * "gestern", innerhalb einer Woche der Wochentag ("Sa"), danach das Datum.
 */
export function relativeTimeLabel(iso: string, now: Date = new Date()): string {
  const zeit = new Date(iso);
  const minuten = Math.floor((now.getTime() - zeit.getTime()) / 60_000);
  const tage = tageZwischen(zeit, now);

  if (tage <= 0) {
    if (minuten < 1) return "gerade eben";
    if (minuten < 60) return `vor ${minuten} Min.`;
    return `vor ${Math.floor(minuten / 60)} Std.`;
  }
  if (tage === 1) return "gestern";
  if (tage < 7) return kurzerWochentag(zeit);
  return tagMonat.format(zeit);
}

/** Summe der Getraenke, die nicht zurueckgenommen wurden. */
export function sumOpenDrinks(
  kaeufe: readonly { total_cents: number | null; voided_at: string | null }[],
): number {
  return kaeufe.reduce((s, k) => s + (k.voided_at ? 0 : (k.total_cents ?? 0)), 0);
}

export type TimelineKind = "belegt" | "eigen" | "sucht" | "serie" | "gesperrt";

/** Was eine Belegung ausmacht, soweit es fuer ihre Einordnung zaehlt. */
export interface OccupancyFlags {
  kind?: string | null;
  is_own?: boolean | null;
  partner_wanted?: boolean | null;
  frei?: number | null;
  series_id?: string | null;
}

/**
 * Die Art einer Belegung nach der Statustabelle im Handoff. Die Reihenfolge
 * zaehlt: Serientermine (Training) legt die Datenbank als kind = "blocking"
 * mit series_id an - die Serie muss deshalb vor der Sperrung stehen, sonst
 * sieht jedes Training aus wie eine Sperrung. Eine Sperrung ist nie "eigen",
 * und eine eigene Buchung, die Mitspieler sucht, bleibt fuer den Bucher
 * "eigen".
 */
export function occupancyKind(b: OccupancyFlags): TimelineKind {
  if (b.series_id) return "serie";
  if (b.kind === "blocking") return "gesperrt";
  if (b.is_own) return "eigen";
  if (b.partner_wanted && (b.frei ?? 0) > 0) return "sucht";
  return "belegt";
}

export interface TimelineSegment {
  /** Anteil vom linken Rand, 0 bis 100 */
  left: number;
  /** Breite, 0 bis 100 */
  width: number;
  art: TimelineKind;
}

/**
 * Wo eine Belegung auf der Zeitleiste von Oeffnung bis Schluss liegt, in
 * Prozent - fuer die Zeitleisten der Plaetze. Die Art folgt der Statustabelle
 * im Handoff: Sperrung, Serie (Training), eigene Buchung, Mitspieler gesucht,
 * sonst belegt. Serie und Sperrung sehen verschieden aus - die Serie
 * schraffiert, die Sperrung flach.
 */
export function timelineSegments(
  belegungen: readonly ({ starts_at: string; ends_at: string } & OccupancyFlags)[],
  openingMinutes: number,
  closingMinutes: number,
): TimelineSegment[] {
  const spanne = closingMinutes - openingMinutes;
  if (spanne <= 0) return [];

  return belegungen.flatMap((b) => {
    const von = Math.max(openingMinutes, minutesOf(b.starts_at));
    const bis = Math.min(closingMinutes, minutesOf(b.ends_at));
    if (bis <= von) return [];

    return [{
      left: ((von - openingMinutes) / spanne) * 100,
      width: ((bis - von) / spanne) * 100,
      art: occupancyKind(b),
    }];
  });
}

/** Position einer Minute auf derselben Zeitleiste, in Prozent (0 bis 100). */
export function timelinePosition(minute: number, openingMinutes: number, closingMinutes: number): number {
  const spanne = closingMinutes - openingMinutes;
  if (spanne <= 0) return 0;
  return Math.min(100, Math.max(0, ((minute - openingMinutes) / spanne) * 100));
}

// ---------------------------------------------------------------------------
// Benachrichtigungen
// ---------------------------------------------------------------------------

/** Welches Symbol eine Nachricht bekommt, nach ihrer Art (notifications.kind). */
export type NotificationSymbol = "platz" | "storno" | "geld" | "person" | "glocke";

export function notificationSymbol(kind: string): NotificationSymbol {
  if (kind === "booking_cancelled" || kind === "booking_displaced" || kind === "booking_removed") return "storno";
  if (kind.startsWith("booking_") || kind === "player_left") return "platz";
  if (kind.startsWith("charge_")) return "geld";
  if (kind.startsWith("application_")) return "person";
  return "glocke";
}

/**
 * Nachrichten nach Tagen gruppiert (Berlin): Heute, Gestern, Diese Woche
 * (die letzten sieben Tage), Frueher. Leere Gruppen fallen weg; die
 * Reihenfolge innerhalb bleibt, wie sie kam (neueste zuerst).
 */
export function groupNotifications<T extends { created_at: string }>(
  list: readonly T[],
  now: Date = new Date(),
): { label: string; items: T[] }[] {
  const gruppen = [
    { label: "Heute", items: [] as T[] },
    { label: "Gestern", items: [] as T[] },
    { label: "Diese Woche", items: [] as T[] },
    { label: "Früher", items: [] as T[] },
  ];
  for (const n of list) {
    const tage = tageZwischen(new Date(n.created_at), now);
    const i = tage <= 0 ? 0 : tage === 1 ? 1 : tage < 7 ? 2 : 3;
    gruppen[i]!.items.push(n);
  }
  return gruppen.filter((g) => g.items.length > 0);
}
