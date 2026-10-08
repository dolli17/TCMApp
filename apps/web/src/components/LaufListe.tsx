import { debitFlow, formatCents, isoDateLabel, type DebitBatchStatus } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { ArtMarken } from "@/components/ArtMarke";
import { Listenzeile } from "@/components/Listenzeile";

export interface LaufZeile {
  id: string;
  title: string;
  collection_date: string;
  /** Eingeschränkt auf diese Arten; null = alle */
  kinds: string[] | null;
  status: string;
  total_cents: number;
  item_count: number;
  zurueck: number;
}

function heuteInBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}

/**
 * Die Lastschriftlaeufe als Listenzeilen: je Lauf die Statusmarke und ein kleiner
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
      const { data } = await supabase.rpc("debit_batch_candidates", {
        p_collection_date: l.collection_date,
        p_kinds: (l.kinds ?? undefined) as never,
      });
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
    <ul className="liste-gruppe" aria-label="Lastschriftläufe">
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
        const nr = weg.steps.findIndex((s) => s.state === "aktuell") + 1;
        return (
          <li key={l.id}>
            <Listenzeile
              href={`/admin/kasse/lastschriften/${l.id}`}
              titel={l.title}
              kontext={
                <>
                  {l.kinds && <ArtMarken arten={l.kinds} />}{" "}
                  <span className="tnum">
                    Fällig {isoDateLabel(l.collection_date)} · {l.item_count}{" "}
                    {l.item_count === 1 ? "Lastschrift" : "Lastschriften"}
                    {l.zurueck > 0 ? ` · ${l.zurueck} zurück` : ""}
                  </span>
                  <ol className="mini-geldweg" aria-label={nr > 0 ? `Schritt ${nr} von 5` : "abgeschlossen"}>
                    {weg.steps.map((s) => (
                      <li key={s.key} className={s.state} title={`${s.name}: ${s.info}`} />
                    ))}
                  </ol>
                </>
              }
              neben={
                <span className="neben">
                  <span className="betrag tnum">{formatCents(l.total_cents)}</span>
                  <span className={`statusmarke ${weg.current === null ? "gruen" : "gelb"}`}>{weg.label}</span>
                </span>
              }
            />
          </li>
        );
      })}
    </ul>
  );
}
