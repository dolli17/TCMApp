/**
 * Geldbetraege
 *
 * Intern wird ausschliesslich in ganzen Cent gerechnet. Fliesskomma waere bei
 * einem Beitragslauf ueber 400 Mitglieder nicht harmlos: 0,1 + 0,2 ergibt in
 * IEEE-754 nicht 0,3, und solche Abweichungen summieren sich zu echten
 * Differenzen auf dem Vereinskonto.
 */

const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

/** 1900 -> "19,00 €" */
export function formatCents(cents: number): string {
  return EUR.format(cents / 100);
}

/** 1900 -> "19,00" (ohne Waehrungszeichen, z.B. fuer SEPA-XML) */
export function centsToAmountString(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`Betrag muss ganzzahlig in Cent vorliegen, war: ${cents}`);
  }
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * "19,00" oder "19.00" oder "19" -> 1900
 *
 * Nimmt Komma und Punkt als Dezimaltrenner an, weil beides in Eingabefeldern
 * vorkommt. Mehr als zwei Nachkommastellen sind ein Fehler und keine
 * Rundungsaufgabe - bei Geld wird nicht stillschweigend gerundet.
 */
export function parseAmountToCents(input: string): number {
  const cleaned = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Kein gueltiger Betrag: "${input}"`);
  }
  const [whole, frac = ""] = cleaned.split(".");
  const sign = whole!.startsWith("-") ? -1 : 1;
  const wholeCents = Math.abs(Number(whole)) * 100;
  const fracCents = Number(frac.padEnd(2, "0"));
  return sign * (wholeCents + fracCents);
}

/** Summiert ohne Zwischenrundung. */
export function sumCents(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
