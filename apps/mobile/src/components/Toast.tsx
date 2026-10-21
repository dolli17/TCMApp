/**
 * Die Rueckmeldung nach einer Aktion, unten ueber der schwebenden Leiste (U16)
 *
 * Vorher stand sie oben ueber dem Plan und der Getraenkekarte - wer weiter
 * unten gebucht hatte, sah sie nicht und wusste nicht, ob es geklappt hat.
 * Unten liegt sie dort, wo der Daumen gerade war. Erfolg verschwindet nach
 * ein paar Sekunden, ein Fehler bleibt, bis man ihn schliesst.
 *
 * Gleiche Farben wie die Hinweise (stil.hinweisErfolg/-Fehler), aber deckend,
 * weil der Toast ueber dem Inhalt liegt.
 */

import { useEffect } from "react";
import { AccessibilityInfo, Platform, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius } from "@tcm/ui";
import { LEISTE_ABSTAND_UNTEN, LEISTE_HOEHE, LEISTE_RAND } from "@/lib/masse";
import { mitDeckkraft } from "@/lib/stil";
import { useTheme } from "@/lib/theme";

export interface Meldung { ok: boolean; text: string }

const ERFOLG_MS = 8000;

/** Luft zwischen Toast und einer Leiste darunter */
const LUFT = 10;

export function Toast({
  meldung, onSchliessen, leisteHoehe = 0,
}: {
  meldung: Meldung | null;
  onSchliessen: () => void;
  /**
   * Gemessene Hoehe der Leiste zum Buchen oder Eintragen ueber der
   * Navigation, 0 ohne Leiste. Gemessen statt fest, damit der Toast auch
   * ueber einer zweizeiligen Leiste liegt (grosse Systemschrift).
   */
  leisteHoehe?: number;
}) {
  const { farben, theme } = useTheme();
  const rand = useSafeAreaInsets();

  useEffect(() => {
    if (!meldung) return;
    // Die Live-Region wirkt nur unter Android; VoiceOver braucht die Ansage.
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(meldung.text);
    if (!meldung.ok) return;
    const uhr = setTimeout(onSchliessen, ERFOLG_MS);
    return () => clearTimeout(uhr);
    // Jede neue Meldung ist ein neues Objekt und startet die Uhr neu.
  }, [meldung]);

  if (!meldung) return null;

  const ton = meldung.ok ? farben.green : farben.red;
  const schrift = meldung.ok ? farben.greenInk : farben.redInk;
  // Dieselbe Mischung wie die Hinweise, nur auf surf statt durchscheinend
  const anteil = theme === "hell" ? 0.12 : 0.16;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute", left: LEISTE_RAND, right: LEISTE_RAND,
        bottom: LEISTE_ABSTAND_UNTEN + rand.bottom + LEISTE_HOEHE + 14 + (leisteHoehe > 0 ? leisteHoehe + LUFT : 0),
      }}
    >
      <View style={{ borderRadius: radius.feld, backgroundColor: farben.surf, shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.2, shadowRadius: 18, elevation: 10 }}>
        <View
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 16, paddingRight: 4, minHeight: 52,
            borderRadius: radius.feld, borderWidth: 1, borderColor: farben.line,
            backgroundColor: mitDeckkraft(ton, anteil),
          }}
        >
          <Text style={{ flex: 1, paddingVertical: 10, fontSize: 14.5, fontFamily: "Barlow_600SemiBold", color: schrift }}>
            {meldung.text}
          </Text>
          <Pressable
            onPress={onSchliessen}
            accessibilityRole="button"
            accessibilityLabel="Meldung schließen"
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path d="M6 6l12 12M18 6L6 18" stroke={schrift} strokeWidth={2.4} strokeLinecap="round" fill="none" />
            </Svg>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
