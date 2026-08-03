/** Rollenpruefung fuer die Oberflaeche. Massgeblich bleibt RLS in der Datenbank. */

export function hasRole(roles: readonly string[], ...wanted: string[]): boolean {
  return wanted.some((w) => roles.includes(w));
}

/** Der Vorstand darf ueberall dort mit, wo eine Fachrolle gefragt ist. */
export const isBoard = (r: readonly string[]) => r.includes("board");
export const isTreasurer = (r: readonly string[]) => hasRole(r, "treasurer", "board");
export const isSportsOfficer = (r: readonly string[]) => hasRole(r, "sports_officer", "board");
export const isTrainer = (r: readonly string[]) =>
  hasRole(r, "trainer", "sports_officer", "board");
