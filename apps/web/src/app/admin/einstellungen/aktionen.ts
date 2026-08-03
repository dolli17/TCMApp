"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AktionsErgebnis {
  ok: boolean;
  meldung: string;
}

/**
 * Speichert alle geänderten Werte einer Gruppe.
 *
 * Bewusst nacheinander und nicht in einem Rutsch: die Prüfung sitzt in
 * set_setting, und wenn ein Wert unsinnig ist, soll die Meldung sagen welcher.
 * Es sind höchstens eine Handvoll Felder je Gruppe.
 */
export async function einstellungenSpeichern(formData: FormData): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const eintraege = [...formData.entries()]
    .filter(([name]) => name.startsWith("wert:"))
    .map(([name, wert]) => [name.slice("wert:".length), String(wert)] as const);

  if (eintraege.length === 0) {
    return { ok: false, meldung: "Nichts zu speichern." };
  }

  for (const [schluessel, wert] of eintraege) {
    const alt = String(formData.get(`alt:${schluessel}`) ?? "");
    if (wert === alt) continue;

    const { error } = await supabase.rpc("set_setting", {
      p_key: schluessel,
      p_value: wert,
    });

    if (error) {
      return { ok: false, meldung: `${schluessel}: ${translateDbError(error)}` };
    }
  }

  revalidatePath("/admin/einstellungen");
  revalidatePath("/plan");
  return { ok: true, meldung: "Einstellungen gespeichert." };
}
