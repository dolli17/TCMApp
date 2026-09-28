"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import logo from "@tcm/ui/logo-weiss.png";
import { drinkBatchReport, formatCents, MAX_DRINK_QUANTITY, type DrinkBatchResult } from "@tcm/core";
import { kioskBuchen } from "@/app/getraenke/aktionen";

interface Mitglied {
  id: string;
  first_name: string;
  last_name: string;
}
interface Artikel {
  id: string;
  name: string;
  price_cents: number;
}

/** Wer zuletzt an diesem Geraet genommen hat - nur hier, nur die Kennungen. */
const ZULETZT = "tcm-kiosk-zuletzt";
const ZULETZT_ANZAHL = 4;
/** So lange steht die Bestaetigung, bevor es von vorn losgeht. */
const BESTAETIGUNG_MS = 2500;
/** Ab so langem Druecken nimmt eine Kachel eins weg statt dazu. */
const LANG_MS = 500;

function leseZuletzt(): string[] {
  try {
    const roh = localStorage.getItem(ZULETZT);
    return roh ? (JSON.parse(roh) as string[]).slice(0, ZULETZT_ANZAHL) : [];
  } catch {
    return [];
  }
}

function merkeZuletzt(id: string) {
  try {
    const neu = [id, ...leseZuletzt().filter((x) => x !== id)].slice(0, ZULETZT_ANZAHL);
    localStorage.setItem(ZULETZT, JSON.stringify(neu));
  } catch {
    // Ohne Speicher gibt es eben keine Zuletzt-Liste.
  }
}

const initialen = (m: Mitglied) => (m.first_name.charAt(0) + m.last_name.charAt(0)).toUpperCase();

/**
 * Der Kiosk an der Theke (Entwurf Kiosk, docs/design/clubhaus)
 *
 * Immer dunkel, drei Spalten: 1 Wer nimmt etwas? · 2 Was? · 3 Eintragen.
 * Getippt wird mit dem Finger, deshalb ist jedes Ziel mindestens 48 hoch.
 * Tippen auf eine Kachel = eins mehr; langes Druecken oder der kleine Knopf
 * = eins weniger.
 *
 * Gebucht wird wie bisher je Artikel ueber kioskBuchen - es gibt keinen
 * Sammelauftrag. Die Meldung setzt drinkBatchReport zusammen (wie auf der
 * Getraenkeseite); was nicht geklappt hat, bleibt gewaehlt. Nach einer
 * gelungenen Buchung steht kurz die Bestaetigung, dann geht es von vorn los -
 * der naechste soll nicht versehentlich auf den Vorgaenger buchen.
 */
