/**
 * Reiter innerhalb eines Bereichs
 *
 * Gegenstueck zu apps/web/src/components/PlanReiter.tsx. Waagerecht scrollbar
 * wie .reiter { overflow-x: auto } im Web, damit auch auf schmalen Geraeten
 * kein Eintrag abgeschnitten wird.
 */

import { Pressable, ScrollView, Text } from "react-native";
import { usePathname, router } from "expo-router";
import { useTheme } from "@/lib/theme";

export type ReiterEintrag = { pfad: string; label: string };

/**
 * Genau ein Reiter ist aktiv.
 *
 * Kein Praefixvergleich wie in der Hauptnavigation: die drei Ziele liegen
 * ineinander (/plaetze, /plaetze/meine), und ein Praefixtreffer wuerde
 * "Belegung" dauerhaft mitmarkieren. Unterseiten gibt es hier keine.
 */
function istAktiv(pfad: string, ziel: string): boolean {
  return pfad === ziel;
}

export function Reiter({ eintraege }: { eintraege: ReiterEintrag[] }) {
  const { farben, stil } = useTheme();
  const pfad = usePathname();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, backgroundColor: farben.surf }}
      contentContainerStyle={stil.reiter}
    >
      {eintraege.map((e) => {
        const aktiv = istAktiv(pfad, e.pfad);
        return (
          <Pressable
            key={e.pfad}
            onPress={() => router.replace(e.pfad)}
            accessibilityRole="tab"
            accessibilityState={{ selected: aktiv }}
            style={[stil.reiterKnopf, aktiv && stil.reiterKnopfAktiv]}
          >
            <Text style={[stil.reiterText, aktiv && stil.reiterTextAktiv]}>{e.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
