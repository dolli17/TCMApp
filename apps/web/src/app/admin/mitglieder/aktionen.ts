"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AnlegeErgebnis {
  ok: boolean;
  meldung: string;
  /** Bei Erfolg die Id des neuen Mitglieds, damit die Oberfläche dorthin führen kann. */
  id?: string;
}

/**
 * Neues Mitglied anlegen.
 *
 * Person, Mitgliedschaft und Grundrolle entstehen in einem Aufruf – die
 * Datenbank legt sie in einer Transaktion an, damit kein halbes Mitglied
 * zurückbleibt, wenn ein Schritt scheitert.
 */
export async function mitgliedAnlegen(formData: FormData): Promise<AnlegeErgebnis> {
  const text = (name: string): string | undefined => {
    const wert = String(formData.get(name) ?? "").trim();
    return wert.length > 0 ? wert : undefined;
  };

  const vorname = text("first_name");
  const nachname = text("last_name");

  // Billige Vorprüfung ohne Datenbankrunde. Die eigentliche Regel steht
  // trotzdem in create_member – hier geht es nur um schnelle Rückmeldung.
  if (!vorname || !nachname) {
    return { ok: false, meldung: "Vor- und Nachname sind Pflicht." };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("create_member", {
    p_first_name: vorname,
    p_last_name: nachname,
    p_email: text("email"),
    p_birthday: text("birthday"),
    p_gender: text("gender") as "female" | "male" | "diverse" | undefined,
    p_salutation: text("salutation") as "female" | "male" | "none" | undefined,
    p_phone: text("phone"),
    p_mobile: text("mobile"),
    p_street: text("street"),
    p_postcode: text("postcode"),
    p_city: text("city"),
    p_number: text("number"),
    p_started_on: text("started_on"),
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  revalidatePath("/admin/mitglieder");
  return { ok: true, meldung: `${vorname} ${nachname} wurde angelegt.`, id: data ?? undefined };
}
