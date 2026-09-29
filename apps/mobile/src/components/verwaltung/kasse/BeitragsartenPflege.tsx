/**
 * Beitragsarten und ihre Preise (Nachbau von
 * apps/web/src/components/BeitragsartenPflege.tsx).
 *
 * Der Preis des Folgejahrs steht mit in der Zeile: eine beschlossene Erhoehung
 * waere sonst bis zum Jahreswechsel unsichtbar und wuerde ein zweites Mal
 * eingetragen. Name, Preis und Stilllegen stehen im Blatt (Regeln 4 und 5).
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { formatCents, parseAmountToCents } from "@tcm/core";
import {
  FormBlatt, FormFeld, FormGruppe, Knopf, Meldung, useAktion,
} from "@/components/verwaltung/Formular";
import { Abschnitt, Gruppenkopf, ListenGruppe, Listenzeile, Statusmarke } from "@/components/verwaltung/Liste";
import { Unterzeile } from "@/components/verwaltung/kasse/Teile";
import { useTheme } from "@/lib/theme";
import {
  beitragsartSpeichern, beitragsartUmschalten, beitragspreisSetzen, type BeitragsartZeile,
} from "@/lib/verwaltung/kasse";

const LEER = { id: null as string | null, code: "", name: "", beschreibung: "" };

const KEIN_BETRAG = { ok: false, meldung: "Das ist kein gültiger Betrag, z. B. 120,00." };

function inCents(eingabe: string): number | null {
  try {
    return parseAmountToCents(eingabe);
  } catch {
    return null;
  }
}

export function BeitragsartenPflege({
  arten,
  jahr,
  onGeaendert,
}: {
  arten: BeitragsartZeile[];
  jahr: number;
  onGeaendert: () => void | Promise<void>;
}) {
  const { farben, stil } = useTheme();
  const { laeuft, meldung, setMeldung, ausfuehren } = useAktion();
  const [form, setForm] = useState(LEER);
  const [preis, setPreis] = useState("");
  const [preisJahr, setPreisJahr] = useState(String(jahr + 1));
  const [blattOffen, setBlattOffen] = useState(false);

  const neu = form.id === null;
  const bearbeitet = arten.find((a) => a.id === form.id) ?? null;

  function oeffnen(a: BeitragsartZeile | null) {
    setForm(a ? { id: a.id, code: a.code, name: a.name, beschreibung: a.description ?? "" } : LEER);
    setPreis("");
    setPreisJahr(String(jahr + 1));
    setMeldung(null);
    setBlattOffen(true);
  }

  function nachErfolg(schliessen: () => void) {
    return async () => {
      schliessen();
      await onGeaendert();
    };
  }

  return (
    <Abschnitt>
      <Gruppenkopf titel="Arten und Preise" />
      <Unterzeile>
        Der Code bleibt nach dem Anlegen fest – er steht in den Zuordnungen der Mitglieder. Ein
        Preis lässt sich nur für Jahre setzen, für die noch keine Forderungen erzeugt wurden.
      </Unterzeile>

      {!blattOffen && <Meldung meldung={meldung} />}

      <ListenGruppe>
        {arten.map((a) => (
          <Listenzeile
            key={a.id}
            titel={a.name}
            kontext={[
              a.code,
              `${a.mitglieder} Mitglieder`,
              a.soll_stunden !== null ? `${a.soll_stunden} h Arbeitsdienst` : null,
              a.naechster_preis_cents !== null
                ? `${formatCents(a.naechster_preis_cents)} ab ${a.naechster_preis_ab_jahr}`
                : null,
            ].filter(Boolean).join(" · ")}
            neben={
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={{ fontSize: 15, fontFamily: "Barlow_700Bold", color: farben.ink, fontVariant: ["tabular-nums"] }}>
                  {a.preis_cents === null ? "—" : formatCents(a.preis_cents)}
                </Text>
                {!a.active && <Statusmarke text="still" />}
              </View>
            }
            onPress={() => oeffnen(a)}
          />
        ))}
        <Listenzeile titel="Neue Beitragsart" onPress={() => oeffnen(null)} />
      </ListenGruppe>

      {blattOffen && (
        <FormBlatt
          titel={bearbeitet ? bearbeitet.name : "Neue Beitragsart"}
          unterzeile={bearbeitet ? `Code ${bearbeitet.code}` : undefined}
          onSchliessen={() => setBlattOffen(false)}
        >
          {(schliessen) => (
            <>
              <FormGruppe>
                <FormFeld
                  label="Code"
                  wert={form.code}
                  editierbar={neu}
                  platzhalter="erwachsene"
                  gross="none"
                  onAendern={(w) => setForm({ ...form, code: w })}
                />
                <FormFeld
                  label="Name"
                  wert={form.name}
                  platzhalter="Erwachsene"
                  onAendern={(w) => setForm({ ...form, name: w })}
                />
                <FormFeld
                  label="Beschreibung"
                  wert={form.beschreibung}
                  onAendern={(w) => setForm({ ...form, beschreibung: w })}
                />
              </FormGruppe>

              <Meldung meldung={meldung} />

              <Knopf
                art="gold"
                gross
                text={neu ? "Beitragsart anlegen" : "Änderungen speichern"}
                laeuft={laeuft}
                deaktiviert={form.name.trim() === "" || (neu && form.code.trim() === "")}
                onPress={() => void ausfuehren(() => beitragsartSpeichern(form), nachErfolg(schliessen))}
              />

              {bearbeitet && (
                <>
                  <Text accessibilityRole="header" style={[stil.abschnitt, { marginTop: 8 }]}>Preis</Text>
                  <FormGruppe>
                    <FormFeld
                      label="Gilt ab Jahr"
                      wert={preisJahr}
                      tastatur="number-pad"
                      onAendern={setPreisJahr}
                    />
                    <FormFeld
                      label="Jahresbeitrag"
                      wert={preis}
                      tastatur="decimal-pad"
                      platzhalter="120,00"
                      onAendern={setPreis}
                    />
                  </FormGruppe>
                  <Knopf
                    art="leise"
                    text="Preis setzen"
                    laeuft={laeuft}
                    deaktiviert={preis.trim() === ""}
                    onPress={() => {
                      const cents = inCents(preis);
                      const j = Number(preisJahr);
                      if (cents === null) {
                        setMeldung({ ok: false, text: KEIN_BETRAG.meldung });
                        return;
                      }
                      // Wie im Web-Feld (min jahr, max jahr + 5)
                      if (!Number.isInteger(j) || j < jahr || j > jahr + 5) {
                        setMeldung({ ok: false, text: `Das Jahr muss zwischen ${jahr} und ${jahr + 5} liegen.` });
                        return;
                      }
                      void ausfuehren(
                        () => beitragspreisSetzen({ artId: bearbeitet.id, jahr: j, betragCents: cents }),
                        nachErfolg(schliessen),
                      );
                    }}
                  />

                  <ListenGruppe>
                    <Listenzeile
                      titel={bearbeitet.active ? "Stilllegen" : "Wieder anbieten"}
                      gefahr={bearbeitet.active}
                      pfeil={false}
                      onPress={
                        laeuft
                          ? undefined
                          : () => void ausfuehren(
                              () => beitragsartUmschalten(bearbeitet.id, !bearbeitet.active),
                              nachErfolg(schliessen),
                            )
                      }
                    />
                  </ListenGruppe>
                </>
              )}
            </>
          )}
        </FormBlatt>
      )}
    </Abschnitt>
  );
}
