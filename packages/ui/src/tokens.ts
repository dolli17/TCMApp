/**
 * Design-Tokens des TC Muckensturm
 *
 * Übernommen aus dem Designsystem "Tennis Club Redesign". Die Markenfarben
 * stammen aus dem Vereinslogo: Azurblau für Spielerfigur und Schriftzug,
 * Ballgold für den Ball.
 *
 * DIESE DATEI IST DIE QUELLE. tokens.css wird daraus erzeugt
 * (pnpm --filter @tcm/ui build:css). Ein Test vergleicht beide Wert für Wert,
 * damit sie nicht auseinanderlaufen - Web liest CSS-Variablen, Expo dieses
 * Objekt, und beide müssen dieselbe App zeigen.
 */

export const farben = {
  hell: {
    blue: "#1A82C6",
    blueInk: "#0E6BA8",
    blueSoft: "#E7F2FB",
    gold: "#F2A900",
    goldSoft: "#FFF1CF",
    green: "#1E9E6A",
    red: "#D7544B",

    bg: "#EBEFF3",
    surf: "#FFFFFF",
    surf2: "#F4F7FA",
    ink: "#0D1B27",
    ink2: "#485B6B",
    // Abweichung vom Design (dort #8294A2): der Originalwert erreicht auf dem
    // Seitenhintergrund nur 2,71:1 und reisst damit jede WCAG-Schwelle - auch
    // die 3:1 fuer grosse Schrift. Da --muted im Design fuer Untertitel und
    // Hilfstexte in 11 bis 12 Pixel benutzt wird, gilt die Textschwelle von
    // 4,5:1. #616E79 haelt sie auf allen drei Flaechen (4,53 / 5,23 / 4,86)
    // und behaelt denselben blaugrauen Ton. Der Verein hat Mitglieder bis 92.
    muted: "#616E79",
    line: "#E6EBF0",
    line2: "#D6DEE5",
    chip: "#F1F5F8",
  },
  dunkel: {
    blue: "#2EA0E4",
    blueInk: "#56B6F0",
    blueSoft: "rgba(46,160,228,.14)",
    gold: "#FFC400",
    goldSoft: "rgba(255,196,0,.14)",
    green: "#34C98B",
    red: "#FF6B61",

    bg: "#091622",
    surf: "#102232",
    surf2: "#16293B",
    ink: "#EAF2F9",
    ink2: "#A8BCCC",
    // Wie im hellen Theme angehoben (Design: #6E8597). Auf dem
    // Seitenhintergrund war der Originalwert mit 4,75:1 in Ordnung, auf der
    // helleren Kartenflaeche surf-2 aber nur bei 3,8:1. #7992A6 haelt 4,58:1
    // auch dort.
    muted: "#7992A6",
    line: "rgba(255,255,255,.07)",
    line2: "rgba(255,255,255,.13)",
    chip: "rgba(255,255,255,.06)",
  },
} as const;

export const schatten = {
  hell: {
    normal: "0 1px 2px rgba(13,27,39,.05), 0 8px 24px rgba(13,27,39,.07)",
    klein: "0 1px 2px rgba(13,27,39,.06)",
  },
  dunkel: {
    normal: "0 1px 2px rgba(0,0,0,.4), 0 12px 30px rgba(0,0,0,.34)",
    klein: "0 1px 2px rgba(0,0,0,.3)",
  },
} as const;

/**
 * Barlow für Fließtext, Barlow Semi Condensed für Überschriften, Buttons und
 * Zahlen. Die schmale Schnittform prägt den Charakter - ohne sie sieht das
 * Design deutlich beliebiger aus.
 */
export const schrift = {
  text: "'Barlow', system-ui, sans-serif",
  display: "'Barlow Semi Condensed', 'Barlow', sans-serif",
  groesse: {
    winzig: 10,
    klein: 11.5,
    label: 12.5,
    normal: 15,
    gross: 16,
    titel: 19,
    seitentitel: 26,
    hero: 33,
  },
  gewicht: { normal: 400, mittel: 500, halbfett: 600, fett: 700, extrafett: 800 },
  zeilenhoehe: 1.45,
  laufweite: 0.1,
} as const;

/** Standardabstand am Rand ist 20 - daran hängt der Rhythmus des ganzen Designs. */
export const abstand = {
  xs: 4,
  s: 8,
  m: 12,
  l: 14,
  rand: 20,
  xl: 22,
  xxl: 32,
} as const;

export const radius = {
  klein: 8,
  chip: 99,
  knopf: 14,
  feld: 13,
  karte: 15,
  karteGross: 20,
  hero: 24,
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
