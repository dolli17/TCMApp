"use client";

import { useState, useTransition } from "react";
import { CHARGE_KIND_LABEL, formatCents, type ChargeKind } from "@tcm/core";
import { forderungenAnkuendigen } from "@/app/admin/kasse/aktionen";
import { ArtMarke } from "@/components/ArtMarke";
import { Listenzeile } from "@/components/Listenzeile";

const DATUM = new Intl.DateTimeFormat("de-DE");

export interface AnkuendbarZeile {
  art: ChargeKind;
  anzahl: number;
  summe_cents: number;
  zahler: number;
}

/**
 * Was noch angekündigt werden muss - für jede Art, nicht nur für Beiträge.
 *
 * Bisher ließen sich nur Beiträge (Jahresbeiträge) und Getränke (Getränkemonat)
 * ankündigen. Arbeitsdienst, Gastgebühr, Pfand und Sonstiges blieben dadurch
 * für immer offen und kamen nie in einen Lastschriftlauf - der nimmt nur
 * angekündigte Forderungen.
 */
export function AnkuendigungNachArt({
  zeilen, fristTage,
}: {
  zeilen: AnkuendbarZeile[];
  fristTage: number;
}) {
  const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const frueheste = new Date(heute);
  frueheste.setDate(frueheste.getDate() + fristTage);
  const frueheste8601 = frueheste.toISOString().slice(0, 10);

  const [faellig, setFaellig] = useState(frueheste8601);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();
  const offen = zeilen.filter((z) => z.anzahl > 0);

  if (offen.length === 0) return null;

  return (
    <section className="karte" style={{ marginBottom: 18 }} aria-labelledby="h-ankuendigen">
      <h2 className="dpl" id="h-ankuendigen">Zur Ankündigung bereit</h2>
      <p className="unterzeile">
        Eingezogen wird nur, was angekündigt ist. Jeder Zahler bekommt eine Nachricht mit
        Betrag und Fälligkeit; erst {fristTage} Tage danach darf der Lastschriftlauf sie
        mitnehmen.
      </p>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      <div className="formraster">
        <label>
          <span>Fällig am</span>
          <input type="date" min={frueheste8601} value={faellig} onChange={(e) => setFaellig(e.target.value)} />
          <span className="beschreibung">
            Frühestens der {DATUM.format(frueheste)} – so lange läuft die Frist.
          </span>
        </label>
      </div>

      <ul className="liste-gruppe" aria-label="Zur Ankündigung bereit">
        {offen.map((z) => (
          <li key={z.art}>
            <Listenzeile
              titel={<ArtMarke art={z.art} />}
              kontext={`${z.anzahl} ${z.anzahl === 1 ? "Forderung" : "Forderungen"} · ${z.zahler} Zahler`}
              neben={
                <span className="neben">
                  <span className="betrag tnum">{formatCents(z.summe_cents)}</span>
                  <button
                    type="button"
                    className="knopf klein"
                    disabled={laeuft || faellig < frueheste8601}
                    onClick={() =>
                      starte(async () => {
                        const e = await forderungenAnkuendigen({ faelligAm: faellig, art: z.art, zeitraum: null });
                        setMeldung({ ok: e.ok, text: `${CHARGE_KIND_LABEL[z.art]}: ${e.meldung}` });
                      })
                    }
                  >
                    Ankündigen
                  </button>
                </span>
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
