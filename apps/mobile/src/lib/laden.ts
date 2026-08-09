/**
 * Laden, Nachladen, Fehler
 *
 * Dasselbe Dreigespann stand in jedem Bildschirm noch einmal: ein laedt-Kennzeichen,
 * ein Fehlertext und ein useEffect, der beides setzt. Hier steht es einmal.
 *
 * Der Unterschied zwischen erstem Laden und Nachladen ist der Grund fuer zwei
 * Kennzeichen: beim ersten Mal gibt es nichts zu zeigen, also einen Ladekreis.
 * Beim Herunterziehen steht der Inhalt schon da - dann darf er nicht
 * verschwinden, sonst springt die Liste unter dem Finger weg.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface Ladezustand<T> {
  daten: T | null;
  laedt: boolean;
  aktualisiert: boolean;
  fehler: string | null;
  /** Fuer den RefreshControl: laedt nach, ohne den Inhalt zu leeren. */
  neuLaden: () => void;
  /** Nach einer Aenderung, wenn der Aufrufer auf das Ergebnis warten will. */
  erneutHolen: () => Promise<void>;
  setzeDaten: (daten: T) => void;
}

export function useLaden<T>(laden: () => Promise<T>): Ladezustand<T> {
  const [daten, setDaten] = useState<T | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [aktualisiert, setAktualisiert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // Die Ladefunktion kommt meist als frisch gebautes useCallback herein. Ueber
  // eine Referenz gelesen, haengt der Effekt unten nicht daran - sonst laedt
  // der Bildschirm bei jedem Tastendruck neu.
  const ladenRef = useRef(laden);
  ladenRef.current = laden;

  const holen = useCallback(async (istNachladen: boolean) => {
    if (istNachladen) setAktualisiert(true);
    try {
      const ergebnis = await ladenRef.current();
      setDaten(ergebnis);
      setFehler(null);
    } catch (f) {
      setFehler(f instanceof Error ? f.message : "Unbekannter Fehler.");
    } finally {
      setLaedt(false);
      setAktualisiert(false);
    }
  }, []);

  useEffect(() => {
    void holen(false);
  }, [holen]);

  return {
    daten,
    laedt,
    aktualisiert,
    fehler,
    neuLaden: () => void holen(true),
    erneutHolen: () => holen(true),
    setzeDaten: setDaten,
  };
}
