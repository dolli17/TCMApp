/**
 * Eine Karte mit Feldern, die man erst aufklappen muss
 *
 * Gegenstueck zu apps/web/src/components/Stammdatenkarte.tsx. Die Felder
 * kommen als Liste herein, nicht als fest verdrahtete Formulare - so tragen
 * dieselbe Karte die eigenen Daten und der Notfallkontakt.
 *
 * Solange nicht bearbeitet wird, stehen die Werte als Text da. Ein Formular,
 * das immer offen ist, laedt zum versehentlichen Aendern ein, und auf dem
 * Telefon nimmt es dreimal so viel Platz.
 */

import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { abstand } from "@tcm/ui";
import { useTheme } from "@/lib/theme";
import type { Ergebnis } from "@/lib/daten";

export type Feld = {
  name: string;
  label: string;
  art?: "text" | "email" | "telefon";
};

type Eigenschaften = {
  titel: string;
  erklaerung?: string;
  felder: Feld[];
  werte: Record<string, string>;
  onSpeichern: (neu: Record<string, string>) => Promise<Ergebnis>;
  onGespeichert: () => void | Promise<void>;
};

export function Stammdatenformular({
  titel,
  erklaerung,
  felder,
  werte,
  onSpeichern,
  onGespeichert,
}: Eigenschaften) {
  const { stil } = useTheme();
  const [offen, setOffen] = useState(false);
  const [entwurf, setEntwurf] = useState(werte);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  function aufklappen() {
    // Der Entwurf startet immer beim gespeicherten Stand - sonst stuenden nach
    // einem Abbrechen noch die verworfenen Eingaben im Feld.
    setEntwurf(werte);
    setMeldung(null);
    setOffen(true);
  }

  async function speichern() {
    setLaeuft(true);
    const r = await onSpeichern(entwurf);
    setLaeuft(false);
    setMeldung({ ok: r.ok, text: r.meldung });
    if (r.ok) {
      setOffen(false);
      await onGespeichert();
    }
  }

  return (
    <View style={stil.karte}>
      <View style={stil.zeile}>
        <Text style={[stil.text, { fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 18 }]}>
          {titel}
        </Text>
        {!offen && (
          <Pressable
            onPress={aufklappen}
            accessibilityRole="button"
            style={[stil.knopfLeise, stil.knopfKlein]}
          >
            <Text style={[stil.knopfLeiseText, stil.knopfKleinText]}>Bearbeiten</Text>
          </Pressable>
        )}
      </View>

      {erklaerung && <Text style={stil.leise}>{erklaerung}</Text>}

      {meldung && (
        <Text style={meldung.ok ? stil.hinweisErfolg : stil.hinweisFehler}>{meldung.text}</Text>
      )}

      {offen ? (
        <>
          {felder.map((f) => (
            <View key={f.name}>
              <Text style={stil.feldLabel}>{f.label}</Text>
              <TextInput
                style={stil.feld}
                value={entwurf[f.name] ?? ""}
                onChangeText={(t) => setEntwurf((e) => ({ ...e, [f.name]: t }))}
                accessibilityLabel={f.label}
                autoCapitalize={f.art === "email" ? "none" : "sentences"}
                keyboardType={
                  f.art === "email" ? "email-address" : f.art === "telefon" ? "phone-pad" : "default"
                }
              />
            </View>
          ))}

          <View style={{ flexDirection: "row", gap: abstand.s, marginTop: abstand.s }}>
            <Pressable
              style={[stil.knopf, { flex: 1 }, laeuft && { opacity: 0.5 }]}
              onPress={speichern}
              disabled={laeuft}
              accessibilityRole="button"
            >
              <Text style={stil.knopfText}>{laeuft ? "Speichert…" : "Speichern"}</Text>
            </Pressable>
            <Pressable
              style={[stil.knopfLeise, { flex: 1 }]}
              onPress={() => setOffen(false)}
              disabled={laeuft}
              accessibilityRole="button"
            >
              <Text style={stil.knopfLeiseText}>Abbrechen</Text>
            </Pressable>
          </View>
        </>
      ) : (
        felder.map((f) => (
          <View key={f.name} style={stil.zeile}>
            <Text style={stil.leise}>{f.label}</Text>
            <Text style={stil.text}>{werte[f.name]?.trim() || "—"}</Text>
          </View>
        ))
      )}
    </View>
  );
}
