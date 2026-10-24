/**
 * Das Bottom-Sheet (docs/design/clubhaus, Abschnitt 4)
 *
 * Oben rund (radius.blatt), Griff, dahinter abgedunkelt. Modal plus
 * Animated, keine weitere Bibliothek: das Blatt faehrt von unten herein,
 * die Abdunklung blendet auf. Mit "Bewegung reduzieren" erscheint und geht
 * es ohne Fahrt. onRequestClose faengt die Zurueck-Taste auf Android ab.
 *
 * Der Griff ist nicht nur Zierde (U78): nach unten wischen schliesst das
 * Blatt - am Griff immer, ueber dem Inhalt nur, solange der ganz oben steht.
 * Sonst schoebe, wer zurueckscrollen will, das Blatt mit hinaus.
 *
 * Der Inhalt bekommt eine Schliessen-Funktion, die erst hinausfaehrt und
 * dann onSchliessen ruft.
 */

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  AccessibilityInfo, Animated, Easing, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable,
  ScrollView, Text, View, type PanResponderGestureState,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, schrift } from "@tcm/ui";
import { useTheme } from "@/lib/theme";

/** Ab hier (Punkte nach unten oder Tempo) schliesst ein Wisch das Blatt. */
const WISCH_WEG = 110;
const WISCH_TEMPO = 0.9;

/** Meldet dem Blatt, ob sein Inhalt ganz oben steht. */
const ObenKontext = createContext<(oben: boolean) => void>(() => {});

export function Blatt({
  onSchliessen,
  eigenerScroll = false,
  children,
}: {
  onSchliessen: () => void;
  /**
   * Der Inhalt bringt seinen Scrollbereich selbst mit (BlattScroll), etwa um
   * den Speichern-Knopf darunter anzuheften. Sonst scrollt alles zusammen.
   */
  eigenerScroll?: boolean;
  children: (schliessen: () => void) => ReactNode;
}) {
  const { farben } = useTheme();
  const rand = useSafeAreaInsets();
  const fahrt = useRef(new Animated.Value(1)).current;
  // Wie weit der Finger das Blatt gerade nach unten zieht.
  const zug = useRef(new Animated.Value(0)).current;
  const ruhig = useRef(false);
  const oben = useRef(true);
  const zuRef = useRef(onSchliessen);
  zuRef.current = onSchliessen;

  useEffect(() => {
    let ab = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((r) => {
      if (!ab) return;
      ruhig.current = r;
      if (r) fahrt.setValue(0);
      else {
        Animated.timing(fahrt, {
          toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }).start();
      }
    });
    return () => {
      ab = false;
    };
  }, [fahrt]);

  function schliessen() {
    if (ruhig.current) {
      zuRef.current();
      return;
    }
    Animated.timing(fahrt, {
      toValue: 1, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true,
    }).start(() => zuRef.current());
  }
  const schliessenRef = useRef(schliessen);
  schliessenRef.current = schliessen;

  const [amGriff, ueberInhalt] = useMemo(() => {
    const nachUnten = (g: PanResponderGestureState) => g.dy > 8 && g.dy > Math.abs(g.dx) * 1.5;
    const handgriffe = {
      onPanResponderMove: (_: unknown, g: PanResponderGestureState) => zug.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_: unknown, g: PanResponderGestureState) => {
        if (g.dy > WISCH_WEG || g.vy > WISCH_TEMPO) schliessenRef.current();
        else if (ruhig.current) zug.setValue(0);
        else Animated.spring(zug, { toValue: 0, bounciness: 0, speed: 18, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => zug.setValue(0),
    };
    return [
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => nachUnten(g),
        ...handgriffe,
      }),
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => oben.current && nachUnten(g),
        ...handgriffe,
      }),
    ];
  }, [zug]);

  const meldeOben = (o: boolean) => {
    oben.current = o;
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={schliessen} statusBarTranslucent>
      <Animated.View
        style={{
          position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
          backgroundColor: "rgba(3,8,14,.62)",
          opacity: fahrt.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        }}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={schliessen}
          accessibilityRole="button"
          accessibilityLabel="Blatt schließen"
        />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end" }}
        pointerEvents="box-none"
      >
        <Animated.View
          accessibilityViewIsModal
          onAccessibilityEscape={schliessen}
          {...ueberInhalt.panHandlers}
          style={{
            maxHeight: "92%",
            backgroundColor: farben.surf,
            borderTopLeftRadius: radius.blatt, borderTopRightRadius: radius.blatt,
            borderTopWidth: 1, borderColor: farben.line,
            paddingHorizontal: 20, paddingBottom: 20 + rand.bottom,
            transform: [{
              translateY: Animated.add(fahrt.interpolate({ inputRange: [0, 1], outputRange: [0, 800] }), zug),
            }],
          }}
        >
          {/* Griff mit grosszuegiger Flaeche zum Anfassen */}
          <View {...amGriff.panHandlers} style={{ paddingTop: 10, paddingBottom: 8, marginHorizontal: -20 }}>
            <View
              style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: farben.line2, alignSelf: "center" }}
            />
          </View>
          <ObenKontext.Provider value={meldeOben}>
            {eigenerScroll ? (
              <View style={{ flexShrink: 1, gap: 18, paddingTop: 6 }}>{children(schliessen)}</View>
            ) : (
              <BlattScroll gap={18} oben={6}>{children(schliessen)}</BlattScroll>
            )}
          </ObenKontext.Provider>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Der Scrollbereich eines Blatts. Er meldet, ob er ganz oben steht - erst
 * dann darf ein Wisch nach unten das Blatt schliessen. Zurueckfedern gibt es
 * nicht: das Ziehen am oberen Ende gehoert dem Blatt.
 */
