/**
 * Die Verwaltung (nur Admins)
 *
 * Ein Stack im Tab: die Uebersicht traegt den grossen Kopf wie die anderen
 * Tabs, die Bereiche darunter oeffnen sich mit nativem Kopf und
 * Zurueck-Pfeil. Der Baum folgt apps/web/src/app/admin, damit die
 * Sprungziele aus @tcm/core (adminTodos) nur ihr Praefix tauschen muessen.
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
      <Stack.Screen name="index" options={{ headerShown: false, title: "Verwaltung" }} />
      <Stack.Screen name="mitglieder/index" options={{ title: "Mitglieder" }} />
      <Stack.Screen name="mitglieder/[id]" options={{ title: "Mitglied" }} />
      <Stack.Screen name="mitglieder/antraege" options={{ title: "Anträge" }} />
      <Stack.Screen name="mitglieder/mannschaften" options={{ title: "Mannschaften" }} />
      <Stack.Screen name="arbeitsdienst" options={{ title: "Arbeitsdienst" }} />
      <Stack.Screen name="kasse/index" options={{ title: "Kasse" }} />
      <Stack.Screen name="kasse/lastschriften/[id]" options={{ title: "Lastschriftlauf" }} />
      <Stack.Screen name="plaetze" options={{ title: "Plätze & Serien" }} />
      <Stack.Screen name="getraenke" options={{ title: "Getränke" }} />
      <Stack.Screen name="system/index" options={{ title: "System" }} />
      <Stack.Screen name="system/merkmale" options={{ title: "Merkmale" }} />
    </Stack>
  );
}
