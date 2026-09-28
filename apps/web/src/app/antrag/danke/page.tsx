import Link from "next/link";
import { AnmeldeBuehne } from "@/components/AnmeldeBuehne";

export const metadata = {
  title: "Antrag eingegangen – TC Muckensturm",
};

export default function DankeSeite() {
  return (
    <AnmeldeBuehne titel="Danke!" unterzeile="Dein Antrag ist beim Vorstand angekommen." breit>
        <div className="hinweis erfolg" role="status">
          Wir melden uns in den nächsten Tagen bei dir – meist per E-Mail.
        </div>

        <p className="beschreibung">
          Sobald der Vorstand deinen Antrag angenommen hat, bekommst du eine Einladung zur
          Vereins-App. Damit buchst du Plätze, siehst deine Getränke und pflegst deine Daten selbst.
        </p>

        <p className="beschreibung">
          Fragen bis dahin? Sprich uns einfach auf der Anlage an.
        </p>

        <Link className="knopf block leise" href="/login">
          Zur Anmeldung
        </Link>
    </AnmeldeBuehne>
  );
}
