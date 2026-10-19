/**
 * Verein: die Reiter (Getraenke | Veranstaltungen) und darueber gestapelt
 * eine Veranstaltung im Detail - mit Zurueck-Geste zur Liste.
 */

import { Stack } from "expo-router";
import { useTheme } from "@/lib/theme";

export default function VereinLayout() {
  const { farben } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: farben.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(reiter)" />
      <Stack.Screen name="veranstaltung/[id]" />
    </Stack>
  );
}
