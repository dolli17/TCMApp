"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AktionsErgebnis {
  ok: boolean;
  meldung: string;
}

type Art = "list" | "text" | "date" | "boolean" | "number";

/**
 * Ein Merkmal anlegen oder ändern – samt Werteliste in einem Zug.
 *
 * Die Liste kommt als eine Zeile je Wert aus einem Textfeld: `wert = Anzeige`
 * oder nur `wert`. Das ist die schlichteste Form, die eine Werteliste
 * bearbeitbar macht, ohne eine eigene Tabellenoberfläche zu bauen.
 */
export async function merkmalSpeichern(formData: FormData): Promise<AktionsErgebnis> {
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const an = (name: string) => formData.get(name) === "on";

  const code = text("code");
  const art = (text("value_kind") || "list") as Art;

  if (!code) return { ok: false, meldung: "Der Schlüssel fehlt." };
  if (!text("name")) return { ok: false, meldung: "Der Name fehlt." };

  const supabase = await createServerSupabase();

  const { data: id, error } = await supabase.rpc("upsert_member_attribute_type", {
    p_code: code,
    p_name: text("name"),
    p_description: text("description"),
    p_value_kind: art,
    p_multiple: an("multiple"),
    p_self_editable: an("self_editable"),
    p_in_application: an("in_application"),
    p_active: !an("stillgelegt"),
    p_sort_order: Number(text("sort_order")) || 0,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  // Werteliste nur bei Auswahl-Merkmalen.
  if (art === "list" && id) {
    const optionen = text("optionen")
      .split("\n")
      .map((zeile) => zeile.trim())
      .filter(Boolean)
      .map((zeile) => {
        const [wert, ...rest] = zeile.split("=");
        const value = (wert ?? "").trim();
        const label = rest.join("=").trim();
        return { value, label: label || value };
      })
      .filter((o) => o.value.length > 0);

    const { error: fehler } = await supabase.rpc("set_member_attribute_options", {
      p_type_id: id,
      p_options: optionen,
    });

    if (fehler) return { ok: false, meldung: translateDbError(fehler) };
  }

  revalidatePath("/admin/einstellungen/merkmale");
  return { ok: true, meldung: `„${text("name")}" gespeichert.` };
}

/**
 * Ein Merkmal löschen.
 *
 * Geht nur, solange niemand einen Wert dazu hat – die Datenbank weist es sonst
 * ab und nennt die Zahl. Gedacht ist das für den versehentlich angelegten
 * Eintrag, dessen Schlüssel sich nachträglich nicht mehr ändern lässt.
 */
export async function merkmalLoeschen(code: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("delete_member_attribute_type", { p_code: code });

  if (error) return { ok: false, meldung: translateDbError(error) };

  revalidatePath("/admin/einstellungen/merkmale");
  return { ok: true, meldung: "Merkmal gelöscht." };
}
