/**
 * Veranstaltungen (Entwurf Main, Verein > Veranstaltungen)
 *
 * Kommendes nach Monat, darunter ein Schalter fuer Vergangenes. Gruppierung
 * und Texte kommen aus @tcm/core (eventMonatsGruppen, eventKartenZeile) -
 * dieselben wie im Web.
 */

import { useCallback, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { eventMonatsGruppen } from "@tcm/core";
import { abstand } from "@tcm/ui";
import { Bildschirm } from "@/components/Bildschirm";
import { EventKarte } from "@/components/EventKarte";
import { ladeVeranstaltungen } from "@/lib/daten";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";

export default function Veranstaltungen() {
  const { stil, farben } = useTheme();
  const zustand = useLaden(ladeVeranstaltungen);
  const [vergangen, setVergangen] = useState(false);

  // Zurueck aus dem Detail, etwa nach dem Anmelden: still nachladen.
  const ersterFokus = useRef(true);
  const { setzeDaten } = zustand;
  useFocusEffect(
    useCallback(() => {
      if (ersterFokus.current) {
        ersterFokus.current = false;
        return;
      }
      ladeVeranstaltungen().then(setzeDaten).catch(() => undefined);
    }, [setzeDaten]),
  );

  const gruppen = eventMonatsGruppen(zustand.daten ?? [], new Date(), vergangen);

  return (
    <Bildschirm
      laedt={zustand.laedt}
      aktualisiert={zustand.aktualisiert}
      onAktualisieren={zustand.neuLaden}
      fehler={zustand.fehler}
    >
      {vergangen && (
        <Text style={[stil.abschnitt, { marginTop: 0 }]} accessibilityRole="header">Vergangene Veranstaltungen</Text>
      )}
      {zustand.daten && gruppen.length === 0 && (
        <Text style={stil.leise}>
          {vergangen ? "Noch keine vergangenen Veranstaltungen." : "Gerade ist nichts geplant."}
        </Text>
      )}
      {gruppen.map((g) => (
        <View key={g.schluessel} style={{ gap: 10, marginBottom: abstand.s }}>
          <Text
            accessibilityRole="header"
            style={{ fontSize: 13, fontFamily: "Barlow_700Bold", letterSpacing: 0.8, textTransform: "uppercase", color: farben.muted }}
          >
            {g.titel}
          </Text>
          {g.events.map((e) => <EventKarte key={e.id} e={e} />)}
        </View>
      ))}
      {zustand.daten && (
        <Pressable
          onPress={() => setVergangen((v) => !v)}
          accessibilityRole="button"
          hitSlop={12}
          style={{ alignSelf: "center", paddingVertical: 10 }}
        >
          <Text style={{ color: farben.blueInk, fontSize: 14, fontFamily: "Barlow_600SemiBold" }}>
            {vergangen ? "Kommende Veranstaltungen" : "Vergangene Veranstaltungen"}
          </Text>
        </Pressable>
      )}
    </Bildschirm>
  );
}
