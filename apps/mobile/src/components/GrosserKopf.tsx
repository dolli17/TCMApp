/**
 * Der grosse Titel-Kopf
 *
 * Ersetzt den nativen Header der Tabs (docs/design/clubhaus, Abschnitt 4):
 * oben 16 unter dem Sicherheitsabstand (den zieht Bildschirm ein), links
 * optional ein Kicker ueber dem Titel in 34/800, rechts die Glocke und der
 * Avatar mit den Initialen auf brand. Der Avatar fuehrt ins Konto.
 *
 * Der Titel darf zweizeilig werden (U52): mit grosser Systemschrift passte
 * "Hallo, Wolfgang" nicht mehr in eine Zeile und endete auf "…".
 *
 * Mit zurueck steht darueber ein Zurueck-Knopf, fuer Seiten ausserhalb der
 * Tabs wie /nachrichten; Glocke und Avatar fehlen dort.
 *
 * Den Titel meldet er dem Bildschirm fuer die kompakte Kopfzeile (U80),
 * dazu, wo er endet - darunter kann noch eine Reiterleiste stehen.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { router } from "expo-router";
import { abstand, schrift } from "@tcm/ui";
import { useKompakterTitel } from "@/components/Bildschirm";
import { Glocke } from "@/components/Glocke";
import { ladeMeinenNamen } from "@/lib/daten";
import { SCHRIFT_DECKEL } from "@/lib/schrift";
import { useTheme } from "@/lib/theme";

type Eigenschaften = {
  titel: string;
  kicker?: string;
  /** Was unter dem Titel noch zum Kopf gehoert, etwa eine Reiterleiste. */
  children?: ReactNode;
  /** Zurueck-Knopf statt Glocke und Avatar */
  zurueck?: () => void;
};

export function GrosserKopf({ titel, kicker, children, zurueck }: Eigenschaften) {
  const { farben, stil } = useTheme();
  const [titelUnten, setTitelUnten] = useState<number | undefined>();
  useKompakterTitel(titel, titelUnten);

  return (
    <View style={{ backgroundColor: farben.bg, paddingTop: zurueck ? 4 : 16 }}>
      {zurueck && (
        <Pressable
          onPress={zurueck}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
          hitSlop={8}
          style={{
            alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 2,
            minHeight: 44, paddingLeft: abstand.rand - 6, paddingRight: 12,
          }}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path d="M15 6l-6 6 6 6" stroke={farben.blueInk} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text style={{ fontSize: 16, fontFamily: "Barlow_600SemiBold", color: farben.blueInk }}>Zurück</Text>
        </Pressable>
      )}
      <View
        // Unterkante des Titels ohne den Abstand darunter
        onLayout={(e) => setTitelUnten(e.nativeEvent.layout.y + e.nativeEvent.layout.height - abstand.m)}
        style={{
          flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
          gap: abstand.m, paddingHorizontal: abstand.rand, paddingBottom: abstand.m,
        }}
      >
        <View style={{ flexShrink: 1 }}>
          {kicker && <Text style={stil.kicker}>{kicker}</Text>}
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            style={[stil.titel, { lineHeight: schrift.groesse.seitentitel * 1.05, marginTop: kicker ? 4 : 0 }]}
          >
            {titel}
          </Text>
        </View>
        {!zurueck && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Glocke />
            <Avatar />
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

/**
 * Seit der Kopf mit dem Inhalt scrollt, setzt jeder Reiter ihn neu auf. Die
 * Initialen bleiben deshalb gemerkt, sonst stuende der Kreis bei jedem
 * Wechsel kurz leer.
 */
let gemerkteInitialen = "";

function Avatar() {
  const { farben } = useTheme();
  const [initialen, setInitialen] = useState(gemerkteInitialen);

  useEffect(() => {
    let aktiv = true;
    ladeMeinenNamen()
      .then((n) => {
        if (!n) return;
        gemerkteInitialen = (n.vorname.charAt(0) + n.nachname.charAt(0)).toUpperCase();
        if (aktiv) setInitialen(gemerkteInitialen);
      })
      .catch(() => undefined);
    return () => {
      aktiv = false;
    };
  }, []);

  return (
    <Pressable
      onPress={() => router.navigate("/konto")}
      accessibilityRole="button"
      accessibilityLabel="Konto"
      style={{
        width: 44, height: 44, borderRadius: 22, backgroundColor: farben.brand,
        alignItems: "center", justifyContent: "center",
      }}
    >
      <Text maxFontSizeMultiplier={SCHRIFT_DECKEL.form} style={{ color: farben.onBrand, fontSize: 15, fontFamily: "Barlow_700Bold" }}>
        {initialen}
      </Text>
    </Pressable>
  );
}
