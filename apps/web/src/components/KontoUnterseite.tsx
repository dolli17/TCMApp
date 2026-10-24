import Link from "next/link";

/**
 * Kopf einer Unterseite des Kontos: zurück zum Konto, darunter der Titel und
 * gegebenenfalls ein Satz dazu. Die Karte darunter wiederholt den Titel nicht
 * (U56) - sie bekommt `ohneTitel`.
 */
export function KontoUnterseite({
  titel,
  text,
  children,
}: {
  titel: string;
  text?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="konto-unterseite">
      <header className="unterseite-kopf">
        <Link href="/konto" className="zurueck">‹ Konto</Link>
        <h1 className="pagetitle">{titel}</h1>
        {text && <p className="unterzeile">{text}</p>}
      </header>
      {children}
    </div>
  );
}
