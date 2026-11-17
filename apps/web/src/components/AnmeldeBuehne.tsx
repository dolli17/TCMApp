/**
 * Der Rahmen der Anmeldeseiten (docs/design/stitch, Entwurf "Anmelden")
 *
 * Weißer Grund wie der Rest der App: Kicker mit dem Vereinsnamen, der Titel,
 * darunter das Formular. Folgt dem gewählten Theme - die blaue Bühne mit
 * Tennisplatz und die erzwungen dunkle Darstellung gibt es nicht mehr.
 */
export function AnmeldeBuehne({
  titel,
  unterzeile,
  breit = false,
  klasse,
  vorspann,
  children,
}: {
  /** Steht anstelle des Vereinsnamens über dem Titel, etwa die Schrittanzeige des Onboardings. */
  vorspann?: React.ReactNode;
  titel: string;
  unterzeile?: string;
  /** Breiteres Formular, etwa für den Mitgliedsantrag */
  breit?: boolean;
  /** Zusaetzliche Klasse fuer den Inhalt, etwa "rechtstext" */
  klasse?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`auth${breit ? " antragsseite" : ""}`}>
      <header className="buehne">
        {vorspann ?? <div className="kicker">TC Muckensturm</div>}
        <h1>{titel}</h1>
        {unterzeile && <p>{unterzeile}</p>}
      </header>
      <div className={`sheet${klasse ? ` ${klasse}` : ""}`}>{children}</div>
    </div>
  );
}
