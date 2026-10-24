/**
 * Die Segmente der Tabs Plaetze und Verein
 *
 * Standen frueher im Layout fest unter dem grossen Kopf. Seit der Titel mit
 * dem Inhalt scrollt (U53), setzt jeder Reiter Kopf und Segment selbst in
 * seinen Bildschirm - das Segment klebt dort oben, der Titel verschwindet.
 * Gewechselt wird weiter mit router.replace: zwei Sichten auf denselben
 * Bereich, kein Stapel mit Zurueck-Pfeil.
 */

import { View } from "react-native";
import { router } from "expo-router";
import { abstand } from "@tcm/ui";
import { Segmente } from "@/components/Segmente";
import type { VereinReiter } from "@/lib/verein";

export type PlaetzeSicht = "/plaetze" | "/plaetze/spiele";

export function PlaetzeReiter({ wert }: { wert: PlaetzeSicht }) {
  return (
    <View style={{ paddingHorizontal: abstand.rand, paddingBottom: abstand.m }}>
      <Segmente<PlaetzeSicht>
        beschriftung="Ansicht"
        wert={wert}
        onWahl={(ziel) => router.replace(ziel)}
        optionen={[
          { wert: "/plaetze", label: "Belegung" },
          { wert: "/plaetze/spiele", label: "Meine & offene Spiele" },
        ]}
      />
    </View>
  );
}

export function VereinReiterwahl({ wert }: { wert: VereinReiter }) {
  return (
    <View style={{ paddingHorizontal: abstand.rand, paddingBottom: abstand.m }}>
      <Segmente<VereinReiter>
        beschriftung="Bereich"
        wert={wert}
        onWahl={(ziel) => router.replace(ziel)}
        optionen={[
          { wert: "/verein/getraenke", label: "Getränke" },
          { wert: "/verein/veranstaltungen", label: "Veranstaltungen" },
        ]}
      />
    </View>
  );
}
