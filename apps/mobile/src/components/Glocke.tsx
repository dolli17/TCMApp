/**
 * Die Benachrichtigungsglocke
 *
 * Rund, 44 Pixel, im grossen Kopf jedes Tabs neben dem Avatar. Der Zaehler
 * wird bei jedem Fokuswechsel neu geholt: sonst bliebe die rote Marke stehen,
 * nachdem die Nachrichten gelesen wurden.
 *
 * Der Entwurf zeigt nur einen Punkt; die Zahl bleibt, weil sie im Web wie in
 * der App schon vorher da war und niemandem etwas wegnehmen soll.
 */

import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Symbol } from "@/components/Symbol";
import { zaehleUngelesen } from "@/lib/daten";
import { useTheme } from "@/lib/theme";

export function Glocke() {
  const { farben } = useTheme();
  const groesse = 44;
  const [ungelesen, setUngelesen] = useState(0);

  const zaehlen = useCallback(() => {
    zaehleUngelesen()
      .then(setUngelesen)
      .catch(() => setUngelesen(0));
  }, []);

  useEffect(zaehlen, [zaehlen]);
  useFocusEffect(zaehlen);

  return (
    <Pressable
      onPress={() => router.push("/nachrichten")}
      accessibilityRole="button"
      accessibilityLabel={
        ungelesen > 0 ? `Benachrichtigungen, ${ungelesen} ungelesen` : "Benachrichtigungen"
      }
      style={{
        width: groesse, height: groesse, borderRadius: groesse / 2,
        borderWidth: 1, borderColor: farben.line, backgroundColor: farben.surf2,
        alignItems: "center", justifyContent: "center",
      }}
    >
      <Symbol name="glocke" farbe={farben.ink} groesse={21} />
      {ungelesen > 0 && (
        <View
          style={{
            position: "absolute", top: -3, right: -3,
            minWidth: 17, height: 17, borderRadius: 99,
            backgroundColor: farben.red,
            alignItems: "center", justifyContent: "center",
            paddingHorizontal: 4,
          }}
        >
          <Text
            style={{
              color: "#fff", fontSize: 10.5,
              fontFamily: "Barlow_700Bold", fontVariant: ["tabular-nums"],
            }}
          >
            {ungelesen > 9 ? "9+" : ungelesen}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
