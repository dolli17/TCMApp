import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { KassenKennzahlen } from "@/components/KassenKennzahlen";
import { LaufAnlegen } from "@/components/LaufAnlegen";
import { LaufListe } from "@/components/LaufListe";
import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";

export const dynamic = "force-dynamic";

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
    <div className="verwaltung">
      <VerwaltungsKopf
        kicker="Verwaltung · Kasse"
        titel="Lastschriftläufe"
        unterzeile="Aus angekündigten Forderungen wird eine Datei für das Onlinebanking."
        zurueck={{ href: "/admin/kasse", text: "Kasse" }}
      />

      <KassenKennzahlen />

      {fehlend.length > 0 && (
        <div className="hinweis fehler">
          Es fehlt noch {fehlend.join(" und ")}. Ohne diese Angaben lässt sich keine
          Lastschriftdatei erzeugen – sie stehen unter{" "}
          <Link href="/admin/kasse?abschnitt=regeln">Kasse → Regeln</Link>.
        </div>
      )}

      <section className="karte tabellenkarte" aria-labelledby="h-laeufe">
        <div className="kartenkopf">
          <h2 id="h-laeufe">Bisherige Läufe</h2>
        </div>
        <LaufListe laeufe={laeufe} />
      </section>

      <LaufAnlegen fristTage={frist} />
    </div>
  );
}
