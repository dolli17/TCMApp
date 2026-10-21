/**
 * Getraenke (Entwurf AppGetraenke, docs/design/clubhaus), ein Reiter von "Verein"
 *
 * Oben der laufende Monat, darunter die Karte als Kacheln mit Zaehler: man
 * sammelt, was man genommen hat, und traegt es ueber die Leiste unten auf
 * einmal ein. Gebucht wird dabei weiter je Artikel ueber bucheGetraenk -
 * es gibt keinen Sammelauftrag in der Datenbank. Schlaegt einer fehl, sagt
 * die Meldung welcher, und er bleibt zum erneuten Versuch gewaehlt.
 *
 * "Zuletzt" zeigt die eigenen Entnahmen des Monats; zuruecknehmen geht wie
 * bisher nur im Stornofenster.
 *
 * Mit "+" ist noch nichts gebucht (U17). Der Korb liegt deshalb ausserhalb
 * des Bildschirms (src/lib/getraenkekorb.ts) und ist nach einem Reiter- oder
 * Tab-Wechsel wieder da; die Leiste sagt "noch nicht eingetragen", und wer
 * den Bildschirm mit vollem Korb verlaesst, bekommt eine Erinnerung mit dem
 * Weg zurueck. Waehrend des Sendens ist die Karte gesperrt.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  basketAfterBatch, basketReminder, basketSummary, canVoidSelf, changeBasket, drinkBatchReport,
  formatCents, MAX_DRINK_QUANTITY, sumOpenDrinks, type DrinkBatchResult,
} from "@tcm/core";
import { abstand, radius } from "@tcm/ui";
import { Bildschirm } from "@/components/Bildschirm";
import { Toast, type Meldung } from "@/components/Toast";
import { Rundknopf } from "@/components/Rundknopf";
import {
  bucheGetraenk, ladeEigeneGetraenke, ladeGetraenkekarte, ladeStornoFenster, storniereGetraenk,
} from "@/lib/daten";
import { aktuellerKorb, setzeKorb, useKorb } from "@/lib/getraenkekorb";
import { useLaden } from "@/lib/laden";
import { LEISTE_ABSTAND_UNTEN, LEISTE_HOEHE } from "@/lib/masse";
import { useTheme } from "@/lib/theme";

const MONAT = new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "Europe/Berlin" });
const ZEITPUNKT = new Intl.DateTimeFormat("de-DE", {
  weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/Berlin",
});

const QUELLE: Record<string, string> = { kiosk: "Theke", bar_duty: "Thekendienst", app: "App" };
const MARKIERT_MS = 5000;

export default function Getraenke() {
  const { stil, farben } = useTheme();
  const rand = useSafeAreaInsets();
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  /**
   * Was unter "Zuletzt" kurz hervorgehoben ist (U16): alles, was es vor dem
   * Eintragen nicht gab, oder die eine zurueckgenommene Zeile.
   */
  const [markiert, setMarkiert] = useState<{ vorher: Set<string> } | { id: string } | null>(null);
  /** Hoehe der Eintragen-Leiste, fuer den Toast darueber */
  const [leisteHoehe, setLeisteHoehe] = useState(0);
  const korb = useKorb();
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

  const { lines: gewaehlt, count: stueck, totalCents: korbBetrag } = basketSummary(karte, korb);

  // Erinnerung beim Verlassen (Reiter- oder Tab-Wechsel) mit vollem Korb.
  // Der Korb bleibt, die Rueckfrage bietet nur den Weg zurueck an.
  const karteFuerErinnerung = useRef(karte);
  karteFuerErinnerung.current = karte;
  useFocusEffect(
    useCallback(
      () => () => {
        const { count, totalCents } = basketSummary(karteFuerErinnerung.current, aktuellerKorb());
        if (count === 0) return;
        const titel = "Noch nicht eingetragen";
        const text = `${basketReminder(count, totalCents)} Gebucht wird erst mit „Eintragen“ – die Auswahl bleibt gemerkt.`;
        const zurueck = () => router.navigate("/verein/getraenke");
        // Alert.alert ist in react-native-web ein leerer Aufruf (siehe bestaetige in Formular.tsx).
        if (Platform.OS === "web") {
          if (typeof window !== "undefined" && window.confirm(`${titel}\n\n${text}\n\nZurück zu den Getränken?`)) zurueck();
          return;
        }
        Alert.alert(titel, text, [
          { text: "Später", style: "cancel" },
          { text: "Zu den Getränken", onPress: zurueck },
        ]);
      },
      [],
    ),
  );

  function aendern(id: string, um: number) {
    // Waehrend des Sendens gesperrt: das Ergebnis setzt den Korb neu.
    if (laeuft) return;
    setMeldung(null);
    setzeKorb((k) => changeBasket(k, id, um));
  }

  useEffect(() => {
    if (!markiert) return;
    const uhr = setTimeout(() => setMarkiert(null), MARKIERT_MS);
    return () => clearTimeout(uhr);
  }, [markiert]);

  const istMarkiert = (id: string) =>
    markiert !== null && ("id" in markiert ? markiert.id === id : !markiert.vorher.has(id));

  async function eintragen() {
    const vorher = new Set(buchungen.map((b) => b.id));
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
    if (ergebnisse.some((e) => e.ok)) setMarkiert({ vorher });
    // Was geklappt hat, verlaesst den Korb; was nicht, bleibt zum erneuten Versuch.
    setzeKorb(basketAfterBatch(ergebnisse));
    await zustand.erneutHolen();
  }

  async function zuruecknehmen(id: string) {
    setLaeuft(true);
    const r = await storniereGetraenk(id);
    setLaeuft(false);
    setMeldung({ ok: r.ok, text: r.meldung });
    if (r.ok) {
      setMarkiert({ id });
      await zustand.erneutHolen();
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Bildschirm
        laedt={zustand.laedt}
        aktualisiert={zustand.aktualisiert}
        onAktualisieren={zustand.neuLaden}
        fehler={zustand.fehler}
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

        {/* --- Die Karte --------------------------------------------------- */}
        <View style={[stil.zeile, { alignItems: "baseline", marginTop: abstand.abschnitt - abstand.m }]}>
          <Text style={[stil.abschnitt, { marginTop: 0 }]} accessibilityRole="header">Was nimmst du?</Text>
          <Text style={[stil.leise, { fontSize: 13 }]}>Karte aus der Verwaltung</Text>
        </View>
        <Text style={[stil.leise, { marginTop: -4 }]}>Mit + sammelst du. Gebucht ist erst, was du unten einträgst.</Text>
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
                        deaktiviert={laeuft}
                        onPress={() => aendern(a.id, -1)}
                      />
                      <Text
                        style={{ minWidth: 28, textAlign: "center", fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 22, color: farben.ink }}
                        accessibilityLabel={`${menge} gewählt, noch nicht eingetragen`}
                      >
                        {menge}
                      </Text>
                    </>
                  )}
                  <Rundknopf
                    zeichen="plus"
                    gelb
                    beschriftung={`${a.name}: eins mehr`}
                    deaktiviert={laeuft || menge >= MAX_DRINK_QUANTITY}
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
                    backgroundColor: istMarkiert(b.id) ? farben.goldSoft : "transparent",
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
                      <Text style={{ color: farben.redInk, fontSize: 14, fontFamily: "Barlow_700Bold" }}>Zurücknehmen</Text>
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
        {stueck > 0 && <View style={{ height: Math.max(84, leisteHoehe + 16) }} />}
      </Bildschirm>

      <Toast meldung={meldung} onSchliessen={() => setMeldung(null)} leisteHoehe={stueck > 0 ? leisteHoehe : 0} />

      {/* --- Eintragen-Leiste ueber der Tab-Leiste -------------------------- */}
      {stueck > 0 && (
        <View
          onLayout={(e) => setLeisteHoehe(e.nativeEvent.layout.height)}
          style={{
            position: "absolute", left: 16, right: 16,
            bottom: LEISTE_ABSTAND_UNTEN + LEISTE_HOEHE + 14 + rand.bottom,
            // minHeight wie im Web: mit grosser Systemschrift wird die Leiste zweizeilig
            minHeight: 68, borderRadius: 24, paddingLeft: 20, paddingRight: 8, paddingVertical: 8, gap: 12,
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            backgroundColor: farben.ink,
            shadowColor: "#000", shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 12,
          }}
        >
          <View accessibilityLiveRegion="polite" style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: farben.bg, fontSize: 15, fontFamily: "Barlow_700Bold" }}>
              {stueck} {stueck === 1 ? "Getränk" : "Getränke"} · {formatCents(korbBetrag)}
            </Text>
            <Text style={{ color: farben.bg, fontSize: 13, fontFamily: "Barlow_700Bold" }}>
              Noch nicht eingetragen
            </Text>
          </View>
          <Pressable
            onPress={eintragen}
            disabled={laeuft}
            accessibilityRole="button"
            style={({ pressed }) => ({
              minHeight: 52, paddingHorizontal: 24, borderRadius: 18, justifyContent: "center",
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
