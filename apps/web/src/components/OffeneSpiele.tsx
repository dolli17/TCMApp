"use client";

import { useState, useTransition } from "react";
import { bookingActions, offenesSpielText, partnerFilterAusZeile, partnerFilterText } from "@tcm/core";
import { mitspielen } from "@/app/plan/aktionen";
import { Leerzustand } from "@/components/Leerzustand";

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
  /** "Nur für …" der Suche; null = offen */
  lk_von?: number | string | null;
  lk_bis?: number | string | null;
  fuer?: string | null;
}

const WOCHENTAG = new Intl.DateTimeFormat("de-DE", { weekday: "long", timeZone: "Europe/Berlin" });
const DATUM = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", timeZone: "Europe/Berlin" });

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
  jetzt,
}: {
  spiele: OffenesSpiel[];
  /** Buchungen, die das angemeldete Mitglied selbst gebucht hat */
  eigene?: string[];
  /** Zeitpunkt der Seite als ISO-Zeitstempel - ab Spielbeginn nimmt join_booking niemanden mehr. */
  jetzt: string;
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
      <Leerzustand
        text="Gerade sucht niemand Mitspieler. Wenn du selbst buchst, schalte im Buchungsblatt „Mitspieler gesucht“ ein – dann steht deine Buchung hier."
        aktion={{ href: "/plan", label: "Zur Belegung" }}
      />
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
          const eigenes = eigene.includes(s.booking_id);
          const text = offenesSpielText(s, eigenes);
          const zusatz = partnerFilterText(partnerFilterAusZeile(s));
          const darf = bookingActions({
            startsAt: s.starts_at, own: eigenes, joined: s.bin_dabei, partnerWanted: true, free: s.frei,
            now: new Date(jetzt),
          });

          return (
            <li key={s.booking_id} className="karte offen-karte">
              {/* Wie auf der Startseite: Tag und Zeit mit Spielform, darunter Platz und wer sucht */}
              <div className="text">
                <div className="wann">
                  <b className="tnum">{WOCHENTAG.format(von)}, {UHR.format(von)}</b>
                  <span className="marke-klein">{s.type_name}</span>
                </div>
                <strong>{text.kopf}</strong>
                <small>
                  {DATUM.format(von)} · {s.court_name ?? "Platz"} ·{" "}
                  <span className="tnum">
                    {UHR.format(von)}–{UHR.format(bis)}
                  </span>
                </small>
                {zusatz && <small className="offen-filter">{zusatz}</small>}
                {text.dabei && <small>{text.dabei}</small>}
              </div>

              {s.bin_dabei ? (
                <span className="dein-marker">Du bist dabei</span>
              ) : !darf.join ? null : (
                <button
                  type="button"
                  className="knopf klein"
                  disabled={laeuft}
                  onClick={() => beitreten(s.booking_id)}
                >
                  Mitspielen
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
