/**
 * Die Theme-Wahl: Vorgabe ist das System, eine Wahl von Hand ueberstimmt es
 * und ueberlebt den Neustart. Gezeichnet mit dem Hook-Nachbau; das Ergebnis
 * ist das Provider-Element, dessen value hier geprueft wird.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as React from "react";
import type { ReactElement } from "react";
import { paletteFuer } from "@tcm/ui";
import { hookProbe } from "@/test/hookprobe";

const probe = hookProbe();
let kontextWert: unknown = null;
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  ...probe.react,
  useContext: () => kontextWert,
}));

let system: "light" | "dark" | null = "light";
const speicher = new Map<string, string>();
vi.mock("react-native", () => ({
  useColorScheme: () => system,
  StyleSheet: { create: <T>(s: T) => s },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => speicher.get(k) ?? null,
    setItem: async (k: string, v: string) => void speicher.set(k, v),
  },
}));

const { ImmerDunkel, ThemeAnbieter, useTheme } = await import("./theme");

interface Wert {
  theme: string;
  wahl: string;
  setzeWahl: (w: "system" | "hell" | "dunkel") => void;
  farben: { bg: string };
  stil: { seite: { backgroundColor: string } };
}

function anbieter() {
  const z = probe.zeichne(() => ThemeAnbieter({ children: null }) as ReactElement<{ value: Wert }>);
  return { get wert() { return z.aktuell.props.value; } };
}

const ruhe = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  system = "light";
  speicher.clear();
  kontextWert = null;
});

describe("ThemeAnbieter", () => {
  it("folgt ohne Wahl dem System", async () => {
    system = "dark";
    const a = anbieter();
    await ruhe();
    expect(a.wert).toMatchObject({ theme: "dunkel", wahl: "system" });
    expect(a.wert.farben).toEqual(paletteFuer("dunkel"));
    expect(a.wert.stil.seite.backgroundColor).toBe(paletteFuer("dunkel").bg);

    system = null;
    expect(anbieter().wert.theme).toBe("hell");
  });

  it("nimmt die gespeicherte Wahl", async () => {
    speicher.set("tcm-theme", "dunkel");
    const a = anbieter();
    await ruhe();
    expect(a.wert).toMatchObject({ theme: "dunkel", wahl: "dunkel" });
  });

  it("ignoriert Unsinn im Speicher", async () => {
    speicher.set("tcm-theme", "lila");
    const a = anbieter();
    await ruhe();
    expect(a.wert.wahl).toBe("system");
  });

  it("speichert eine Wahl von Hand, und die ueberstimmt das System", async () => {
    system = "dark";
    const a = anbieter();
    await ruhe();
    a.wert.setzeWahl("hell");
    expect(a.wert).toMatchObject({ theme: "hell", wahl: "hell" });
    expect(speicher.get("tcm-theme")).toBe("hell");
  });
});

describe("useTheme", () => {
  it("braucht den Anbieter", () => {
    expect(() => useTheme()).toThrow("ThemeAnbieter");
  });
});

describe("ImmerDunkel", () => {
  it("ist dunkel und laesst die Wahl stehen", () => {
    const setzeWahl = vi.fn();
    kontextWert = { theme: "hell", wahl: "hell", setzeWahl, farben: paletteFuer("hell"), stil: {} };
    const el = ImmerDunkel({ children: null }) as ReactElement<{ value: Wert }>;
    expect(el.props.value).toMatchObject({ theme: "dunkel", wahl: "hell", setzeWahl });
    expect(el.props.value.farben).toEqual(paletteFuer("dunkel"));
  });
});
