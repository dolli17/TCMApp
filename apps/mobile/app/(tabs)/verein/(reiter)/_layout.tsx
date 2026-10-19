/**
 * Verein: Getraenke und Veranstaltungen (Entwurf Getraenke und Main)
 *
 * Wie bei den Plaetzen ein grosser Kopf mit Segment-Schalter darueber. Der
 * gewaehlte Reiter wird gemerkt: der Tab oeffnet beim naechsten Mal dort.
 */

import { useEffect, useRef } from "react";
import { View } from "react-native";
import { router, Slot, usePathname } from "expo-router";
import { abstand } from "@tcm/ui";
import { GrosserKopf } from "@/components/GrosserKopf";
import { Segmente } from "@/components/Segmente";
import { useTheme } from "@/lib/theme";
import { merkeVereinReiter, type VereinReiter } from "@/lib/verein";

export default function VereinReiterLayout() {
  const { farben } = useTheme();
  const pfad = usePathname();
  // Liegt eine Veranstaltung im Detail darueber, bleibt dieses Layout im
  // Stack und sieht deren Pfad - dann gilt weiter der Reiter von vorher.
  const zuletzt = useRef<VereinReiter>("/verein/getraenke");
  if (pfad.startsWith("/verein/veranstaltungen")) zuletzt.current = "/verein/veranstaltungen";
  else if (pfad.startsWith("/verein/getraenke")) zuletzt.current = "/verein/getraenke";
  const reiter = zuletzt.current;

  useEffect(() => {
    merkeVereinReiter(reiter);
  }, [reiter]);

  return (
    <View style={{ flex: 1, backgroundColor: farben.bg }}>
      <GrosserKopf titel="Verein">
        <View style={{ paddingHorizontal: abstand.rand, paddingBottom: abstand.m }}>
          <Segmente<VereinReiter>
            beschriftung="Bereich"
            wert={reiter}
            onWahl={(ziel) => router.replace(ziel)}
            optionen={[
              { wert: "/verein/getraenke", label: "Getränke" },
              { wert: "/verein/veranstaltungen", label: "Veranstaltungen" },
            ]}
          />
        </View>
      </GrosserKopf>
      <Slot />
    </View>
  );
}
