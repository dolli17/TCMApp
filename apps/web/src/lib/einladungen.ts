/**
 * Einladungsstatus für die Verwaltung (O24).
 *
 * Ob jemand den Link je geöffnet hat und wann der letzte rausging, steht nur
 * in auth.users. Das liest die Edge Function member-login. Gefragt wird nur
 * nach Mitgliedern mit offenem Onboarding; der Bestand ist längst fertig.
 *
 * Nur für Server-Komponenten (über member-login.ts).
 */

import { einladungsStatus, type EinladungsStatus } from "@tcm/core";
import { memberLogin } from "./supabase/member-login";

/** Je Mitglied mit offenem Onboarding: ausstehend, abgelaufen oder Onboarding offen. */
export async function ladeEinladungsstatus(offeneIds: string[]): Promise<Map<string, EinladungsStatus>> {
  const ergebnis = new Map<string, EinladungsStatus>();
  if (offeneIds.length === 0) return ergebnis;

  const antwort = await memberLogin({ aktion: "einladung_status", memberIds: offeneIds });
  const roh = antwort.ok ? (antwort.status ?? {}) : {};

  for (const id of offeneIds) {
    const r = roh[id];
    // Antwortet die Function nicht, bleibt es beim sicheren Teil: offen ist
    // das Onboarding auf jeden Fall.
    const status = r
      ? einladungsStatus({ onboardingAbgeschlossen: false, angemeldetAm: r.angemeldet_am, gesendetAm: r.gesendet_am })
      : "onboarding_offen";
    if (status) ergebnis.set(id, status);
  }
  return ergebnis;
}
