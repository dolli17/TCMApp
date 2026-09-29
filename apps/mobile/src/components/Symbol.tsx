/**
 * Die Symbole der Navigation
 *
 * Wortgleiche Pfade wie in apps/web/src/components/Navigation.tsx (die Glocke
 * stammt aus Benachrichtigungen.tsx). Sie stehen damit an zwei Orten - das ist
 * bewusst so: sie nach @tcm/ui zu heben hiesse, dass ein Paket aus reinen
 * Werten plotzlich JSX ausliefert, und es muesste zugleich fuer DOM und fuer
 * react-native-svg taugen. Wer hier einen Pfad aendert, aendert ihn dort mit.
 */

import Svg, { Path } from "react-native-svg";

const PFADE = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  platz: "M4 4h16v16H4zM4 12h16M8 8h8v8H8zM12 8v8",
  getraenk: "M6 3h12l-1.5 5.5a5 5 0 0 1-9 0zM12 14v7M8 21h8",
  konto: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  glocke: "M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0",
  // Die Verwaltung (nur fuer Admins)
  admin: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  dienst: "M9 4h6v3H9zM7 5H5v16h14V5h-2M9 14l2 2 4-4",
  uebersicht: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  serie: "M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
  mitglieder: "M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-1a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  kasse: "M2 7h20v12H2zM2 11h20M6 15h4",
  system: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
} as const;

export type SymbolName = keyof typeof PFADE;

export function Symbol({
  name,
  farbe,
  groesse = 24,
}: {
  name: SymbolName;
  farbe: string;
  groesse?: number;
}) {
  return (
    <Svg width={groesse} height={groesse} viewBox="0 0 24 24">
      <Path
        d={PFADE[name]}
        stroke={farbe}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
