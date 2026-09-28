import Link from "next/link";
import { formatCents } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Die drei Kennzahlen der Kasse (Baustein aus AdminUebersicht): offene
 * Forderungen, laufende Lastschriftlaeufe, offene Ruecklaeufer. Nur Lesen.
 */
export async function KassenKennzahlen() {
  const supabase = await createServerSupabase();
  const [forderungenRes, laeufeRes] = await Promise.all([
    supabase.from("charges").select("amount_cents, status").in("status", ["open", "notified", "returned"]),
    supabase.from("debit_batches").select("id", { count: "exact", head: true }).neq("status", "completed"),
  ]);

  const forderungen = forderungenRes.data ?? [];
  const offen = forderungen.reduce((s, f) => s + f.amount_cents, 0);
  const zurueck = forderungen.filter((f) => f.status === "returned").length;
  const laufend = laeufeRes.count ?? 0;

  return (
    <div className="kennzahlen drei">
      <Link href="/admin/kasse?abschnitt=forderungen" className="kennzahl">
        <span className="label">Offene Forderungen</span>
        <span className="wert dpl tnum">{forderungenRes.error ? "–" : formatCents(offen)}</span>
        <span className="info">{forderungen.length} Posten, alle Arten</span>
      </Link>
      <Link href="/admin/kasse/lastschriften" className="kennzahl">
        <span className="label">Laufende Läufe</span>
        <span className="wert dpl tnum">{laeufeRes.error ? "–" : laufend}</span>
        <span className="info">noch nicht abgeschlossen</span>
      </Link>
      <Link href="/admin/kasse?abschnitt=forderungen&stand=returned" className="kennzahl">
        <span className="label">Rückläufer offen</span>
        <span className="wert dpl tnum">{forderungenRes.error ? "–" : zurueck}</span>
        <span className="info">{zurueck === 0 ? "nichts zu klären" : "zurückgebucht, noch offen"}</span>
      </Link>
    </div>
  );
}
