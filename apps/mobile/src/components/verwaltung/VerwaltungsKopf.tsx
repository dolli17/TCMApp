/**
 * Der Kopf einer Verwaltungsseite (Nachbau von
 * apps/web/src/components/VerwaltungsKopf.tsx)
 *
 * Titel und Rueckweg traegt der native Kopf des Stacks
 * (app/(tabs)/verwaltung/_layout.tsx). Hier steht, was darunter kommt: die
 * Unterzeile, eine Statusmarke und die eine Hauptaktion in Gelb (Regel 4).
 */

import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Knopf } from "@/components/verwaltung/Formular";
import { useTheme } from "@/lib/theme";

export function VerwaltungsKopf({
  unterzeile,
  marke,
  aktion,
  children,
}: {
  unterzeile?: string;
  marke?: ReactNode;
  aktion?: { text: string; onPress: () => void };
  /** Was sonst noch in den Kopf gehoert, etwa ein Segment-Schalter */
  children?: ReactNode;
}) {
  const { farben } = useTheme();
  if (!unterzeile && !marke && !aktion && !children) return null;
  return (
    <View style={{ gap: 12 }}>
      {(unterzeile || marke) && (
        <View style={{ gap: 8 }}>
          {marke}
          {unterzeile && (
            <Text style={{ fontSize: 14, lineHeight: 19.5, color: farben.ink2, fontFamily: "Barlow_400Regular" }}>
              {unterzeile}
            </Text>
          )}
        </View>
      )}
      {aktion && <Knopf art="gold" text={`+ ${aktion.text}`} onPress={aktion.onPress} />}
      {children}
    </View>
  );
}
