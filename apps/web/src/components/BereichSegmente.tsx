import Link from "next/link";

export interface Segment {
  href: string;
  label: string;
  /** Zahl im gelben Kreis, etwa offene Anträge */
  zahl?: number;
}

/**
 * Der eine Segment-Schalter eines Verwaltungsbereichs
 * (docs/design/clubhaus/verwaltung, Regel 1) - derselbe wie
 * "Belegung | Meine & offene Spiele". Zwei oder drei Teile, echte Adressen.
 */
export function BereichSegmente({
  label,
  eintraege,
  aktiv,
}: {
  label: string;
  eintraege: Segment[];
  aktiv: string;
}) {
  return (
    <nav className="segtoggle bereich-segmente" aria-label={label}>
      {eintraege.map((e) => (
        <Link key={e.href} href={e.href} aria-current={e.href === aktiv ? "page" : undefined}>
          {e.label}
          {e.zahl ? (
            <span className="segment-zahl" aria-label={`${e.zahl} offen`}>{e.zahl}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
