import { einzugStand, formatCents, isoDateLabel, type DebitBatchStatus } from "@tcm/core";
import { ArtMarken } from "@/components/ArtMarke";
import { Listenzeile } from "@/components/Listenzeile";

export interface LaufZeile {
  id: string;
  title: string;
  collection_date: string;
  /** Die Arten im Einzug; null = alle */
  kinds: string[] | null;
  status: string;
  total_cents: number;
  item_count: number;
  zurueck: number;
}

/**
 * Die Einzüge als Listenzeilen: je Einzug die Statusmarke und vier kleine
 * Balken für die Stände (dieselbe Rechnung wie auf der Seite des Einzugs,
 * einzugStand).
 *
 * Früher fragte die Liste für jeden Entwurf die Datenbank nach Kandidaten.
 * Ein Einzug enthält seine Forderungen aber von Anfang an, der Stand steht
 * also schon am Lauf.
 */
export function LaufListe({ laeufe, heute, leer }: { laeufe: LaufZeile[]; heute: string; leer: string }) {
  if (laeufe.length === 0) return <p className="leer-klein">{leer}</p>;

  return (
    <ul className="liste-gruppe" aria-label="Einzüge">
      {laeufe.map((l) => {
        const stand = einzugStand({
          status: l.status as DebitBatchStatus,
          collectionDate: l.collection_date,
          itemCount: l.item_count,
          returned: l.zurueck,
          today: heute,
        });
        const nr = stand.schritte.findIndex((s) => s.state === "aktuell") + 1;
        const abgeschlossen = l.status === "completed";
        return (
          <li key={l.id}>
            <Listenzeile
              href={`/admin/kasse/lastschriften/${l.id}`}
              titel={l.title}
              kontext={
                <>
                  {l.kinds && <ArtMarken arten={l.kinds} />}{" "}
                  <span className="tnum">
                    {abgeschlossen ? "Abgebucht" : "Abbuchung"} {isoDateLabel(l.collection_date)} · {l.item_count}{" "}
                    {l.item_count === 1 ? "Mitglied" : "Mitglieder"}
                    {l.zurueck > 0 ? ` · ${l.zurueck} zurück` : ""}
                    {l.status === "submitted" ? ` · Rückläufer möglich bis ${isoDateLabel(stand.ruecklaeuferBis)}` : ""}
                  </span>
                  {!abgeschlossen && (
                    <ol className="mini-geldweg" aria-label={nr > 0 ? `Stand ${nr} von 4` : "abgeschlossen"}>
                      {stand.schritte.map((s) => (
                        <li key={s.key} className={s.state} title={`${s.name}: ${s.info}`} />
                      ))}
                    </ol>
                  )}
                </>
              }
              neben={
                <span className="neben">
                  <span className="betrag tnum">{formatCents(l.total_cents)}</span>
                  <span className={`statusmarke ${stand.ton}`}>{stand.label}</span>
                </span>
              }
            />
          </li>
        );
      })}
    </ul>
  );
}
