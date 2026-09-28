import { createServerSupabase, getCurrentMember } from "@/lib/supabase/server";
import { KontoUnterseite } from "@/components/KontoUnterseite";
import { MerkmaleKarte, type MerkmalZeile } from "@/components/MerkmaleKarte";

export const dynamic = "force-dynamic";

/** Einwilligungen - dieselbe Merkmale-Karte wie vorher auf der Konto-Seite. */
export default async function EinwilligungenSeite() {
  const supabase = await createServerSupabase();
  const angemeldet = await getCurrentMember();
  const meineId = angemeldet?.member?.id;

  const { data } = meineId
    ? await supabase.rpc("member_attributes", { p_member_id: meineId })
    : { data: null };

  return (
    <KontoUnterseite titel="Einwilligungen">
      {meineId && (
        <MerkmaleKarte
          mitgliedId={meineId}
          zeilen={(data ?? []) as MerkmalZeile[]}
          titel="Einwilligungen"
          text="Du entscheidest, was der Verein darf. Jede Angabe lässt sich jederzeit widerrufen."
          nurSelbstpflege
        />
      )}
      <p className="beschreibung">Jede Änderung wird protokolliert und ist für den Vorstand einsehbar.</p>
    </KontoUnterseite>
  );
}
