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

    /**
     * Blickfang oben. Zwei Ebenen, weil iOS auf einer View mit
     * overflow:"hidden" keinen Schatten zeichnet: aussen liegt der Schatten,
     * innen der beschnittene Verlauf. Siehe Verlaufsflaeche.tsx.
     */
    heroHuelle: {
      borderRadius: radius.hero,
      shadowColor: f.blue,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.34,
      shadowRadius: 15,
      elevation: 8,
    },
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

    /** Kennzahl in einer Reihe: .kachel-reihe / .kachel aus der CSS */
    kachelReihe: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    kachel: {
      flexGrow: 1, flexBasis: 150, minWidth: 150,
      backgroundColor: f.surf, borderColor: f.line, borderWidth: 1,
      borderRadius: radius.karte, padding: abstand.l, gap: 2,
      ...tiefe.klein,
    },
    kachelTitel: {
      fontSize: schrift.groesse.label, color: f.muted,
      fontFamily: "Barlow_500Medium",
    },
    kachelWert: {
      fontFamily: "BarlowSemiCondensed_700Bold",
      fontSize: schrift.groesse.seitentitel,
      color: f.ink,
      fontVariant: ["tabular-nums"],
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

    /** Varianten aus der CSS: .knopf.gold / .gefahr / .klein / .block */
    knopfGold: { backgroundColor: f.gold },
    knopfGoldText: { color: "#3A2600" },
    knopfGefahr: { backgroundColor: f.red, borderColor: f.red },
    knopfGefahrText: { color: "#fff" },
    knopfKlein: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 10 },
    knopfKleinText: { fontSize: 13 },
    knopfBlock: { alignSelf: "stretch" },

    feld: {
      borderWidth: 1.5, borderColor: f.line2, borderRadius: radius.feld,
      padding: 13, fontSize: schrift.groesse.gross,
      backgroundColor: f.surf, color: f.ink, fontFamily: "Barlow_400Regular",
    },
    // fontWeight bleibt wirkungslos, sobald eine benannte Familie gesetzt ist -
    // der Schnitt muss ueber den Namen kommen.
    feldLabel: {
      fontSize: 12, fontFamily: "Barlow_600SemiBold", color: f.ink2, marginBottom: 7,
    },

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

    /** Reiter innerhalb eines Bereichs: .reiter aus der CSS */
    reiter: {
      flexDirection: "row", gap: 4,
      borderBottomWidth: 1, borderBottomColor: f.line,
    },
    reiterKnopf: {
      paddingVertical: 10, paddingHorizontal: 13,
      borderBottomWidth: 2.5, borderBottomColor: "transparent",
      marginBottom: -1,
    },
    reiterKnopfAktiv: { borderBottomColor: f.blue },
    reiterText: {
      fontFamily: "BarlowSemiCondensed_700Bold",
      fontSize: schrift.groesse.normal, color: f.muted,
    },
    reiterTextAktiv: { color: f.blueInk },

    // Die Flaechen folgen der Palette statt zwei festen Farben - wie im Web,
    // wo dieselbe Mischung per color-mix aus --red und --green entsteht.
    hinweisFehler: {
      backgroundColor: mitDeckkraft(f.red, theme === "hell" ? 0.12 : 0.16),
      color: f.red, padding: 12, borderRadius: radius.feld, overflow: "hidden",
    },
    hinweisErfolg: {
      backgroundColor: mitDeckkraft(f.green, theme === "hell" ? 0.12 : 0.16),
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

    /** Kleine Zustandsmarke ohne Aktion: .marke-klein aus der CSS */
    markeKlein: {
      alignSelf: "flex-start",
      backgroundColor: f.blueSoft, borderRadius: radius.chip,
      paddingVertical: 3, paddingHorizontal: 8,
    },
    markeKleinText: { fontSize: 11, fontFamily: "Barlow_600SemiBold", color: f.blueInk },
    markeKleinGold: { backgroundColor: f.goldSoft },
    markeKleinGoldText: { color: theme === "hell" ? "#7A5600" : f.gold },
    markeKleinGrau: { backgroundColor: f.chip },
    markeKleinGrauText: { color: f.ink2 },
    markeKleinGruen: { backgroundColor: mitDeckkraft(f.green, 0.16) },
    markeKleinGruenText: { color: f.green },
    markeKleinRot: { backgroundColor: mitDeckkraft(f.red, 0.14) },
    markeKleinRotText: { color: f.red },

    /** Tabellen als Flex-Zeilen - eine echte Tabelle gibt es in RN nicht. */
    tabellenkopf: {
      flexDirection: "row", gap: abstand.m,
      paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: f.line,
    },
    tabellenkopfText: {
      fontSize: 10.5, fontFamily: "Barlow_700Bold", color: f.muted,
      textTransform: "uppercase", letterSpacing: 0.6,
    },
    tabellenzeile: {
      flexDirection: "row", gap: abstand.m, alignItems: "center",
      paddingVertical: 11,
      borderBottomWidth: 1, borderBottomColor: f.line,
    },
    tabellenzelleZahl: {
      fontFamily: "BarlowSemiCondensed_700Bold",
      fontVariant: ["tabular-nums"], textAlign: "right", color: f.ink,
    },

    trefferzeile: {
      paddingVertical: 10, paddingHorizontal: 11, borderRadius: 9,
      backgroundColor: f.surf2,
    },
  });
}

export type Stil = ReturnType<typeof stilFuer>;
