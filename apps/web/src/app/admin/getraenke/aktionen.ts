"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AktionsErgebnis {
  ok: boolean;
  meldung: string;
}

/**
 * Auf drink_items und drink_prices gibt es nur `grant select` - auch für
 * Admins. Alles Schreibende läuft deshalb über SECURITY-DEFINER-RPCs, genau
 * wie bei den Plätzen.
 */

/**
 * Nach jeder Änderung drei Seiten auffrischen.
 *
 * /getraenke und /kiosk sind kein Beiwerk: eine Preisänderung muss an der
 * Theke sofort ankommen, sonst bucht das nächste Mitglied noch zum alten
 * Preis - und wundert sich später über die Abrechnung.
 */
function frisch() {
  revalidatePath("/admin/getraenke");
  revalidatePath("/getraenke");
  revalidatePath("/kiosk");
}

export async function getraenkSpeichern(daten: {
  id: string | null;
  name: string;
  beschreibung: string;
  art: "drink" | "food" | "other";
  preisCents: number | null;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("upsert_drink_item", {
    // Beim Anlegen gibt es noch keine Id; die Funktion nimmt null als
    // "neu anlegen", der generierte Typ kennt aber nur string.
    p_id: daten.id as string,
    p_name: daten.name,
    p_description: daten.beschreibung,
    p_category: daten.art,
    p_price_cents: daten.preisCents ?? undefined,
    p_sort_order: undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();
  return { ok: true, meldung: daten.id ? "Getränk gespeichert." : "Getränk angelegt." };
}

export async function preisSetzen(daten: {
  itemId: string;
  preisCents: number;
  gueltigAb: string | null;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("set_drink_price", {
    p_item_id: daten.itemId,
    p_price_cents: daten.preisCents,
    p_valid_from: daten.gueltigAb ?? undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();

  // Die RPC gibt zurück, wie viele Buchungen im offenen Zeitraum den alten
  // Preis behalten. Das ist die Frage, die sich der Vorstand beim Ändern
  // stellt - deshalb steht die Antwort in der Meldung und nicht im Kleingedruckten.
  const alt = typeof data === "number" ? data : 0;
  const geplant = daten.gueltigAb && daten.gueltigAb > heuteInBerlin();

  if (geplant) {
    return {
      ok: true,
      meldung: `Der neue Preis gilt ab dem ${new Intl.DateTimeFormat("de-DE").format(
        new Date(daten.gueltigAb!),
      )}. Bis dahin bleibt alles beim Alten.`,
    };
  }

  return {
    ok: true,
    meldung:
      alt > 0
        ? `Preis geändert. ${alt} ${alt === 1 ? "Buchung" : "Buchungen"} aus diesem Monat ${
            alt === 1 ? "behält" : "behalten"
          } den alten Preis.`
        : "Preis geändert.",
  };
}

export async function geplantenPreisEntfernen(
  itemId: string,
  gueltigAb: string,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("remove_drink_price", {
    p_item_id: itemId,
    p_valid_from: gueltigAb,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();
  return { ok: true, meldung: "Der geplante Preis ist zurückgenommen." };
}

export async function getraenkUmschalten(
  id: string,
  aktiv: boolean,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("set_drink_item_active", {
    p_id: id,
    p_active: aktiv,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();

  const offen = typeof data === "number" ? data : 0;
  if (!aktiv && offen > 0) {
    return {
      ok: true,
      meldung: `Getränk stillgelegt. ${offen} ${
        offen === 1 ? "Buchung wird" : "Buchungen werden"
      } aus diesem Monat noch abgerechnet.`,
    };
  }
  return { ok: true, meldung: aktiv ? "Getränk ist wieder in der Karte." : "Getränk stillgelegt." };
}

export async function getraenkeSortieren(ids: string[]): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("reorder_drink_items", { p_ids: ids });
  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();
  return { ok: true, meldung: "Reihenfolge gespeichert." };
}

function heuteInBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}
