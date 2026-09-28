"use client";

import { useState } from "react";
import { MitgliedAnlegenFenster } from "@/components/MitgliedAnlegenFenster";

/**
 * Der Knopf, der das Anlegefenster öffnet.
 *
 * Eigene Komponente, damit die Mitgliederliste eine Server-Komponente bleiben
 * kann – nur dieser Knopf braucht Zustand.
 */
export function MitgliederKopf() {
  const [offen, setOffen] = useState(false);

  return (
    <>
      <button className="knopf gold" onClick={() => setOffen(true)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
        Mitglied anlegen
      </button>
      {offen && <MitgliedAnlegenFenster onSchliessen={() => setOffen(false)} />}
    </>
  );
}
