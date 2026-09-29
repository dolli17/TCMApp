/**
 * Soll-Stunden einer Beitragsart setzen (Web: SollKarte in
 * ArbeitsdienstListe.tsx). Die Regel haengt an der Beitragsart, nicht am
 * Mitglied: Erwachsene leisten Dienst, Jugend und Passive nicht.
 */

import { useState } from "react";
import { FormBlatt, FormFeld, FormGruppe, Knopf, Meldung, useAktion } from "@/components/verwaltung/Formular";
import { sollStundenSetzen, stundenAusText, type SollZeile } from "@/lib/verwaltung/arbeitsdienst";

export function SollBlatt({
  art,
  jahr,
  onSchliessen,
  onErfolg,
}: {
  art: SollZeile;
  jahr: number;
  onSchliessen: () => void;
  onErfolg: (meldung: string) => void;
}) {
  const [wert, setWert] = useState(String(Number(art.soll_stunden ?? 0)).replace(".", ","));
  const { laeuft, meldung, ausfuehren } = useAktion();

  return (
    <FormBlatt titel={art.name} kicker={`Soll-Stunden ${jahr}`} onSchliessen={onSchliessen}>
      {(schliessen) => (
        <>
          <FormGruppe>
            <FormFeld
              label="Stunden"
              wert={wert}
              onAendern={setWert}
              tastatur="decimal-pad"
              beschreibung="0 bedeutet: diese Beitragsart leistet keinen Arbeitsdienst."
            />
          </FormGruppe>
          <Meldung meldung={meldung} />
          <Knopf
            gross
            art="gold"
            text="Setzen"
            laeuft={laeuft}
            onPress={() =>
              void ausfuehren(
                () => sollStundenSetzen({ artId: art.id, jahr, stunden: stundenAusText(wert) }),
                (e) => {
                  onErfolg(e.meldung);
                  schliessen();
                },
              )
            }
          />
        </>
      )}
    </FormBlatt>
  );
}
