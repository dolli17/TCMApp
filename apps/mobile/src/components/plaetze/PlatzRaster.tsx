/**
 * Die Plaetze als Raster (docs/design/clubhaus/plaetze, PlRaster)
 *
 * Links eine feste Spalte mit den Plaetzen, rechts waagerecht wischbar die
 * Stunden von Oeffnung bis Schluss, 88 Pixel je Stunde. Belegungen sind
 * beschriftete Bloecke; eine freie Flaeche antippen waehlt Platz und Beginn
 * aus. Gebucht wird erst ueber die Leiste unten und das Blatt.
 *
 * Was frei ist, rechnet @tcm/core (freeGaps, also canStartAt); die
 * Beschriftung der Bloecke ebenfalls (occupancyLabel), damit das Web
 * dasselbe sagt.
 *
 * Freie Startzeiten sind eine gruene Flaeche mit "frei" (U75), wie unter
 * Freie Zeiten und im Web. Vorher war frei nur die leere Spur, und ein Tag
 * ohne Buchungen sah aus, als lade das Raster noch.
 */

import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View, type GestureResponderEvent } from "react-native";
import {
  freeGaps, localMinutes, minutesOf, occupancyLabel, startInGap, type FreeGap, type TimelineKind,
} from "@tcm/core";
import { alsUhrzeit, type Belegung } from "@/lib/plan";
import { mitDeckkraft } from "@/lib/stil";
import { useTheme } from "@/lib/theme";
import { Schraffur } from "@/components/MiniZeitleiste";

// 88 statt 68: eine halbe Stunde ist so 44 Pixel breit - schmaler trifft man
// sie mit dem Finger nicht (U18).
export const STUNDE_PX = 88;
// 46 statt 52: so passen Raster und Legende auf einem ueblichen Telefon ueber
// die schwebende Leiste, ohne dass man scrollen muss (U34). Die Bloecke sind
// 38 hoch, ihre Tippflaeche reicht ueber hitSlop auf die volle Zeile.
const BLOCK_ABSTAND = 4;
const ZEILE = 46;
const KOPF = 34;
const SPALTE = 46;
const px = (minuten: number) => (minuten / 60) * STUNDE_PX;

/**
 * Das Raster hat feste Masse: 88 Pixel je Stunde, 46 je Platz. Waechst die
 * Schrift mit der Systemeinstellung ungebremst mit, laufen die Stunden
 * ineinander und rechts aus dem Bild, und "PLATZ" bricht um (U34). Deshalb
 * waechst sie hier nur ein Stueck mit; was ein Block sagt, steht vollstaendig
 * im accessibilityLabel.
 */
const RASTER_SCHRIFT = 1.15;

export interface Platz { id: string; name: string; short_name: string }

/** Die ausgewaehlte freie Stelle: Platz, Beginn und wie lange er frei ist. */
export interface Auswahl { courtId: string; minute: number; bis: number }

/** "Platz 3" -> "3"; andere Namen bleiben bei der Kurzform. */
export function platzNummer(p: Platz): string {
  return p.name.match(/^Platz\s+(.+)$/i)?.[1] ?? p.short_name;
}

/** Jetzt, minuetlich nachgefuehrt - fuer die rote Linie und die freien Flaechen. */
export function useJetzt(): Date {
  const [jetzt, setJetzt] = useState(() => new Date());
  useEffect(() => {
    const uhr = setInterval(() => setJetzt(new Date()), 60_000);
    return () => clearInterval(uhr);
  }, []);
  return jetzt;
}

