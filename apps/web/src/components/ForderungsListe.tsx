"use client";

import { useState, useTransition } from "react";
import { CHARGE_KIND_LABEL, formatCents } from "@tcm/core";
import { forderungAbhaken, forderungErlassen } from "@/app/admin/kasse/aktionen";
import { ArtMarke } from "@/components/ArtMarke";
import { FensterKnopf } from "@/components/FensterKnopf";
import { Listenzeile } from "@/components/Listenzeile";
import { Leerzustand } from "@/components/Leerzustand";

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

const STAND: Record<ForderungZeile["status"], string> = {
  open: "offen",
  notified: "angekündigt",
  submitted: "im Einzug",
  settled: "bezahlt",
  returned: "zurückgebucht",
  waived: "erlassen",
};

const DATUM = new Intl.DateTimeFormat("de-DE");

const STAND_TON: Record<string, string> = { open: "gelb", notified: "gelb", settled: "gruen", returned: "rot" };

/** Nur offene, angekuendigte und zurueckgebuchte lassen sich noch abhaken oder erlassen. */
const offen = (f: ForderungZeile) => f.status === "open" || f.status === "notified" || f.status === "returned";

/**
 * Alle Forderungen mit den beiden Handgriffen, die es dazu gibt.
 *
 * „Bezahlt" ist der Weg für Überweiser: ohne ihn hätten Mitglieder ohne Mandat
 * eine ewig offene Forderung, und niemand könnte sehen, wer tatsächlich noch
 * schuldet. „Erlassen" löscht nicht, sondern markiert — die Forderung ist
 * entstanden und soll nachvollziehbar bleiben.
 *
 * Als Listenzeilen (docs/design/clubhaus/verwaltung, Regel 3); beide
 * Handgriffe stehen im Blatt der Forderung.
 */
export function ForderungsListe({
  forderungen,
  gefiltert = false,
}: {
  forderungen: ForderungZeile[];
  /** Ein Art- oder Standfilter ist gesetzt: dann bietet die leere Liste „Alle“ an. */
  gefiltert?: boolean;
}) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [gewaehlt, setGewaehlt] = useState<ForderungZeile | null>(null);
  const [erlassen, setErlassen] = useState(false);
  const [grund, setGrund] = useState("");
  const [laeuft, starte] = useTransition();

  return (
    <>
      {meldung && !gewaehlt && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {forderungen.length === 0 ? (
        <Leerzustand
          text="Keine Forderungen in dieser Ansicht."
          aktion={gefiltert ? { href: "/admin/kasse?abschnitt=forderungen", label: "Alle Forderungen zeigen" } : undefined}
        />
      ) : (
        <ul className="liste-gruppe" aria-label="Forderungen">
          {forderungen.map((f) => (
            <li key={f.id}>
              <Listenzeile
                titel={f.member_name}
                kontext={
                  <>
                    <ArtMarke art={f.kind} />{" "}
                    {[
                      f.description,
                      // Nur noch bei alten Forderungen aus der Zeit, als Eltern für Kinder zahlten.
                      f.payer_id === f.member_id ? null : `bezahlt von ${f.payer_name}`,
                      f.due_date ? `fällig ${DATUM.format(new Date(f.due_date))}` : null,
                    ].filter(Boolean).join(" · ")}
                  </>
                }
                neben={
                  <span className="neben">
                    <span className="betrag tnum">{formatCents(f.amount_cents)}</span>
                    {!f.hat_mandat && offen(f) ? (
                      <span className="statusmarke rot">kein Mandat</span>
                    ) : (
                      <span className={`statusmarke ${STAND_TON[f.status] ?? ""}`}>{STAND[f.status]}</span>
                    )}
                  </span>
                }
                onClick={offen(f) ? () => { setGewaehlt(f); setErlassen(false); setGrund(""); setMeldung(null); } : undefined}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Die Handgriffe stehen im Blatt, nicht in der Zeile (Regel 4) */}
      {gewaehlt && (
        <FensterKnopf titel={gewaehlt.member_name} unterzeile={gewaehlt.description} offen onSchliessen={() => setGewaehlt(null)}>
          <dl className="angaben gruppe">
            <div><dt>Betrag</dt><dd className="tnum">{formatCents(gewaehlt.amount_cents)}</dd></div>
            <div><dt>Art</dt><dd>{CHARGE_KIND_LABEL[gewaehlt.kind]}</dd></div>
            <div><dt>Zeitraum</dt><dd>{gewaehlt.period_label ?? "—"}</dd></div>
            {gewaehlt.payer_id !== gewaehlt.member_id && (
              <div><dt>Bezahlt von</dt><dd>{gewaehlt.payer_name}</dd></div>
            )}
            <div><dt>Mandat</dt><dd>{gewaehlt.hat_mandat ? "liegt vor" : "fehlt"}</dd></div>
            <div><dt>Stand</dt><dd>{STAND[gewaehlt.status]}</dd></div>
          </dl>

          {/* Eine Ablehnung gehört ins Blatt, sonst steht sie verdeckt dahinter */}
          {meldung && !meldung.ok && (
            <div className="hinweis fehler" role="alert">{meldung.text}</div>
          )}
          {gewaehlt.status === "notified" && (
            <p className="unterzeile">
              Angekündigt: Steckt die Forderung in einem Einzug ohne Datei, wird sie dort herausgenommen.
            </p>
          )}

          {!erlassen ? (
            <div className="liste-gruppe">
              <Listenzeile
                titel="Als bezahlt vermerken"
                kontext="Für Überweiser: die Forderung ist beglichen."
                pfeil={false}
                onClick={laeuft ? undefined : () =>
                  starte(async () => {
                    const e = await forderungAbhaken(gewaehlt.id, "per Ueberweisung");
                    setMeldung({ ok: e.ok, text: e.meldung });
                    if (e.ok) setGewaehlt(null);
                  })
                }
              />
              <Listenzeile titel="Erlassen" gefahr pfeil={false} onClick={() => setErlassen(true)} />
            </div>
          ) : (
            <>
              <p className="unterzeile">
                Die Forderung bleibt als Beleg stehen und wird nicht mehr eingezogen. Der Grund ist
                später die einzige Erklärung, die noch da ist.
              </p>
              <div className="formraster">
                <label>
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
                      const e = await forderungErlassen(gewaehlt.id, grund);
                      setMeldung({ ok: e.ok, text: e.meldung });
                      if (e.ok) setGewaehlt(null);
                    })
                  }
                >
                  Wirklich erlassen
                </button>
                <button type="button" className="knopf leise" onClick={() => setErlassen(false)}>
                  Abbrechen
                </button>
              </div>
            </>
          )}
        </FensterKnopf>
      )}
    </>
  );
}
