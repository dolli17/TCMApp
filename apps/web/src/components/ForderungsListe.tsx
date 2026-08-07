"use client";

import { useState, useTransition } from "react";
import { formatCents } from "@tcm/core";
import { forderungAbhaken, forderungErlassen } from "@/app/admin/kasse/aktionen";

export interface ForderungZeile {
  id: string;
  member_id: string;
  member_name: string;
  payer_id: string;
  payer_name: string;
  kind: "fee" | "drinks" | "deposit" | "work_duty" | "misc" | "guest";
  period_label: string | null;
  amount_cents: number;
  description: string;
  status: "open" | "notified" | "submitted" | "settled" | "returned" | "waived";
  due_date: string | null;
  notified_at: string | null;
  created_at: string;
  hat_mandat: boolean;
}

const ART: Record<ForderungZeile["kind"], string> = {
  fee: "Beitrag",
  drinks: "Getränke",
  deposit: "Pfand",
  work_duty: "Arbeitsdienst",
  guest: "Gastgebühr",
  misc: "Sonstiges",
};

const STAND: Record<ForderungZeile["status"], string> = {
  open: "offen",
  notified: "angekündigt",
  submitted: "eingereicht",
  settled: "bezahlt",
  returned: "zurückgebucht",
  waived: "erlassen",
};

const DATUM = new Intl.DateTimeFormat("de-DE");

/**
 * Alle Forderungen mit den beiden Handgriffen, die es dazu gibt.
 *
 * „Bezahlt" ist der Weg für Überweiser: ohne ihn hätten Mitglieder ohne Mandat
 * eine ewig offene Forderung, und niemand könnte sehen, wer tatsächlich noch
 * schuldet. „Erlassen" löscht nicht, sondern markiert — die Forderung ist
 * entstanden und soll nachvollziehbar bleiben.
 */
export function ForderungsListe({ forderungen }: { forderungen: ForderungZeile[] }) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [erlassen, setErlassen] = useState<string | null>(null);
  const [grund, setGrund] = useState("");
  const [laeuft, starte] = useTransition();

  return (
    <>
      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {forderungen.length === 0 ? (
        <p className="leer">Keine Forderungen in dieser Ansicht.</p>
      ) : (
        <div className="tabellenhuelle"><table className="liste">
          <thead>
            <tr>
              <th>Mitglied</th>
              <th>Zahler</th>
              <th>Art</th>
              <th>Zeitraum</th>
              <th className="zahl">Betrag</th>
              <th>Fällig</th>
              <th>Stand</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {forderungen.map((f) => (
              <tr key={f.id}>
                <td>
                  {f.member_name}
                  <div className="mit">{f.description}</div>
                </td>
                <td>
                  {f.payer_id === f.member_id ? "selbst" : f.payer_name}
                  {!f.hat_mandat && (
                    <div className="mit" style={{ color: "var(--red)" }}>
                      kein Mandat
                    </div>
                  )}
                </td>
                <td>{ART[f.kind]}</td>
                <td className="mit">{f.period_label ?? "—"}</td>
                <td className="zahl tnum">{formatCents(f.amount_cents)}</td>
                <td className="mit">
                  {f.due_date ? DATUM.format(new Date(f.due_date)) : "—"}
                </td>
                <td><span className="marke-klein">{STAND[f.status]}</span></td>
                <td>
                  {(f.status === "open" || f.status === "notified" || f.status === "returned") && (
                    <>
                      <button
                        type="button"
                        className="knopf leise klein"
                        disabled={laeuft}
                        onClick={() =>
                          starte(async () => {
                            const e = await forderungAbhaken(f.id, "per Ueberweisung");
                            setMeldung({ ok: e.ok, text: e.meldung });
                          })
                        }
                      >
                        Bezahlt
                      </button>{" "}
                      <button
                        type="button"
                        className="knopf leise klein"
                        disabled={laeuft}
                        onClick={() => {
                          setErlassen(f.id);
                          setGrund("");
                        }}
                      >
                        Erlassen
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      {erlassen && (
        <section className="karte" style={{ marginTop: 14 }}>
          <h3 className="dpl">Forderung erlassen</h3>
          <p className="unterzeile">
            Die Forderung bleibt als Beleg stehen und wird nicht mehr eingezogen. Der Grund ist
            später die einzige Erklärung, die noch da ist.
          </p>
          <div className="formraster">
            <label className="breit">
              <span>Grund</span>
              <input
                type="text"
                value={grund}
                placeholder="z. B. Austritt zum Jahresanfang"
                onChange={(e) => setGrund(e.target.value)}
              />
            </label>
          </div>
          <div className="fenster-fuss">
            <button
              type="button"
              className="knopf gefahr"
              disabled={laeuft || grund.trim() === ""}
              onClick={() =>
                starte(async () => {
                  const e = await forderungErlassen(erlassen, grund);
                  setMeldung({ ok: e.ok, text: e.meldung });
                  if (e.ok) setErlassen(null);
                })
              }
            >
              Wirklich erlassen
            </button>
            <button type="button" className="knopf leise" onClick={() => setErlassen(null)}>
              Abbrechen
            </button>
          </div>
        </section>
      )}
    </>
  );
}
