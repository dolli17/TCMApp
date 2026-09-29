/**
 * Eine Gruppe von Einstellungen (Nachbau von
 * apps/web/src/components/EinstellungsGruppe.tsx)
 *
 * Je Themengruppe eine Karte mit eigenem Speichern und eigener Rueckmeldung:
 * wer die Schliesszeit aendert, soll nicht versehentlich die Glaeubiger-ID
 * mit abschicken. Die Felder stehen als Zeilen, der Schluessel klein darunter.
 */

import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Gruppenkopf, ListenGruppe } from "@/components/verwaltung/Liste";
import { Knopf, Meldung, useAktion } from "@/components/verwaltung/Formular";
import { einstellungsText, speichereEinstellungen, type Einstellung } from "@/lib/verwaltung/gemeinsam";
import { useTheme } from "@/lib/theme";

function tastatur(valueType: string) {
  return valueType === "integer" ? ("number-pad" as const) : ("default" as const);
}

function platzhalter(valueType: string) {
  if (valueType === "time") return "HH:MM";
  if (valueType === "date") return "JJJJ-MM-TT";
  return undefined;
}

export function EinstellungsGruppe({
  titel,
  text,
  eintraege,
  onGespeichert,
}: {
  titel: string;
  text?: string;
  eintraege: Einstellung[];
  onGespeichert?: () => void;
}) {
  const { farben, stil } = useTheme();
  const alt = Object.fromEntries(eintraege.map((e) => [e.key, einstellungsText(e.value)]));
  const [werte, setWerte] = useState<Record<string, string>>(alt);
  const { laeuft, meldung, ausfuehren } = useAktion();

  if (eintraege.length === 0) return null;

  return (
    <View style={{ gap: 12 }}>
      <Gruppenkopf titel={titel} />
      {text && <Text style={[stil.leise, { fontSize: 14, marginHorizontal: 4, color: farben.ink2 }]}>{text}</Text>}
      <Meldung meldung={meldung} />
      <ListenGruppe>
        {eintraege.map((e) => (
          <View key={e.key} style={{ paddingVertical: 14, paddingHorizontal: 16, gap: 2 }}>
            <Text style={{ fontSize: 15, fontFamily: "Barlow_600SemiBold", color: farben.ink }}>{e.label ?? e.key}</Text>
            {e.description && (
              <Text style={{ fontSize: 12.5, color: farben.muted, fontFamily: "Barlow_400Regular", marginBottom: 5 }}>
                {e.description}
              </Text>
            )}
            <TextInput
              value={werte[e.key] ?? ""}
              onChangeText={(w) => setWerte((v) => ({ ...v, [e.key]: w }))}
              keyboardType={tastatur(e.value_type)}
              placeholder={platzhalter(e.value_type)}
              placeholderTextColor={farben.muted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={e.label ?? e.key}
              style={[stil.feld, { marginTop: 4 }]}
            />
            <Text style={{ fontSize: 11.5, color: farben.muted, fontFamily: "Menlo", marginTop: 4 }}>{e.key}</Text>
          </View>
        ))}
      </ListenGruppe>
      <Knopf
        text="Speichern"
        laeuftText="Wird gespeichert…"
        laeuft={laeuft}
        onPress={() => void ausfuehren(() => speichereEinstellungen(werte, alt), onGespeichert)}
      />
    </View>
  );
}
