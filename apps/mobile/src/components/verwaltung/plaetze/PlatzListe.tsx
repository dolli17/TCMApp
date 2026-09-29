/**
 * Die Plaetze (Nachbau von Platzliste in
 * apps/web/src/components/PlatzVerwaltung.tsx)
 *
 * Jede Zeile oeffnet ein Blatt: Name, Kurzname, Zusatz; darunter die
 * Reihenfolge (Hoch/Runter statt Ziehen) und Stilllegen.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { FormBlatt, FormFeld, FormGruppe, Knopf, Meldung, useAktion } from "@/components/verwaltung/Formular";
import { Abschnitt, Gruppenkopf, ListenGruppe, Listenzeile } from "@/components/verwaltung/Liste";
import { useTheme } from "@/lib/theme";
import type { Ergebnis } from "@/lib/verwaltung/gemeinsam";
import {
  schaltePlatz, sortierePlaetze, speicherePlatz, verschoben, type PlatzZeile, type PlatzZustand,
} from "@/lib/verwaltung/plaetze";

const LEER = { id: null as string | null, name: "", kurzname: "", zusatz: "" };

export function PlatzListe({
  plaetze,
  zustand,
  melde,
  neuLaden,
}: {
  plaetze: PlatzZeile[];
  zustand: PlatzZustand;
  /** Rueckmeldung auf der Seite, nachdem das Blatt zu ist */
  melde: (e: Ergebnis) => void;
  neuLaden: () => Promise<void>;
}) {
  const { stil, farben } = useTheme();
  // undefined = kein Blatt, null = neuer Platz
  const [offen, setOffen] = useState<PlatzZeile | null | undefined>(undefined);

  return (
    <Abschnitt>
      <Gruppenkopf titel="Plätze" />
      <Text style={[stil.leise, { fontSize: 14, marginHorizontal: 4, color: farben.ink2 }]}>
        Die Reihenfolge bestimmt, wie die Spalten im Belegungsplan stehen. Ein stillgelegter
        Platz verschwindet aus dem Plan; seine bisherigen Buchungen bleiben erhalten.
      </Text>
      <ListenGruppe>
        {plaetze.map((p) => {
          const heute = zustand[p.id];
          return (
            <Listenzeile
              key={p.id}
              symbol={p.short_name}
              titel={p.name}
              kontext={
                [p.subline, p.offene_buchungen > 0 ? `${p.offene_buchungen} offene Buchungen` : null]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
              hinweis={!p.active ? "stillgelegt" : heute ? heute.text : "im Plan"}
              hinweisTon={!p.active ? "leise" : heute ? (heute.art === "gesperrt" ? "rot" : "gold") : "gruen"}
              onPress={() => setOffen(p)}
            />
          );
        })}
        <Listenzeile titel="Neuen Platz anlegen" onPress={() => setOffen(null)} />
      </ListenGruppe>

      {offen !== undefined && (
        <FormBlatt titel={offen ? offen.name : "Neuen Platz anlegen"} onSchliessen={() => setOffen(undefined)}>
          {(zu) => (
            <PlatzBlatt
              platz={offen}
              plaetze={plaetze}
              neuLaden={neuLaden}
              onErfolg={(e) => {
                melde(e);
                zu();
              }}
            />
          )}
        </FormBlatt>
      )}
    </Abschnitt>
  );
}

function PlatzBlatt({
  platz,
  plaetze,
  neuLaden,
  onErfolg,
}: {
  platz: PlatzZeile | null;
  plaetze: PlatzZeile[];
  neuLaden: () => Promise<void>;
  onErfolg: (e: Ergebnis) => void;
}) {
  const [form, setForm] = useState(
    platz ? { id: platz.id, name: platz.name, kurzname: platz.short_name, zusatz: platz.subline ?? "" } : LEER,
  );
  const { laeuft, meldung, ausfuehren } = useAktion();
  // Die Liste kommt nach jedem Verschieben frisch; der Platz wird ueber die Id gefunden.
  const index = platz ? plaetze.findIndex((p) => p.id === platz.id) : -1;
  const aktuell = index >= 0 ? plaetze[index]! : null;

  function verschieben(richtung: -1 | 1) {
    const neu = verschoben(plaetze, index, richtung);
    if (!neu) return;
    // Das Blatt bleibt offen: wer um mehrere Stellen schiebt, tippt mehrmals.
    void ausfuehren(() => sortierePlaetze(neu.map((p) => p.id)), () => neuLaden());
  }

  return (
    <View style={{ gap: 14 }}>
      <FormGruppe>
        <FormFeld label="Name" wert={form.name} onAendern={(w) => setForm({ ...form, name: w })} />
        <FormFeld label="Kurzname" wert={form.kurzname} onAendern={(w) => setForm({ ...form, kurzname: w })} gross="characters" />
        <FormFeld label="Zusatz" wert={form.zusatz} onAendern={(w) => setForm({ ...form, zusatz: w })} platzhalter="z. B. Sandplatz" />
      </FormGruppe>
      <Meldung meldung={meldung} />
      <Knopf
        art="gold"
        gross
        text={form.id ? "Änderungen speichern" : "Platz anlegen"}
        laeuft={laeuft}
        deaktiviert={form.name.trim() === "" || form.kurzname.trim() === ""}
        onPress={() =>
          void ausfuehren(() => speicherePlatz(form), async (e) => {
            await neuLaden();
            onErfolg(e);
          })
        }
      />

      {aktuell && (
        <ListenGruppe>
          <Listenzeile
            titel="Im Plan weiter nach vorne"
            pfeil={false}
            onPress={laeuft || index <= 0 ? undefined : () => verschieben(-1)}
          />
          <Listenzeile
            titel="Im Plan weiter nach hinten"
            pfeil={false}
            onPress={laeuft || index >= plaetze.length - 1 ? undefined : () => verschieben(1)}
          />
          <Listenzeile
            titel={aktuell.active ? "Stilllegen" : "Aktivieren"}
            gefahr={aktuell.active}
            pfeil={false}
            onPress={
              laeuft
                ? undefined
                : () =>
                    void ausfuehren(() => schaltePlatz(aktuell.id, !aktuell.active), async (e) => {
                      await neuLaden();
                      onErfolg(e);
                    })
            }
          />
        </ListenGruppe>
      )}
    </View>
  );
}
