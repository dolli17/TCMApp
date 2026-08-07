import Link from "next/link";
import { formatCents } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { LaufAnlegen } from "@/components/LaufAnlegen";

export const dynamic = "force-dynamic";

const DATUM = new Intl.DateTimeFormat("de-DE");

const STAND: Record<string, string> = {
  draft: "Entwurf",
  generated: "Datei erzeugt",
  submitted: "eingereicht",
  completed: "abgeschlossen",
};

/**
 * Die Lastschriftläufe.
 *
 * Eigene Adressen statt Abschnitte auf der Kassenseite: ein Lauf ist ein
 * Vorgang, der über Tage läuft und den man verlinken können muss – erst
 * zusammenstellen, dann erzeugen, dann einreichen, dann Rückläufer.
 */
export default async function LastschriftenSeite() {
  const supabase = await createServerSupabase();

  const [laeufeRes, einstellungRes] = await Promise.all([
    supabase.rpc("debit_batch_overview", { p_limit: 24 }),
    supabase
      .from("settings")
      .select("key, value")
      .in("key", ["sepa.prenotification_days", "sepa.creditor_id", "sepa.creditor_iban"]),
  ]);

  const einstellungen = einstellungRes.data ?? [];
  const wert = (k: string) => String(einstellungen.find((e) => e.key === k)?.value ?? "").replace(/"/g, "");
  const frist = Number(einstellungen.find((e) => e.key === "sepa.prenotification_days")?.value ?? 14);

  const fehlend = [
    wert("sepa.creditor_id") === "" ? "die Gläubiger-Identifikationsnummer" : null,
    wert("sepa.creditor_iban") === "" ? "die IBAN des Vereinskontos" : null,
  ].filter(Boolean);

  const laeufe = laeufeRes.data ?? [];

  return (
    <>
      <p className="zurueck">
        <Link href="/admin/kasse">← Kasse</Link>
      </p>

      <h1 className="pagetitle">Lastschriftläufe</h1>
      <p className="unterzeile">
        Aus angekündigten Forderungen wird eine Datei für das Onlinebanking.
      </p>

      {fehlend.length > 0 && (
        <div className="hinweis fehler">
          Es fehlt noch {fehlend.join(" und ")}. Ohne diese Angaben lässt sich keine
          Lastschriftdatei erzeugen – sie stehen unter{" "}
          <Link href="/admin/kasse?abschnitt=regeln">Kasse → Regeln</Link>.
        </div>
      )}

      <LaufAnlegen fristTage={frist} />

      <section className="karte">
        <h2 className="dpl">Bisherige Läufe</h2>
        {laeufe.length === 0 ? (
          <p className="leer">Es gibt noch keinen Lastschriftlauf.</p>
        ) : (
          <div className="tabellenhuelle"><table className="liste">
            <thead>
              <tr>
                <th>Bezeichnung</th>
                <th>Fällig</th>
                <th className="zahl">Lastschriften</th>
                <th className="zahl">Summe</th>
                <th className="zahl">Zurück</th>
                <th>Stand</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {laeufe.map((l) => (
                <tr key={l.id}>
                  <td>{l.title}</td>
                  <td className="mit">{DATUM.format(new Date(l.collection_date))}</td>
                  <td className="zahl tnum">{l.item_count}</td>
                  <td className="zahl tnum">{formatCents(l.total_cents)}</td>
                  <td className="zahl tnum">{l.zurueck || "—"}</td>
                  <td><span className="marke-klein">{STAND[l.status] ?? l.status}</span></td>
                  <td>
                    <Link className="knopf leise klein" href={`/admin/kasse/lastschriften/${l.id}`}>
                      Öffnen
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
