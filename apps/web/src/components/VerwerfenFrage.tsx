"use client";

import { useEffect, useRef, useState, type RefObject, type SyntheticEvent } from "react";

/**
 * Schutz vor verlorenen Eingaben in einem Fenster (U60)
 *
 * Ein Klick neben das Fenster und Escape schließen es nur, solange nichts
 * eingegeben wurde. Sonst fragt das Fenster oben nach, wie die übrigen
 * Rückfragen. Der Schließen-Knopf und "Abbrechen" schließen weiter sofort –
 * das sind ausdrückliche Entscheidungen.
 *
 * Die Rückgabe `fenster` kommt als Props an das <dialog> (samt `onClose`, das
 * den Aufrufer weiterreicht), `rueckfrage` wird unter dem Fensterkopf
 * eingesetzt.
 */
export function useVerwerfenFrage(dialog: RefObject<HTMLDialogElement | null>, onClose: () => void) {
  // Ein Ref statt Zustand: jede Eingabe neu zu rendern wäre unnötig.
  const geaendert = useRef(false);
  const [frage, setFrage] = useState(false);
  // Der Fokus landet auf dem harmlosen Knopf, Enter verwirft also nichts.
  const zurueck = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (frage) zurueck.current?.focus();
  }, [frage]);

  function schliessenVersuchen() {
    if (geaendert.current) setFrage(true);
    else dialog.current?.close();
  }

  const fenster = {
    onClose: () => {
      // Das nächste Öffnen beginnt leer.
      geaendert.current = false;
      setFrage(false);
      onClose();
    },
    onInput: () => {
      geaendert.current = true;
    },
    // Abgeschickt ist nicht verloren: React leert das Formular danach ohnehin.
    onSubmit: () => {
      geaendert.current = false;
    },
    onClick: (e: SyntheticEvent) => {
      // Das Ziel ist nur dann der Dialog selbst, wenn wirklich daneben
      // geklickt wurde.
      if (e.target === dialog.current) schliessenVersuchen();
    },
    onCancel: (e: SyntheticEvent) => {
      e.preventDefault();
      schliessenVersuchen();
    },
  };

  const rueckfrage = frage ? (
    <div className="hinweis rueckfrage fenster-rueckfrage" role="group" aria-label="Eingaben verwerfen?">
      <span>Eingaben verwerfen? Was du hier eingetragen hast, wird nicht gespeichert.</span>
      <span className="knopfreihe">
        <button type="button" className="knopf gefahr klein" onClick={() => dialog.current?.close()}>
          Verwerfen
        </button>
        <button type="button" ref={zurueck} className="knopf leise klein" onClick={() => setFrage(false)}>
          Abbrechen
        </button>
      </span>
    </div>
  ) : null;

  return { fenster, rueckfrage };
}
