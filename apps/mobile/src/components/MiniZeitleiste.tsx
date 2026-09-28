/**
 * Die kleine Zeitleiste eines Platzes
 *
 * Eine Spur von Oeffnung bis Schluss, darauf die Belegungen nach der
 * Statustabelle im Handoff (belegt blau, eigene Buchung gelb, Mitspieler
 * gesucht gelblich mit gestrichelter Kante, Sperrung/Serie in surf3) und eine
 * senkrechte Marke fuer jetzt. Die Lage rechnet @tcm/core (timelineSegments).
 */

import { View } from "react-native";
import type { TimelineSegment } from "@tcm/core";
import { useTheme } from "@/lib/theme";

export function MiniZeitleiste({
  segmente,
  markierung,
  hoehe = 8,
}: {
  segmente: TimelineSegment[];
  /** Senkrechte Marke in Prozent, etwa fuer jetzt */
  markierung?: number;
  hoehe?: number;
}) {
  const { farben } = useTheme();

  const flaeche = {
    belegt: { backgroundColor: farben.blue },
    eigen: { backgroundColor: farben.gold },
    sucht: {
      backgroundColor: farben.goldSoft, borderWidth: 1.5, borderStyle: "dashed" as const,
      borderColor: farben.goldLine,
    },
    gesperrt: { backgroundColor: farben.surf3 },
  };

  return (
    <View
      style={{
        height: hoehe, borderRadius: hoehe / 2, backgroundColor: farben.surf2,
        overflow: "hidden", position: "relative",
      }}
      // Die Leiste ist Schmuck; was sie zeigt, steht daneben als Text.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {segmente.map((s, i) => (
        <View
          key={i}
          style={[
            {
              position: "absolute", top: 0, bottom: 0, borderRadius: hoehe / 2,
              left: `${s.left}%`, width: `${s.width}%`,
            },
            flaeche[s.art],
          ]}
        />
      ))}
      {markierung !== undefined && (
        <View
          style={{
            position: "absolute", top: 0, bottom: 0, width: 2,
            left: `${markierung}%`, backgroundColor: farben.ink,
          }}
        />
      )}
    </View>
  );
}
