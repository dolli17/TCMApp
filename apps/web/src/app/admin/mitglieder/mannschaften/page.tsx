import { createServerSupabase } from "@/lib/supabase/server";
import { FensterKnopf } from "@/components/FensterKnopf";
import { Listenzeile } from "@/components/Listenzeile";
import { MitgliederSegmente } from "@/components/MitgliederSegmente";
import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";
import { AufstellungKarte, type Aufstellungszeile } from "@/components/AufstellungKarte";
import { MannschaftsFormular, type Mannschaft } from "@/components/MannschaftsFormular";
import type { Person } from "@/components/Personensuche";
import { translateDbError } from "@tcm/core";
import { Fehlerzustand } from "@/components/Fehlerzustand";
import { Leerzustand } from "@/components/Leerzustand";

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
    return <Fehlerzustand text={translateDbError(error)} />;
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
      >
        <FensterKnopf titel="Mannschaft anlegen" knopf="Mannschaft anlegen">
          <MannschaftsFormular key="neu" />
        </FensterKnopf>
      </VerwaltungsKopf>
      {/* Unter dem Schalter, damit er nicht springt (U63) */}
      <MitgliederSegmente aktiv="/admin/mitglieder/mannschaften" />
      <p className="unterzeile">
        Wer spielt in welcher Mannschaft, und wer führt sie. Ein Spieler steht in höchstens einer
        Mannschaft – die meisten Mitglieder in keiner.
      </p>

      {mannschaften.length === 0 ? (
        <Leerzustand text="Noch keine Mannschaften angelegt. Die erste legst du oben über „Mannschaft anlegen“ an." />
      ) : (
        <ul className="liste-gruppe" aria-label="Mannschaften">
          {mannschaften.map((m) => (
            <li key={m.id}>
              <Listenzeile
                href={`/admin/mitglieder/mannschaften?bearbeiten=${m.id}`}
                symbol={m.name.replace(/[^A-ZÄÖÜ0-9]/g, "").slice(0, 3) || m.name.slice(0, 2)}
                titel={m.name}
                kontext={`${m.member_count} Spieler${m.captain_name ? ` · Führer: ${m.captain_name}` : ""}`}
                hinweis={m.active ? undefined : "stillgelegt"}
              />
            </li>
          ))}
        </ul>
      )}

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
