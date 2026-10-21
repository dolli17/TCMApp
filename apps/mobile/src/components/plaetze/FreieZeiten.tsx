/**
 * Freie Zeiten (docs/design/clubhaus/plaetze, PlFreieZeiten)
 *
 * Eine Zeile je Startzeit mit einem Kaestchen je Platz und "n frei". Antippen
 * klappt die Zeile auf: freie Plaetze als grosse Knoepfe, Spiele, die
 * Mitspieler suchen, die eigene Buchung und - mit Platzrechten - Sperrungen,
 * die sich dort bearbeiten und aufheben lassen. Immer nur eine Zeile offen.
 *
 * Die Zeilen rechnet @tcm/core (freeSlotsOfDay, also courtStatusAt und
 * canStartAt).
 */

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { freeSlotsOfDay, minutesOf, type CourtStatusKind } from "@tcm/core";
import { alsUhrzeit, type Belegung } from "@/lib/plan";
import { useTheme } from "@/lib/theme";
import { platzNummer, useJetzt, type Platz } from "./PlatzRaster";

export function FreieZeiten({
  datum, plaetze, belegung, oeffnung, schluss, raster, dauer, onBuchen, oeffnebar, onOeffnen,
}: {
  datum: string;
  plaetze: Platz[];
  belegung: Belegung[];
  oeffnung: number;
  schluss: number;
  raster: number;
  dauer: number;
  onBuchen: (platz: Platz, minute: number) => void;
  /** Ob sich eine Belegung im Blatt oeffnen laesst - Sperrungen nur mit Platzrechten. */
  oeffnebar: (b: Belegung) => boolean;
  onOeffnen: (platz: Platz, b: Belegung) => void;
}) {
  const { farben } = useTheme();
  const jetzt = useJetzt();
  const [offen, setOffen] = useState<number | null>(null);

  const zeilen = freeSlotsOfDay({
    day: datum, courtIds: plaetze.map((p) => p.id), openingMinutes: oeffnung, closingMinutes: schluss,
    slotMinutes: raster, durationMinutes: dauer, occupied: belegung, now: jetzt,
  });
  const platzVon = (id: string) => plaetze.find((p) => p.id === id)!;

  const kaestchen = (art: CourtStatusKind): object => {
    if (art === "frei") return { backgroundColor: farben.green };
    if (art === "eigen") return { backgroundColor: farben.gold };
    if (art === "sucht") {
      return { backgroundColor: farben.goldSoft, borderWidth: 1.5, borderStyle: "dashed", borderColor: farben.goldLine };
    }
    return { backgroundColor: farben.surf3 };
  };

  // Ohne Plaetze (noch nicht geladen) stuende ueberall "voll".
  if (plaetze.length === 0) return null;
  if (zeilen.length === 0) {
    return (
      <Text style={{ fontSize: 14, color: farben.muted, fontFamily: "Barlow_500Medium" }}>
        An diesem Tag lässt sich keine Stunde mehr buchen.
      </Text>
    );
  }

  return (
    <View
      style={{
        borderRadius: 22, overflow: "hidden", backgroundColor: farben.surf,
        borderWidth: 1, borderColor: farben.line,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          flexDirection: "row", alignItems: "center", height: 40, paddingLeft: 16, paddingRight: 12,
          borderBottomWidth: 1, borderBottomColor: farben.line,
        }}
      >
        <Text style={[kopfStil(farben.muted), { width: 64 }]}>BEGINN</Text>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {plaetze.map((p) => (
            <Text key={p.id} style={[kopfStil(farben.muted), { width: 18, textAlign: "center", letterSpacing: 0 }]}>
              {platzNummer(p)}
            </Text>
          ))}
        </View>
        <Text style={[kopfStil(farben.muted), { marginLeft: "auto" }]}>PLATZ</Text>
      </View>

      {zeilen.map((z, i) => {
        const istOffen = offen === z.minute;
        const sucht = z.courts.filter(
          (c) => c.status.art === "sucht" && !c.status.belegung?.bin_dabei,
        );
        const eigen = z.courts.filter((c) => c.status.art === "eigen");
        const frei = z.courts.filter((c) => c.status.art === "frei");
        const gesperrt = z.courts.filter(
          (c) => c.status.art === "gesperrt" && c.status.belegung && oeffnebar(c.status.belegung),
        );

        const label = [
          `${alsUhrzeit(z.minute)} Uhr`,
          z.free === 0 ? "kein Platz frei" : z.free === 1 ? "1 Platz frei" : `${z.free} Plätze frei`,
          ...sucht.map((c) => `${platzVon(c.courtId).name} sucht Mitspieler`),
          ...eigen.map((c) => `du spielst auf ${platzVon(c.courtId).name}`),
        ].join(", ");

        return (
          <View
            key={z.minute}
            style={{
              borderBottomWidth: i === zeilen.length - 1 ? 0 : 1, borderBottomColor: farben.line,
              backgroundColor: istOffen ? farben.surf2 : "transparent",
            }}
          >
            <Pressable
              onPress={() => setOffen(istOffen ? null : z.minute)}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ expanded: istOffen }}
              style={{ flexDirection: "row", alignItems: "center", height: 60, paddingLeft: 16, paddingRight: 12 }}
            >
              <Text
                style={{
                  width: 64, fontSize: 22, fontFamily: "BarlowSemiCondensed_700Bold",
                  color: farben.ink, fontVariant: ["tabular-nums"],
                }}
              >
                {alsUhrzeit(z.minute)}
              </Text>
              <View
                style={{ flexDirection: "row", gap: 4 }}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {z.courts.map((c) => (
                  <View key={c.courtId} style={[{ width: 18, height: 24, borderRadius: 5 }, kaestchen(c.status.art)]} />
                ))}
              </View>
              <Text
                style={{
                  marginLeft: "auto", fontSize: 14, fontFamily: "Barlow_700Bold",
                  color: z.free >= 3 ? farben.greenInk : z.free > 0 ? farben.ink : farben.muted,
                }}
              >
                {z.free === 0 ? "voll" : `${z.free} frei`}
              </Text>
              <Svg width={16} height={16} viewBox="0 0 24 24" style={{ marginLeft: 6, transform: [{ rotate: istOffen ? "90deg" : "0deg" }] }}>
                <Path d="M9 6l6 6-6 6" stroke={farben.muted} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>

            {istOffen && (
              <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                <Text style={{ fontSize: 13, color: farben.ink2, fontFamily: "Barlow_500Medium", marginBottom: 10 }}>
                  {alsUhrzeit(z.minute)} – {alsUhrzeit(z.minute + dauer)} ·{" "}
                  {frei.length > 0 ? "Welcher Platz?" : "Kein Platz frei"}
                </Text>

                {frei.length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {frei.map((c) => {
                      const p = platzVon(c.courtId);
                      return (
                        <Pressable
                          key={c.courtId}
                          onPress={() => onBuchen(p, z.minute)}
                          accessibilityRole="button"
                          accessibilityLabel={`${p.name} um ${alsUhrzeit(z.minute)} Uhr buchen`}
                          style={({ pressed }) => ({
                            flexBasis: "30%", flexGrow: 1, maxWidth: "33%", height: 48, borderRadius: 14,
                            alignItems: "center", justifyContent: "center",
                            backgroundColor: farben.green, opacity: pressed ? 0.85 : 1,
                          })}
                        >
                          <Text style={{ fontSize: 15, fontFamily: "Barlow_800ExtraBold", color: farben.bg }}>{p.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {sucht.map((c) => {
                  const p = platzVon(c.courtId);
                  const b = c.status.belegung!;
                  const typ = b.type_name ?? "Spiel";
                  return (
                    <Pressable
                      key={c.courtId}
                      onPress={() => onOeffnen(p, b)}
                      accessibilityRole="button"
                      accessibilityLabel={`${p.name}, ${typ} sucht noch ${b.frei ?? 1}, mitspielen`}
                      style={{
                        marginTop: 8, height: 48, borderRadius: 14, paddingHorizontal: 14,
                        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                        borderWidth: 1.5, borderStyle: "dashed", borderColor: farben.goldLine,
                        backgroundColor: farben.goldSoft,
                      }}
                    >
                      <Text style={{ fontSize: 14.5, fontFamily: "Barlow_700Bold", color: farben.goldInk }}>
                        {p.name} · {typ} sucht noch {b.frei ?? 1}
                      </Text>
                      <Text style={{ fontSize: 14.5, fontFamily: "Barlow_700Bold", color: farben.goldInk }}>Mitspielen</Text>
                    </Pressable>
                  );
                })}

                {gesperrt.map((c) => {
                  const p = platzVon(c.courtId);
                  return (
                    <Pressable
                      key={c.courtId}
                      onPress={() => onOeffnen(p, c.status.belegung!)}
                      accessibilityRole="button"
                      accessibilityLabel={`${p.name}, ${c.status.text}, öffnen`}
                      accessibilityHint="Sperrung bearbeiten oder aufheben"
                      style={({ pressed }) => ({
                        marginTop: 8, minHeight: 48, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8,
                        flexDirection: "row", alignItems: "center", gap: 10,
                        backgroundColor: farben.surf3, opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <Text style={{ flex: 1, fontSize: 14.5, fontFamily: "Barlow_700Bold", color: farben.ink2 }}>
                        {p.name} · {c.status.text}
                      </Text>
                      <Text style={{ fontSize: 14.5, fontFamily: "Barlow_700Bold", color: farben.ink }}>Öffnen</Text>
                    </Pressable>
                  );
                })}

                {eigen.map((c) => {
                  const b = c.status.belegung!;
                  return (
                    <View key={c.courtId} style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: farben.gold }} />
                      <Text style={{ fontSize: 13, color: farben.ink2, fontFamily: "Barlow_500Medium" }}>
                        Du spielst um {alsUhrzeit(minutesOf(b.starts_at))} auf {platzVon(c.courtId).name}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function kopfStil(farbe: string) {
  return { fontSize: 11, letterSpacing: 1.1, fontFamily: "Barlow_700Bold", color: farbe } as const;
}

/** Die Legende als eine Zeile unter der Karte. */
export function FreieZeitenLegende() {
  const { farben } = useTheme();
  const eintraege: { name: string; box: object }[] = [
    { name: "frei", box: { backgroundColor: farben.green } },
    { name: "belegt", box: { backgroundColor: farben.surf3 } },
    { name: "sucht Mitspieler", box: { backgroundColor: farben.goldSoft, borderWidth: 1.5, borderStyle: "dashed", borderColor: farben.goldLine } },
    { name: "du", box: { backgroundColor: farben.gold } },
  ];
  return (
    <View
      style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 6 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {eintraege.map((e) => (
        <View key={e.name} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={[{ width: 10, height: 14, borderRadius: 3 }, e.box]} />
          <Text style={{ fontSize: 12.5, color: farben.ink2, fontFamily: "Barlow_400Regular" }}>{e.name}</Text>
        </View>
      ))}
    </View>
  );
}
