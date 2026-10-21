"use client";

import { useEffect, useState, useTransition } from "react";
import {
  basketAfterBatch, basketReminder, basketSummary, canVoidSelf, changeBasket, drinkBatchReport,
  formatCents, MAX_DRINK_QUANTITY, parseBasket, type DrinkBasket, type DrinkBatchResult,
} from "@tcm/core";
import { getraenkBuchen, getraenkStornieren } from "@/app/verein/getraenke/aktionen";

interface Artikel {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
}

interface Buchung {
  id: string;
  item_name: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number | null;
  source: string;
  created_at: string;
  voided_at: string | null;
}

const ZEITPUNKT = new Intl.DateTimeFormat("de-DE", {
  weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/Berlin",
});
const QUELLE: Record<string, string> = { kiosk: "Theke", bar_duty: "Thekendienst", app: "App" };

/**
 * Die Getraenkekarte (Entwurf AppGetraenke, docs/design/clubhaus)
 *
 * Kacheln mit Zaehler: man sammelt, was man genommen hat, und traegt es
 * ueber die Leiste auf einmal ein. Gebucht wird weiter je Artikel ueber
 * getraenkBuchen - es gibt keinen Sammelauftrag. Schlaegt einer fehl, sagt
 * die Meldung welcher, und er bleibt zum erneuten Versuch gewaehlt.
 *
 * Mit "+" ist noch nichts gebucht (U17). Damit niemand mit vollem Korb geht
 * und glaubt, es sei eingetragen: Die Leiste sagt "noch nicht eingetragen",
 * der Korb liegt im sessionStorage dieses Tabs (je Konto) und ist nach einem
 * Seitenwechsel oder Neuladen wieder da, und wer die Seite mit vollem Korb
 * verlaesst, wird gefragt. Waehrend des Sendens ist die Karte gesperrt, sonst
 * ueberschriebe das Ergebnis die neuen Eingaben (B18).
 */
