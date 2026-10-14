/**
 * Aufruf der Edge Function `member-login`.
 *
 * Nur sie hat den Service-Schlüssel, mit dem sich Konten in `auth.users`
 * anlegen, einladen, sperren und löschen lassen. Dieser Aufruf reicht die
 * Anfrage samt Token des angemeldeten Admins dorthin weiter.
 *
 * Wie server.ts nur für Server Actions und Server-Komponenten. Und bewusst
 * keine "use server"-Datei: dort würde jeder Export zu einer öffentlich
 * aufrufbaren Server Action, auch dieser rohe Durchgriff auf die Function.
 */

import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "./server";

/** Was die Oberfläche am Zugang auslösen darf. Entfernen gibt es nicht mehr. */
export type LoginAktion =
  | "einladen"
  | "passwort_zuruecksetzen"
  | "login_deaktivieren"
  | "login_aktivieren"
  | "login_verknuepfen";

/** Der Anfragekörper, so wie die Function ihn erwartet. */
export type LoginAnfrage =
  | { aktion: LoginAktion; memberId: string }
  | { aktion: "anlegen"; daten: Record<string, unknown> }
  | { aktion: "email_aendern"; memberId: string; email: string }
  | { aktion: "loeschen"; memberId: string; art: "loeschen"; nachname: string }
  | { aktion: "loeschen"; memberId: string; art: "anonymisieren"; grund?: string };

export interface LoginErgebnis {
  ok: boolean;
  meldung: string;
  /** Beim Anlegen die Id des neuen Mitglieds. */
  id?: string;
}

function funktionsAdresse(): string | null {
  const direkt = process.env.SUPABASE_FUNCTIONS_URL;
  if (direkt) return direkt.replace(/\/$/, "");

  // Ohne eigene Angabe die übliche Ableitung aus der Projekt-URL.
  const basis = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!basis) return null;
  return `${basis.replace(/\/$/, "")}/functions/v1`;
}

/**
 * Die Function aufrufen. Kein revalidatePath hier – das entscheidet der
 * Aufrufer, denn nach dem Löschen gibt es die Detailseite nicht mehr.
 */
export async function memberLogin(anfrage: LoginAnfrage): Promise<LoginErgebnis> {
  const adresse = funktionsAdresse();
  if (!adresse) {
    return { ok: false, meldung: "Die Adresse der Zugangsverwaltung ist nicht konfiguriert." };
  }

  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return { ok: false, meldung: "Nicht angemeldet." };

  let antwort: Response;
  try {
    antwort = await fetch(`${adresse}/member-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        // Ohne apikey weist das Gateway die Anfrage ab, bevor die Funktion
        // überhaupt läuft.
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      },
      body: JSON.stringify(anfrage),
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : String(fehler);
    return { ok: false, meldung: `Die Zugangsverwaltung ist nicht erreichbar: ${text}` };
  }

  let ergebnis: { ok?: boolean; meldung?: string; id?: string; code?: string; details?: string };
  try {
    ergebnis = await antwort.json();
  } catch {
    return { ok: false, meldung: `Unerwartete Antwort (${antwort.status}).` };
  }

  const ok = Boolean(ergebnis.ok);
  const meldung = ergebnis.meldung ?? (antwort.ok ? "Erledigt." : "Das hat nicht geklappt.");

  return {
    ok,
    // Fehler aus den RPCs kommen roh durch, wie bei einem direkten Aufruf.
    meldung: ok
      ? meldung
      : translateDbError({ message: meldung, code: ergebnis.code, details: ergebnis.details }),
    id: ergebnis.id,
  };
}
