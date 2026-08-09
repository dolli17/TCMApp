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
  platz: "M3 5h18v14H3zM12 5v14M3 12h18",
  getraenk: "M6 3h12l-1.5 5.5a5 5 0 0 1-9 0zM12 14v7M8 21h8",
  konto: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  glocke: "M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0",
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
        strokeWidth={1.7}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
