"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export async function getraenkBuchen(itemId: string, menge: number) {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("record_drink_purchase", {
    p_item_id: itemId,
    p_quantity: menge,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  revalidatePath("/getraenke");
  return { ok: true, meldung: "Gebucht." };
}

export async function getraenkStornieren(purchaseId: string) {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("void_drink_purchase", {
    p_purchase_id: purchaseId,
    p_reason: "Fehlbuchung",
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  revalidatePath("/getraenke");
  return { ok: true, meldung: "Zurückgenommen." };
}

/** Für das Kiosk-Tablet: bucht auf ein beliebiges Mitglied. */
export async function kioskBuchen(memberId: string, itemId: string, menge: number) {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("record_drink_purchase_for", {
    p_member_id: memberId,
    p_item_id: itemId,
    p_quantity: menge,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  revalidatePath("/kiosk");
  return { ok: true, meldung: "Gebucht." };
}
