"use client";

import { useState, useTransition } from "react";
import {
  canVoidSelf, drinkBatchReport, formatCents, MAX_DRINK_QUANTITY, type DrinkBatchResult,
} from "@tcm/core";
import { getraenkBuchen, getraenkStornieren } from "@/app/getraenke/aktionen";

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
 */
export function Getraenkekarte({
  artikel,
  buchungen,
  stornoFensterMinuten,
}: {
  artikel: Artikel[];
  buchungen: Buchung[];
  stornoFensterMinuten: number;
}) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  /** Gesammelt, noch nicht eingetragen: Artikel-Id -> Menge */
  const [korb, setKorb] = useState<Record<string, number>>({});
  const [laeuft, starte] = useTransition();

  const gewaehlt = artikel.filter((a) => (korb[a.id] ?? 0) > 0);
  const stueck = gewaehlt.reduce((s, a) => s + (korb[a.id] ?? 0), 0);
  const betrag = gewaehlt.reduce((s, a) => s + (korb[a.id] ?? 0) * a.price_cents, 0);

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
      setKorb(Object.fromEntries(ergebnisse.filter((e) => !e.ok).map((e) => [e.id, e.quantity])));
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
                      <button type="button" aria-label={`${a.name}: eins weniger`} onClick={() => aendern(a.id, -1)}>
                        <Zeichen d="M5 12h14" />
                      </button>
                      <output className="dpl" aria-label={`${menge} gewählt`}>{menge}</output>
                    </>
                  )}
                  <button
                    type="button"
                    className="gelb"
                    aria-label={`${a.name}: eins mehr`}
                    disabled={menge >= MAX_DRINK_QUANTITY}
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
            <b>{stueck} {stueck === 1 ? "Getränk" : "Getränke"}</b>
            <small>{formatCents(betrag)} · aufs Monatskonto</small>
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
