import Link from "next/link";

/**
 * Zwei Sichten auf die Plaetze: die Belegung und "Meine & offene Spiele" -
 * als Segment-Schalter wie in der App (docs/design/clubhaus, Abschnitt 4).
 *
 * Echte Seiten mit eigener Adresse, deshalb Links; die Auswahl steht im Pfad.
 */
export function PlanSegmente({ aktiv }: { aktiv: "plan" | "spiele" }) {
  return (
    <nav className="segtoggle plan-segmente" aria-label="Ansicht">
      <Link href="/plan" aria-current={aktiv === "plan" ? "page" : undefined}>
        Belegung
      </Link>
      <Link href="/plan/spiele" aria-current={aktiv === "spiele" ? "page" : undefined}>
        Meine &amp; offene Spiele
      </Link>
    </nav>
  );
}
