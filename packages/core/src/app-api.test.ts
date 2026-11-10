import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { appApiJson, NATIVE_RPCS, RPCS, TABELLEN } from "../scripts/app-api";

/**
 * Der API-Vertrag (docs/native/app-api.json) ist die Liste, an der die
 * nativen Apps sich abarbeiten. Er muss zum Schema passen.
 */

const hier = dirname(fileURLToPath(import.meta.url));
const wurzel = join(hier, "..", "..", "..");
const typen = readFileSync(join(hier, "database.types.ts"), "utf-8");

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

  it("die RPCs nur fuer die nativen Apps stehen nicht in der Liste der frueheren Expo-App", () => {
    expect(Object.keys(NATIVE_RPCS).filter((r) => r in RPCS)).toEqual([]);
  });
});
