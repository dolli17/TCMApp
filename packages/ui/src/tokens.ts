/**
 * Design-Tokens des TC Muckensturm
 *
 * Nach dem Designkonzept "Clubhaus" (docs/design/clubhaus/HANDOFF.md). Die
 * Vereinsfarben stammen aus dem Logo: Blau trägt die Marke, Ballgelb heisst
 * "hier handeln" - nur für die eine Hauptaktion eines Screens, eigene Termine
 * und aktive Auswahl, nicht als Deko.
 *
 * DIESE DATEI IST DIE QUELLE. tokens.css wird daraus erzeugt
 * (pnpm --filter @tcm/ui build:css). Ein Test vergleicht beide Wert für Wert,
 * damit sie nicht auseinanderlaufen - Web liest CSS-Variablen, Expo dieses
 * Objekt, und beide müssen dieselbe App zeigen.
 */

export const farben = {
  hell: {
    blue: "#1A6FB0",
    blueInk: "#0F4C81",
    blueSoft: "#E2EFFA",
    // Ballgelb, in beiden Themes gleich. Nie als Textfarbe auf hellem Grund -
    // dafuer gibt es goldInk. Text auf gold ist immer onGold.
    gold: "#FFD21F",
    goldSoft: "#FFF6D1",
    goldInk: "#7A5C00",
    goldLine: "#E0B400",
    onGold: "#0A1624",
    green: "#1E9E6A",
    greenInk: "#167A52",
    red: "#D7544B",
    // Vereinsblau-Flaechen mit weisser Schrift: "Als Naechstes", Avatare,
    // Monatskarte. Anders als blue in beiden Themes gleich - das helle Blau
    // des dunklen Themes traegt keine weisse Schrift.
    brand: "#1466A8",

    bg: "#F3F5F8",
    surf: "#FFFFFF",
    surf2: "#EEF2F6",
    surf3: "#E2E8EF",
    ink: "#0A1624",
    ink2: "#44566B",
    // Abweichung vom Entwurf (dort #5F7185): der erreicht auf surf-2 nur
    // 4,46:1 und auf surf-3 - dort steht "gesperrt" - 4,07:1. Da --muted fuer
    // Hilfstexte in 12 bis 13 Pixel benutzt wird, gilt die Textschwelle von
    // 4,5:1. #596A7D haelt sie auf allen vier Flaechen und behaelt denselben
    // blaugrauen Ton. Der Verein hat Mitglieder bis 92.
    muted: "#596A7D",
    line: "#E3E8EE",
    line2: "#CBD5E0",
    chip: "#EEF2F6",

    // Schwebende Tab-Leiste
    glass: "rgba(255,255,255,.82)",
    glassLine: "rgba(10,22,36,.08)",
    tabAktiv: "#FFD21F",
    tabAktivInk: "#0A1624",
  },
  dunkel: {
    blue: "#3A9BE0",
    blueInk: "#8CC6F0",
    blueSoft: "rgba(58,155,224,.18)",
    gold: "#FFD21F",
    goldSoft: "rgba(255,210,31,.14)",
    goldInk: "#FFD21F",
    goldLine: "#FFD21F",
    onGold: "#0A1624",
    green: "#3DD68C",
    greenInk: "#3DD68C",
    red: "#FF6B61",
    brand: "#1466A8",

    bg: "#07111D",
    surf: "#0E1A29",
    surf2: "#152538",
    surf3: "#1E3249",
    ink: "#F3F7FB",
    ink2: "#B3C2D2",
    // Wie im hellen Theme angehoben (Entwurf: #8497AC). Auf surf-3 lag der
    // Entwurfswert bei 4,36:1, #879AAE haelt 4,52:1.
    muted: "#879AAE",
    line: "rgba(255,255,255,.08)",
    line2: "rgba(255,255,255,.16)",
    chip: "#152538",

    glass: "rgba(22,36,54,.78)",
    glassLine: "rgba(255,255,255,.12)",
    tabAktiv: "rgba(255,210,31,.14)",
    tabAktivInk: "#FFD21F",
  },
} as const;

/**
 * Im Dunkeln liegen Karten ohne Schatten auf dem Grund - Flaeche und Linie
 * reichen, ein Schatten wuerde dort nur verschmieren. Die schwebende Leiste
 * behaelt ihren, sie liegt ueber dem Inhalt.
 */
