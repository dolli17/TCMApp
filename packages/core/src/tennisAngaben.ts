import { lkNormalisieren } from "./mitspielerFilter";

/**
 * LK, nuLiga-ID und Mannschaftsinteresse - im Onboarding und danach im Konto
 * (Vereinsentscheidung vom 02.11.2026). Beide Stellen schreiben über
 * save_my_tennis und prüfen hier dasselbe vor dem Senden.
 */

/** Höchstlänge der nuLiga-ID, wie save_my_tennis sie prüft. */
export const NULIGA_ID_MAX = 40;

export const NULIGA_ID_FEHLER = `Die nuLiga-ID darf höchstens ${NULIGA_ID_MAX} Zeichen haben.`;

/** Der Schalter in Onboarding und Konto. */
export const MANNSCHAFT_INTERESSE_TEXT = "Ich habe Interesse an einer Mannschaft";
export const MANNSCHAFT_INTERESSE_HINWEIS = "Der Sportwart meldet sich bei dir.";

/** Warum die LK zählt - steht im Konto über dem Formular. */
export const LK_WICHTIG_TEXT = "Die LK bestimmt, welche Mitspielersuchen du siehst.";

export interface TennisAngaben {
  tennis_lk: string | null;
  nuliga_id: string | null;
  mannschaft_interesse: boolean;
}

/** Die Argumente für save_my_tennis. Leerer Text heißt null. */
export interface TennisRpcArgumente {
  p_tennis_lk: string;
  p_nuliga_id: string;
  p_mannschaft_interesse: boolean;
}

export type TennisEingabe = { ok: true; args: TennisRpcArgumente } | { ok: false; meldung: string };

/**
 * Eingaben prüfen und normalisieren. Es gehen immer alle drei Werte an die
 * Datenbank: p_mannschaft_interesse hat dort default false und löschte das
 * Interesse sonst stillschweigend.
 */
export function tennisEingabePruefen(eingabe: {
  tennis_lk: string | null | undefined;
  nuliga_id: string | null | undefined;
  mannschaft_interesse: boolean;
}): TennisEingabe {
  const lk = lkNormalisieren(eingabe.tennis_lk);
  if (!lk.ok) return { ok: false, meldung: lk.meldung };
  const nuliga = (eingabe.nuliga_id ?? "").trim();
  if (nuliga.length > NULIGA_ID_MAX) return { ok: false, meldung: NULIGA_ID_FEHLER };
  return {
    ok: true,
    args: {
      p_tennis_lk: lk.wert ?? "",
      p_nuliga_id: nuliga,
      p_mannschaft_interesse: eingabe.mannschaft_interesse,
    },
  };
}

/** "LK14,5 · nuLiga 12345678 · Interesse an Mannschaft" oder "Noch keine Angaben". */
export function tennisKurzfassung(t: TennisAngaben | null | undefined): string {
  const teile: string[] = [];
  const lk = t?.tennis_lk?.trim();
  const nuliga = t?.nuliga_id?.trim();
  if (lk) teile.push(lk);
  if (nuliga) teile.push(`nuLiga ${nuliga}`);
  if (t?.mannschaft_interesse) teile.push("Interesse an Mannschaft");
  return teile.length > 0 ? teile.join(" · ") : "Noch keine Angaben";
}
