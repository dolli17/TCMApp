"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

/**
 * Etwas ließ sich nicht laden (U1, B14).
 *
 * Ein Ladefehler darf nicht aussehen wie "nichts da": eine leere Liste sagt
 * "keine Forderungen", obwohl die Abfrage nur gescheitert ist. Deshalb steht
 * an jeder solchen Stelle dieser Zustand - mit dem Grund und einem Knopf, der
 * die Seite neu vom Server holt.
 *
 * Für Server-Komponenten reicht `text` (translateDbError); die
 * Fehlergrenzen (error.tsx) geben `erneut` mit, das zusätzlich die Grenze
 * zurücksetzt.
 */
export function Fehlerzustand({
  titel = "Das ließ sich nicht laden.",
  text = "Bitte versuche es gleich noch einmal.",
  erneut,
  kompakt = false,
}: {
  titel?: string;
  text?: string;
  /** Ohne Angabe: die Seite neu vom Server holen. */
  erneut?: () => void;
  /** Innerhalb eines Abschnitts statt als ganze Seite. */
  kompakt?: boolean;
}) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();

  function nochmal() {
    starte(() => {
      router.refresh();
      erneut?.();
    });
  }

  return (
    <div className={`fehlerzustand${kompakt ? " kompakt" : ""}`} role="alert">
      <p className="titel">{titel}</p>
      <p>{text}</p>
      <button type="button" className="knopf leise klein" onClick={nochmal} disabled={laeuft}>
        {laeuft ? "Wird geladen…" : "Erneut versuchen"}
      </button>
    </div>
  );
}

/** Der Inhalt jeder error.tsx: ein Fehler, den keine Seite selbst abgefangen hat. */
export function SeitenFehler({
  error,
  reset,
  titel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  titel: string;
}) {
  // Die eigentliche Meldung steht im Serverlog; im Build kommt hier ohnehin
  // nur ein allgemeiner Text an. Die Kennung hilft beim Suchen danach.
  useEffect(() => console.error(error), [error]);
  return (
    <Fehlerzustand
      titel={titel}
      text={
        error.digest
          ? `Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut. (Kennung ${error.digest})`
          : "Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut."
      }
      erneut={reset}
    />
  );
}

/** Der Inhalt jeder loading.tsx. */
export function Laden({ text = "Wird geladen…" }: { text?: string }) {
  return (
    <div className="laden" role="status" aria-live="polite">
      <span className="laden-kreis" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}
