/** Rollenpruefung fuer die Oberflaeche. Massgeblich bleibt RLS in der Datenbank. */

import { hatPlatzRechte, hatVolleRechte } from "@tcm/core";

export function hasRole(roles: readonly string[], ...wanted: string[]): boolean {
  return wanted.some((w) => roles.includes(w));
}

/**
 * Volle Rechte haben Vorstand und App Admin. Wer sie hat, darf alles -
 * Serien, Mitglieder, Beitraege, Einstellungen und jede fremde Buchung.
 * Trainer und Mannschaftsfuehrer haben keine eigenen Rechte.
 */
export const isAdmin = (r: readonly string[]) => hatVolleRechte(r);

/**
 * Platzrechte haben zusaetzlich die Platzwarte: Sperren, Serien und fremde
 * Buchungen. Plaetze anlegen, Buchungsarten und Einstellungen bleiben bei isAdmin.
 */
export const darfPlaetze = (r: readonly string[]) => hatPlatzRechte(r);
