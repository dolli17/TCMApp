/**
 * Verein: Getraenke und Veranstaltungen (Entwurf Getraenke und Main)
 *
 * Wie bei den Plaetzen ein grosser Kopf mit Segment-Schalter darueber; beides
 * setzt jeder Reiter selbst in seinen Bildschirm (U53,
 * src/components/Bereichsreiter.tsx). Hier bleibt nur das Merken: der Tab
 * oeffnet beim naechsten Mal auf dem zuletzt gewaehlten Reiter.
 */

import { useEffect, useRef } from "react";
import { View } from "react-native";
import { Slot, usePathname } from "expo-router";
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
      <Slot />
    </View>
  );
}
