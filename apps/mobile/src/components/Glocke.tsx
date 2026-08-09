/**
 * Die Benachrichtigungsglocke
 *
 * Sitzt im Kopf jedes Tabs, wie im Web in beiden Menues. Der Zaehler wird bei
 * jedem Fokuswechsel neu geholt: sonst bliebe die rote Marke stehen, nachdem
 * die Nachrichten gelesen wurden.
 */

import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Symbol } from "@/components/Symbol";
import { zaehleUngelesen } from "@/lib/daten";
import { useTheme } from "@/lib/theme";

export function Glocke() {
  const { farben } = useTheme();
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
      style={{ paddingHorizontal: 14, paddingVertical: 6 }}
    >
      <Symbol name="glocke" farbe={farben.ink2} groesse={22} />
      {ungelesen > 0 && (
        <View
          style={{
            position: "absolute", top: 0, right: 8,
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
