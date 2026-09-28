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
import { View } from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import {
  AnmeldeFeld, AnmeldeHinweis, AnmeldeLaden, AnmeldeSeite, GelberKnopf,
} from "@/components/AnmeldeSeite";
import { passwortSetzen } from "@/lib/daten";
import { supabase } from "@/lib/supabase";

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
    <AnmeldeSeite titel="Passwort festlegen" unterzeile="Mindestens acht Zeichen.">
      {linkFehler ? (
        <>
          <AnmeldeHinweis text={linkFehler} />
          <GelberKnopf text="Neuen Link anfordern" onPress={() => router.replace("/passwort-vergessen")} />
        </>
      ) : !bereit ? (
        <AnmeldeLaden />
      ) : (
        <>
          <AnmeldeFeld
            beschriftung="Neues Passwort"
            value={passwort}
            onChangeText={setPasswort}
            secureTextEntry
            autoComplete="new-password"
          />
          <AnmeldeFeld
            beschriftung="Noch einmal"
            accessibilityLabel="Passwort wiederholen"
            value={wiederholung}
            onChangeText={setWiederholung}
            secureTextEntry
            autoComplete="new-password"
            onSubmitEditing={absenden}
            returnKeyType="go"
          />

          {fehler && <AnmeldeHinweis text={fehler} />}

          <View style={{ marginTop: "auto" }}>
            <GelberKnopf text={laeuft ? "Wird gespeichert…" : "Speichern"} onPress={absenden} gesperrt={laeuft} />
          </View>
        </>
      )}
    </AnmeldeSeite>
  );
}
