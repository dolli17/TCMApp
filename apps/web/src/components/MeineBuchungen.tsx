"use client";

import { useState, useTransition } from "react";
import { austragen, stornieren } from "@/app/plan/aktionen";

export interface MeineBuchung {
  booking_id: string;
  court_name: string | null;
  starts_at: string;
  ends_at: string;
  type_code: string;
  type_name: string;
  title: string | null;
  kind: "booking" | "blocking";
  owner_name: string | null;
  players: string[];
  bin_bucher: boolean;
}

const TAG = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  timeZone: "Europe/Berlin",
});

const UHR = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

/**
 * Die eigenen Termine als Liste.
 *
 * Der Unterschied zwischen "gebucht" und "eingetragen" ist hier kein Detail,
 * sondern bestimmt, was man tun darf: der Bucher storniert die ganze Buchung,
 * ein Mitspieler traegt nur sich selbst aus. Beides hinter demselben Knopf zu
 * verstecken waere die Einladung, versehentlich vier Leuten den Platz zu
 * nehmen.
 */
export function MeineBuchungen({ buchungen }: { buchungen: MeineBuchung[] }) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [nachfrage, setNachfrage] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function ausfuehren(id: string, was: "storno" | "austragen") {
    starte(async () => {
      const e = was === "storno" ? await stornieren(id) : await austragen(id);
      setMeldung({ ok: e.ok, text: e.meldung });
      setNachfrage(null);
    });
  }

  if (buchungen.length === 0) {
    return (
      <p className="unterzeile">
        Für dich steht gerade nichts an. Im Belegungsplan findest du die freien Plätze.
      </p>
    );
  }

  return (
    <>
      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      <ul className="terminliste">
        {buchungen.map((b) => {
          const von = new Date(b.starts_at);
          const bis = new Date(b.ends_at);
          const offen = nachfrage === b.booking_id;

          return (
            <li key={b.booking_id} className="mcard termin">
              <div className="termin-zeit">
                <b className="dpl">{UHR.format(von)}</b>
                <span>{TAG.format(von)}</span>
              </div>

              <div className="termin-text">
                <strong>{b.court_name ?? "Platz"}</strong>{" "}
                <span className="tnum">
                  {UHR.format(von)}–{UHR.format(bis)}
                </span>
                <div className="mit">
                  {b.kind === "blocking" ? (b.title ?? b.type_name) : b.type_name}
                  {!b.bin_bucher && b.owner_name ? ` · gebucht von ${b.owner_name}` : ""}
                  {b.players.length > 0 ? ` · mit ${b.players.join(", ")}` : ""}
                </div>
              </div>

              <div className="termin-tat">
                {offen ? (
                  <>
                    <button
                      type="button"
                      className="knopf gefahr klein"
                      disabled={laeuft}
                      onClick={() => ausfuehren(b.booking_id, b.bin_bucher ? "storno" : "austragen")}
                    >
                      {b.bin_bucher ? "Wirklich stornieren" : "Wirklich austragen"}
                    </button>
                    <button
                      type="button"
                      className="knopf leise klein"
                      disabled={laeuft}
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
                    onClick={() => setNachfrage(b.booking_id)}
                  >
                    {b.bin_bucher ? "Stornieren" : "Austragen"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
