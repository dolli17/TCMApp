/**
 * Der Bereich "Verein": Getränke und Veranstaltungen als zwei Reiter.
 *
 * /verein führt auf den zuletzt gewählten Reiter, beim ersten Mal auf die
 * Getränke. Gemerkt wird er in einem Cookie, damit schon der Server weiß,
 * wohin - ohne Umweg über eine leere Seite.
 */

export type VereinReiter = "getraenke" | "veranstaltungen";

export const VEREIN_REITER_COOKIE = "tcm_verein_reiter";

export function alsVereinReiter(wert: string | undefined): VereinReiter {
  return wert === "veranstaltungen" ? "veranstaltungen" : "getraenke";
}
