/**
 * Getraenke (Entwurf AppGetraenke, docs/design/clubhaus)
 *
 * Oben der laufende Monat, darunter die Karte als Kacheln mit Zaehler: man
 * sammelt, was man genommen hat, und traegt es ueber die Leiste unten auf
 * einmal ein. Gebucht wird dabei weiter je Artikel ueber bucheGetraenk -
 * es gibt keinen Sammelauftrag in der Datenbank. Schlaegt einer fehl, sagt
 * die Meldung welcher, und er bleibt zum erneuten Versuch gewaehlt.
 *
 * "Zuletzt" zeigt die eigenen Entnahmen des Monats; zuruecknehmen geht wie
 * bisher nur im Stornofenster.
 */

import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  canVoidSelf, drinkBatchReport, formatCents, MAX_DRINK_QUANTITY, sumOpenDrinks,
  type DrinkBatchResult,
} from "@tcm/core";
import { abstand, radius } from "@tcm/ui";
import { Bildschirm } from "@/components/Bildschirm";
import { GrosserKopf } from "@/components/GrosserKopf";
import {
  bucheGetraenk, ladeEigeneGetraenke, ladeGetraenkekarte, ladeStornoFenster, storniereGetraenk,
} from "@/lib/daten";
import { useLaden } from "@/lib/laden";
import { LEISTE_ABSTAND_UNTEN, LEISTE_HOEHE } from "@/lib/masse";
import { useTheme } from "@/lib/theme";

const MONAT = new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "Europe/Berlin" });
const ZEITPUNKT = new Intl.DateTimeFormat("de-DE", {
  weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/Berlin",
});

const QUELLE: Record<string, string> = { kiosk: "Theke", bar_duty: "Thekendienst", app: "App" };

