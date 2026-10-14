/**
 * Stand der Einladung eines neuen Mitglieds, für die Verwaltung
 *
 * Ein neues Mitglied bekommt beim Anlegen bzw. Annehmen eine Einladung. Wer
 * den Link öffnet, ist damit angemeldet (Supabase bestätigt die Adresse und
 * setzt last_sign_in_at) und landet im Pflicht-Onboarding. Der Vorstand soll
 * sehen, wo jemand hängt:
 *
 *   - ausstehend:      noch nie angemeldet, der letzte Link ist noch gültig
 *   - abgelaufen:      noch nie angemeldet, der letzte Link ist verfallen
 *   - onboarding_offen: angemeldet, aber die Pflichtschritte fehlen noch -
 *                       oder es ging nie ein Link raus (Testadressen wie
 *                       @example.org bekommen keine Mail), dann gibt es
 *                       auch nichts, was ablaufen könnte
 *
 * Wer das Onboarding abgeschlossen hat (auch der ganze Bestand), hat keinen
 * Einladungsstatus mehr.
 */

export type EinladungsStatus = "ausstehend" | "abgelaufen" | "onboarding_offen";

/**
 * So lange gilt ein Einladungs- oder Recovery-Link. Entspricht
 * auth.email.otp_expiry in supabase/config.toml (86400 s); in Dev und Prod
 * steht derselbe Wert in den Auth-Einstellungen des Projekts.
 */
export const EINLADUNG_GUELTIG_STUNDEN = 24;

export const EINLADUNGS_STATUS_TEXT: Record<EinladungsStatus, string> = {
  ausstehend: "Einladung ausstehend",
  abgelaufen: "Einladung abgelaufen",
  onboarding_offen: "Onboarding offen",
};

export function einladungsStatus({
  onboardingAbgeschlossen,
  angemeldetAm,
  gesendetAm,
  jetzt = new Date(),
}: {
  onboardingAbgeschlossen: boolean;
  /** Letzte Anmeldung (auth.users.last_sign_in_at), null = noch nie. */
  angemeldetAm: string | null;
  /** Wann der letzte Einladungs- oder Recovery-Link verschickt wurde. */
  gesendetAm: string | null;
  jetzt?: Date;
}): EinladungsStatus | null {
  if (onboardingAbgeschlossen) return null;
  if (angemeldetAm) return "onboarding_offen";
  if (!gesendetAm) return "onboarding_offen";
  const alter = jetzt.getTime() - new Date(gesendetAm).getTime();
  return alter > EINLADUNG_GUELTIG_STUNDEN * 3_600_000 ? "abgelaufen" : "ausstehend";
}
