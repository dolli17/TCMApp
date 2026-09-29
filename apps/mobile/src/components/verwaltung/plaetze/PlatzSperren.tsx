/**
 * Plaetze sperren (Nachbau von PlatzSperren/Sperrformular in
 * apps/web/src/components/PlatzVerwaltung.tsx)
 *
 * Regen, Turnier, Platzpflege. Der zweistufige Ablauf ist derselbe wie bei
 * den Serien: erst zaehlen, dann fragen, dann verdraengen. Die Rueckfrage
 * steht wie im Web als Folgen-Kasten mit zweitem Knopf im Blatt.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import {
  Chipwahl, Folgen, FormAuswahl, FormFeld, FormGruppe, Knopf, Meldung, useAktion,
} from "@/components/verwaltung/Formular";
import { useTheme } from "@/lib/theme";
import { heuteInBerlin, isoZuDeutsch, type Ergebnis } from "@/lib/verwaltung/gemeinsam";
import { sperre, type PlatzZeile } from "@/lib/verwaltung/plaetze";

const ALLE = "__alle";

export function PlatzSperren({
  plaetze,
  arten,
  oeffnung,
  schluss,
  onErfolg,
}: {
  /** Nur die aktiven */
  plaetze: PlatzZeile[];
  arten: { code: string; name: string }[];
  oeffnung: string;
  schluss: string;
  onErfolg: (e: Ergebnis) => void;
}) {
  const { farben } = useTheme();
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [tag, setTag] = useState(isoZuDeutsch(heuteInBerlin()));
  // Vorgabe aus den Einstellungen, nicht fest eingetippt: sonst schlaegt das
  // Formular weiter 08:00 bis 21:00 vor, nachdem sich die Zeiten geaendert haben.
  const [von, setVon] = useState(oeffnung);
  const [bis, setBis] = useState(schluss);
  const [artCode, setArtCode] = useState(arten[0]?.code ?? "platzpflege");
  const [grund, setGrund] = useState("");
  const [kollisionen, setKollisionen] = useState<number | null>(null);
  const { laeuft, meldung, setMeldung, ausfuehren } = useAktion();

  const alle = plaetze.length > 0 && gewaehlt.length === plaetze.length;
  const vollstaendig = gewaehlt.length > 0 && tag.trim() !== "" && grund.trim() !== "";

  /** Jede Aenderung macht eine alte Kollisionszahl ungueltig. */
  function geaendert<T>(setzen: (w: T) => void) {
    return (w: T) => {
      setzen(w);
      setKollisionen(null);
    };
  }

  async function absenden(verdraengen: boolean) {
    const e = await ausfuehren(() =>
      sperre({ platzIds: gewaehlt, tag, von, bis, artCode, grund, verdraengen }),
    );
    if (!e) return;
    setKollisionen(e.kollisionen ?? null);
    if (e.ok) {
      setMeldung(null);
      onErfolg(e);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <Chipwahl
        label="Plätze"
        mehrfach
        optionen={[
          ...plaetze.map((p) => ({ wert: p.id, label: p.short_name.replace(/^P/, "") })),
          { wert: ALLE, label: alle ? "Keinen" : "Alle" },
        ]}
        wert={alle ? [...gewaehlt, ALLE] : gewaehlt}
        onWahl={(id) => {
          setKollisionen(null);
          if (id === ALLE) setGewaehlt(alle ? [] : plaetze.map((p) => p.id));
          else setGewaehlt(gewaehlt.includes(id) ? gewaehlt.filter((x) => x !== id) : [...gewaehlt, id]);
        }}
      />

      <FormGruppe>
        <FormFeld label="Tag" wert={tag} onAendern={geaendert(setTag)} platzhalter="TT.MM.JJJJ" tastatur="numbers-and-punctuation" />
        <FormFeld label="Von" wert={von} onAendern={geaendert(setVon)} platzhalter="HH:MM" tastatur="numbers-and-punctuation" />
        <FormFeld label="Bis" wert={bis} onAendern={geaendert(setBis)} platzhalter="HH:MM" tastatur="numbers-and-punctuation" />
      </FormGruppe>

      <FormGruppe>
        <FormAuswahl
          label="Art"
          wert={artCode}
          optionen={arten.map((a) => ({ wert: a.code, label: a.name }))}
          onWahl={setArtCode}
        />
        <FormFeld label="Grund" wert={grund} onAendern={setGrund} platzhalter="z. B. Platzpflege nach Regen" />
      </FormGruppe>

      <Meldung meldung={meldung} />

      {kollisionen !== null && (
        <Folgen>
          <Text style={{ fontSize: 14, lineHeight: 19.5, color: farben.ink, fontFamily: "Barlow_400Regular" }}>
            <Text style={{ fontFamily: "Barlow_700Bold" }}>
              {kollisionen} {kollisionen === 1 ? "Buchung liegt" : "Buchungen liegen"} im Weg.
            </Text>{" "}
            Sie werden abgesagt, die Mitglieder bekommen Bescheid.
          </Text>
        </Folgen>
      )}

      {kollisionen === null ? (
        <Knopf
          art="gold"
          gross
          text="Sperren"
          laeuftText="Wird gesperrt…"
          laeuft={laeuft}
          deaktiviert={!vollstaendig}
          onPress={() => void absenden(false)}
        />
      ) : (
        <View style={{ gap: 8 }}>
          <Knopf
            art="gefahr"
            text={`${kollisionen} ${kollisionen === 1 ? "Buchung" : "Buchungen"} verdrängen`}
            laeuft={laeuft}
            onPress={() => void absenden(true)}
          />
          <Knopf art="leise" text="Doch nicht" onPress={() => setKollisionen(null)} />
        </View>
      )}
    </View>
  );
}
