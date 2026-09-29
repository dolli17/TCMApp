/**
 * Angelegte Serien (Nachbau von apps/web/src/components/SerienListe.tsx)
 *
 * Wochentag-Kachel, Titel, Zeit, Art und Platz. Ein Tippen oeffnet das Blatt
 * zum Aendern; dort steht auch "Serie beenden" - mit Rueckfrage im Blatt,
 * wie im Web.
 *
 * Platz und Wochentag lassen sich nicht aendern: wer die aendert, meint eine
 * andere Serie und legt sie besser neu an.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { WOCHENTAGE } from "@/components/verwaltung/plaetze/SerienFormular";
import { FormBlatt, FormFeld, FormGruppe, Knopf, Meldung, useAktion } from "@/components/verwaltung/Formular";
import { LeereZeile, ListenGruppe, Listenzeile } from "@/components/verwaltung/Liste";
import { useTheme } from "@/lib/theme";
import { isoZuDeutsch, type Ergebnis } from "@/lib/verwaltung/gemeinsam";
import { aendereSerie, beendeSerie, type SerienZeile } from "@/lib/verwaltung/plaetze";

const KURZ = ["SO", "MO", "DI", "MI", "DO", "FR", "SA"];

export function SerienListe({
  serien,
  melde,
  neuLaden,
}: {
  serien: SerienZeile[];
  melde: (e: Ergebnis) => void;
  neuLaden: () => Promise<void>;
}) {
  const { farben } = useTheme();
  const [bearbeitet, setBearbeitet] = useState<SerienZeile | null>(null);

  if (serien.length === 0) {
    return (
      <ListenGruppe>
        <LeereZeile text="Noch keine Serien angelegt." />
      </ListenGruppe>
    );
  }

  return (
    <>
      <ListenGruppe>
        {serien.map((s) => (
          <Listenzeile
            key={s.id}
            symbol={
              <Text style={{ fontFamily: "BarlowSemiCondensed_800ExtraBold", fontSize: 14, color: farben.goldInk }}>
                {KURZ[s.weekday]}
              </Text>
            }
            titel={s.title}
            kontext={
              <Text style={{ fontSize: 13, color: farben.muted, fontFamily: "Barlow_400Regular", lineHeight: 17.5 }}>
                <Text style={{ color: farben.ink2, fontFamily: "Barlow_600SemiBold", fontVariant: ["tabular-nums"] }}>
                  {WOCHENTAGE[s.weekday]} · {String(s.start_time).slice(0, 5)} – {String(s.end_time).slice(0, 5)}
                </Text>
                {"\n"}
                {s.type_name} · {s.court_name} · bis {isoZuDeutsch(s.valid_to)}
              </Text>
            }
            hinweis={`${s.kuenftige} offen`}
            label={`${s.title}, ${WOCHENTAGE[s.weekday]} ${String(s.start_time).slice(0, 5)}`}
            onPress={() => setBearbeitet(s)}
          />
        ))}
      </ListenGruppe>

      {bearbeitet && (
        <FormBlatt
          titel={bearbeitet.title}
          unterzeile={`${bearbeitet.court_name} · ${WOCHENTAGE[bearbeitet.weekday]} · ${bearbeitet.type_name}`}
          onSchliessen={() => setBearbeitet(null)}
        >
          {(zu) => (
            <SerienBlatt
              serie={bearbeitet}
              onAbbrechen={zu}
              onErfolg={async (e) => {
                await neuLaden();
                melde(e);
                zu();
              }}
            />
          )}
        </FormBlatt>
      )}
    </>
  );
}

function SerienBlatt({
  serie,
  onAbbrechen,
  onErfolg,
}: {
  serie: SerienZeile;
  onAbbrechen: () => void;
  onErfolg: (e: Ergebnis) => Promise<void>;
}) {
  const { stil } = useTheme();
  const [von, setVon] = useState(String(serie.start_time).slice(0, 5));
  const [bis, setBis] = useState(String(serie.end_time).slice(0, 5));
  const [titel, setTitel] = useState(serie.title);
  const [ende, setEnde] = useState(isoZuDeutsch(serie.valid_to));
  const [kollisionen, setKollisionen] = useState<number | null>(null);
  const [beendenFrage, setBeendenFrage] = useState(false);
  const { laeuft, meldung, ausfuehren } = useAktion();

  async function speichern(verdraengen: boolean) {
    const e = await ausfuehren(
      () => aendereSerie({ seriesId: serie.id, startTime: von, endTime: bis, titel, validTo: ende, verdraengen }),
      onErfolg,
    );
    if (e) setKollisionen(e.kollisionen ?? null);
  }

  return (
    <View style={{ gap: 14 }}>
      <Text style={[stil.leise, { fontSize: 14 }]}>
        Vergangene Termine bleiben stehen. Geändert wird ab heute: die künftigen werden
        abgesagt und in der neuen Lage neu angelegt.
      </Text>

      <FormGruppe>
        <FormFeld label="Von" wert={von} onAendern={setVon} platzhalter="HH:MM" tastatur="numbers-and-punctuation" />
        <FormFeld label="Bis" wert={bis} onAendern={setBis} platzhalter="HH:MM" tastatur="numbers-and-punctuation" />
        <FormFeld label="Läuft bis" wert={ende} onAendern={setEnde} platzhalter="TT.MM.JJJJ" tastatur="numbers-and-punctuation" />
        <FormFeld label="Titel" wert={titel} onAendern={setTitel} />
      </FormGruppe>

      <Meldung meldung={meldung} />

      <View style={{ gap: 8 }}>
        <Knopf
          art={kollisionen === null ? "blau" : "gefahr"}
          text={
            kollisionen === null
              ? "Änderung speichern"
              : `${kollisionen} ${kollisionen === 1 ? "Buchung" : "Buchungen"} verdrängen`
          }
          laeuftText="Wird gespeichert…"
          laeuft={laeuft}
          deaktiviert={titel.trim() === ""}
          onPress={() => void speichern(kollisionen !== null)}
        />
        <Knopf art="leise" text="Abbrechen" onPress={onAbbrechen} />
      </View>

      {/* Zerstoerendes am Ende, als rote Zeile mit Rueckfrage (Regel 4) */}
      <ListenGruppe>
        {!beendenFrage ? (
          <Listenzeile titel="Serie beenden" gefahr pfeil={false} onPress={() => setBeendenFrage(true)} />
        ) : (
          <View style={{ flexDirection: "row", gap: 8, padding: 12 }}>
            <View style={{ flex: 1 }}>
              <Knopf
                art="gefahr"
                klein
                text={`${serie.kuenftige} Termine absagen`}
                laeuft={laeuft}
                onPress={() => void ausfuehren(() => beendeSerie(serie.id), onErfolg)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Knopf art="leise" klein text="Doch nicht" onPress={() => setBeendenFrage(false)} />
            </View>
          </View>
        )}
      </ListenGruppe>
    </View>
  );
}
