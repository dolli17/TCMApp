import Link from "next/link";
import { debitFlow, formatCents, isoDateLabel, type DebitBatchStatus } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface LaufZeile {
  id: string;
  title: string;
  collection_date: string;
  status: string;
  total_cents: number;
  item_count: number;
  zurueck: number;
}

function heuteInBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}

/**
 * Die Lastschriftlaeufe als Tabelle: je Lauf die Statusmarke und ein kleiner
 * Weg des Geldes (dieselbe Rechnung wie auf der Laufseite, debitFlow).
 *
 * Fuer Entwuerfe fragt die Liste die Datenbank, wer einzugsfaehig ist - wie
 * die Laufseite. Das sind in der Praxis ein, zwei Laeufe.
 */
export async function LaufListe({ laeufe }: { laeufe: LaufZeile[] }) {
  const supabase = await createServerSupabase();
  const heute = heuteInBerlin();

  const kandidaten = new Map<string, { alle: number; bereit: number }>();
  const entwuerfe = laeufe.filter((l) => l.status === "draft" && l.item_count === 0);
  const [spaetesterRes] = await Promise.all([
    // Der angekuendigte Faelligkeitstag, gelesen wie auf der Laufseite
    entwuerfe.length
      ? supabase
          .from("charges")
          .select("due_date")
          .eq("status", "notified")
          .not("due_date", "is", null)
          .order("due_date", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    ...entwuerfe.map(async (l) => {
      const { data } = await supabase.rpc("debit_batch_candidates", { p_collection_date: l.collection_date });
      kandidaten.set(l.id, {
        alle: (data ?? []).length,
        bereit: (data ?? []).filter((k) => k.einzugsfaehig).length,
      });
    }),
  ]);
  const faelligAb = (spaetesterRes as { data: { due_date: string | null } | null }).data?.due_date ?? null;

  if (laeufe.length === 0) {
    return <p className="leer-klein">Es gibt noch keinen Lastschriftlauf.</p>;
  }

  return (
    <table className="liste">
      <thead>
        <tr>
          <th scope="col">Lauf</th>
          <th scope="col">Fällig</th>
          <th scope="col">Weg des Geldes</th>
          <th scope="col" className="zahl">Lastschriften</th>
          <th scope="col" className="zahl">Summe</th>
          <th scope="col"><span className="sr-only">Aktion</span></th>
        </tr>
      </thead>
      <tbody>
        {laeufe.map((l) => {
          const weg = debitFlow({
            charges: {
              payers: kandidaten.get(l.id)?.alle ?? 0,
              totalCents: 0,
              unannounced: 0,
              dueDate: kandidaten.has(l.id) ? faelligAb : null,
            },
            batch: {
              status: l.status as DebitBatchStatus,
              collectionDate: l.collection_date,
              itemCount: l.item_count,
              readyPayers: kandidaten.get(l.id)?.bereit ?? 0,
              returned: l.zurueck,
            },
            today: heute,
          });
          return (
            <tr key={l.id}>
              <td>
                <Link className="fett" href={`/admin/kasse/lastschriften/${l.id}`}>{l.title}</Link>
                <span className="marken-zeile">
                  <span className={`statusmarke ${weg.current === null ? "gruen" : "gelb"}`}>{weg.label}</span>
                  {l.zurueck > 0 && <span className="statusmarke rot">{l.zurueck} zurück</span>}
                </span>
              </td>
              <td data-label="Fällig" className="leiser">{isoDateLabel(l.collection_date)}</td>
              <td data-label="Weg des Geldes">
                <ol className="mini-geldweg" aria-label={`Schritt ${weg.steps.findIndex((s) => s.state === "aktuell") + 1 || 5} von 5`}>
                  {weg.steps.map((s) => (
                    <li key={s.key} className={s.state} title={`${s.name}: ${s.info}`} />
                  ))}
                </ol>
              </td>
              <td data-label="Lastschriften" className="zahl dpl tnum">{l.item_count}</td>
              <td data-label="Summe" className="zahl betrag dpl tnum">{formatCents(l.total_cents)}</td>
              <td className="aktion">
                <Link className="knopf leise klein" href={`/admin/kasse/lastschriften/${l.id}`}>
                  Öffnen
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
