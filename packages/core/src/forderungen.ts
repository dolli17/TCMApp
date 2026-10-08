import type { ChargeKind } from "./sepa/types";

/**
 * Forderungsarten - eine Quelle fuer alle Oberflaechen.
 *
 * Vorher lagen die Bezeichnungen in vier Kopien (Web und App, Verwaltung und
 * Konto) und wichen voneinander ab ("Beitrag" hier, "Mitgliedsbeitrag" dort).
 * In der Kasse war die Art nur im Detailblatt zu sehen; jetzt steht sie als
 * Marke an jeder Forderung und jeder Lastschrift.
 */

/** Reihenfolge wie im Vereinsjahr: was am meisten Geld bewegt, zuerst. */
export const CHARGE_KINDS: readonly ChargeKind[] = [
  "fee", "drinks", "work_duty", "guest", "deposit", "misc",
];

export const CHARGE_KIND_LABEL: Record<ChargeKind, string> = {
  fee: "Beitrag",
  drinks: "Getränke",
  work_duty: "Arbeitsdienst",
  guest: "Gastgebühr",
  deposit: "Pfand",
  misc: "Sonstiges",
};

/**
 * Farbe der Marke. Die Palette hat fuer kleine Marken Blau, Gold und Grau:
 * die beiden grossen Posten des Jahres bekommen eine eigene Farbe, der Rest
 * unterscheidet sich ueber den Text.
 */
export type ChargeKindTon = "blau" | "gold" | "grau";

export const CHARGE_KIND_TON: Record<ChargeKind, ChargeKindTon> = {
  fee: "blau",
  drinks: "gold",
  work_duty: "grau",
  guest: "grau",
  deposit: "grau",
  misc: "grau",
};

/** Arten in Vereinsreihenfolge, unbekannte Werte fallen heraus. */
export function sortChargeKinds(kinds: readonly string[] | null | undefined): ChargeKind[] {
  const vorhanden = new Set(kinds ?? []);
  return CHARGE_KINDS.filter((k) => vorhanden.has(k));
}

/**
 * Kurztext fuer eine Auswahl von Arten, etwa im Namen eines Laufs:
 * null oder alle sechs = "alle Arten".
 */
export function chargeKindsText(kinds: readonly string[] | null | undefined): string {
  const sortiert = sortChargeKinds(kinds);
  if (!kinds || sortiert.length === 0 || sortiert.length === CHARGE_KINDS.length) {
    return "alle Arten";
  }
  return sortiert.map((k) => CHARGE_KIND_LABEL[k]).join(", ");
}

/**
 * Vorschlag fuer den Namen eines Lastschriftlaufs.
 *
 * Frueher stand dort der Platzhalter "Beitragslauf 2027" - obwohl ein Lauf
 * alle angekuendigten Arten einzieht. Der Name sagt jetzt, wann und was.
 */
export function debitBatchTitle(
  collectionDate: string,
  kinds?: readonly string[] | null,
): string {
  const [jahr, monat, tag] = collectionDate.split("-");
  const datum = jahr && monat && tag ? `${tag}.${monat}.${jahr}` : collectionDate;
  const arten = chargeKindsText(kinds);
  return arten === "alle Arten" ? `Lastschrift ${datum}` : `Lastschrift ${datum} · ${arten}`;
}
