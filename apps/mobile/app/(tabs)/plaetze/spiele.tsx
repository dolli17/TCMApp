/**
 * Meine & offene Spiele (Entwurf AppSpiele, docs/design/clubhaus)
 *
 * Frueher zwei Reiter - "Meine Buchungen" und "Offene Spiele". Zusammen, weil
 * beides dieselbe Frage beantwortet: wann spiele ich, und wo fehlt noch
 * jemand? Die alten Adressen /plaetze/meine und /plaetze/offen leiten
 * hierher, damit Links aus Push-Nachrichten weiter funktionieren.
 *
 * Der Unterschied zwischen "gebucht" und "eingetragen" bestimmt, was man tun
 * darf: der Bucher storniert die ganze Buchung, ein Mitspieler traegt nur
 * sich selbst aus.
 */

import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { dayLabel, dayTag, upcomingBookings } from "@tcm/core";
import { radius } from "@tcm/ui";
import { Bildschirm } from "@/components/Bildschirm";
import {
  ladeMeineBuchungen, ladeOffeneSpiele, spieleMit, storniereBuchung, verlasseBuchung,
} from "@/lib/daten";
import { useLaden } from "@/lib/laden";
import { alsUhrzeit, lokaleMinuten } from "@/lib/plan";
import { mitDeckkraft } from "@/lib/stil";
import { useTheme } from "@/lib/theme";

const TAGMONAT = new Intl.DateTimeFormat("de-DE", { day: "numeric", timeZone: "Europe/Berlin" });

type Ergebnis<T> = { wert: T; fehler: null } | { wert: null; fehler: string };
const abschnitt = <T,>(r: PromiseSettledResult<T>): Ergebnis<T> =>
  r.status === "fulfilled"
    ? { wert: r.value, fehler: null }
    : { wert: null, fehler: r.reason instanceof Error ? r.reason.message : "Konnte nicht geladen werden." };

async function ladeSpiele() {
  const [meine, offen] = await Promise.allSettled([ladeMeineBuchungen(), ladeOffeneSpiele()]);
  return { meine: abschnitt(meine), offen: abschnitt(offen) };
}

const initialen = (name: string) => {
  const teile = name.trim().split(/\s+/);
  return `${teile[0]?.charAt(0) ?? ""}${teile.length > 1 ? (teile.at(-1)?.charAt(0) ?? "") : ""}`.toUpperCase();
};

