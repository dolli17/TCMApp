/**
 * Arbeitsdienst
 *
 * Soll-Stunden haengen an der Beitragsart: Erwachsene leisten Dienst, Jugend
 * und Passive nicht. Wer mehr leistet als gefordert, bekommt keine Gutschrift -
 * es entsteht nur keine Forderung. Stunden als Dezimalzahl, weil halbe Stunden
 * ueblich sind.
 */

export interface WorkDutyRule {
  feeTypeId: string;
  year: number;
  requiredHours: number;
}

export interface WorkDutyEntry {
  memberId: string;
  year: number;
  hours: number;
  confirmedAt?: string | null;
}

export interface WorkDutySettlement {
  requiredHours: number;
  completedHours: number;
  missingHours: number;
  amountCents: number;
}

/**
 * Das Soll ergibt sich aus allen Beitragsarten des Mitglieds. Hat jemand
 * mehrere, zaehlt die hoechste Anforderung - nicht die Summe. Sonst muesste
 * jemand mit Beitrag plus Schluesselpfand doppelt arbeiten.
 */
export function requiredHoursFor(
  feeTypeIds: readonly string[],
  rules: readonly WorkDutyRule[],
  year: number,
): number {
  const passend = rules
    .filter((r) => r.year === year && feeTypeIds.includes(r.feeTypeId))
    .map((r) => r.requiredHours);

  return passend.length > 0 ? Math.max(...passend) : 0;
}

/** Nur bestaetigte Stunden zaehlen. */
export function completedHoursFor(
  entries: readonly WorkDutyEntry[],
  year: number,
): number {
  return entries
    .filter((e) => e.year === year && e.confirmedAt)
    .reduce((sum, e) => sum + e.hours, 0);
}

/**
 * Rundet den Betrag kaufmaennisch auf ganze Cent. Bei 7,5 fehlenden Stunden
 * und 15,00 Euro Stundensatz ergibt das 112,50 Euro - ohne die Rundung waeren
 * Bruchteile eines Cents moeglich, die keine Lastschrift abbilden kann.
 */
export function settleWorkDuty(
  requiredHours: number,
  completedHours: number,
  hourlyRateCents: number,
): WorkDutySettlement {
  const missing = Math.max(requiredHours - completedHours, 0);
  return {
    requiredHours,
    completedHours,
    missingHours: missing,
    amountCents: Math.round(missing * hourlyRateCents),
  };
}