export default function Getraenke() {
  const { stil, farben } = useTheme();
  const rand = useSafeAreaInsets();
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  /** Gesammelt, noch nicht eingetragen: Artikel-Id -> Menge */
  const [korb, setKorb] = useState<Record<string, number>>({});
  const [laeuft, setLaeuft] = useState(false);

  /**
   * Taktgeber fuer das Stornofenster.
   *
   * canVoidSelf vergleicht gegen die aktuelle Uhrzeit. Ohne ein regelmaessiges
   * Neuzeichnen bliebe der Knopf stehen, bis der Bildschirm aus einem anderen
   * Grund neu rendert - und jemand tippt nach zwanzig Minuten auf etwas, das
   * die Datenbank dann abweist.
   */
  const [, setTakt] = useState(0);
  useEffect(() => {
    const uhr = setInterval(() => setTakt((t) => t + 1), 30_000);
    return () => clearInterval(uhr);
  }, []);

  const laden = useCallback(async () => {
    const [karte, buchungen, stornoFenster] = await Promise.all([
      ladeGetraenkekarte(),
      ladeEigeneGetraenke(),
      ladeStornoFenster(),
    ]);
    return { karte, buchungen, stornoFenster };
  }, []);

  const zustand = useLaden(laden);
  const karte = zustand.daten?.karte ?? [];
  const buchungen = zustand.daten?.buchungen ?? [];
  const stornoFenster = zustand.daten?.stornoFenster ?? 15;

  const aktive = buchungen.filter((b) => !b.voided_at);
  const summe = sumOpenDrinks(buchungen);

  const gewaehlt = karte.filter((a) => (korb[a.id] ?? 0) > 0);
  const stueck = gewaehlt.reduce((s, a) => s + (korb[a.id] ?? 0), 0);
  const korbBetrag = gewaehlt.reduce((s, a) => s + (korb[a.id] ?? 0) * (a.price_cents ?? 0), 0);

  function aendern(id: string, um: number) {
    setMeldung(null);
    setKorb((k) => {
      const neu = Math.max(0, Math.min(MAX_DRINK_QUANTITY, (k[id] ?? 0) + um));
      const rest = { ...k };
      if (neu === 0) delete rest[id];
      else rest[id] = neu;
      return rest;
    });
  }

  async function eintragen() {
    setLaeuft(true);
    const ergebnisse: (DrinkBatchResult & { id: string })[] = [];
    // Nacheinander, nicht parallel: die Reihenfolge der Meldung soll der
    // Reihenfolge auf der Karte folgen, und die Datenbank sieht keine
    // gleichzeitigen Buchungen desselben Mitglieds.
    for (const a of gewaehlt) {
      const menge = korb[a.id] ?? 0;
      const r = await bucheGetraenk(a.id, menge);
      ergebnisse.push({ id: a.id, name: a.name, quantity: menge, ok: r.ok, message: r.meldung });
    }
    setLaeuft(false);
    setMeldung(drinkBatchReport(ergebnisse));
    // Was geklappt hat, verlaesst den Korb; was nicht, bleibt zum erneuten Versuch.
    setKorb(Object.fromEntries(ergebnisse.filter((e) => !e.ok).map((e) => [e.id, e.quantity])));
    await zustand.erneutHolen();
  }

  async function zuruecknehmen(id: string) {
    setLaeuft(true);
    const r = await storniereGetraenk(id);
    setLaeuft(false);
    setMeldung({ ok: r.ok, text: r.meldung });
    if (r.ok) await zustand.erneutHolen();
  }

  return (
    <View style={{ flex: 1 }}>
      <Bildschirm
        laedt={zustand.laedt}
        aktualisiert={zustand.aktualisiert}
        onAktualisieren={zustand.neuLaden}
        fehler={zustand.fehler}
        kopf={<GrosserKopf titel="Getränke" />}
      >
        {/* --- Der laufende Monat ------------------------------------------ */}
        <View style={{ backgroundColor: farben.brand, borderRadius: radius.karteGross, padding: 20, overflow: "hidden" }}>
          <Svg width={350} height={150} viewBox="0 0 350 150" style={{ position: "absolute", right: 0, top: 0 }}>
            <Path d="M200 150 L250 0 M350 40 L260 150 M230 80 H350" stroke="rgba(255,255,255,.12)" strokeWidth={2} fill="none" />
          </Svg>
          <Text style={[stil.kicker, { color: "#FFFFFF", opacity: 0.85 }]}>
            {MONAT.format(new Date())} · läuft noch
          </Text>
          <Text
            style={{ color: "#FFFFFF", fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 44, lineHeight: 46, marginTop: 8 }}
            accessibilityLabel={`Summe diesen Monat: ${formatCents(summe)}`}
          >
            {formatCents(summe)}
          </Text>
          <Text style={{ color: "#FFFFFF", opacity: 0.9, fontSize: 14, marginTop: 8, fontFamily: "Barlow_400Regular" }}>
            {aktive.length} {aktive.length === 1 ? "Entnahme" : "Entnahmen"} · wird mit der Monatsabrechnung eingezogen
          </Text>
        </View>

        {meldung && (
          <Text style={meldung.ok ? stil.hinweisErfolg : stil.hinweisFehler} accessibilityLiveRegion="polite">
            {meldung.text}
          </Text>
        )}

        {/* --- Die Karte --------------------------------------------------- */}
        <View style={[stil.zeile, { alignItems: "baseline", marginTop: abstand.abschnitt - abstand.m }]}>
          <Text style={[stil.abschnitt, { marginTop: 0 }]} accessibilityRole="header">Was nimmst du?</Text>
          <Text style={[stil.leise, { fontSize: 13 }]}>Karte aus der Verwaltung</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {karte.map((a) => {
            const menge = korb[a.id] ?? 0;
            return (
              <View
                key={a.id}
                style={{
                  width: "48.5%", flexGrow: 1, minHeight: 124, borderRadius: radius.karte, padding: 14,
                  justifyContent: "space-between", backgroundColor: farben.surf,
                  borderWidth: menge > 0 ? 2 : 1, borderColor: menge > 0 ? farben.goldLine : farben.line,
                }}
              >
                <View>
                  <Text style={{ fontSize: 17, fontFamily: "Barlow_700Bold", color: farben.ink }}>{a.name}</Text>
                  <Text style={{ fontSize: 13.5, color: farben.muted, marginTop: 2, fontFamily: "Barlow_400Regular" }}>
                    {formatCents(a.price_cents ?? 0)}
                    {a.description ? ` · ${a.description}` : ""}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 10 }}>
                  {menge > 0 && (
                    <>
                      <Rundknopf
                        zeichen="minus"
                        beschriftung={`${a.name}: eins weniger`}
                        onPress={() => aendern(a.id, -1)}
                      />
                      <Text
                        style={{ minWidth: 28, textAlign: "center", fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 22, color: farben.ink }}
                        accessibilityLabel={`${menge} gewählt`}
                      >
                        {menge}
                      </Text>
                    </>
                  )}
                  <Rundknopf
                    zeichen="plus"
                    gelb
                    beschriftung={`${a.name}: eins mehr`}
                    deaktiviert={menge >= MAX_DRINK_QUANTITY}
                    onPress={() => aendern(a.id, 1)}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {/* --- Zuletzt ----------------------------------------------------- */}
        <Text style={[stil.abschnitt, { marginTop: abstand.abschnitt - abstand.m }]} accessibilityRole="header">
          Zuletzt
        </Text>
        <Text style={[stil.leise, { marginTop: -4 }]}>
          Eine Entnahme lässt sich {stornoFenster} Minuten lang selbst zurücknehmen.
        </Text>
        {buchungen.length === 0 ? (
          <Text style={stil.leise}>Noch nichts entnommen.</Text>
        ) : (
          <View style={[stil.listenkarte, { padding: 0, borderRadius: radius.karte, overflow: "hidden" }]}>
            {buchungen.map((b, i) => {
              const zurueck = Boolean(b.voided_at);
              // Dieselbe Konstruktion wie in apps/web/src/components/Getraenkekarte.tsx:
              // canVoidSelf sieht nur auf Zeitpunkt und Storno, die uebrigen
              // Felder gehoeren zum Typ und bleiben leer.
              const stornierbar = canVoidSelf(
                {
                  id: b.id, memberId: "", drinkItemId: "", quantity: b.quantity,
                  unitPriceCents: b.unit_price_cents, createdAt: b.created_at, voidedAt: b.voided_at,
                },
                stornoFenster,
              );
              const zeile = { textDecorationLine: zurueck ? ("line-through" as const) : ("none" as const) };
              return (
                <View
                  key={b.id}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16,
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: farben.line, opacity: zurueck ? 0.55 : 1,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[{ fontSize: 15, fontFamily: "Barlow_600SemiBold", color: farben.ink }, zeile]}>
                      {b.quantity > 1 ? `${b.quantity}× ` : ""}{b.item_name}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: farben.muted, marginTop: 2, fontFamily: "Barlow_400Regular" }}>
                      {ZEITPUNKT.format(new Date(b.created_at))} · {QUELLE[b.source] ?? "App"}
                      {zurueck ? " · zurückgenommen" : ""}
                    </Text>
                  </View>
                  {stornierbar && (
                    <Pressable
                      disabled={laeuft}
                      onPress={() => zuruecknehmen(b.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${b.item_name} zurücknehmen`}
                      hitSlop={6}
                      style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 4, opacity: laeuft ? 0.5 : 1 }}
                    >
                      <Text style={{ color: farben.red, fontSize: 14, fontFamily: "Barlow_700Bold" }}>Zurücknehmen</Text>
                    </Pressable>
                  )}
                  <Text style={[{ fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 17, color: farben.ink }, zeile]}>
                    {formatCents(b.total_cents ?? 0)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Platz fuer die Eintragen-Leiste, damit sie nichts verdeckt */}
        {stueck > 0 && <View style={{ height: 84 }} />}
      </Bildschirm>

      {/* --- Eintragen-Leiste ueber der Tab-Leiste -------------------------- */}
      {stueck > 0 && (
        <View
          style={{
            position: "absolute", left: 16, right: 16,
            bottom: LEISTE_ABSTAND_UNTEN + LEISTE_HOEHE + 14 + rand.bottom,
            height: 68, borderRadius: 24, paddingLeft: 20, paddingRight: 8,
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            backgroundColor: farben.ink,
            shadowColor: "#000", shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 12,
          }}
        >
          <View accessibilityLiveRegion="polite">
            <Text style={{ color: farben.bg, fontSize: 15, fontFamily: "Barlow_700Bold" }}>
              {stueck} {stueck === 1 ? "Getränk" : "Getränke"}
            </Text>
            <Text style={{ color: farben.bg, opacity: 0.7, fontSize: 13, fontFamily: "Barlow_400Regular" }}>
              {formatCents(korbBetrag)} · aufs Monatskonto
            </Text>
          </View>
          <Pressable
            onPress={eintragen}
            disabled={laeuft}
            accessibilityRole="button"
            style={({ pressed }) => ({
              height: 52, paddingHorizontal: 24, borderRadius: 18, justifyContent: "center",
              backgroundColor: farben.gold, opacity: laeuft ? 0.6 : pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: farben.onGold, fontSize: 16, fontFamily: "Barlow_800ExtraBold" }}>
              {laeuft ? "Wird eingetragen …" : "Eintragen"}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function Rundknopf({
  zeichen, gelb, beschriftung, deaktiviert, onPress,
}: {
  zeichen: "plus" | "minus";
  gelb?: boolean;
  beschriftung: string;
  deaktiviert?: boolean;
  onPress: () => void;
}) {
  const { farben } = useTheme();
  const tinte = gelb ? farben.onGold : farben.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={deaktiviert}
      accessibilityRole="button"
      accessibilityLabel={beschriftung}
      hitSlop={4}
      style={{
        width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
        backgroundColor: gelb ? farben.gold : farben.surf2, opacity: deaktiviert ? 0.4 : 1,
      }}
    >
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <Path d={zeichen === "plus" ? "M12 5v14M5 12h14" : "M5 12h14"} stroke={tinte} strokeWidth={2.6} strokeLinecap="round" />
      </Svg>
    </Pressable>
  );
}
