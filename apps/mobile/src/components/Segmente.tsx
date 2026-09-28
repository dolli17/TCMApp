/**
 * Segment-Schalter und Schalter (docs/design/clubhaus, Abschnitt 4)
 *
 * Segmente: Container surf2, Radius 16, Innenabstand 4; das aktive Segment
 * im Dunkeln in surf3, im Hellen in surf mit leichtem Schatten.
 *
 * Schalter: 52 x 32, an in green, Knopf weiss, mit role="switch".
 */

import { Pressable, Text, View } from "react-native";
import { radius, schattenRn } from "@tcm/ui";
import { useTheme } from "@/lib/theme";

export type Segment<T extends string | number> = {
  wert: T;
  label: string;
  deaktiviert?: boolean;
};

export function Segmente<T extends string | number>({
  optionen,
  wert,
  onWahl,
  hoehe = 40,
  beschriftung,
}: {
  optionen: Segment<T>[];
  wert: T;
  onWahl: (wert: T) => void;
  hoehe?: number;
  /** Name der Gruppe fuer Screenreader, etwa "Beginn" */
  beschriftung?: string;
}) {
  const { farben, theme } = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={beschriftung}
      style={{
        flexDirection: "row", gap: 4, padding: 4,
        backgroundColor: farben.surf2, borderRadius: radius.knopf,
      }}
    >
      {optionen.map((o) => {
        const aktiv = o.wert === wert;
        return (
          <Pressable
            key={String(o.wert)}
            onPress={() => onWahl(o.wert)}
            disabled={o.deaktiviert}
            accessibilityRole="radio"
            accessibilityState={{ selected: aktiv, disabled: o.deaktiviert }}
            style={[
              {
                flex: 1, height: hoehe, borderRadius: radius.knopf - 4,
                alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
              },
              aktiv && { backgroundColor: farben.segAktiv },
              aktiv && theme === "hell" && schattenRn.hell.klein,
              o.deaktiviert && { opacity: 0.4 },
            ]}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 15, color: aktiv ? farben.ink : farben.muted,
                fontFamily: aktiv ? "Barlow_700Bold" : "Barlow_600SemiBold",
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Schalter({
  an,
  onWechsel,
  beschriftung,
  deaktiviert,
}: {
  an: boolean;
  onWechsel: (an: boolean) => void;
  beschriftung: string;
  deaktiviert?: boolean;
}) {
  const { farben } = useTheme();
  return (
    <Pressable
      onPress={() => onWechsel(!an)}
      disabled={deaktiviert}
      accessibilityRole="switch"
      accessibilityLabel={beschriftung}
      accessibilityState={{ checked: an, disabled: deaktiviert }}
      hitSlop={8}
      style={{
        width: 52, height: 32, borderRadius: 16, padding: 3,
        justifyContent: "center", alignItems: an ? "flex-end" : "flex-start",
        backgroundColor: an ? farben.green : farben.surf3,
        borderWidth: an ? 0 : 1.5, borderColor: farben.line2,
        opacity: deaktiviert ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 26, height: 26, borderRadius: 13, backgroundColor: "#FFFFFF",
          shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3,
          shadowRadius: 3, elevation: 2,
        }}
      />
    </Pressable>
  );
}
