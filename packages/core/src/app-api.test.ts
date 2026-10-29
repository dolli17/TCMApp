import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { appApiJson, NATIVE_RPCS, REALTIME, RPCS, TABELLEN } from "../scripts/app-api";

/**
 * Der API-Vertrag (docs/native/app-api.json) ist die Liste, an der die
 * nativen Apps sich abarbeiten. Er muss zum Schema passen - und zu dem, was
 * die Expo-App wirklich aufruft, solange es sie gibt.
 */

const hier = dirname(fileURLToPath(import.meta.url));
const wurzel = join(hier, "..", "..", "..");
const typen = readFileSync(join(hier, "database.types.ts"), "utf-8");
const app = join(wurzel, "apps", "mobile");

/** Alle Quelltexte der App ohne Tests */
function quelltexte(ordner: string): string[] {
  return readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) return name === "node_modules" ? [] : quelltexte(pfad);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [readFileSync(pfad, "utf-8")] : [];
  });
}

function treffer(muster: RegExp, texte: string[]): string[] {
  return [...new Set(texte.flatMap((t) => [...t.matchAll(muster)].map((m) => m[1]!)))].sort();
}

describe("docs/native/app-api.json", () => {
  it("ist aktuell", () => {
    const datei = readFileSync(join(wurzel, "docs", "native", "app-api.json"), "utf-8");
    expect(datei, "pnpm --filter @tcm/core build:app-api").toBe(appApiJson(typen));
  });

  it("es sind neun Tabellen, die RPC oder View werden sollen", () => {
    expect(Object.keys(TABELLEN)).toHaveLength(9);
  });

  it("jede Tabelle hat einen Ersatz, und den gibt es als RPC", () => {
    for (const [name, t] of Object.entries(TABELLEN)) {
      expect(t.ersatz.length, name).toBeGreaterThan(0);
      for (const r of t.ersatz) expect(r in NATIVE_RPCS || r in RPCS, `${name}: ${r}`).toBe(true);
    }
  });

  it("die RPCs fuer die nativen Apps stehen nicht in der Expo-Liste", () => {
    expect(Object.keys(NATIVE_RPCS).filter((r) => r in RPCS)).toEqual([]);
  });
});

describe.runIf(existsSync(app))("die Liste passt zu apps/mobile", () => {
  const texte = [join(app, "app"), join(app, "src")].flatMap(quelltexte);

  it("dieselben RPCs", () => {
    expect(treffer(/\.rpc\(\s*"([a-z_0-9]+)"/g, texte)).toEqual(Object.keys(RPCS).sort());
  });

  it("dieselben Tabellen", () => {
    expect(treffer(/supabase\s*\.from\(\s*"([a-z_0-9]+)"/g, texte)).toEqual(Object.keys(TABELLEN).sort());
  });

  it("dieselben Realtime-Tabellen", () => {
    expect(treffer(/postgres_changes",\s*\{[^}]*table:\s*"([a-z_0-9]+)"/g, texte)).toEqual(
      REALTIME.map((r) => r.tabelle).sort(),
    );
  });
});
