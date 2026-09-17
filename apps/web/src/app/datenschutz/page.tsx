import Image from "next/image";
import Link from "next/link";
import logo from "@tcm/ui/logo.png";

export const metadata = {
  title: "Datenschutz – TC Muckensturm",
  description: "Datenschutzerklärung der Vereins-App des TC Muckensturm",
};

/**
 * Datenschutzerklärung, ohne Anmeldung erreichbar.
 *
 * Die Adresse dieser Seite steht in App Store Connect als Privacy-Policy-URL
 * und wird aus dem Konto-Tab der App verlinkt. Statisch, keine Datenbank.
 *
 * Die Stellen in [[doppelten Klammern]] muss der Vorstand ausfüllen; der Text
 * ist ein Entwurf des Entwicklers und keine Rechtsberatung. Was hier steht,
 * folgt dem, was die App tatsächlich tut – wer eine neue Verarbeitung
 * einbaut (weiterer Dienst, neue Datenart), trägt sie hier nach.
 */
export default function DatenschutzSeite() {
  return (
    <div className="auth antragsseite">
      <div className="crown">
        <Image src={logo} alt="TC Muckensturm" height={34} priority />
        <h1>Datenschutz.</h1>
        <p>Was die Vereins-App über dich speichert – und was nicht.</p>
      </div>

      <div className="sheet rechtstext">
        <p className="unterzeile">
          Stand: [[Datum]]. Diese Erklärung gilt für die Web-App und die iOS-/Android-App des
          TC Muckensturm.
        </p>

        <h2>1. Verantwortlicher</h2>
        <p>
          Tennisclub Muckensturm e.&nbsp;V.
          <br />
          [[Straße Hausnummer]]
          <br />
          [[PLZ Ort]]
          <br />
          vertreten durch den Vorstand: [[Name(n)]]
          <br />
          E-Mail: [[datenschutz@…]]
        </p>

        <h2>2. Wofür wir Daten verarbeiten</h2>
        <p>
          Die App ersetzt die bisherige Platzbuchungs- und Mitgliederverwaltung des Vereins.
          Verarbeitet werden ausschließlich Daten, die für die Mitgliedschaft und den
          Spielbetrieb nötig sind:
        </p>
        <ul>
          <li>
            <strong>Mitgliederverwaltung</strong> – Name, Anschrift, Geburtsdatum, E-Mail,
            Telefon, Mitgliedsart, Rollen, Notfallkontakt. Rechtsgrundlage: Vertrag
            (Mitgliedschaft, Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;b DSGVO) und Vereinssatzung.
          </li>
          <li>
            <strong>Platzbuchung</strong> – wer wann mit wem auf welchem Platz spielt.
            Mitspieler sehen gegenseitig ihre Namen; der Belegungsplan zeigt allen
            Mitgliedern die Namen der Buchenden. Rechtsgrundlage: Vertrag.
          </li>
          <li>
            <strong>Beiträge und Lastschrift</strong> – Beitragsart, offene Forderungen,
            Bankverbindung (IBAN, Kontoinhaber) und SEPA-Mandat. IBANs werden verschlüsselt
            gespeichert; die Lastschriftdatei wird vom Vorstand an die Bank übergeben.
            Rechtsgrundlage: Vertrag und gesetzliche Aufbewahrungspflichten (Art.&nbsp;6
            Abs.&nbsp;1 lit.&nbsp;c DSGVO).
          </li>
          <li>
            <strong>Getränkeabrechnung</strong> – welche Getränke du im Clubhaus erfasst hast,
            monatlich abgerechnet. Rechtsgrundlage: Vertrag.
          </li>
          <li>
            <strong>Arbeitsdienst</strong> – geleistete Stunden und der Ausgleich zum
            Jahresende. Rechtsgrundlage: Vertrag und Satzung.
          </li>
          <li>
            <strong>Mitgliedsantrag</strong> – die Angaben aus dem Antragsformular, dazu ein
            gekürzter, gesalzener Hash der IP-Adresse und der Browserkennung, um Missbrauch
            des offenen Formulars zu erkennen. Rechtsgrundlage: Vertragsanbahnung und
            berechtigtes Interesse (Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;f DSGVO).
          </li>
        </ul>

        <h2>3. Benachrichtigungen</h2>
        <p>
          Zu Buchungen, die dich betreffen (etwa wenn du aus einem Spiel ausgetragen oder ein
          Platz gesperrt wird), verschickt die App Hinweise in der App, per E-Mail und – nur
          wenn du es im Konto-Tab einschaltest – als Push-Nachricht auf dein Gerät. Push lässt
          sich dort jederzeit wieder abschalten; die Gerätekennung wird dann gelöscht.
        </p>

        <h2>4. Dienstleister (Auftragsverarbeiter)</h2>
        <p>Wir betreiben keine eigenen Server. Folgende Dienste verarbeiten Daten in unserem Auftrag:</p>
        <ul>
          <li>
            <strong>Supabase Inc.</strong> – Datenbank, Anmeldung und Dateiablage. Serverstandort
            Frankfurt am Main (EU). [[AV-Vertrag abgeschlossen am …]]
          </li>
          <li>
            <strong>Resend Inc.</strong> – Versand der E-Mail-Benachrichtigungen (Empfängeradresse,
            Betreff, Nachrichtentext). [[Standort/AV-Vertrag]]
          </li>
          <li>
            <strong>Expo (650 Industries Inc.)</strong> – Zustellung der Push-Nachrichten an
            Apple- und Google-Geräte. Übermittelt werden eine pseudonyme Gerätekennung und der
            Nachrichtentext, nicht dein Name. [[AV-Vertrag]]
          </li>
          <li>
            <strong>Apple Inc.</strong> – Verteilung der iOS-App über TestFlight bzw. den App
            Store und Zustellung der Push-Nachrichten auf Apple-Geräten.
          </li>
        </ul>
        <p>
          Die App enthält keine Werbung, keine Analyse- oder Tracking-Dienste und setzt keine
          Cookies außer dem Sitzungs-Cookie für die Anmeldung.
        </p>

        <h2>5. Wer deine Daten sieht</h2>
        <p>
          Mitglieder sehen ihre eigenen Daten sowie im Belegungsplan die Namen anderer
          Buchender. Der Vorstand (Rolle „Admin“) sieht alle Mitglieder- und Finanzdaten, weil
          er Beiträge, Anträge und den Spielbetrieb verwaltet. Jede Änderung an Stammdaten
          wird mit Zeitpunkt und Bearbeiter protokolliert.
        </p>

        <h2>6. Speicherdauer</h2>
        <p>
          Mitgliederdaten bleiben für die Dauer der Mitgliedschaft gespeichert. Nach dem
          Austritt werden sie anonymisiert, sobald keine offenen Forderungen mehr bestehen.
          Buchhaltungsrelevante Daten (Beiträge, Lastschriften) bewahren wir nach den
          gesetzlichen Fristen bis zu zehn Jahre auf. Abgelehnte Mitgliedsanträge werden nach
          [[Frist]] gelöscht.
        </p>

        <h2>7. Deine Rechte</h2>
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der
          Verarbeitung, Datenübertragbarkeit und Widerspruch (Art.&nbsp;15–21 DSGVO). Deine
          Stammdaten kannst du im Konto-Tab selbst einsehen und ändern. Für alles Weitere
          wende dich an die oben genannte Adresse. Beschwerden nimmt die zuständige
          Aufsichtsbehörde entgegen: [[Landesbeauftragte/r für Datenschutz …]].
        </p>

        <h2>8. Minderjährige</h2>
        <p>
          Für Mitglieder unter 16 Jahren erfolgt die Aufnahme und die Verarbeitung ihrer Daten
          mit Einwilligung der Erziehungsberechtigten, die im Mitgliedsantrag erklärt wird.
        </p>

        <p className="beschreibung" style={{ marginTop: 24 }}>
          <Link href="/impressum">Impressum</Link> · <Link href="/login">Zur Anmeldung</Link>
        </p>
      </div>
    </div>
  );
}
