import { createServerSupabase, getCurrentMember } from "@/lib/supabase/server";
import { KontoUnterseite } from "@/components/KontoUnterseite";
import { Stammdatenkarte, type Feld } from "@/components/Stammdatenkarte";
import { notfallkontaktSpeichern } from "../aktionen";

export const dynamic = "force-dynamic";

/** Notfallkontakt - dasselbe Formular wie vorher auf der Konto-Seite. */
export default async function NotfallkontaktSeite() {
  const supabase = await createServerSupabase();
  const angemeldet = await getCurrentMember();
  const meineId = angemeldet?.member?.id;

  const { data: ich } = meineId
    ? await supabase
        .from("members")
        .select("emergency_contact_name, emergency_contact_phone, emergency_contact_relation")
        .eq("id", meineId)
        .maybeSingle()
    : { data: null };

  const felder: Feld[] = ich
    ? [
        { name: "emergency_contact_name", label: "Name", art: "text", wert: ich.emergency_contact_name },
        { name: "emergency_contact_phone", label: "Telefon", art: "tel", wert: ich.emergency_contact_phone },
        {
          name: "emergency_contact_relation",
          label: "Verhältnis",
          art: "text",
          wert: ich.emergency_contact_relation,
          hinweis: "z. B. Mutter, Ehepartner",
        },
      ]
    : [];

  return (
    <KontoUnterseite titel="Notfallkontakt">
      {ich && (
        <Stammdatenkarte
          titel="Notfallkontakt"
          text="Wen sollen wir anrufen, wenn auf der Anlage etwas passiert?"
          felder={felder}
          aktion={notfallkontaktSpeichern}
        />
      )}
    </KontoUnterseite>
  );
}
