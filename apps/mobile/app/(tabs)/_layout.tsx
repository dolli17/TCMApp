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
 *
 * Admins bekommen einen fuenften Tab "Verwaltung", wie im Web der Tab
 * "Admin". Fuer alle anderen steht er mit href: null in der Liste, und die
 * Leiste laesst ihn aus. Die Rolle wird einmal beim Aufbau der Tabs gelesen;
 * wer sich abmeldet, verlaesst die Tabs ohnehin.
 */

import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { SchwebendeLeiste } from "@/components/SchwebendeLeiste";
import { Symbol } from "@/components/Symbol";
import { ladeIchSelbst } from "@/lib/daten";
import { useTheme } from "@/lib/theme";

export default function TabLayout() {
  const { farben } = useTheme();
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    let aktiv = true;
    ladeIchSelbst()
      .then((ich) => {
        if (aktiv) setAdmin(ich.admin);
      })
      .catch(() => undefined);
    return () => {
      aktiv = false;
    };
  }, []);

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
      <Tabs.Screen
        name="verwaltung"
        options={{
          title: "Verwaltung",
          // Fuenf Tabs neben dem Buchen-Knopf: "Verwaltung" passt nicht, im
          // Web heisst der Tab ebenso kurz "Admin".
          tabBarLabel: "Admin",
          href: admin ? undefined : null,
          tabBarIcon: ({ color }) => <Symbol name="admin" farbe={color} groesse={22} />,
        }}
      />
    </Tabs>
  );
}
