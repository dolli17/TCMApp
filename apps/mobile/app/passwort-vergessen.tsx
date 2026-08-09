/**
 * Passwort vergessen
 *
 * Fordert den Rueckleitungslink an. Die Adresse dafuer wird nicht fest
 * eingetragen, sondern mit Linking.createURL gebaut: in Expo Go lautet das
 * Schema exp://, erst im fertigen Build tcm://. Ein hart notiertes "tcm://..."
 * fuehrt in der Entwicklung ins Leere.
 */

import { useState } from "react";
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View,
} from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { Verlaufsflaeche } from "@/components/Verlaufsflaeche";
import { passwortLinkAnfordern } from "@/lib/daten";
import { useTheme } from "@/lib/theme";

export default function PasswortVergessen() {
  const { stil, farben } = useTheme();
  const [email, setEmail] = useState("");
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function absenden() {
    setLaeuft(true);
    const ergebnis = await passwortLinkAnfordern(email, Linking.createURL("/passwort-setzen"));
    setLaeuft(false);
    setMeldung(ergebnis.meldung);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: farben.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <Verlaufsflaeche
          ohneSchatten
          stil={{ paddingTop: 64, paddingHorizontal: 26, paddingBottom: 44 }}
        >
          <Text
            style={{
              color: "#fff", fontSize: 30,
              fontFamily: "BarlowSemiCondensed_700Bold", letterSpacing: -0.3,
            }}
          >
            Passwort vergessen
          </Text>
          <Text style={{ color: "#fff", opacity: 0.88, fontSize: 14, marginTop: 6 }}>
            Wir schicken dir einen Link zum Neusetzen.
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
                accessibilityLabel="E-Mail"
                onSubmitEditing={absenden}
                returnKeyType="send"
              />
            </View>

            {meldung && <Text style={stil.hinweisErfolg}>{meldung}</Text>}

            <Pressable
              style={[stil.knopf, laeuft && { opacity: 0.5 }]}
              onPress={absenden}
              disabled={laeuft}
              accessibilityRole="button"
            >
              <Text style={stil.knopfText}>{laeuft ? "Wird gesendet…" : "Link anfordern"}</Text>
            </Pressable>

            <Pressable
              onPress={() => router.replace("/anmelden")}
              accessibilityRole="link"
              style={{ alignItems: "center", paddingTop: 4 }}
            >
              <Text style={[stil.leise, { color: farben.blueInk }]}>Zurück zur Anmeldung</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
