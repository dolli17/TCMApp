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

const css = `/* ===========================================================================
   Design-Tokens des TC Muckensturm

   ERZEUGT AUS tokens.ts - NICHT VON HAND AENDERN.
   Neu erzeugen mit: pnpm --filter @tcm/ui build:css

   Das Theme haengt am data-theme-Attribut des html-Elements. Ohne Attribut
   gilt die Systemeinstellung.
   =========================================================================== */

:root {
${block(farben.hell)}
  --shadow: ${schatten.hell.normal};
  --shadow-sm: ${schatten.hell.klein};

  --font-text: ${schrift.text};
  --font-display: ${schrift.display};
  --line-height: ${schrift.zeilenhoehe};
  --tracking: ${schrift.laufweite}px;

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
    --shadow: ${schatten.dunkel.normal};
    --shadow-sm: ${schatten.dunkel.klein};
  }
}

/* Ausdrueckliche Wahl des Mitglieds - schlaegt die Systemeinstellung */
:root[data-theme="dunkel"] {
${block(farben.dunkel)}
  --shadow: ${schatten.dunkel.normal};
  --shadow-sm: ${schatten.dunkel.klein};
}

:root[data-theme="hell"] {
${block(farben.hell)}
  --shadow: ${schatten.hell.normal};
  --shadow-sm: ${schatten.hell.klein};
}
`;

const ziel = join(hier, "..", "src", "tokens.css");
writeFileSync(ziel, css, "utf-8");
console.warn(`tokens.css erzeugt (${css.length} Zeichen)`);
