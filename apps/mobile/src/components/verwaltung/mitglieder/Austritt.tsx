/**
 * Bereich Austritt & Datensatz (Nachbau von MitgliedschaftsKarte und
 * GefahrenzoneKarte aus apps/web/src/components)
 *
 * Oben die Mitgliedschaft: beenden oder wieder aufnehmen. Darunter die drei
 * Wege, einen Datensatz zu beenden - vom schonendsten zum endgueltigen, mit
 * je einem Satz, wann welcher der richtige ist. Ohne diese Einordnung greift
 * man im Zweifel zum Loeschen, und das ist fast immer falsch.
 */

import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { router, type Href } from "expo-router";
import {
  FormBlatt, FormFeld, FormGruppe, Folgen, Karte, Knopf, Meldung, useAktion,
} from "@/components/verwaltung/Formular";
import { Statusmarke } from "@/components/verwaltung/Liste";
import { datum } from "@/components/verwaltung/mitglieder/optionen";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";
import { heuteInBerlin, isoZuDeutsch } from "@/lib/verwaltung/gemeinsam";
import {
  ladeLoeschfolgen, mitgliedAnonymisieren, mitgliedArchivieren, mitgliedLoeschen, mitgliedschaftBeenden,
  mitgliedschaftWiederaufnehmen, type MitgliedDaten,
} from "@/lib/verwaltung/mitglieder";

export function Austritt({ d, onGeaendert }: { d: MitgliedDaten; onGeaendert: () => Promise<void> }) {
  return (
    <>
      <MitgliedschaftsKarte d={d} onGeaendert={onGeaendert} />
      <Gefahrenzone d={d} onGeaendert={onGeaendert} />
    </>
  );
}

function MitgliedschaftsKarte({ d, onGeaendert }: { d: MitgliedDaten; onGeaendert: () => Promise<void> }) {
  const { stil } = useTheme();
  const { laeuft, meldung, setMeldung, ausfuehren } = useAktion();
  const [beenden, setBeenden] = useState(false);
  const archiviert = d.m.status === "archived";
  const letzte = d.mitgliedschaften[0] ?? null;

  return (
    <>
      <Karte titel="Mitgliedschaft">
        <Meldung meldung={meldung} />
        {d.laufend ? (
          <>
            <Text style={[stil.leise, { fontSize: 14 }]}>
              Nummer {d.laufend.number}, Eintritt {datum(d.laufend.started_on)}.
            </Text>
            <Knopf art="leise" text="Mitgliedschaft beenden" deaktiviert={laeuft || archiviert} onPress={() => setBeenden(true)} />
          </>
        ) : (
          <>
            <Text style={[stil.leise, { fontSize: 14 }]}>
              {letzte
                ? `Keine laufende Mitgliedschaft. Zuletzt Nummer ${letzte.number}, beendet ${datum(letzte.ended_on)}${
                    letzte.cancellation_reason ? ` (${letzte.cancellation_reason})` : ""
                  }.`
                : "Keine Mitgliedschaft erfasst."}
            </Text>
            <Knopf
              text="Wieder aufnehmen"
              laeuftText="Wird aufgenommen…"
              laeuft={laeuft}
              deaktiviert={archiviert}
              onPress={() => void ausfuehren(() => mitgliedschaftWiederaufnehmen(d.m.id), onGeaendert)}
            />
            {archiviert && <Text style={stil.leise}>Archivierte Mitglieder müssen zuerst reaktiviert werden.</Text>}
          </>
        )}
      </Karte>

      {beenden && <BeendenBlatt mitgliedId={d.m.id} onSchliessen={() => setBeenden(false)} onErledigt={async (t) => {
        setMeldung({ ok: true, text: t });
        await onGeaendert();
      }} />}
    </>
  );
}

