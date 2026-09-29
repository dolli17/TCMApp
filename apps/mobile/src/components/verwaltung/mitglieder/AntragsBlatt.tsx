/**
 * Einen Antrag ansehen und entscheiden (Nachbau von
 * apps/web/src/components/AntragsFenster.tsx)
 *
 * Drei Wege hinaus: annehmen, ablehnen, als Spam kennzeichnen. Nach der
 * Aufnahme bleibt das Blatt offen: in der Meldung steht die vergebene
 * Nummer und ob die Einladung rausging - wer das wegblendet, bevor es
 * jemand lesen konnte, hat nichts gewonnen.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { formatCents } from "@tcm/core";
import {
  FormAuswahl, FormBlatt, FormFeld, FormGruppe, FormSchalter, Knopf, Meldung, Wertzeile, useAktion,
} from "@/components/verwaltung/Formular";
import { datum } from "@/components/verwaltung/mitglieder/optionen";
import { useTheme } from "@/lib/theme";
import { heuteInBerlin, isoZuDeutsch } from "@/lib/verwaltung/gemeinsam";
import {
  antragAblehnen, antragAlsSpam, antragAnnehmen, type Antrag, type Beitragsart,
} from "@/lib/verwaltung/mitglieder";

function alter(geburtstag: string): number {
  return Math.floor((Date.now() - new Date(geburtstag).getTime()) / 31_557_600_000);
}

export function AntragsBlatt({
  antrag,
  beitragsarten,
  onSchliessen,
  onErledigt,
}: {
  antrag: Antrag;
  beitragsarten: Beitragsart[];
  onSchliessen: () => void;
  /** Nach Ablehnen oder Spam: Liste neu laden, Meldung auf der Seite zeigen. */
  onErledigt: (meldung: string) => void;
}) {
  const { stil, farben } = useTheme();
  const { laeuft, meldung, ausfuehren } = useAktion();
  const [ablehnen, setAblehnen] = useState(false);
  const [grund, setGrund] = useState("");
  const [aufgenommen, setAufgenommen] = useState<string | null>(null);
  const [f, setF] = useState({
    number: "",
    started_on: isoZuDeutsch(heuteInBerlin()),
    fee_type: antrag.desired_fee_type_id ?? "",
    einladen: true,
  });

  const jahre = alter(antrag.birthday);
  const einwilligungen = Object.entries(antrag.attribute_choices ?? {}).filter(([, v]) => v).map(([k]) => k);

  return (
    <FormBlatt
      titel={`${antrag.last_name}, ${antrag.first_name}`}
      unterzeile={`Eingegangen am ${datum(antrag.submitted_at)} · ${jahre} Jahre${jahre < 18 ? " (minderjährig)" : ""}`}
      onSchliessen={onSchliessen}
    >
      {(zu) => (
        <>
          <Meldung meldung={meldung} />
          {antrag.possible_duplicate && (
            <Text style={stil.hinweisFehler}>
              Zu dieser E-Mail-Adresse gibt es bereits ein Mitglied. Bitte vor der Aufnahme prüfen, ob es sich um
              dieselbe Person handelt.
            </Text>
          )}

          <View style={{ backgroundColor: farben.surf2, borderRadius: 18, padding: 14 }}>
            <Wertzeile name="E-Mail" wert={antrag.email} />
            <Wertzeile name="Telefon" wert={antrag.mobile ?? antrag.phone ?? "—"} />
            <Wertzeile name="Geburtstag" wert={datum(antrag.birthday)} />
            <Wertzeile
              name="Anschrift"
              wert={[antrag.street, [antrag.postcode, antrag.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"}
            />
            {(antrag.guardian_name || antrag.guardian_email) && (
              <Wertzeile
                name="Erziehungsberechtigte"
                wert={[antrag.guardian_name ?? "—", antrag.guardian_email].filter(Boolean).join(" · ")}
              />
            )}
            {antrag.emergency_contact_name && (
              <Wertzeile
                name="Notfallkontakt"
                wert={`${antrag.emergency_contact_name} · ${antrag.emergency_contact_phone ?? "—"}`}
              />
            )}
            <Wertzeile name="Einwilligungen" wert={einwilligungen.length > 0 ? einwilligungen.join(", ") : "keine"} />
            {antrag.message && <Wertzeile name="Nachricht" wert={antrag.message} />}
          </View>

          {aufgenommen ? (
            <View style={{ gap: 8 }}>
              <Knopf
                art="gold"
                gross
                text="Zum neuen Mitglied"
                onPress={() => {
                  zu();
                  router.push(`/verwaltung/mitglieder/${aufgenommen}` as Href);
                }}
              />
              <Knopf art="leise" text="Schließen" onPress={zu} />
            </View>
          ) : !ablehnen ? (
            <>
              <FormGruppe titel="Aufnehmen">
                <FormFeld label="Nummer" wert={f.number} onAendern={(w) => setF({ ...f, number: w })} platzhalter="automatisch" gross="none" />
                <FormFeld
                  label="Eintritt"
                  wert={f.started_on}
                  onAendern={(w) => setF({ ...f, started_on: w })}
                  platzhalter="TT.MM.JJJJ"
                  tastatur="numbers-and-punctuation"
                />
                <FormAuswahl
                  label="Beitragsart"
                  wert={f.fee_type}
                  leer="später festlegen"
                  optionen={[
                    { wert: "", label: "später festlegen" },
                    ...beitragsarten.map((b) => ({
                      wert: b.id,
                      label: `${b.name}${b.preis_cents !== null ? ` – ${formatCents(b.preis_cents)}` : ""}`,
                    })),
                  ]}
                  onWahl={(w) => setF({ ...f, fee_type: w })}
                />
                <FormSchalter
                  label="Einladung zur App gleich mitschicken"
                  an={f.einladen}
                  onWechsel={(an) => setF({ ...f, einladen: an })}
                />
              </FormGruppe>
              {antrag.desired_fee_type_id && <Text style={stil.leise}>Vorbelegt mit dem Wunsch aus dem Antrag.</Text>}
              <Knopf
                art="gold"
                gross
                text="Aufnehmen"
                laeuftText="Wird aufgenommen…"
                laeuft={laeuft}
                onPress={() =>
                  void ausfuehren(
                    () => antragAnnehmen(antrag.id, f),
                    (e) => setAufgenommen(e.daten ?? null),
                  )
                }
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Knopf art="leise" text="Ablehnen" deaktiviert={laeuft} onPress={() => setAblehnen(true)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Knopf
                    art="leise"
                    text="Spam"
                    deaktiviert={laeuft}
                    onPress={() =>
                      void ausfuehren(
                        () => antragAlsSpam(antrag.id),
                        (e) => {
                          zu();
                          onErledigt(e.meldung);
                        },
                      )
                    }
                  />
                </View>
              </View>
            </>
          ) : (
            <>
              <FormGruppe titel="Ablehnen">
                <FormFeld
                  label="Grund"
                  wert={grund}
                  onAendern={setGrund}
                  platzhalter="nur für die Akte"
                  beschreibung="Es geht keine automatische Absage raus – die schreibt der Vorstand persönlich."
                />
              </FormGruppe>
              <Knopf
                art="gefahr"
                gross
                text="Wirklich ablehnen"
                laeuftText="Wird abgelehnt…"
                laeuft={laeuft}
                onPress={() =>
                  void ausfuehren(
                    () => antragAblehnen(antrag.id, grund),
                    (e) => {
                      zu();
                      onErledigt(e.meldung);
                    },
                  )
                }
              />
              <Knopf art="leise" text="Zurück" deaktiviert={laeuft} onPress={() => setAblehnen(false)} />
            </>
          )}
        </>
      )}
    </FormBlatt>
  );
}
