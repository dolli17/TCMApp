import Image from "next/image";
import logo from "@tcm/ui/logo-weiss.png";

/**
 * Die Bühne der Anmeldeseiten (Entwurf AppLogin, docs/design/clubhaus)
 *
 * Oben eine Fläche in brand mit einem Tennisplatz in Perspektive und dem
 * gelben Ball, das weiße Logo, der Titel unten links; darunter das Formular
 * auf dunklem Grund. Immer dunkel, egal welches Theme gewählt ist - die
 * Klasse .immer-dunkel setzt die dunklen Tokens nur für diesen Teil.
 */
export function AnmeldeBuehne({
  titel,
  unterzeile,
  breit = false,
  children,
}: {
  titel: string;
  unterzeile?: string;
  /** Breiteres Formular, etwa für den Mitgliedsantrag */
  breit?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`auth immer-dunkel${breit ? " antragsseite" : ""}`}>
      <div className="buehne">
        <svg className="platz" viewBox="0 0 390 360" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <path d="M40 360 L130 110 H260 L350 360" />
          <path d="M78 255 H312" />
          <path d="M100 195 H290 M60 305 H330 M195 195 V305" />
          <path className="netz" d="M0 110 H390" />
        </svg>
        <span className="ball" aria-hidden="true" />
        <div className="buehne-inhalt">
          <Image src={logo} alt="TC Muckensturm" height={36} priority />
          <div>
            <h1>{titel}</h1>
            {unterzeile && <p>{unterzeile}</p>}
          </div>
        </div>
      </div>
      <div className="sheet">{children}</div>
    </div>
  );
}
