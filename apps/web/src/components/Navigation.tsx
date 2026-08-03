"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Dieselben Einträge in Seitenleiste und Bottom-Navigation. Welche davon
 * sichtbar ist, entscheidet allein die CSS - so kann es keine zwei
 * Menüzustände geben, die auseinanderlaufen.
 */

export interface NavEintrag {
  href: string;
  label: string;
  kurz: string;
  symbol: keyof typeof SYMBOLE;
}

const SYMBOLE = {
  platz: (
    <path d="M3 5h18v14H3zM12 5v14M3 12h18" strokeWidth="1.7" fill="none" strokeLinecap="round" />
  ),
  getraenk: (
    <path d="M6 3h12l-1.5 5.5a5 5 0 0 1-9 0zM12 14v7M8 21h8" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  konto: (
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" strokeWidth="1.7" fill="none" strokeLinecap="round" />
  ),
  serie: (
    <path d="M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" strokeWidth="1.7" fill="none" strokeLinecap="round" />
  ),
  mitglieder: (
    <path d="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-1a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeWidth="1.7" fill="none" strokeLinecap="round" />
  ),
  beitrag: (
    <path d="M2 7h20v12H2zM2 11h20M6 15h4" strokeWidth="1.7" fill="none" strokeLinecap="round" />
  ),
} as const;

function Symbol({ name }: { name: keyof typeof SYMBOLE }) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true" focusable="false">
      {SYMBOLE[name]}
    </svg>
  );
}

/** Aktiv ist auch, wer auf einer Unterseite steht. */
function istAktiv(pfad: string, href: string): boolean {
  return pfad === href || pfad.startsWith(href + "/");
}

export function Seitenmenue({ eintraege }: { eintraege: NavEintrag[] }) {
  const pfad = usePathname();
  return (
    <nav aria-label="Hauptmenü">
      {eintraege.map((e) => (
        <Link key={e.href} href={e.href} aria-current={istAktiv(pfad, e.href) ? "page" : undefined}>
          <Symbol name={e.symbol} />
          {e.label}
        </Link>
      ))}
    </nav>
  );
}

export function Fussmenue({ eintraege }: { eintraege: NavEintrag[] }) {
  const pfad = usePathname();
  return (
    <nav className="bottomnav" aria-label="Hauptmenü">
      {eintraege.map((e) => (
        <Link key={e.href} href={e.href} aria-current={istAktiv(pfad, e.href) ? "page" : undefined}>
          <Symbol name={e.symbol} />
          {e.kurz}
        </Link>
      ))}
    </nav>
  );
}
