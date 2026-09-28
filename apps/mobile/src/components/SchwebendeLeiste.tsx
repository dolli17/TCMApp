/**
 * Die schwebende Tab-Leiste
 *
 * Eine Pille ueber dem Inhalt statt der festen Leiste am unteren Rand, rechts
 * daneben der runde gelbe Knopf "Platz buchen" (docs/design/clubhaus,
 * Abschnitt 4). Sie wird ueber die tabBar-Prop von <Tabs> eingesetzt. Der
 * Knopf oeffnet das Buchungsblatt mit der naechsten freien Zeit
 * (plaetze/index.tsx, ?buchen=jetzt).
 *
 * Die Eintraege kommen aus den Tabs.Screen-Angaben (title, tabBarLabel,
 * tabBarIcon), nicht aus einer eigenen Liste: ein weiterer Tab braucht nur
 * einen weiteren Tabs.Screen, die Leiste teilt die Breite von selbst auf.
 *
 * Die Leiste liegt absolut ueber dem Inhalt. Damit nichts darunter
 * verschwindet, laesst Bildschirm.tsx unten INHALT_LUFT_UNTEN frei.
 *
 * Weichzeichner ueber expo-blur. Android zeichnet ihn ohne experimentelle
 * Methode nicht; dort steht die Glasflaeche deckender, wie im Handoff
 * vorgesehen.
 */

import type { ComponentProps } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { router, type Tabs } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { schattenRn } from "@tcm/ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LEISTE_ABSTAND_UNTEN, LEISTE_HOEHE, LEISTE_RAND } from "@/lib/masse";
import { mitDeckkraft } from "@/lib/stil";
import { useTheme } from "@/lib/theme";

type LeistenEigenschaften = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

const TAB_HOEHE = 52;

export function SchwebendeLeiste({ state, descriptors, navigation }: LeistenEigenschaften) {
  const { farben, theme } = useTheme();
  const rand = useSafeAreaInsets();

  // Ohne Weichzeichner wuerde der Inhalt durch die Leiste hindurch lesbar.
  const glas = Platform.OS === "android" ? mitDeckkraft(farben.glass, 0.96) : farben.glass;

  return (
    <View
      style={[
        stile.huelle,
        { bottom: LEISTE_ABSTAND_UNTEN + rand.bottom, left: LEISTE_RAND, right: LEISTE_RAND },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          stile.pille,
          schattenRn[theme].schwebend,
          { borderColor: farben.glassLine },
        ]}
        accessibilityRole="tablist"
      >
        {/* Beschnitten in einer eigenen Ebene: iOS zeichnet auf einer View mit
            overflow:"hidden" keinen Schatten. */}
        <View style={[StyleSheet.absoluteFill, stile.glasEbene]}>
          <BlurView
            intensity={40}
            tint={theme === "hell" ? "light" : "dark"}
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: glas }]} />
        </View>

        {state.routes.map((route, index) => {
          const optionen = descriptors[route.key]!.options;
          const aktiv = state.index === index;
          const farbe = aktiv ? farben.tabAktivInk : farben.muted;
          const label =
            typeof optionen.tabBarLabel === "string"
              ? optionen.tabBarLabel
              : (optionen.title ?? route.name);

          function druecken() {
            const ereignis = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!aktiv && !ereignis.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          }

          return (
            <Pressable
              key={route.key}
              onPress={druecken}
              onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: aktiv }}
              accessibilityLabel={optionen.tabBarAccessibilityLabel ?? label}
              style={[stile.tab, aktiv && { backgroundColor: farben.tabAktiv }]}
            >
              {optionen.tabBarIcon?.({ focused: aktiv, color: farbe, size: 22 })}
              <Text style={[stile.tabText, { color: farbe }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => router.navigate({ pathname: "/plaetze", params: { buchen: "jetzt" } })}
        accessibilityRole="button"
        accessibilityLabel="Platz buchen"
        style={({ pressed }) => [
          stile.buchen,
          { backgroundColor: farben.gold, shadowColor: farben.gold },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Svg width={26} height={26} viewBox="0 0 24 24">
          <Path
            d="M12 5v14M5 12h14"
            stroke={farben.onGold}
            strokeWidth={2.4}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      </Pressable>
    </View>
  );
}

const stile = StyleSheet.create({
  huelle: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pille: {
    flex: 1,
    height: LEISTE_HOEHE,
    borderRadius: LEISTE_HOEHE / 2,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    gap: 2,
  },
  glasEbene: { borderRadius: LEISTE_HOEHE / 2, overflow: "hidden" },
  tab: {
    flex: 1,
    height: TAB_HOEHE,
    borderRadius: TAB_HOEHE / 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabText: { fontSize: 11, fontFamily: "Barlow_600SemiBold" },
  buchen: {
    width: LEISTE_HOEHE,
    height: LEISTE_HOEHE,
    borderRadius: LEISTE_HOEHE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
});
