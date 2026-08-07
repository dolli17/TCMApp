"use client";

import { useState, useTransition } from "react";
import { serieBeenden } from "@/app/admin/plaetze/aktionen";

export interface SerienZeile {
  id: string;
  court_name: string;
  type_name: string;
  title: string;
  weekday: number;
  start_time: string;
  end_time: string;
  valid_from: string;
  valid_to: string;
  kuenftige: number;
}

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const DATUM = new Intl.DateTimeFormat("de-DE");

/**
 * Angelegte Serien mit der Möglichkeit, sie zu beenden.
 *
 * Beenden statt Löschen: die vergangenen Termine bleiben stehen. Wer sie
 * mitlöscht, kann hinterher nicht mehr belegen, wer wann auf dem Platz stand –
 * und genau das ist die Frage, die bei einem Streit gestellt wird.
 */
export function SerienListe({ serien }: { serien: SerienZeile[] }) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [nachfrage, setNachfrage] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  if (serien.length === 0) {
    return <p className="leer">Noch keine Serien angelegt.</p>;
  }

  return (
    <>
      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      <div className="tabellenhuelle"><table className="liste">
        <thead>
          <tr>
            <th>Titel</th>
            <th>Platz</th>
            <th>Wann</th>
            <th>Zeitraum</th>
            <th className="zahl">Offen</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {serien.map((s) => (
            <tr key={s.id}>
              <td>{s.title}</td>
              <td>{s.court_name}</td>
              <td>
                {WOCHENTAGE[s.weekday]}, {String(s.start_time).slice(0, 5)}–
                {String(s.end_time).slice(0, 5)}
              </td>
              <td>
                {DATUM.format(new Date(s.valid_from))} bis {DATUM.format(new Date(s.valid_to))}
              </td>
              <td className="zahl tnum">{s.kuenftige}</td>
              <td>
                {nachfrage === s.id ? (
                  <>
                    <button
                      type="button"
                      className="knopf gefahr klein"
                      disabled={laeuft}
                      onClick={() =>
                        starte(async () => {
                          const e = await serieBeenden(s.id);
                          setMeldung({ ok: e.ok, text: e.meldung });
                          setNachfrage(null);
                        })
                      }
                    >
                      {s.kuenftige} Termine absagen
                    </button>{" "}
                    <button
                      type="button"
                      className="knopf leise klein"
                      onClick={() => setNachfrage(null)}
                    >
                      Abbrechen
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="knopf leise klein"
                    disabled={laeuft}
                    onClick={() => setNachfrage(s.id)}
                  >
                    Beenden
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  );
}
