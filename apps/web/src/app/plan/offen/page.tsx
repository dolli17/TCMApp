import { createServerSupabase } from "@/lib/supabase/server";
import { OffeneSpiele, type OffenesSpiel } from "@/components/OffeneSpiele";
import { PlanReiter } from "@/components/PlanReiter";

export const dynamic = "force-dynamic";

export default async function OffeneSpieleSeite() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("open_matches", {});

  const spiele = (data ?? []) as OffenesSpiel[];
  const plaetze = spiele.reduce((s, o) => s + o.frei, 0);

  return (
    <>
      <section className="hero">
        <div className="kicker">Freiplätze</div>
        <h1>Offene Spiele</h1>
        <div className="meta">
          <div className="pill">
            <b className="tnum">{spiele.length}</b>
            <span>Buchungen suchen Mitspieler</span>
          </div>
          <div className="pill">
            <b className="tnum">{plaetze}</b>
            <span>freie Plätze</span>
          </div>
        </div>
      </section>

      <PlanReiter aktiv="offen" />

      {error ? (
        <div className="hinweis fehler">
          Die offenen Spiele konnten nicht geladen werden. ({error.message})
        </div>
      ) : (
        <OffeneSpiele spiele={spiele} />
      )}
    </>
  );
}
