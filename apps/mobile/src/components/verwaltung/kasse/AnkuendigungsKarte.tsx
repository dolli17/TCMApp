/**
 * Die Vorabankuendigung (Nachbau von apps/web/src/components/AnkuendigungsKarte.tsx)
 *
 * Vor jedem SEPA-Einzug muss der Zahler wissen, wie viel wann von seinem Konto
 * abgeht. Der frueheste Faelligkeitstag ist vorgegeben; ein frueheres Datum
 * nimmt das Feld nicht an (die Datenbank wiese es ohnehin ab).
 */

import { useState } from "react";
import { Text } from "react-native";
import { formatCents } from "@tcm/core";
import { FormFeld, FormGruppe, Karte, Knopf, Meldung, useAktion } from "@/components/verwaltung/Formular";
import { KEIN_DATUM, zahlwort } from "@/components/verwaltung/kasse/Teile";
import { useTheme } from "@/lib/theme";
import { deutschZuIso, heuteInBerlin, isoZuDeutsch } from "@/lib/verwaltung/gemeinsam";
import { forderungenAnkuendigen, plusTage, type ForderungsArt } from "@/lib/verwaltung/kasse";

export function AnkuendigungsKarte({
  art,
  zeitraum,
  offen,
  summeCents,
  fristTage,
  faelligVorschlag,
  onGeaendert,
}: {
  art: ForderungsArt;
  zeitraum: string | null;
  offen: number;
  summeCents: number;
  fristTage: number;
  faelligVorschlag: string;
  onGeaendert: () => void | Promise<void>;
}) {
  const { stil } = useTheme();
  const frueheste = plusTage(heuteInBerlin(), fristTage);
  const [faellig, setFaellig] = useState(
    isoZuDeutsch(faelligVorschlag > frueheste ? faelligVorschlag : frueheste),
  );
  const { laeuft, meldung, setMeldung, ausfuehren } = useAktion();

  const iso = deutschZuIso(faellig);

  return (
    <Karte
      titel="Vorabankündigung"
      unterzeile={`Jeder Zahler bekommt eine Nachricht mit Gesamtbetrag und Fälligkeit – eine je Zahler, nicht eine je Kind. Erst ${fristTage} Tage danach darf eingezogen werden.`}
    >
      <Meldung meldung={meldung} />

      {offen === 0 ? (
        // Bewusst offen formuliert: "schon alles angekuendigt" und "es gibt
        // noch gar keine Forderungen" sehen gleich aus.
        <Text style={stil.leise}>Zurzeit steht nichts zur Ankündigung an.</Text>
      ) : (
        <>
          <FormGruppe>
            <FormFeld
              label="Fällig am"
              wert={faellig}
              onAendern={setFaellig}
              platzhalter="TT.MM.JJJJ"
              tastatur="numbers-and-punctuation"
              beschreibung={`Frühestens der ${isoZuDeutsch(frueheste)} – so lange läuft die Frist.`}
            />
          </FormGruppe>
          <Knopf
            text={`${zahlwort(offen, "Forderung", "Forderungen")} über ${formatCents(summeCents)} ankündigen`}
            laeuftText="Wird angekündigt…"
            laeuft={laeuft}
            deaktiviert={iso !== null && iso < frueheste}
            onPress={() => {
              if (!iso) {
                setMeldung({ ok: false, text: KEIN_DATUM });
                return;
              }
              void ausfuehren(() => forderungenAnkuendigen({ faelligAm: iso, art, zeitraum }), onGeaendert);
            }}
          />
        </>
      )}
    </Karte>
  );
}
