import { createServerSupabase, getCurrentMember, isAdmin } from "@/lib/supabase/server";
import { EinstellungsGruppe } from "@/components/EinstellungsGruppe";

export const dynamic = "force-dynamic";

/**
 * Reihenfolge und Überschriften der Gruppen. Der Präfix des Schlüssels
 * entscheidet, wohin ein Wert gehört - so taucht eine neue Einstellung
 * automatisch an der richtigen Stelle auf, ohne dass diese Seite es erfährt.
 */
const GRUPPEN = [
  { praefix: "booking", titel: "Platzbuchung", text: "Zeiten, Raster und Kontingent." },
  { praefix: "drinks", titel: "Getränke", text: "Storno-Fenster und Mindestbetrag." },
  { praefix: "fees", titel: "Beiträge", text: "Wann der Jahresbeitrag fällig wird." },
  { praefix: "sepa", titel: "Lastschrift", text: "Gläubiger-ID, Format und Vorabankündigung." },
  { praefix: "work_duty", titel: "Arbeitsdienst", text: "Stundensatz für die Abrechnung." },
] as const;

export default async function EinstellungenSeite() {
  const angemeldet = await getCurrentMember();

  if (!angemeldet || !isAdmin(angemeldet.roles)) {
    return <div className="hinweis fehler">Diese Seite ist Administratoren vorbehalten.</div>;
  }

  const supabase = await createServerSupabase();
  const { data: werte, error } = await supabase
    .from("settings")
    .select("key, value, value_type, label, description, updated_at")
    .order("key");

  if (error) {
    return <div className="hinweis fehler">{error.message}</div>;
  }

  const alle = werte ?? [];
  const bekannt = new Set<string>(GRUPPEN.map((g) => g.praefix));
  const sonstige = alle.filter((e) => !bekannt.has(e.key.split(".")[0] ?? ""));

  return (
    <>
      <h1 className="pagetitle">Einstellungen</h1>
      <p className="unterzeile">
        Alle Werte, die das Verhalten der App steuern. Änderungen wirken sofort –
        auch für alle anderen.
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
          text="Werte ohne feste Gruppe."
          eintraege={sonstige}
        />
      )}
    </>
  );
}
