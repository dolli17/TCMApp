"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  alsGelesenMarkieren, ladeBenachrichtigungen, type Benachrichtigung,
} from "@/app/benachrichtigungen-aktionen";

const ZEIT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

/**
 * Die Glocke in der Navigation.
 *
 * Der ungelesene Stand kommt beim Rendern der Seite mit - ein Zaehler ist
 * billig. Die Liste selbst wird erst geholt, wenn jemand aufmacht; sie steht
 * auf jeder Seite und wuerde sonst jeden Aufruf um eine Abfrage verteuern,
 * die fast nie jemand liest.
 *
 * Gelesen wird beim Oeffnen markiert, nicht beim Schliessen: wer aufmacht, hat
 * sie gesehen, und ein Zaehler, der nach dem Zumachen noch eine Weile falsch
 * steht, verwirrt mehr als er nuetzt.
 */
export function Benachrichtigungen({ ungelesen, label }: { ungelesen: number; label: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [offen, setOffen] = useState(false);
  const [liste, setListe] = useState<Benachrichtigung[] | null>(null);
  const [zaehler, setZaehler] = useState(ungelesen);
  const [laeuft, starte] = useTransition();

  // Der Zaehler kommt vom Server; nach einer Navigation gilt der neue Wert.
  useEffect(() => setZaehler(ungelesen), [ungelesen]);

  // Das Fenster wird nur eingehaengt, solange es offen ist.
  //
  // Ein dauerhaft im Layout stehendes <dialog class="fenster"> waere auf jeder
  // Seite ein zweites Fenster - jeder Zugriff auf "das Fenster" traefe dann
  // zwei Elemente, und das geschlossene kaeme zuerst.
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, [offen]);

  function oeffnen() {
    setOffen(true);
    starte(async () => {
      const daten = await ladeBenachrichtigungen();
      setListe(daten);
      if (daten.some((n) => n.read_at === null)) {
        await alsGelesenMarkieren();
        setZaehler(0);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="glocke"
        onClick={oeffnen}
        aria-label={
          zaehler > 0 ? `Benachrichtigungen, ${zaehler} ungelesen` : "Benachrichtigungen"
        }
      >
        <svg viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true" focusable="false">
          <path
            d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0"
            strokeWidth="1.7"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="glocke-text">{label}</span>
        {zaehler > 0 && <span className="glocke-zahl tnum">{zaehler > 9 ? "9+" : zaehler}</span>}
      </button>

      {offen && (
        <dialog
          ref={dialog}
          className="fenster"
          onClose={() => setOffen(false)}
          onCancel={() => setOffen(false)}
          onClick={(e) => {
            if (e.target === dialog.current) dialog.current?.close();
          }}
          aria-label="Benachrichtigungen"
        >
          <div className="fenster-kopf">
            <div>
              <h2>Benachrichtigungen</h2>
              <p>Was sich an deinen Buchungen geändert hat</p>
            </div>
            <button
              type="button"
              className="fenster-zu"
              onClick={() => dialog.current?.close()}
              aria-label="Schließen"
            >
              ×
            </button>
          </div>

          <div className="fenster-inhalt">
            {liste === null || laeuft ? (
              <p className="unterzeile">Wird geladen…</p>
            ) : liste.length === 0 ? (
              <p className="unterzeile">Es liegt nichts vor.</p>
            ) : (
              <ul className="nachrichtenliste">
                {liste.map((n) => (
                  <li key={n.id} className={n.read_at === null ? "neu" : undefined}>
                    <strong>{n.title}</strong>
                    <span className="mit">{n.body}</span>
                    <span className="mit tnum">{ZEIT.format(new Date(n.created_at))}</span>
                  </li>
                ))}
              </ul>
          )}
        </div>
      </dialog>
      )}
    </>
  );
}
