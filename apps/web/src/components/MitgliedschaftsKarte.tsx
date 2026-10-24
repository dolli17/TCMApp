"use client";

import { useState, useTransition } from "react";
import { berlinDay, isoDateLabel } from "@tcm/core";
import {
  mitgliedschaftBeenden,
  mitgliedschaftWiederaufnehmen,
} from "@/app/admin/mitglieder/[id]/aktionen";

interface Props {
  mitgliedId: string;
  /** Null, wenn keine Mitgliedschaft läuft – dann steht hier der Wiedereintritt. */
  laufend: { id: string; number: string; started_on: string } | null;
  letzte: { number: string; started_on: string; ended_on: string | null; cancellation_reason: string | null } | null;
  archiviert: boolean;
}

function datum(wert: string | null): string {
  if (!wert) return "—";
  return new Intl.DateTimeFormat("de-DE").format(new Date(wert));
}

/**
 * Austritt und Wiedereintritt.
 *
 * Das Beenden ist zweistufig wie das Stornieren im Buchungsfenster: erst
 * erscheint das Formular, dann der Knopf, der es wirklich tut. Kein
 * window.confirm – der Browserdialog lässt sich nicht gestalten und sagt nicht,
 * was passiert.
 */
export function MitgliedschaftsKarte(props: Props) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();
  const [beendenOffen, setBeendenOffen] = useState(false);

  const heute = berlinDay(new Date());
  // Der Regelfall im Verein ist der Austritt zum Jahresende (U46). Bis dahin
  // behält das Mitglied seinen Zugang (B21), danach greift hat_zugang.
  const jahresende = `${heute.slice(0, 4)}-12-31`;
  const [ende, setEnde] = useState(jahresende);

  function beenden(fd: FormData) {
    starte(async () => {
      const e = await mitgliedschaftBeenden(fd);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) setBeendenOffen(false);
    });
  }

  function wiederaufnehmen() {
    starte(async () => {
      const e = await mitgliedschaftWiederaufnehmen(props.mitgliedId);
      setMeldung({ ok: e.ok, text: e.meldung });
    });
  }

  return (
    <section className="karte einstellungen" aria-label="Mitgliedschaft">
      <h2 className="dpl">Mitgliedschaft</h2>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {props.laufend ? (
        <>
          <p className="unterzeile">
            Nummer {props.laufend.number}, Eintritt {datum(props.laufend.started_on)}.
          </p>

          {!beendenOffen ? (
            <button
              className="knopf leise"
              disabled={laeuft || props.archiviert}
              onClick={() => setBeendenOffen(true)}
            >
              Mitgliedschaft beenden
            </button>
          ) : (
            <form action={beenden}>
              <input type="hidden" name="mitglied" value={props.mitgliedId} />
              <div className="formraster">
                <div className="austritt-datum">
                  <label>
                    <span>Austritt zum</span>
                    <input
                      type="date"
                      name="ende"
                      required
                      value={ende}
                      onChange={(e) => setEnde(e.target.value)}
                    />
                  </label>
                  <div className="filterchips" role="group" aria-label="Austritt vorbelegen">
                    <button type="button" aria-pressed={ende === jahresende} onClick={() => setEnde(jahresende)}>
                      zum Jahresende
                    </button>
                    <button type="button" aria-pressed={ende === heute} onClick={() => setEnde(heute)}>
                      sofort
                    </button>
                  </div>
                </div>
                <label>
                  <span>Grund</span>
                  <input type="text" name="grund" placeholder="z. B. Umzug" />
                </label>
              </div>
              <p className="hinweis">
                Offene Forderungen bleiben bestehen – ein Austritt löscht keine Schulden.
              </p>
              <div className="fenster-fuss" style={{ padding: 0 }}>
                <button
                  type="button"
                  className="knopf leise"
                  disabled={laeuft}
                  onClick={() => setBeendenOffen(false)}
                >
                  Abbrechen
                </button>
                <button className="knopf gefahr" disabled={laeuft}>
                  {laeuft ? "Wird beendet…" : ende ? `Zum ${isoDateLabel(ende)} beenden` : "Wirklich beenden"}
                </button>
              </div>
            </form>
          )}
        </>
      ) : (
        <>
          <p className="unterzeile">
            {props.letzte
              ? `Keine laufende Mitgliedschaft. Zuletzt Nummer ${props.letzte.number}, beendet ${datum(props.letzte.ended_on)}${
                  props.letzte.cancellation_reason ? ` (${props.letzte.cancellation_reason})` : ""
                }.`
              : "Keine Mitgliedschaft erfasst."}
          </p>
          <button className="knopf" disabled={laeuft || props.archiviert} onClick={wiederaufnehmen}>
            {laeuft ? "Wird aufgenommen…" : "Wieder aufnehmen"}
          </button>
          {props.archiviert && (
            <p className="beschreibung">
              Archivierte Mitglieder zuerst unten unter „Datensatz beenden“ reaktivieren.
            </p>
          )}
        </>
      )}
    </section>
  );
}
