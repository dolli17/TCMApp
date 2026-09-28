import { minutesOf, minutesToTime, occupancyKind } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { EinstellungsGruppe } from "@/components/EinstellungsGruppe";
import { FensterKnopf } from "@/components/FensterKnopf";
import {
  PlatzSperren, PlatzVerwaltung, type ArtZeile, type PlatzZeile,
} from "@/components/PlatzVerwaltung";
import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";
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

  const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const [plaetzeRes, artenRes, serienRes, aktivePlaetzeRes, einstellungRes, planRes] = await Promise.all([
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
    supabase.rpc("day_schedule", { p_date: heute }),
  ]);

  const plaetze = (plaetzeRes.data ?? []) as PlatzZeile[];
  const arten = (artenRes.data ?? []) as unknown as ArtZeile[];
  const blockungsarten = arten
    .filter((a) => a.applies_to === "blocking" && a.active)
    .map((a) => ({ code: a.code, name: a.name }));

  // Die Oeffnungszeiten stehen nur noch hier, nicht mehr zusaetzlich hart
  // kodiert im Sperrformular - sonst laufen die beiden auseinander, sobald
  // jemand die Zeiten aendert.
  // Was liegt jetzt gerade auf dem Platz? Sperrung und Serie aus dem
  // Tagesplan, eingeordnet wie im Belegungsplan (occupancyKind).
  const jetzt = Date.now();
  const zustand: Record<string, { text: string; art: "gesperrt" | "serie" }> = {};
  for (const b of planRes.data ?? []) {
    const art = occupancyKind(b);
    if ((art !== "gesperrt" && art !== "serie") || zustand[b.court_id]) continue;
    if (new Date(b.starts_at).getTime() <= jetzt && jetzt < new Date(b.ends_at).getTime()) {
      const bis = minutesToTime(minutesOf(b.ends_at));
      zustand[b.court_id] = { art, text: art === "gesperrt" ? `gesperrt bis ${bis}` : `Serie bis ${bis}` };
    }
  }

  const einstellungen = einstellungRes.data ?? [];
  const zeit = (schluessel: string, ersatz: string) =>
    String(einstellungen.find((e) => e.key === schluessel)?.value ?? `"${ersatz}"`)
      .replace(/"/g, "")
      .slice(0, 5);

  const oeffnung = zeit("booking.opening_time", "08:00");
  const schluss = zeit("booking.closing_time", "21:00");

  return (
    <div className="verwaltung">
      <VerwaltungsKopf
        titel="Plätze & Serien"
        unterzeile="Sperrungen, Serien, die Plätze selbst und die Regeln, nach denen gebucht wird."
      >
        <FensterKnopf titel="Serie anlegen" knopf="Serie anlegen" breit>
          <SerienFormular plaetze={aktivePlaetzeRes.data ?? []} arten={blockungsarten} />
        </FensterKnopf>
        <FensterKnopf titel="Plätze sperren" knopf="Plätze sperren" breit>
          <PlatzSperren plaetze={plaetze} arten={blockungsarten} oeffnung={oeffnung} schluss={schluss} />
        </FensterKnopf>
      </VerwaltungsKopf>

      {plaetzeRes.error && (
        <div className="hinweis fehler">
          Die Plätze konnten nicht geladen werden. ({plaetzeRes.error.message})
        </div>
      )}

      <section className="karte tabellenkarte" aria-labelledby="h-serien">
        <div className="kartenkopf">
          <h2 id="h-serien">Serien</h2>
        </div>
        <p className="unterzeile">
          Training und Verbandsspiele, die sich wöchentlich wiederholen. Bestehende Buchungen
          werden verdrängt – die Vorschau zeigt vorher, wen es trifft.
        </p>
        <SerienListe serien={(serienRes.data ?? []) as SerienZeile[]} />
      </section>

      <PlatzVerwaltung plaetze={plaetze} arten={arten} zustand={zustand} />

      <EinstellungsGruppe
        titel="Buchungsregeln"
        text="Zeiten, Raster, Kontingent und Gastgebühr."
        eintraege={einstellungen}
      />
    </div>
  );
}
