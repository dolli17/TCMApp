/**
 * IBAN nach ISO 13616
 *
 * Dieselbe Pruefung gibt es als Datenbankfunktion (public.iban_is_valid). Hier
 * liegt sie noch einmal, damit die Eingabemaske sofort reagieren kann, statt
 * den Fehler erst beim Speichern zu zeigen. Beide Implementierungen werden
 * gegen dieselben Beispiele getestet.
 *
 * Eine gueltige Pruefziffer sagt nur, dass die Nummer formal stimmt - nicht,
 * dass das Konto existiert oder gedeckt ist.
 */

/** Laenge je Land. Unvollstaendig, deckt aber ab, was im Verein vorkommt. */
const LENGTHS: Record<string, number> = {
  DE: 22, AT: 20, CH: 21, FR: 27, IT: 27, NL: 18, BE: 16,
  ES: 24, LU: 20, DK: 18, PL: 28, CZ: 24, GB: 22, SE: 24,
};

export function normalizeIban(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

/** Buchstaben zu Zahlen: A = 10 ... Z = 35 */
function toDigits(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) out += ch;
    else if (code >= 65 && code <= 90) out += String(code - 55);
    else return "";
  }
  return out;
}

/**
 * Modulo 97 stueckweise.
 * Die Zahl hat bis zu 40 Stellen und passt nicht in einen JS-Number.
 */
function mod97(digits: string): number {
  let rest = 0;
  for (const ch of digits) {
    rest = (rest * 10 + Number(ch)) % 97;
  }
  return rest;
}

export function isValidIban(input: string | null | undefined): boolean {
  if (!input) return false;
  const iban = normalizeIban(input);

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;

  const expected = LENGTHS[iban.slice(0, 2)];
  if (expected !== undefined && iban.length !== expected) return false;

  const digits = toDigits(iban.slice(4) + iban.slice(0, 4));
  if (!digits) return false;

  return mod97(digits) === 1;
}

/** "DE89370400440532013000" -> "DE89 3704 0044 0532 0130 00" */
export function formatIban(input: string): string {
  return normalizeIban(input).replace(/(.{4})/g, "$1 ").trim();
}

/** Nur die letzten vier Stellen zeigen: "DE89 •••• 3000" */
export function maskIban(input: string): string {
  const iban = normalizeIban(input);
  if (iban.length < 8) return "••••";
  return `${iban.slice(0, 4)} •••• ${iban.slice(-4)}`;
}

/** Pruefziffern zu einer BBAN berechnen - fuer Testdaten und Migration. */
export function ibanCheckDigits(bban: string, country = "DE"): string {
  const digits = toDigits(bban.toUpperCase() + country + "00");
  return String(98 - mod97(digits)).padStart(2, "0");
}