function BeendenBlatt(props: { mitgliedId: string; onSchliessen: () => void; onErledigt: (t: string) => Promise<void> }) {
  const [ende, setEnde] = useState(isoZuDeutsch(heuteInBerlin()));
  const [grund, setGrund] = useState("");
  const { laeuft, meldung, ausfuehren } = useAktion();
  return (
    <FormBlatt titel="Mitgliedschaft beenden" onSchliessen={props.onSchliessen}>
      {(zu) => (
        <>
          <Meldung meldung={meldung} />
          <FormGruppe>
            <FormFeld label="Austritt zum" wert={ende} onAendern={setEnde} platzhalter="TT.MM.JJJJ" tastatur="numbers-and-punctuation" />
            <FormFeld label="Grund" wert={grund} onAendern={setGrund} platzhalter="z. B. Umzug" />
          </FormGruppe>
          <Folgen>Offene Forderungen bleiben bestehen – ein Austritt löscht keine Schulden.</Folgen>
          <Knopf
            art="gefahr"
            gross
            text="Wirklich beenden"
            laeuftText="Wird beendet…"
            laeuft={laeuft}
            onPress={() =>
              void ausfuehren(
                () => mitgliedschaftBeenden(props.mitgliedId, ende, grund),
                async (e) => {
                  zu();
                  await props.onErledigt(e.meldung);
                },
              )
            }
          />
        </>
      )}
    </FormBlatt>
  );
}

type Weg = "archivieren" | "anonymisieren";

function Gefahrenzone({ d, onGeaendert }: { d: MitgliedDaten; onGeaendert: () => Promise<void> }) {
  const { farben, stil } = useTheme();
  const folgen = useLaden(() => ladeLoeschfolgen(d.m.id));
  const { laeuft, meldung, setMeldung, ausfuehren } = useAktion();
  const [weg, setWeg] = useState<Weg | null>(null);
  const [tippName, setTippName] = useState("");
  const archiviert = d.m.status === "archived";
  const nachname = d.m.last_name;
  const nameStimmt = tippName.trim().toLowerCase() === nachname.trim().toLowerCase();
  const f = folgen.daten;
  const titel = { fontSize: 15.5, fontFamily: "Barlow_700Bold", color: farben.ink } as const;
  const block = { gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: farben.line } as const;

  if (d.selbst) {
    return (
      <Karte titel="Datensatz beenden">
        <Text style={[stil.text, { fontSize: 14 }]}>
          Das ist dein eigener Datensatz. Archivieren, anonymisieren und löschen sind für die eigene Person gesperrt
          – sonst sperrt man sich versehentlich selbst aus.
        </Text>
      </Karte>
    );
  }

  return (
    <>
      <Karte titel="Datensatz beenden" unterzeile="Drei Wege, vom schonendsten zum endgültigen.">
        <Meldung meldung={meldung} />

        {/* 1. Archivieren */}
        <View style={block}>
          <Text style={titel}>Archivieren</Text>
          <Text style={stil.leise}>
            Der Regelfall beim Austritt. Alle Daten bleiben erhalten, das Mitglied verschwindet aus den laufenden
            Listen. Künftige Buchungen werden abgesagt, Mandate widerrufen, offene Forderungen bleiben bestehen.
          </Text>
          {archiviert ? (
            <Statusmarke text="Bereits archiviert" />
          ) : (
            <View style={{ alignSelf: "flex-start" }}>
              <Knopf art="leise" klein text="Archivieren" deaktiviert={laeuft} onPress={() => setWeg("archivieren")} />
            </View>
          )}
        </View>

        {/* 2. Anonymisieren */}
        <View style={block}>
          <Text style={titel}>Anonymisieren</Text>
          <Text style={stil.leise}>
            Für einen Löschwunsch nach DSGVO, wenn die Buchhaltung die Zahlen zehn Jahre aufbewahren muss. Name,
            Anschrift, Geburtsdatum, Kontakt und Bankdaten werden entfernt; Forderungen und Buchungen bleiben ohne
            Klarnamen erhalten. Nicht umkehrbar.
          </Text>
          <View style={{ alignSelf: "flex-start" }}>
            <Knopf art="leise" klein text="Anonymisieren" deaktiviert={laeuft} onPress={() => setWeg("anonymisieren")} />
          </View>
        </View>

        {/* 3. Loeschen */}
        <View style={block}>
          <Text style={titel}>Endgültig löschen</Text>
          <Text style={stil.leise}>
            Nur für Fehleingaben, Dubletten und Testdatensätze. Der Datensatz verschwindet samt Mitgliedschaft,
            Rollen, Beitragszuordnung und Bankdaten. Im Änderungsprotokoll bleibt vermerkt, dass und durch wen
            gelöscht wurde.
          </Text>
          {!f ? null : !f.can_delete ? (
            <Text style={stil.hinweisFehler}>
              Löschen ist hier nicht möglich. Zu diesem Mitglied gehören {f.charges} Forderungen, {f.drink_purchases}{" "}
              Getränkebuchungen und {f.bookings} Platzbuchungen. Ein Löschen würde die Buchhaltung zerreißen – bitte
              archivieren oder anonymisieren.
            </Text>
          ) : (
            <>
              <Text style={[stil.text, { fontSize: 14 }]}>
                Zur Bestätigung den Nachnamen eingeben: <Text style={{ fontFamily: "Barlow_700Bold" }}>{nachname}</Text>
              </Text>
              <TextInput
                value={tippName}
                onChangeText={setTippName}
                placeholder={nachname}
                placeholderTextColor={farben.muted}
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel="Nachname zur Bestätigung"
                style={stil.feld}
              />
              <Knopf
                art="gefahr"
                text="Endgültig löschen"
                laeuftText="Wird gelöscht…"
                laeuft={laeuft}
                deaktiviert={!nameStimmt}
                onPress={() =>
                  void ausfuehren(
                    () => mitgliedLoeschen(d.m.id, tippName),
                    // Die Seite, auf der wir stehen, gibt es nicht mehr.
                    () => router.dismissTo("/verwaltung/mitglieder" as Href),
                  )
                }
              />
            </>
          )}
        </View>
      </Karte>

      {weg && (
        <WegBlatt
          weg={weg}
          offeneForderungen={f?.charges ?? 0}
          onSchliessen={() => setWeg(null)}
          onBestaetigt={(grund, zu) =>
            void ausfuehren(
              () =>
                weg === "archivieren"
                  ? mitgliedArchivieren(d.m.id, (f?.charges ?? 0) > 0, grund)
                  : mitgliedAnonymisieren(d.m.id, grund),
              async (e) => {
                zu();
                setMeldung({ ok: true, text: e.meldung });
                await Promise.all([onGeaendert(), folgen.erneutHolen()]);
              },
            )
          }
          laeuft={laeuft}
          meldung={meldung}
        />
      )}
    </>
  );
}

