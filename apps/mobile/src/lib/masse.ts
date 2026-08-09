/**
 * Masse, die zwei Stellen kennen muessen
 *
 * Die Fussleiste bestimmt ihre eigene Hoehe, und jeder Bildschirm muss unten
 * so viel Luft lassen, dass die letzte Zeile nicht dahinter verschwindet.
 * Stuende die Zahl an beiden Orten, liefe sie beim naechsten Feinschliff
 * auseinander - und zwar unsichtbar, denn zu viel Abstand faellt niemandem
 * auf, zu wenig nur auf langen Listen.
 *
 * Ohne den Sicherheitsabstand des Geraets; den holt sich jeder Ort selbst,
 * weil er vom Modell abhaengt.
 */

export const FUSSLEISTE_HOEHE = 52;
