import Link from "next/link";
import { AnmeldeBuehne } from "@/components/AnmeldeBuehne";

export const metadata = {
  title: "E-Mail bestätigen – TC Muckensturm",
};

/**
 * Nach dem Absenden. Der Antrag ist noch unbestätigt (S22): erst der Link aus
 * der Mail schickt ihn an den Vorstand. Die Seite sagt das für jeden gleich,
 * auch wenn gar keine Mail rausging (Adresse schon bestätigt, Sperrfrist).
 */
export default function DankeSeite() {
  return (
    <AnmeldeBuehne titel="Fast geschafft." unterzeile="Bitte bestätige deine E-Mail-Adresse." breit>
        <div className="hinweis erfolg" role="status">
          Wir haben dir eine E-Mail mit einem Link geschickt. Erst wenn du ihn öffnest und
          bestätigst, geht dein Antrag an den Vorstand.
        </div>

        <p className="beschreibung">
          Keine Mail da? Schau auch im Spam-Ordner nach. Der Link gilt 24 Stunden – danach
          löschen wir deine Angaben, und du stellst den Antrag einfach neu.
        </p>

        <p className="beschreibung">
          Vertippt bei der Adresse? <Link href="/antrag">Antrag noch einmal stellen</Link>
        </p>
    </AnmeldeBuehne>
  );
}
