"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export interface ReiterEintrag {
  wert: string;
  label: string;
}

/**
 * Abschnitte einer Detailseite.
 *
 * Die Wahl steht in der Adresse (`?abschnitt=…`) und nicht im Client-Zustand:
 * so lässt sich ein Abschnitt verlinken, das Zurück des Browsers tut das
 * Erwartete, und die Server-Komponente kann den Inhalt gleich passend laden,
 * statt alles zu holen und das meiste zu verstecken.
 */
export function Reiter({
  eintraege,
  aktiv,
  parameter = "abschnitt",
}: {
  eintraege: ReiterEintrag[];
  aktiv: string;
  parameter?: string;
}) {
  const pfad = usePathname();
  const suche = useSearchParams();

  function zielFuer(wert: string): string {
    const p = new URLSearchParams(suche.toString());
    p.set(parameter, wert);
    return `${pfad}?${p.toString()}`;
  }

  return (
    <nav className="reiter" aria-label="Abschnitte">
      {eintraege.map((e) => (
        <Link
          key={e.wert}
          href={zielFuer(e.wert)}
          aria-current={e.wert === aktiv ? "page" : undefined}
        >
          {e.label}
        </Link>
      ))}
    </nav>
  );
}
