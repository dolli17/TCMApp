/**
 * Die Benachrichtigungsglocke
 *
 * Rund, 44 Pixel, im grossen Kopf jedes Tabs neben dem Avatar. Der Zaehler
 * wird bei jedem Fokuswechsel neu geholt: sonst bliebe die rote Marke stehen,
 * nachdem die Nachrichten gelesen wurden.
 *
 * Der Entwurf zeigt nur einen Punkt; die Zahl bleibt, weil sie im Web wie in
 * der App schon vorher da war und niemandem etwas wegnehmen soll.
 *
 * Ein Tippen oeffnet die Nachrichten als Blatt. Gelesen markiert wird beim
 * Oeffnen wie bisher auf der Seite /nachrichten; die Hervorhebung bleibt,
 * bis "Alle als gelesen" sie wegnimmt.
 */

import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Blatt, BlattKopf } from "@/components/Blatt";
import { AlleGelesenKnopf, NachrichtenListe, type Nachricht } from "@/components/NachrichtenListe";
import { Symbol } from "@/components/Symbol";
import { ladeBenachrichtigungen, markiereBenachrichtigungenGelesen, zaehleUngelesen } from "@/lib/daten";
import { useTheme } from "@/lib/theme";

export function Glocke() {
  const { farben } = useTheme();
  const groesse = 44;
  const [ungelesen, setUngelesen] = useState(0);

  const zaehlen = useCallback(() => {
    zaehleUngelesen()
      .then(setUngelesen)
      .catch(() => setUngelesen(0));
  }, []);

  useEffect(zaehlen, [zaehlen]);
  useFocusEffect(zaehlen);

  const [offen, setOffen] = useState(false);
  const [liste, setListe] = useState<Nachricht[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [alleGesehen, setAlleGesehen] = useState(false);

  function oeffnen() {
    setOffen(true);
    setListe(null);
    setFehler(null);
    setAlleGesehen(false);
    ladeBenachrichtigungen()
      .then((daten) => {
        setListe(daten);
        if (daten.some((n) => n.read_at === null)) {
          // Ohne await: die Liste steht sofort, das Abhaken laeuft nach.
          void markiereBenachrichtigungenGelesen().then(() => setUngelesen(0)).catch(() => {});
        }
      })
      .catch((e: unknown) => setFehler(e instanceof Error ? e.message : "Die Nachrichten konnten nicht geladen werden."));
  }

  return (
    <>
      <Pressable
        onPress={oeffnen}
        accessibilityRole="button"
        accessibilityLabel={
          ungelesen > 0 ? `Benachrichtigungen, ${ungelesen} ungelesen` : "Benachrichtigungen"
        }
        style={{
          width: groesse, height: groesse, borderRadius: groesse / 2,
          borderWidth: 1, borderColor: farben.line, backgroundColor: farben.surf2,
          alignItems: "center", justifyContent: "center",
        }}
      >
        <Symbol name="glocke" farbe={farben.ink} groesse={21} />
        {ungelesen > 0 && (
          <View
            style={{
              position: "absolute", top: -3, right: -3,
              minWidth: 17, height: 17, borderRadius: 99,
              backgroundColor: farben.red,
              alignItems: "center", justifyContent: "center",
              paddingHorizontal: 4,
            }}
          >
            <Text
              style={{
                color: "#fff", fontSize: 10.5,
                fontFamily: "Barlow_700Bold", fontVariant: ["tabular-nums"],
              }}
            >
              {ungelesen > 9 ? "9+" : ungelesen}
            </Text>
          </View>
        )}
      </Pressable>

      {offen && (
        <Blatt
          onSchliessen={() => {
            setOffen(false);
            zaehlen();
          }}
        >
          {(zu) => (
            <>
              <BlattKopf titel="Benachrichtigungen" onZu={zu} />
              {!alleGesehen && liste?.some((n) => n.read_at === null) && (
                <View style={{ marginTop: -14, alignItems: "flex-start" }}>
                  <AlleGelesenKnopf onPress={() => setAlleGesehen(true)} />
                </View>
              )}
              {fehler ? (
                <Text style={{ color: farben.red, fontFamily: "Barlow_600SemiBold" }}>{fehler}</Text>
              ) : liste === null ? (
                <ActivityIndicator color={farben.muted} />
              ) : (
                <NachrichtenListe liste={liste} alleGesehen={alleGesehen} />
              )}
            </>
          )}
        </Blatt>
      )}
    </>
  );
}
