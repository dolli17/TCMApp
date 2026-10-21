import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { alsCssName, farben, paletteFuer, schatten, schattenRn } from "./tokens";

const hier = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(hier, "tokens.css"), "utf-8");

/** Liest die Werte eines Selektors aus der erzeugten CSS zurück. */
function werteAus(selektor: string): Record<string, string> {
  const start = css.indexOf(selektor + " {");
  if (start === -1) throw new Error(`Selektor ${selektor} fehlt in tokens.css`);
  const block = css.slice(start, css.indexOf("}", start));

  const out: Record<string, string> = {};
  for (const zeile of block.split("\n")) {
    const m = zeile.match(/^\s*(--[a-z0-9-]+):\s*(.+);$/);
    if (m) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

describe("alsCssName", () => {
  it("übersetzt Kamelschreibweise in Bindestriche", () => {
    expect(alsCssName("blue")).toBe("--blue");
    expect(alsCssName("blueInk")).toBe("--blue-ink");
    expect(alsCssName("surf2")).toBe("--surf-2");
  });
});

describe("tokens.css stimmt mit tokens.ts überein", () => {
  // Der eigentliche Zweck dieser Suite: Web liest die CSS-Variablen, Expo das
  // TypeScript-Objekt. Laufen die auseinander, zeigen beide Apps
  // unterschiedliche Farben - und niemand merkt es, bis jemand die Screenshots
  // nebeneinanderlegt.

  it("helles Theme deckt sich", () => {
    const ausCss = werteAus(":root");
    for (const [name, wert] of Object.entries(farben.hell)) {
      expect(ausCss[alsCssName(name)], `Token ${name}`).toBe(wert);
    }
  });

  it("dunkles Theme deckt sich", () => {
    const ausCss = werteAus(':root[data-theme="dunkel"]');
    for (const [name, wert] of Object.entries(farben.dunkel)) {
      expect(ausCss[alsCssName(name)], `Token ${name}`).toBe(wert);
    }
  });

  it("die Klasse .immer-dunkel traegt das dunkle Theme", () => {
    const ausCss = werteAus(".immer-dunkel");
    for (const [name, wert] of Object.entries(farben.dunkel)) {
      expect(ausCss[alsCssName(name)], `Token ${name}`).toBe(wert);
    }
  });

  it("Schatten decken sich", () => {
    expect(werteAus(":root")["--shadow"]).toBe(schatten.hell.normal);
    expect(werteAus(":root")["--shadow-sm"]).toBe(schatten.hell.klein);
    expect(werteAus(":root")["--shadow-float"]).toBe(schatten.hell.schwebend);
    expect(werteAus(':root[data-theme="dunkel"]')["--shadow"]).toBe(schatten.dunkel.normal);
    expect(werteAus(':root[data-theme="dunkel"]')["--shadow-float"]).toBe(
      schatten.dunkel.schwebend,
    );
  });

  it("beide Themes haben dieselben Token-Namen", () => {
    // Fehlt im dunklen Theme ein Token, erbt es den hellen Wert - und ein
    // weisser Kartenhintergrund im Dunkelmodus faellt sofort auf.
    expect(Object.keys(farben.dunkel).sort()).toEqual(Object.keys(farben.hell).sort());
  });

  it("die Systemeinstellung ist berücksichtigt", () => {
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    // Wer von Hand hell gewaehlt hat, soll nicht vom System ueberstimmt werden
    expect(css).toContain(':root:not([data-theme="hell"])');
  });
});

describe("schattenRn", () => {
  // schattenRn erscheint nie in der CSS - der Abgleich oben kann hier also
  // nicht greifen. Was bleibt, ist die Vollstaendigkeit: fehlt im dunklen
  // Theme eine Stufe, faellt der Schatten dort stumm weg, und die Karten
  // liegen flach auf dem Hintergrund, ohne dass eine Fehlermeldung kommt.

  it("kennt dieselben Stufen wie die CSS-Schatten", () => {
    for (const theme of ["hell", "dunkel"] as const) {
      expect(Object.keys(schattenRn[theme]).sort(), `Theme ${theme}`).toEqual(
        Object.keys(schatten[theme]).sort(),
      );
    }
  });

  it("beide Themes haben dieselben Stufen", () => {
    expect(Object.keys(schattenRn.dunkel).sort()).toEqual(Object.keys(schattenRn.hell).sort());
  });

  it("jede Stufe bringt alle Felder mit, die React Native braucht", () => {
    // shadowRadius allein reicht unter Android nicht, elevation allein nicht
    // unter iOS - fehlt eines von beiden, sieht man den Schatten auf genau
    // einer Plattform.
    const erwartet = [
      "elevation",
      "shadowColor",
      "shadowOffset",
      "shadowOpacity",
      "shadowRadius",
    ];
    for (const theme of ["hell", "dunkel"] as const) {
      for (const [stufe, werte] of Object.entries(schattenRn[theme])) {
        expect(Object.keys(werte).sort(), `${theme}.${stufe}`).toEqual(erwartet);
      }
    }
  });
});

describe("paletteFuer", () => {
  it("liefert die passende Palette", () => {
    expect(paletteFuer("hell").bg).toBe("#F3F5F8");
    expect(paletteFuer("dunkel").bg).toBe("#07111D");
  });
});

describe("Kontrast", () => {
  /** Relative Leuchtdichte nach WCAG 2.1 */
  function leuchtdichte(hex: string): number {
    const m = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => {
      const c = parseInt(m.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  }

  function verhaeltnis(a: string, b: string): number {
    const [hell, dunkel] = [leuchtdichte(a), leuchtdichte(b)].sort((x, y) => y - x);
    return (hell! + 0.05) / (dunkel! + 0.05);
  }

  it("Fließtext erfüllt WCAG AA (4.5:1)", () => {
    expect(verhaeltnis(farben.hell.ink, farben.hell.bg)).toBeGreaterThanOrEqual(4.5);
    expect(verhaeltnis(farben.dunkel.ink, farben.dunkel.bg)).toBeGreaterThanOrEqual(4.5);
    expect(verhaeltnis(farben.hell.ink2, farben.hell.surf)).toBeGreaterThanOrEqual(4.5);
  });

  it("gedämpfter Text erfüllt WCAG AA (4.5:1) auf allen Flächen", () => {
    // Im Entwurf lag --muted auf surf-2 und surf-3 knapp unter 4,5:1. Da der
    // Ton für Hilfstexte in 12-13px benutzt wird, gilt die Textschwelle, nicht
    // die für große Schrift. surf-3 gehört dazu, weil "gesperrt" dort in muted
    // steht. Die Werte wurden entsprechend angepasst - dieser Test hält sie fest.
    for (const flaeche of ["bg", "surf", "surf2", "surf3"] as const) {
      expect(
        verhaeltnis(farben.hell.muted, farben.hell[flaeche]),
        `hell: muted auf ${flaeche}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    for (const flaeche of ["bg", "surf", "surf2", "surf3"] as const) {
      expect(
        verhaeltnis(farben.dunkel.muted, farben.dunkel[flaeche]),
        `dunkel: muted auf ${flaeche}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  /**
   * Eine Tokenfarbe mit Deckkraft über eine Fläche gelegt - so entstehen die
   * Hinweisflächen: color-mix(in srgb, var(--red) 12%, transparent) im Web,
   * mitDeckkraft in der App.
   */
  function getoent(farbe: string, anteil: number, flaeche: string): string {
    const kanaele = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16));
    const a = kanaele(farbe);
    const b = kanaele(flaeche);
    return "#" + a.map((v, i) => Math.round(v * anteil + b[i]! * (1 - anteil)).toString(16).padStart(2, "0")).join("");
  }

  it("Knöpfe mit weißer Schrift erfüllen AA (4.5:1) in beiden Themes", () => {
    // Die Schrift der Knöpfe ist 16px fett - keine "große Schrift" im Sinne
    // der WCAG (ab 18,66px fett), also gilt 4,5:1. Im Dunkeln lag der
    // Hauptknopf vorher bei 3,0:1 (U14), der Gefahr-Knopf bei 2,8:1 (U15).
    for (const theme of ["hell", "dunkel"] as const) {
      const f = farben[theme];
      expect(verhaeltnis("#FFFFFF", f.blue), `${theme}: Weiß auf blue`).toBeGreaterThanOrEqual(4.5);
      expect(verhaeltnis("#FFFFFF", f.red), `${theme}: Weiß auf red`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("Knopfflächen heben sich vom Grund ab (3:1, Bedienelement)", () => {
    for (const theme of ["hell", "dunkel"] as const) {
      const f = farben[theme];
      for (const ton of ["blue", "red"] as const) {
        for (const flaeche of ["bg", "surf"] as const) {
          expect(verhaeltnis(f[ton], f[flaeche]), `${theme}: ${ton} auf ${flaeche}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("die grünen Platzkacheln tragen ihre Schrift (4.5:1)", () => {
    // "Freie Zeiten": Kachel in greenInk, Schrift in bg (U15). green selbst
    // ist mit 3,1:1 nur als Kästchen ohne Text gut.
    for (const theme of ["hell", "dunkel"] as const) {
      const f = farben[theme];
      expect(verhaeltnis(f.bg, f.greenInk), `${theme}: bg auf greenInk`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("Fehler- und Erfolgstexte erfüllen AA auch auf den getönten Hinweisflächen", () => {
    // Die Anteile sind die höchsten, die Web (color-mix) und App
    // (mitDeckkraft) für Hinweise und Marken benutzen.
    for (const theme of ["hell", "dunkel"] as const) {
      const f = farben[theme];
      for (const flaeche of ["bg", "surf", "surf2"] as const) {
        const grund = f[flaeche];
        expect(
          verhaeltnis(f.redInk, getoent(f.red, 0.18, grund)),
          `${theme}: redInk auf rot getönter ${flaeche}`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          verhaeltnis(f.greenInk, getoent(f.green, 0.16, grund)),
          `${theme}: greenInk auf grün getönter ${flaeche}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("Text auf den Markenflächen erfüllt AA (4.5:1)", () => {
    for (const theme of ["hell", "dunkel"] as const) {
      const f = farben[theme];
      expect(verhaeltnis(f.onGold, f.gold), `${theme}: onGold auf gold`).toBeGreaterThanOrEqual(4.5);
      expect(verhaeltnis("#FFFFFF", f.brand), `${theme}: Weiß auf brand`).toBeGreaterThanOrEqual(4.5);
    }
    // Im Dunkeln ist tabAktiv ein durchscheinender Schimmer; dort traegt die
    // Leiste selbst den Kontrast, und gold auf dunklem Grund liegt weit ueber 4,5.
    expect(verhaeltnis(farben.hell.tabAktivInk, farben.hell.tabAktiv)).toBeGreaterThanOrEqual(4.5);
    expect(verhaeltnis(farben.hell.navAktivInk, farben.hell.navAktiv)).toBeGreaterThanOrEqual(4.5);
  });

  it("die farbigen Texttöne erfüllen AA (4.5:1) auf Seite und Karte", () => {
    // gold als Text auf hellem Grund kaeme auf nur rund 1,4:1 - deshalb goldInk.
    // Dasselbe fuer green: als Flaeche gut, als Text zu hell.
    for (const theme of ["hell", "dunkel"] as const) {
      const f = farben[theme];
      for (const ton of ["goldInk", "greenInk", "blueInk", "redInk"] as const) {
        for (const flaeche of ["bg", "surf", "surf2", "surf3"] as const) {
          expect(
            verhaeltnis(f[ton], f[flaeche]),
            `${theme}: ${ton} auf ${flaeche}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});
