/**
 * Eine Person aus dem Verzeichnis waehlen
 *
 * Nachbau von apps/web/src/components/Personensuche.tsx: genau ein Treffer,
 * ohne Gaeste. Das Verzeichnis kommt vorgeladen herein und wird im Geraet
 * gefiltert - bei rund 300 Mitgliedern ist jede Netzwerkrunde je
 * Tastendruck verschwendet.
 */

import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useTheme } from "@/lib/theme";
import type { Person } from "@/lib/verwaltung/mitglieder";

const TREFFER_MAX = 8;

export function Personensuche({
  verzeichnis,
  gewaehlt,
  onWahl,
  label,
  ausschluss = [],
  platzhalter = "Namen tippen…",
  deaktiviert,
}: {
  verzeichnis: Person[];
  gewaehlt: string | null;
  onWahl: (id: string | null) => void;
  label: string;
  /** Diese Personen tauchen in den Treffern nicht auf, etwa das Mitglied selbst. */
  ausschluss?: string[];
  platzhalter?: string;
  deaktiviert?: boolean;
}) {
  const { farben, stil } = useTheme();
  const [suche, setSuche] = useState("");

  const person = useMemo(() => verzeichnis.find((m) => m.id === gewaehlt) ?? null, [verzeichnis, gewaehlt]);

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (q.length === 0) return [];
    const raus = new Set(ausschluss);
    return verzeichnis
      .filter((m) => !raus.has(m.id) && m.id !== gewaehlt)
      // Beide Reihenfolgen: manche tippen "Meier Anna", manche "Anna Meier".
      .filter(
        (m) =>
          `${m.first_name} ${m.last_name}`.toLowerCase().includes(q) ||
          `${m.last_name} ${m.first_name}`.toLowerCase().includes(q),
      )
      .slice(0, TREFFER_MAX);
  }, [suche, verzeichnis, ausschluss, gewaehlt]);

  function waehle(id: string) {
    onWahl(id);
    setSuche("");
  }

  if (person) {
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} accessibilityLabel={`${label}: Auswahl`}>
        <Pressable
          style={[stil.marke, deaktiviert && { opacity: 0.5 }]}
          disabled={deaktiviert}
          accessibilityRole="button"
          accessibilityLabel={`${person.first_name} ${person.last_name} entfernen`}
          onPress={() => onWahl(null)}
        >
          <Text style={stil.markeText}>
            {person.last_name}, {person.first_name}
          </Text>
          <Text style={stil.markeWeg}>×</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <TextInput
        value={suche}
        onChangeText={setSuche}
        placeholder={platzhalter}
        placeholderTextColor={farben.muted}
        editable={!deaktiviert}
        autoCorrect={false}
        autoCapitalize="words"
        accessibilityLabel={label}
        returnKeyType="done"
        onSubmitEditing={() => treffer[0] && waehle(treffer[0].id)}
        style={[stil.feld, deaktiviert && { opacity: 0.5 }]}
      />
      {suche.trim().length > 0 && (
        <View
          accessibilityLabel="Gefundene Mitglieder"
          style={{ borderRadius: 14, borderWidth: 1, borderColor: farben.line, backgroundColor: farben.surf, overflow: "hidden" }}
        >
          {treffer.length === 0 ? (
            <Text style={[stil.leise, { padding: 12 }]}>Niemand gefunden</Text>
          ) : (
            treffer.map((m, i) => (
              <Pressable
                key={m.id}
                onPress={() => waehle(m.id)}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  paddingVertical: 12, paddingHorizontal: 14,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: farben.line,
                  backgroundColor: pressed ? farben.surf2 : "transparent",
                })}
              >
                <Text style={{ fontSize: 15, fontFamily: "Barlow_600SemiBold", color: farben.ink }}>
                  {m.last_name}, {m.first_name}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      )}
    </View>
  );
}
