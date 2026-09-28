/**
 * Die Zeitleiste eines Platzes
 *
 * Eine Spur von Oeffnung bis Schluss, darauf die Belegungen nach der
 * Statustabelle im Handoff: belegt blau, eigene Buchung gelb, Mitspieler
 * gesucht gelblich mit gestrichelter Kante, Serie (Training) schraffiert ueber
 * surf3, Sperrung flach in surf3. Dazu eine senkrechte Marke - auf Home fuer
 * jetzt, in der Platzliste fuer die gewaehlte Zeit. Die Lage rechnet
 * @tcm/core (timelineSegments).
 */

import { useId } from "react";
import { View } from "react-native";
import Svg, { Defs, Pattern, Rect } from "react-native-svg";
import type { TimelineKind, TimelineSegment } from "@tcm/core";
import { mitDeckkraft } from "@/lib/stil";
import { useTheme } from "@/lib/theme";

export function MiniZeitleiste({
  segmente,
  markierung,
  hoehe = 8,
  ueberstand = 0,
}: {
  segmente: TimelineSegment[];
  /** Senkrechte Marke in Prozent */
  markierung?: number;
  hoehe?: number;
  /** Wie weit die Marke oben und unten ueber die Spur hinausragt */
  ueberstand?: number;
}) {
  const { farben } = useTheme();

  return (
    <View
      style={{ height: hoehe, position: "relative" }}
      // Schmuck; was die Leiste zeigt, steht daneben als Text.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={{
          position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
          borderRadius: hoehe / 2, backgroundColor: farben.surf2, overflow: "hidden",
        }}
      >
        {segmente.map((s, i) => (
          <Segment key={i} segment={s} hoehe={hoehe} />
        ))}
      </View>
      {markierung !== undefined && (
        <View
          style={{
            position: "absolute", top: -ueberstand, bottom: -ueberstand, width: 2, borderRadius: 1,
            left: `${markierung}%`, backgroundColor: farben.ink,
          }}
        />
      )}
    </View>
  );
}

function Segment({ segment, hoehe }: { segment: TimelineSegment; hoehe: number }) {
  const { farben } = useTheme();
  const lage = {
    position: "absolute" as const, top: 0, bottom: 0, borderRadius: hoehe / 2, overflow: "hidden" as const,
    left: `${segment.left}%` as const, width: `${segment.width}%` as const,
  };

  const flaeche: Record<Exclude<TimelineKind, "serie">, object> = {
    belegt: { backgroundColor: farben.blue },
    eigen: { backgroundColor: farben.gold },
    sucht: {
      backgroundColor: farben.goldSoft, borderWidth: 1.5, borderStyle: "dashed", borderColor: farben.goldLine,
    },
    gesperrt: { backgroundColor: farben.surf3 },
  };

  if (segment.art === "serie") {
    return (
      <View style={[lage, { backgroundColor: farben.surf3 }]}>
        <Schraffur farbe={mitDeckkraft(farben.ink, 0.18)} />
      </View>
    );
  }
  return <View style={[lage, flaeche[segment.art]]} />;
}

/** Streifen im 135-Grad-Winkel, 3 Pixel breit, alle 6 Pixel - wie im Entwurf. */
export function Schraffur({ farbe }: { farbe: string }) {
  const kennung = useId().replace(/:/g, "");
  return (
    <Svg width="100%" height="100%" style={{ position: "absolute" }}>
      <Defs>
        <Pattern
          id={kennung}
          patternUnits="userSpaceOnUse"
          width={6}
          height={6}
          patternTransform="rotate(45)"
        >
          <Rect x={0} y={0} width={3} height={6} fill={farbe} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${kennung})`} />
    </Svg>
  );
}
