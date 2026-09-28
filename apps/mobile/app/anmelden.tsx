/**
 * Anmeldung (Entwurf AppLogin, docs/design/clubhaus)
 *
 * Immer dunkel, mit dem Platz in Perspektive oben - der Rahmen steht in
 * AnmeldeSeite.tsx. Die Form traegt die Marke; ein Formular auf grauem Grund
 * saehe aus wie jede andere App.
 */

import { useState } from "react";
import { Linking, View } from "react-native";
import { router } from "expo-router";
import {
  AnmeldeFeld, AnmeldeFusszeile, AnmeldeHinweis, AnmeldeSeite, GelberKnopf, LeiserVerweis,
} from "@/components/AnmeldeSeite";
import { anmelden } from "@/lib/daten";

export default function Anmeldung() {
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
    router.replace("/home");
  }

  return (
    <AnmeldeSeite titel="Willkommen zurück auf dem Platz.">
      <AnmeldeFeld
        beschriftung="E-Mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
      />
      <AnmeldeFeld
        beschriftung="Passwort"
        value={passwort}
        onChangeText={setPasswort}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={absenden}
        returnKeyType="go"
      />
      <LeiserVerweis rechts text="Passwort vergessen?" onPress={() => router.push("/passwort-vergessen")} />

      {/* Die Meldung verraet bewusst nicht, ob die Adresse existiert. */}
      {fehler && <AnmeldeHinweis text={fehler} />}

      <View style={{ marginTop: "auto", gap: 14 }}>
        <GelberKnopf text={laeuft ? "Anmelden…" : "Anmelden"} onPress={absenden} gesperrt={laeuft} />
        {SITE_URL !== "" && (
          <AnmeldeFusszeile
            text="Noch kein Mitglied?"
            verweis="Antrag stellen"
            onPress={() => Linking.openURL(`${SITE_URL}/antrag`)}
          />
        )}
      </View>
    </AnmeldeSeite>
  );
}

/** Der Mitgliedsantrag liegt im Web; ohne Adresse (lokal) bleibt die Zeile weg. */
const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