export function KioskOberflaeche({
  mitglieder,
  artikel,
}: {
  mitglieder: Mitglied[];
  artikel: Artikel[];
}) {
  const [suche, setSuche] = useState("");
  const [gewaehlt, setGewaehlt] = useState<Mitglied | null>(null);
  const [korb, setKorb] = useState<Record<string, number>>({});
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [zuletzt, setZuletzt] = useState<string[]>([]);
  const [laeuft, starte] = useTransition();
  const suchfeld = useRef<HTMLInputElement>(null);
  const druck = useRef<{ id: string; timer: ReturnType<typeof setTimeout>; lang: boolean } | null>(null);

  useEffect(() => setZuletzt(leseZuletzt()), []);

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return [];
    return mitglieder
      .filter(
        (m) =>
          m.last_name.toLowerCase().includes(q) ||
          m.first_name.toLowerCase().includes(q) ||
          `${m.first_name} ${m.last_name}`.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [mitglieder, suche]);

  const zuletztMitglieder = zuletzt
    .map((id) => mitglieder.find((m) => m.id === id))
    .filter((m): m is Mitglied => Boolean(m));

  const positionen = artikel.filter((a) => (korb[a.id] ?? 0) > 0);
  const summe = positionen.reduce((s, a) => s + (korb[a.id] ?? 0) * a.price_cents, 0);

  function vonVorn() {
    setGewaehlt(null);
    setKorb({});
    setSuche("");
    setMeldung(null);
    suchfeld.current?.focus();
  }

  function waehle(m: Mitglied) {
    setGewaehlt(m);
    setMeldung(null);
  }

  function aendern(id: string, um: number) {
    setMeldung(null);
    setKorb((k) => {
      const neu = Math.max(0, Math.min(MAX_DRINK_QUANTITY, (k[id] ?? 0) + um));
      const rest = { ...k };
      if (neu === 0) delete rest[id];
      else rest[id] = neu;
      return rest;
    });
  }

  // Langes Druecken: nach LANG_MS eins weg, und der folgende Klick zaehlt nicht.
  function druckAn(id: string) {
    druckAus();
    const d = { id, lang: false, timer: setTimeout(() => {
      d.lang = true;
      aendern(id, -1);
    }, LANG_MS) };
    druck.current = d;
  }
  function druckAus() {
    if (druck.current) clearTimeout(druck.current.timer);
  }
  function tippen(id: string) {
    const d = druck.current;
    druck.current = null;
    if (d?.id === id && d.lang) return;
    aendern(id, 1);
  }

  function eintragen() {
    if (!gewaehlt || positionen.length === 0) return;
    const fuer = gewaehlt;
    starte(async () => {
      const ergebnisse: (DrinkBatchResult & { id: string })[] = [];
      for (const a of positionen) {
        const menge = korb[a.id] ?? 0;
        const r = await kioskBuchen(fuer.id, a.id, menge);
        ergebnisse.push({ id: a.id, name: a.name, quantity: menge, ok: r.ok, message: r.meldung });
      }
      const bericht = drinkBatchReport(ergebnisse);
      merkeZuletzt(fuer.id);
      setZuletzt(leseZuletzt());
      if (bericht.ok) {
        setMeldung({ ok: true, text: `${bericht.text} Für ${fuer.first_name} ${fuer.last_name}.` });
        setTimeout(vonVorn, BESTAETIGUNG_MS);
      } else {
        // Was nicht geklappt hat, bleibt fuer einen neuen Versuch gewaehlt.
        setMeldung(bericht);
        setKorb(Object.fromEntries(ergebnisse.filter((e) => !e.ok).map((e) => [e.id, e.quantity])));
      }
    });
  }

  return (
    <div className="kiosk immer-dunkel">
      <header className="kiosk-kopf">
        <div>
          <Image src={logo} alt="TC Muckensturm" height={36} priority />
          <span className="trenner" aria-hidden="true" />
          <h1>Getränke an der Theke</h1>
        </div>
        <button type="button" className="kiosk-knopf" onClick={vonVorn}>
          Von vorn
        </button>
      </header>

      <div className="kiosk-spalten">
        <section className="kiosk-wer" aria-labelledby="k1">
          <h2 id="k1"><span className="schritt">1</span>Wer nimmt etwas?</h2>
          <label className="kiosk-suche">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <input
              ref={suchfeld}
              type="search"
              autoFocus
              aria-label="Name eingeben"
              placeholder="Name eingeben…"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
            />
          </label>

          <div className="kiosk-treffer">
            {suche.trim() === "" ? (
              <p className="kiosk-hinweis">Ein paar Buchstaben des Namens genügen.</p>
            ) : treffer.length === 0 ? (
              <p className="kiosk-hinweis">Niemand gefunden.</p>
            ) : (
              treffer.map((m) => {
                const an = gewaehlt?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={an ? "an" : undefined}
                    aria-pressed={an}
                    onClick={() => waehle(m)}
                  >
                    <span className="avatar" aria-hidden="true">{initialen(m)}</span>
                    <span className="name">{m.first_name} {m.last_name}</span>
                    {an && (
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {zuletztMitglieder.length > 0 && (
            <div className="kiosk-zuletzt">
              <div className="kicker">Zuletzt an der Theke</div>
              <div className="chips">
                {zuletztMitglieder.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={gewaehlt?.id === m.id}
                    onClick={() => waehle(m)}
                  >
                    {m.first_name} {m.last_name.charAt(0)}.
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="kiosk-was" aria-labelledby="k2">
          <h2 id="k2"><span className="schritt">2</span>Was?</h2>
          <ul className="kiosk-kacheln">
            {artikel.map((a) => {
              const menge = korb[a.id] ?? 0;
              return (
                <li key={a.id} className={menge > 0 ? "an" : undefined}>
                  <button
                    type="button"
                    className="kachel-knopf"
                    aria-label={`${a.name} hinzufügen${menge > 0 ? `, ${menge} gewählt` : ""}`}
                    disabled={menge >= MAX_DRINK_QUANTITY}
                    onPointerDown={() => druckAn(a.id)}
                    onPointerUp={druckAus}
                    onPointerLeave={druckAus}
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={() => tippen(a.id)}
                  >
                    <span className="name">{a.name}</span>
                    <span className="preis">{formatCents(a.price_cents)}</span>
                  </button>
                  {menge > 0 && (
                    <>
                      <output className="zahl dpl" aria-hidden="true">{menge}</output>
                      <button
                        type="button"
                        className="weniger"
                        aria-label={`${a.name}: eins weniger`}
                        onClick={() => aendern(a.id, -1)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                          <path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                        </svg>
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="kiosk-eintragen immer-hell" aria-labelledby="k3">
          <h2 id="k3"><span className="schritt">3</span>Eintragen</h2>

          {meldung?.ok ? (
            <div className="kiosk-fertig hinweis erfolg" role="status">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {meldung.text}
            </div>
          ) : (
            <>
              <div className="fuer">für</div>
              <div className="wer">{gewaehlt ? `${gewaehlt.first_name} ${gewaehlt.last_name}` : "Noch niemand gewählt"}</div>

              {positionen.length === 0 ? (
                <p className="leer-klein">Getränke antippen – jedes Tippen zählt eins dazu.</p>
              ) : (
                <ul className="posten">
                  {positionen.map((a) => (
                    <li key={a.id}>
                      <span>{a.name} × {korb[a.id]}</span>
                      <b>{formatCents((korb[a.id] ?? 0) * a.price_cents)}</b>
                    </li>
                  ))}
                </ul>
              )}
              <div className="zusammen">
                <span>Zusammen</span>
                <b className="dpl tnum">{formatCents(summe)}</b>
              </div>

              {meldung && !meldung.ok && (
                <div className="hinweis fehler" role="status">{meldung.text}</div>
              )}

              <button
                type="button"
                className="knopf gold kiosk-los"
                disabled={laeuft || !gewaehlt || positionen.length === 0}
                onClick={eintragen}
              >
                {laeuft
                  ? "Wird eingetragen…"
                  : gewaehlt
                    ? `Für ${gewaehlt.first_name} eintragen`
                    : "Erst den Namen wählen"}
              </button>
              <div className="fussnote">Wird mit der Monatsabrechnung eingezogen</div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
