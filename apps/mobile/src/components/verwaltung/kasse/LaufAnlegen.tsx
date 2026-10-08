/**
 * Einen neuen Lastschriftlauf anlegen (Nachbau von
 * apps/web/src/components/LaufAnlegen.tsx) - als Blatt.
 *
 * Der Lauf entsteht leer; gefuellt wird er auf seiner eigenen Seite, wo die
 * Kandidatenliste steht. Der Faelligkeitstag bestimmt, wer ueberhaupt in Frage
 * kommt - den will man erst setzen und dann sehen, was er bedeutet.
 *
 * Ein Lauf zieht alle angekuendigten Arten ein, ausser man schraenkt ihn ein -
 * etwa auf die Beitraege im Fruehjahr, ohne dass Getraenke mitgehen. Der Name
 * wird aus Datum und Auswahl vorgeschlagen (debitBatchTitle), solange man ihn
 * nicht selbst aendert.
 */

import { useState } from "react";
import { router, type Href } from "expo-router";
import { CHARGE_KINDS, CHARGE_KIND_LABEL, debitBatchTitle, type ChargeKind } from "@tcm/core";
import {
  Chipwahl, FormBlatt, FormFeld, FormGruppe, Knopf, Meldung, useAktion,
} from "@/components/verwaltung/Formular";
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
  const vorgabe = plusTage(heute, fristTage + 1);
  const [faellig, setFaellig] = useState(isoZuDeutsch(vorgabe));
  const [alle, setAlle] = useState(true);
  const [arten, setArten] = useState<ChargeKind[]>(["fee"]);
  const [titel, setTitel] = useState(debitBatchTitle(vorgabe));
  // Solange niemand den Namen angefasst hat, folgt er Datum und Auswahl.
  const [titelSelbst, setTitelSelbst] = useState(false);
  const { laeuft, meldung, setMeldung, ausfuehren } = useAktion();

  function neuBenennen(datum: string, mitAllen: boolean, auswahl: ChargeKind[]) {
    if (titelSelbst) return;
    // Waehrend des Tippens ist das Datum oft unvollstaendig - dann bleibt der alte Name.
    const iso = deutschZuIso(datum);
    if (iso) setTitel(debitBatchTitle(iso, mitAllen ? null : auswahl));
  }

  function umschalten(k: ChargeKind) {
    const neu = arten.includes(k) ? arten.filter((a) => a !== k) : [...arten, k];
    setArten(neu);
    neuBenennen(faellig, alle, neu);
  }

  return (
    <FormBlatt
      titel="Neuer Lastschriftlauf"
      unterzeile="Der Fälligkeitstag entscheidet, welche Forderungen mitgehen: nur die, deren Vorabankündigung dann lange genug her ist."
      onSchliessen={onSchliessen}
    >
      {(schliessen) => (
        <>
          <FormGruppe>
            <FormFeld
              label="Fällig am"
              wert={faellig}
              onAendern={(w) => {
                setFaellig(w);
                neuBenennen(w, alle, arten);
              }}
              platzhalter="TT.MM.JJJJ"
              tastatur="numbers-and-punctuation"
            />
          </FormGruppe>

          <Chipwahl
            label="Was einziehen?"
            optionen={[
              { wert: "alle", label: "Alles Angekündigte" },
              { wert: "bestimmte", label: "Nur bestimmte Arten" },
            ]}
            wert={alle ? "alle" : "bestimmte"}
            onWahl={(w) => {
              const mitAllen = w === "alle";
              setAlle(mitAllen);
              neuBenennen(faellig, mitAllen, arten);
            }}
          />
          {!alle && (
            <Chipwahl
              mehrfach
              optionen={CHARGE_KINDS.map((k) => ({ wert: k, label: CHARGE_KIND_LABEL[k] }))}
              wert={arten}
              onWahl={umschalten}
            />
          )}

          <FormGruppe>
            <FormFeld
              label="Bezeichnung"
              wert={titel}
              onAendern={(w) => {
                setTitel(w);
                setTitelSelbst(true);
              }}
            />
          </FormGruppe>

          <Meldung meldung={meldung} />

          <Knopf
            art="gold"
            gross
            text="Lauf anlegen"
            laeuft={laeuft}
            deaktiviert={titel.trim() === "" || faellig.trim() === "" || (!alle && arten.length === 0)}
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
                () => laufAnlegen({ titel, faelligAm: iso, arten: alle ? null : CHARGE_KINDS.filter((k) => arten.includes(k)) }),
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
