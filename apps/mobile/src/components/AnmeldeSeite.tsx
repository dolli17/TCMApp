/**
 * Der Rahmen der Anmeldeseiten (Entwurf AppLogin, docs/design/clubhaus)
 *
 * Oben eine Flaeche in brand mit einem Tennisplatz in Perspektive und dem
 * gelben Ball, das weisse Logo, der Titel unten links; darunter das
 * Formular auf dunklem Grund. Die Anmeldeseiten sind immer dunkel, egal
 * welches Theme gewaehlt ist - ImmerDunkel setzt das nur fuer diesen Teil.
 *
 * Dazu die Bausteine, die alle drei Seiten brauchen: Eingabefeld (54 hoch)
 * und der gelbe Hauptknopf.
 */

import { forwardRef, type ReactNode } from "react";
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View,
  type TextInputProps,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import logo from "@tcm/ui/logo-weiss.png";
import { mitDeckkraft } from "@/lib/stil";
import { ImmerDunkel, useTheme } from "@/lib/theme";

export function AnmeldeSeite({
  titel,
  unterzeile,
  children,
}: {
  titel: string;
  unterzeile?: string;
  children: ReactNode;
}) {
  return (
    <ImmerDunkel>
      <Inhalt titel={titel} unterzeile={unterzeile}>{children}</Inhalt>
    </ImmerDunkel>
  );
}

function Inhalt({ titel, unterzeile, children }: { titel: string; unterzeile?: string; children: ReactNode }) {
  const { farben } = useTheme();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: farben.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ height: 360, backgroundColor: farben.brand, overflow: "hidden" }}>
          {/* Ein Tennisplatz in Perspektive, dezent */}
          <Svg
            width="100%" height="100%" viewBox="0 0 390 360" preserveAspectRatio="xMidYMax slice"
            style={{ position: "absolute" }}
          >
            <Path d="M40 360 L130 110 H260 L350 360" stroke="rgba(255,255,255,.22)" strokeWidth={2.5} fill="none" />
            <Path d="M78 255 H312" stroke="rgba(255,255,255,.22)" strokeWidth={2.5} fill="none" />
            <Path d="M100 195 H290 M60 305 H330 M195 195 V305" stroke="rgba(255,255,255,.22)" strokeWidth={2.5} fill="none" />
            <Path d="M0 110 H390" stroke="rgba(255,255,255,.4)" strokeWidth={2.5} strokeDasharray="3 5" fill="none" />
          </Svg>
          <View
            style={{
              position: "absolute", right: 54, top: 96, width: 38, height: 38, borderRadius: 19,
              backgroundColor: farben.gold,
            }}
          />
          <LinearGradient
            colors={[mitDeckkraft(farben.bg, 0), farben.bg]}
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 160 }}
          />
          <Image
            source={logo}
            style={{ position: "absolute", left: 24, top: 60, width: 126, height: 36 }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            accessibilityLabel="TC Muckensturm"
          />
          <View style={{ position: "absolute", left: 24, right: 24, bottom: 22 }}>
            <Text
              accessibilityRole="header"
              style={{ color: "#FFFFFF", fontSize: 36, lineHeight: 37, letterSpacing: -0.7, fontFamily: "Barlow_800ExtraBold" }}
            >
              {titel}
            </Text>
            {unterzeile && (
              <Text style={{ color: farben.ink2, fontSize: 15, marginTop: 8, fontFamily: "Barlow_400Regular" }}>
                {unterzeile}
              </Text>
            )}
          </View>
        </View>

        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 36 }}>
          <View style={{ width: "100%", maxWidth: 420, alignSelf: "center", gap: 14, flex: 1 }}>{children}</View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Eingabefeld der Anmeldeseiten: Beschriftung darueber, 54 hoch, Radius 16. */
export const AnmeldeFeld = forwardRef<TextInput, TextInputProps & { beschriftung: string }>(
  function AnmeldeFeld({ beschriftung, style, ...rest }, ref) {
    const { farben } = useTheme();
    return (
      <View>
        <Text style={{ fontSize: 13, fontFamily: "Barlow_600SemiBold", color: farben.ink2, marginBottom: 8 }}>
          {beschriftung}
        </Text>
        <TextInput
          ref={ref}
          accessibilityLabel={beschriftung}
          placeholderTextColor={farben.muted}
          style={[
            {
              height: 54, borderRadius: 16, paddingHorizontal: 16, fontSize: 16,
              backgroundColor: farben.surf, color: farben.ink, fontFamily: "Barlow_400Regular",
              borderWidth: 1.5, borderColor: "rgba(255,255,255,.12)",
            },
            style,
          ]}
          {...rest}
        />
      </View>
    );
  },
);

/** Der gelbe Hauptknopf, 58 hoch. */
export function GelberKnopf({ text, onPress, gesperrt }: { text: string; onPress: () => void; gesperrt?: boolean }) {
  const { farben } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={gesperrt}
      accessibilityRole="button"
      accessibilityState={{ disabled: gesperrt }}
      style={({ pressed }) => ({
        height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center",
        backgroundColor: farben.gold, opacity: gesperrt ? 0.6 : pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: farben.onGold, fontSize: 17, fontFamily: "Barlow_800ExtraBold" }}>{text}</Text>
    </Pressable>
  );
}

/** Leiser Verweis in ink2, etwa "Passwort vergessen?" */
export function LeiserVerweis({ text, onPress, rechts }: { text: string; onPress: () => void; rechts?: boolean }) {
  const { farben } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      hitSlop={8}
      style={{ alignSelf: rechts ? "flex-end" : "center", minHeight: 44, justifyContent: "center" }}
    >
      <Text style={{ fontSize: 14, fontFamily: "Barlow_600SemiBold", color: farben.ink2 }}>{text}</Text>
    </Pressable>
  );
}

/**
 * Hinweis auf dunklem Grund. Eigene Komponente, weil sie useTheme innerhalb
 * von ImmerDunkel lesen muss - die Seiten selbst sehen das gewaehlte Theme.
 */
export function AnmeldeHinweis({ text, ok = false }: { text: string; ok?: boolean }) {
  const { stil } = useTheme();
  return (
    <Text style={ok ? stil.hinweisErfolg : stil.hinweisFehler} accessibilityLiveRegion="polite">
      {text}
    </Text>
  );
}

/** "Noch kein Mitglied? Antrag stellen" - Text in muted, der Verweis in gold. */
export function AnmeldeFusszeile({ text, verweis, onPress }: { text: string; verweis: string; onPress: () => void }) {
  const { farben } = useTheme();
  return (
    <Text style={{ textAlign: "center", fontSize: 14, color: farben.muted, fontFamily: "Barlow_400Regular" }}>
      {text}{" "}
      <Text accessibilityRole="link" onPress={onPress} style={{ color: farben.gold, fontFamily: "Barlow_700Bold" }}>
        {verweis}
      </Text>
    </Text>
  );
}

/** Ladekreis auf dunklem Grund */
export function AnmeldeLaden() {
  const { farben } = useTheme();
  return <ActivityIndicator color={farben.gold} style={{ marginTop: 24 }} />;
}
