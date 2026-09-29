import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Der Kopf einer Verwaltungsseite (docs/design/clubhaus/verwaltung):
 * Rueckweg (am Telefon "‹ Verwaltung"), Titel, eine Unterzeile; rechts die
 * eine Hauptaktion in Gelb (Regel 4) - am Telefon kompakt in der Titelzeile.
 */
export function VerwaltungsKopf({
  kicker = "Verwaltung",
  titel,
  unterzeile,
  zurueck,
  marke,
  children,
}: {
  kicker?: string;
  titel: string;
  unterzeile?: ReactNode;
  zurueck?: { href: string; text: string };
  /** Statusmarke neben dem Titel */
  marke?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="verwaltung-kopf">
      <div>
        {zurueck ? (
          <Link href={zurueck.href} className="zurueck">
            ‹ {zurueck.text}
          </Link>
        ) : (
          // Am Telefon fehlt die Seitenleiste: der Weg zurück zur Übersicht
          <Link href="/admin" className="zurueck nur-telefon">
            ‹ Verwaltung
          </Link>
        )}
        <div className="kicker nur-ab-tablet">{kicker}</div>
        <div className="titelzeile">
          <h1 className="pagetitle">{titel}</h1>
          {marke}
        </div>
        {unterzeile && <p className="unterzeile">{unterzeile}</p>}
      </div>
      {children && <div className="aktionen">{children}</div>}
    </header>
  );
}
