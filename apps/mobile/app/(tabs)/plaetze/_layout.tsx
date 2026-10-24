/**
 * Plaetze: Belegung und "Meine & offene Spiele"
 *
 * Zwei Sichten auf denselben Bereich, umgeschaltet ueber ein Segment statt
 * der frueheren Reiterleiste (docs/design/clubhaus, Abschnitt 4) - ein Stack
 * mit Zurueck-Pfeil wuerde daraus zwei getrennte Seiten machen. Grossen Kopf
 * und Segment setzt jede Sicht selbst in ihren Bildschirm, damit der Titel
 * mitscrollt (U53, src/components/Bereichsreiter.tsx).
 */

import { View } from "react-native";
import { Slot } from "expo-router";
import { useTheme } from "@/lib/theme";

export default function PlaetzeLayout() {
  const { farben } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: farben.bg }}>
      <Slot />
    </View>
  );
}
