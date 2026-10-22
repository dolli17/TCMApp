/**
 * Passwort setzen
 *
 * Ziel des Links aus der E-Mail. Der Link bringt einen Einmal-Hash mit
 * (?token_hash=…&type=…), den die App hier mit verifyOtp gegen eine Sitzung
 * tauscht. Uebergangsweise zaehlt auch noch die fertige Sitzung im Fragment -
 * siehe src/lib/passwortlink.ts.
 *
 * Anders als PKCE braucht der Hash keinen Gegenschluessel auf dem Geraet, das
 * den Link angefordert hat: Wer den Reset am Telefon anstoesst und die Mail am
 * Rechner oeffnet, kommt trotzdem weiter. Der Verein hat Mitglieder bis 92.
 */

import { useEffect, useState } from "react";
import { View } from "react-native";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import {
  AnmeldeFeld, AnmeldeHinweis, AnmeldeLaden, AnmeldeSeite, GelberKnopf, LeiserVerweis,
} from "@/components/AnmeldeSeite";
import { passwortSetzen } from "@/lib/daten";
import { linkAuswerten, mitFrist } from "@/lib/passwortlink";
import { supabase } from "@/lib/supabase";

const ABGELAUFEN = "Dieser Link ist abgelaufen oder wurde schon benutzt.";
const OHNE_TOKEN =
  "Dieser Link ist unvollständig. Öffne ihn bitte direkt aus der E-Mail oder fordere einen neuen an.";
const KEIN_NETZ = "Keine Verbindung zum Server. Prüfe dein Internet und öffne den Link noch einmal.";

/** Laenger wartet niemand vor einem Ladekreis. */
const FRIST_MS = 15_000;

export default function PasswortSetzen() {
  const parameter = useLocalSearchParams();
  const adresse = Linking.useURL();
  const link = linkAuswerten(parameter, adresse);
  // Fuer die Abhaengigkeiten des Effekts: das Objekt ist bei jedem Rendern neu.
  const linkSchluessel =
    link.art === "token"
      ? `${link.typ}:${link.tokenHash}`
      : link.art === "fragment"
        ? `fragment:${link.accessToken}`
        : link.art;

  const [bereit, setBereit] = useState(false);
  const [linkFehler, setLinkFehler] = useState<string | null>(null);
  const [passwort, setPasswort] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    let aktiv = true;
    setBereit(false);
    setLinkFehler(null);

    (async () => {
      if (link.art === "ungueltig") {
        setLinkFehler(ABGELAUFEN);
        return;
      }

      try {
        if (link.art === "token" || link.art === "fragment") {
          // Nie zwei Konten zugleich - wie im Web: wer schon angemeldet ist und
          // den Link fuer ein anderes Konto oeffnet, wird erst abgemeldet.
          const { data } = await supabase.auth.getSession();
          if (data.session) await supabase.auth.signOut({ scope: "local" });

          const { error } = await mitFrist<{ error: unknown }>(
            link.art === "token"
              ? supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.typ })
              // Uebergang, bis die Cloud-Vorlagen token_hash schicken (S20).
              : supabase.auth.setSession({
                  access_token: link.accessToken,
                  refresh_token: link.refreshToken,
                }),
            FRIST_MS,
          );
          if (!aktiv) return;
          if (error) setLinkFehler(ABGELAUFEN);
          else setBereit(true);
          return;
        }

        // Ohne Link: Wer schon angemeldet ist, kann sein Passwort so aendern.
        const { data } = await mitFrist(supabase.auth.getSession(), FRIST_MS);
        if (!aktiv) return;
        if (data.session) setBereit(true);
        else setLinkFehler(OHNE_TOKEN);
      } catch {
        if (aktiv) setLinkFehler(KEIN_NETZ);
      }
    })();

    return () => {
      aktiv = false;
    };
  }, [linkSchluessel]);

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
          <View style={{ marginTop: "auto", gap: 6 }}>
            <GelberKnopf text="Neuen Link anfordern" onPress={() => router.replace("/passwort-vergessen")} />
            <LeiserVerweis text="Zurück zur Anmeldung" onPress={() => router.replace("/anmelden")} />
          </View>
        </>
      ) : !bereit ? (
        <AnmeldeLaden />
      ) : (
        <>
          <AnmeldeFeld
            beschriftung="Neues Passwort"
            value={passwort}
            onChangeText={setPasswort}
            passwort
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <AnmeldeFeld
            beschriftung="Noch einmal"
            accessibilityLabel="Passwort wiederholen"
            value={wiederholung}
            onChangeText={setWiederholung}
            passwort
            autoComplete="new-password"
            textContentType="newPassword"
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
