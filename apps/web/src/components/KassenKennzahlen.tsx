import Link from "next/link";
import { formatCents } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Die drei Kennzahlen der Kasse: was noch nicht eingezogen ist, was in
 * laufenden Einzügen steckt, welche Rückläufer offen sind. Nur Lesen.
 */
export async function KassenKennzahlen() {
  const supabase = await createServerSupabase();
  const [gruppenRes, laeufeRes] = await Promise.all([
    supabase.rpc("einzug_gruppen"),
    // Ein leerer Einzug (alle herausgenommen) laeuft nicht.
    supabase.from("debit_batches").select("total_cents").neq("status", "completed").gt("item_count", 0),
  ]);

  const gruppen = gruppenRes.data ?? [];
  const offen = gruppen.filter((g) => !g.ruecklaeufer);
  const zurueck = gruppen.filter((g) => g.ruecklaeufer);
  const summe = (zeilen: { summe_cents: number }[]) => zeilen.reduce((s, z) => s + z.summe_cents, 0);
  const anzahl = (zeilen: { anzahl: number }[]) => zeilen.reduce((s, z) => s + z.anzahl, 0);
  const laeufe = laeufeRes.data ?? [];
  const n = anzahl(offen);
  const r = anzahl(zurueck);

  return (
    <div className="kennzahlen drei">
      <Link href="/admin/kasse?abschnitt=forderungen&stand=open" className="kennzahl">
        <span className="label">Noch nicht eingezogen</span>
        <span className="wert dpl tnum">{gruppenRes.error ? "–" : formatCents(summe(offen))}</span>
        <span className="info">{n} {n === 1 ? "Forderung" : "Forderungen"}</span>
      </Link>
      <Link href="/admin/kasse?abschnitt=einzuege" className="kennzahl">
        <span className="label">In laufenden Einzügen</span>
        <span className="wert dpl tnum">
          {laeufeRes.error ? "–" : formatCents(laeufe.reduce((s, l) => s + l.total_cents, 0))}
        </span>
        <span className="info">{laeufe.length} {laeufe.length === 1 ? "Einzug" : "Einzüge"}</span>
      </Link>
      <Link href="/admin/kasse?abschnitt=forderungen&stand=returned" className="kennzahl">
        <span className="label">Rückläufer offen</span>
        <span className={`wert dpl tnum${r > 0 ? " rot" : ""}`}>{gruppenRes.error ? "–" : r}</span>
        <span className="info">{r === 0 ? "nichts zu klären" : formatCents(summe(zurueck))}</span>
      </Link>
    </div>
  );
}
