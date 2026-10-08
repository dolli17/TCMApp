/**
 * Abmelden nach Inaktivitaet
 *
 * Die Web-App laeuft auch auf geteilten Rechnern im Clubhaus, und dort stehen
 * Mitglieder- und Bankdaten. Wer 30 Minuten nichts tut, wird abgemeldet.
 *
 * Der Zeitpunkt der letzten Aktivitaet steht in einem Cookie: so sehen ihn alle
 * Tabs (Aktivitaet in einem haelt alle offen) und auch die Middleware - die
 * meldet ab, wenn der Rechner zugeklappt war und erst Stunden spaeter wieder
 * aufgeht, noch bevor eine Seite gerendert wird.
 *
 * Geschrieben wird der Cookie nur im Browser (Inaktivitaet.tsx). Fehlt er,
 * gilt niemand als abgelaufen - so bleibt der Kiosk, der die Komponente nie
 * einhaengt, dauerhaft angemeldet.
 */

export const INAKTIV_MS = 30 * 60_000;
export const AKTIV_COOKIE = "tcm_aktiv";

/** Ist der Zeitstempel aus dem Cookie aelter als erlaubt? */
export function istAbgelaufen(wert: string | undefined, jetzt: number): boolean {
  const stempel = Number(wert);
  if (!wert || !Number.isFinite(stempel)) return false;
  return jetzt - stempel > INAKTIV_MS;
}

/** Nur im Browser: den Stempel auf jetzt setzen. */
export function aktivitaetMerken(jetzt = Date.now()) {
  const sicher = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AKTIV_COOKIE}=${jetzt}; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax${sicher}`;
}

/** Nur im Browser: den Stempel entfernen, etwa beim Abmelden. */
export function aktivitaetVergessen() {
  document.cookie = `${AKTIV_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

/** Nur im Browser: den Stempel lesen. */
export function aktivitaetLesen(): string | undefined {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(AKTIV_COOKIE + "="))
    ?.slice(AKTIV_COOKIE.length + 1);
}
