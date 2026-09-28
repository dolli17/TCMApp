import { createServerSupabase } from "@/lib/supabase/server";
import { MeineBuchungen, type MeineBuchung } from "@/components/MeineBuchungen";
import { OffeneSpiele, type OffenesSpiel } from "@/components/OffeneSpiele";
import { PlanSegmente } from "@/components/PlanSegmente";

export const dynamic = "force-dynamic";

/**
 * Meine & offene Spiele (Entwurf AppSpiele, wie in der App)
 *
 * Frueher zwei Seiten, /plan/meine und /plan/offen. Zusammen, weil beides
 * dieselbe Frage beantwortet: wann spiele ich, und wo fehlt noch jemand? Die
 * alten Adressen leiten hierher.
 */
export default async function SpieleSeite() {
  const supabase = await createServerSupabase();
  const [meineRes, offenRes] = await Promise.all([
    supabase.rpc("my_bookings", {}),
    supabase.rpc("open_matches", {}),
  ]);

  return (
    <>
      <header className="plan-kopf">
        <div>
          <div className="kicker">Plätze</div>
          <h1 className="pagetitle">Meine &amp; offene Spiele</h1>
        </div>
      </header>

      <PlanSegmente aktiv="spiele" />

      <section className="spiele-abschnitt meine" aria-labelledby="h-meine">
        <div className="sectionlabel">
          <h2 id="h-meine">Deine Termine</h2>
        </div>
        {meineRes.error ? (
          <div className="hinweis fehler">
            Deine Buchungen konnten nicht geladen werden. ({meineRes.error.message})
          </div>
        ) : (
          <MeineBuchungen buchungen={(meineRes.data ?? []) as MeineBuchung[]} />
        )}
      </section>

      <section className="spiele-abschnitt offen" aria-labelledby="h-offen">
        <div className="sectionlabel">
          <h2 id="h-offen">Offene Spiele</h2>
        </div>
        {offenRes.error ? (
          <div className="hinweis fehler">
            Die offenen Spiele konnten nicht geladen werden. ({offenRes.error.message})
          </div>
        ) : (
          <OffeneSpiele spiele={(offenRes.data ?? []) as OffenesSpiel[]} />
        )}
      </section>
    </>
  );
}