function WegBlatt(props: {
  weg: Weg;
  offeneForderungen: number;
  onSchliessen: () => void;
  onBestaetigt: (grund: string, zu: () => void) => void;
  laeuft: boolean;
  meldung: { ok: boolean; text: string } | null;
}) {
  const { stil } = useTheme();
  const [grund, setGrund] = useState("");
  const archiv = props.weg === "archivieren";
  return (
    <FormBlatt titel={archiv ? "Archivieren" : "Anonymisieren"} onSchliessen={props.onSchliessen}>
      {(zu) => (
        <>
          {props.meldung && !props.meldung.ok && <Meldung meldung={props.meldung} />}
          <FormGruppe>
            <FormFeld
              label="Grund"
              wert={grund}
              onAendern={setGrund}
              platzhalter={archiv ? "z. B. Austritt zum Jahresende" : "z. B. Löschersuchen vom 06.08.2026"}
            />
          </FormGruppe>
          {archiv && props.offeneForderungen > 0 && (
            <Text style={stil.hinweisFehler}>
              {props.offeneForderungen} Forderungen sind noch offen. Sie bleiben bestehen und müssen weiterhin
              eingezogen werden.
            </Text>
          )}
          {!archiv && (
            <Folgen>
              Name, Anschrift, Geburtsdatum, Kontakt und Bankdaten werden entfernt. Nicht umkehrbar.
            </Folgen>
          )}
          <Knopf
            art="gefahr"
            gross
            text={archiv ? "Wirklich archivieren" : "Wirklich anonymisieren"}
            laeuftText={archiv ? "Wird archiviert…" : "Wird anonymisiert…"}
            laeuft={props.laeuft}
            onPress={() => props.onBestaetigt(grund, zu)}
          />
        </>
      )}
    </FormBlatt>
  );
}