export default function Spiele() {
  const { stil, farben } = useTheme();
  const zustand = useLaden(ladeSpiele);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [offenFuer, setOffenFuer] = useState<string | null>(null);
  const [nachfrage, setNachfrage] = useState<string | null>(null);

  const { erneutHolen } = zustand;
  const ausfuehren = useCallback(
    async (arbeit: () => Promise<{ ok: boolean; meldung: string }>) => {
      setLaeuft(true);
      const r = await arbeit();
      setLaeuft(false);
      setNachfrage(null);
      setOffenFuer(null);
      setMeldung({ ok: r.ok, text: r.meldung });
      if (r.ok) await erneutHolen();
    },
    [erneutHolen],
  );

  const meine = zustand.daten?.meine;
  const offen = zustand.daten?.offen;
  const termine = meine?.wert ? upcomingBookings(meine.wert) : [];

  return (
    <Bildschirm
      laedt={zustand.laedt}
      aktualisiert={zustand.aktualisiert}
      onAktualisieren={zustand.neuLaden}
      fehler={zustand.fehler}
    >
      {meldung && (
        <Text style={meldung.ok ? stil.hinweisErfolg : stil.hinweisFehler} accessibilityLiveRegion="polite">
          {meldung.text}
        </Text>
      )}

      {/* --- Deine Termine ------------------------------------------------ */}
      <Text style={[stil.abschnitt, { marginTop: 4 }]} accessibilityRole="header">Deine Termine</Text>
      {meine?.fehler && <Text style={stil.hinweisFehler}>{meine.fehler}</Text>}
      {meine?.wert && termine.length === 0 && (
        <Text style={stil.leise}>
          Für dich steht gerade nichts an. In der Belegung findest du die freien Plätze.
        </Text>
      )}
      {termine.map((b, i) => {
        const tag = dayTag(b.starts_at);
        const ersteHeute = i === 0 && tag === "HEUTE";
        const aufgeklappt = offenFuer === b.booking_id;
        const gefragt = nachfrage === b.booking_id;
        const zeit = alsUhrzeit(lokaleMinuten(b.starts_at));
        const mit = b.players.filter((p) => p && p !== b.owner_name);

        return (
          <View key={b.booking_id} style={[stil.listenkarte, { borderRadius: radius.karte, padding: 14, gap: 12 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View
                style={{
                  width: 60, height: 64, borderRadius: 16, alignItems: "center", justifyContent: "center",
                  backgroundColor: ersteHeute ? farben.gold : farben.surf2,
                }}
              >
                <Text style={{ fontSize: 10.5, letterSpacing: 0.8, fontFamily: "Barlow_700Bold", color: ersteHeute ? farben.onGold : farben.ink }}>
                  {tag === "HEUTE" || tag === "MORGEN" ? tag : `${tag} ${TAGMONAT.format(new Date(b.starts_at))}.`}
                </Text>
                <Text style={{ fontSize: 21, fontFamily: "BarlowSemiCondensed_700Bold", color: ersteHeute ? farben.onGold : farben.ink }}>
                  {zeit}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[stil.text, { fontFamily: "Barlow_700Bold" }]} numberOfLines={1}>
                  {b.court_name} · {b.kind === "blocking" ? (b.title ?? b.type_name) : b.type_name}
                </Text>
                <Text style={[stil.leise, { marginTop: 2 }]} numberOfLines={2}>
                  {b.bin_bucher
                    ? mit.length > 0 ? `mit ${mit.join(", ")}` : "nur du"
                    : `du bist eingetragen · gebucht von ${b.owner_name}`}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setOffenFuer(aufgeklappt ? null : b.booking_id);
                  setNachfrage(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Optionen für ${dayLabel(b.starts_at)} ${zeit}`}
                accessibilityState={{ expanded: aufgeklappt }}
                style={{
                  width: 44, height: 44, borderRadius: 22, backgroundColor: farben.surf2,
                  alignItems: "center", justifyContent: "center",
                }}
              >
                <Svg width={18} height={18} viewBox="0 0 24 24">
                  <Circle cx={5} cy={12} r={1.8} fill={farben.ink2} />
                  <Circle cx={12} cy={12} r={1.8} fill={farben.ink2} />
                  <Circle cx={19} cy={12} r={1.8} fill={farben.ink2} />
                </Svg>
              </Pressable>
            </View>

            {aufgeklappt && (
              <Pressable
                disabled={laeuft}
                accessibilityRole="button"
                onPress={() =>
                  gefragt
                    ? ausfuehren(() => (b.bin_bucher ? storniereBuchung(b.booking_id) : verlasseBuchung(b.booking_id)))
                    : setNachfrage(b.booking_id)
                }
                style={{
                  height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center",
                  borderWidth: 1.5, borderColor: mitDeckkraft(farben.red, 0.4),
                  opacity: laeuft ? 0.5 : 1,
                }}
              >
                <Text style={{ color: farben.red, fontSize: 15, fontFamily: "Barlow_700Bold" }}>
                  {gefragt
                    ? b.bin_bucher ? "Wirklich stornieren" : "Wirklich austragen"
                    : b.bin_bucher ? "Buchung stornieren" : "Mich austragen"}
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}

      {/* --- Offene Spiele ------------------------------------------------ */}
      <View style={{ marginTop: 16 }}>
        <Text style={[stil.abschnitt, { marginTop: 0 }]} accessibilityRole="header">Offene Spiele</Text>
        <Text style={[stil.leise, { fontSize: 14, marginTop: 4 }]}>Hier fehlt noch jemand. Ein Tipp genügt.</Text>
      </View>
      {offen?.fehler && <Text style={stil.hinweisFehler}>{offen.fehler}</Text>}
      {offen?.wert && offen.wert.length === 0 && (
        <Text style={stil.leise}>
          Gerade sucht niemand Mitspieler. Wenn du selbst buchst, schalte im Blatt „Mitspieler
          gesucht“ ein – dann steht dein Spiel hier.
        </Text>
      )}
      {(offen?.wert ?? []).map((o) => {
        // players nennt die Mitspieler ohne den Bucher
        const dabei = 1 + o.players.length;
        const gesamt = dabei + o.frei;
        const leute = [o.owner_name, ...o.players];
        return (
          <View key={o.booking_id} style={[stil.listenkarte, { borderRadius: radius.karte + 2, padding: 16, gap: 14 }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={stil.kicker}>{dayLabel(o.starts_at)} · {o.court_name}</Text>
                <Text style={{ fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 26, lineHeight: 28, marginTop: 3, color: farben.ink, fontVariant: ["tabular-nums"] }}>
                  {alsUhrzeit(lokaleMinuten(o.starts_at))} – {alsUhrzeit(lokaleMinuten(o.ends_at))}
                </Text>
                <Text style={{ fontSize: 14, color: farben.ink2, marginTop: 2, fontFamily: "Barlow_400Regular" }}>
                  {o.type_name} · {dabei} von {gesamt} dabei
                </Text>
              </View>
              <View style={{ height: 28, paddingHorizontal: 10, borderRadius: 14, justifyContent: "center", backgroundColor: farben.goldSoft }}>
                <Text style={{ fontSize: 12.5, fontFamily: "Barlow_700Bold", color: farben.goldInk }}>sucht {o.frei}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row" }} accessibilityLabel={`Dabei: ${leute.join(", ")}`}>
                {leute.map((n, i) => (
                  <View
                    key={`${n}${i}`}
                    style={{
                      width: 36, height: 36, borderRadius: 18, marginRight: -6, alignItems: "center", justifyContent: "center",
                      backgroundColor: farben.brand, borderWidth: 2, borderColor: farben.surf,
                    }}
                  >
                    <Text style={{ fontSize: 11.5, fontFamily: "Barlow_700Bold", color: "#FFFFFF" }}>{initialen(n)}</Text>
                  </View>
                ))}
                {Array.from({ length: o.frei }, (_, i) => (
                  <View
                    key={`frei${i}`}
                    style={{
                      width: 36, height: 36, borderRadius: 18, marginRight: -6,
                      borderWidth: 1.5, borderStyle: "dashed", borderColor: farben.goldLine, backgroundColor: farben.surf,
                    }}
                  />
                ))}
              </View>
              {o.bin_dabei ? (
                <View style={{ height: 42, paddingHorizontal: 16, borderRadius: 21, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: farben.surf2 }}>
                  <Svg width={16} height={16} viewBox="0 0 24 24">
                    <Path d="M5 12l5 5L20 7" stroke={farben.greenInk} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                  <Text style={{ fontSize: 14, fontFamily: "Barlow_700Bold", color: farben.greenInk }}>Du bist dabei</Text>
                </View>
              ) : (
                <Pressable
                  disabled={laeuft}
                  onPress={() => ausfuehren(() => spieleMit(o.booking_id))}
                  accessibilityRole="button"
                  accessibilityLabel={`Mitspielen: ${o.type_name} ${dayLabel(o.starts_at)} ${alsUhrzeit(lokaleMinuten(o.starts_at))}`}
                  style={{ height: 44, paddingHorizontal: 18, borderRadius: 22, justifyContent: "center", backgroundColor: farben.gold, opacity: laeuft ? 0.5 : 1 }}
                >
                  <Text style={{ fontSize: 15, fontFamily: "Barlow_700Bold", color: farben.onGold }}>Mitspielen</Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </Bildschirm>
  );
}
