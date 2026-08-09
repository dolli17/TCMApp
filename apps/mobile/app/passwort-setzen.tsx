/**
 * Passwort setzen
 *
 * Ziel des Links aus der E-Mail. Der Supabase-Client steht in React Native auf
 * detectSessionInUrl: false - die Sitzung aus der Rueckleitung muss die App
 * also selbst herauslesen und setzen.
 *
 * Supabase liefert dabei die Variante mit den Wertmarken direkt in der Adresse.
 * PKCE waere sicherer, verlangt aber, dass der Link auf demselben Geraet
 * geoeffnet wird, das ihn angefordert hat - der Gegenschluessel liegt in dessen
 * Speicher. Wer den Reset am Telefon anstoesst und die Mail am Rechner oeffnet,
 * stuende sonst vor einer Fehlermeldung, die nichts erklaert. Der Verein hat
 * Mitglieder bis 92; die Nachsicht wiegt hier schwerer.
 */

import { useEffect, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View,
} from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { Verlaufsflaeche } from "@/components/Verlaufsflaeche";
import { passwortSetzen } from "@/lib/daten";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

/** Supabase haengt die Marken hinter das Rautezeichen, nicht als Abfrage an. */
function marktenAus(adresse: string): Record<string, string> {
  const roh = adresse.includes("#") ? adresse.slice(adresse.indexOf("#") + 1) : "";
  const abfrage = adresse.includes("?")
    ? adresse.slice(adresse.indexOf("?") + 1).split("#")[0]!
    : "";

  const out: Record<string, string> = {};
  for (const teil of [roh, abfrage]) {
    for (const paar of teil.split("&")) {
      const [name, wert] = paar.split("=");
      if (name && wert) out[name] = decodeURIComponent(wert);
    }
  }
  return out;
}

export default function PasswortSetzen() {
  const { stil, farben } = useTheme();
  const adresse = Linking.useURL();

  const [bereit, setBereit] = useState(false);
  const [linkFehler, setLinkFehler] = useState<string | null>(null);
  const [passwort, setPasswort] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    // Wer schon angemeldet ist, kann sein Passwort ohne Link aendern.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setBereit(true);
    });
  }, []);

  useEffect(() => {
    if (!adresse) return;
    const marken = marktenAus(adresse);

    if (marken.error_description || marken.error) {
      setLinkFehler("Dieser Link ist abgelaufen oder wurde schon benutzt.");
      return;
    }

    if (marken.access_token && marken.refresh_token) {
      supabase.auth
        .setSession({
          access_token: marken.access_token,
          refresh_token: marken.refresh_token,
        })
        .then(({ error }) => {
          if (error) setLinkFehler("Dieser Link ist abgelaufen oder wurde schon benutzt.");
          else setBereit(true);
        });
    }
  }, [adresse]);

  async function absenden() {
    setFehler(null);
    if (passwort.length < 8) {
      setFehler("Das Passwort braucht mindestens acht Zeichen.");
      return;
    }
    if (passwort !== wiederholung) {
      setFehler("Die beiden Eingaben stimmen nicht überein.");
      return;
    }

    setLaeuft(true);
    const ergebnis = await passwortSetzen(passwort);
    setLaeuft(false);
    if (!ergebnis.ok) {
      setFehler(ergebnis.meldung);
      return;
    }
    router.replace("/");
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
            Passwort festlegen
          </Text>
          <Text style={{ color: "#fff", opacity: 0.88, fontSize: 14, marginTop: 6 }}>
            Mindestens acht Zeichen.
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
            {linkFehler ? (
              <>
                <Text style={stil.hinweisFehler}>{linkFehler}</Text>
                <Pressable
                  style={stil.knopf}
                  onPress={() => router.replace("/passwort-vergessen")}
                  accessibilityRole="button"
                >
                  <Text style={stil.knopfText}>Neuen Link anfordern</Text>
                </Pressable>
              </>
            ) : !bereit ? (
              <ActivityIndicator color={farben.blue} style={{ marginTop: 24 }} />
            ) : (
              <>
                <View>
                  <Text style={stil.feldLabel}>Neues Passwort</Text>
                  <TextInput
                    style={stil.feld}
                    value={passwort}
                    onChangeText={setPasswort}
                    secureTextEntry
                    autoComplete="new-password"
                    accessibilityLabel="Neues Passwort"
                  />
                </View>

                <View>
                  <Text style={stil.feldLabel}>Noch einmal</Text>
                  <TextInput
                    style={stil.feld}
                    value={wiederholung}
                    onChangeText={setWiederholung}
                    secureTextEntry
                    autoComplete="new-password"
                    accessibilityLabel="Passwort wiederholen"
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
                  <Text style={stil.knopfText}>{laeuft ? "Wird gespeichert…" : "Speichern"}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
