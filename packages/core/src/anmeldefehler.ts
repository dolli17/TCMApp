/**
 * Fehler beim Anmelden und beim Passwort setzen
 *
 * Supabase Auth meldet auf Englisch, und nicht jeder Fehler ist ein falsches
 * Passwort. Wer kein Netz hat oder zu oft probiert hat, soll das lesen - nicht
 * "Passwort stimmt nicht" und dann noch einmal probieren.
 */

import { VERBINDUNGSFEHLER_TEXT, isNetworkError } from "./errors";

export interface AuthLikeError {
  name?: string;
  code?: string;
  status?: number;
  message?: string;
}

export const ANMELDEDATEN_FALSCH_TEXT = "E-Mail-Adresse oder Passwort stimmt nicht.";

export const ZU_VIELE_VERSUCHE_TEXT =
  "Zu viele Versuche in kurzer Zeit. Bitte warte ein paar Minuten und versuche es dann erneut.";

const SERVER_TEXT = "Der Server ist gerade nicht erreichbar. Bitte versuche es in ein paar Minuten erneut.";

/**
 * Eine Störung statt einer Antwort in der Sache: keine Verbindung, Server
 * gestört, zu viele Versuche. Für jeden Auth-Aufruf gleich, und nichts davon
 * verrät, ob es eine Adresse gibt. Sonst null.
 */
export function authStoerungText(error: AuthLikeError | null | undefined): string | null {
  if (!error) return null;
  // Ohne Antwort (status 0) oder mit einem Gatewayfehler wirft auth-js einen
  // AuthRetryableFetchError.
  if (error.name === "AuthRetryableFetchError") {
    return error.status && error.status >= 500 ? SERVER_TEXT : VERBINDUNGSFEHLER_TEXT;
  }
  if (isNetworkError(error)) return VERBINDUNGSFEHLER_TEXT;
  if (
    error.status === 429 ||
    error.code === "over_request_rate_limit" ||
    error.code === "over_email_send_rate_limit"
  ) {
    return ZU_VIELE_VERSUCHE_TEXT;
  }
  if (error.status && error.status >= 500) return SERVER_TEXT;
  return null;
}

/**
 * Text für einen fehlgeschlagenen Login.
 *
 * Falsche Adresse und falsches Passwort bleiben ein Satz - sonst ließe sich
 * herausfinden, wer im Verein ist.
 */
export function anmeldeFehlerText(error: AuthLikeError | null | undefined): string {
  if (!error) return ANMELDEDATEN_FALSCH_TEXT;
  const text = authStoerungText(error);
  if (text) return text;
  if (error.code === "user_banned") {
    return "Dieser Zugang ist gesperrt. Bitte melde dich beim Verein.";
  }
  if (error.code === "email_not_confirmed") {
    return "Die E-Mail-Adresse ist noch nicht bestätigt. Bitte nutze den Link aus der Einladung.";
  }
  return ANMELDEDATEN_FALSCH_TEXT;
}

/** Text für ein fehlgeschlagenes "Passwort setzen". */
export function passwortFehlerText(error: AuthLikeError | null | undefined): string {
  if (!error) return "Das Passwort ließ sich nicht speichern.";
  const text = authStoerungText(error);
  if (text) return text;
  if (error.code === "same_password") {
    return "Das neue Passwort muss sich vom bisherigen unterscheiden.";
  }
  if (error.code === "weak_password") {
    return "Das Passwort ist zu schwach. Bitte wähle ein längeres.";
  }
  if (error.code === "session_not_found" || error.code === "session_expired" || error.status === 401) {
    return "Der Link ist abgelaufen. Bitte fordere einen neuen an.";
  }
  return "Das Passwort ließ sich nicht speichern. Bitte versuche es erneut.";
}
