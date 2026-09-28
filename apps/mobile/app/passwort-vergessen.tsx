/**
 * Passwort vergessen
 *
 * Fordert den Rueckleitungslink an. Die Adresse dafuer wird nicht fest
 * eingetragen, sondern mit Linking.createURL gebaut: in Expo Go lautet das
 * Schema exp://, erst im fertigen Build tcm://. Ein hart notiertes "tcm://..."
 * fuehrt in der Entwicklung ins Leere.
 */

import { useState } from "react";
import { View } from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import {
  AnmeldeFeld, AnmeldeHinweis, AnmeldeSeite, GelberKnopf, LeiserVerweis,
} from "@/components/AnmeldeSeite";
import { passwortLinkAnfordern } from "@/lib/daten";

export default function PasswortVergessen() {
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
    <AnmeldeSeite titel="Passwort vergessen" unterzeile="Wir schicken dir einen Link zum Neusetzen.">
      <AnmeldeFeld
        beschriftung="E-Mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        onSubmitEditing={absenden}
        returnKeyType="send"
      />

      {/* Die Meldung ist dieselbe, ob es die Adresse gibt oder nicht. */}
      {meldung && <AnmeldeHinweis ok text={meldung} />}

      <View style={{ marginTop: "auto", gap: 6 }}>
        <GelberKnopf text={laeuft ? "Wird gesendet…" : "Link anfordern"} onPress={absenden} gesperrt={laeuft} />
        <LeiserVerweis text="Zurück zur Anmeldung" onPress={() => router.replace("/anmelden")} />
      </View>
    </AnmeldeSeite>
  );
}
