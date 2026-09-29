/**
 * Listen der Verwaltung (docs/design/clubhaus/verwaltung, Regel 3)
 *
 * Nachbau von apps/web/src/components/Listenzeile.tsx: Avatar oder
 * Symbolkachel · Titel (16/700) · eine Kontextzeile · rechts genau ein
 * Hinweis · Pfeil. Die ganze Zeile ist das Ziel, mindestens 64 hoch. Die
 * Zeilen stehen in einer ListenGruppe (gruppierte Karte), darueber ein
 * Gruppenkopf.
 */

import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { radius, schattenRn } from "@tcm/ui";
import { mitDeckkraft } from "@/lib/stil";
import { useTheme } from "@/lib/theme";

export type HinweisTon = "gold" | "rot" | "gruen" | "leise" | "blau";

/** Einer von vier Blautoenen fuer den Avatar, fest je Kennung - wie im Web. */
export function avatarTon(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 4;
}

/** Die vier Avatar-Toene aus der CSS (.avatar.ton-0 bis -3), vorgemischt. */
const AVATAR_TOENE = ["#1466A8", "#105287", "#2A71AE", "#2F5F8C"] as const;

export function Avatar({ kurz, id, groesse = 40 }: { kurz: string; id: string; groesse?: number }) {
  return (
    <View
      style={{
        width: groesse, height: groesse, borderRadius: groesse / 2,
        backgroundColor: AVATAR_TOENE[avatarTon(id)], alignItems: "center", justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontFamily: "Barlow_700Bold", fontSize: groesse * 0.33 }}>{kurz}</Text>
    </View>
  );
}

export function useHinweisFarbe() {
  const { farben } = useTheme();
  return (ton: HinweisTon) =>
    ({
      gold: farben.goldInk,
      rot: farben.red,
      gruen: farben.greenInk,
      leise: farben.muted,
      blau: farben.blueInk,
    })[ton];
}

