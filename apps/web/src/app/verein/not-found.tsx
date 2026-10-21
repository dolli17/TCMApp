import Link from "next/link";

export default function NichtGefunden() {
  return (
    <div className="fehlerzustand" role="alert">
      <p className="titel">Diesen Eintrag gibt es nicht.</p>
      <p>Vielleicht wurde der Eintrag gelöscht oder die Adresse ist veraltet.</p>
      <Link href="/verein" className="knopf leise klein">
        Zum Verein
      </Link>
    </div>
  );
}
