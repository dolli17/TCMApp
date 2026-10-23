/**
 * Die schwebende Tab-Leiste
 *
 * Eine Pille ueber dem Inhalt statt der festen Leiste am unteren Rand
 * (docs/design/clubhaus, Abschnitt 4). Sie wird ueber die tabBar-Prop von
 * <Tabs> eingesetzt. Den runden gelben Knopf "Platz buchen" daneben gibt es
 * nicht mehr (U43): auf Getraenke hiess "+" dort eins mehr, und Gelb gehoert
 * der einen Hauptaktion des Screens. Gebucht wird ueber den Tab Plaetze und
 * die Kachel auf Start.
 *
 * Die Eintraege kommen aus den Tabs.Screen-Angaben (title, tabBarLabel,
 * tabBarIcon), nicht aus einer eigenen Liste: ein weiterer Tab braucht nur
 * einen weiteren Tabs.Screen, die Leiste teilt die Breite von selbst auf.
 * Tabs mit href: null (die Verwaltung ohne Platzrechte) laesst sie aus -
 * expo-router uebersetzt das in tabBarItemStyle { display: "none" }, und
 * eine eigene Leiste muss das selbst beachten.
 *
 * Die Leiste liegt absolut ueber dem Inhalt. Damit nichts darunter
 * verschwindet, laesst Bildschirm.tsx unten INHALT_LUFT_UNTEN frei.
 *
 * Weichzeichner ueber expo-blur. Android zeichnet ihn ohne experimentelle
 * Methode nicht; dort steht die Glasflaeche deckender, wie im Handoff
 * vorgesehen.
 */

import type { ComponentProps } from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { BlurView } from "expo-blur";
import type { Tabs } from "expo-router";
import { schattenRn } from "@tcm/ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LEISTE_ABSTAND_UNTEN, LEISTE_HOEHE, LEISTE_RAND } from "@/lib/masse";
import { SCHRIFT_DECKEL } from "@/lib/schrift";
import { mitDeckkraft } from "@/lib/stil";
import { useTheme } from "@/lib/theme";

type LeistenEigenschaften = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

const TAB_HOEHE = 52;
/** Darunter passen fünf Tabs mit „Verwaltung“ nur in kleinerer Schrift (U7). */
const SCHMAL = 380;

export function SchwebendeLeiste({ state, descriptors, navigation }: LeistenEigenschaften) {
  const { farben, theme } = useTheme();
  const rand = useSafeAreaInsets();
  const schmal = useWindowDimensions().width < SCHMAL;

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
          if (StyleSheet.flatten(optionen.tabBarItemStyle)?.display === "none") return null;
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
              style={[stile.tab, schmal && stile.tabSchmal, aktiv && { backgroundColor: farben.tabAktiv }]}
            >
              {optionen.tabBarIcon?.({ focused: aktiv, color: farbe, size: 22 })}
              <Text
                style={[stile.tabText, schmal && stile.tabTextSchmal, { color: farbe }]}
                numberOfLines={1}
                maxFontSizeMultiplier={SCHRIFT_DECKEL.leiste}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const stile = StyleSheet.create({
  huelle: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
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
  // Breite aus dem Inhalt plus gleichem Anteil am Rest: „Verwaltung“ passt
  // so ohne Auslassungspunkte, die kurzen Tabs bleiben breit genug.
  tab: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    paddingHorizontal: 5,
    height: TAB_HOEHE,
    borderRadius: TAB_HOEHE / 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabSchmal: { paddingHorizontal: 2 },
  tabText: { fontSize: 11, fontFamily: "Barlow_600SemiBold" },
  tabTextSchmal: { fontSize: 10 },
});
