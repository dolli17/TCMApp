"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { loginVerwalten } from "../[id]/login-aktionen";

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
 * Legt Mitglied, Mitgliedschaft und Rolle an und überträgt die Einwilligungen.
 * Auf Wunsch geht direkt die Einladung hinterher – das ist der Regelfall, denn
 * ohne Zugang bringt die Aufnahme dem neuen Mitglied wenig.
 *
 * Scheitert die Einladung, gilt die Aufnahme trotzdem: das Mitglied ist
 * angelegt, und die Einladung lässt sich auf der Detailseite nachholen. Die
 * Meldung sagt beides.
 */
export async function antragAnnehmen(formData: FormData): Promise<AntragsErgebnis> {
  const id = String(formData.get("antrag") ?? "");
  const nummer = String(formData.get("number") ?? "").trim();
  const eintritt = String(formData.get("started_on") ?? "").trim();
  const beitragsart = String(formData.get("fee_type") ?? "").trim();
  const einladen = formData.get("einladen") === "on";

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("accept_membership_application", {
    p_application_id: id,
    p_number: nummer || undefined,
    p_fee_type_ids: beitragsart ? [beitragsart] : undefined,
    p_started_on: eintritt || undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  const ergebnis = data?.[0];

  // Bewusst ohne neuLaden(): ein revalidatePath ersetzt hier den Teilbaum mit
  // dem nativen <dialog>, und das Fenster schließt sich mitsamt der Meldung,
  // in der die Mitgliedsnummer steht. Die Liste frischt die Komponente auf,
  // wenn der Vorstand das Fenster schließt.
  const teile = [`Aufgenommen unter der Nummer ${ergebnis?.membership_number ?? "—"}.`];

  if (einladen && ergebnis?.needs_invite && ergebnis.member_id) {
    const e = await loginVerwalten(ergebnis.member_id, "einladen", false);
    teile.push(e.ok ? e.meldung : `Die Einladung ging nicht raus: ${e.meldung}`);
  }

  return { ok: true, meldung: teile.join(" "), memberId: ergebnis?.member_id ?? undefined };
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
