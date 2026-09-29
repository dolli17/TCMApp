/**
 * Ein Merkmal anlegen oder aendern (Nachbau von
 * apps/web/src/components/MerkmalsFormular.tsx)
 *
 * Ein Formular je Merkmal statt einer Tabelle: ein Merkmal hat acht
 * Eigenschaften und eine Werteliste. Der Schluessel bleibt nach dem Anlegen
 * fest, die Art ebenso, sobald jemand einen Wert dazu hat. Loeschen geht nur
 * ohne vergebene Werte - sonst stilllegen.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import {
  FormAuswahl, FormBlatt, FormFeld, FormGruppe, FormSchalter, Knopf, Meldung, useAktion, bestaetige } from "@/components/verwaltung/Formular";
import { useTheme } from "@/lib/theme";
import {
  ARTEN, merkmalLoeschen, merkmalSpeichern, optionenAlsText,
  type MerkmalsArt, type MerkmalsDefinition, type MerkmalsEingabe,
} from "@/lib/verwaltung/system";

export function MerkmalBlatt({
  vorhanden,
  onSchliessen,
  onErfolg,
}: {
  vorhanden?: MerkmalsDefinition;
  onSchliessen: () => void;
  onErfolg: (meldung: string) => void;
}) {
  const { farben } = useTheme();
  const { laeuft, meldung, ausfuehren } = useAktion();
  const [e, setE] = useState<MerkmalsEingabe>({
    code: vorhanden?.code ?? "",
    name: vorhanden?.name ?? "",
    description: vorhanden?.description ?? "",
    value_kind: (vorhanden?.value_kind ?? "list") as MerkmalsArt,
    multiple: vorhanden?.multiple ?? false,
    self_editable: vorhanden?.self_editable ?? false,
    in_application: vorhanden?.in_application ?? false,
    stillgelegt: vorhanden ? !vorhanden.active : false,
    sort_order: String(vorhanden?.sort_order ?? 0),
    optionen: optionenAlsText(vorhanden?.optionen ?? []),
  });
  const setze = <K extends keyof MerkmalsEingabe>(k: K) => (w: MerkmalsEingabe[K]) => setE((v) => ({ ...v, [k]: w }));

  const vergeben = vorhanden?.anzahl_werte ?? 0;
  const artFest = Boolean(vorhanden && vergeben > 0);
  const beschreibung = { fontSize: 12.5, color: farben.muted, fontFamily: "Barlow_400Regular", marginHorizontal: 4 } as const;

  return (
    <FormBlatt
      titel={vorhanden ? vorhanden.name : "Neues Merkmal"}
      kicker={vorhanden ? "Merkmal bearbeiten" : "Merkmal anlegen"}
      onSchliessen={onSchliessen}
    >
      {(schliessen) => (
        <>
          <FormGruppe>
            <FormFeld
              label="Schlüssel"
              wert={e.code}
              onAendern={setze("code")}
              editierbar={!vorhanden}
              gross="none"
              platzhalter="z. B. fotoeinwilligung"
              beschreibung="Kleinbuchstaben, Ziffern und Unterstriche. Bleibt unveränderlich."
            />
            <FormFeld label="Name" wert={e.name} onAendern={setze("name")} />
            {artFest ? (
              <FormFeld
                label="Art"
                wert={ARTEN.find((a) => a.wert === e.value_kind)?.label ?? e.value_kind}
                onAendern={() => {}}
                editierbar={false}
                beschreibung={`Nicht mehr änderbar: ${vergeben} Mitglieder haben einen Wert dazu.`}
              />
            ) : (
              <FormAuswahl label="Art" wert={e.value_kind} optionen={ARTEN} onWahl={setze("value_kind")} />
            )}
            <FormFeld label="Reihenfolge" wert={e.sort_order} onAendern={setze("sort_order")} tastatur="number-pad" />
          </FormGruppe>

          <FormGruppe titel="Wofür wird das gebraucht?">
            <FormFeld
              label="Zweck"
              wert={e.description}
              onAendern={setze("description")}
              mehrzeilig
              platzhalter="Ein Satz zum Zweck – Pflichtangabe"
            />
          </FormGruppe>
          <Text style={beschreibung}>
            Bitte keine Angaben zu Gesundheit, Herkunft, Religion oder politischer Haltung erfassen. Solche Daten
            dürfen nur unter engen Voraussetzungen verarbeitet werden.
          </Text>

          {e.value_kind === "list" && (
            <>
              <FormGruppe titel="Mögliche Werte">
                <FormFeld
                  label="Werte"
                  wert={e.optionen}
                  onAendern={setze("optionen")}
                  mehrzeilig
                  gross="none"
                  platzhalter={"silberne_nadel = Silberne Ehrennadel\ngoldene_nadel = Goldene Ehrennadel"}
                />
              </FormGruppe>
              <Text style={beschreibung}>
                Eine Zeile je Wert. Optional mit Anzeigetext nach dem Gleichheitszeichen. Werte, die bereits
                jemandem zugeordnet sind, werden beim Entfernen stillgelegt statt gelöscht.
              </Text>
            </>
          )}

          <FormGruppe titel="Einstellungen">
            <FormSchalter label="Mehrere Werte gleichzeitig" an={e.multiple} onWechsel={setze("multiple")} />
            <FormSchalter label="Mitglied darf es selbst setzen" an={e.self_editable} onWechsel={setze("self_editable")} />
            <FormSchalter label="Im Mitgliedsantrag abfragen" an={e.in_application} onWechsel={setze("in_application")} />
            <FormSchalter label="Stillgelegt" an={e.stillgelegt} onWechsel={setze("stillgelegt")} />
          </FormGruppe>

          <Meldung meldung={meldung} />
          <Knopf
            gross
            text="Speichern"
            laeuftText="Wird gespeichert…"
            laeuft={laeuft}
            onPress={() =>
              void ausfuehren(
                () => merkmalSpeichern(e),
                (r) => {
                  onErfolg(r.meldung);
                  schliessen();
                },
              )
            }
          />

          {vorhanden && (
            <View style={{ gap: 8 }}>
              {vergeben > 0 ? (
                <Text style={beschreibung}>
                  Löschen nicht möglich: {vergeben} Mitglieder haben einen Wert dazu. Stattdessen stilllegen.
                </Text>
              ) : (
                <Knopf
                  art="leise"
                  text="Merkmal löschen"
                  deaktiviert={laeuft}
                  onPress={() =>
                    bestaetige(
                      "Merkmal löschen?",
                      `„${vorhanden.name}" (${vorhanden.code}) wird endgültig gelöscht. Bisher hat niemand einen Wert dazu.`,
                      "Wirklich löschen",
                      () =>
                        void ausfuehren(
                          () => merkmalLoeschen(vorhanden.code),
                          (r) => {
                            onErfolg(r.meldung);
                            schliessen();
                          },
                        ),
                    )
                  }
                />
              )}
            </View>
          )}
        </>
      )}
    </FormBlatt>
  );
}
