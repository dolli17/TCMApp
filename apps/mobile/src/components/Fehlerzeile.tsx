/**
 * Ein Ladefehler mit dem Weg zurueck (U3)
 *
 * Vorher stand nur der Satz da; wer es noch einmal wollte, musste wissen,
 * dass man die Seite herunterziehen kann. Mit onErneut steht ein Knopf
 * darunter, der dasselbe tut. Ohne bleibt es der rote Hinweis wie bisher.
 */

import { Pressable, Text, View } from "react-native";
import { radius } from "@tcm/ui";
import { mitDeckkraft } from "@/lib/stil";
import { useTheme } from "@/lib/theme";

export function Fehlerzeile({
  text,
  onErneut,
  laeuft = false,
}: {
  text: string;
  onErneut?: () => void;
  /** Waehrend des Nachladens gesperrt, sonst stapeln sich die Anfragen. */
  laeuft?: boolean;
}) {
  const { stil, farben, theme } = useTheme();
  if (!onErneut) return <Text style={stil.hinweisFehler}>{text}</Text>;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: mitDeckkraft(farben.red, theme === "hell" ? 0.12 : 0.16),
        padding: 12, borderRadius: radius.feld, gap: 10,
      }}
    >
      <Text style={{ color: farben.redInk }}>{text}</Text>
      <Pressable
        onPress={onErneut}
        disabled={laeuft}
        accessibilityRole="button"
        accessibilityState={{ disabled: laeuft, busy: laeuft }}
        style={({ pressed }) => ({
          alignSelf: "flex-start", minHeight: 44, paddingHorizontal: 16, borderRadius: 22,
          justifyContent: "center", borderWidth: 1.5, borderColor: mitDeckkraft(farben.red, 0.4),
          opacity: laeuft ? 0.6 : pressed ? 0.8 : 1,
        })}
      >
        <Text style={{ color: farben.redInk, fontSize: 15, fontFamily: "Barlow_700Bold" }}>
          {laeuft ? "Wird geladen…" : "Erneut versuchen"}
        </Text>
      </Pressable>
    </View>
  );
}
