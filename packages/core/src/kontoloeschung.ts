/**
 * Mitgliedschaft kündigen beantragen (Befund O9, Apple-Regel 5.1.1(v); U44)
 *
 * Der Eintrag heißt nach der Kündigung, weil Mitglieder so danach suchen.
 * Die Erklärung muss trotzdem klar sagen, dass damit auch Konto und Login
 * gelöscht werden - darüber findet ein App-Prüfer die Kontolöschung.
 *
 * App und Web zeigen dieselben Sätze und prüfen gleich. Gelöscht wird nicht
 * sofort: Die RPC konto_loeschung_beantragen benachrichtigt Vorstand und
 * Admins, die das Konto dann löschen oder anonymisieren. Was der Verein
 * aufbewahren muss (Beiträge, Lastschriften), bleibt.
 */

/** Grenze der RPC für die freiwillige Nachricht. */
export const KONTOLOESCHUNG_NACHRICHT_MAX = 1000;

export const KONTOLOESCHUNG_TEXT = {
  titel: "Mitgliedschaft kündigen beantragen",
  erklaerung: [
    "Dein Antrag geht an den Vorstand. Er kümmert sich um die Kündigung deiner Mitgliedschaft und löscht dabei auch dein Konto samt Login für App und Web – oder anonymisiert es. Falls noch etwas zu klären ist, meldet er sich bei dir.",
    "Daten, die der Verein aufbewahren muss – etwa Beiträge und Lastschriften –, bleiben so lange wie vorgeschrieben erhalten.",
  ],
  nachrichtLabel: "Nachricht an den Vorstand (freiwillig)",
  absenden: "Kündigung beantragen",
  bestaetigungFrage: "Möchtest du die Kündigung deiner Mitgliedschaft und die Löschung deines Kontos wirklich beantragen?",
  bestaetigen: "Ja, beantragen",
  abbrechen: "Abbrechen",
  eingegangen: "Dein Antrag ist eingegangen. Der Vorstand meldet sich bei dir.",
  liegtVor: "Dein Antrag liegt schon vor. Der Vorstand kümmert sich darum.",
} as const;

export type KontoloeschungEingabe =
  | { ok: true; nachricht: string | null }
  | { ok: false; meldung: string };

/** Leer heißt: keine Nachricht. Zu lang meldet sich vor dem Absenden. */
export function kontoloeschungPruefen(nachricht: string | null | undefined): KontoloeschungEingabe {
  const text = (nachricht ?? "").trim();
  if (text.length > KONTOLOESCHUNG_NACHRICHT_MAX) {
    return {
      ok: false,
      meldung: `Die Nachricht ist zu lang (höchstens ${KONTOLOESCHUNG_NACHRICHT_MAX} Zeichen).`,
    };
  }
  return { ok: true, nachricht: text || null };
}

/** true: neu eingegangen; false: aus den letzten 24 Stunden liegt schon einer vor. */
export function kontoloeschungMeldung(neu: boolean): string {
  return neu ? KONTOLOESCHUNG_TEXT.eingegangen : KONTOLOESCHUNG_TEXT.liegtVor;
}
