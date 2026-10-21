import { beforeEach, describe, expect, it, vi } from "vitest";

const speicher = new Map<string, string>();
let kaputt = false;

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => {
      if (kaputt) throw new Error("gesperrt");
      return speicher.get(k) ?? null;
    },
    setItem: async (k: string, v: string) => {
      if (kaputt) throw new Error("gesperrt");
      speicher.set(k, v);
    },
  },
}));

const { letzterVereinReiter, merkeVereinReiter } = await import("./verein");

beforeEach(() => {
  speicher.clear();
  kaputt = false;
});

describe("letzterVereinReiter", () => {
  it("beginnt bei den Getraenken", async () => {
    expect(await letzterVereinReiter()).toBe("/verein/getraenke");
  });

  it("merkt sich die Veranstaltungen", async () => {
    merkeVereinReiter("/verein/veranstaltungen");
    await Promise.resolve();
    expect(await letzterVereinReiter()).toBe("/verein/veranstaltungen");
  });

  it("nimmt bei fremden Werten die Getraenke", async () => {
    speicher.set("tcm-verein-reiter", "/admin");
    expect(await letzterVereinReiter()).toBe("/verein/getraenke");
  });

  it("faellt bei kaputtem Speicher auf die Getraenke zurueck und wirft nicht", async () => {
    kaputt = true;
    expect(await letzterVereinReiter()).toBe("/verein/getraenke");
    expect(() => merkeVereinReiter("/verein/veranstaltungen")).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});
