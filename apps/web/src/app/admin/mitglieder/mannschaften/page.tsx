import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
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
    <>
      <Link href="/admin/mitglieder" className="zurueck">
        ← Mitglieder
      </Link>

      <h1 className="pagetitle">Mannschaften</h1>
      <p className="unterzeile">
        Wer spielt in welcher Mannschaft, und wer führt sie. Ein Spieler steht in höchstens
        einer Mannschaft – die meisten Mitglieder in keiner.
      </p>

      <div className="tabellenhuelle">
        <table className="liste">
          <thead>
            <tr>
              <th>Name</th>
              <th className="zahl">Spieler</th>
              <th>Mannschaftsführer</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {mannschaften.length === 0 ? (
              <tr>
                <td colSpan={4} className="leer">
                  Noch keine Mannschaften angelegt.
                </td>
              </tr>
            ) : (
              mannschaften.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.name}
                    {!m.active && <span className="marke-klein grau"> stillgelegt</span>}
                  </td>
                  <td className="zahl">{m.member_count}</td>
                  <td>{m.captain_name ?? <span className="beschreibung">–</span>}</td>
                  <td>
                    <Link href={`/admin/mitglieder/mannschaften?bearbeiten=${m.id}`}>
                      bearbeiten
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="dpl" style={{ marginTop: "2rem" }}>
        {inBearbeitung ? "Mannschaft bearbeiten" : "Mannschaft anlegen"}
      </h2>

      {/* Der key baut das Formular beim Wechsel zwischen Bearbeiten und
          Anlegen neu auf, wie beim Merkmalsformular. */}
      <MannschaftsFormular key={inBearbeitung?.id ?? "neu"} vorhanden={inBearbeitung} />

      {inBearbeitung && (
        <>
          <AufstellungKarte
            mannschaftId={inBearbeitung.id}
            aktiv={inBearbeitung.active}
            zeilen={aufstellung}
            verzeichnis={verzeichnis}
          />
          <Link href="/admin/mitglieder/mannschaften" className="knopf leise">
            Neue Mannschaft anlegen
          </Link>
        </>
      )}
    </>
  );
}
