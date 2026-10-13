/** Rollenpruefung fuer die Oberflaeche. Massgeblich bleibt RLS in der Datenbank. */

import { hatVolleRechte } from "@tcm/core";

export function hasRole(roles: readonly string[], ...wanted: string[]): boolean {
  return wanted.some((w) => roles.includes(w));
}

/**
 * Volle Rechte haben Vorstand und App Admin. Wer sie hat, darf alles -
 * Serien, Mitglieder, Beitraege, Einstellungen und jede fremde Buchung.
 * Platzwart, Trainer und Mannschaftsfuehrer haben vorerst keine eigenen Rechte.
 */
export const isAdmin = (r: readonly string[]) => hatVolleRechte(r);
