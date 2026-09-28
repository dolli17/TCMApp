"use client";

import { useState, useTransition } from "react";
import { formatCents } from "@tcm/core";
import {
  forderungenAnkuendigen, monatAbrechnen, monatSchliessen,
} from "@/app/admin/kasse/aktionen";
import { FensterKnopf } from "@/components/FensterKnopf";
import { Listenzeile } from "@/components/Listenzeile";

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
 * Was bei einem Monat als Naechstes zu tun ist: erst schliessen, dann
 * abrechnen, dann ankuendigen. Der laufende Monat hat noch nichts zu tun.
 */
function naechsterSchritt(m: MonatZeile, jetzt: number) {
  if (m.status === "open") {
    return m.year * 12 + m.month >= jetzt
      ? null
      : { marke: "schließen", knopf: "Monat schließen", text: "Schließen friert die Summe ein; danach nimmt die Theke für diesen Monat nichts mehr an." };
  }
  if (m.status === "closed") {
    return { marke: "abrechnen", knopf: "Forderungen erzeugen", text: "Die Summe steht fest. Das Abrechnen macht daraus Forderungen je Mitglied." };
  }
  if (m.offen > 0) {
    return { marke: "ankündigen", knopf: `${m.offen} ankündigen`, text: "Ohne Vorabankündigung darf nicht eingezogen werden." };
  }
  return null;
}

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
  const [gewaehlt, setGewaehlt] = useState<MonatZeile | null>(null);

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
        <ul className="liste-gruppe" aria-label="Getränkemonate">
          {monate.map((m) => {
            const schritt = naechsterSchritt(m, jetzt);
            return (
              <li key={m.id}>
                <Listenzeile
                  symbol={String(m.month).padStart(2, "0")}
                  titel={MONAT.format(new Date(m.year, m.month - 1, 1))}
                  kontext={`${m.buchungen} Entnahmen · ${m.mitglieder} Mitglieder${m.forderungen ? ` · ${m.forderungen} Forderungen` : ""}`}
                  neben={
                    <span className="neben">
                      <span className="betrag tnum">{formatCents(m.summe_cents)}</span>
                      <span className={`statusmarke ${schritt ? "gelb" : STAND_TON[m.status]}`}>
                        {schritt?.marke ?? STAND[m.status]}
                      </span>
                    </span>
                  }
                  onClick={schritt ? () => setGewaehlt(m) : undefined}
                />
              </li>
            );
          })}
        </ul>
      )}

      {/* Der eine Schritt eines Monats steht im Blatt, nicht in der Zeile (Regel 4) */}
      {gewaehlt && (() => {
        const schritt = naechsterSchritt(gewaehlt, jetzt);
        return (
          <FensterKnopf
            titel={MONAT.format(new Date(gewaehlt.year, gewaehlt.month - 1, 1))}
            unterzeile={STAND[gewaehlt.status]}
            offen
            onSchliessen={() => setGewaehlt(null)}
          >
            <dl className="angaben gruppe">
              <div><dt>Entnahmen</dt><dd className="tnum">{gewaehlt.buchungen}</dd></div>
              <div><dt>Mitglieder</dt><dd className="tnum">{gewaehlt.mitglieder}</dd></div>
              <div><dt>Summe</dt><dd className="tnum">{formatCents(gewaehlt.summe_cents)}</dd></div>
              <div><dt>Forderungen</dt><dd className="tnum">{gewaehlt.forderungen || "—"}</dd></div>
            </dl>
            {schritt && <p className="unterzeile">{schritt.text}</p>}
            {schritt && (
              <button
                type="button"
                className="knopf gold block"
                disabled={laeuft}
                onClick={() =>
                  starte(async () => {
                    const e =
                      gewaehlt.status === "open"
                        ? await monatSchliessen(gewaehlt.year, gewaehlt.month)
                        : gewaehlt.status === "closed"
                          ? await monatAbrechnen(gewaehlt.year, gewaehlt.month, null)
                          : await forderungenAnkuendigen({
                              faelligAm: fruehesteFaelligkeit(),
                              art: "drinks",
                              zeitraum: `${gewaehlt.year}-${String(gewaehlt.month).padStart(2, "0")}`,
                            });
                    setMeldung({ ok: e.ok, text: e.meldung });
                    if (e.ok) setGewaehlt(null);
                  })
                }
              >
                {schritt.knopf}
              </button>
            )}
          </FensterKnopf>
        );
      })()}
    </section>
  );
}
