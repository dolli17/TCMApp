/**
 * Eine Mannschaft anlegen oder bearbeiten, samt Aufstellung (Nachbau von
 * MannschaftsFormular und AufstellungKarte aus apps/web/src/components)
 *
 * Eine Mannschaft hat einen Namen und eine Reihenfolge, mehr nicht. Die
 * Aufstellung steht darunter, weil sie ein anderes Tempo hat: Spieler kommen
 * und gehen, der Name bleibt. Keine Knoepfe in den Zeilen (Regel 4): ein
 * Tippen waehlt den Spieler, darunter stehen seine Aktionen.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { router, type Href } from "expo-router";
import {
  FormBlatt, FormFeld, FormGruppe, FormSchalter, Knopf, Meldung, bestaetige, useAktion,
} from "@/components/verwaltung/Formular";
import { Gruppenkopf, ListenGruppe, Listenzeile } from "@/components/verwaltung/Liste";
import { Personensuche } from "@/components/verwaltung/mitglieder/Personensuche";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";
import {
  ladeAufstellung, ladeVerzeichnis, mannschaftLoeschen, mannschaftSpeichern, spielerEntfernen, spielerSetzen,
  type Aufstellungszeile, type Mannschaft,
} from "@/lib/verwaltung/mitglieder";

export function MannschaftsBlatt({
  vorhanden,
  onSchliessen,
  onGeaendert,
  onAngelegt,
}: {
  vorhanden?: Mannschaft;
  onSchliessen: () => void;
  /** Liste neu laden; bei geloescht mit Meldung fuer die Seite. */
  onGeaendert: (meldung?: string) => Promise<void>;
  /** Nach dem Anlegen direkt in die Bearbeitung der neuen Mannschaft. */
  onAngelegt?: (id: string) => void;
}) {
  const { stil } = useTheme();
  const [name, setName] = useState(vorhanden?.name ?? "");
  const [reihenfolge, setReihenfolge] = useState(String(vorhanden?.sort_order ?? 0));
  const [stillgelegt, setStillgelegt] = useState(vorhanden ? !vorhanden.active : false);
  const { laeuft, meldung, ausfuehren } = useAktion();
  const spieler = vorhanden?.member_count ?? 0;

  return (
    <FormBlatt
      titel={vorhanden ? "Mannschaft bearbeiten" : "Mannschaft anlegen"}
      kicker={vorhanden?.name}
      onSchliessen={onSchliessen}
    >
      {(zu) => (
        <>
          <Meldung meldung={meldung} />
          <FormGruppe>
            <FormFeld label="Name" wert={name} onAendern={setName} platzhalter="z. B. Herren 30" gross="words" />
            <FormFeld label="Reihenfolge" wert={reihenfolge} onAendern={setReihenfolge} tastatur="number-pad" />
            {vorhanden && (
              <FormSchalter
                label="Stillgelegt"
                beschreibung="Nimmt niemanden mehr auf, die Aufstellung bleibt sichtbar."
                an={stillgelegt}
                onWechsel={setStillgelegt}
              />
            )}
          </FormGruppe>
          <Knopf
            art="gold"
            gross
            text="Speichern"
            laeuftText="Wird gespeichert…"
            laeuft={laeuft}
            onPress={() =>
              void ausfuehren(
                () => mannschaftSpeichern({ id: vorhanden?.id, name, sort_order: reihenfolge, stillgelegt }),
                async (e) => {
                  await onGeaendert();
                  if (!vorhanden && e.daten) onAngelegt?.(e.daten);
                },
              )
            }
          />

          {vorhanden && (
            <>
              <Aufstellung mannschaft={vorhanden} aktiv={!stillgelegt && vorhanden.active} onGeaendert={onGeaendert} onZu={zu} />
              <View style={{ gap: 6 }}>
                <Knopf
                  art="leise"
                  text="Mannschaft löschen"
                  deaktiviert={laeuft}
                  onPress={() =>
                    bestaetige(
                      `„${vorhanden.name}" löschen?`,
                      spieler === 0
                        ? "Die Mannschaft wird gelöscht."
                        : spieler === 1
                          ? "Ein Spieler wird aus der Mannschaft genommen."
                          : `${spieler} Spieler werden aus der Mannschaft genommen.`,
                      "Wirklich löschen",
                      () =>
                        void ausfuehren(
                          () => mannschaftLoeschen(vorhanden.id),
                          async (e) => {
                            zu();
                            await onGeaendert(e.meldung);
                          },
                        ),
                    )
                  }
                />
                <Text style={[stil.leise, { textAlign: "center" }]}>
                  Die Spieler bleiben Mitglieder und stehen danach in keiner Mannschaft.
                </Text>
              </View>
            </>
          )}
        </>
      )}
    </FormBlatt>
  );
}

