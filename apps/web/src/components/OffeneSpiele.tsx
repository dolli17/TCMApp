"use client";

import { useState, useTransition } from "react";
import { offenesSpielText } from "@tcm/core";
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
export function OffeneSpiele({
  spiele,
  eigene = [],
}: {
  spiele: OffenesSpiel[];
  /** Buchungen, die das angemeldete Mitglied selbst gebucht hat */
  eigene?: string[];
}) {
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
        Gerade sucht niemand Mitspieler. Wenn du selbst buchst, schalte im Buchungsblatt
        „Mitspieler gesucht“ ein – dann steht deine Buchung hier.
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
          const text = offenesSpielText(s, eigene.includes(s.booking_id));

          return (
            <li key={s.booking_id} className="mcard termin">
              <div className="termin-zeit">
                <b className="dpl">{UHR.format(von)}</b>
                <span>{TAG.format(von)}</span>
              </div>

              <div className="termin-text">
                <strong>{text.kopf}</strong>
                <div className="mit">
                  {s.court_name ?? "Platz"} ·{" "}
                  <span className="tnum">
                    {UHR.format(von)}–{UHR.format(bis)}
                  </span>{" "}
                  · {s.type_name}
                </div>
                {text.dabei && <div className="mit">{text.dabei}</div>}
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
