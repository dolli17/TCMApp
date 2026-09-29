import { createServerSupabase } from "@/lib/supabase/server";
import { BereichSegmente } from "@/components/BereichSegmente";

type Ziel = "/admin/mitglieder" | "/admin/mitglieder/antraege" | "/admin/mitglieder/mannschaften";

/**
 * Der Segment-Schalter der Mitglieder: Alle · Anträge · Mannschaften
 * (docs/design/clubhaus/verwaltung, Regel 1). Bei den Anträgen steht die
 * Zahl der offenen.
 */
export async function MitgliederSegmente({ aktiv }: { aktiv: Ziel }) {
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("membership_applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

  return (
    <BereichSegmente
      label="Mitglieder"
      aktiv={aktiv}
      eintraege={[
        { href: "/admin/mitglieder", label: "Alle" },
        { href: "/admin/mitglieder/antraege", label: "Anträge", zahl: count ?? 0 },
        { href: "/admin/mitglieder/mannschaften", label: "Mannschaften" },
      ]}
    />
  );
}
