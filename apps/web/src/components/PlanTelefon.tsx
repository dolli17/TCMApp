"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  freeGaps, freeSlotsOfDay, localMinutes, minutesOf, minutesToTime, occupancyLabel, startInGap,
  type CourtStatusKind, type FreeGap,
} from "@tcm/core";
import type { Belegung, Platz } from "@/components/Belegungsplan";

/**
 * Der Belegungsplan am Telefon (docs/design/clubhaus/plaetze, HANDOFF-PLAETZE)
 *
 * Dieselben zwei Ansichten wie in der App: die Übersicht als Raster mit
 * wischbaren Stunden und "Freie Zeiten" als Liste der Startzeiten. Die Wahl
 * bleibt in localStorage. Was frei ist und wie Belegungen heissen, rechnet
 * @tcm/core - dieselben Funktionen wie in der App.
 */

const STUNDE_PX = 68;
const ZEILE = 52;
const px = (minuten: number) => (minuten / 60) * STUNDE_PX;
const alsUhrzeit = minutesToTime;

type Ansicht = "uebersicht" | "freie-zeiten";
const SPEICHER = "tcm-plaetze-ansicht";

interface Auswahl { courtId: string; minute: number; bis: number }

/** "Platz 3" -> "3"; andere Namen bleiben bei der Kurzform. */
const nummer = (p: Platz) => p.name.match(/^Platz\s+(.+)$/i)?.[1] ?? p.short_name;

export function PlanTelefon(props: {
  datum: string;
  jetzt: Date;
  istHeute: boolean;
  plaetze: Platz[];
  belegungen: Belegung[];
  oeffnung: number;
  schluss: number;
  raster: number;
  dauer: number;
  verwaltbar: (b: Belegung) => boolean;
  onBuchen: (courtId: string, minute: number) => void;
  onVerwalten: (b: Belegung) => void;
}) {
  const [ansicht, setAnsicht] = useState<Ansicht>("uebersicht");
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null);

  // Erst nach dem ersten Zeichnen: der Server kennt localStorage nicht.
  useEffect(() => {
    try {
      const a = localStorage.getItem(SPEICHER);
      if (a === "uebersicht" || a === "freie-zeiten") setAnsicht(a);
    } catch {
      // Ohne Speicher bleibt die Übersicht.
    }
  }, []);

  useEffect(() => setAuswahl(null), [props.datum]);

  function waehle(a: Ansicht) {
    setAnsicht(a);
    setAuswahl(null);
    try {
      localStorage.setItem(SPEICHER, a);
    } catch {
      // nicht schlimm
    }
  }

  const platz = auswahl && props.plaetze.find((p) => p.id === auswahl.courtId);

  return (
    <div className="plan-listen">
      <div className="segtoggle telefon-ansicht" role="radiogroup" aria-label="Darstellung">
        {(["uebersicht", "freie-zeiten"] as const).map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={ansicht === a}
            onClick={() => waehle(a)}
          >
            {a === "uebersicht" ? "Übersicht" : "Freie Zeiten"}
          </button>
        ))}
      </div>

      {ansicht === "uebersicht" ? (
        <>
          <Raster {...props} auswahl={auswahl} onAuswahl={setAuswahl} />
          <ul className="legende telefon-legende" aria-hidden="true">
            <li><i className="eigen" />Du</li>
            <li><i className="belegt" />belegt</li>
            <li><i className="sucht" />sucht Mitspieler</li>
            <li><i className="serie" />Training</li>
            <li><i className="gesperrt" />gesperrt</li>
          </ul>
          {auswahl && platz && (
            <div className="auswahl-leiste">
              <div aria-live="polite">
                <b>{platz.name} · {alsUhrzeit(auswahl.minute)} – {alsUhrzeit(auswahl.minute + props.dauer)}</b>
                <small>frei bis {alsUhrzeit(auswahl.bis)}</small>
              </div>
              <button
                type="button"
                onClick={() => props.onBuchen(auswahl.courtId, auswahl.minute)}
                aria-label={`${platz.name} um ${alsUhrzeit(auswahl.minute)} Uhr buchen`}
              >
                Buchen
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <FreieZeiten {...props} />
          <ul className="legende telefon-legende kaestchen" aria-hidden="true">
            <li><i className="frei" />frei</li>
            <li><i className="voll" />belegt</li>
            <li><i className="sucht" />sucht Mitspieler</li>
            <li><i className="eigen" />du</li>
          </ul>
        </>
      )}
    </div>
  );
}

/* --- Übersicht als Raster ------------------------------------------------- */

