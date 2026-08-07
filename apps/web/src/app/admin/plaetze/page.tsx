import { createServerSupabase } from "@/lib/supabase/server";
import { EinstellungsGruppe } from "@/components/EinstellungsGruppe";
import {
  PlatzVerwaltung, type ArtZeile, type PlatzZeile,
} from "@/components/PlatzVerwaltung";
import { SerienFormular } from "@/components/SerienFormular";
import { SerienListe, type SerienZeile } from "@/components/SerienListe";

export const dynamic = "force-dynamic";

/**
 * Alles zum Platz an einem Ort.
 *
 * Vorher lag das an drei Stellen: Plätze und Buchungsarten hier, wiederkehrende
 * Sperrungen unter „Serien", und Zeiten, Raster und Kontingent in einer
 * allgemeinen Einstellungsliste. Wer die Buchungsdauer ändern wollte, fand sie
 * bei den Buchungsarten - das Raster dagegen woanders.
 *
 * Die Reihenfolge folgt der Häufigkeit: sperren tut der Vorstand oft, Plätze
 * anlegen einmal im Jahrzehnt.
 */
export default async function PlaetzeSeite() {
  const supabase = await createServerSupabase();

  const [plaetzeRes, artenRes, serienRes, aktivePlaetzeRes, einstellungRes] = await Promise.all([
    supabase.rpc("court_overview"),
    supabase
      .from("booking_types")
      .select(
        "code, name, applies_to, duration_minutes, min_players, max_players, " +
          "requires_partner, counts_towards_quota, active",
      )
      .order("sort_order"),
    supabase.rpc("series_overview"),
    supabase.from("courts").select("id, name").eq("active", true).order("position"),
    supabase
      .from("settings")
      .select("key, value, value_type, label, description, updated_at")
      .like("key", "booking.%")
      .order("key"),
  ]);

  const plaetze = (plaetzeRes.data ?? []) as PlatzZeile[];
  const arten = (artenRes.data ?? []) as unknown as ArtZeile[];
  const blockungsarten = arten
    .filter((a) => a.applies_to === "blocking" && a.active)
    .map((a) => ({ code: a.code, name: a.name }));

  // Die Oeffnungszeiten stehen nur noch hier, nicht mehr zusaetzlich hart
  // kodiert im Sperrformular - sonst laufen die beiden auseinander, sobald
  // jemand die Zeiten aendert.
  const einstellungen = einstellungRes.data ?? [];
  const zeit = (schluessel: string, ersatz: string) =>
    String(einstellungen.find((e) => e.key === schluessel)?.value ?? `"${ersatz}"`)
      .replace(/"/g, "")
      .slice(0, 5);

  return (
    <>
      <h1 className="pagetitle">Plätze</h1>
      <p className="unterzeile">
        Sperrungen, Serien, die Plätze selbst und die Regeln, nach denen gebucht wird.
      </p>

      {plaetzeRes.error && (
        <div className="hinweis fehler">
          Die Plätze konnten nicht geladen werden. ({plaetzeRes.error.message})
        </div>
      )}

      <PlatzVerwaltung
        plaetze={plaetze}
        arten={arten}
        blockungsarten={blockungsarten}
        oeffnung={zeit("booking.opening_time", "08:00")}
        schluss={zeit("booking.closing_time", "21:00")}
      />

      <section className="karte" style={{ marginBottom: 18 }}>
        <h2 className="dpl">Serien</h2>
        <p className="unterzeile">
          Training und Verbandsspiele, die sich wöchentlich wiederholen. Bestehende Buchungen
          werden verdrängt – die Vorschau zeigt vorher, wen es trifft.
        </p>

        <SerienFormular plaetze={aktivePlaetzeRes.data ?? []} arten={blockungsarten} />

        <h3 className="dpl">Angelegte Serien</h3>
        <SerienListe serien={(serienRes.data ?? []) as SerienZeile[]} />
      </section>

      <EinstellungsGruppe
        titel="Buchungsregeln"
        text="Zeiten, Raster, Kontingent und Gastgebühr."
        eintraege={einstellungen}
      />
    </>
  );
}
