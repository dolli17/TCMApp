import { redirect } from "next/navigation";
import { naechsterPflichtschritt, onboardingSchritte, translateDbError, type OnboardingSchrittKey, type OnboardingZustand } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { OnboardingAssistent } from "@/components/OnboardingAssistent";
import { Fehlerzustand } from "@/components/Fehlerzustand";

export const dynamic = "force-dynamic";

export const metadata = { title: "Konto einrichten – TC Muckensturm" };

/** Die Schritte nach dem Abschluss: freiwillig und überspringbar. */
const OPTIONAL: OnboardingSchrittKey[] = ["einwilligungen", "tennis", "einstellungen"];

/**
 * Das Pflicht-Onboarding nach dem ersten Login.
 *
 * Die Middleware leitet hierher, solange members.onboarding_completed_at
 * leer ist. Welcher Schritt erledigt ist, sagt my_onboarding(); die
 * Reihenfolge und was Pflicht ist, kommt aus @tcm/core, genau wie in der App.
 *
 * Der Schritt steht in der Adresse (?schritt=…), damit Zurück im Browser und
 * ein Neuladen dort weitermachen, wo man war. Springen lässt sich nur zu
 * Schritten, deren Pflicht-Vorgänger erledigt sind. Die optionalen Schritte
 * kommen erst nach dem Abschluss.
 */
export default async function OnboardingSeite({
  searchParams,
}: {
  searchParams: Promise<{ schritt?: string }>;
}) {
  const { schritt: gewuenscht } = await searchParams;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("my_onboarding");

  if (error) return <Fehlerzustand text={translateDbError(error)} />;
  // Kein Mitglied, etwa ein Kiosk-Gerät: hier gibt es nichts einzurichten.
  const zustand = data as unknown as OnboardingZustand | null;
  if (!zustand) redirect("/");

  const abgeschlossen = Boolean(zustand.abgeschlossen_am);
  // Das Passwort ist mit dem Einladungslink erledigt und kein eigener Schritt hier.
  const schritte = onboardingSchritte(zustand).filter((s) => s.key !== "passwort");

  const erreichbar = (key: OnboardingSchrittKey): boolean => {
    if (OPTIONAL.includes(key)) return abgeschlossen;
    if (abgeschlossen) return false;
    const i = schritte.findIndex((s) => s.key === key);
    return i >= 0 && schritte.slice(0, i).every((s) => !s.pflicht || s.erledigt);
  };

  let aktuell: OnboardingSchrittKey | null =
    gewuenscht && schritte.some((s) => s.key === gewuenscht) && erreichbar(gewuenscht as OnboardingSchrittKey)
      ? (gewuenscht as OnboardingSchrittKey)
      : null;

  if (!aktuell) {
    // Fertig und ohne ausdrücklichen Wunsch: zurück in die App.
    if (abgeschlossen) redirect("/");
    // Das Passwort fehlt nur, wenn jemand den Link geöffnet, aber nichts
    // gesetzt hat. Dann zuerst dorthin.
    if (!zustand.status.passwort) redirect("/passwort-setzen");
    aktuell = naechsterPflichtschritt(zustand) ?? "sepa";
    if (aktuell === "passwort") redirect("/passwort-setzen");
  }

  return (
    <OnboardingAssistent
      key={aktuell}
      zustand={zustand}
      schritte={schritte.map((s) => ({ ...s, erreichbar: erreichbar(s.key) }))}
      aktuell={aktuell}
    />
  );
}
