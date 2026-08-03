/** Rollenpruefung fuer die Oberflaeche. Massgeblich bleibt RLS in der Datenbank. */

export function hasRole(roles: readonly string[], ...wanted: string[]): boolean {
  return wanted.some((w) => roles.includes(w));
}

/**
 * Es gibt nur noch zwei Stufen: Admin und Mitglied. Wer Admin ist, darf alles -
 * Serien, Mitglieder, Beitraege, Einstellungen und jede fremde Buchung.
 */
export const isAdmin = (r: readonly string[]) => r.includes("admin");
