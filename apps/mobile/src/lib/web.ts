/**
 * Adressen im Web
 *
 * Einiges liegt bewusst nur im Web: Datenschutz, Impressum, der
 * Mitgliedsantrag und die Verwaltung bis auf die Plaetze. Die Basisadresse
 * kommt aus EXPO_PUBLIC_SITE_URL (eas.json); solange sie fehlt - lokal, ohne
 * Domain - gibt webLink() null, und die Zeile bleibt weg, statt ins Leere zu
 * zeigen.
 */

/** Die Basisadresse ohne Schraegstrich am Ende; leer, wenn keine gesetzt ist. */
export const SITE_URL = basis(process.env.EXPO_PUBLIC_SITE_URL);

export function basis(wert: string | undefined): string {
  return (wert ?? "").trim().replace(/\/+$/, "");
}

/** "/admin" -> "https://…/admin"; ohne Basisadresse null. */
export function webLink(pfad: string, site: string = SITE_URL): string | null {
  if (site === "") return null;
  return `${site}${pfad.startsWith("/") ? pfad : `/${pfad}`}`;
}
