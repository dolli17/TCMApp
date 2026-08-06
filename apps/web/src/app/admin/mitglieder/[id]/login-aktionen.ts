"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import type { AktionsErgebnis } from "./aktionen";

/**
 * Zugänge verwalten.
 *
 * Die eigentliche Arbeit macht die Edge Function `member-login` – nur sie hat
 * den Service-Schlüssel, mit dem sich Konten anlegen, einladen und sperren
 * lassen. Diese Aktion reicht die Anfrage samt Token des angemeldeten Admins
 * dorthin weiter; der Browser sieht ausschließlich das Ergebnis.
 */

export type LoginAktion =
  | "einladen"
  | "passwort_zuruecksetzen"
  | "login_deaktivieren"
  | "login_aktivieren"
  | "login_verknuepfen"
  | "login_entfernen";

function funktionsAdresse(): string | null {
  const direkt = process.env.SUPABASE_FUNCTIONS_URL;
  if (direkt) return direkt.replace(/\/$/, "");

  // Ohne eigene Angabe die übliche Ableitung aus der Projekt-URL.
  const basis = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!basis) return null;
  return `${basis.replace(/\/$/, "")}/functions/v1`;
}

export async function loginVerwalten(
  mitgliedId: string,
  aktion: LoginAktion,
  /**
   * Soll die Anzeige danach aufgefrischt werden?
   *
   * Aus der Antragsannahme heraus: nein. Ein revalidatePath ersetzt dort den
   * Teilbaum mit dem offenen <dialog>, und das Fenster schließt sich samt der
   * Meldung, die gerade erst entstanden ist.
   */
  neuLaden = true,
): Promise<AktionsErgebnis> {
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
      body: JSON.stringify({ aktion, memberId: mitgliedId }),
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : String(fehler);
    return { ok: false, meldung: `Die Zugangsverwaltung ist nicht erreichbar: ${text}` };
  }

  let ergebnis: { ok?: boolean; meldung?: string };
  try {
    ergebnis = await antwort.json();
  } catch {
    return { ok: false, meldung: `Unerwartete Antwort (${antwort.status}).` };
  }

  if (neuLaden) {
    revalidatePath(`/admin/mitglieder/${mitgliedId}`);
    revalidatePath("/admin/mitglieder");
  }

  return {
    ok: Boolean(ergebnis.ok),
    meldung: ergebnis.meldung ?? (antwort.ok ? "Erledigt." : "Das hat nicht geklappt."),
  };
}
