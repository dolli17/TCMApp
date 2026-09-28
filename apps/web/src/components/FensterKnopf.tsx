"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Ein Formular im Fenster (Verwaltung, docs/design/clubhaus)
 *
 * Natives <dialog> wie im Anlegefenster: Fokusfalle, Escape und Inertheit des
 * Hintergrunds kommen mit. Das Formular selbst bleibt, wie es ist - es wird
 * nur als Kind hineingereicht.
 *
 * Zwei Arten:
 * - mit `knopf`: der gelbe Kopfknopf, der das Fenster oeffnet;
 * - mit `offen` und `zurueck`: das Fenster steht beim Laden offen (etwa
 *   ?bearbeiten=…) und fuehrt beim Schliessen auf die Adresse ohne Auswahl.
 */
export function FensterKnopf({
  titel,
  unterzeile,
  knopf,
  offen: anfangsOffen = false,
  zurueck,
  breit = false,
  onSchliessen,
  children,
}: {
  titel: string;
  unterzeile?: string;
  knopf?: string;
  offen?: boolean;
  zurueck?: string;
  breit?: boolean;
  /** Fuer Fenster, deren Offen-Zustand der Aufrufer haelt */
  onSchliessen?: () => void;
  children: ReactNode;
}) {
  const [offen, setOffen] = useState(anfangsOffen);
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const suche = useSearchParams().toString();
  const anfangsSuche = useRef(suche);

  useEffect(() => {
    const el = dialog.current;
    if (offen && el && !el.open) el.showModal();
  }, [offen]);

  // Springt ein Formular nach dem Speichern weiter (etwa ?bearbeiten=…), ist
  // das Anlegefenster erledigt - sonst stuenden zwei Fenster uebereinander.
  useEffect(() => {
    if (knopf && suche !== anfangsSuche.current) {
      anfangsSuche.current = suche;
      setOffen(false);
    }
  }, [knopf, suche]);

  function geschlossen() {
    setOffen(false);
    onSchliessen?.();
    if (zurueck) router.push(zurueck);
  }

  return (
    <>
      {knopf && (
        <button type="button" className="knopf gold" onClick={() => setOffen(true)}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
          {knopf}
        </button>
      )}
      {offen && (
        <dialog
          ref={dialog}
          className={`fenster${breit ? " breit" : ""}`}
          aria-label={titel}
          onClose={geschlossen}
          onClick={(e) => {
            if (e.target === dialog.current) dialog.current?.close();
          }}
        >
          <div className="fenster-kopf">
            <div>
              <h2>{titel}</h2>
              {unterzeile && <p>{unterzeile}</p>}
            </div>
            <button type="button" className="fenster-zu" aria-label="Schließen" onClick={() => dialog.current?.close()}>
              ×
            </button>
          </div>
          <div className="fenster-inhalt">{children}</div>
        </dialog>
      )}
    </>
  );
}
