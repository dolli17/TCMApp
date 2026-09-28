/**
 * Gestaltung der App
 *
 * Farben und Masse kommen aus @tcm/ui - derselben Quelle wie im Web. Weil
 * StyleSheet.create statische Werte erwartet, wird je Theme einmal ein
 * Stylesheet gebaut und ueber den Context durchgereicht.
 */

import { StyleSheet } from "react-native";
import { abstand, paletteFuer, radius, schattenRn, schrift, type ThemeName } from "@tcm/ui";

export type { ThemeName };
export const farbenFuer = paletteFuer;

/**
 * Ersatz fuer color-mix(in srgb, <farbe> <anteil>%, transparent) aus der CSS.
 *
 * Das Web mischt Hinweisflaechen und Verlaeufe aus den Tokens statt sie fest
 * einzutragen; React Native kennt color-mix nicht. Diese Funktion nimmt die
 * Tokenfarbe und gibt sie mit Deckkraft zurueck, damit beide Themes ihrer
 * eigenen Palette folgen, statt zwei Farben zu pflegen, die nirgends stehen.
 *
 * Die dunklen Tokens sind teils schon rgba() - dann bleibt der Farbanteil und
 * nur die Deckkraft wird ersetzt.
 */
export function mitDeckkraft(farbe: string, anteil: number): string {
  const rgba = farbe.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const [r, g, b] = rgba[1]!.split(",").map((t) => t.trim());
    return `rgba(${r}, ${g}, ${b}, ${anteil})`;
  }

  const hex = farbe.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${anteil})`;
}

export function stilFuer(theme: ThemeName) {
  const f = paletteFuer(theme);
  const tiefe = schattenRn[theme];

  return StyleSheet.create({
    seite: { flex: 1, backgroundColor: f.bg },
    inhalt: { padding: abstand.rand, gap: abstand.m, paddingBottom: 40 },

    titel: {
      fontFamily: "Barlow_800ExtraBold",
      fontSize: schrift.groesse.seitentitel,
      color: f.ink,
      letterSpacing: schrift.laufweiteTitel,
    },
    abschnitt: {
      fontFamily: "Barlow_700Bold",
      fontSize: schrift.groesse.titel,
      color: f.ink,
      letterSpacing: -0.2,
      marginTop: abstand.s,
    },
    /** Kleine Zeile ueber einem Titel, etwa das Datum */
    kicker: {
      fontFamily: "BarlowSemiCondensed_700Bold",
      fontSize: schrift.groesse.kicker,
      color: f.muted,
      textTransform: "uppercase",
      letterSpacing: schrift.groesse.kicker * schrift.laufweiteKicker,
    },
    leise: { fontSize: schrift.groesse.klein, color: f.muted, fontFamily: "Barlow_400Regular" },
    text: { fontSize: schrift.groesse.normal, color: f.ink, fontFamily: "Barlow_400Regular" },

    // Der Schatten steckt fest in der Karte, damit ihn kein Aufrufer vergessen
    // kann - im Web haengt er ebenso an der Klasse und nicht am Benutzer.
    karte: {
      backgroundColor: f.surf,
      borderColor: f.line, borderWidth: 1,
      borderRadius: radius.karteGross,
      padding: abstand.l, gap: abstand.s,
      ...tiefe.normal,
    },
    listenkarte: {
      backgroundColor: f.surf, borderColor: f.line, borderWidth: 1,
      borderRadius: radius.karte, padding: 12,
      ...tiefe.klein,
    },

    knopf: {
      backgroundColor: f.blue, borderRadius: radius.knopf,
      paddingVertical: 13, paddingHorizontal: 18, alignItems: "center",
    },
    knopfText: {
      color: "#fff", fontSize: schrift.groesse.normal,
      fontFamily: "BarlowSemiCondensed_700Bold",
    },
    knopfLeise: {
      backgroundColor: "transparent", borderWidth: 1.5, borderColor: f.line2,
      borderRadius: radius.knopf, paddingVertical: 12, paddingHorizontal: 16,
      alignItems: "center",
    },
    knopfLeiseText: {
      color: f.ink, fontFamily: "BarlowSemiCondensed_700Bold", fontSize: schrift.groesse.normal,
    },

    /** Varianten aus der CSS: .knopf.gold / .klein */
    knopfGold: { backgroundColor: f.gold },
    knopfGoldText: { color: f.onGold },
    knopfKlein: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: radius.klein },
    knopfKleinText: { fontSize: schrift.groesse.klein },

    feld: {
      borderWidth: 1.5, borderColor: f.line2, borderRadius: radius.feld,
      padding: 13, fontSize: schrift.groesse.normal,
      backgroundColor: f.surf, color: f.ink, fontFamily: "Barlow_400Regular",
    },
    // fontWeight bleibt wirkungslos, sobald eine benannte Familie gesetzt ist -
    // der Schnitt muss ueber den Namen kommen.
    feldLabel: {
      fontSize: 12, fontFamily: "Barlow_600SemiBold", color: f.ink2, marginBottom: 7,
    },

    segment: {
      flexDirection: "row", gap: 4, padding: 4,
      backgroundColor: f.surf2, borderRadius: radius.knopf,
    },
    segmentKnopf: {
      flex: 1, paddingVertical: 11, borderRadius: radius.knopf - 4, alignItems: "center",
    },
    segmentAktiv: { backgroundColor: f.surf },
    segmentText: { color: f.muted, fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 15 },
    segmentTextAktiv: { color: f.ink },

    // Die Flaechen folgen der Palette statt zwei festen Farben - wie im Web,
    // wo dieselbe Mischung per color-mix aus --red und --green entsteht.
    hinweisFehler: {
      backgroundColor: mitDeckkraft(f.red, theme === "hell" ? 0.12 : 0.16),
      color: f.red, padding: 12, borderRadius: radius.feld, overflow: "hidden",
    },
    hinweisErfolg: {
      backgroundColor: mitDeckkraft(f.green, theme === "hell" ? 0.12 : 0.16),
      color: f.greenInk, padding: 12, borderRadius: radius.feld, overflow: "hidden",
    },

    zeile: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

    /** Gewaehlte Mitspieler als entfernbare Marken */
    marke: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: f.blueSoft, borderWidth: 1, borderColor: f.blue,
      borderRadius: radius.chip, paddingVertical: 5, paddingLeft: 11, paddingRight: 7,
    },
    markeText: { fontSize: 13, color: f.ink, fontFamily: "Barlow_600SemiBold" },
    markeWeg: { fontSize: 17, color: f.ink2, paddingHorizontal: 3 },

    /** Kleine Zustandsmarke ohne Aktion: .marke-klein aus der CSS */
    markeKlein: {
      alignSelf: "flex-start",
      backgroundColor: f.blueSoft, borderRadius: radius.chip,
      paddingVertical: 3, paddingHorizontal: 8,
    },
    markeKleinText: { fontSize: 11, fontFamily: "Barlow_600SemiBold", color: f.blueInk },
    markeKleinGrau: { backgroundColor: f.chip },
    markeKleinGrauText: { color: f.ink2 },

    trefferzeile: {
      paddingVertical: 10, paddingHorizontal: 11, borderRadius: 9,
      backgroundColor: f.surf2,
    },
  });
}

export type Stil = ReturnType<typeof stilFuer>;
