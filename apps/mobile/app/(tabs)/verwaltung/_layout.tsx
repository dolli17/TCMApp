/**
 * Die Verwaltung (nur mit Platzrechten)
 *
 * Ein Stack im Tab mit nur noch einem Bildschirm, den Plaetzen & Serien
 * (index.tsx). Er traegt den grossen Kopf wie die anderen Tabs. Der Rest der
 * Verwaltung liegt im Web unter /admin. Platzrechte haben Vorstand, App
 * Admin und Platzwart.
 *
 * Das Rollenschloss hier ist wie im Web nur die Oberflaeche - wer den Tab
 * nicht sehen darf, landet zurueck auf Home. Die eigentliche Absicherung
 * sitzt in den RPCs, die selbst private.darf_plaetze() pruefen.
 */

import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { ladeIchSelbst } from "@/lib/daten";
import { useTheme } from "@/lib/theme";

export default function VerwaltungLayout() {
  const { farben } = useTheme();
  const [platzRechte, setPlatzRechte] = useState<boolean | null>(null);

  useEffect(() => {
    let aktiv = true;
    ladeIchSelbst()
      .then((ich) => aktiv && setPlatzRechte(ich.platzRechte))
      .catch(() => aktiv && setPlatzRechte(false));
    return () => {
      aktiv = false;
    };
  }, []);

  if (platzRechte === null) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: farben.bg }}>
        <ActivityIndicator color={farben.blue} />
      </View>
    );
  }
  if (!platzRechte) return <Redirect href="/home" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: farben.surf },
        headerTintColor: farben.ink,
        headerTitleStyle: { fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 19 },
        headerBackTitle: "Zurück",
        contentStyle: { backgroundColor: farben.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false, title: "Plätze" }} />
    </Stack>
  );
}
