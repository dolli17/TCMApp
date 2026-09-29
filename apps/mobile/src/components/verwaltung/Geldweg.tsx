/**
 * Der Weg des Geldes (Nachbau von apps/web/src/components/Geldweg.tsx)
 *
 * Fuenf Schritte, erledigt gruen mit Haekchen, aktuell gelb, offen grau
 * umrandet - am Telefon untereinander. Welcher Schritt wo steht, rechnet
 * @tcm/core (debitFlow). GeldwegBalken ist die kurze Form aus der Karte der
 * Uebersicht.
 */

import { Text, View } from "react-native";
import type { DebitStep } from "@tcm/core";
import { useTheme } from "@/lib/theme";

export function Geldweg({ schritte }: { schritte: DebitStep[] }) {
  const { farben } = useTheme();
  return (
    <View style={{ gap: 14 }}>
      {schritte.map((s) => {
        const erledigt = s.state === "erledigt";
        const aktuell = s.state === "aktuell";
        return (
          <View
            key={s.key}
            style={{ flexDirection: "row", gap: 10 }}
            accessibilityLabel={`${s.name}, ${erledigt ? "erledigt" : aktuell ? "jetzt dran" : "offen"}. ${s.info}`}
          >
            <View
              style={{
                width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center",
                backgroundColor: erledigt ? farben.green : aktuell ? farben.gold : "transparent",
                borderWidth: erledigt || aktuell ? 0 : 1.5, borderColor: farben.surf3,
              }}
            >
              <Text
                style={{
                  fontSize: 12, fontFamily: "Barlow_800ExtraBold",
                  color: erledigt ? "#fff" : aktuell ? farben.onGold : farben.muted,
                }}
              >
                {erledigt ? "✓" : s.nr}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 14.5, fontFamily: "Barlow_700Bold", color: s.state === "offen" ? farben.muted : farben.ink }}>
                {s.name}
              </Text>
              <Text style={{ fontSize: 12.5, lineHeight: 17.5, color: farben.muted, fontFamily: "Barlow_400Regular" }}>
                {s.info}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function GeldwegBalken({ schritte }: { schritte: DebitStep[] }) {
  const { farben } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {schritte.map((s) => (
        <View
          key={s.key}
          style={{
            flex: 1, height: 6, borderRadius: 3,
            backgroundColor: s.state === "erledigt" ? farben.green : s.state === "aktuell" ? farben.gold : farben.surf3,
          }}
        />
      ))}
    </View>
  );
}
