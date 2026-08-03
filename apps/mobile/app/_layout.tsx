import { useFonts } from "expo-font";
import {
  Barlow_400Regular, Barlow_600SemiBold, Barlow_700Bold,
} from "@expo-google-fonts/barlow";
import { BarlowSemiCondensed_700Bold } from "@expo-google-fonts/barlow-semi-condensed";
import { ActivityIndicator, View } from "react-native";
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
  // Die Schriftdateien liegen im Projekt, nicht bei Google - dieselbe
  // Entscheidung wie im Web. Bis sie geladen sind, zeigt die App einen
  // Ladekreis statt der Systemschrift; sonst springt das Layout.
  const [bereit] = useFonts({
    Barlow_400Regular,
    Barlow_600SemiBold,
    Barlow_700Bold,
    BarlowSemiCondensed_700Bold,
  });

  if (!bereit) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: "#EBEFF3" }}>
        <ActivityIndicator color="#1A82C6" />
      </View>
    );
  }

  return (
    <ThemeAnbieter>
      <Navigation />
    </ThemeAnbieter>
  );
}
