import Link from "next/link";
import { einzugGruppeSchluessel, isoPlusTage, type ChargeKind } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { EinzugVorbereiten, type GruppeZeile } from "@/components/EinzugVorbereiten";
import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";

export const dynamic = "force-dynamic";

function heuteInBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}

/**
 * Einen Einzug vorbereiten: Forderungen wählen, Abbuchungstag festlegen,
 * ankündigen - der Lauf entsteht dabei mit genau diesen Forderungen.
 *
 * Früher waren Ankündigung und Lastschriftlauf zwei Vorgänge mit je einem
 * eigenen Datum; passten die nicht zusammen, blieb der Lauf leer.
 *
 * `?gruppe=fee|2027|` wählt eine Gruppe vor (aus "Zu tun", den Jahresbeiträgen
 * und den Getränkemonaten).
 */
export default async function EinzugSeite({
  searchParams,
}: {
  searchParams: Promise<{ gruppe?: string | string[] }>;
}) {
  const { gruppe } = await searchParams;
  const supabase = await createServerSupabase();

  const [gruppenRes, einstellungRes] = await Promise.all([
    supabase.rpc("einzug_gruppen"),
    supabase
      .from("settings")
      .select("key, value")
      .in("key", ["sepa.prenotification_days", "sepa.creditor_id", "sepa.creditor_iban"]),
  ]);

  const wert = (k: string) =>
    String(einstellungRes.data?.find((s) => s.key === k)?.value ?? "").replace(/"/g, "");
  const frist = Number(wert("sepa.prenotification_days") || 14);
  const frueheste = isoPlusTage(heuteInBerlin(), frist);
  const fehlend = [
    { key: "sepa.creditor_id", text: "die Gläubiger-Identifikationsnummer", anker: "glaeubiger-id" },
    { key: "sepa.creditor_iban", text: "die IBAN des Vereinskontos", anker: "iban" },
  ].filter((f) => wert(f.key) === "");

  const gruppen: GruppeZeile[] = (gruppenRes.data ?? []).map((g) => ({
    kind: g.kind as ChargeKind,
    period_label: g.period_label,
    ruecklaeufer: g.ruecklaeufer,
    anzahl: g.anzahl,
    mitglieder: g.mitglieder,
    summe_cents: g.summe_cents,
    event_id: g.event_id,
    titel: g.titel,
  }));
  const vorgewaehlt = (Array.isArray(gruppe) ? gruppe : gruppe ? [gruppe] : [])
    .filter((k) => gruppen.some((g) => einzugGruppeSchluessel(g) === k));

  return (
    <div className="verwaltung einzug-vorbereiten">
      <VerwaltungsKopf
        kicker="Verwaltung · Kasse"
        titel="Einzug vorbereiten"
        zurueck={{ href: "/admin/kasse", text: "Kasse" }}
        unterzeile="Wähle aus, was eingezogen wird, und lege den Abbuchungstag fest. Mit einem Klick bekommen alle Mitglieder ihre Ankündigung, und der Einzug ist angelegt."
      />

      {/* Ein Hinweis, kein Fehler: ankündigen geht auch so (U50) */}
      {fehlend.length > 0 && (
        <div className="hinweis gold">
          Es fehlt noch {fehlend.map((f) => f.text).join(" und ")}. Ankündigen geht trotzdem, aber
          ohne diese Angabe lässt sich danach keine Bankdatei erzeugen.{" "}
          <Link href={`/admin/kasse?abschnitt=regeln#${fehlend[0]!.anker}`}>Jetzt eintragen</Link>
        </div>
      )}
      {gruppenRes.error && <div className="hinweis fehler">Die Forderungen ließen sich nicht laden.</div>}

      <EinzugVorbereiten
        gruppen={gruppen}
        vorgewaehlt={vorgewaehlt}
        frueheste={frueheste}
        fristTage={frist}
      />
    </div>
  );
}
