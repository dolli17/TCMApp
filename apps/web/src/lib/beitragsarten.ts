import type { createServerSupabase } from "./supabase/server";

/** Eine Beitragsart zur Auswahl beim Anlegen und Aufnehmen. */
export interface Beitragsart {
  id: string;
  name: string;
  /** Der Preis, der in diesem Jahr gilt. Ohne hinterlegten Preis null. */
  preis_cents: number | null;
}

/**
 * Die Beitragsarten, die ein neues Mitglied bekommen kann.
 *
 * Ohne das Schlüsselpfand: Das ist kein Beitrag, sondern eine Kaution, und
 * kommt erst mit dem Schlüssel dazu. Wie application_form_options gilt der
 * jüngste Preis, der in diesem Jahr schon gültig ist, nicht einfach der
 * höchste oder neueste.
 */
export async function ladeBeitragsarten(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
): Promise<Beitragsart[]> {
  const jahr = Number(
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric" }).format(new Date()),
  );

  const { data } = await supabase
    .from("fee_types")
    .select("id, name, code, fee_prices(amount_cents, valid_from_year)")
    .eq("active", true)
    .neq("code", "schluesselpfand")
    .order("sort_order");

  return (data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    preis_cents:
      (Array.isArray(a.fee_prices) ? a.fee_prices : [])
        .filter((p) => p.valid_from_year <= jahr)
        .sort((x, y) => y.valid_from_year - x.valid_from_year)[0]?.amount_cents ?? null,
  }));
}
