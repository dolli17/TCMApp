/**
 * Runder Plus-/Minus-Knopf mit 44 Punkten Trefferflaeche (.zaehler button
 * aus der CSS) - fuer die Getraenke und die Begleitpersonen.
 */

import { Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "@/lib/theme";

export function Rundknopf({
  zeichen, gelb, beschriftung, deaktiviert, onPress,
}: {
  zeichen: "plus" | "minus";
  gelb?: boolean;
  beschriftung: string;
  deaktiviert?: boolean;
  onPress: () => void;
}) {
  const { farben } = useTheme();
  const tinte = gelb ? farben.onGold : farben.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={deaktiviert}
      accessibilityRole="button"
      accessibilityLabel={beschriftung}
      hitSlop={4}
      style={{
        width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
        backgroundColor: gelb ? farben.gold : farben.surf2, opacity: deaktiviert ? 0.4 : 1,
      }}
    >
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <Path d={zeichen === "plus" ? "M12 5v14M5 12h14" : "M5 12h14"} stroke={tinte} strokeWidth={2.6} strokeLinecap="round" />
      </Svg>
    </Pressable>
  );
}
