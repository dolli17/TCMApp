import { useFonts } from "expo-font";
import {
  Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold,
} from "@expo-google-fonts/barlow";
import {
  BarlowSemiCondensed_600SemiBold,
  BarlowSemiCondensed_700Bold,
  BarlowSemiCondensed_800ExtraBold,
} from "@expo-google-fonts/barlow-semi-condensed";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeAnbieter, useTheme } from "@/lib/theme";
import { setzeAnzeigeverhalten } from "@/lib/push";

// Einmal beim Start, nicht in einer Komponente: der Handler gehoert zum Modul
// und nicht zu einem Bildschirm, der auch wieder verschwinden kann.
setzeAnzeigeverhalten();

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
        <Stack.Screen name="index" options={{ headerShown: false }} />
        {/* Die Anmeldung traegt ihre eigene Buehne bis unter die Statusleiste. */}
        <Stack.Screen name="anmelden" options={{ headerShown: false }} />
        <Stack.Screen name="passwort-vergessen" options={{ headerShown: false }} />
        <Stack.Screen name="passwort-setzen" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="nachrichten" options={{ title: "Benachrichtigungen" }} />
      </Stack>
    </>
  );
}

export default function Layout() {
  // Die Schriftdateien liegen im Projekt, nicht bei Google - dieselbe
  // Entscheidung wie im Web. Bis sie geladen sind, zeigt die App einen
  // Ladekreis statt der Systemschrift; sonst springt das Layout.
  // Dieselben sieben Schnitte, die globals.css per @fontsource laedt.
  const [bereit] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
    BarlowSemiCondensed_600SemiBold,
    BarlowSemiCondensed_700Bold,
    BarlowSemiCondensed_800ExtraBold,
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
