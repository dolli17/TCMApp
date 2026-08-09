/**
 * Die Fussleiste
 *
 * Bildet die Bottom-Navigation des Webs unter 768 Pixel nach: dieselben drei
 * Eintraege, dieselben Symbole, dieselbe Glocke rechts oben. Die drei Sichten
 * auf den Plan liegen eine Ebene darunter als Reiter - genau wie im Web, wo
 * PlanReiter unterhalb der Fussleiste sitzt.
 *
 * Der Weichzeichner der CSS (backdrop-filter: blur(12px)) hat in React Native
 * keine Entsprechung. Statt dafuer ein weiteres natives Paket einzubinden,
 * steht die Flaeche etwas deckender - auf zwoelf Pixel Hoehe sieht man den
 * Unterschied ohnehin nicht.
 */

import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glocke } from "@/components/Glocke";
import { Symbol } from "@/components/Symbol";
import { FUSSLEISTE_HOEHE } from "@/lib/masse";
import { mitDeckkraft } from "@/lib/stil";
import { useTheme } from "@/lib/theme";

export default function TabLayout() {
  const { farben } = useTheme();
  const rand = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: farben.blue,
        tabBarInactiveTintColor: farben.muted,
        tabBarLabelStyle: { fontSize: 10, fontFamily: "Barlow_600SemiBold" },
        tabBarStyle: {
          backgroundColor: mitDeckkraft(farben.surf, 0.96),
          borderTopWidth: 1,
          borderTopColor: farben.line,
          height: FUSSLEISTE_HOEHE + rand.bottom,
          paddingTop: 9,
          paddingBottom: 8 + rand.bottom,
        },
        headerStyle: { backgroundColor: farben.surf },
        headerTintColor: farben.ink,
        headerTitleStyle: { fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 19 },
        headerRight: () => <Glocke />,
        sceneStyle: { backgroundColor: farben.bg },
      }}
    >
      <Tabs.Screen
        name="plaetze"
        options={{
          title: "Plätze",
          // Der Kopf kommt aus plaetze/_layout.tsx - er traegt die Reiterleiste.
          headerShown: false,
          tabBarIcon: ({ color }) => <Symbol name="platz" farbe={color} />,
        }}
      />
      <Tabs.Screen
        name="getraenke"
        options={{
          title: "Getränke",
          tabBarIcon: ({ color }) => <Symbol name="getraenk" farbe={color} />,
        }}
      />
      <Tabs.Screen
        name="konto"
        options={{
          title: "Mein Konto",
          tabBarLabel: "Konto",
          tabBarIcon: ({ color }) => <Symbol name="konto" farbe={color} />,
        }}
      />
    </Tabs>
  );
}
