/**
 * Erzeugt docs/native/app-api.json - siehe app-api.ts.
 *
 * Neu erzeugen mit: pnpm --filter @tcm/core build:app-api
 * (nach pnpm db:types, wenn sich das Schema geaendert hat)
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appApiJson } from "./app-api";

const hier = dirname(fileURLToPath(import.meta.url));
const typen = readFileSync(join(hier, "..", "src", "database.types.ts"), "utf-8");
const ziel = join(hier, "..", "..", "..", "docs", "native");

mkdirSync(ziel, { recursive: true });
const json = appApiJson(typen);
writeFileSync(join(ziel, "app-api.json"), json, "utf-8");
console.warn(`app-api.json erzeugt (${json.length} Zeichen)`);
