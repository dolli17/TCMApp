/**
 * Getraenkeabrechnung
 *
 * Der Einzelpreis steckt in jeder Buchung, nicht in der Preisliste. Eine
 * Preisaenderung mitten im Monat darf bereits erfasste Entnahmen nicht
 * nachtraeglich verteuern - dieselbe Flasche kostet fuer alle, die sie vor der
 * Erhoehung genommen haben, weiterhin den alten Preis.
 */

import { formatCents, sumCents } from "./money";

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

/** Hoechstmenge je Artikel und Eintragung - dieselbe Grenze in App und Web. */
export const MAX_DRINK_QUANTITY = 50;

export interface DrinkBatchResult {
  name: string;
  quantity: number;
  ok: boolean;
  /** Grund aus der Datenbank, wenn es nicht geklappt hat */
  message?: string;
}

/**
 * Rueckmeldung nach dem gesammelten Eintragen.
 *
 * Gebucht wird je Artikel einzeln (record_drink_purchase), es gibt keinen
 * Sammelauftrag. Schlaegt einer fehl, muss klar sein, welcher - und dass die
 * anderen trotzdem stehen.
 */
export function drinkBatchReport(results: readonly DrinkBatchResult[]): { ok: boolean; text: string } {
  const teil = (r: DrinkBatchResult) => `${r.quantity}× ${r.name}`;
  const gut = results.filter((r) => r.ok);
  const schlecht = results.filter((r) => !r.ok);

  if (schlecht.length === 0) {
    return { ok: true, text: `Eingetragen: ${gut.map(teil).join(", ")}.` };
  }
  const fehler = schlecht
    .map((r) => (r.message ? `${teil(r)} (${r.message.replace(/\.$/, "")})` : teil(r)))
    .join(", ");
  const text =
    gut.length === 0
      ? `Nicht eingetragen: ${fehler}.`
      : `Nicht eingetragen: ${fehler}. Eingetragen: ${gut.map(teil).join(", ")}.`;
  return { ok: false, text };
}

/**
 * Der Getraenke-Korb: gesammelt, noch nicht eingetragen (Artikel-Id -> Menge).
 *
 * Dieselbe Logik in der Getraenkekarte (Web und App) und am Kiosk. Mit "+"
 * waechst nur der Korb - gebucht ist erst, was ueber "Eintragen" an die
 * Datenbank gegangen ist (U17).
 */
export type DrinkBasket = Readonly<Record<string, number>>;

/** Eins mehr oder weniger, begrenzt auf 0 bis MAX_DRINK_QUANTITY. Bei 0 faellt der Artikel heraus. */
export function changeBasket(basket: DrinkBasket, itemId: string, delta: number): DrinkBasket {
  const neu = Math.max(0, Math.min(MAX_DRINK_QUANTITY, (basket[itemId] ?? 0) + delta));
  const rest = { ...basket };
  if (neu === 0) delete rest[itemId];
  else rest[itemId] = neu;
  return rest;
}

/**
 * Was im Korb liegt, in der Reihenfolge der Karte.
 *
 * Nur Artikel, die noch auf der Karte stehen, zaehlen mit - ein gemerkter
 * Korb kann einen inzwischen entfernten Artikel enthalten.
 */
export function basketSummary<T extends { id: string; price_cents: number | null }>(
  items: readonly T[],
  basket: DrinkBasket,
): { lines: T[]; count: number; totalCents: number } {
  const lines = items.filter((a) => (basket[a.id] ?? 0) > 0);
  return {
    lines,
    count: lines.reduce((s, a) => s + (basket[a.id] ?? 0), 0),
    totalCents: lines.reduce((s, a) => s + (basket[a.id] ?? 0) * (a.price_cents ?? 0), 0),
  };
}

/** Nach dem Eintragen: was geklappt hat, verlaesst den Korb; was nicht, bleibt fuer einen neuen Versuch. */
export function basketAfterBatch(results: readonly (DrinkBatchResult & { id: string })[]): DrinkBasket {
  return Object.fromEntries(results.filter((r) => !r.ok).map((r) => [r.id, r.quantity]));
}

/** Ein gemerkter Korb (JSON) - alles, was nicht nach Artikel-Id -> Menge aussieht, faellt weg. */
export function parseBasket(raw: string | null | undefined): DrinkBasket {
  if (!raw) return {};
  let wert: unknown;
  try {
    wert = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!wert || typeof wert !== "object" || Array.isArray(wert)) return {};
  const korb: Record<string, number> = {};
  for (const [id, menge] of Object.entries(wert)) {
    if (typeof menge === "number" && Number.isInteger(menge) && menge > 0) {
      korb[id] = Math.min(menge, MAX_DRINK_QUANTITY);
    }
  }
  return korb;
}

/** Die Erinnerung, wenn jemand mit vollem Korb geht: "2 Getränke (5,00 €) sind noch nicht eingetragen." */
export function basketReminder(count: number, totalCents: number): string {
  const was = count === 1 ? "1 Getränk" : `${count} Getränke`;
  return `${was} (${formatCents(totalCents)}) ${count === 1 ? "ist" : "sind"} noch nicht eingetragen.`;
}
