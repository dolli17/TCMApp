/**
 * Mengenwahl beim Buchen
 *
 * Bisher buchte ein Tipp genau eine Entnahme. Wer drei Wasser fuer den Tisch
 * holt, tippt dreimal und hat drei Zeilen in der Abrechnung. Dasselbe
 * Bodenfenster wie beim Buchen eines Platzes, damit die App eine Sprache
 * spricht.
 *
 * Die Grenzen kommen aus drinkPurchaseSchema in @tcm/core - dieselbe Regel,
 * die auch die Datenbank prueft.
 */

import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { formatCents } from "@tcm/core";
import { abstand } from "@tcm/ui";
import { useTheme } from "@/lib/theme";

export const MENGE_MAX = 50;

export function GetraenkeFenster({
  name,
  preisCents,
  laeuft,
  onBuchen,
  onSchliessen,
}: {
  name: string;
  preisCents: number;
  laeuft: boolean;
  onBuchen: (menge: number) => void;
  onSchliessen: () => void;
}) {
  const { stil, farben } = useTheme();
  const [menge, setMenge] = useState(1);

  return (
    <Modal transparent animationType="slide" onRequestClose={onSchliessen}>
      <Pressable style={stil.fensterHuelle} onPress={onSchliessen}>
        {/* Faengt Tipps ab, damit ein Griff ins Fenster es nicht schliesst. */}
        <Pressable style={stil.fenster} onPress={() => {}}>
          <Text style={stil.fensterTitel}>{name}</Text>
          <Text style={stil.leise}>
            {formatCents(preisCents)} je Stück · {formatCents(preisCents * menge)} gesamt
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: abstand.xl,
              marginVertical: abstand.m,
            }}
          >
            <Pressable
              style={[stil.knopfLeise, menge <= 1 && { opacity: 0.4 }]}
              disabled={menge <= 1}
              accessibilityRole="button"
              accessibilityLabel="Eins weniger"
              onPress={() => setMenge((m) => Math.max(1, m - 1))}
            >
              <Text style={[stil.knopfLeiseText, { fontSize: 20 }]}>−</Text>
            </Pressable>

            <Text
              style={{
                fontFamily: "BarlowSemiCondensed_700Bold",
                fontSize: 33,
                color: farben.ink,
                fontVariant: ["tabular-nums"],
                minWidth: 56,
                textAlign: "center",
              }}
            >
              {menge}
            </Text>

            <Pressable
              style={[stil.knopfLeise, menge >= MENGE_MAX && { opacity: 0.4 }]}
              disabled={menge >= MENGE_MAX}
              accessibilityRole="button"
              accessibilityLabel="Eins mehr"
              onPress={() => setMenge((m) => Math.min(MENGE_MAX, m + 1))}
            >
              <Text style={[stil.knopfLeiseText, { fontSize: 20 }]}>+</Text>
            </Pressable>
          </View>

          <Pressable
            style={[stil.knopf, laeuft && { opacity: 0.5 }]}
            disabled={laeuft}
            accessibilityRole="button"
            onPress={() => onBuchen(menge)}
          >
            <Text style={stil.knopfText}>
              {menge === 1 ? "Buchen" : `${menge} × buchen`}
            </Text>
          </Pressable>

          <Pressable style={stil.knopfLeise} onPress={onSchliessen} accessibilityRole="button">
            <Text style={stil.knopfLeiseText}>Abbrechen</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
