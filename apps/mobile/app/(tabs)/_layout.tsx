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
 * Wer Platzrechte hat (Vorstand, App Admin, Platzwart), bekommt einen
 * fuenften Tab "Verwaltung", wie im Web (docs/begriffe.md). Fuer alle anderen
 * steht er mit href: null in der Liste, und die
 * Leiste laesst ihn aus. Die Rolle wird einmal beim Aufbau der Tabs gelesen;
 * wer sich abmeldet, verlaesst die Tabs ohnehin.
 *
 * Im selben Zug der Schutz: ist das Onboarding offen, geht es nach
 * /onboarding, ohne Zugang nach /kein-zugang (B22). Die Weiche
 * (app/index.tsx) leitet schon dorthin; hier landet nur, wer einen Tab direkt
 * aufruft, etwa ueber einen Link oder im Web.
 */

import { useEffect, useState } from "react";
import { Redirect, Tabs, type Href } from "expo-router";
import { SchwebendeLeiste } from "@/components/SchwebendeLeiste";
import { Symbol } from "@/components/Symbol";
import { ladeIchSelbst, ladeZugang } from "@/lib/daten";
import { useTheme } from "@/lib/theme";

export default function TabLayout() {
  const { farben } = useTheme();
  const [platzRechte, setPlatzRechte] = useState(false);
  const [umleitung, setUmleitung] = useState<Href | null>(null);

  useEffect(() => {
    let aktiv = true;
    ladeIchSelbst()
      .then((ich) => {
        if (aktiv) setPlatzRechte(ich.platzRechte);
      })
      .catch(() => undefined);
    ladeZugang()
      .then((z) => {
        if (!aktiv) return;
        if (!z.zugang) setUmleitung({ pathname: "/kein-zugang", params: { grund: z.grund ?? "unbekannt" } });
        else if (z.onboardingOffen) setUmleitung("/onboarding");
      })
      .catch(() => undefined);
    return () => {
      aktiv = false;
    };
  }, []);

  if (umleitung) return <Redirect href={umleitung} />;

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
          title: "Start",
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
        name="verein"
        options={{
          title: "Verein",
          tabBarIcon: ({ color }) => <Symbol name="verein" farbe={color} groesse={22} />,
        }}
      />
      <Tabs.Screen
        name="konto"
        options={{
          title: "Konto",
          tabBarIcon: ({ color }) => <Symbol name="konto" farbe={color} groesse={22} />,
        }}
      />
      <Tabs.Screen
        name="verwaltung"
        options={{
          title: "Verwaltung",
          href: platzRechte ? undefined : null,
          tabBarIcon: ({ color }) => <Symbol name="admin" farbe={color} groesse={22} />,
        }}
      />
    </Tabs>
  );
}