export function PlatzRaster({
  datum, istHeute, plaetze, belegung, oeffnung, schluss, raster, dauer, vorlaufTage, auswahl,
  oeffnebar, markiert, onAuswahl, onOeffnen,
}: {
  datum: string;
  istHeute: boolean;
  plaetze: Platz[];
  belegung: Belegung[];
  oeffnung: number;
  schluss: number;
  raster: number;
  dauer: number;
  /** Buchungsvorlauf in Tagen (lead_days), siehe canStartAt. */
  vorlaufTage: number;
  auswahl: Auswahl | null;
  oeffnebar: (b: Belegung) => boolean;
  /** Gehoert die Belegung zur letzten Aktion? Dann ist sie kurz hervorgehoben (U16). */
  markiert: (b: Belegung) => boolean;
  onAuswahl: (a: Auswahl) => void;
  onOeffnen: (platz: Platz, b: Belegung) => void;
}) {
  const { farben } = useTheme();
  const jetzt = useJetzt();
  const breite = px(schluss - oeffnung);
  const jetztMin = istHeute ? localMinutes(jetzt) : null;

  // Beim Oeffnen und bei jedem Tageswechsel einmal auf "jetzt" stellen
  // (Beginn eine Viertelstunde vorher), an anderen Tagen auf die Oeffnung.
  const wisch = useRef<ScrollView>(null);
  const gestelltFuer = useRef<string | null>(null);
  const [sichtbreite, setSichtbreite] = useState(0);
  useEffect(() => {
    if (sichtbreite === 0 || gestelltFuer.current === datum) return;
    gestelltFuer.current = datum;
    const ziel = jetztMin === null ? 0 : px(jetztMin - 15 - oeffnung);
    const x = Math.max(0, Math.min(ziel, breite - sichtbreite));
    // Ein Takt Verzug: vorher kennt die ScrollView ihre Inhaltsbreite noch nicht.
    requestAnimationFrame(() => wisch.current?.scrollTo({ x, animated: false }));
  }, [datum, sichtbreite, jetztMin, oeffnung, breite]);

  const stunden: number[] = [];
  for (let m = Math.ceil(oeffnung / 60) * 60; m < schluss; m += 60) stunden.push(m);

  // Nach der Statustabelle (HANDOFF §2) wie .tr-block im Web: belegt blau mit
  // Rand blue, Training und gesperrt grau mit Rand rahmen (U79).
  const flaeche: Record<TimelineKind, { box: object; text: string }> = {
    eigen: { box: { backgroundColor: farben.gold }, text: farben.onGold },
    belegt: { box: { backgroundColor: farben.blueSoft, borderWidth: 1, borderColor: farben.blue }, text: farben.blueInk },
    sucht: {
      box: { backgroundColor: farben.goldSoft, borderWidth: 1.5, borderStyle: "dashed", borderColor: farben.goldLine },
      text: farben.goldInk,
    },
    serie: { box: { backgroundColor: farben.surf3, borderWidth: 1, borderColor: farben.rahmen }, text: farben.ink2 },
    gesperrt: { box: { backgroundColor: farben.surf3, borderWidth: 1, borderColor: farben.rahmen }, text: farben.muted },
  };

  return (
    <View
      style={{
        flexDirection: "row", borderRadius: 22, overflow: "hidden",
        backgroundColor: farben.surf, borderWidth: 1, borderColor: farben.line,
      }}
    >
      {/* Feste Spalte mit den Plaetzen */}
      <View style={{ width: SPALTE, borderRightWidth: 1, borderRightColor: farben.line }}>
        <View style={{ height: KOPF, borderBottomWidth: 1, borderBottomColor: farben.line }} />
        {plaetze.map((p) => (
          <View
            key={p.id}
            accessible
            accessibilityRole="header"
            accessibilityLabel={p.name}
            style={{
              height: ZEILE, alignItems: "center", justifyContent: "center",
              borderBottomWidth: 1, borderBottomColor: mitDeckkraft(farben.ink, 0.06),
            }}
          >
            {/* Die Spalte ist 46 Pixel schmal und die Zeile 46 hoch: hier waechst
                die Schrift gar nicht mit. Der Platzname steht im Label. */}
            <Text maxFontSizeMultiplier={1} style={{ fontSize: 9.5, letterSpacing: 0.8, fontFamily: "Barlow_700Bold", color: farben.muted }}>
              PLATZ
            </Text>
            <Text maxFontSizeMultiplier={1} style={{ fontSize: 20, lineHeight: 21, fontFamily: "BarlowSemiCondensed_700Bold", color: farben.ink }}>
              {platzNummer(p)}
            </Text>
          </View>
        ))}
      </View>

      {/* Die Stunden, waagerecht wischbar */}
      <ScrollView
        ref={wisch}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        onLayout={(e) => setSichtbreite(e.nativeEvent.layout.width)}
        accessibilityLabel="Belegung nach Plätzen, waagerecht wischen für frühere und spätere Stunden"
      >
        <View style={{ width: breite }}>
          <View
            style={{ height: KOPF, borderBottomWidth: 1, borderBottomColor: farben.line }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {stunden.map((m) => (
              <Text
                maxFontSizeMultiplier={RASTER_SCHRIFT}
                key={m}
                style={{
                  position: "absolute", top: 10, left: px(m - oeffnung) + 6,
                  fontSize: 12, fontFamily: "Barlow_700Bold", color: farben.ink2, fontVariant: ["tabular-nums"],
                }}
              >
                {alsUhrzeit(m)}
              </Text>
            ))}
          </View>

          <View style={{ height: plaetze.length * ZEILE }}>
            {/* Feine senkrechte Linien je Stunde */}
            {stunden.map((m) => (
              <View
                key={m}
                pointerEvents="none"
                style={{
                  position: "absolute", top: 0, bottom: 0, width: 1, left: px(m - oeffnung),
                  backgroundColor: mitDeckkraft(farben.ink, 0.07),
                }}
              />
            ))}

            {plaetze.map((platz, i) => (
              <View
                key={platz.id}
                style={{
                  position: "absolute", left: 0, right: 0, top: i * ZEILE, height: ZEILE,
                  borderBottomWidth: 1, borderBottomColor: mitDeckkraft(farben.ink, 0.06),
                }}
              >
                {freeGaps({
                  day: datum, courtId: platz.id, openingMinutes: oeffnung, closingMinutes: schluss,
                  slotMinutes: raster, durationMinutes: dauer, occupied: belegung, leadDays: vorlaufTage,
                  now: jetzt,
                }).map((l) => (
                  <FreieFlaeche
                    key={l.from}
                    platz={platz}
                    luecke={l}
                    oeffnung={oeffnung}
                    farben={{ flaeche: mitDeckkraft(farben.green, 0.16), rand: farben.green, text: farben.greenInk }}
                    onWahl={(minute) =>
                      onAuswahl({ courtId: platz.id, minute: startInGap(l, minute, raster, dauer), bis: l.until })}
                  />
                ))}

                {belegung
                  .filter((b) => b.court_id === platz.id)
                  .map((b) => {
                    const von = Math.max(oeffnung, minutesOf(b.starts_at));
                    const bis = Math.min(schluss, minutesOf(b.ends_at));
                    if (bis <= von) return null;
                    const l = occupancyLabel(b);
                    const f = flaeche[l.art];
                    const kannAuf = oeffnebar(b);
                    return (
                      <Pressable
                        key={b.booking_id}
                        onPress={() => onOeffnen(platz, b)}
                        disabled={!kannAuf}
                        accessible
                        accessibilityRole={kannAuf ? "button" : "text"}
                        accessibilityLabel={`${platz.name}, ${l.spoken}`}
                        accessibilityHint={kannAuf ? "Öffnet die Buchung" : undefined}
                        hitSlop={{ top: BLOCK_ABSTAND, bottom: BLOCK_ABSTAND }}
                        style={({ pressed }) => [
                          {
                            position: "absolute", top: BLOCK_ABSTAND, bottom: BLOCK_ABSTAND, left: px(von - oeffnung) + 3,
                            width: Math.max(px(bis - von) - 6, 12), borderRadius: 10, overflow: "hidden",
                            paddingVertical: 2, paddingHorizontal: 8, justifyContent: "center",
                            opacity: pressed && kannAuf ? 0.8 : 1,
                          },
                          f.box,
                          markiert(b) && { borderWidth: 3, borderStyle: "solid", borderColor: farben.goldLine },
                        ]}
                      >
                        {l.art === "serie" && <Schraffur farbe={mitDeckkraft(farben.ink, 0.1)} />}
                        <Text maxFontSizeMultiplier={RASTER_SCHRIFT} numberOfLines={1} style={{ fontSize: 12, fontFamily: "Barlow_700Bold", color: f.text }}>
                          {l.title}
                        </Text>
                        {l.detail !== "" && (
                          <Text maxFontSizeMultiplier={RASTER_SCHRIFT} numberOfLines={1} style={{ fontSize: 12, fontFamily: "Barlow_500Medium", color: f.text, opacity: 0.85 }}>
                            {l.detail}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}

                {auswahl?.courtId === platz.id && (
                  <View
                    pointerEvents="none"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={{
                      position: "absolute", top: 4, bottom: 4, left: px(auswahl.minute - oeffnung) + 3,
                      width: px(dauer) - 6, borderRadius: 10, borderWidth: 2, borderColor: farben.gold,
                      backgroundColor: farben.goldSoft, paddingVertical: 1, paddingHorizontal: 7,
                      justifyContent: "center",
                    }}
                  >
                    <Text maxFontSizeMultiplier={RASTER_SCHRIFT} numberOfLines={1} style={{ fontSize: 12, fontFamily: "Barlow_700Bold", color: farben.goldInk }}>
                      + {alsUhrzeit(auswahl.minute)}
                    </Text>
                    <Text maxFontSizeMultiplier={RASTER_SCHRIFT} numberOfLines={1} style={{ fontSize: 12, fontFamily: "Barlow_500Medium", color: farben.goldInk, opacity: 0.85 }}>
                      ausgewählt
                    </Text>
                  </View>
                )}
              </View>
            ))}

            {jetztMin !== null && jetztMin >= oeffnung && jetztMin <= schluss && (
              <View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  position: "absolute", top: 0, bottom: 0, width: 2, left: px(jetztMin - oeffnung) - 1,
                  backgroundColor: farben.red,
                }}
              />
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Eine freie Flaeche: gruen getoent mit gruenem Rand, antippbar. Die Stelle
 * des Fingers bestimmt den Beginn; ein Screenreader tippt ohne Stelle und
 * bekommt den fruehesten. Der Rand haelt 3:1 zur Karte, die Toenung allein
 * nicht.
 */
function FreieFlaeche({
  platz, luecke, oeffnung, farben, onWahl,
}: {
  platz: Platz;
  luecke: FreeGap;
  oeffnung: number;
  farben: { flaeche: string; rand: string; text: string };
  onWahl: (minute: number) => void;
}) {
  function tippen(e: GestureResponderEvent) {
    const x = e.nativeEvent.locationX;
    onWahl(Number.isFinite(x) ? luecke.from + (x / STUNDE_PX) * 60 : luecke.from);
  }
  return (
    <Pressable
      onPress={tippen}
      accessibilityRole="button"
      accessibilityLabel={`${platz.name}, frei von ${alsUhrzeit(luecke.from)} bis ${alsUhrzeit(luecke.until)} Uhr`}
      accessibilityHint={`Wählt ${alsUhrzeit(luecke.from)} Uhr zum Buchen aus`}
      hitSlop={{ top: BLOCK_ABSTAND, bottom: BLOCK_ABSTAND }}
      style={({ pressed }) => ({
        position: "absolute", top: BLOCK_ABSTAND, bottom: BLOCK_ABSTAND,
        left: px(luecke.from - oeffnung) + 3, width: Math.max(px(luecke.until - luecke.from) - 6, 12),
        borderRadius: 10, borderWidth: 1.5, borderColor: farben.rand, backgroundColor: farben.flaeche,
        paddingHorizontal: 7, justifyContent: "center", opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text maxFontSizeMultiplier={RASTER_SCHRIFT} numberOfLines={1} style={{ fontSize: 12, fontFamily: "Barlow_700Bold", color: farben.text }}>
        frei
      </Text>
    </Pressable>
  );
}

/** Kurze Legende unter dem Raster. */
export function RasterLegende() {
  const { farben } = useTheme();
  // Jedes Kaestchen mit Rand wie im Web: blueSoft, surf3 und goldSoft allein
  // liegen unter 3:1 zum Grund (U29).
  const eintraege: { name: string; box: object; schraffur?: boolean }[] = [
    { name: "frei", box: { backgroundColor: mitDeckkraft(farben.green, 0.16), borderWidth: 1, borderColor: farben.green } },
    { name: "Du", box: { backgroundColor: farben.gold } },
    { name: "belegt", box: { backgroundColor: farben.blueSoft, borderWidth: 1, borderColor: farben.blue } },
    { name: "sucht Mitspieler", box: { backgroundColor: farben.goldSoft, borderStyle: "dashed", borderColor: farben.goldInk } },
    { name: "Training", box: { backgroundColor: farben.surf3 }, schraffur: true },
    { name: "gesperrt", box: { backgroundColor: farben.surf3 } },
  ];
  return (
    <View
      style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 6 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {eintraege.map((e) => (
        <View key={e.name} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={[{ width: 16, height: 10, borderRadius: 3, overflow: "hidden", borderWidth: 1.5, borderColor: farben.rahmen }, e.box]}>
            {e.schraffur && <Schraffur farbe={mitDeckkraft(farben.ink, 0.18)} />}
          </View>
          <Text style={{ fontSize: 12.5, color: farben.ink2, fontFamily: "Barlow_400Regular" }}>{e.name}</Text>
        </View>
      ))}
    </View>
  );
}
