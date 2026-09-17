"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AktionsErgebnis {
  ok: boolean;
  meldung: string;
  /** Beim Anlegen: die Kennung der neuen Mannschaft. */
  id?: string;
}

/**
 * Eine Zuordnung ändert drei Ansichten: die Mannschaftsseite, die Detailseite
 * des Mitglieds und dessen Konto. Alle drei neu laden, sonst zeigt eine davon
 * noch den alten Stand.
 */
function neuLaden(mitgliedId?: string) {
  revalidatePath("/admin/mitglieder/mannschaften");
  revalidatePath("/admin/mitglieder");
  if (mitgliedId) revalidatePath(`/admin/mitglieder/${mitgliedId}`);
  revalidatePath("/konto");
}

export async function mannschaftSpeichern(formData: FormData): Promise<AktionsErgebnis> {
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const id = text("id") || undefined;
  const name = text("name");

  if (!name) return { ok: false, meldung: "Der Name fehlt." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("upsert_team", {
    p_name: name,
    p_id: id,
    p_active: formData.get("stillgelegt") !== "on",
    p_sort_order: Number(text("sort_order")) || 0,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden();
  return { ok: true, meldung: `„${name}" gespeichert.`, id: data ?? id };
}

/**
 * Eine Mannschaft löschen – samt Aufstellung. Die Rückfrage mit der
 * Spielerzahl stellt das Formular; hier wird nur ausgeführt.
 */
export async function mannschaftLoeschen(id: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("delete_team", { p_id: id });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden();
  return { ok: true, meldung: "Mannschaft gelöscht." };
}

/**
 * Ein Mitglied in die Mannschaft stellen oder sein Kennzeichen ändern.
 * Wer schon woanders spielt, wird umgehängt – ein Spieler hat genau eine.
 */
export async function spielerSetzen(
  mannschaftId: string,
  mitgliedId: string,
  mannschaftsfuehrer: boolean,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("set_member_team", {
    p_member_id: mitgliedId,
    p_team_id: mannschaftId,
    p_is_captain: mannschaftsfuehrer,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(mitgliedId);
  return {
    ok: true,
    meldung: mannschaftsfuehrer ? "Als Mannschaftsführer eingetragen." : "Eingetragen.",
  };
}

export async function spielerEntfernen(mitgliedId: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("set_member_team", {
    p_member_id: mitgliedId,
    p_team_id: undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(mitgliedId);
  return { ok: true, meldung: "Aus der Mannschaft genommen." };
}
