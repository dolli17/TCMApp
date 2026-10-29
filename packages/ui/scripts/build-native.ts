/**
 * Erzeugt generated/Tokens.swift und generated/Tokens.kt aus tokens.ts.
 *
 * Wie bei build-css.ts gibt es damit genau eine Quelle fuer die Werte. Der
 * Test native-tokens.test.ts prueft, dass die eingecheckten Dateien zu
 * tokens.ts passen.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { kotlinTokens, swiftTokens } from "./native-tokens";

const ziel = join(dirname(fileURLToPath(import.meta.url)), "..", "generated");
mkdirSync(ziel, { recursive: true });

for (const [datei, inhalt] of [["Tokens.swift", swiftTokens()], ["Tokens.kt", kotlinTokens()]] as const) {
  writeFileSync(join(ziel, datei), inhalt, "utf-8");
  console.warn(`${datei} erzeugt (${inhalt.length} Zeichen)`);
}