export function Listenzeile({
  href,
  onPress,
  avatar,
  symbol,
  punkt,
  titel,
  kontext,
  hinweis,
  hinweisTon = "leise",
  neben,
  pfeil,
  aktuell,
  gefahr,
  label,
}: {
  href?: string;
  onPress?: () => void;
  avatar?: { kurz: string; id: string };
  /** Inhalt der Symbolkachel, etwa ein Symbol oder ein Kuerzel */
  symbol?: ReactNode;
  /** Kleiner Punkt vorn: gelb = zu handeln, umrandet = nur zur Kenntnis */
  punkt?: "dringend" | "info";
  titel: string;
  kontext?: ReactNode;
  hinweis?: string;
  hinweisTon?: HinweisTon;
  /** Rechte Spalte statt eines einfachen Hinweises, etwa Betrag + Marke */
  neben?: ReactNode;
  /** Standard: bei Link oder Knopf ja */
  pfeil?: boolean;
  aktuell?: boolean;
  /** Zerstoerende Aktion: rote Zeile */
  gefahr?: boolean;
  label?: string;
}) {
  const { farben } = useTheme();
  const hinweisFarbe = useHinweisFarbe();
  const tippbar = Boolean(href || onPress);

  const inhalt = (
    <>
      {avatar && <Avatar kurz={avatar.kurz} id={avatar.id} />}
      {symbol !== undefined && (
        <View
          style={{
            width: 40, height: 40, borderRadius: 12, backgroundColor: farben.surf2,
            alignItems: "center", justifyContent: "center",
          }}
        >
          {typeof symbol === "string" ? (
            <Text style={{ fontFamily: "BarlowSemiCondensed_800ExtraBold", fontSize: 15, color: farben.ink }}>
              {symbol}
            </Text>
          ) : (
            symbol
          )}
        </View>
      )}
      {punkt && (
        <View
          style={[
            { width: 10, height: 10, borderRadius: 5 },
            punkt === "dringend"
              ? { backgroundColor: farben.gold }
              : { backgroundColor: farben.surf3, borderWidth: 1.5, borderColor: farben.muted },
          ]}
        />
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 16, fontFamily: "Barlow_700Bold", color: gefahr ? farben.red : farben.ink }}
        >
          {titel}
        </Text>
        {kontext !== undefined && kontext !== null && kontext !== "" && (
          typeof kontext === "string" ? (
            <Text style={{ fontSize: 13, color: farben.muted, fontFamily: "Barlow_400Regular", lineHeight: 17.5 }}>
              {kontext}
            </Text>
          ) : (
            kontext
          )
        )}
      </View>
      {neben ??
        (hinweis ? (
          <Text
            style={{
              // Hoechstens gut ein Drittel: sonst verdraengt der Hinweis den Titel.
              maxWidth: "38%", flexShrink: 1,
              fontSize: 13, textAlign: "right", color: hinweisFarbe(hinweisTon),
              fontFamily: hinweisTon === "leise" ? "Barlow_600SemiBold" : "Barlow_700Bold",
            }}
          >
            {hinweis}
          </Text>
        ) : null)}
      {(pfeil ?? tippbar) && (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d="M9 6l6 6-6 6" fill="none" stroke={farben.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      )}
    </>
  );

  const stil = {
    flexDirection: "row" as const, alignItems: "center" as const, gap: 12, minHeight: 64,
    paddingVertical: 10, paddingLeft: 16, paddingRight: 14,
    backgroundColor: aktuell ? farben.goldSoft : "transparent",
  };

  if (!tippbar) return <View style={stil}>{inhalt}</View>;

  return (
    <Pressable
      onPress={() => (href ? router.push(href as Href) : onPress?.())}
      accessibilityRole={href ? "link" : "button"}
      accessibilityLabel={label}
      style={({ pressed }) => [stil, pressed && { backgroundColor: mitDeckkraft(farben.ink, 0.05) }]}
    >
      {inhalt}
    </Pressable>
  );
}

/**
 * Die gruppierte Karte (.liste-gruppe): Zeilen mit Trennlinie dazwischen.
 * Kinder, die null sind, zaehlen nicht - so bleibt keine doppelte Linie.
 */
export function ListenGruppe({ children }: { children: ReactNode }) {
  const { farben, theme } = useTheme();
  // Fragmente aufloesen, damit auch eine map() in einem Fragment Linien bekommt.
  const flach: ReactNode[] = [];
  Children.forEach(children, (k) => {
    if (isValidElement(k) && k.type === Fragment) {
      Children.forEach((k.props as { children?: ReactNode }).children, (e) => {
        if (e !== null && e !== undefined && e !== false) flach.push(e);
      });
    } else if (k !== null && k !== undefined && k !== false) {
      flach.push(k);
    }
  });

  return (
    <View
      style={[
        {
          backgroundColor: farben.surf, borderColor: farben.line, borderWidth: 1,
          borderRadius: radius.karte,
        },
        schattenRn[theme].normal,
      ]}
    >
      <View style={{ borderRadius: radius.karte, overflow: "hidden" }}>
        {flach.map((k, i) => (
          <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: farben.line } : undefined}>
            {k}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Ueberschrift einer gruppierten Karte: Titel links (22/700), rechts eine Angabe. */
export function Gruppenkopf({
  titel,
  neben,
  onNeben,
}: {
  titel: string;
  neben?: string;
  /** Macht die rechte Angabe zum Link */
  onNeben?: () => void;
}) {
  const { farben, stil } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginTop: 6, marginHorizontal: 2 }}>
      <Text accessibilityRole="header" style={[stil.abschnitt, { marginTop: 0 }]}>{titel}</Text>
      {neben &&
        (onNeben ? (
          <Pressable onPress={onNeben} accessibilityRole="link" hitSlop={8}>
            <Text style={{ fontSize: 14, fontFamily: "Barlow_600SemiBold", color: farben.blueInk }}>{neben}</Text>
          </Pressable>
        ) : (
          <Text style={{ fontSize: 14, fontFamily: "Barlow_600SemiBold", color: farben.muted }}>{neben}</Text>
        ))}
    </View>
  );
}

export type MarkenTon = "grau" | "gelb" | "gruen" | "rot" | "blau";

/** Die Statusmarke (.statusmarke): kleine Pille, farbig nach Zustand. */
export function Statusmarke({ text, ton = "grau", gross }: { text: string; ton?: MarkenTon; gross?: boolean }) {
  const { farben, theme } = useTheme();
  const t = {
    grau: { bg: farben.surf2, ink: farben.ink2 },
    gelb: { bg: farben.goldSoft, ink: farben.goldInk },
    gruen: { bg: mitDeckkraft(farben.green, 0.16), ink: farben.greenInk },
    rot: { bg: mitDeckkraft(farben.red, theme === "hell" ? 0.14 : 0.18), ink: farben.red },
    blau: { bg: farben.blueSoft, ink: farben.blueInk },
  }[ton];
  return (
    <View
      style={{
        alignSelf: "flex-start", height: gross ? 30 : 24, paddingHorizontal: gross ? 12 : 9,
        borderRadius: gross ? 15 : 12, backgroundColor: t.bg, justifyContent: "center",
      }}
    >
      <Text numberOfLines={1} style={{ fontSize: gross ? 13.5 : 12, fontFamily: "Barlow_700Bold", color: t.ink }}>
        {text}
      </Text>
    </View>
  );
}

/** Eine Kennzahl-Kachel (.kennzahl): Label, grosse Zahl, Angabe darunter. */
export function Kennzahl({
  label,
  wert,
  info,
  href,
}: {
  label: string;
  wert: string;
  info?: string;
  href?: string;
}) {
  const { farben, theme } = useTheme();
  const inhalt = (
    <>
      <Text style={{ fontSize: 13.5, fontFamily: "Barlow_600SemiBold", color: farben.ink2 }}>{label}</Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ fontSize: 30, lineHeight: 34, fontFamily: "BarlowSemiCondensed_700Bold", color: farben.ink, fontVariant: ["tabular-nums"] }}
      >
        {wert}
      </Text>
      {info && <Text style={{ fontSize: 13, color: farben.muted, fontFamily: "Barlow_400Regular" }}>{info}</Text>}
    </>
  );
  const stil = [
    {
      flex: 1, minWidth: 0, gap: 4, paddingVertical: 16, paddingHorizontal: 16,
      borderRadius: radius.karte, backgroundColor: farben.surf, borderWidth: 1, borderColor: farben.line,
    },
    schattenRn[theme].normal,
  ];
  if (!href) return <View style={stil}>{inhalt}</View>;
  return (
    <Pressable
      onPress={() => router.push(href as Href)}
      accessibilityRole="link"
      style={({ pressed }) => [...stil, pressed && { borderColor: farben.blue }]}
    >
      {inhalt}
    </Pressable>
  );
}

/** Kennzahlen im Zweierraster (.kennzahlen.zwei). */
export function Kennzahlen({ children }: { children: ReactNode }) {
  const kinder = Children.toArray(children);
  const reihen: ReactNode[][] = [];
  for (let i = 0; i < kinder.length; i += 2) reihen.push(kinder.slice(i, i + 2));
  return (
    <View style={{ gap: 10 }}>
      {reihen.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 10 }}>
          {r}
          {r.length === 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  );
}

/** Ein Abschnitt: Kopf und Inhalt mit dem Abstand aus .liste-abschnitt. */
export function Abschnitt({ children }: { children: ReactNode }) {
  return <View style={{ gap: 12 }}>{children}</View>;
}

/** Leerer Zustand in einer Gruppe: eine ruhige Zeile. */
export function LeereZeile({ text }: { text: string }) {
  const { stil } = useTheme();
  return (
    <View style={{ padding: 16 }}>
      <Text style={stil.leise}>{text}</Text>
    </View>
  );
}
