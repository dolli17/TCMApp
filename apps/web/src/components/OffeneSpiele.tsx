"use client";

import { useState, useTransition } from "react";
import { mitspielen } from "@/app/plan/aktionen";

export interface OffenesSpiel {
  booking_id: string;
  court_name: string | null;
  starts_at: string;
  ends_at: string;
  type_code: string;
  type_name: string;
  owner_name: string | null;
  owner_member_id: string | null;
  players: string[];
  frei: number;
  bin_dabei: boolean;
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
 * Wer noch jemanden zum Spielen sucht.
 *
 * Das ist die Funktion, die den groessten Unterschied macht: bei 300
 * Mitgliedern scheitern Partien nicht am Platz, sondern daran, dass zwei
 * Leute nichts voneinander wissen. Ein Klick traegt ein - keine Anfrage, keine
 * Zusage, kein Rundruf in der Gruppe.
 */
export function OffeneSpiele({ spiele }: { spiele: OffenesSpiel[] }) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  function beitreten(id: string) {
    starte(async () => {
      const e = await mitspielen(id);
      setMeldung({ ok: e.ok, text: e.meldung });
    });
  }

  if (spiele.length === 0) {
    return (
      <p className="unterzeile">
        Gerade sucht niemand Mitspieler. Wenn du selbst buchst, kannst du im Buchungsfenster
        „Mitspieler gesucht“ anhaken – dann steht deine Buchung hier.
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
        {spiele.map((s) => {
          const von = new Date(s.starts_at);
          const bis = new Date(s.ends_at);

          return (
            <li key={s.booking_id} className="mcard termin">
              <div className="termin-zeit">
                <b className="dpl">{UHR.format(von)}</b>
                <span>{TAG.format(von)}</span>
              </div>

              <div className="termin-text">
                <strong>{s.court_name ?? "Platz"}</strong>{" "}
                <span className="tnum">
                  {UHR.format(von)}–{UHR.format(bis)}
                </span>
                <div className="mit">
                  {s.type_name} · {s.owner_name ?? "unbekannt"}
                  {s.players.length > 0 ? ` · mit ${s.players.join(", ")}` : ""}
                </div>
                <div className="mit">
                  {s.frei === 1 ? "noch ein Platz frei" : `noch ${s.frei} Plätze frei`}
                </div>
              </div>

              <div className="termin-tat">
                {s.bin_dabei ? (
                  <span className="mit">Du bist dabei</span>
                ) : (
                  <button
                    type="button"
                    className="knopf klein"
                    disabled={laeuft}
                    onClick={() => beitreten(s.booking_id)}
                  >
                    Mitspielen
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
