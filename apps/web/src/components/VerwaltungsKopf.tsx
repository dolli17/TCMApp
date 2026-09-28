import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Der Kopf einer Verwaltungsseite (Entwuerfe AdminMitglieder, AdminKasse):
 * optional ein Rueckweg, Kicker, Titel, eine Unterzeile; rechts die Aktionen,
 * meist ein gelber Knopf.
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
        {zurueck && (
          <Link href={zurueck.href} className="zurueck">
            ‹ {zurueck.text}
          </Link>
        )}
        <div className="kicker">{kicker}</div>
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
