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
      <button className="knopf" onClick={() => setOffen(true)}>
        Mitglied anlegen
      </button>
      {offen && <MitgliedAnlegenFenster onSchliessen={() => setOffen(false)} />}
    </>
  );
}
