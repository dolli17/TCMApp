/**
 * Kleine Bausteine, die nur die Kasse braucht: Hinweis (.hinweis),
 * Betrag mit Statusmarke (.neben), Unterzeile und Zahlwort.
 */

import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { formatCents } from "@tcm/core";
import { Statusmarke, type MarkenTon } from "@/components/verwaltung/Liste";
import { useTheme } from "@/lib/theme";

/** Ein Hinweis im Fluss der Seite: rot fuer Fehlendes, sonst ruhig. */
export function Hinweis({ children, fehler }: { children: ReactNode; fehler?: boolean }) {
  const { farben, stil } = useTheme();
  if (fehler) {
    return typeof children === "string" ? (
      <Text style={stil.hinweisFehler}>{children}</Text>
    ) : (
      <View style={[stil.hinweisFehler, { gap: 4 }]}>{children}</View>
    );
  }
  return (
    <View style={{ padding: 12, borderRadius: 14, backgroundColor: farben.surf2, gap: 4 }}>
      {typeof children === "string" ? (
        <Text style={{ fontSize: 14, lineHeight: 19.5, color: farben.ink2, fontFamily: "Barlow_400Regular" }}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

/** Rechte Spalte einer Zeile: Betrag, darunter die Marke. */
export function BetragMitMarke({
  cents,
  marke,
  ton,
}: {
  cents: number;
  marke?: string;
  ton?: MarkenTon;
}) {
  const { farben } = useTheme();
  return (
    <View style={{ alignItems: "flex-end", gap: 4, maxWidth: "42%" }}>
      <Text style={{ fontSize: 15, fontFamily: "Barlow_700Bold", color: farben.ink, fontVariant: ["tabular-nums"] }}>
        {formatCents(cents)}
      </Text>
      {marke && <Statusmarke text={marke} ton={ton} />}
    </View>
  );
}

/** Unterzeile unter einem Gruppenkopf (.unterzeile). */
export function Unterzeile({ children }: { children: ReactNode }) {
  const { farben } = useTheme();
  return (
    <Text style={{ fontSize: 14, lineHeight: 19.5, marginHorizontal: 4, color: farben.ink2, fontFamily: "Barlow_400Regular" }}>
      {children}
    </Text>
  );
}

/** Einzahl oder Mehrzahl. */
export function zahlwort(n: number, eins: string, viele: string): string {
  return `${n} ${n === 1 ? eins : viele}`;
}

export const KEIN_DATUM = "Bitte ein Datum als TT.MM.JJJJ eingeben.";
