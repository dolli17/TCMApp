"use client";

import { createContext, useContext, useId, useState, useTransition, type ReactNode } from "react";
import { einladungHinweis, MANNSCHAFT_TEXT, type MeineMannschaftsEinladung } from "@tcm/core";
import type { AktionsErgebnis } from "@/app/konto/aktionen";
import { einladungBeantworten } from "@/app/konto/mannschaft/aktionen";
import { SperrGrund } from "./SperrGrund";
import { Toast, type Meldung } from "./Toast";

/**
 * Die Knöpfe der Seite Konto › Mannschaft.
 *
 * Eine gemeinsame Rückmeldung für die ganze Seite: Nach dem Austragen oder
 * Annehmen lädt der Server die Seite neu, und die Zeile mit dem Knopf ist
 * weg. Eine Meldung an der Zeile verschwände mit ihr; der Toast bleibt.
 */

const MeldungKontext = createContext<(m: Meldung) => void>(() => {});

export function MannschaftRahmen({ children }: { children: ReactNode }) {
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  return (
    <MeldungKontext.Provider value={setMeldung}>
      {children}
      <Toast meldung={meldung} onSchliessen={() => setMeldung(null)} />
    </MeldungKontext.Provider>
  );
}

/**
 * Ein Knopf, der erst fragt. Die Frage steht in der Zeile statt in einem
 * Browserdialog, mit Bestätigen und Abbrechen daneben.
 */
export function BestaetigterKnopf({
  label,
  frage,
  bestaetigen,
  aktion,
  leise = true,
}: {
  label: string;
  frage: string;
  bestaetigen: string;
  aktion: () => Promise<AktionsErgebnis>;
  leise?: boolean;
}) {
  const melden = useContext(MeldungKontext);
  const [offen, setOffen] = useState(false);
  const [laeuft, starte] = useTransition();

  if (!offen) {
    return (
      <button type="button" className={`knopf klein${leise ? " leise" : ""}`} onClick={() => setOffen(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className="mannschaft-frage" role="group" aria-label={label}>
      <p>{frage}</p>
      <div className="knopfreihe">
        <button
          type="button"
          className="knopf klein gefahr"
          disabled={laeuft}
          onClick={() =>
            starte(async () => {
              const e = await aktion();
              melden({ ok: e.ok, text: e.meldung });
              if (e.ok) setOffen(false);
            })
          }
        >
          {laeuft ? "Einen Moment…" : bestaetigen}
        </button>
        <button type="button" className="knopf klein leise" disabled={laeuft} onClick={() => setOffen(false)}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

/** Ein Knopf ohne Rückfrage, etwa "Einladen" oder "Zurückziehen". */
export function AktionsKnopf({
  label,
  aktion,
  gesperrt,
  leise = false,
}: {
  label: string;
  aktion: () => Promise<AktionsErgebnis>;
  gesperrt?: boolean;
  leise?: boolean;
}) {
  const melden = useContext(MeldungKontext);
  const [laeuft, starte] = useTransition();
  return (
    <button
      type="button"
      className={`knopf klein${leise ? " leise" : ""}`}
      disabled={laeuft || gesperrt}
      onClick={() =>
        starte(async () => {
          const e = await aktion();
          melden({ ok: e.ok, text: e.meldung });
        })
      }
    >
      {laeuft ? "Einen Moment…" : label}
    </button>
  );
}

/**
 * Annehmen oder Ablehnen einer Einladung. Annehmen fragt erst nach dem
 * Telefon (Standard aus) und nennt einen Wechsel. Ein MF kann nicht wechseln:
 * dann steht der Grund da und nur Ablehnen geht.
 */
export function EinladungAntwort({ einladung }: { einladung: MeineMannschaftsEinladung }) {
  const melden = useContext(MeldungKontext);
  const [offen, setOffen] = useState(false);
  const [telefon, setTelefon] = useState(false);
  const [laeuft, starte] = useTransition();
  const kaestchen = useId();
  const hinweis = einladungHinweis(einladung);

  function antworten(annehmen: boolean) {
    starte(async () => {
      const e = await einladungBeantworten(einladung.id, annehmen, telefon);
      melden({ ok: e.ok, text: e.meldung });
      if (e.ok) setOffen(false);
    });
  }

  if (hinweis?.sperrt) {
    return (
      <div className="mannschaft-antwort">
        <SperrGrund grund={hinweis.text} />
        <div className="knopfreihe">
          <button type="button" className="knopf klein" disabled>
            Annehmen
          </button>
          <button type="button" className="knopf klein leise" disabled={laeuft} onClick={() => antworten(false)}>
            {laeuft ? "Einen Moment…" : "Ablehnen"}
          </button>
        </div>
      </div>
    );
  }

  if (!offen) {
    return (
      <div className="knopfreihe">
        <button type="button" className="knopf klein" onClick={() => setOffen(true)}>
          Annehmen
        </button>
        <button type="button" className="knopf klein leise" disabled={laeuft} onClick={() => antworten(false)}>
          {laeuft ? "Einen Moment…" : "Ablehnen"}
        </button>
      </div>
    );
  }

  return (
    <div className="mannschaft-antwort" role="group" aria-label={`Einladung in ${einladung.team_name} annehmen`}>
      {hinweis && <p className="hinweis">{hinweis.text}</p>}
      <label className="mannschaft-haken" htmlFor={kaestchen}>
        <input id={kaestchen} type="checkbox" checked={telefon} onChange={(e) => setTelefon(e.target.checked)} />
        <span>
          {MANNSCHAFT_TEXT.telefonZustimmung}
          <small>{MANNSCHAFT_TEXT.telefonZustimmungHinweis}</small>
        </span>
      </label>
      <div className="knopfreihe">
        <button type="button" className="knopf klein" disabled={laeuft} onClick={() => antworten(true)}>
          {laeuft ? "Einen Moment…" : `In ${einladung.team_name} eintreten`}
        </button>
        <button type="button" className="knopf klein leise" disabled={laeuft} onClick={() => setOffen(false)}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}
