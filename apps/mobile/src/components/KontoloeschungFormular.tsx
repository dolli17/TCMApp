/**
 * Mitgliedschaft kuendigen beantragen (O9, Apple-Regel 5.1.1(v); U44)
 *
 * Erklaerung, freiwillige Nachricht, dann eine Rueckfrage im Blatt selbst -
 * kein Alert, der im Browser (Expo-Web) anders aussieht als auf dem Telefon.
 * Dieselben Saetze wie im Web unter /konto/loeschen (@tcm/core).
 */

import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { KONTOLOESCHUNG_NACHRICHT_MAX, KONTOLOESCHUNG_TEXT as T } from "@tcm/core";
import { abstand } from "@tcm/ui";
import { beantrageKontoloeschung } from "@/lib/daten";
import { mitDeckkraft } from "@/lib/stil";
import { useTheme } from "@/lib/theme";

export function KontoloeschungFormular() {
  const { stil, farben } = useTheme();
  const [nachricht, setNachricht] = useState("");
  const [rueckfrage, setRueckfrage] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const fertig = meldung?.ok === true;

  async function senden() {
    setLaeuft(true);
    const r = await beantrageKontoloeschung(nachricht);
    setLaeuft(false);
    setRueckfrage(false);
    setMeldung({ ok: r.ok, text: r.meldung });
  }

  return (
    <View style={{ gap: abstand.s }}>
      {T.erklaerung.map((satz) => (
        <Text key={satz} style={[stil.text, { lineHeight: 22 }]}>{satz}</Text>
      ))}

      {meldung && (
        <Text style={meldung.ok ? stil.hinweisErfolg : stil.hinweisFehler} accessibilityLiveRegion="polite">
          {meldung.text}
        </Text>
      )}

      {!fertig && (
        <>
          <View style={{ marginTop: abstand.s }}>
            <Text style={stil.feldLabel}>{T.nachrichtLabel}</Text>
            <TextInput
              style={[stil.feld, { minHeight: 96, textAlignVertical: "top", paddingTop: 12 }]}
              value={nachricht}
              onChangeText={setNachricht}
              accessibilityLabel={T.nachrichtLabel}
              multiline
              maxLength={KONTOLOESCHUNG_NACHRICHT_MAX}
              editable={!laeuft}
            />
          </View>

          {rueckfrage ? (
            <View style={{ gap: abstand.s, marginTop: abstand.s }}>
              <Text style={[stil.text, { fontFamily: "Barlow_700Bold" }]}>{T.bestaetigungFrage}</Text>
              <Pressable
                // Rot als Schrift und Rahmen, nicht als Flaeche: Weiss auf dem
                // hellen Rot des dunklen Themas waere kaum lesbar.
                style={[
                  stil.knopfLeise,
                  { borderColor: mitDeckkraft(farben.red, 0.5), minHeight: 52, justifyContent: "center" },
                  laeuft && { opacity: 0.5 },
                ]}
                onPress={senden}
                disabled={laeuft}
                accessibilityRole="button"
              >
                <Text style={[stil.knopfLeiseText, { color: farben.redInk }]}>{laeuft ? "Wird gesendet…" : T.bestaetigen}</Text>
              </Pressable>
              <Pressable
                style={stil.knopfLeise}
                onPress={() => setRueckfrage(false)}
                disabled={laeuft}
                accessibilityRole="button"
              >
                <Text style={stil.knopfLeiseText}>{T.abbrechen}</Text>
              </Pressable>
            </View>
          ) : (
            // Gefahr statt Gelb: der Antrag beendet die Mitgliedschaft (U44).
            <Pressable
              style={[
                stil.knopfLeise,
                { borderColor: mitDeckkraft(farben.red, 0.5), minHeight: 52, justifyContent: "center", marginTop: abstand.s },
              ]}
              onPress={() => {
                setMeldung(null);
                setRueckfrage(true);
              }}
              accessibilityRole="button"
            >
              <Text style={[stil.knopfLeiseText, { color: farben.redInk }]}>{T.absenden}</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}
