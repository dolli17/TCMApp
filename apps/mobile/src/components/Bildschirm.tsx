/**
 * Die Huelle jedes Bildschirms
 *
 * Nimmt dem einzelnen Screen den immer gleichen ScrollView ab und bringt das
 * Herunterziehen zum Nachladen mit. Bisher lud nur der Belegungsplan von selbst
 * nach; ueberall sonst standen nach der Rueckkehr aus einem anderen Tab die
 * Daten von vorhin.
 *
 * Der untere Abstand traegt die Fussleiste mit: ohne ihn verschwindet die
 * letzte Zeile jeder Liste hinter den Symbolen. Die Hoehe kommt aus derselben
 * Konstante wie die Leiste selbst - useBottomTabBarHeight waere der direktere
 * Weg, verlangt aber einen Direktzugriff auf @react-navigation/bottom-tabs,
 * das hier nur ueber expo-router mitkommt und unter pnpm nicht aufloest.
 */

import type { ReactNode } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FUSSLEISTE_HOEHE } from "@/lib/masse";
import { useTheme } from "@/lib/theme";

type Eigenschaften = {
  children: ReactNode;
  /** Erstes Laden: es gibt noch nichts anzuzeigen. */
  laedt?: boolean;
  aktualisiert?: boolean;
  onAktualisieren?: () => void;
  fehler?: string | null;
  /** Fuer Bildschirme ausserhalb der Tabs, etwa die Benachrichtigungen. */
  ohneFussleiste?: boolean;
};

export function Bildschirm({
  children,
  laedt = false,
  aktualisiert = false,
  onAktualisieren,
  fehler,
  ohneFussleiste = false,
}: Eigenschaften) {
  const { farben, stil } = useTheme();
  const rand = useSafeAreaInsets();
  const unten = ohneFussleiste ? 40 : FUSSLEISTE_HOEHE + rand.bottom + 24;

  if (laedt) {
    return (
      <View style={[stil.seite, { justifyContent: "center" }]}>
        <ActivityIndicator color={farben.blue} />
      </View>
    );
  }

  return (
    <ScrollView
      style={stil.seite}
      contentContainerStyle={[stil.inhalt, { paddingBottom: unten }]}
      refreshControl={
        onAktualisieren ? (
          <RefreshControl
            refreshing={aktualisiert}
            onRefresh={onAktualisieren}
            tintColor={farben.blue}
            colors={[farben.blue]}
            progressBackgroundColor={farben.surf}
          />
        ) : undefined
      }
    >
      {fehler && <Text style={stil.hinweisFehler}>{fehler}</Text>}
      {children}
    </ScrollView>
  );
}
