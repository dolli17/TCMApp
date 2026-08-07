import Link from "next/link";

/**
 * Die drei Sichten auf denselben Bereich: der Plan aller Plaetze, die eigenen
 * Termine und die Buchungen, die noch Mitspieler suchen.
 *
 * Bewusst nicht die Komponente Reiter aus der Mitgliederverwaltung: die
 * schaltet Abschnitte derselben Seite ueber einen Suchparameter um. Hier sind
 * es echte Seiten mit eigener Adresse, die getrennt geladen werden sollen -
 * dafuer genuegen Links, und die Auswahl steht schon im Pfad.
 */
export function PlanReiter({ aktiv }: { aktiv: "plan" | "meine" | "offen" }) {
  return (
    <nav className="reiter" aria-label="Ansicht">
      <Link href="/plan" aria-current={aktiv === "plan" ? "page" : undefined}>
        Belegungsplan
      </Link>
      <Link href="/plan/meine" aria-current={aktiv === "meine" ? "page" : undefined}>
        Meine Buchungen
      </Link>
      <Link href="/plan/offen" aria-current={aktiv === "offen" ? "page" : undefined}>
        Offene Spiele
      </Link>
    </nav>
  );
}
