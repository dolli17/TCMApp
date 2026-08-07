import { createServerSupabase, getCurrentMember, isAdmin } from "@/lib/supabase/server";
import {
  PlatzVerwaltung, type ArtZeile, type PlatzZeile,
} from "@/components/PlatzVerwaltung";

export const dynamic = "force-dynamic";

export default async function PlaetzeSeite() {
  const angemeldet = await getCurrentMember();

  if (!angemeldet || !isAdmin(angemeldet.roles)) {
    return <div className="hinweis fehler">Plätze können nur Administratoren pflegen.</div>;
  }

  const supabase = await createServerSupabase();

  const [plaetzeRes, artenRes] = await Promise.all([
    supabase.rpc("court_overview"),
    supabase
      .from("booking_types")
      .select(
        "code, name, applies_to, duration_minutes, min_players, max_players, " +
          "requires_partner, counts_towards_quota, active",
      )
      .order("sort_order"),
  ]);

  const plaetze = (plaetzeRes.data ?? []) as PlatzZeile[];
  const arten = (artenRes.data ?? []) as unknown as ArtZeile[];
  const blockungsarten = arten
    .filter((a) => a.applies_to === "blocking" && a.active)
    .map((a) => ({ code: a.code, name: a.name }));

  return (
    <>
      <h1 className="pagetitle">Plätze und Buchungsarten</h1>
      <p className="unterzeile">
        Sperrungen für einzelne Tage, die Reihenfolge der Plätze im Belegungsplan und die Regeln
        der Buchungsarten.
      </p>

      {plaetzeRes.error && (
        <div className="hinweis fehler">
          Die Plätze konnten nicht geladen werden. ({plaetzeRes.error.message})
        </div>
      )}

      <PlatzVerwaltung plaetze={plaetze} arten={arten} blockungsarten={blockungsarten} />
    </>
  );
}
