"use client";

import { useState, useTransition } from "react";
import { formatCents } from "@tcm/core";
import { monatAbrechnen, monatSchliessen } from "@/app/admin/kasse/aktionen";

export interface MonatZeile {
  id: string;
  year: number;
  month: number;
  status: "open" | "closed" | "charged";
  buchungen: number;
  mitglieder: number;
  summe_cents: number;
  forderungen: number;
  closed_at: string | null;
  charged_at: string | null;
}

const MONAT = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });

const STAND: Record<MonatZeile["status"], string> = {
  open: "offen",
  closed: "geschlossen",
  charged: "abgerechnet",
};

/**
 * Der Getränkemonat in zwei Schritten.
 *
 * Schließen und Abrechnen sind bewusst getrennt: das Schließen friert die
 * Summe ein (ab da nimmt die Theke für diesen Monat nichts mehr an), erst das
 * Abrechnen macht Forderungen daraus. Dazwischen kann der Vorstand die Zahlen
 * ansehen — was nach dem Abrechnen niemandem mehr hilft.
 */
export function GetraenkemonatKarte({ monate }: { monate: MonatZeile[] }) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  // Numerisch vergleichen statt über Date: `new Date("2026-08-01")` ist
  // UTC-Mitternacht, `new Date(2026, 7, 1)` Ortszeit-Mitternacht — der laufende
  // Monat rutschte damit zwei Stunden lang durch und bekam einen Knopf, den die
  // Datenbank ohnehin abweist.
  const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const jetzt = Number(heute.slice(0, 4)) * 12 + Number(heute.slice(5, 7));

  return (
    <section className="karte" style={{ marginBottom: 18 }}>
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
        <p className="leer">Es gibt noch keine Abrechnungszeiträume.</p>
      ) : (
        <div className="tabellenhuelle"><table className="liste">
          <thead>
            <tr>
              <th>Monat</th>
              <th className="zahl">Entnahmen</th>
              <th className="zahl">Mitglieder</th>
              <th className="zahl">Summe</th>
              <th className="zahl">Forderungen</th>
              <th>Stand</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {monate.map((m) => {
              const laufend = m.year * 12 + m.month >= jetzt;
              return (
                <tr key={m.id}>
                  <td>{MONAT.format(new Date(m.year, m.month - 1, 1))}</td>
                  <td className="zahl tnum">{m.buchungen}</td>
                  <td className="zahl tnum">{m.mitglieder}</td>
                  <td className="zahl tnum">{formatCents(m.summe_cents)}</td>
                  <td className="zahl tnum">{m.forderungen || "—"}</td>
                  <td><span className="marke-klein">{STAND[m.status]}</span></td>
                  <td>
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
                    {m.status === "charged" && <span className="mit">nichts mehr zu tun</span>}
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
