import { createServerSupabase, getCurrentMember } from "@/lib/supabase/server";
import { KontoUnterseite } from "@/components/KontoUnterseite";
import { Stammdatenkarte, type Feld } from "@/components/Stammdatenkarte";
import { eigeneDatenSpeichern } from "../aktionen";

export const dynamic = "force-dynamic";

/** Meine Daten - dasselbe Formular wie vorher auf der Konto-Seite. */
export default async function MeineDatenSeite() {
  const supabase = await createServerSupabase();
  const angemeldet = await getCurrentMember();
  const meineId = angemeldet?.member?.id;

  // Die Spalten sind genau die, die der Spalten-Grant änderbar macht.
  const { data: ich } = meineId
    ? await supabase
        .from("members")
        .select("first_name, last_name, title, phone, mobile, street, postcode, city")
        .eq("id", meineId)
        .maybeSingle()
    : { data: null };

  const felder: Feld[] = ich
    ? [
        { name: "first_name", label: "Vorname", art: "text", wert: ich.first_name },
        { name: "last_name", label: "Nachname", art: "text", wert: ich.last_name },
        { name: "title", label: "Titel", art: "text", wert: ich.title },
        { name: "phone", label: "Telefon", art: "tel", wert: ich.phone },
        { name: "mobile", label: "Mobil", art: "tel", wert: ich.mobile },
        { name: "street", label: "Straße und Hausnummer", art: "text", wert: ich.street, breit: true },
        { name: "postcode", label: "PLZ", art: "text", wert: ich.postcode },
        { name: "city", label: "Ort", art: "text", wert: ich.city },
      ]
    : [];

  return (
    <KontoUnterseite titel="Meine Daten">
      {ich && (
        <Stammdatenkarte
          titel="Meine Daten"
          text="Adresse und Rufnummern pflegst du selbst. E-Mail und Geburtsdatum ändert der Vorstand – sie hängen am Zugang und an den Beiträgen."
          felder={felder}
          aktion={eigeneDatenSpeichern}
        />
      )}
      <p className="beschreibung">Jede Änderung wird protokolliert und ist für den Vorstand einsehbar.</p>
    </KontoUnterseite>
  );
}
