import { createServerSupabase } from "@/lib/supabase/server";
import { MeineBuchungen, type MeineBuchung } from "@/components/MeineBuchungen";
import { PlanReiter } from "@/components/PlanReiter";

export const dynamic = "force-dynamic";

export default async function MeineBuchungenSeite() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("my_bookings", {});

  const buchungen = (data ?? []) as MeineBuchung[];
  const eigene = buchungen.filter((b) => b.bin_bucher).length;

  return (
    <>
      <section className="hero">
        <div className="kicker">Freiplätze</div>
        <h1>Meine Buchungen</h1>
        <div className="meta">
          <div className="pill">
            <b className="tnum">{buchungen.length}</b>
            <span>Termine stehen an</span>
          </div>
          <div className="pill">
            <b className="tnum">{eigene}</b>
            <span>davon selbst gebucht</span>
          </div>
        </div>
      </section>

      <PlanReiter aktiv="meine" />

      {error ? (
        <div className="hinweis fehler">
          Deine Buchungen konnten nicht geladen werden. ({error.message})
        </div>
      ) : (
        <MeineBuchungen buchungen={buchungen} />
      )}
    </>
  );
}
