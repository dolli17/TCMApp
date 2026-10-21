"use client";

import { useEffect } from "react";

export interface Meldung { ok: boolean; text: string }

/** So lange bleibt eine Erfolgsmeldung stehen. Fehler bleiben, bis man sie schliesst. */
const ERFOLG_MS = 8000;

/**
 * Die Rückmeldung nach einer Aktion, unten über der schwebenden Leiste (U16).
 *
 * Vorher stand sie über dem Plan und der Getränkekarte - wer weiter unten
 * gebucht hatte, sah sie nicht und wusste nicht, ob es geklappt hat. Unten
 * liegt sie dort, wo der Daumen gerade war.
 *
 * Die Klassen hinweis erfolg/fehler bleiben, damit Farbe und Tests gleich
 * bleiben. Der Ort ist eine Live-Region, die immer da ist: eine Region, die
 * erst mit dem Text entsteht, lesen manche Screenreader nicht vor.
 */
export function Toast({ meldung, onSchliessen }: { meldung: Meldung | null; onSchliessen: () => void }) {
  useEffect(() => {
    if (!meldung?.ok) return;
    const uhr = setTimeout(onSchliessen, ERFOLG_MS);
    return () => clearTimeout(uhr);
    // Jede neue Meldung ist ein neues Objekt und startet die Uhr neu.
  }, [meldung]);

  return (
    <div className="toast-ort" role="status" aria-live="polite">
      {meldung && (
        <div className={`hinweis toast ${meldung.ok ? "erfolg" : "fehler"}`}>
          <span>{meldung.text}</span>
          <button type="button" onClick={onSchliessen} aria-label="Meldung schließen">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
