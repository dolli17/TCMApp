/**
 * Die drei Sichten auf den Platz
 *
 * Grosser Kopf mit Reiterleiste darunter: im Web sitzen Belegung, Meine
 * Buchungen und Offene Spiele ebenso als Reiter unter einer gemeinsamen
 * Ueberschrift. Ein Stack mit Zurueck-Pfeil wuerde daraus drei getrennte
 * Seiten machen, zwischen denen man nur ueber Umwege wechselt.
 */

import { View } from "react-native";
import { Slot } from "expo-router";
import { GrosserKopf } from "@/components/GrosserKopf";
import { Reiter } from "@/components/Reiter";
import { useTheme } from "@/lib/theme";

const EINTRAEGE = [
  { pfad: "/plaetze", label: "Belegung" },
  { pfad: "/plaetze/meine", label: "Meine Buchungen" },
  { pfad: "/plaetze/offen", label: "Offene Spiele" },
];

export default function PlaetzeLayout() {
  const { farben } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: farben.bg }}>
      <GrosserKopf titel="Plätze">
        <Reiter eintraege={EINTRAEGE} />
      </GrosserKopf>
      <Slot />
    </View>
  );
}
