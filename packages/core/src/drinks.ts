/**
 * Getraenkeabrechnung
 *
 * Der Einzelpreis steckt in jeder Buchung, nicht in der Preisliste. Eine
 * Preisaenderung mitten im Monat darf bereits erfasste Entnahmen nicht
 * nachtraeglich verteuern - dieselbe Flasche kostet fuer alle, die sie vor der
 * Erhoehung genommen haben, weiterhin den alten Preis.
 */

import { sumCents } from "./money.js";

export interface DrinkPurchase {
  id: string;
  memberId: string;
  drinkItemId: string;
  quantity: number;
  unitPriceCents: number;
  voidedAt?: string | null;
  createdAt: string;
}

export interface MonthlySummaryLine {
  drinkItemId: string;
  quantity: number;
  totalCents: number;
}

/** Stornierte Buchungen zaehlen nicht mit. */
export function activePurchases(
  purchases: readonly DrinkPurchase[],
): DrinkPurchase[] {
  return purchases.filter((p) => !p.voidedAt);
}

export function purchaseTotalCents(purchase: DrinkPurchase): number {
  return purchase.quantity * purchase.unitPriceCents;
}

export function summarizeByItem(
  purchases: readonly DrinkPurchase[],
): MonthlySummaryLine[] {
  const map = new Map<string, MonthlySummaryLine>();

  for (const p of activePurchases(purchases)) {
    const line = map.get(p.drinkItemId) ?? {
      drinkItemId: p.drinkItemId,
      quantity: 0,
      totalCents: 0,
    };
    line.quantity += p.quantity;
    line.totalCents += purchaseTotalCents(p);
    map.set(p.drinkItemId, line);
  }

  return [...map.values()];
}

export function monthlyTotalCents(
  purchases: readonly DrinkPurchase[],
): number {
  return sumCents(activePurchases(purchases).map(purchaseTotalCents));
}

/**
 * Darf das Mitglied diese Buchung noch selbst zuruecknehmen?
 *
 * Nach Ablauf des Fensters bleibt nur der Weg ueber den Vorstand. Die
 * Datenbank prueft dieselbe Regel noch einmal - das hier dient nur dazu, den
 * Knopf rechtzeitig auszublenden.
 */
export function canVoidSelf(
  purchase: DrinkPurchase,
  windowMinutes: number,
  now: Date = new Date(),
): boolean {
  if (purchase.voidedAt) return false;
  const created = new Date(purchase.createdAt).getTime();
  return now.getTime() - created <= windowMinutes * 60_000;
}

/**
 * Wird dieser Betrag eingezogen?
 *
 * Unterhalb der Grenze bleibt die Forderung offen und wird vorgetragen, statt
 * eine Lastschrift ueber achtzig Cent zu erzeugen - die kostet den Verein
 * Bankgebuehren und das Mitglied Verwirrung auf dem Kontoauszug.
 */
export function isDebitable(totalCents: number, minDebitCents: number): boolean {
  return totalCents >= minDebitCents;
}
