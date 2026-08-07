import { createServerSupabase } from "@/lib/supabase/server";
import { EinstellungsGruppe } from "@/components/EinstellungsGruppe";

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
    praefix: "notifications",
    titel: "Benachrichtigungen",
    text: "Welche Hinweise zusätzlich per E-Mail gehen.",
  },
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
    return <div className="hinweis fehler">{error.message}</div>;
  }

  const alle = data ?? [];
  const bekannt = new Set<string>([...GRUPPEN.map((g) => g.praefix), ...ANDERSWO]);
  const sonstige = alle.filter((e) => !bekannt.has(e.key.split(".")[0] ?? ""));

  return (
    <>
      <h1 className="pagetitle">System</h1>
      <p className="unterzeile">
        Werte, die man einmal einrichtet. Änderungen wirken sofort – auch für alle anderen.
      </p>

      {GRUPPEN.map((g) => {
        const eintraege = alle.filter((e) => e.key.startsWith(g.praefix + "."));
        if (eintraege.length === 0) return null;
        return (
          <EinstellungsGruppe
            key={g.praefix}
            titel={g.titel}
            text={g.text}
            eintraege={eintraege}
          />
        );
      })}

      {sonstige.length > 0 && (
        <EinstellungsGruppe
          titel="Weitere"
          text="Werte ohne festen Ort. Kommt hier etwas an, gehört es vermutlich in einen der Bereiche oben."
          eintraege={sonstige}
        />
      )}
    </>
  );
}
