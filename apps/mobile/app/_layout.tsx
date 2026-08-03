import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { farben } from "@/lib/stil";

export default function Layout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: farben.flaeche },
          headerTintColor: farben.text,
          contentStyle: { backgroundColor: farben.hintergrund },
        }}
      >
        <Stack.Screen name="index" options={{ title: "TC Muckensturm" }} />
        <Stack.Screen name="plan" options={{ title: "Plätze" }} />
        <Stack.Screen name="getraenke" options={{ title: "Getränke" }} />
        <Stack.Screen name="konto" options={{ title: "Mein Konto" }} />
      </Stack>
    </>
  );
}
