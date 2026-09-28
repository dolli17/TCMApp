"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { serieAendern, serieBeenden } from "@/app/admin/plaetze/aktionen";
import { Listenzeile } from "@/components/Listenzeile";

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
const KURZ = ["SO", "MO", "DI", "MI", "DO", "FR", "SA"];
const DATUM = new Intl.DateTimeFormat("de-DE");

/**
 * Angelegte Serien als Listenzeilen (docs/design/clubhaus/verwaltung, VwSerien):
 * Wochentag-Kachel in der Serien-Schraffur, Titel, Zeit, Art und Platz.
 * Ein Tippen öffnet das Blatt zum Ändern; dort steht auch „Serie beenden“.
 *
 * Beenden statt Löschen: die vergangenen Termine bleiben stehen. Wer sie
 * mitlöscht, kann hinterher nicht mehr belegen, wer wann auf dem Platz stand –
 * und genau das ist die Frage, die bei einem Streit gestellt wird.
 */
export function SerienListe({ serien }: { serien: SerienZeile[] }) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [bearbeitet, setBearbeitet] = useState<SerienZeile | null>(null);
  const [laeuft, starte] = useTransition();

  if (serien.length === 0) {
    return <p className="leer-klein">Noch keine Serien angelegt.</p>;
  }

  return (
    <>
      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      <ul className="liste-gruppe" aria-label="Serien">
        {serien.map((s) => (
          <li key={s.id}>
            <Listenzeile
              symbol={<span className="serien-kachel">{KURZ[s.weekday]}</span>}
              titel={s.title}
              kontext={
                <>
                  <span className="zeit tnum">
                    {WOCHENTAGE[s.weekday]} · {String(s.start_time).slice(0, 5)} – {String(s.end_time).slice(0, 5)}
                  </span>
                  <br />
                  {s.type_name} · {s.court_name} · bis {DATUM.format(new Date(s.valid_to))}
                </>
              }
              hinweis={`${s.kuenftige} offen`}
              label={`${s.title}, ${WOCHENTAGE[s.weekday]} ${String(s.start_time).slice(0, 5)}`}
              onClick={laeuft ? undefined : () => setBearbeitet(s)}
            />
          </li>
        ))}
      </ul>

      {bearbeitet && (
        <SerienFenster
          serie={bearbeitet}
          laeuft={laeuft}
          starte={starte}
          melde={(e) => setMeldung({ ok: e.ok, text: e.meldung })}
          onSchliessen={() => setBearbeitet(null)}
          onBeenden={() =>
            starte(async () => {
              const e = await serieBeenden(bearbeitet.id);
              setMeldung({ ok: e.ok, text: e.meldung });
              if (e.ok) setBearbeitet(null);
            })
          }
        />
      )}
    </>
  );
}

/**
 * Uhrzeit, Titel und Enddatum einer Serie ändern.
 *
 * Platz und Wochentag fehlen bewusst: wer die ändert, meint keine Änderung
 * mehr, sondern eine andere Serie. Die legt er besser neu an, statt die
 * Historie der alten mitzuschleppen — deshalb stehen sie hier nur als Text.
 */
function SerienFenster({
  serie, laeuft, starte, melde, onSchliessen, onBeenden,
}: {
  serie: SerienZeile;
  laeuft: boolean;
  starte: (f: () => void | Promise<void>) => void;
  melde: (e: { ok: boolean; meldung: string }) => void;
  onSchliessen: () => void;
  onBeenden: () => void;
}) {
  const [beendenFrage, setBeendenFrage] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [von, setVon] = useState(String(serie.start_time).slice(0, 5));
  const [bis, setBis] = useState(String(serie.end_time).slice(0, 5));
  const [titel, setTitel] = useState(serie.title);
  const [ende, setEnde] = useState(String(serie.valid_to).slice(0, 10));
  const [kollisionen, setKollisionen] = useState<number | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  function speichern(verdraengen: boolean) {
    starte(async () => {
      const e = await serieAendern({
        seriesId: serie.id,
        startTime: von,
        endTime: bis,
        titel,
        validTo: ende,
        verdraengen,
      });
      melde(e);
      setKollisionen(e.kollisionen ?? null);
      if (e.ok) onSchliessen();
    });
  }

  return (
    <dialog
      ref={dialog}
      className="fenster blatt"
      onClose={onSchliessen}
      onCancel={onSchliessen}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      aria-label="Serie bearbeiten"
    >
      <span className="griff" aria-hidden="true" />
      <div className="fenster-kopf">
        <div>
          <h2>{serie.title}</h2>
          <p>
            {serie.court_name} · {WOCHENTAGE[serie.weekday]} · {serie.type_name}
          </p>
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
        <p className="unterzeile">
          Vergangene Termine bleiben stehen. Geändert wird ab heute: die künftigen werden
          abgesagt und in der neuen Lage neu angelegt.
        </p>

        <div className="formraster">
          <label>
            <span>Von</span>
            <input type="time" step={1800} value={von} onChange={(e) => setVon(e.target.value)} />
          </label>
          <label>
            <span>Bis</span>
            <input type="time" step={1800} value={bis} onChange={(e) => setBis(e.target.value)} />
          </label>
          <label>
            <span>Läuft bis</span>
            <input type="date" value={ende} onChange={(e) => setEnde(e.target.value)} />
          </label>
          <label className="breit">
            <span>Titel</span>
            <input type="text" value={titel} onChange={(e) => setTitel(e.target.value)} />
          </label>
        </div>

        <div className="fenster-fuss">
          <button
            type="button"
            className={kollisionen === null ? "knopf" : "knopf gefahr"}
            disabled={laeuft || titel.trim() === ""}
            onClick={() => speichern(kollisionen !== null)}
          >
            {kollisionen === null
              ? laeuft
                ? "Wird gespeichert…"
                : "Änderung speichern"
              : `${kollisionen} ${kollisionen === 1 ? "Buchung" : "Buchungen"} verdrängen`}
          </button>
          <button type="button" className="knopf leise" onClick={onSchliessen}>
            Abbrechen
          </button>
        </div>

        {/* Zerstörendes am Ende, als rote Zeile mit Rückfrage (Regel 4) */}
        <div className="liste-gruppe">
          {!beendenFrage ? (
            <Listenzeile titel="Serie beenden" gefahr pfeil={false} onClick={() => setBeendenFrage(true)} />
          ) : (
            <div className="zeilen-aktionen">
              <button type="button" className="knopf gefahr klein" disabled={laeuft} onClick={onBeenden}>
                {serie.kuenftige} Termine absagen
              </button>
              <button type="button" className="knopf leise klein" onClick={() => setBeendenFrage(false)}>
                Doch nicht
              </button>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
