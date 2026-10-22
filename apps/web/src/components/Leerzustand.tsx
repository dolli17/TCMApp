import Link from "next/link";

/**
 * Hier ist nichts (U27).
 *
 * Ein Satz, was fehlt, und – wo es eine gibt – die eine Handlung, die weiter
 * führt: zur Belegung, zum Anlegen, Filter zurück. Ohne `aktion` bleibt es beim
 * Satz; dann gibt es nichts zu tun, etwa „Keine Neuigkeiten“. Ein Ladefehler
 * ist kein Leerzustand, dafür gibt es den Fehlerzustand.
 */
export function Leerzustand({
  text,
  aktion,
}: {
  text: string;
  aktion?: { href: string; label: string };
}) {
  return (
    <div className="leerzustand">
      <p>{text}</p>
      {aktion && (
        <Link href={aktion.href} className="knopf leise klein">
          {aktion.label}
        </Link>
      )}
    </div>
  );
}
