"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  groupNotifications, notificationSymbol, relativeTimeLabel, type NotificationSymbol,
} from "@tcm/core";
import {
  alsGelesenMarkieren, ladeBenachrichtigungen, type Benachrichtigung,
} from "@/app/benachrichtigungen-aktionen";

/** Ein Symbol je Art der Nachricht (notificationSymbol) */
const SYMBOL: Record<NotificationSymbol, string> = {
  platz: "M4 4h16v16H4zM4 12h16M8 8h8v8H8zM12 8v8",
  storno: "M6 6l12 12M18 6 6 18",
  geld: "M2 7h20v12H2zM2 11h20M6 15h4",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  glocke: "M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0",
};

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
 * steht, verwirrt mehr als er nuetzt. Die Hervorhebung der neuen bleibt in
 * der offenen Liste stehen, bis "Alle als gelesen" sie wegnimmt.
 *
 * Aussehen nach docs/design/clubhaus: nach Tagen gruppiert, je Art ein
 * Symbol, relative Zeit, ungelesene auf goldSoft.
 */
export function Benachrichtigungen({ ungelesen, label }: { ungelesen: number; label: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [offen, setOffen] = useState(false);
  const [liste, setListe] = useState<Benachrichtigung[] | null>(null);
  const [zaehler, setZaehler] = useState(ungelesen);
  const [laeuft, starte] = useTransition();
  const [alleGesehen, setAlleGesehen] = useState(false);

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

  function alleGelesen() {
    setAlleGesehen(true);
    setZaehler(0);
    void alsGelesenMarkieren();
  }

  function oeffnen() {
    setOffen(true);
    setAlleGesehen(false);
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
            {!alleGesehen && liste?.some((n) => n.read_at === null) && (
              <button type="button" className="knopf leise klein" onClick={alleGelesen}>
                Alle als gelesen
              </button>
            )}
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
              groupNotifications(liste).map((g) => (
                <section key={g.label} className="nachrichtengruppe" aria-label={g.label}>
                  <div className="kicker">{g.label}</div>
                  <ul className="nachrichtenliste">
                    {g.items.map((n) => (
                      <li key={n.id} className={n.read_at === null && !alleGesehen ? "neu" : undefined}>
                        <span className="symbol" aria-hidden="true">
                          <svg viewBox="0 0 24 24" focusable="false">
                            <path
                              d={SYMBOL[notificationSymbol(n.kind)]}
                              fill="none" stroke="currentColor" strokeWidth="1.9"
                              strokeLinecap="round" strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <span className="text">
                          <span className="titelzeile">
                            <strong>{n.title}</strong>
                            <small className="tnum">{relativeTimeLabel(n.created_at)}</small>
                          </span>
                          <span className="body">{n.body}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
      </dialog>
      )}
    </>
  );
}
