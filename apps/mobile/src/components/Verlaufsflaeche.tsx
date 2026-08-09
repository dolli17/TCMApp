/**
 * Der blau-goldene Verlauf aus dem Web
 *
 * Im Web steht dahinter eine Regel aus zwei Lagen (globals.css, .hero und
 * .auth .crown): ein linearer Verlauf von Azurblau nach Dunkelblau, darueber
 * ein radialer Goldschimmer aus der oberen rechten Ecke. Beides zusammen macht
 * den Blickfang aus - nur das Blau wirkt flach.
 *
 * Der Schimmer laeuft ueber react-native-svg und nicht ueber einen zweiten
 * LinearGradient: Gold auf Blau ergibt Gruen, und eine lineare Naeherung
 * verteilt dieses Gruen ueber die halbe Flaeche. Der radiale Verlauf haelt es
 * dort, wo es hingehoert - in der Ecke, nach knapp der Haelfte ausgelaufen.
 *
 * Zwei ineinandergeschachtelte Views, weil iOS auf einer Flaeche mit
 * overflow:"hidden" keinen Schatten zeichnet: aussen der Schatten, innen der
 * beschnittene Verlauf.
 */

import { useId, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "@/lib/theme";

type Eigenschaften = {
  children: ReactNode;
  /** Eckenrundung; die Login-Buehne laeuft oben randlos, der Hero nicht. */
  rundung?: number;
  /** Schatten wegnehmen, wo die Flaeche bis an den Bildschirmrand geht. */
  ohneSchatten?: boolean;
  stil?: StyleProp<ViewStyle>;
};

export function Verlaufsflaeche({
  children,
  rundung = 0,
  ohneSchatten = false,
  stil,
}: Eigenschaften) {
  const { farben } = useTheme();
  // Mehrere Verlaufsflaechen auf einem Bildschirm wuerden sich sonst denselben
  // Bezeichner teilen, und alle zeigten den Schimmer der zuerst gerenderten.
  const kennung = useId();

  return (
    <View
      style={[
        { borderRadius: rundung },
        !ohneSchatten && {
          shadowColor: farben.blue,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.34,
          shadowRadius: 15,
          elevation: 8,
        },
      ]}
    >
      <View style={{ borderRadius: rundung, overflow: "hidden" }}>
        {/* 155 Grad im Einheitsquadrat: von oben links nach unten rechts */}
        <LinearGradient
          colors={[farben.blue, farben.blueInk]}
          start={{ x: 0.29, y: 0.05 }}
          end={{ x: 0.71, y: 0.95 }}
        >
          <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              {/* radial-gradient(120% 120% at 88% -10%, gold 42%, transparent 46%) */}
              <RadialGradient id={kennung} cx="88%" cy="-10%" rx="120%" ry="120%">
                <Stop offset="0" stopColor={farben.gold} stopOpacity={0.42} />
                <Stop offset="0.46" stopColor={farben.gold} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${kennung})`} />
          </Svg>
          <View style={stil}>{children}</View>
        </LinearGradient>
      </View>
    </View>
  );
}
