/**
 * Gestaltung der App
 *
 * Farben und Masse kommen aus @tcm/ui - derselben Quelle wie im Web. Weil
 * StyleSheet.create statische Werte erwartet, wird je Theme einmal ein
 * Stylesheet gebaut und ueber den Context durchgereicht.
 */

import { StyleSheet } from "react-native";
import { abstand, paletteFuer, radius, schrift, type ThemeName } from "@tcm/ui";

export type { ThemeName };
export const farbenFuer = paletteFuer;

export function stilFuer(theme: ThemeName) {
  const f = paletteFuer(theme);

  return StyleSheet.create({
    seite: { flex: 1, backgroundColor: f.bg },
    inhalt: { padding: abstand.rand, gap: abstand.m, paddingBottom: 40 },

    titel: {
      fontFamily: "BarlowSemiCondensed_700Bold",
      fontSize: schrift.groesse.seitentitel,
      color: f.ink,
      letterSpacing: -0.5,
    },
    abschnitt: {
      fontFamily: "BarlowSemiCondensed_700Bold",
      fontSize: schrift.groesse.gross,
      color: f.ink2,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginTop: abstand.s,
    },
    unterzeile: { fontSize: 14, color: f.ink2, fontFamily: "Barlow_400Regular" },
    leise: { fontSize: 13, color: f.muted, fontFamily: "Barlow_400Regular" },
    text: { fontSize: schrift.groesse.normal, color: f.ink, fontFamily: "Barlow_400Regular" },

    /** Blickfang oben. Der Verlauf wird per LinearGradient darübergelegt. */
    hero: {
      borderRadius: radius.hero,
      padding: abstand.rand,
      backgroundColor: f.blue,
      overflow: "hidden",
    },
    heroKicker: {
      color: "#fff", opacity: 0.85, fontSize: 11.5,
      fontFamily: "Barlow_700Bold", letterSpacing: 1.8, textTransform: "uppercase",
    },
    heroTitel: {
      color: "#fff", fontSize: schrift.groesse.hero, marginTop: 9,
      fontFamily: "BarlowSemiCondensed_700Bold", letterSpacing: -0.4,
    },
    heroPillen: { flexDirection: "row", gap: abstand.s, marginTop: abstand.l },
    heroPille: {
      flex: 1, backgroundColor: "rgba(255,255,255,.13)",
      borderWidth: 1, borderColor: "rgba(255,255,255,.16)",
      borderRadius: 13, padding: 10,
    },
    heroPilleWert: {
      color: "#fff", fontSize: 19, fontFamily: "BarlowSemiCondensed_700Bold",
    },
    heroPilleLabel: { color: "#fff", opacity: 0.82, fontSize: 11 },

    karte: {
      backgroundColor: f.surf,
      borderColor: f.line, borderWidth: 1,
      borderRadius: radius.karteGross,
      padding: abstand.l, gap: abstand.s,
    },
    listenkarte: {
      backgroundColor: f.surf, borderColor: f.line, borderWidth: 1,
      borderRadius: radius.karte, padding: 12,
    },

    knopf: {
      backgroundColor: f.blue, borderRadius: radius.knopf,
      paddingVertical: 13, paddingHorizontal: 18, alignItems: "center",
    },
    knopfText: {
      color: "#fff", fontSize: schrift.groesse.gross,
      fontFamily: "BarlowSemiCondensed_700Bold",
    },
    knopfLeise: {
      backgroundColor: "transparent", borderWidth: 1.5, borderColor: f.line2,
      borderRadius: radius.knopf, paddingVertical: 12, paddingHorizontal: 16,
      alignItems: "center",
    },
    knopfLeiseText: { color: f.ink, fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 15 },

    feld: {
      borderWidth: 1.5, borderColor: f.line2, borderRadius: radius.feld,
      padding: 13, fontSize: schrift.groesse.gross,
      backgroundColor: f.surf, color: f.ink, fontFamily: "Barlow_400Regular",
    },
    feldLabel: { fontSize: 12, fontWeight: "600", color: f.ink2, marginBottom: 7 },

    chip: {
      backgroundColor: f.chip, borderRadius: radius.chip,
      paddingVertical: 6, paddingHorizontal: 12,
    },
    chipText: { fontSize: 12, color: f.ink2, fontFamily: "Barlow_600SemiBold" },

    segment: {
      flexDirection: "row", gap: 4, padding: 4,
      backgroundColor: f.chip, borderRadius: 13,
    },
    segmentKnopf: {
      flex: 1, paddingVertical: 11, borderRadius: 9, alignItems: "center",
    },
    segmentAktiv: { backgroundColor: f.surf },
    segmentText: { color: f.muted, fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 15 },
    segmentTextAktiv: { color: f.ink },

    hinweisFehler: {
      backgroundColor: theme === "hell" ? "#F7E3E3" : "rgba(255,107,97,.16)",
      color: f.red, padding: 12, borderRadius: radius.feld, overflow: "hidden",
    },
    hinweisErfolg: {
      backgroundColor: theme === "hell" ? "#E2EFE4" : "rgba(52,201,139,.16)",
      color: f.green, padding: 12, borderRadius: radius.feld, overflow: "hidden",
    },

    zeile: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    zahl: { fontFamily: "BarlowSemiCondensed_700Bold", fontVariant: ["tabular-nums"] },

    /** Belegung: farbiger Strich links wie im Web */
    belegzeile: { borderLeftWidth: 3, borderLeftColor: f.blue, paddingLeft: 11, marginTop: 8 },
    belegzeileEigen: { borderLeftColor: f.green },
    belegzeileBlockung: { borderLeftColor: f.muted },

    /** Freie Stunden als antippbare Marken unter der Platzkarte */
    slotreihe: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
    slot: {
      borderWidth: 1, borderColor: f.line, backgroundColor: f.chip,
      borderRadius: radius.chip, paddingVertical: 7, paddingHorizontal: 11,
    },
    slotAktiv: { backgroundColor: f.blue, borderColor: f.blue },
    slotText: { fontSize: 13, color: f.ink2, fontVariant: ["tabular-nums"] },
    slotTextAktiv: { color: "#fff" },

    /** Modales Fenster - dieselbe Rolle wie <dialog> im Web */
    fensterHuelle: {
      flex: 1, justifyContent: "flex-end",
      backgroundColor: theme === "hell" ? "rgba(9,22,34,.45)" : "rgba(0,0,0,.6)",
    },
    fenster: {
      backgroundColor: f.surf, borderTopLeftRadius: radius.hero, borderTopRightRadius: radius.hero,
      padding: abstand.rand, gap: abstand.m, maxHeight: "88%",
    },
    fensterTitel: {
      fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 21, color: f.ink,
    },

    /** Gewaehlte Mitspieler als entfernbare Marken */
    marke: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: f.blueSoft, borderWidth: 1, borderColor: f.blue,
      borderRadius: radius.chip, paddingVertical: 5, paddingLeft: 11, paddingRight: 7,
    },
    markeGast: { backgroundColor: f.goldSoft, borderColor: f.gold },
    markeText: { fontSize: 13, color: f.ink, fontFamily: "Barlow_600SemiBold" },
    markeWeg: { fontSize: 17, color: f.ink2, paddingHorizontal: 3 },

    trefferzeile: {
      paddingVertical: 10, paddingHorizontal: 11, borderRadius: 9,
      backgroundColor: f.surf2,
    },
  });
}

export type Stil = ReturnType<typeof stilFuer>;
