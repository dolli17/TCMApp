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

  it("Schatten decken sich", () => {
    expect(werteAus(":root")["--shadow"]).toBe(schatten.hell.normal);
    expect(werteAus(":root")["--shadow-sm"]).toBe(schatten.hell.klein);
    expect(werteAus(':root[data-theme="dunkel"]')["--shadow"]).toBe(schatten.dunkel.normal);
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
    expect(paletteFuer("hell").bg).toBe("#EBEFF3");
    expect(paletteFuer("dunkel").bg).toBe("#091622");
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
    // Im Design lag --muted bei 2,71:1 auf dem Seitenhintergrund und riss
    // damit jede Schwelle. Da der Ton für Untertitel in 11-12px benutzt wird,
    // gilt die Textschwelle, nicht die für große Schrift. Die Werte wurden
    // entsprechend angehoben - dieser Test hält sie fest.
    for (const flaeche of ["bg", "surf", "surf2"] as const) {
      expect(
        verhaeltnis(farben.hell.muted, farben.hell[flaeche]),
        `hell: muted auf ${flaeche}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    for (const flaeche of ["bg", "surf", "surf2"] as const) {
      expect(
        verhaeltnis(farben.dunkel.muted, farben.dunkel[flaeche]),
        `dunkel: muted auf ${flaeche}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("Weiß auf Primärblau erfüllt AA", () => {
    expect(verhaeltnis("#FFFFFF", farben.hell.blue)).toBeGreaterThanOrEqual(3);
  });
});
