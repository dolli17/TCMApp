/**
 * Das Bottom-Sheet (docs/design/clubhaus, Abschnitt 4)
 *
 * Oben rund (radius.blatt), Griff, dahinter abgedunkelt. Modal plus
 * Animated, keine weitere Bibliothek: das Blatt faehrt von unten herein,
 * die Abdunklung blendet auf. Mit "Bewegung reduzieren" erscheint es ohne
 * Fahrt. onRequestClose faengt die Zurueck-Taste auf Android ab.
 *
 * Der Inhalt bekommt eine Schliessen-Funktion, die erst hinausfaehrt und
 * dann onSchliessen ruft.
 */

import { useEffect, useRef, type ReactNode } from "react";
import {
  AccessibilityInfo, Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, Text, View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, schrift } from "@tcm/ui";
import { useTheme } from "@/lib/theme";

export function Blatt({
  onSchliessen,
  children,
}: {
  onSchliessen: () => void;
  children: (schliessen: () => void) => ReactNode;
}) {
  const { farben } = useTheme();
  const rand = useSafeAreaInsets();
  const fahrt = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let ab = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((ruhig) => {
      if (!ab) return;
      if (ruhig) fahrt.setValue(0);
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
    Animated.timing(fahrt, {
      toValue: 1, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true,
    }).start(() => onSchliessen());
  }

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
          style={{
            maxHeight: "92%",
            backgroundColor: farben.surf,
            borderTopLeftRadius: radius.blatt, borderTopRightRadius: radius.blatt,
            borderTopWidth: 1, borderColor: farben.line,
            paddingTop: 10, paddingHorizontal: 20, paddingBottom: 20 + rand.bottom,
            transform: [{ translateY: fahrt.interpolate({ inputRange: [0, 1], outputRange: [0, 800] }) }],
          }}
        >
          <View
            style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: farben.line2, alignSelf: "center" }}
          />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 18, paddingTop: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {children(schliessen)}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
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
