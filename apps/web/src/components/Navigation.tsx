"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Dieselben Einträge in Seitenleiste und schwebender Leiste. Welche davon
 * sichtbar ist, entscheidet allein die CSS - so kann es keine zwei
 * Menüzustände geben, die auseinanderlaufen.
 *
 * Die Seitenleiste (ab 768 px) zeigt die Bereiche der Verwaltung einzeln in
 * einem eigenen Abschnitt; die schwebende Leiste hat für Admins einen fünften
 * Tab „Admin“, der auf die Übersicht führt (docs/design/clubhaus/verwaltung).
 */

export interface NavEintrag {
  href: string;
  label: string;
  kurz: string;
  symbol: keyof typeof SYMBOLE;
  /** Kleine Zahl daneben, etwa offene Anträge */
  zahl?: number;
  /** Aktiv für alles unter href, auch für href selbst (der Admin-Tab) */
  bereich?: boolean;
}

const SYMBOLE = {
  home: (
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  platz: (
    <path d="M4 4h16v16H4zM4 12h16M8 8h8v8H8zM12 8v8" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  getraenk: (
    <path d="M6 3h12l-1.5 5.5a5 5 0 0 1-9 0zM12 14v7M8 21h8" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  konto: (
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" strokeWidth="1.8" fill="none" strokeLinecap="round" />
  ),
  admin: (
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" strokeWidth="1.8" fill="none" strokeLinejoin="round" />
  ),
  dienst: (
    <path d="M9 4h6v3H9zM7 5H5v16h14V5h-2M9 14l2 2 4-4" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  uebersicht: (
    <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" strokeWidth="1.8" fill="none" strokeLinejoin="round" />
  ),
  serie: (
    <path d="M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" strokeWidth="1.8" fill="none" strokeLinecap="round" />
  ),
  mitglieder: (
    <path d="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-1a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeWidth="1.8" fill="none" strokeLinecap="round" />
  ),
  kasse: (
    <path d="M2 7h20v12H2zM2 11h20M6 15h4" strokeWidth="1.8" fill="none" strokeLinecap="round" />
  ),
  system: (
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" strokeWidth="1.8" fill="none" strokeLinecap="round" />
  ),
  einstellung: (
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.1a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-3-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.1-3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 3 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  plus: <path d="M12 5v14M5 12h14" strokeWidth="2.4" fill="none" strokeLinecap="round" />,
} as const;

export function Symbol({ name }: { name: keyof typeof SYMBOLE }) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true" focusable="false">
      {SYMBOLE[name]}
    </svg>
  );
}

/**
 * Aktiv ist auch, wer auf einer Unterseite steht. Die Übersicht der
 * Verwaltung ist der Sonderfall: sie ist Präfix aller Bereiche und darf nur
 * bei genauer Übereinstimmung gewinnen - sonst leuchteten zwei Einträge.
 */
function istAktiv(pfad: string, e: NavEintrag): boolean {
  if (e.href === "/admin" && !e.bereich) return pfad === "/admin";
  return pfad === e.href || pfad.startsWith(e.href + "/");
}

function Eintraege({ eintraege, kurz }: { eintraege: NavEintrag[]; kurz?: boolean }) {
  const pfad = usePathname();
  return eintraege.map((e) => (
    <Link key={e.href} href={e.href} aria-current={istAktiv(pfad, e) ? "page" : undefined}>
      <Symbol name={e.symbol} />
      {kurz ? e.kurz : e.label}
      {!kurz && e.zahl ? (
        <span className="menue-zahl" aria-label={`${e.zahl} offen`}>{e.zahl}</span>
      ) : null}
    </Link>
  ));
}

export function Seitenmenue({
  eintraege, verwaltung,
}: { eintraege: NavEintrag[]; verwaltung: NavEintrag[] }) {
  return (
    <>
      <nav className="menue" aria-label="Hauptmenü">
        <Eintraege eintraege={eintraege} />
      </nav>
      {verwaltung.length > 0 && (
        <>
          <p className="kicker menue-abschnitt" aria-hidden="true">Verwaltung</p>
          <nav className="menue klein" aria-label="Verwaltungsmenü">
            <Eintraege eintraege={verwaltung} />
          </nav>
        </>
      )}
    </>
  );
}

/**
 * Schwebende Leiste unter 768 px, rechts daneben der runde Buchen-Knopf.
 * Die Haupteintraege wie in der App, fuer Admins dazu der Tab "Admin".
 */
export function Fussmenue({ eintraege }: { eintraege: NavEintrag[] }) {
  return (
    <>
      <nav className="schwebeleiste" aria-label="Hauptmenü">
        <Eintraege eintraege={eintraege} kurz />
      </nav>
      <Link href="/plan" className="buchknopf" aria-label="Platz buchen">
        <Symbol name="plus" />
      </Link>
    </>
  );
}
