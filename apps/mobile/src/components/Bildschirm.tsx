/**
 * Die Huelle jedes Bildschirms
 *
 * Nimmt dem einzelnen Screen den immer gleichen ScrollView ab und bringt das
 * Herunterziehen zum Nachladen mit. Bisher lud nur der Belegungsplan von selbst
 * nach; ueberall sonst standen nach der Rueckkehr aus einem anderen Tab die
 * Daten von vorhin.
 *
 * Der untere Abstand traegt die schwebende Leiste mit: sie liegt ueber dem
 * Inhalt, und ohne die Luft verschwaende die letzte Zeile jeder Liste
 * dahinter. Das Mass kommt aus derselben Datei wie die Leiste selbst -
 * useBottomTabBarHeight waere der direktere Weg, verlangt aber einen
 * Direktzugriff auf @react-navigation/bottom-tabs, das hier nur ueber
 * expo-router mitkommt und unter pnpm nicht aufloest.
 *
 * Der Kopf (GrosserKopf) steht ueber dem Scrollbereich und bleibt stehen,
 * auch waehrend des ersten Ladens.
 */

import type { ReactNode } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { INHALT_LUFT_UNTEN } from "@/lib/masse";
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
  /** Steht fest ueber dem Scrollbereich, meist ein GrosserKopf. */
  kopf?: ReactNode;
};

export function Bildschirm({
  children,
  laedt = false,
  aktualisiert = false,
  onAktualisieren,
  fehler,
  ohneFussleiste = false,
  kopf,
}: Eigenschaften) {
  const { farben, stil } = useTheme();
  const rand = useSafeAreaInsets();
  const unten = ohneFussleiste ? 40 : INHALT_LUFT_UNTEN + rand.bottom;

  if (laedt) {
    return (
      <View style={stil.seite}>
        {kopf}
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator color={farben.blue} />
        </View>
      </View>
    );
  }

  const inhalt = (
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

  if (!kopf) return inhalt;
  return (
    <View style={stil.seite}>
      {kopf}
      {inhalt}
    </View>
  );
}
