/**
 * Die Tabs
 *
 * Schwebende Leiste statt der festen Fussleiste, grosser Titel-Kopf statt des
 * nativen Headers (docs/design/clubhaus, Abschnitt 4). Die Leiste liest ihre
 * Eintraege aus den Tabs.Screen-Angaben unten - ein weiterer Tab ist ein
 * weiterer Tabs.Screen, sonst nichts.
 *
 * Den Kopf setzt jeder Bildschirm selbst (GrosserKopf), weil nur er weiss, was
 * darunter noch dazugehoert - bei den Plaetzen die Reiterleiste.
 */

import { Tabs } from "expo-router";
import { SchwebendeLeiste } from "@/components/SchwebendeLeiste";
import { Symbol } from "@/components/Symbol";
import { useTheme } from "@/lib/theme";

export default function TabLayout() {
  const { farben } = useTheme();

  return (
    <Tabs
      tabBar={(eigenschaften) => <SchwebendeLeiste {...eigenschaften} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: farben.bg },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Symbol name="home" farbe={color} groesse={22} />,
        }}
      />
      <Tabs.Screen
        name="plaetze"
        options={{
          title: "Plätze",
          tabBarIcon: ({ color }) => <Symbol name="platz" farbe={color} groesse={22} />,
        }}
      />
      <Tabs.Screen
        name="getraenke"
        options={{
          title: "Getränke",
          tabBarIcon: ({ color }) => <Symbol name="getraenk" farbe={color} groesse={22} />,
        }}
      />
      <Tabs.Screen
        name="konto"
        options={{
          title: "Mein Konto",
          tabBarLabel: "Konto",
          tabBarIcon: ({ color }) => <Symbol name="konto" farbe={color} groesse={22} />,
        }}
      />
    </Tabs>
  );
}
