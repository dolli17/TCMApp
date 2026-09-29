/**
 * Die Mitgliederliste (Entwurf AdminMitglieder, docs/design/clubhaus)
 *
 * Wie apps/web/src/app/admin/mitglieder/page.tsx in der Telefonansicht:
 * Segmente zu den Unterseiten, Suche, Chips nach Mitgliedschaft und Bestand,
 * darunter die Liste mit genau einem Hinweis je Zeile und Blaettern zu 50.
 * Die Tabelle des Webs wird zur ListenGruppe, das Anlegefenster zum Blatt.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { Bildschirm } from "@/components/Bildschirm";
import { Chipwahl, Knopf } from "@/components/verwaltung/Formular";
import { Abschnitt, LeereZeile, ListenGruppe, Listenzeile } from "@/components/verwaltung/Liste";
import { VerwaltungsKopf } from "@/components/verwaltung/VerwaltungsKopf";
import { MitgliedAnlegenBlatt } from "@/components/verwaltung/mitglieder/MitgliedAnlegenBlatt";
import { MitgliederSegmente } from "@/components/verwaltung/mitglieder/MitgliederSegmente";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";
import {
  ARTEN, BESTAND, ladeMitgliederliste, nachArt, zeilenHinweis, type Art, type Bestand,
} from "@/lib/verwaltung/mitglieder";

const JE_SEITE = 50;

export default function MitgliederSeite() {
  const { farben, stil } = useTheme();
  const params = useLocalSearchParams<{ filter?: string; art?: string; q?: string }>();

  const [bestand, setBestand] = useState<Bestand>(
    BESTAND.find((b) => b.wert === params.filter)?.wert ?? "aktiv",
  );
  const [art, setArt] = useState<Art>(ARTEN.find((a) => a.wert === params.art)?.wert ?? "");
  const [eingabe, setEingabe] = useState(params.q ?? "");
  const [suche, setSuche] = useState(params.q ?? "");
  const [seite, setSeite] = useState(1);
  const [anlegen, setAnlegen] = useState(false);

  // Die Suche geht erst nach einer kurzen Pause an die Datenbank, nicht bei
  // jedem Tastendruck. Wie im Web wird dort gesucht, nicht im Geraet.
  useEffect(() => {
    const t = setTimeout(() => setSuche(eingabe.trim().slice(0, 60)), 350);
    return () => clearTimeout(t);
  }, [eingabe]);

  const laden = useCallback(() => ladeMitgliederliste(bestand, suche), [bestand, suche]);
  const zustand = useLaden(laden);
  const holen = useRef(zustand.erneutHolen);
  holen.current = zustand.erneutHolen;

  // Filter oder Suche gewechselt: neu laden, zurueck auf Seite 1.
  const erstesLaden = useRef(true);
  useEffect(() => {
    if (erstesLaden.current) {
      erstesLaden.current = false;
      return;
    }
    setSeite(1);
    void holen.current();
  }, [bestand, suche]);

  // Nach der Rueckkehr von einem Mitglied stimmt die Liste sonst nicht mehr.
  const erstesMal = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (erstesMal.current) {
        erstesMal.current = false;
        return;
      }
      void holen.current();
    }, []),
  );

  const d = zustand.daten;
  const gefiltert = d ? nachArt(d.zeilen, art) : [];
  const seiten = Math.max(1, Math.ceil(gefiltert.length / JE_SEITE));
  const seiteNr = Math.min(seiten, Math.max(1, seite));
  const sichtbar = gefiltert.slice((seiteNr - 1) * JE_SEITE, seiteNr * JE_SEITE);

  return (
    <>
      <Bildschirm
        laedt={zustand.laedt}
        aktualisiert={zustand.aktualisiert}
        onAktualisieren={zustand.neuLaden}
        fehler={zustand.fehler}
      >
        <VerwaltungsKopf aktion={{ text: "Mitglied anlegen", onPress: () => setAnlegen(true) }}>
          <MitgliederSegmente aktiv="/verwaltung/mitglieder" antraege={d?.offeneAntraege ?? null} />
        </VerwaltungsKopf>

        {/* --- Suche und Filter ------------------------------------------- */}
        <View
          style={{
            flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, minHeight: 48,
            borderRadius: 16, backgroundColor: farben.surf2,
          }}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" fill="none" stroke={farben.muted} strokeWidth={2} strokeLinecap="round" />
          </Svg>
          <TextInput
            value={eingabe}
            onChangeText={setEingabe}
            placeholder="Name"
            placeholderTextColor={farben.muted}
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="search"
            clearButtonMode="while-editing"
            onSubmitEditing={() => setSuche(eingabe.trim().slice(0, 60))}
            accessibilityLabel="Mitglieder durchsuchen"
            accessibilityRole="search"
            style={{ flex: 1, fontSize: 16, color: farben.ink, fontFamily: "Barlow_400Regular", paddingVertical: 12 }}
          />
        </View>
        <Chipwahl
          optionen={ARTEN.map((a) => ({ wert: a.wert, label: a.label }))}
          wert={art}
          onWahl={(w) => {
            setArt(w);
            setSeite(1);
          }}
        />
        <Chipwahl
          label="Bestand"
          optionen={BESTAND.map((b) => ({ wert: b.wert, label: b.label }))}
          wert={bestand}
          onWahl={setBestand}
        />

        {d?.nebenFehler && (
          <Text style={stil.hinweisFehler}>
            Mitgliedschaft, Mandat oder offene Beträge konnten nicht vollständig geladen werden.
          </Text>
        )}

        {/* --- Liste -------------------------------------------------------- */}
        {d && (
          <Abschnitt>
            <Text style={[stil.kicker, { marginHorizontal: 4 }]}>{gefiltert.length} Mitglieder · A–Z</Text>
            <ListenGruppe>
              {sichtbar.length === 0 ? (
                <LeereZeile text="Keine Mitglieder gefunden." />
              ) : (
                sichtbar.map((m) => {
                  const h = zeilenHinweis(m, bestand);
                  return (
                    <Listenzeile
                      key={m.id}
                      href={`/verwaltung/mitglieder/${m.id}`}
                      avatar={{ kurz: (m.first_name[0] ?? "") + (m.last_name[0] ?? ""), id: m.id }}
                      titel={`${m.last_name}, ${m.first_name}`}
                      kontext={
                        [
                          m.beitragsart,
                          m.mannschaft,
                          m.status === "archived" ? "archiviert" : m.status === "inactive" ? "inaktiv" : null,
                          m.is_admin ? "Admin" : null,
                          m.is_trainer ? "Trainer" : null,
                          m.is_paid_by ? "fremdgezahlt" : null,
                        ].filter(Boolean).join(" · ") || "ohne Beitragsart"
                      }
                      hinweis={h?.text}
                      hinweisTon={h?.ton}
                      // Die E-Mail macht Namensgleiche unterscheidbar, auch vorgelesen.
                      label={`${m.first_name} ${m.last_name}${m.email ? `, ${m.email}` : ""}${h ? `, ${h.text}` : ""}`}
                    />
                  );
                })
              )}
            </ListenGruppe>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <Text style={stil.leise}>
                {gefiltert.length} Mitglieder · {sichtbar.length} angezeigt
              </Text>
              {seiten > 1 && (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Knopf art="leise" klein text="Zurück" deaktiviert={seiteNr <= 1} onPress={() => setSeite(seiteNr - 1)} />
                  <Knopf art="leise" klein text="Weiter" deaktiviert={seiteNr >= seiten} onPress={() => setSeite(seiteNr + 1)} />
                </View>
              )}
            </View>
          </Abschnitt>
        )}
      </Bildschirm>

      {anlegen && <MitgliedAnlegenBlatt onSchliessen={() => setAnlegen(false)} />}
    </>
  );
}
