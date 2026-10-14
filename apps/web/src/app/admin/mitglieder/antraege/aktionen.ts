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
 *
 * „Später festlegen“ heißt: keine Beitragsart. accept_membership_application
 * nimmt ohne ausdrückliche Wahl aber den Wunsch aus dem Antrag. Deshalb wird
 * der Wunsch vorher gelesen und die Zuordnung danach wieder entfernt.
 */
export async function antragAnnehmen(formData: FormData): Promise<AntragsErgebnis> {
  const id = String(formData.get("antrag") ?? "");
  const nummer = String(formData.get("number") ?? "").trim();
  const eintritt = String(formData.get("started_on") ?? "").trim();
  const beitragsart = String(formData.get("fee_type") ?? "").trim();

  const supabase = await createServerSupabase();
  let wunsch: string | null = null;
  if (!beitragsart) {
    const { data } = await supabase
      .from("membership_applications")
      .select("desired_fee_type_id")
      .eq("id", id)
      .maybeSingle();
    wunsch = data?.desired_fee_type_id ?? null;
  }

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

  if (wunsch && e.id) {
    const { error } = await supabase.rpc("remove_member_fee", {
      p_member_id: e.id,
      p_fee_type_id: wunsch,
      // Das Jahr, für das create_member zuordnet (current_date der Datenbank, UTC).
      p_year: new Date().getUTCFullYear(),
    });
    if (error) {
      return {
        ok: true,
        meldung: `${e.meldung} Die gewünschte Beitragsart wurde trotzdem zugeordnet und ließ sich nicht entfernen: ${translateDbError(error)}`,
        memberId: e.id,
      };
    }
  }

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