export function BlattScroll({ children, gap, oben = 0 }: { children: ReactNode; gap: number; oben?: number }) {
  const meldeOben = useContext(ObenKontext);
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap, paddingTop: oben }}
      showsVerticalScrollIndicator={false}
      bounces={false}
      scrollEventThrottle={16}
      onScroll={(e) => meldeOben(e.nativeEvent.contentOffset.y <= 0)}
    >
      {children}
    </ScrollView>
  );
}

/** Kopf eines Blatts: Kicker, grosser Titel, runder Schliessen-Knopf. */
export function BlattKopf({
  kicker, titel, onZu, zahlen = false,
}: {
  kicker?: string;
  titel: string;
  onZu: () => void;
  /** Titel als Uhrzeit in Semi Condensed (Buchungsblatt) statt als Text */
  zahlen?: boolean;
}) {
  const { stil, farben } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
      <View style={{ flex: 1 }}>
        {kicker && <Text style={stil.kicker}>{kicker}</Text>}
        <Text
          accessibilityRole="header"
          style={
            zahlen
              ? {
                  marginTop: 4, fontFamily: "BarlowSemiCondensed_700Bold", fontSize: schrift.groesse.seitentitel,
                  lineHeight: schrift.groesse.seitentitel, color: farben.ink, fontVariant: ["tabular-nums"],
                }
              : { marginTop: kicker ? 4 : 0, fontFamily: "Barlow_800ExtraBold", fontSize: 26, lineHeight: 30, color: farben.ink }
          }
        >
          {titel}
        </Text>
      </View>
      <Pressable
        onPress={onZu}
        accessibilityRole="button"
        accessibilityLabel="Schließen"
        hitSlop={4}
        style={{
          width: 44, height: 44, borderRadius: 22, backgroundColor: farben.surf2,
          alignItems: "center", justifyContent: "center",
        }}
      >
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d="M6 6l12 12M18 6 6 18" stroke={farben.ink2} strokeWidth={2.2} strokeLinecap="round" />
        </Svg>
      </Pressable>
    </View>
  );
}
