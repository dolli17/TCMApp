"use client";

import { useState } from "react";
import { FensterKnopf } from "@/components/FensterKnopf";
import { ForderungAnlegen, type MitgliedWahl } from "@/components/ForderungAnlegen";
import { Listenzeile } from "@/components/Listenzeile";

/**
 * „Von Hand“ als Zeile unter den Quellen von Forderungen. Früher war das der
 * gelbe Knopf im Kopf; der gehört jetzt dem nächsten Schritt der Kasse (U50).
 */
export function ForderungVonHand({ mitglieder }: { mitglieder: MitgliedWahl[] }) {
  const [offen, setOffen] = useState(false);

  return (
    <>
      <Listenzeile
        titel="Forderung anlegen"
        kontext="Von Hand · etwa Schlüssel, Pfand oder eine Nachberechnung"
        onClick={() => setOffen(true)}
      />
      {offen && (
        <FensterKnopf titel="Forderung von Hand" offen onSchliessen={() => setOffen(false)}>
          <ForderungAnlegen mitglieder={mitglieder} />
        </FensterKnopf>
      )}
    </>
  );
}
