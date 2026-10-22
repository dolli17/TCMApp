/**
 * Wenn eine Liste leer ist (U27)
 *
 * Ein Satz, was hier fehlt, und - wo es einen naheliegenden naechsten
 * Schritt gibt - ein Knopf dorthin. Vorher stand je Bildschirm eine eigene
 * graue Zeile, mal mit, meist ohne Weg weiter. Die Form ist die der Karte
 * "Noch nichts geplant" auf Home, die es schon so gab.
 */

import { Pressable, Text, View } from "react-native";
import { radius } from "@tcm/ui";
import { useTheme } from "@/lib/theme";

export type Handlung = {
  text: string;
  onPress: () => void;
  /** Der gelbe Hauptknopf, nur wo er die wichtigste Handlung der Seite ist. */
  gold?: boolean;
};

export function Leerzustand({ titel, text, handlung }: { titel?: string; text: string; handlung?: Handlung }) {
  const { stil } = useTheme();
  return (
    <View style={[stil.karte, { borderRadius: titel ? radius.karteGross : radius.karte, padding: titel ? 20 : 16, gap: 6 }]}>
      {titel && <Text style={[stil.text, { fontFamily: "Barlow_700Bold", fontSize: 18 }]}>{titel}</Text>}
      <Text style={[stil.leise, { lineHeight: 20 }]}>{text}</Text>
      {handlung && (
        <Pressable
          onPress={handlung.onPress}
          accessibilityRole="button"
          style={({ pressed }) => [
            handlung.gold ? [stil.knopf, stil.knopfGold] : stil.knopfLeise,
            { alignSelf: "flex-start", marginTop: 10, minHeight: 44, justifyContent: "center", opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={handlung.gold ? [stil.knopfText, stil.knopfGoldText] : stil.knopfLeiseText}>{handlung.text}</Text>
        </Pressable>
      )}
    </View>
  );
}
