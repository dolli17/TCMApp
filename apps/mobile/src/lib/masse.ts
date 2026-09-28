/**
 * Masse, die zwei Stellen kennen muessen
 *
 * Die schwebende Leiste bestimmt ihre eigene Lage, und jeder Bildschirm muss
 * unten so viel Luft lassen, dass die letzte Zeile nicht dahinter
 * verschwindet. Stuende die Zahl an beiden Orten, liefe sie beim naechsten
 * Feinschliff auseinander - und zwar unsichtbar, denn zu viel Abstand faellt
 * niemandem auf, zu wenig nur auf langen Listen.
 *
 * Ohne den Sicherheitsabstand des Geraets; den holt sich jeder Ort selbst,
 * weil er vom Modell abhaengt.
 */

/** Hoehe der Pille und Kantenlaenge des runden Buchen-Knopfs */
export const LEISTE_HOEHE = 64;

/** Abstand der Leiste zum unteren Sicherheitsrand */
export const LEISTE_ABSTAND_UNTEN = 26;

/** Seitlicher Abstand der Leiste zum Bildschirmrand */
export const LEISTE_RAND = 16;

/**
 * Luft unter dem letzten Inhalt: Leiste, ihr Abstand nach unten und noch
 * einmal gut zwanzig Pixel, damit die letzte Karte nicht an der Leiste klebt.
 */
export const INHALT_LUFT_UNTEN = LEISTE_HOEHE + LEISTE_ABSTAND_UNTEN + 20;
