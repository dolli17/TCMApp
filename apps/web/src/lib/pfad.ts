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
export const ANMELDESEITEN = ["/login", "/passwort-setzen", "/passwort-vergessen"];

/**
 * Ohne das Menue der App: die Anmeldeseiten und das Onboarding. Wer das
 * Onboarding noch nicht abgeschlossen hat, kann keine Funktion nutzen - ein
 * Menue mit Plan und Getraenken fuehrte nur in die Sperre. Das Onboarding hat
 * deshalb einen eigenen, schlanken Rahmen mit "Abmelden".
 */
export const OHNE_RAHMEN = [...ANMELDESEITEN, "/onboarding"];

/** Das Onboarding, solange es offen ist. Die Middleware leitet dorthin um. */
export const ONBOARDING = "/onboarding";
