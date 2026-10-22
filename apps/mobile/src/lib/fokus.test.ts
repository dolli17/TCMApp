import { describe, expect, it, vi } from "vitest";
import { hookProbe } from "@/test/hookprobe";

const probe = hookProbe();
vi.mock("react", () => probe.react);

/** Wie expo-router: der Effekt laeuft bei jedem Fokus, hier von Hand ausgeloest. */
let fokus: (() => void) | null = null;
vi.mock("expo-router", () => ({
  useFocusEffect: (fn: () => void) => {
    fokus = fn;
  },
}));

const { useNachladenBeiFokus } = await import("./fokus");

describe("useNachladenBeiFokus", () => {
  it("laedt erst bei der Rueckkehr, nicht beim ersten Fokus", () => {
    const nachladen = vi.fn();
    probe.zeichne(() => useNachladenBeiFokus(nachladen));

    fokus!();
    expect(nachladen).not.toHaveBeenCalled();
    fokus!();
    fokus!();
    expect(nachladen).toHaveBeenCalledTimes(2);
  });

  it("nimmt die neueste Ladefunktion", async () => {
    const { useState } = await import("react");
    const erste = vi.fn();
    const zweite = vi.fn();
    let laden = erste;
    const z = probe.zeichne(() => {
      useNachladenBeiFokus(laden);
      return useState(0)[1];
    });
    fokus!();
    laden = zweite;
    z.aktuell(1); // neu zeichnen
    fokus!();
    expect(erste).not.toHaveBeenCalled();
    expect(zweite).toHaveBeenCalledTimes(1);
  });
});
