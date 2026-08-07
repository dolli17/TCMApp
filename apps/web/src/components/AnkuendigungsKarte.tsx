"use client";

import { useState, useTransition } from "react";
import { formatCents } from "@tcm/core";
import { forderungenAnkuendigen } from "@/app/admin/kasse/aktionen";

const DATUM = new Intl.DateTimeFormat("de-DE");

/**
 * Die Vorabankündigung.
 *
 * Vor jedem SEPA-Einzug muss der Zahler wissen, wie viel wann von seinem Konto
 * abgeht. Praktisch gesehen ist die unangekündigte Abbuchung der häufigste
 * Grund für eine Rücklastschrift — und die kostet den Verein Gebühren.
 *
 * Der früheste Fälligkeitstag ist vorgegeben und lässt sich nicht unterbieten:
 * die Datenbank weist ein zu frühes Datum ohnehin ab, aber ein Feld, das gar
 * kein falsches Datum annimmt, erspart die Fehlermeldung.
 */
export function AnkuendigungsKarte({
  art, zeitraum, offen, summeCents, fristTage, faelligVorschlag,
}: {
  art: "fee" | "drinks" | "deposit" | "work_duty" | "misc" | "guest";
  zeitraum: string | null;
  offen: number;
  summeCents: number;
  fristTage: number;
  faelligVorschlag: string;
}) {
  const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const frueheste = new Date(heute);
  frueheste.setDate(frueheste.getDate() + fristTage);
  const frueheste8601 = frueheste.toISOString().slice(0, 10);

  const [faellig, setFaellig] = useState(
    faelligVorschlag > frueheste8601 ? faelligVorschlag : frueheste8601,
  );
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  return (
    <section className="karte" style={{ marginBottom: 18 }}>
      <h2 className="dpl">Vorabankündigung</h2>
      <p className="unterzeile">
        Jeder Zahler bekommt eine Nachricht mit Gesamtbetrag und Fälligkeit – eine je Zahler,
        nicht eine je Kind. Erst {fristTage} Tage danach darf eingezogen werden.
      </p>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {offen === 0 ? (
        // Bewusst offen formuliert: hier steht sowohl der Fall „schon alles
        // angekündigt" als auch „es gibt noch gar keine Forderungen".
        <p className="mit">Zurzeit steht nichts zur Ankündigung an.</p>
      ) : (
        <>
          <div className="formraster">
            <label>
              <span>Fällig am</span>
              <input
                type="date"
                min={frueheste8601}
                value={faellig}
                onChange={(e) => setFaellig(e.target.value)}
              />
              <span className="beschreibung">
                Frühestens der {DATUM.format(frueheste)} – so lange läuft die Frist.
              </span>
            </label>
          </div>

          <div className="fenster-fuss">
            <button
              type="button"
              className="knopf"
              disabled={laeuft || faellig < frueheste8601}
              onClick={() =>
                starte(async () => {
                  const e = await forderungenAnkuendigen({ faelligAm: faellig, art, zeitraum });
                  setMeldung({ ok: e.ok, text: e.meldung });
                })
              }
            >
              {laeuft
                ? "Wird angekündigt…"
                : `${offen} ${offen === 1 ? "Forderung" : "Forderungen"} über ${formatCents(
                    summeCents,
                  )} ankündigen`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
