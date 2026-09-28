"use client";

import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Ab dieser Breite stehen Liste und Mitglied nebeneinander. */
const NEBENEINANDER = "(min-width: 1100px)";

/**
 * Liste + Detail am Desktop (docs/design/clubhaus/verwaltung, Regel 6).
 *
 * Die Zeilen verweisen auf /admin/mitglieder/[id] - das bleibt die direkte
 * Adresse und der Weg am Telefon. Ab 1100 px faengt diese Huelle den Klick ab
 * und waehlt das Mitglied per ?id= aus, ohne die Seite zu wechseln. Filter und
 * Suche bleiben dabei in der Adresse stehen.
 */
export function MitgliederWahl({ children }: { children: ReactNode }) {
  const router = useRouter();
  const suche = useSearchParams();

  return (
    <div
      onClickCapture={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (!window.matchMedia(NEBENEINANDER).matches) return;
        const link = (e.target as HTMLElement).closest("a[href^='/admin/mitglieder/']");
        const id = link?.getAttribute("href")?.split("/").pop()?.split("?")[0];
        if (!id) return;
        e.preventDefault();
        const p = new URLSearchParams(suche.toString());
        p.set("id", id);
        router.push(`/admin/mitglieder?${p.toString()}`, { scroll: false });
      }}
    >
      {children}
    </div>
  );
}
