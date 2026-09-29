/**
 * Einen Einsatz eintragen (Web: der Dialog in ArbeitsdienstListe.tsx)
 *
 * Aus einer Zeile der Liste geoeffnet steht das Mitglied schon fest. Ueber
 * den Knopf im Kopf ist es noch offen - dann sucht das Blatt zuerst im
 * Mitgliederverzeichnis (member_directory), denn eintragen laesst sich auch
 * fuer jemanden, der (noch) kein Soll hat.
 *
 * Das Jahr ergibt sich aus dem Einsatztag, nicht aus der Jahresauswahl.
 */

import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import {
  FormBlatt, FormFeld, FormGruppe, Knopf, Meldung, useAktion,
} from "@/components/verwaltung/Formular";
import { LeereZeile, ListenGruppe, Listenzeile } from "@/components/verwaltung/Liste";
import { ladeVerzeichnis } from "@/lib/daten";
import { useTheme } from "@/lib/theme";
import { stundenAusText, stundenEintragen } from "@/lib/verwaltung/arbeitsdienst";
import { heuteInBerlin, isoZuDeutsch } from "@/lib/verwaltung/gemeinsam";

type Person = { id: string; name: string };

export function EinsatzBlatt({
  person: vorgegeben,
  onSchliessen,
  onErfolg,
}: {
  person: Person | null;
  onSchliessen: () => void;
  onErfolg: (meldung: string) => void;
}) {
  const [person, setPerson] = useState<Person | null>(vorgegeben);
  const [stunden, setStunden] = useState("2");
  const [amTag, setAmTag] = useState(isoZuDeutsch(heuteInBerlin()));
  const [was, setWas] = useState("");
  const { laeuft, meldung, ausfuehren } = useAktion();

  const zahl = stundenAusText(stunden);

  return (
    <FormBlatt
      titel={person ? `Einsatz von ${person.name}` : "Einsatz eintragen"}
      unterzeile="Das Jahr ergibt sich aus dem Einsatztag – ein im Januar nachgetragener Dezember-Einsatz zählt fürs alte Jahr."
      onSchliessen={onSchliessen}
    >
      {(schliessen) => (
        <>
          {person ? (
            !vorgegeben && (
              <Knopf art="leise" klein text="Anderes Mitglied wählen" onPress={() => setPerson(null)} />
            )
          ) : (
            <PersonenSuche onWahl={setPerson} />
          )}

          {person && (
            <>
              <FormGruppe>
                <FormFeld
                  label="Stunden"
                  wert={stunden}
                  onAendern={setStunden}
                  tastatur="decimal-pad"
                  platzhalter="z. B. 2,5"
                />
                <FormFeld
                  label="Am"
                  wert={amTag}
                  onAendern={setAmTag}
                  tastatur="numbers-and-punctuation"
                  platzhalter="TT.MM.JJJJ"
                />
                <FormFeld
                  label="Was wurde gemacht"
                  wert={was}
                  onAendern={setWas}
                  platzhalter="z. B. Platzaufbau im Frühjahr"
                />
              </FormGruppe>
              <Meldung meldung={meldung} />
              <Knopf
                gross
                text="Eintragen"
                laeuft={laeuft}
                deaktiviert={amTag.trim() === "" || !(zahl > 0)}
                onPress={() =>
                  void ausfuehren(
                    () => stundenEintragen({ mitgliedId: person.id, stunden: zahl, amTag, beschreibung: was }),
                    (e) => {
                      onErfolg(e.meldung);
                      schliessen();
                    },
                  )
                }
              />
            </>
          )}
        </>
      )}
    </FormBlatt>
  );
}

/** Suche im Mitgliederverzeichnis, leicht verzoegert beim Tippen. */
function PersonenSuche({ onWahl }: { onWahl: (p: Person) => void }) {
  const { farben, stil } = useTheme();
  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState<{ id: string; first_name: string; last_name: string }[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    const zeit = setTimeout(() => {
      ladeVerzeichnis(suche.trim())
        .then((t) => {
          if (!aktiv) return;
          setTreffer(t);
          setFehler(null);
        })
        .catch((f: unknown) => aktiv && setFehler(f instanceof Error ? f.message : "Unbekannter Fehler."));
    }, 250);
    return () => {
      aktiv = false;
      clearTimeout(zeit);
    };
  }, [suche]);

  return (
    <View style={{ gap: 10 }}>
      <FormGruppe>
        <FormFeld
          label="Mitglied"
          wert={suche}
          onAendern={setSuche}
          platzhalter="Name suchen"
          gross="words"
          autoFokus
        />
      </FormGruppe>
      {fehler && <Text style={stil.hinweisFehler}>{fehler}</Text>}
      {treffer === null ? (
        <ActivityIndicator color={farben.blue} />
      ) : (
        <ListenGruppe>
          {treffer.length === 0 ? (
            <LeereZeile text="Niemand gefunden." />
          ) : (
            treffer.slice(0, 12).map((m) => {
              const name = `${m.first_name} ${m.last_name}`;
              return (
                <Listenzeile
                  key={m.id}
                  avatar={{ kurz: `${m.first_name[0] ?? ""}${m.last_name[0] ?? ""}`, id: m.id }}
                  titel={name}
                  label={`${name} wählen`}
                  onPress={() => onWahl({ id: m.id, name })}
                />
              );
            })
          )}
        </ListenGruppe>
      )}
    </View>
  );
}
