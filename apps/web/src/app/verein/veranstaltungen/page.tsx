import Link from "next/link";
import { eventMonatsGruppen } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { alsMitgliedEvent } from "@/lib/veranstaltungen";
import { EventKarte } from "@/components/EventKarte";
import { VereinSegmente } from "@/components/VereinSegmente";

export const dynamic = "force-dynamic";

/**
 * Veranstaltungen für Mitglieder (Entwurf Main, Verein > Veranstaltungen)
 *
 * Kommendes nach Monat, Vergangenes über den Link darunter (?vergangen=1).
 * Entwürfe liefert events_fuer_mitglied gar nicht erst.
 */
export default async function VeranstaltungenSeite({
  searchParams,
}: {
  searchParams: Promise<{ vergangen?: string }>;
}) {
  const vergangen = (await searchParams).vergangen === "1";
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("events_fuer_mitglied");
  const jetzt = new Date();
  const gruppen = eventMonatsGruppen((data ?? []).map(alsMitgliedEvent), jetzt, vergangen);

  return (
    <div className="verein-veranstaltungen">
      <VereinSegmente aktiv="veranstaltungen" />

      {vergangen && (
        <div className="sectionlabel">
          <h2>Vergangene Veranstaltungen</h2>
          <Link href="/verein/veranstaltungen">Kommende</Link>
        </div>
      )}

      {error ? (
        <div className="hinweis fehler">Die Veranstaltungen ließen sich nicht laden.</div>
      ) : gruppen.length === 0 ? (
        <p className="leer-klein">
          {vergangen ? "Noch keine vergangenen Veranstaltungen." : "Gerade ist nichts geplant."}
        </p>
      ) : (
        gruppen.map((g) => (
          <section key={g.schluessel} className="event-monat" aria-labelledby={`h-${g.schluessel}`}>
            <h2 id={`h-${g.schluessel}`} className="event-monat-titel">{g.titel}</h2>
            <ul className="event-liste">
              {g.events.map((e) => (
                <li key={e.id}><EventKarte e={e} jetzt={jetzt} /></li>
              ))}
            </ul>
          </section>
        ))
      )}

      {!vergangen && (
        <p className="event-vergangen-link">
          <Link href="/verein/veranstaltungen?vergangen=1">Vergangene Veranstaltungen</Link>
        </p>
      )}
    </div>
  );
}
