import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { alsJson, aufrufe, type GoldenFall } from "./aufrufe";
import { faelle } from "./faelle";

/**
 * Die Golden Files sind der Vertrag mit den nativen Apps: Swift und Kotlin
 * rechnen dieselben Faelle und muessen dasselbe herausbekommen. Dieser Test
 * haelt sie bei der TypeScript-Implementierung. Schlaegt er fehl, hat sich
 * die Logik geaendert - dann die Dateien neu erzeugen
 * (pnpm --filter @tcm/core build:golden) und die Aenderung in den Apps
 * nachziehen.
 */

const ordner = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden");
const dateien = readdirSync(ordner).filter((d) => d.endsWith(".json")).sort();

function lies(datei: string): GoldenFall[] {
  return JSON.parse(readFileSync(join(ordner, datei), "utf-8")) as GoldenFall[];
}

describe("Golden Files", () => {
  it("es gibt genau eine Datei je Funktion", () => {
    expect(dateien.map((d) => d.slice(0, -5))).toEqual(Object.keys(faelle).sort());
    expect(Object.keys(aufrufe).sort()).toEqual(Object.keys(faelle).sort());
  });

  describe.each(dateien)("%s", (datei) => {
    const name = datei.slice(0, -5);
    const liste = lies(datei);

    it("enthaelt die Faelle aus faelle.ts", () => {
      // Sonst ist eine Aenderung an den Faellen nicht in der Datei angekommen.
      expect(liste.map((f) => ({ name: f.name, input: f.input }))).toEqual(
        (faelle[name] ?? []).map((f) => ({ name: f.name, input: alsJson(f.input) })),
      );
    });

    it("jeder Name kommt nur einmal vor", () => {
      expect(new Set(liste.map((f) => f.name)).size).toBe(liste.length);
    });

    it.each(liste.map((f) => [f.name, f] as const))("%s", (_name, fall) => {
      expect(alsJson(aufrufe[name]!(fall.input))).toEqual(fall.output);
    });
  });
});
