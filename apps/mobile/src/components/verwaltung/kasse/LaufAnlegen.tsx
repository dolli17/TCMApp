/**
 * Einen neuen Lastschriftlauf anlegen (Nachbau von
 * apps/web/src/components/LaufAnlegen.tsx) - als Blatt.
 *
 * Der Lauf entsteht leer; gefuellt wird er auf seiner eigenen Seite, wo die
 * Kandidatenliste steht. Der Faelligkeitstag bestimmt, wer ueberhaupt in Frage
 * kommt - den will man erst setzen und dann sehen, was er bedeutet.
 */

import { useState } from "react";
import { router, type Href } from "expo-router";
import { FormBlatt, FormFeld, FormGruppe, Knopf, Meldung, useAktion } from "@/components/verwaltung/Formular";
import { KEIN_DATUM } from "@/components/verwaltung/kasse/Teile";
import { deutschZuIso, heuteInBerlin, isoZuDeutsch } from "@/lib/verwaltung/gemeinsam";
import { laufAnlegen, plusTage } from "@/lib/verwaltung/kasse";

export function LaufAnlegen({
  fristTage,
  onSchliessen,
  onAngelegt,
}: {
  fristTage: number;
  onSchliessen: () => void;
  onAngelegt?: () => void | Promise<void>;
}) {
  const heute = heuteInBerlin();
  const [titel, setTitel] = useState("");
  const [faellig, setFaellig] = useState(isoZuDeutsch(plusTage(heute, fristTage + 1)));
  const { laeuft, meldung, setMeldung, ausfuehren } = useAktion();

  return (
    <FormBlatt
      titel="Neuer Lastschriftlauf"
      unterzeile="Der Fälligkeitstag entscheidet, welche Forderungen mitgehen: nur die, deren Vorabankündigung dann lange genug her ist."
      onSchliessen={onSchliessen}
    >
      {(schliessen) => (
        <>
          <FormGruppe>
            <FormFeld label="Bezeichnung" wert={titel} onAendern={setTitel} platzhalter="Beitragslauf 2027" />
            <FormFeld
              label="Fällig am"
              wert={faellig}
              onAendern={setFaellig}
              platzhalter="TT.MM.JJJJ"
              tastatur="numbers-and-punctuation"
            />
          </FormGruppe>

          <Meldung meldung={meldung} />

          <Knopf
            art="gold"
            gross
            text="Lauf anlegen"
            laeuft={laeuft}
            deaktiviert={titel.trim() === "" || faellig.trim() === ""}
            onPress={() => {
              const iso = deutschZuIso(faellig);
              if (!iso) {
                setMeldung({ ok: false, text: KEIN_DATUM });
                return;
              }
              // Wie das min des Datumsfelds im Web
              if (iso < heute) {
                setMeldung({ ok: false, text: `Der Fälligkeitstag darf nicht vor dem ${isoZuDeutsch(heute)} liegen.` });
                return;
              }
              void ausfuehren(
                () => laufAnlegen({ titel, faelligAm: iso }),
                async (e) => {
                  schliessen();
                  await onAngelegt?.();
                  if (e.daten) router.push(`/verwaltung/kasse/lastschriften/${e.daten}` as Href);
                },
              );
            }}
          />
        </>
      )}
    </FormBlatt>
  );
}
