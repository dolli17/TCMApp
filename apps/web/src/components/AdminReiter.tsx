"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Die Bereiche der Vorstandsverwaltung.
 *
 * Bewusst nicht die Komponente Reiter aus der Mitgliederverwaltung: die
 * schaltet Abschnitte derselben Seite über einen Suchparameter um. Hier sind es
 * echte Seiten mit eigener Adresse — dasselbe Muster wie PlanReiter, nur mit
 * usePathname statt einem Prop, weil ein Layout keinen Aufrufer hat, der wüsste,
 * wo man gerade ist.
 *
 * Die Reihenfolge folgt dem Vereinsjahr, nicht der Technik: erst wer dabei ist,
 * dann wo gespielt wird, dann was es kostet. „System" steht hinten, weil man es
 * einmal einrichtet und danach nie wieder anfasst.
 */
const BEREICHE = [
  { href: "/admin", label: "Übersicht" },
  { href: "/admin/mitglieder", label: "Mitglieder" },
  { href: "/admin/plaetze", label: "Plätze" },
  { href: "/admin/getraenke", label: "Getränke" },
  // „Kasse" statt „Beiträge": dort steht jetzt alles, was Geld betrifft — der
  // Beitragslauf, der Getränkemonat und die Forderungen. Wer einzieht, will
  // nicht zwischen zwei Reitern springen.
  { href: "/admin/kasse", label: "Kasse" },
  { href: "/admin/system", label: "System" },
] as const;

/**
 * Welcher Bereich ist gemeint?
 *
 * Präfixvergleich, damit auch Unterseiten den richtigen Reiter hervorheben —
 * /admin/mitglieder/antraege gehört zu „Mitglieder". Die Übersicht ist der
 * Sonderfall: sie ist Präfix von allem und darf deshalb nur bei genauer
 * Übereinstimmung gewinnen.
 */
function istAktiv(pfad: string, href: string): boolean {
  if (href === "/admin") return pfad === "/admin";
  return pfad === href || pfad.startsWith(href + "/");
}

export function AdminReiter() {
  const pfad = usePathname();

  return (
    <nav className="reiter" aria-label="Verwaltung">
      {BEREICHE.map((b) => (
        <Link key={b.href} href={b.href} aria-current={istAktiv(pfad, b.href) ? "page" : undefined}>
          {b.label}
        </Link>
      ))}
    </nav>
  );
}
