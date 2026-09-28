import Link from "next/link";
import type { ReactNode } from "react";

export type HinweisTon = "gold" | "rot" | "gruen" | "leise";

/** Eine von vier Blautoenen fuer den Avatar, fest je Kennung. */
export function avatarTon(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 4;
}

/**
 * Die Listenzeile der Verwaltung (docs/design/clubhaus/verwaltung, Regel 3)
 *
 * Avatar oder Symbolkachel · Name (16/700) · eine Kontextzeile · rechts genau
 * ein Hinweis · Pfeil. Die ganze Zeile ist das Ziel, mindestens 64 hoch.
 * Mit `href` ein Link, mit `onClick` ein Knopf (dann aus einer
 * Client-Komponente), ohne beides nur Anzeige.
 *
 * Steht in einer `.liste-gruppe` (gruppierte Karte, Radius 22).
 */
export function Listenzeile({
  href,
  onClick,
  avatar,
  symbol,
  titel,
  kontext,
  hinweis,
  hinweisTon = "leise",
  neben,
  pfeil,
  aktuell,
  gefahr,
  label,
}: {
  href?: string;
  onClick?: () => void;
  /** Initialen und Kennung fuer den Farbton */
  avatar?: { kurz: string; id: string };
  /** Inhalt der Symbolkachel, etwa ein SVG oder ein Kuerzel */
  symbol?: ReactNode;
  titel: ReactNode;
  kontext?: ReactNode;
  hinweis?: ReactNode;
  hinweisTon?: HinweisTon;
  /** Rechte Spalte statt eines einfachen Hinweises, etwa Betrag + Marke */
  neben?: ReactNode;
  /** Standard: bei Link oder Knopf ja */
  pfeil?: boolean;
  aktuell?: boolean;
  /** Zerstoerende Aktion: rote Textzeile am Ende eines Details */
  gefahr?: boolean;
  /** Vorlesetext, wenn der sichtbare Text nicht genuegt */
  label?: string;
}) {
  const inhalt = (
    <>
      {avatar && (
        <span className={`avatar ton-${avatarTon(avatar.id)}`} aria-hidden="true">{avatar.kurz}</span>
      )}
      {symbol && <span className="symbolkachel" aria-hidden="true">{symbol}</span>}
      <span className="text">
        <b className="titel">{titel}</b>
        {kontext && <small className="kontext">{kontext}</small>}
      </span>
      {neben ?? (hinweis ? <span className={`hinweis-rechts ${hinweisTon}`}>{hinweis}</span> : null)}
      {(pfeil ?? Boolean(href || onClick)) && (
        <svg className="pfeil" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </>
  );

  const klasse = `listenzeile${gefahr ? " gefahr" : ""}`;

  if (href) {
    return (
      <Link href={href} className={klasse} aria-current={aktuell ? "true" : undefined} aria-label={label}>
        {inhalt}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={klasse} onClick={onClick} aria-label={label}>
        {inhalt}
      </button>
    );
  }
  return <div className={klasse}>{inhalt}</div>;
}

/**
 * Ueberschrift einer gruppierten Karte: Titel links (22/700), rechts eine
 * kurze Angabe oder ein Link. Darunter steht die `.liste-gruppe`.
 */
export function Gruppenkopf({ titel, id, neben }: { titel: string; id?: string; neben?: ReactNode }) {
  return (
    <div className="gruppenkopf">
      <h2 id={id}>{titel}</h2>
      {neben && <span className="neben">{neben}</span>}
    </div>
  );
}
