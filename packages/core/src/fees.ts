/**
 * Beitragsberechnung
 *
 * Ein Mitglied kann mehrere Beitragsarten im selben Jahr haben - im
 * eBuSy-Bestand trifft das 67 von 398 Mitgliedschaften, typischerweise
 * Jahresbeitrag plus Schluesselpfand. Der Betrag ergibt sich aus dem Preis,
 * der fuer dieses Jahr gilt, kann aber je Mitglied ueberschrieben werden
 * (Ehrenmitglieder, anteiliger Beitrag bei Eintritt mitten im Jahr).
 */

import { sumCents } from "./money.js";

export interface FeePrice {
  feeTypeId: string;
  validFromYear: number;
  amountCents: number;
}

export interface MemberFee {
  feeTypeId: string;
  year: number;
  overrideAmountCents?: number | null;
}

export interface FeeType {
  id: string;
  code: string;
  name: string;
}

export interface FeeLine {
  feeTypeId: string;
  feeTypeName: string;
  amountCents: number;
  isOverride: boolean;
}

/**
 * Der Preis, der in einem Jahr gilt: der jüngste Eintrag, dessen Startjahr
 * nicht in der Zukunft liegt. Ein Preis von 2025 gilt also auch 2026 weiter,
 * solange fuer 2026 keiner gepflegt wurde.
 */
export function priceForYear(
  prices: readonly FeePrice[],
  feeTypeId: string,
  year: number,
): number | null {
  const passend = prices
    .filter((p) => p.feeTypeId === feeTypeId && p.validFromYear <= year)
    .sort((a, b) => b.validFromYear - a.validFromYear);

  return passend.length > 0 ? passend[0]!.amountCents : null;
}

/**
 * Alle Positionen eines Mitglieds fuer ein Jahr.
 *
 * Fehlt zu einer zugewiesenen Beitragsart der Preis, ist das ein Fehler und
 * kein Nullbetrag: sonst wuerde ein Mitglied stillschweigend beitragsfrei
 * gestellt, weil jemand vergessen hat, den Preis zu pflegen.
 */
export function feeLinesForMember(
  memberFees: readonly MemberFee[],
  feeTypes: readonly FeeType[],
  prices: readonly FeePrice[],
  year: number,
): FeeLine[] {
  return memberFees
    .filter((mf) => mf.year === year)
    .map((mf) => {
      const type = feeTypes.find((t) => t.id === mf.feeTypeId);
      if (!type) {
        throw new Error(`Unbekannte Beitragsart: ${mf.feeTypeId}`);
      }

      if (mf.overrideAmountCents != null) {
        return {
          feeTypeId: mf.feeTypeId,
          feeTypeName: type.name,
          amountCents: mf.overrideAmountCents,
          isOverride: true,
        };
      }

      const price = priceForYear(prices, mf.feeTypeId, year);
      if (price === null) {
        throw new Error(
          `Fuer "${type.name}" ist kein Preis fuer ${year} hinterlegt.`,
        );
      }

      return {
        feeTypeId: mf.feeTypeId,
        feeTypeName: type.name,
        amountCents: price,
        isOverride: false,
      };
    })
    .sort((a, b) => a.feeTypeName.localeCompare(b.feeTypeName, "de"));
}

export function totalFeeCents(lines: readonly FeeLine[]): number {
  return sumCents(lines.map((l) => l.amountCents));
}