function Raster({
  datum, jetzt, istHeute, plaetze, belegungen, oeffnung, schluss, raster, dauer, auswahl,
  verwaltbar, onAuswahl, onVerwalten,
}: Parameters<typeof PlanTelefon>[0] & { auswahl: Auswahl | null; onAuswahl: (a: Auswahl) => void }) {
  const breite = px(schluss - oeffnung);
  const jetztMin = istHeute ? localMinutes(jetzt) : null;
  const wisch = useRef<HTMLDivElement>(null);

  // Beim Oeffnen und bei jedem Tageswechsel auf "jetzt" (eine Viertelstunde
  // vorher), an anderen Tagen auf die Oeffnung.
  useEffect(() => {
    const el = wisch.current;
    if (!el) return;
    el.scrollLeft = jetztMin === null ? 0 : Math.max(0, px(jetztMin - 15 - oeffnung));
    // Nur beim Tageswechsel, nicht mit jeder Minute.
  }, [datum]);

  const stunden: number[] = [];
  for (let m = Math.ceil(oeffnung / 60) * 60; m < schluss; m += 60) stunden.push(m);

  function tippen(platz: Platz, l: FreeGap, e: MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    // Tastatur: kein Zeiger, also der frueheste Beginn.
    const minute = e.detail === 0 ? l.from : l.from + ((e.clientX - rect.left) / STUNDE_PX) * 60;
    onAuswahl({ courtId: platz.id, minute: startInGap(l, minute, raster, dauer), bis: l.until });
  }

  return (
    <div className="tr">
      <div className="tr-spalte">
        <div className="tr-ecke" />
        {plaetze.map((p) => (
          <div key={p.id} className="tr-platz" aria-label={p.name}>
            <small aria-hidden="true">PLATZ</small>
            <b className="dpl" aria-hidden="true">{nummer(p)}</b>
          </div>
        ))}
      </div>

      <div
        className="tr-wisch"
        ref={wisch}
        role="region"
        aria-label="Belegung nach Plätzen, waagerecht wischen für frühere und spätere Stunden"
        tabIndex={0}
      >
        <div style={{ width: breite }}>
          <div className="tr-kopf" aria-hidden="true">
            {stunden.map((m) => (
              <span key={m} className="tnum" style={{ left: px(m - oeffnung) + 6 }}>{alsUhrzeit(m)}</span>
            ))}
          </div>
          <div
            className="tr-koerper"
            style={{
              height: plaetze.length * ZEILE,
              backgroundPositionX: px((Math.ceil(oeffnung / 60) * 60) - oeffnung),
            }}
          >
            {plaetze.map((platz, i) => (
              <div key={platz.id} className="tr-zeile" style={{ top: i * ZEILE }} role="group" aria-label={platz.name}>
                {freeGaps({
                  day: datum, courtId: platz.id, openingMinutes: oeffnung, closingMinutes: schluss,
                  slotMinutes: raster, durationMinutes: dauer, occupied: belegungen, now: jetzt,
                }).map((l) => (
                  <button
                    key={l.from}
                    type="button"
                    className="tr-frei"
                    style={{ left: px(l.from - oeffnung), width: px(l.until - l.from) }}
                    onClick={(e) => tippen(platz, l, e)}
                    aria-label={`${platz.name}, frei von ${alsUhrzeit(l.from)} bis ${alsUhrzeit(l.until)} Uhr, auswählen`}
                  />
                ))}

                {belegungen
                  .filter((b) => b.court_id === platz.id)
                  .map((b) => {
                    const von = Math.max(oeffnung, minutesOf(b.starts_at));
                    const bis = Math.min(schluss, minutesOf(b.ends_at));
                    if (bis <= von) return null;
                    const l = occupancyLabel(b);
                    const stil = { left: px(von - oeffnung) + 3, width: Math.max(px(bis - von) - 6, 12) };
                    const inhalt = (
                      <>
                        <b>{l.title}</b>
                        <span>{l.detail}</span>
                      </>
                    );
                    return verwaltbar(b) ? (
                      <button
                        key={b.booking_id}
                        type="button"
                        className={`tr-block ${l.art}`}
                        style={stil}
                        onClick={() => onVerwalten(b)}
                        aria-label={`${platz.name}, ${l.spoken}`}
                      >
                        {inhalt}
                      </button>
                    ) : (
                      <div
                        key={b.booking_id}
                        className={`tr-block ${l.art}`}
                        style={stil}
                        role="img"
                        aria-label={`${platz.name}, ${l.spoken}`}
                      >
                        {inhalt}
                      </div>
                    );
                  })}

                {auswahl?.courtId === platz.id && (
                  <div
                    className="tr-block wahl"
                    style={{ left: px(auswahl.minute - oeffnung) + 3, width: px(dauer) - 6 }}
                    aria-hidden="true"
                  >
                    <b>+ {alsUhrzeit(auswahl.minute)}</b>
                    <span>ausgewählt</span>
                  </div>
                )}
              </div>
            ))}

            {jetztMin !== null && jetztMin >= oeffnung && jetztMin <= schluss && (
              <div className="tr-jetzt" style={{ left: px(jetztMin - oeffnung) - 1 }} aria-hidden="true" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* --- Freie Zeiten ---------------------------------------------------------- */

function FreieZeiten({
  datum, jetzt, plaetze, belegungen, oeffnung, schluss, raster, dauer, verwaltbar, onBuchen, onVerwalten,
}: Parameters<typeof PlanTelefon>[0]) {
  const [offen, setOffen] = useState<number | null>(null);
  const zeilen = freeSlotsOfDay({
    day: datum, courtIds: plaetze.map((p) => p.id), openingMinutes: oeffnung, closingMinutes: schluss,
    slotMinutes: raster, durationMinutes: dauer, occupied: belegungen, now: jetzt,
  });
  const platzVon = (id: string) => plaetze.find((p) => p.id === id)!;
  const klasse = (art: CourtStatusKind) =>
    art === "frei" || art === "eigen" || art === "sucht" ? art : "voll";

  if (plaetze.length === 0) return null;
  if (zeilen.length === 0) {
    return <p className="unterzeile">An diesem Tag lässt sich keine Stunde mehr buchen.</p>;
  }

  return (
    <div className="fz">
      <div className="fz-kopf" aria-hidden="true">
        <span className="fz-beginn">BEGINN</span>
        <span className="fz-nummern">
          {plaetze.map((p) => <span key={p.id}>{nummer(p)}</span>)}
        </span>
        <span className="fz-platz">PLATZ</span>
      </div>

      {zeilen.map((z) => {
        const istOffen = offen === z.minute;
        const sucht = z.courts.filter((c) => c.status.art === "sucht" && !c.status.belegung?.bin_dabei);
        const eigen = z.courts.filter((c) => c.status.art === "eigen");
        const frei = z.courts.filter((c) => c.status.art === "frei");
        // Mit Platzrechten laesst sich eine Sperrung auch von hier bearbeiten
        // und aufheben - wie in der Übersicht.
        const gesperrt = z.courts.filter(
          (c) => c.status.art === "gesperrt" && c.status.belegung && verwaltbar(c.status.belegung),
        );
        const label = [
          `${alsUhrzeit(z.minute)} Uhr`,
          z.free === 0 ? "kein Platz frei" : z.free === 1 ? "1 Platz frei" : `${z.free} Plätze frei`,
          ...sucht.map((c) => `${platzVon(c.courtId).name} sucht Mitspieler`),
          ...eigen.map((c) => `du spielst auf ${platzVon(c.courtId).name}`),
        ].join(", ");

        return (
          <div key={z.minute} className={`fz-zeile${istOffen ? " offen" : ""}`}>
            <button
              type="button"
              className="fz-knopf"
              aria-expanded={istOffen}
              aria-label={label}
              onClick={() => setOffen(istOffen ? null : z.minute)}
            >
              <span className="fz-zeit dpl tnum">{alsUhrzeit(z.minute)}</span>
              <span className="fz-kaestchen" aria-hidden="true">
                {z.courts.map((c) => <i key={c.courtId} className={klasse(c.status.art)} />)}
              </span>
              <span className={`fz-zahl ${z.free >= 3 ? "viele" : z.free > 0 ? "wenige" : "keine"}`}>
                {z.free === 0 ? "voll" : `${z.free} frei`}
              </span>
              <svg className="fz-pfeil" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {istOffen && (
              <div className="fz-auf">
                <p>
                  {alsUhrzeit(z.minute)} – {alsUhrzeit(z.minute + dauer)} ·{" "}
                  {frei.length > 0 ? "Welcher Platz?" : "Kein Platz frei"}
                </p>
                {frei.length > 0 && (
                  <div className="fz-plaetze">
                    {frei.map((c) => {
                      const p = platzVon(c.courtId);
                      return (
                        <button
                          key={c.courtId}
                          type="button"
                          onClick={() => onBuchen(p.id, z.minute)}
                          aria-label={`${p.name} um ${alsUhrzeit(z.minute)} Uhr buchen`}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                {sucht.map((c) => {
                  const p = platzVon(c.courtId);
                  const b = c.status.belegung!;
                  return (
                    <button
                      key={c.courtId}
                      type="button"
                      className="fz-sucht"
                      onClick={() => onVerwalten(b)}
                      aria-label={`${p.name}, ${b.type_name} sucht noch ${b.frei}, mitspielen`}
                    >
                      <span>{p.name} · {b.type_name} sucht noch {b.frei}</span>
                      <span>Mitspielen</span>
                    </button>
                  );
                })}
                {gesperrt.map((c) => {
                  const p = platzVon(c.courtId);
                  return (
                    <button
                      key={c.courtId}
                      type="button"
                      className="fz-gesperrt"
                      onClick={() => onVerwalten(c.status.belegung!)}
                      aria-label={`${p.name}, ${c.status.text}, öffnen`}
                    >
                      <span>{p.name} · {c.status.text}</span>
                      <span>Öffnen</span>
                    </button>
                  );
                })}
                {eigen.map((c) => (
                  <p key={c.courtId} className="fz-eigen">
                    <i aria-hidden="true" />
                    Du spielst um {alsUhrzeit(minutesOf(c.status.belegung!.starts_at))} auf {platzVon(c.courtId).name}
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