function Aufstellung({
  mannschaft,
  aktiv,
  onGeaendert,
  onZu,
}: {
  mannschaft: Mannschaft;
  aktiv: boolean;
  onGeaendert: () => Promise<void>;
  onZu: () => void;
}) {
  const { stil } = useTheme();
  const zustand = useLaden(async () => {
    const [zeilen, verzeichnis] = await Promise.all([ladeAufstellung(mannschaft.id), ladeVerzeichnis()]);
    return { zeilen, verzeichnis };
  });
  const { laeuft, meldung, setMeldung, ausfuehren } = useAktion();
  const [gewaehltId, setGewaehltId] = useState<string | null>(null);
  const zeilen = zustand.daten?.zeilen ?? [];
  const gewaehlt = zeilen.find((z) => z.member_id === gewaehltId) ?? null;

  async function geaendert() {
    await Promise.all([zustand.erneutHolen(), onGeaendert()]);
  }

  function hinzufuegen(id: string | null) {
    if (!id) return;
    void ausfuehren(() => spielerSetzen(mannschaft.id, id, false), geaendert);
  }

  /** Ein zweiter Fuehrer wird abgewiesen - der bisherige verliert das Kennzeichen vorher. */
  function fuehrer(zeile: Aufstellungszeile) {
    void ausfuehren(async () => {
      const bisher = zeilen.find((z) => z.is_team_captain && z.member_id !== zeile.member_id);
      if (!zeile.is_team_captain && bisher) {
        const e = await spielerSetzen(mannschaft.id, bisher.member_id, false);
        if (!e.ok) return e;
      }
      return spielerSetzen(mannschaft.id, zeile.member_id, !zeile.is_team_captain);
    }, geaendert);
  }

  return (
    <View style={{ gap: 12 }}>
      <Gruppenkopf titel="Aufstellung" />
      {zustand.fehler && <Text style={stil.hinweisFehler}>{zustand.fehler}</Text>}
      <Meldung meldung={meldung} />
      {zustand.daten && zeilen.length === 0 && <Text style={stil.leise}>Noch niemand eingetragen.</Text>}
      {zeilen.length > 0 && (
        <ListenGruppe>
          {zeilen.map((z) => (
            <Listenzeile
              key={z.member_id}
              avatar={{ kurz: (z.first_name[0] ?? "") + (z.last_name[0] ?? ""), id: z.member_id }}
              titel={`${z.last_name}, ${z.first_name}`}
              hinweis={z.is_team_captain ? "Mannschaftsführer" : undefined}
              hinweisTon="gold"
              aktuell={z.member_id === gewaehltId}
              pfeil={false}
              onPress={() => setGewaehltId(z.member_id === gewaehltId ? null : z.member_id)}
            />
          ))}
        </ListenGruppe>
      )}
      {gewaehlt && (
        <ListenGruppe>
          <Listenzeile
            titel={gewaehlt.is_team_captain ? "Kennzeichen entfernen" : "Zum Mannschaftsführer machen"}
            kontext={`${gewaehlt.first_name} ${gewaehlt.last_name}`}
            onPress={() => !laeuft && fuehrer(gewaehlt)}
          />
          <Listenzeile
            titel="Zum Mitglied"
            onPress={() => {
              onZu();
              router.push(`/verwaltung/mitglieder/${gewaehlt.member_id}` as Href);
            }}
          />
          <Listenzeile
            titel="Herausnehmen"
            gefahr
            pfeil={false}
            onPress={() => {
              if (laeuft) return;
              setGewaehltId(null);
              void ausfuehren(() => spielerEntfernen(gewaehlt.member_id), geaendert);
            }}
          />
        </ListenGruppe>
      )}

      <Text style={[stil.text, { fontFamily: "Barlow_700Bold" }]}>Spieler hinzufügen</Text>
      <Text style={stil.leise}>
        {aktiv
          ? "Wer bereits in einer anderen Mannschaft steht, wechselt hierher."
          : "Eine stillgelegte Mannschaft nimmt niemanden mehr auf."}
      </Text>
      {zustand.daten && (
        <Personensuche
          verzeichnis={zustand.daten.verzeichnis}
          gewaehlt={null}
          onWahl={(id) => {
            setMeldung(null);
            hinzufuegen(id);
          }}
          label="Mitglied"
          ausschluss={zeilen.map((z) => z.member_id)}
          deaktiviert={laeuft || !aktiv}
        />
      )}
    </View>
  );
}
