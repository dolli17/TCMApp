/**
 * Der Pfad der Anfrage als Kopfzeile. Die Middleware setzt ihn, das Layout
 * liest ihn - eine Server-Komponente kennt den Pfad sonst nicht.
 */
export const PFAD_KOPF = "x-tcm-pfad";

/**
 * Seiten der Anmeldung stehen als ganze Buehne fuer sich, auch wenn schon
 * jemand angemeldet ist - etwa wer nach dem Mitgliedskonto gleich den
 * Einladungslink fuer sein Admin-Konto oeffnet. Mit Menue darum waere die
 * Seite ein Bild im Bild.
 */
export const OHNE_RAHMEN = ["/login", "/passwort-setzen", "/passwort-vergessen"];
