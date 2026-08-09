/**
 * Anmeldung
 *
 * Nachbau der Auth-Buehne aus dem Web (globals.css, .auth): oben eine
 * blau-goldene Flaeche mit dem Vereinslogo, darunter ein Blatt, das ein Stueck
 * darueberrutscht. Die Form traegt die Marke - ein Formular auf grauem Grund
 * saehe aus wie jede andere App.
 */

import { useState } from "react";
import {
  Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View,
} from "react-native";
import { Link, router } from "expo-router";
import { Verlaufsflaeche } from "@/components/Verlaufsflaeche";
import { anmelden } from "@/lib/daten";
import { useTheme } from "@/lib/theme";
import logo from "@tcm/ui/logo.png";

export default function Anmeldung() {
  const { stil, farben } = useTheme();
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function absenden() {
    setFehler(null);
    setLaeuft(true);
    const ergebnis = await anmelden(email, passwort);
    setLaeuft(false);
    if (!ergebnis.ok) {
      setFehler(ergebnis.meldung);
      return;
    }
    router.replace("/plaetze");
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: farben.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <Verlaufsflaeche
          ohneSchatten
          stil={{ paddingTop: 64, paddingHorizontal: 26, paddingBottom: 44 }}
        >
          {/*
            tintColor faerbt jedes nicht durchsichtige Pixel weiss - dasselbe,
            was im Web filter: brightness(0) invert(1) tut. So braucht es keine
            zweite Logodatei fuer den dunklen Grund.
          */}
          <Image
            source={logo}
            style={{ width: 132, height: 38, tintColor: "#fff" }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Text
            style={{
              color: "#fff", fontSize: 30, marginTop: 18,
              fontFamily: "BarlowSemiCondensed_700Bold", letterSpacing: -0.3,
            }}
          >
            TC Muckensturm
          </Text>
          <Text style={{ color: "#fff", opacity: 0.88, fontSize: 14, marginTop: 6 }}>
            Platzbuchung, Getränke und Beiträge.
          </Text>
        </Verlaufsflaeche>

        <View
          style={{
            flex: 1, marginTop: -22, backgroundColor: farben.bg,
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingHorizontal: 22, paddingTop: 26, paddingBottom: 40,
          }}
        >
          <View style={{ width: "100%", maxWidth: 380, alignSelf: "center", gap: 12 }}>
            <View>
              <Text style={stil.feldLabel}>E-Mail</Text>
              <TextInput
                style={stil.feld}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="username"
                accessibilityLabel="E-Mail"
              />
            </View>

            <View>
              <Text style={stil.feldLabel}>Passwort</Text>
              <TextInput
                style={stil.feld}
                value={passwort}
                onChangeText={setPasswort}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                accessibilityLabel="Passwort"
                onSubmitEditing={absenden}
                returnKeyType="go"
              />
            </View>

            {fehler && <Text style={stil.hinweisFehler}>{fehler}</Text>}

            <Pressable
              style={[stil.knopf, laeuft && { opacity: 0.5 }]}
              onPress={absenden}
              disabled={laeuft}
              accessibilityRole="button"
            >
              <Text style={stil.knopfText}>{laeuft ? "Anmelden…" : "Anmelden"}</Text>
            </Pressable>

            <Link href="/passwort-vergessen" asChild>
              <Pressable accessibilityRole="link" style={{ alignItems: "center", paddingTop: 4 }}>
                <Text style={[stil.leise, { color: farben.blueInk }]}>Passwort vergessen?</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
