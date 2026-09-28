/**
 * Erzeugt tokens.css aus tokens.ts.
 *
 * Damit gibt es genau eine Quelle für die Werte. Der Test tokens.test.ts liest
 * die erzeugte Datei zurück und vergleicht sie mit dem Objekt - läuft jemand
 * ohne dieses Skript los und ändert die CSS von Hand, schlägt er fehl.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { abstand, alsCssName, farben, radius, schatten, schrift } from "../src/tokens";

const hier = dirname(fileURLToPath(import.meta.url));

function block(werte: Record<string, string>, einzug = "  "): string {
  return Object.entries(werte)
    .map(([k, v]) => `${einzug}${alsCssName(k)}: ${v};`)
    .join("\n");
}

function schattenBlock(werte: (typeof schatten)["hell" | "dunkel"], einzug = "  "): string {
  return [
    `${einzug}--shadow: ${werte.normal};`,
    `${einzug}--shadow-sm: ${werte.klein};`,
    `${einzug}--shadow-float: ${werte.schwebend};`,
  ].join("\n");
}

const css = `/* ===========================================================================
   Design-Tokens des TC Muckensturm

   ERZEUGT AUS tokens.ts - NICHT VON HAND AENDERN.
   Neu erzeugen mit: pnpm --filter @tcm/ui build:css

   Das Theme haengt am data-theme-Attribut des html-Elements. Ohne Attribut
   gilt die Systemeinstellung.
   =========================================================================== */

:root {
${block(farben.hell)}
${schattenBlock(schatten.hell)}

  --font-text: ${schrift.text};
  --font-display: ${schrift.display};
  --line-height: ${schrift.zeilenhoehe};
  --tracking: ${schrift.laufweite}px;
  --tracking-kicker: ${schrift.laufweiteKicker}em;
  --tracking-title: ${schrift.laufweiteTitel}px;

${Object.entries(schrift.groesse)
  .map(([k, v]) => `  --font-size-${k}: ${v}px;`)
  .join("\n")}

${Object.entries(abstand)
  .map(([k, v]) => `  --space-${k}: ${v}px;`)
  .join("\n")}

${Object.entries(radius)
  .map(([k, v]) => `  --radius-${k.toLowerCase()}: ${v}px;`)
  .join("\n")}
}

/* Systemeinstellung, solange niemand von Hand umgeschaltet hat */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="hell"]) {
${block(farben.dunkel, "    ")}
${schattenBlock(schatten.dunkel, "    ")}
  }
}

/* Ausdrueckliche Wahl des Mitglieds - schlaegt die Systemeinstellung */
:root[data-theme="dunkel"] {
${block(farben.dunkel)}
${schattenBlock(schatten.dunkel)}
}

:root[data-theme="hell"] {
${block(farben.hell)}
${schattenBlock(schatten.hell)}
}

/* Immer dunkel, egal welches Theme gewaehlt ist - die Anmeldeseiten. Die
   Variablen gelten nur innerhalb des Elements mit dieser Klasse. */
.immer-dunkel {
${block(farben.dunkel)}
${schattenBlock(schatten.dunkel)}
  color-scheme: dark;
}
`;

const ziel = join(hier, "..", "src", "tokens.css");
writeFileSync(ziel, css, "utf-8");
console.warn(`tokens.css erzeugt (${css.length} Zeichen)`);
