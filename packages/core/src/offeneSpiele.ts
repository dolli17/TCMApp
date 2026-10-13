/**
 * Texte einer Karte unter "Offene Spiele" (Befund O22): wer sucht, wie viele
 * fehlen noch und wer ist schon eingetragen. Web und App zeigen dasselbe.
 *
 * Die Daten kommen aus open_matches: owner_name ist der Bucher, players nennt
 * die Mitspieler ohne ihn, frei die noch offenen Plaetze.
 */

export interface OffenesSpielText {
  /** Kopfzeile, etwa "Robin Heinzler sucht 1 Mitspieler" */
  kopf: string;
  /** "Schon dabei: …" oder null, wenn noch niemand eingetragen ist */
  dabei: string | null;
}

/** "A", "A und B", "A, B und C" */
export function aufzaehlung(namen: readonly string[]): string {
  if (namen.length <= 1) return namen[0] ?? "";
  return `${namen.slice(0, -1).join(", ")} und ${namen.at(-1)}`;
}

export function offenesSpielText(
  spiel: { owner_name: string | null; players: readonly string[]; frei: number },
  /** Die Buchung gehoert dem angemeldeten Mitglied */
  eigenes = false,
): OffenesSpielText {
  const wer = eigenes ? "Du suchst" : `${spiel.owner_name?.trim() || "Jemand"} sucht`;
  // "Mitspieler" lautet im Plural gleich; die Zahl traegt den Unterschied
  const frei = Math.max(spiel.frei, 0);
  const namen = spiel.players.map((p) => p?.trim()).filter((p): p is string => !!p);

  return {
    kopf: `${wer} ${frei === 1 ? "einen" : frei} Mitspieler`,
    dabei: namen.length > 0 ? `Schon dabei: ${aufzaehlung(namen)}` : null,
  };
}
