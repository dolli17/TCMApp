"use server";

import { revalidatePath } from "next/cache";
import { memberLogin, type LoginAktion } from "@/lib/supabase/member-login";
import type { AktionsErgebnis } from "./aktionen";

/**
 * Zugänge verwalten.
 *
 * Die eigentliche Arbeit macht die Edge Function `member-login` – nur sie hat
 * den Service-Schlüssel, mit dem sich Konten anlegen, einladen und sperren
 * lassen. Diese Aktion reicht die Anfrage samt Token des angemeldeten Admins
 * dorthin weiter; der Browser sieht ausschließlich das Ergebnis.
 */
export async function loginVerwalten(
  mitgliedId: string,
  aktion: LoginAktion,
): Promise<AktionsErgebnis> {
  const e = await memberLogin({ aktion, memberId: mitgliedId });

  revalidatePath(`/admin/mitglieder/${mitgliedId}`);
  revalidatePath("/admin/mitglieder");

  return { ok: e.ok, meldung: e.meldung };
}
