/**
 * Ziele für Weiterleitungen nach dem Login (?weiter=…) und Ähnliches
 *
 * Was in der Adresszeile steht, kann jeder setzen. Ohne Prüfung wird aus
 * /login?weiter=https://boese.example ein Sprungbrett: das Mitglied meldet
 * sich auf der echten Seite an und landet danach woanders (Open Redirect).
 *
 * Erlaubt sind deshalb nur Pfade innerhalb der eigenen Seite: ein führender
 * Schrägstrich, aber kein zweiter (//host ist eine Adresse ohne Schema) und
 * kein Backslash (Browser lesen /\host wie //host). Steuerzeichen fallen
 * ebenfalls heraus - der URL-Parser wirft Tab und Zeilenumbruch einfach weg,
 * aus "/\t/host" würde so wieder "//host".
 */

const FALLBACK = "/";

const BASIS = "http://tcm.invalid";

export function sichererWeiterPfad(wert: unknown, fallback: string = FALLBACK): string {
  if (typeof wert !== "string" || wert === "") return fallback;
  if (!wert.startsWith("/")) return fallback;
  if (wert.startsWith("//")) return fallback;
  if (wert.includes("\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(wert)) return fallback;

  // Zur Sicherheit noch der Parser selbst: bleibt das Ziel auf derselben Seite?
  try {
    if (new URL(wert, BASIS).origin !== BASIS) return fallback;
  } catch {
    return fallback;
  }
  return wert;
}
