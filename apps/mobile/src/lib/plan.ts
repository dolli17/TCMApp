/**
 * Gemeinsames Vokabular des Belegungsplans.
 *
 * Liegt hier und nicht in app/plan.tsx, damit das Buchungsfenster dieselben
 * Typen und Zeitrechnungen benutzen kann, ohne dass zwei Bildschirme
 * gegenseitig voneinander importieren.
 */

import type { ladeBuchungsarten, ladeTagesplan, ladeVerzeichnis } from "./daten";

export type Belegung = Awaited<ReturnType<typeof ladeTagesplan>>[number];
export type Buchungsart = Awaited<ReturnType<typeof ladeBuchungsarten>>[number];
export type Mitglied = Awaited<ReturnType<typeof ladeVerzeichnis>>[number];

/** Was im Fenster gerade bearbeitet wird. */
export type Fenster =
  | { modus: "buchen"; courtId: string; platzName: string; stunde: number; startzeiten: number[] }
  | { modus: "verwalten"; belegung: Belegung; platzName: string };

/** Minuten seit Mitternacht in deutscher Ortszeit. */
export function lokaleMinuten(iso: string): number {
  const teile = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const h = Number(teile.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(teile.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export const alsUhrzeit = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export const zuMinuten = (hhmm: string) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
