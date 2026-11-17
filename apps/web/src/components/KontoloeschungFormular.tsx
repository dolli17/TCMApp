"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { KONTOLOESCHUNG_NACHRICHT_MAX, KONTOLOESCHUNG_TEXT as T } from "@tcm/core";
import type { AktionsErgebnis } from "@/app/konto/aktionen";

/**
 * Erklärung, freiwillige Nachricht, dann eine Rückfrage auf der Seite selbst
 * statt eines Browser-Dialogs. Nach einem Antrag verschwindet das Formular;
 * ein zweiter innerhalb von 24 Stunden meldet nur, dass er schon vorliegt.
 */
export function KontoloeschungFormular({ aktion }: { aktion: (fd: FormData) => Promise<AktionsErgebnis> }) {
  const [nachricht, setNachricht] = useState("");
  const [rueckfrage, setRueckfrage] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();
  const fertig = meldung?.ok === true;

  function senden() {
    const fd = new FormData();
    fd.set("nachricht", nachricht);
    starte(async () => {
      const e = await aktion(fd);
      setRueckfrage(false);
      setMeldung({ ok: e.ok, text: e.meldung });
    });
  }

  return (
    <section className="karte einstellungen kuendigen" aria-label={T.titel}>
      {/* Entwurf "Kündigen": die Erklärung in einer ruhigen Karte, darunter die
          Nachricht, unten die beiden Knöpfe über die volle Breite. */}
      <div className="erklaerung">
        {T.erklaerung.map((satz) => (
          <p key={satz}>{satz}</p>
        ))}
      </div>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {!fertig && (
        <>
          <label>
            <span>{T.nachrichtLabel}</span>
            <textarea
              value={nachricht}
              onChange={(e) => setNachricht(e.target.value)}
              maxLength={KONTOLOESCHUNG_NACHRICHT_MAX}
              rows={4}
              disabled={laeuft}
            />
          </label>

          {rueckfrage ? (
            <div role="group" aria-label="Rückfrage" className="knopf-stapel">
              <p><b>{T.bestaetigungFrage}</b></p>
              <button type="button" className="knopf gefahr gross block" onClick={senden} disabled={laeuft}>
                {laeuft ? "Wird gesendet…" : T.bestaetigen}
              </button>
              <button type="button" className="knopf leise gross block" onClick={() => setRueckfrage(false)} disabled={laeuft}>
                {T.abbrechen}
              </button>
            </div>
          ) : (
            // Gefahr statt Blau: der Antrag beendet die Mitgliedschaft (U44).
            <div className="knopf-stapel">
              <button
                type="button"
                className="knopf gefahr-leise gross block"
                onClick={() => {
                  setMeldung(null);
                  setRueckfrage(true);
                }}
              >
                {T.absenden}
              </button>
              <Link href="/konto" className="knopf leise gross block">{T.abbrechen}</Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
