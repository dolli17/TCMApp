import Link from "next/link";
import { AnmeldeBuehne } from "@/components/AnmeldeBuehne";

export const metadata = {
  title: "Impressum – TC Muckensturm",
  description: "Anbieterkennzeichnung der Vereins-App des TC Muckensturm",
};

/**
 * Impressum nach § 5 DDG, ohne Anmeldung erreichbar. Die Stellen in
 * [[doppelten Klammern]] füllt der Vorstand aus.
 */
export default function ImpressumSeite() {
  return (
    <AnmeldeBuehne titel="Impressum." unterzeile="Wer hinter dieser App steht." breit klasse="rechtstext">
      <h2>Anbieter</h2>
      <p>
        Tennisclub Muckensturm e.&nbsp;V.
        <br />
        [[Straße Hausnummer]]
        <br />
        [[PLZ Ort]]
      </p>

      <h2>Vertreten durch</h2>
      <p>[[Vorsitzende/r, ggf. weitere Vorstandsmitglieder]]</p>

      <h2>Kontakt</h2>
      <p>
        E-Mail: [[info@…]]
        <br />
        Telefon: [[…]]
      </p>

      <h2>Registereintrag</h2>
      <p>
        Eingetragen im Vereinsregister des Amtsgerichts [[Ort]], Registernummer [[VR …]].
      </p>

      <h2>Verantwortlich für den Inhalt</h2>
      <p>[[Name, Anschrift wie oben]]</p>

      <p className="beschreibung" style={{ marginTop: 24 }}>
        <Link href="/datenschutz">Datenschutz</Link> · <Link href="/login">Zur Anmeldung</Link>
      </p>
    </AnmeldeBuehne>
  );
}
