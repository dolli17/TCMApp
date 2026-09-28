/**
 * Gemeinsames Vokabular des Belegungsplans.
 *
 * Liegt hier und nicht in app/plan.tsx, damit das Buchungsfenster dieselben
 * Typen und Zeitrechnungen benutzen kann, ohne dass zwei Bildschirme
 * gegenseitig voneinander importieren.
 */

import { canStartAt, freeCourtsNow, minutesOf, minutesToTime, timeToMinutes } from "@tcm/core";

import type { ladeBuchungsarten, ladeTagesplan, ladeVerzeichnis } from "./daten";

export type Belegung = Awaited<ReturnType<typeof ladeTagesplan>>[number];
export type Buchungsart = Awaited<ReturnType<typeof ladeBuchungsarten>>[number];
export type Mitglied = Awaited<ReturnType<typeof ladeVerzeichnis>>[number];

/**
 * Was im Blatt gerade bearbeitet wird.
 *
 * buchen: stunde ist der Anzeigeblock (bei 60 Minuten 17:00-18:00), aus dem
 * das Segment "Beginn" seine :00/:30 nimmt; start die vorgewaehlte Zeit.
 * tag ist der Tag im Format JJJJ-MM-TT, fuer Kicker und Sperrzeit.
 */
export type Fenster =
  | {
      modus: "buchen"; courtId: string; platzName: string; tag: string;
      stunde: number; startzeiten: number[]; start: number;
    }
  | { modus: "verwalten"; belegung: Belegung; platzName: string; tag: string };

// Die drei Zeitrechnungen standen hier und in der Web-App je einmal nachgebaut.
// Dieselbe Regel an zwei Stellen heisst frueher oder spaeter: zwei Regeln - und
// genau so ist es passiert, als die Web-App die Zeitzone beruecksichtigte und
// diese hier nicht. Jetzt kommen sie aus @tcm/core, wo sie unter Test stehen.

/** Minuten seit Mitternacht in deutscher Ortszeit. */
export const lokaleMinuten = minutesOf;

export const alsUhrzeit = minutesToTime;

export const zuMinuten = (hhmm: string) => timeToMinutes(String(hhmm));

/**
 * Kann auf diesem Platz um genau diese Minute eine Buchung beginnen? Die Regel
 * steht in @tcm/core (canStartAt) und gilt im Belegungsplan, auf der
 * Startseite und im Web gleich.
 */
export const startMoeglich = canStartAt;

/** Welche Plaetze sind ab jetzt frei, und bis wann? Siehe freeCourtsNow. */
export const jetztFrei = freeCourtsNow;
