import { describe, expect, it, vi } from "vitest";
import { paletteFuer } from "@tcm/ui";

// StyleSheet.create gibt in React Native die Objekte unveraendert zurueck.
vi.mock("react-native", () => ({ StyleSheet: { create: <T>(s: T) => s } }));

const { mitDeckkraft, stilFuer } = await import("./stil");

describe("mitDeckkraft", () => {
  it("macht aus Hex eine rgba-Farbe", () => {
    expect(mitDeckkraft("#FF8000", 0.5)).toBe("rgba(255, 128, 0, 0.5)");
    expect(mitDeckkraft("0a0B0c", 1)).toBe("rgba(10, 11, 12, 1)");
  });

  it("ersetzt bei rgba nur die Deckkraft", () => {
    expect(mitDeckkraft("rgba(1, 2, 3, 0.9)", 0.16)).toBe("rgba(1, 2, 3, 0.16)");
    expect(mitDeckkraft("rgb(1,2,3)", 0.2)).toBe("rgba(1, 2, 3, 0.2)");
  });
});

describe("stilFuer", () => {
  it.each(["hell", "dunkel"] as const)("folgt der Palette (%s)", (theme) => {
    const f = paletteFuer(theme);
    const s = stilFuer(theme);
    expect(s.seite.backgroundColor).toBe(f.bg);
    expect(s.karte.backgroundColor).toBe(f.surf);
    expect(s.hinweisFehler.color).toBe(f.red);
    expect(s.hinweisFehler.backgroundColor).toMatch(/^rgba\(\d+, \d+, \d+, 0\.1[26]\)$/);
    expect(s.hinweisErfolg.backgroundColor).toMatch(/^rgba\(\d+, \d+, \d+, 0\.1[26]\)$/);
  });

  it("jede Farbe im Stylesheet ist gueltig", () => {
    for (const theme of ["hell", "dunkel"] as const) {
      for (const [name, regel] of Object.entries(stilFuer(theme))) {
        for (const [eigenschaft, wert] of Object.entries(regel as Record<string, unknown>)) {
          if (!/color/i.test(eigenschaft) || typeof wert !== "string") continue;
          expect(wert, `${theme}: ${name}.${eigenschaft}`).toMatch(
            /^(#[0-9A-Fa-f]{3,8}|rgba?\([\d.,\s]+\)|transparent)$/,
          );
        }
      }
    }
  });
});
