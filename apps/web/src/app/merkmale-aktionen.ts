"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AktionsErgebnis {
  ok: boolean;
  meldung: string;
}

/**
 * Merkmale setzen und entfernen.
 *
 * Liegt bewusst nicht bei einer der beiden Routen: dieselben Aktionen tragen
 * die Adminansicht auf der Mitglieder-Detailseite und die Einwilligungen im
 * Konto. Wer darf was, entscheidet ohnehin die Datenbank – `self_editable`
 * am Merkmal plus die Zahler-Beziehung.
 */

function neuLaden(mitgliedId: string) {
  revalidatePath(`/admin/mitglieder/${mitgliedId}`);
  revalidatePath("/konto");
}

export async function merkmalSetzen(
  mitgliedId: string,
  code: string,
  optionWert?: string,
  textWert?: string,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("set_member_attribute", {
    p_member_id: mitgliedId,
    p_type_code: code,
    p_option_value: optionWert || undefined,
    p_text_value: textWert || undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(mitgliedId);
  return { ok: true, meldung: "Gespeichert." };
}

export async function merkmalEntfernen(
  mitgliedId: string,
  code: string,
  optionWert?: string,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("remove_member_attribute", {
    p_member_id: mitgliedId,
    p_type_code: code,
    p_option_value: optionWert || undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(mitgliedId);
  return { ok: true, meldung: "Entfernt." };
}
