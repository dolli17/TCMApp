import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { EinstellungsFormular } from "@/components/EinstellungsGruppe";
import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";
import { translateDbError } from "@tcm/core";
import { Fehlerzustand } from "@/components/Fehlerzustand";

export const dynamic = "force-dynamic";

/**
 * Was einmal eingerichtet und danach selten angefasst wird.
 *
 * Alles, was einen fachlichen Ort hat, steht dort: Buchungsregeln bei den
 * Plätzen, Lastschrift bei den Beiträgen. Hier bleibt der Rest — und der
 * Auffangbehälter für alles, was künftig ohne bekannten Präfix dazukommt. So
 * verschwindet eine neue Einstellung nicht ungesehen, sondern taucht wenigstens
 * hier auf.
 */
const GRUPPEN = [
  {
    praefix: "work_duty",
    titel: "Arbeitsdienst",
    text: "Stundensatz für die Abrechnung.",
  },
  {
    praefix: "privacy",
    titel: "Datenschutz",
    text: "Wie lange Protokolle aufbewahrt werden.",
  },
  {
    praefix: "notifications",
    titel: "Benachrichtigungen",
    text: "In der App erscheint jede Benachrichtigung. Hier steht, welche zusätzlich per E-Mail oder als Push gehen.",
  },
] as const;

/** Präfixe, die anderswo einen eigenen Platz haben. */
const ANDERSWO = ["booking", "drinks", "fees", "sepa"];

export default async function SystemSeite() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("settings")
    .select("key, value, value_type, label, description, updated_at")
    .order("key");

  if (error) {
    return <Fehlerzustand text={translateDbError(error)} />;
  }

  const alle = data ?? [];
  const bekannt = new Set<string>([...GRUPPEN.map((g) => g.praefix), ...ANDERSWO]);
  const sonstige = alle.filter((e) => !bekannt.has(e.key.split(".")[0] ?? ""));

  return (
    <div className="verwaltung">
      <VerwaltungsKopf
        titel="System"
        unterzeile="Werte, die man einmal einrichtet. Änderungen wirken sofort – auch für alle anderen."
      />

      {/* Merkmale gehoeren seit der Verwaltung v2 hierher (Regel 1) */}
      <nav className="gruppe" aria-label="Einrichtung">
        <Link href="/admin/system/merkmale" className="gruppen-zeile">
          <span className="titel">Merkmale</span>
          <span className="pfeil" aria-hidden="true">›</span>
        </Link>
        <Link href="/admin/system/protokoll" className="gruppen-zeile">
          <span className="titel">Protokoll</span>
          <span className="pfeil" aria-hidden="true">›</span>
        </Link>
      </nav>

      {/* Ein Formular, ein Knopf (U12): gespeichert wird nur, was sich geändert hat. */}
      <EinstellungsFormular
        gruppen={[
          ...GRUPPEN.map((g) => ({
            titel: g.titel,
            text: g.text,
            eintraege: alle.filter((e) => e.key.startsWith(g.praefix + ".")),
          })),
          {
            titel: "Weitere",
            text: "Werte ohne festen Ort. Kommt hier etwas an, gehört es vermutlich in einen der Bereiche oben.",
            eintraege: sonstige,
          },
        ].filter((g) => g.eintraege.length > 0)}
      />
    </div>
  );
}
