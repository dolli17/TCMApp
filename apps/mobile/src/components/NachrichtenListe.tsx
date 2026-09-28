/**
 * Die Benachrichtigungen im neuen Look (docs/design/clubhaus)
 *
 * Nach Tagen gruppiert (groupNotifications), je Art ein Symbol
 * (notificationSymbol), relative Zeit, ungelesene auf goldSoft. Dieselbe
 * Liste steht im Blatt hinter der Glocke und auf der Seite /nachrichten.
 *
 * Gelesen markiert wird weiter beim Oeffnen (siehe app/nachrichten.tsx und
 * Glocke). Die Hervorhebung bleibt aber stehen, bis "Alle als gelesen" sie
 * wegnimmt - sonst saehe niemand, was neu war.
 */

import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  groupNotifications, notificationSymbol, relativeTimeLabel, type NotificationSymbol,
} from "@tcm/core";
import { radius } from "@tcm/ui";
import type { ladeBenachrichtigungen } from "@/lib/daten";
import { useTheme } from "@/lib/theme";

export type Nachricht = Awaited<ReturnType<typeof ladeBenachrichtigungen>>[number];

const SYMBOL: Record<NotificationSymbol, string> = {
  platz: "M4 4h16v16H4zM4 12h16M8 8h8v8H8zM12 8v8",
  storno: "M6 6l12 12M18 6 6 18",
  geld: "M2 7h20v12H2zM2 11h20M6 15h4",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  glocke: "M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0",
};

/** "Alle als gelesen" - erscheint nur, solange etwas hervorgehoben ist. */
export function AlleGelesenKnopf({ onPress }: { onPress: () => void }) {
  const { farben } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={6}
      style={{ minHeight: 44, justifyContent: "center" }}
    >
      <Text style={{ fontSize: 14, fontFamily: "Barlow_700Bold", color: farben.blueInk }}>Alle als gelesen</Text>
    </Pressable>
  );
}

export function NachrichtenListe({ liste, alleGesehen }: { liste: Nachricht[]; alleGesehen: boolean }) {
  const { stil, farben } = useTheme();

  if (liste.length === 0) {
    return <Text style={stil.leise}>Es liegt nichts vor.</Text>;
  }

  return (
    <View style={{ gap: 18 }}>
      {groupNotifications(liste).map((g) => (
        <View key={g.label} style={{ gap: 8 }}>
          <Text style={stil.kicker} accessibilityRole="header">{g.label}</Text>
          <View
            style={{
              borderRadius: radius.karte, borderWidth: 1, borderColor: farben.line,
              backgroundColor: farben.surf, overflow: "hidden",
            }}
          >
            {g.items.map((n, i) => {
              const neu = n.read_at === null && !alleGesehen;
              return (
                <View
                  key={n.id}
                  accessibilityLabel={`${neu ? "Neu: " : ""}${n.title}. ${n.body}. ${relativeTimeLabel(n.created_at)}`}
                  style={{
                    flexDirection: "row", gap: 12, paddingVertical: 14, paddingHorizontal: 16,
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: farben.line,
                    backgroundColor: neu ? farben.goldSoft : "transparent",
                  }}
                >
                  <View
                    style={{
                      width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center",
                      backgroundColor: neu ? farben.surf : farben.surf2,
                    }}
                  >
                    <Svg width={20} height={20} viewBox="0 0 24 24">
                      <Path
                        d={SYMBOL[notificationSymbol(n.kind)]}
                        stroke={neu ? farben.ink : farben.ink2}
                        strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round"
                      />
                    </Svg>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                      <Text style={{ flex: 1, fontSize: 15, fontFamily: "Barlow_700Bold", color: farben.ink }}>
                        {n.title}
                      </Text>
                      <Text style={{ fontSize: 12, color: farben.muted, fontFamily: "Barlow_400Regular" }}>
                        {relativeTimeLabel(n.created_at)}
                      </Text>
                    </View>
                    <Text
                      style={{ fontSize: 13.5, lineHeight: 19, color: farben.ink2, marginTop: 2, fontFamily: "Barlow_400Regular" }}
                    >
                      {n.body}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
