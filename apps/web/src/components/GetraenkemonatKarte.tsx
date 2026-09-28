"use client";

import { useState, useTransition } from "react";
import { formatCents } from "@tcm/core";
import {
  forderungenAnkuendigen, monatAbrechnen, monatSchliessen,
} from "@/app/admin/kasse/aktionen";

export interface MonatZeile {
  id: string;
  year: number;
  month: number;
  status: "open" | "closed" | "charged";
  buchungen: number;
  mitglieder: number;
  summe_cents: number;
  forderungen: number;
  offen: number;
  offen_cents: number;
  closed_at: string | null;
  charged_at: string | null;
}

const MONAT = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });

const STAND: Record<MonatZeile["status"], string> = {
  open: "offen",
  closed: "geschlossen",
  charged: "abgerechnet",
};
const STAND_TON: Record<MonatZeile["status"], string> = { open: "", closed: "gelb", charged: "gruen" };

/**
 * Der Getränkemonat in zwei Schritten.
 *
 * Schließen und Abrechnen sind bewusst getrennt: das Schließen friert die
 * Summe ein (ab da nimmt die Theke für diesen Monat nichts mehr an), erst das
 * Abrechnen macht Forderungen daraus. Dazwischen kann der Vorstand die Zahlen
 * ansehen — was nach dem Abrechnen niemandem mehr hilft.
 */
export function GetraenkemonatKarte({
  monate, fristTage,
}: {
  monate: MonatZeile[];
  fristTage: number;
}) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  /** Der früheste Tag, an dem eingezogen werden darf. */
  function fruehesteFaelligkeit(): string {
    const d = new Date();
    d.setDate(d.getDate() + fristTage + 1);
    return d.toISOString().slice(0, 10);
  }

  // Numerisch vergleichen statt über Date: `new Date("2026-08-01")` ist
  // UTC-Mitternacht, `new Date(2026, 7, 1)` Ortszeit-Mitternacht — der laufende
  // Monat rutschte damit zwei Stunden lang durch und bekam einen Knopf, den die
  // Datenbank ohnehin abweist.
  const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const jetzt = Number(heute.slice(0, 4)) * 12 + Number(heute.slice(5, 7));

  return (
    <section className="karte" id="getraenkemonate">
      <h2 className="dpl">Getränkemonate</h2>
      <p className="unterzeile">
        Erst schließen, dann abrechnen. Ein geschlossener Monat lässt sich an der Theke nicht
        mehr verändern – nur so steht der Betrag fest, bevor er angekündigt wird.
      </p>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {monate.length === 0 ? (
        <p className="leer-klein">Es gibt noch keine Abrechnungszeiträume.</p>
      ) : (
        <div className="tabellenhuelle tabellenkarte"><table className="liste">
          <thead>
            <tr>
              <th scope="col">Monat</th>
              <th scope="col" className="zahl">Entnahmen</th>
              <th scope="col" className="zahl">Mitglieder</th>
              <th scope="col" className="zahl">Summe</th>
              <th scope="col" className="zahl">Forderungen</th>
              <th scope="col">Stand</th>
              <th scope="col"><span className="sr-only">Aktion</span></th>
            </tr>
          </thead>
          <tbody>
            {monate.map((m) => {
              const laufend = m.year * 12 + m.month >= jetzt;
              return (
                <tr key={m.id}>
                  <td className="fett">{MONAT.format(new Date(m.year, m.month - 1, 1))}</td>
                  <td data-label="Entnahmen" className="zahl tnum">{m.buchungen}</td>
                  <td data-label="Mitglieder" className="zahl tnum">{m.mitglieder}</td>
                  <td data-label="Summe" className="zahl betrag dpl tnum">{formatCents(m.summe_cents)}</td>
                  <td data-label="Forderungen" className="zahl tnum">{m.forderungen || "—"}</td>
                  <td data-label="Stand">
                    <span className={`statusmarke ${STAND_TON[m.status]}`}>{STAND[m.status]}</span>
                  </td>
                  <td className="aktion">
                    {m.status === "open" &&
                      (laufend ? (
                        <span className="mit">läuft noch</span>
                      ) : (
                        <button
                          type="button"
                          className="knopf leise klein"
                          disabled={laeuft}
                          onClick={() =>
                            starte(async () => {
                              const e = await monatSchliessen(m.year, m.month);
                              setMeldung({ ok: e.ok, text: e.meldung });
                            })
                          }
                        >
                          Monat schließen
                        </button>
                      ))}
                    {m.status === "closed" && (
                      <button
                        type="button"
                        className="knopf klein"
                        disabled={laeuft}
                        onClick={() =>
                          starte(async () => {
                            const e = await monatAbrechnen(m.year, m.month, null);
                            setMeldung({ ok: e.ok, text: e.meldung });
                          })
                        }
                      >
                        Forderungen erzeugen
                      </button>
                    )}
                    {/* Der dritte Schritt: erst schließen, dann abrechnen,
                        dann ankündigen. Ohne Ankündigung darf nicht eingezogen
                        werden. */}
                    {m.status === "charged" &&
                      (m.offen > 0 ? (
                        <button
                          type="button"
                          className="knopf klein"
                          disabled={laeuft}
                          onClick={() =>
                            starte(async () => {
                              const e = await forderungenAnkuendigen({
                                faelligAm: fruehesteFaelligkeit(),
                                art: "drinks",
                                zeitraum: `${m.year}-${String(m.month).padStart(2, "0")}`,
                              });
                              setMeldung({ ok: e.ok, text: e.meldung });
                            })
                          }
                        >
                          {m.offen} ankündigen
                        </button>
                      ) : (
                        <span className="mit">angekündigt</span>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </section>
  );
}
