/**
 * Der Segment-Schalter der Mitglieder: Alle · Antraege · Mannschaften
 * (Nachbau von apps/web/src/components/MitgliederSegmente.tsx). Bei den
 * Antraegen steht die Zahl der offenen.
 *
 * Die drei Seiten ersetzen einander im Stack, statt sich zu stapeln - so
 * fuehrt Zurueck immer in die Verwaltung, wie bei Reitern.
 */

import { router, type Href } from "expo-router";
import { Segmente } from "@/components/Segmente";

export type MitgliederZiel = "/verwaltung/mitglieder" | "/verwaltung/mitglieder/antraege" | "/verwaltung/mitglieder/mannschaften";

export function MitgliederSegmente({ aktiv, antraege }: { aktiv: MitgliederZiel; antraege: number | null }) {
  return (
    <Segmente<MitgliederZiel>
      beschriftung="Mitglieder"
      wert={aktiv}
      onWahl={(ziel) => {
        if (ziel !== aktiv) router.replace(ziel as Href);
      }}
      optionen={[
        { wert: "/verwaltung/mitglieder", label: "Alle" },
        { wert: "/verwaltung/mitglieder/antraege", label: antraege ? `Anträge ${antraege}` : "Anträge" },
        { wert: "/verwaltung/mitglieder/mannschaften", label: "Mannschaften" },
      ]}
    />
  );
}
