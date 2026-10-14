"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { memberLogin } from "@/lib/supabase/member-login";

export interface AntragsErgebnis {
  ok: boolean;
  meldung: string;
  /** Bei Annahme die Id des neuen Mitglieds, damit die Oberfläche dorthin führt. */
  memberId?: string;
}

function neuLaden() {
  revalidatePath("/admin/mitglieder/antraege");
  revalidatePath("/admin/mitglieder");
}

/**
 * Einen Antrag annehmen.
 *
 * Legt Login, Mitglied, Mitgliedschaft und Rolle an und überträgt die
 * Einwilligungen. Es gibt keine Mitglieder ohne Login, deshalb läuft das über
 * die Edge Function `member-login`: Sie lädt zuerst ein und nimmt dann den
 * Antrag mit dem neuen Login an.
 *
 * Alles oder nichts: Scheitert die Einladung oder die Annahme, bleibt der
 * Antrag offen, es entsteht kein Mitglied, und ein schon angelegter Login wird
 * wieder gelöscht. Die Meldung sagt, woran es lag.
 */
export async function antragAnnehmen(formData: FormData): Promise<AntragsErgebnis> {
  const id = String(formData.get("antrag") ?? "");
  const nummer = String(formData.get("number") ?? "").trim();
  const eintritt = String(formData.get("started_on") ?? "").trim();
  const beitragsart = String(formData.get("fee_type") ?? "").trim();

  const e = await memberLogin({
    aktion: "antrag_annehmen",
    antrag: {
      id,
      nummer: nummer || undefined,
      beitragsart: beitragsart || undefined,
      eintritt: eintritt || undefined,
    },
  });

  // Bewusst ohne neuLaden(): ein revalidatePath ersetzt hier den Teilbaum mit
  // dem nativen <dialog>, und das Fenster schließt sich mitsamt der Meldung,
  // in der die Mitgliedsnummer steht. Die Liste frischt die Komponente auf,
  // wenn der Vorstand das Fenster schließt.
  if (!e.ok) return { ok: false, meldung: e.meldung };
  return { ok: true, meldung: e.meldung, memberId: e.id };
}

export async function antragAblehnen(id: string, grund: string): Promise<AntragsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("decline_membership_application", {
    p_application_id: id,
    p_note: grund || undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden();
  return { ok: true, meldung: "Antrag abgelehnt. Eine Absage schreibt der Vorstand persönlich." };
}

export async function antragAlsSpam(id: string): Promise<AntragsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("mark_application_spam", { p_application_id: id });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden();
  return { ok: true, meldung: "Als Spam gekennzeichnet." };
}
