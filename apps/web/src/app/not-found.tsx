import Link from "next/link";

export default function NichtGefunden() {
  return (
    <div className="fehlerzustand" role="alert">
      <p className="titel">Diese Seite gibt es nicht.</p>
      <p>Vielleicht wurde der Eintrag gelöscht oder die Adresse ist veraltet.</p>
      <Link href="/" className="knopf leise klein">
        Zur Startseite
      </Link>
    </div>
  );
}
