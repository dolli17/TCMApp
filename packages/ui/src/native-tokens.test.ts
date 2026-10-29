import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { alsRgba, kotlinTokens, swiftTokens } from "../scripts/native-tokens";
import { avatarToene, farben } from "./tokens";

const generiert = join(dirname(fileURLToPath(import.meta.url)), "..", "generated");
const swift = readFileSync(join(generiert, "Tokens.swift"), "utf-8");
const kotlin = readFileSync(join(generiert, "Tokens.kt"), "utf-8");

describe("Tokens fuer die nativen Apps sind aktuell", () => {
  // Die iOS- und die Android-App lesen diese Dateien, nicht tokens.ts. Wer
  // dort eine Farbe aendert und build:native vergisst, bekommt hier den Hinweis.
  it("Tokens.swift", () => {
    expect(swift, "pnpm --filter @tcm/ui build:native").toBe(swiftTokens());
  });

  it("Tokens.kt", () => {
    expect(kotlin, "pnpm --filter @tcm/ui build:native").toBe(kotlinTokens());
  });
});

describe("alsRgba", () => {
  it("liest Hex und rgba", () => {
    expect(alsRgba("#1A6FB0")).toEqual({ r: 26, g: 111, b: 176, a: 1 });
    expect(alsRgba("rgba(255,255,255,.82)")).toEqual({ r: 255, g: 255, b: 255, a: 0.82 });
  });

  it("kann jede Farbe aus tokens.ts lesen", () => {
    for (const wert of [...Object.values(farben.hell), ...Object.values(farben.dunkel), ...avatarToene]) {
      expect(() => alsRgba(wert), wert).not.toThrow();
    }
  });
});

describe("Inhalt", () => {
  it("jedes Farb-Token steht in beiden Dateien, hell und dunkel", () => {
    for (const name of Object.keys(farben.hell)) {
      expect(swift.match(new RegExp(`^ {12}${name}: Color\\(`, "gm")), `Swift ${name}`).toHaveLength(3);
      expect(kotlin.match(new RegExp(`^ {4}${name} = Color\\(`, "gm")), `Kotlin ${name}`).toHaveLength(2);
    }
  });

  it("die Werte stimmen: blue hell und dunkel", () => {
    expect(swift).toContain("blue: Color(hell: 0x1A6FB0FF, dunkel: 0x2478BEFF)");
    expect(kotlin).toContain("blue = Color(0xFF1A6FB0)");
    expect(kotlin).toContain("blue = Color(0xFF2478BE)");
    // Deckkraft: glass hell ist Weiss mit .82 -> 0xD1
    expect(kotlin).toContain("glass = Color(0xD1FFFFFF)");
  });

  it("nennt beide Schriftfamilien", () => {
    for (const datei of [swift, kotlin]) {
      expect(datei).toContain('"Barlow"');
      expect(datei).toContain('"Barlow Semi Condensed"');
    }
  });
});
