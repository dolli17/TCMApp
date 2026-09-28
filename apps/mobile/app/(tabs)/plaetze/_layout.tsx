/**
 * Plaetze: Belegung und "Meine & offene Spiele"
 *
 * Grosser Kopf, darunter ein Segment-Schalter statt der frueheren
 * Reiterleiste (docs/design/clubhaus, Abschnitt 4). Zwei Sichten auf
 * denselben Bereich - ein Stack mit Zurueck-Pfeil wuerde daraus zwei
 * getrennte Seiten machen, zwischen denen man nur ueber Umwege wechselt.
 */

import { View } from "react-native";
import { router, Slot, usePathname } from "expo-router";
import { abstand } from "@tcm/ui";
import { GrosserKopf } from "@/components/GrosserKopf";
import { Segmente } from "@/components/Segmente";
import { useTheme } from "@/lib/theme";

type Sicht = "/plaetze" | "/plaetze/spiele";

export default function PlaetzeLayout() {
  const { farben } = useTheme();
  const pfad = usePathname();
  // Die alten Adressen /plaetze/meine und /plaetze/offen leiten auf die Spiele.
  const sicht: Sicht = pfad === "/plaetze" ? "/plaetze" : "/plaetze/spiele";

  return (
    <View style={{ flex: 1, backgroundColor: farben.bg }}>
      <GrosserKopf titel="Plätze">
        <View style={{ paddingHorizontal: abstand.rand, paddingBottom: abstand.m }}>
          <Segmente<Sicht>
            beschriftung="Ansicht"
            wert={sicht}
            onWahl={(ziel) => router.replace(ziel)}
            optionen={[
              { wert: "/plaetze", label: "Belegung" },
              { wert: "/plaetze/spiele", label: "Meine & offene Spiele" },
            ]}
          />
        </View>
      </GrosserKopf>
      <Slot />
    </View>
  );
}
