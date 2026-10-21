"use client";

import "./globals.css";
import { SeitenFehler } from "@/components/Fehlerzustand";

/**
 * Der letzte Rettungsanker: ein Fehler im Root-Layout selbst. Dann gibt es
 * kein Layout mehr, das <html> und <body> stellt - diese Seite muss es tun.
 * Ohne das Theme-Skript; es gilt die Systemeinstellung.
 */
export default function GlobalerFehler(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="de">
      <body>
        <main className="globaler-fehler">
          <SeitenFehler {...props} titel="Die Seite ließ sich nicht laden." />
        </main>
      </body>
    </html>
  );
}
