/**
 * Die Verwaltung (nur Admins)
 *
 * Ein Stack im Tab mit nur noch einem Bildschirm, den Plaetzen & Serien
 * (index.tsx). Er traegt den grossen Kopf wie die anderen Tabs. Der Rest der
 * Verwaltung liegt im Web unter /admin.
 *
 * Das Rollenschloss hier ist wie im Web nur die Oberflaeche - wer den Tab
 * nicht sehen darf, landet zurueck auf Home. Die eigentliche Absicherung
 * sitzt in den RPCs, die selbst private.is_admin() pruefen.
 */

import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { ladeIchSelbst } from "@/lib/daten";
import { useTheme } from "@/lib/theme";

export default function VerwaltungLayout() {
  const { farben } = useTheme();
  const [admin, setAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let aktiv = true;
    ladeIchSelbst()
      .then((ich) => aktiv && setAdmin(ich.admin))
      .catch(() => aktiv && setAdmin(false));
    return () => {
      aktiv = false;
    };
  }, []);

  if (admin === null) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: farben.bg }}>
        <ActivityIndicator color={farben.blue} />
      </View>
    );
  }
  if (!admin) return <Redirect href="/home" />;

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
