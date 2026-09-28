/**
 * Der grosse Titel-Kopf
 *
 * Ersetzt den nativen Header der Tabs (docs/design/clubhaus, Abschnitt 4):
 * oben der Sicherheitsabstand plus 16, links optional ein Kicker ueber dem
 * Titel in 34/800, rechts die Glocke und der Avatar mit den Initialen auf
 * brand. Der Avatar fuehrt ins Konto.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { abstand, schrift } from "@tcm/ui";
import { Glocke } from "@/components/Glocke";
import { ladeMeinenNamen } from "@/lib/daten";
import { useTheme } from "@/lib/theme";

type Eigenschaften = {
  titel: string;
  kicker?: string;
  /** Was unter dem Titel noch zum Kopf gehoert, etwa eine Reiterleiste. */
  children?: ReactNode;
};

export function GrosserKopf({ titel, kicker, children }: Eigenschaften) {
  const { farben, stil } = useTheme();
  const rand = useSafeAreaInsets();

  return (
    <View style={{ backgroundColor: farben.bg, paddingTop: rand.top + 16 }}>
      <View
        style={{
          flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
          gap: abstand.m, paddingHorizontal: abstand.rand, paddingBottom: abstand.m,
        }}
      >
        <View style={{ flexShrink: 1 }}>
          {kicker && <Text style={stil.kicker}>{kicker}</Text>}
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[stil.titel, { lineHeight: schrift.groesse.seitentitel * 1.05, marginTop: kicker ? 4 : 0 }]}
          >
            {titel}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Glocke />
          <Avatar />
        </View>
      </View>
      {children}
    </View>
  );
}

function Avatar() {
  const { farben } = useTheme();
  const [initialen, setInitialen] = useState("");

  useEffect(() => {
    let aktiv = true;
    ladeMeinenNamen()
      .then((n) => {
        if (aktiv && n) setInitialen((n.vorname.charAt(0) + n.nachname.charAt(0)).toUpperCase());
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
      <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Barlow_700Bold" }}>
        {initialen}
      </Text>
    </Pressable>
  );
}
