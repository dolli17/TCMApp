/**
 * Gemeinsames Vokabular des Belegungsplans.
 *
 * Liegt hier und nicht in app/plan.tsx, damit das Buchungsfenster dieselben
 * Typen und Zeitrechnungen benutzen kann, ohne dass zwei Bildschirme
 * gegenseitig voneinander importieren.
 */

import { minutesOf, minutesToTime, timeToMinutes } from "@tcm/core";

import type { ladeBuchungsarten, ladeTagesplan, ladeVerzeichnis } from "./daten";

export type Belegung = Awaited<ReturnType<typeof ladeTagesplan>>[number];
export type Buchungsart = Awaited<ReturnType<typeof ladeBuchungsarten>>[number];
export type Mitglied = Awaited<ReturnType<typeof ladeVerzeichnis>>[number];

/** Was im Fenster gerade bearbeitet wird. */
export type Fenster =
  | { modus: "buchen"; courtId: string; platzName: string; stunde: number; startzeiten: number[] }
  | { modus: "verwalten"; belegung: Belegung; platzName: string };

// Die drei Zeitrechnungen standen hier und in der Web-App je einmal nachgebaut.
// Dieselbe Regel an zwei Stellen heisst frueher oder spaeter: zwei Regeln - und
// genau so ist es passiert, als die Web-App die Zeitzone beruecksichtigte und
// diese hier nicht. Jetzt kommen sie aus @tcm/core, wo sie unter Test stehen.

/** Minuten seit Mitternacht in deutscher Ortszeit. */
export const lokaleMinuten = minutesOf;

export const alsUhrzeit = minutesToTime;

export const zuMinuten = (hhmm: string) => timeToMinutes(String(hhmm));