export function Getraenkekarte({
  artikel,
  buchungen,
  stornoFensterMinuten,
  kontoId,
}: {
  artikel: Artikel[];
  buchungen: Buchung[];
  stornoFensterMinuten: number;
  /** Fuer den Speicherschluessel: wer sich im selben Tab neu anmeldet, sieht nicht den Korb des Vorgaengers. */
  kontoId: string;
}) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [korb, setKorb] = useState<DrinkBasket>({});
  const [laeuft, starte] = useTransition();
  const speicher = `tcm-getraenkekorb:${kontoId}`;
  /** Ob der gemerkte Korb schon gelesen ist - vorher wird nichts geschrieben. */
  const [geladen, setGeladen] = useState(false);

  const { lines: gewaehlt, count: stueck, totalCents: betrag } = basketSummary(artikel, korb);

  // Merken - erst nachdem der gemerkte Korb gelesen ist, sonst loeschte der
  // erste Lauf ihn mit dem leeren Anfangszustand. Als State, nicht als Ref:
  // im Strict Mode laufen die Effekte doppelt, und eine Ref waere beim
  // zweiten Lauf schon gesetzt.
  useEffect(() => {
    if (!geladen) return;
    try {
      if (Object.keys(korb).length === 0) sessionStorage.removeItem(speicher);
      else sessionStorage.setItem(speicher, JSON.stringify(korb));
    } catch {
      // Ohne Speicher bleibt der Korb eben nur, solange die Seite offen ist.
    }
  }, [korb, speicher, geladen]);

  useEffect(() => {
    try {
      setKorb(parseBasket(sessionStorage.getItem(speicher)));
    } catch {
      // siehe oben
    }
    setGeladen(true);
  }, [speicher]);

  // Rueckfrage beim Verlassen mit vollem Korb: Schliessen und Neuladen fragt
  // der Browser selbst, interne Links fangen wir vor dem Router ab.
  useEffect(() => {
    if (stueck === 0) return;
    const frage = `${basketReminder(stueck, betrag)}\n\nGebucht wird erst mit „Eintragen“. Seite trotzdem verlassen? Die Auswahl bleibt in diesem Tab gemerkt.`;

    function vorDemEntladen(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    function beimKlick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const ziel = new URL(link.href, window.location.href);
      if (ziel.origin === window.location.origin && ziel.pathname === window.location.pathname) return;
      if (!window.confirm(frage)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", vorDemEntladen);
    document.addEventListener("click", beimKlick, true);
    return () => {
      window.removeEventListener("beforeunload", vorDemEntladen);
      document.removeEventListener("click", beimKlick, true);
    };
  }, [stueck, betrag]);

  function aendern(id: string, um: number) {
    // Waehrend des Sendens gesperrt: das Ergebnis setzt den Korb neu (B18).
    if (laeuft) return;
    setMeldung(null);
    setKorb((k) => changeBasket(k, id, um));
  }

  function eintragen() {
    starte(async () => {
      const ergebnisse: (DrinkBatchResult & { id: string })[] = [];
      // Nacheinander, in der Reihenfolge der Karte - so liest sich auch die Meldung.
      for (const a of gewaehlt) {
        const menge = korb[a.id] ?? 0;
        const r = await getraenkBuchen(a.id, menge);
        ergebnisse.push({ id: a.id, name: a.name, quantity: menge, ok: r.ok, message: r.meldung });
      }
      setMeldung(drinkBatchReport(ergebnisse));
      // Was geklappt hat, verlaesst den Korb; was nicht, bleibt fuer einen neuen Versuch.
      setKorb(basketAfterBatch(ergebnisse));
    });
  }

  function zuruecknehmen(id: string) {
    starte(async () => {
      const r = await getraenkStornieren(id);
      setMeldung({ ok: r.ok, text: r.meldung });
    });
  }

  return (
    <>
      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">{meldung.text}</div>
      )}

      <section aria-labelledby="h-karte">
        <div className="sectionlabel">
          <h2 id="h-karte">Was nimmst du?</h2>
          <span className="mit">Karte aus der Verwaltung</span>
        </div>
        <p className="mit" style={{ margin: "-4px 0 12px" }}>
          Mit + sammelst du. Gebucht ist erst, was du unten einträgst.
        </p>
        <ul className="getraenke-kacheln">
          {artikel.map((a) => {
            const menge = korb[a.id] ?? 0;
            return (
              <li key={a.id} className={menge > 0 ? "gewaehlt" : undefined}>
                <div>
                  <b>{a.name}</b>
                  <small>
                    {formatCents(a.price_cents)}
                    {a.description ? ` · ${a.description}` : ""}
                  </small>
                </div>
                <div className="zaehler">
                  {menge > 0 && (
                    <>
                      <button
                        type="button"
                        aria-label={`${a.name}: eins weniger`}
                        disabled={laeuft}
                        onClick={() => aendern(a.id, -1)}
                      >
                        <Zeichen d="M5 12h14" />
                      </button>
                      <output className="dpl" aria-label={`${menge} gewählt, noch nicht eingetragen`}>{menge}</output>
                    </>
                  )}
                  <button
                    type="button"
                    className="gelb"
                    aria-label={`${a.name}: eins mehr`}
                    disabled={laeuft || menge >= MAX_DRINK_QUANTITY}
                    onClick={() => aendern(a.id, 1)}
                  >
                    <Zeichen d="M12 5v14M5 12h14" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="h-zuletzt">
        <div className="sectionlabel">
          <h2 id="h-zuletzt">Zuletzt</h2>
        </div>
        <p className="mit" style={{ margin: "-4px 0 12px" }}>
          Eine Entnahme lässt sich {stornoFensterMinuten} Minuten lang selbst zurücknehmen. Danach
          hilft der Vorstand weiter.
        </p>
        {buchungen.length === 0 ? (
          <p className="leer-klein">Noch nichts entnommen.</p>
        ) : (
          <ul className="gruppe zuletzt">
            {buchungen.map((b) => {
              const storniert = Boolean(b.voided_at);
              const stornierbar =
                !storniert &&
                canVoidSelf(
                  {
                    id: b.id,
                    memberId: "",
                    drinkItemId: "",
                    quantity: b.quantity,
                    unitPriceCents: b.unit_price_cents,
                    createdAt: b.created_at,
                    voidedAt: b.voided_at,
                  },
                  stornoFensterMinuten,
                );

              return (
                <li key={b.id} className={storniert ? "zurueck" : undefined}>
                  <span className="was">
                    <b>
                      {b.quantity > 1 ? `${b.quantity}× ` : ""}
                      {b.item_name}
                    </b>
                    <small>
                      {ZEITPUNKT.format(new Date(b.created_at))} · {QUELLE[b.source] ?? "App"}
                      {storniert ? " · zurückgenommen" : ""}
                    </small>
                  </span>
                  {stornierbar && (
                    <button
                      type="button"
                      className="leise-rot"
                      onClick={() => zuruecknehmen(b.id)}
                      disabled={laeuft}
                    >
                      Zurücknehmen
                    </button>
                  )}
                  <span className="betrag dpl tnum">{formatCents(b.total_cents ?? 0)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Die Leiste zum Eintragen - am Telefon ueber der schwebenden Leiste */}
      {stueck > 0 && (
        <div className="eintragen-leiste" role="region" aria-label="Gewählte Getränke">
          <div aria-live="polite">
            <b>
              {stueck} {stueck === 1 ? "Getränk" : "Getränke"} · {formatCents(betrag)}
            </b>
            <small className="offen">Noch nicht eingetragen</small>
          </div>
          <button type="button" className="knopf gold" onClick={eintragen} disabled={laeuft}>
            {laeuft ? "Wird eingetragen…" : "Eintragen"}
          </button>
        </div>
      )}
    </>
  );
}

function Zeichen({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
