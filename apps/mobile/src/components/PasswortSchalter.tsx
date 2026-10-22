/**
 * "Anzeigen" am Passwortfeld (U31)
 *
 * Wer am Handy ein neues Passwort zweimal blind tippt, vertippt sich leicht.
 * Der Schalter steht rechts im Feld; die Beschriftung sagt, was ein Tippen
 * tut, der Screenreader hoert einen Schalter "Passwort anzeigen".
 */

import { Pressable, Text } from "react-native";
import { useTheme } from "@/lib/theme";

export function PasswortSchalter({ sichtbar, onWechsel }: { sichtbar: boolean; onWechsel: (sichtbar: boolean) => void }) {
  const { farben } = useTheme();
  return (
    <Pressable
      onPress={() => onWechsel(!sichtbar)}
      accessibilityRole="switch"
      accessibilityLabel="Passwort anzeigen"
      accessibilityState={{ checked: sichtbar }}
      hitSlop={6}
      style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ fontSize: 14, fontFamily: "Barlow_700Bold", color: farben.ink2 }}>
        {sichtbar ? "Verbergen" : "Anzeigen"}
      </Text>
    </Pressable>
  );
}