export const schatten = {
  hell: {
    normal: "0 1px 2px rgba(10,22,36,.05), 0 6px 20px rgba(10,22,36,.06)",
    klein: "0 1px 2px rgba(10,22,36,.05)",
    schwebend: "0 16px 40px rgba(10,22,36,.16)",
  },
  dunkel: {
    normal: "none",
    klein: "none",
    schwebend: "0 16px 40px rgba(0,0,0,.5)",
  },
} as const;

/**
 * Dieselben Schatten für React Native.
 *
 * Bewusst ein zweites Objekt und keine Umrechnung aus `schatten`: die CSS legt
 * zwei Schatten übereinander, React Native kennt pro View genau einen und
 * Android nur eine einzige elevation-Stufe. Eine Konvertierungsfunktion würde
 * eine Genauigkeit vortäuschen, die es nicht gibt. Die Werte hier bilden die
 * kräftigere zweite Lage der CSS nach - das ist die, die man sieht.
 *
 * Android zeichnet ausschliesslich nach `elevation`, und nur auf Flächen mit
 * deckendem Hintergrund; shadowOpacity allein bewirkt dort nichts.
 */
export const schattenRn = {
  hell: {
    normal: {
      shadowColor: "#0A1624",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.06,
      shadowRadius: 10,
      elevation: 2,
    },
    klein: {
      shadowColor: "#0A1624",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    schwebend: {
      shadowColor: "#0A1624",
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.16,
      shadowRadius: 20,
      elevation: 12,
    },
  },
  // Karten ohne Schatten wie in der CSS. Die Felder bleiben trotzdem gesetzt:
  // wer von hell auf dunkel wechselt, soll den alten Schatten nicht behalten.
  dunkel: {
    normal: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    klein: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    schwebend: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.5,
      shadowRadius: 20,
      elevation: 12,
    },
  },
} as const;

/**
 * Barlow für Fließtext und - in 800 - für grosse Titel, Barlow Semi Condensed
 * für Uhrzeiten, Zahlen und Kicker. Die schmale Schnittform prägt den
 * Charakter - ohne sie sieht das Design deutlich beliebiger aus.
 */
export const schrift = {
  text: "'Barlow', system-ui, sans-serif",
  display: "'Barlow Semi Condensed', 'Barlow', sans-serif",
  groesse: {
    /** Semi Condensed 700, Grossbuchstaben, Laufweite laufweiteKicker */
    kicker: 12,
    klein: 13,
    // vorher 15 - am Platz, in der Sonne, liest sich 16 spuerbar besser
    normal: 16,
    /** Abschnittstitel, 700 */
    titel: 22,
    /** Barlow 800, Laufweite laufweiteTitel */
    seitentitel: 34,
    /** Uhrzeit auf der Termin-Karte, Semi Condensed 700 */
    hero: 40,
  },
  gewicht: { normal: 400, mittel: 500, halbfett: 600, fett: 700, extrafett: 800 },
  zeilenhoehe: 1.45,
  laufweite: 0.1,
  /** in em */
  laufweiteKicker: 0.14,
  /** in px, für den Seitentitel */
  laufweiteTitel: -0.6,
} as const;

/**
 * Standardabstand am Rand ist 20 - daran hängt der Rhythmus des ganzen Designs.
 * Zwischen Abschnitten 28 bis 30, innerhalb von Karten 14 bis 16.
 */
export const abstand = {
  xs: 4,
  s: 8,
  m: 12,
  l: 14,
  rand: 20,
  xl: 22,
  abschnitt: 28,
  xxl: 32,
} as const;

export const radius = {
  klein: 10,
  feld: 16,
  knopf: 16,
  karte: 22,
  karteGross: 26,
  /** Bottom-Sheet, nur die oberen Ecken */
  blatt: 30,
  chip: 99,
} as const;

export type ThemeName = "hell" | "dunkel";
// Bewusst nicht (typeof farben)["hell"]: das "as const" macht daraus
// Literaltypen, und dann passt die dunkle Palette nicht mehr in denselben Typ.
export type Farbname = keyof (typeof farben)["hell"];
export type Farbpalette = Record<Farbname, string>;

export function paletteFuer(theme: ThemeName): Farbpalette {
  return farben[theme];
}

/** Umrechnung Token-Name -> CSS-Variable: blueInk wird zu --blue-ink. */
export function alsCssName(schluessel: string): string {
  return "--" + schluessel.replace(/([a-z])([A-Z0-9])/g, "$1-$2").toLowerCase();
}
