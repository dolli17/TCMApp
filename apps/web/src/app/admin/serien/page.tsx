import { createServerSupabase, getCurrentMember, isAdmin } from "@/lib/supabase/server";
import { SerienFormular } from "@/components/SerienFormular";
import { SerienListe, type SerienZeile } from "@/components/SerienListe";

export const dynamic = "force-dynamic";

export default async function SerienSeite() {
  const angemeldet = await getCurrentMember();

  if (!angemeldet || !isAdmin(angemeldet.roles)) {
    return (
      <div className="hinweis fehler">Serien können nur Administratoren anlegen.</div>
    );
  }

  const supabase = await createServerSupabase();

  const [plaetzeRes, artenRes, serienRes] = await Promise.all([
    supabase.from("courts").select("id, name").eq("active", true).order("position"),
    supabase
      .from("booking_types")
      .select("code, name")
      .eq("applies_to", "blocking")
      .eq("active", true)
      .order("sort_order"),
    // Ueber die RPC statt direkt: sie bringt die Zahl der noch anstehenden
    // Termine mit, und genau die entscheidet, ob sich das Beenden lohnt.
    supabase.rpc("series_overview"),
  ]);

  return (
    <>
      <h1 className="pagetitle">Serien-Blockungen</h1>
      <p className="unterzeile">
        Training und Verbandsspiele. Bestehende Buchungen werden verdrängt – die
        Vorschau zeigt vorher, wen es trifft.
      </p>

      <SerienFormular
        plaetze={plaetzeRes.data ?? []}
        arten={artenRes.data ?? []}
      />

      <h2 className="dpl">Angelegte Serien</h2>
      <SerienListe serien={(serienRes.data ?? []) as SerienZeile[]} />

    </>
  );
}
