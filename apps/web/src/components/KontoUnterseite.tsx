import Link from "next/link";

/** Kopf einer Unterseite des Kontos: zurück zum Konto, darunter der Titel. */
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
      <Link href="/konto" className="zurueck">‹ Konto</Link>
      <h1 className="pagetitle">{titel}</h1>
      {text && <p className="unterzeile">{text}</p>}
      {children}
    </div>
  );
}
