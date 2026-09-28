import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { FensterKnopf } from "@/components/FensterKnopf";
import { MitgliederSegmente } from "@/components/MitgliederSegmente";
import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";
import { AufstellungKarte, type Aufstellungszeile } from "@/components/AufstellungKarte";
import { MannschaftsFormular, type Mannschaft } from "@/components/MannschaftsFormular";
import type { Person } from "@/components/Personensuche";

export const dynamic = "force-dynamic";

export default async function MannschaftenSeite({
  searchParams,
}: {
  searchParams: Promise<{ bearbeiten?: string }>;
}) {
  const { bearbeiten } = await searchParams;
  // Das Rollenschloss steht im Layout - siehe app/admin/layout.tsx.

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("team_overview");

  if (error) {
    return <div className="hinweis fehler">{error.message}</div>;
  }

  const mannschaften = (data ?? []) as Mannschaft[];
  const inBearbeitung = mannschaften.find((m) => m.id === bearbeiten);

  // Aufstellung und Verzeichnis nur laden, wenn eine Mannschaft offen ist.
  let aufstellung: Aufstellungszeile[] = [];
  let verzeichnis: Person[] = [];
  if (inBearbeitung) {
    const [rosterRes, verzeichnisRes] = await Promise.all([
      supabase.rpc("team_roster", { p_team_id: inBearbeitung.id }),
      supabase.rpc("member_directory", { p_query: "" }),
    ]);
    aufstellung = (rosterRes.data ?? []) as Aufstellungszeile[];
    verzeichnis = (verzeichnisRes.data ?? []) as Person[];
  }

  return (
    <div className="verwaltung">
      <VerwaltungsKopf
        kicker="Verwaltung · Mitglieder"
        titel="Mannschaften"
        unterzeile="Wer spielt in welcher Mannschaft, und wer führt sie. Ein Spieler steht in höchstens einer Mannschaft – die meisten Mitglieder in keiner."
      >
        <FensterKnopf titel="Mannschaft anlegen" knopf="Mannschaft anlegen">
          <MannschaftsFormular key="neu" />
        </FensterKnopf>
      </VerwaltungsKopf>
      <MitgliederSegmente aktiv="/admin/mitglieder/mannschaften" />

      <div className="karte tabellenkarte">
        {mannschaften.length === 0 ? (
          <p className="leer-klein">Noch keine Mannschaften angelegt.</p>
        ) : (
          <table className="liste">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col" className="zahl">Spieler</th>
                <th scope="col">Mannschaftsführer</th>
                <th scope="col"><span className="sr-only">Aktion</span></th>
              </tr>
            </thead>
            <tbody>
              {mannschaften.map((m) => (
                <tr key={m.id}>
                  <td className="fett">
                    {m.name}
                    {!m.active && <span className="statusmarke"> stillgelegt</span>}
                  </td>
                  <td data-label="Spieler" className="zahl dpl tnum">{m.member_count}</td>
                  <td data-label="Mannschaftsführer" className="leiser">{m.captain_name ?? "–"}</td>
                  <td className="aktion">
                    <Link className="knopf leise klein" href={`/admin/mitglieder/mannschaften?bearbeiten=${m.id}`}>
                      bearbeiten
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {inBearbeitung && (
        // Der key baut das Formular beim Wechsel der Mannschaft neu auf.
        <FensterKnopf
          key={inBearbeitung.id}
          titel="Mannschaft bearbeiten"
          offen
          zurueck="/admin/mitglieder/mannschaften"
          breit
        >
          <MannschaftsFormular vorhanden={inBearbeitung} />
          <AufstellungKarte
            mannschaftId={inBearbeitung.id}
            aktiv={inBearbeitung.active}
            zeilen={aufstellung}
            verzeichnis={verzeichnis}
          />
        </FensterKnopf>
      )}
    </div>
  );
}
