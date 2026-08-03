import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeAnbieter, useTheme } from "@/lib/theme";

function Navigation() {
  const { theme, farben } = useTheme();
  return (
    <>
      <StatusBar style={theme === "dunkel" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: farben.surf },
          headerTintColor: farben.ink,
          headerTitleStyle: { fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 19 },
          contentStyle: { backgroundColor: farben.bg },
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

export default function Layout() {
  return (
    <ThemeAnbieter>
      <Navigation />
    </ThemeAnbieter>
  );
}
