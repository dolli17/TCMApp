/**
 * Grosse Systemschrift (U5)
 *
 * React Native vergroessert jeden Text mit der Systemschrift, solange niemand
 * es abschaltet - und das soll so bleiben: im Verein sind Mitglieder bis 92.
 * Zwei Ausnahmen regelt diese Datei:
 *
 *  - Text in einer festen Form (Initialen im Kreis, Zaehler an der Glocke,
 *    Beschriftung der Tab-Leiste) waechst nur bis zu einem Deckel. Sonst
 *    laeuft er aus der Form, ohne dass er lesbarer wird.
 *  - Ab einer grossen Stufe stellen sich Layouts um, die nebeneinander keinen
 *    Platz mehr haben (etwa die drei Schnellkacheln auf Start) - statt Woerter
 *    mitten im Wort zu brechen.
 *
 * Die iOS-Stufen ueber der Vorgabe: 1,12 (gross), 1,24, 1,35 (groesste ohne
 * Bedienungshilfen), danach bis etwa 3,1.
 */

import { useWindowDimensions } from "react-native";

/** Fuer maxFontSizeMultiplier. */
export const SCHRIFT_DECKEL = {
  /** Text in Kreisen und Plaketten fester Groesse. */
  form: 1.2,
  /** Beschriftung der schwebenden Tab-Leiste. */
  leiste: 1.3,
} as const;

/** Ab dieser Stufe stellen sich enge Layouts um. */
export const GROSSE_SCHRIFT_AB = 1.2;

export function grosseSchrift(fontScale: number): boolean {
  return fontScale >= GROSSE_SCHRIFT_AB;
}

export function useGrosseSchrift(): boolean {
  return grosseSchrift(useWindowDimensions().fontScale);
}
