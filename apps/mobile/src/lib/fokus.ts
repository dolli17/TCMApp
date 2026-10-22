/**
 * Nachladen bei der Rueckkehr auf einen Bildschirm
 *
 * Tabs bleiben im Hintergrund stehen. Wer aus dem Konto zum Buchen wechselt
 * und zurueckkommt, sah sonst die Zahlen von vorhin. Beim ersten Fokus laedt
 * useLaden ohnehin, also erst ab dem zweiten.
 */

import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";

export function useNachladenBeiFokus(nachladen: () => void): void {
  const ersterFokus = useRef(true);
  // Ueber eine Referenz: useFocusEffect soll nicht bei jedem Zeichnen neu greifen.
  const nachladenRef = useRef(nachladen);
  nachladenRef.current = nachladen;

  useFocusEffect(
    useCallback(() => {
      if (ersterFokus.current) {
        ersterFokus.current = false;
        return;
      }
      nachladenRef.current();
    }, []),
  );
}
