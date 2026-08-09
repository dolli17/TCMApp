/**
 * Die drei Sichten auf den Platz
 *
 * Eigener Kopf mit Reiterleiste statt des Tab-Kopfes: im Web sitzen Belegung,
 * Meine Buchungen und Offene Spiele ebenso als Reiter unter einer gemeinsamen
 * Ueberschrift. Ein Stack mit Zurueck-Pfeil wuerde daraus drei getrennte
 * Seiten machen, zwischen denen man nur ueber Umwege wechselt.
 */

import { Text, View } from "react-native";
import { Slot } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glocke } from "@/components/Glocke";
import { Reiter } from "@/components/Reiter";
import { useTheme } from "@/lib/theme";

const EINTRAEGE = [
  { pfad: "/plaetze", label: "Belegung" },
  { pfad: "/plaetze/meine", label: "Meine Buchungen" },
  { pfad: "/plaetze/offen", label: "Offene Spiele" },
];

export default function PlaetzeLayout() {
  const { farben, stil } = useTheme();
  const rand = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: farben.bg }}>
      <View style={{ backgroundColor: farben.surf, paddingTop: rand.top }}>
        <View
          style={[stil.zeile, { paddingLeft: 16, paddingRight: 2, paddingTop: 6 }]}
        >
          <Text
            style={{
              fontFamily: "BarlowSemiCondensed_700Bold",
              fontSize: 19,
              color: farben.ink,
            }}
          >
            Plätze
          </Text>
          <Glocke />
        </View>
        <Reiter eintraege={EINTRAEGE} />
      </View>
      <Slot />
    </View>
  );
}
