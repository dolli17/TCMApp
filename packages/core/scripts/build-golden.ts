/**
 * Erzeugt die Golden Files unter packages/core/golden/.
 *
 * Eingaben aus src/golden/faelle.ts, Ausgaben gerechnet mit der
 * TypeScript-Implementierung. Der Test src/golden/golden.test.ts liest die
 * Dateien zurueck und rechnet nach - aendert sich die Logik, ohne dass die
 * Dateien neu erzeugt werden, schlaegt er fehl. Dann gehoert die Aenderung
 * auch in Swift und Kotlin.
 *
 * Neu erzeugen mit: pnpm --filter @tcm/core build:golden
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { alsJson, aufrufe, type GoldenFall } from "../src/golden/aufrufe";
import { faelle } from "../src/golden/faelle";

const ziel = join(dirname(fileURLToPath(import.meta.url)), "..", "golden");
mkdirSync(ziel, { recursive: true });

// Was es nicht mehr gibt, soll auch nicht als Datei liegen bleiben.
for (const datei of readdirSync(ziel)) {
  if (datei.endsWith(".json") && !(datei.slice(0, -5) in faelle)) rmSync(join(ziel, datei));
}

for (const [name, liste] of Object.entries(faelle)) {
  const aufruf = aufrufe[name];
  if (!aufruf) throw new Error(`Kein Adapter fuer ${name} in src/golden/aufrufe.ts`);
  const out: GoldenFall[] = liste.map((f) => ({
    name: f.name,
    input: alsJson(f.input) as Record<string, unknown>,
    output: alsJson(aufruf(f.input)),
  }));
  writeFileSync(join(ziel, `${name}.json`), JSON.stringify(out, null, 2) + "\n", "utf-8");
}
console.warn(`${Object.keys(faelle).length} Golden Files erzeugt`);
