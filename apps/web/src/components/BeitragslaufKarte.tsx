"use client";

import { useState, useTransition } from "react";
import { formatCents } from "@tcm/core";
import { beitragslaufStarten } from "@/app/admin/kasse/aktionen";

/**
 * Der Knopf, der aus der Vorschau Forderungen macht.
 *
 * Bewusst mit Zwischenschritt: der Beitragslauf ist die folgenreichste Aktion
 * der ganzen App — er stellt dreihundert Mitgliedern Geld in Rechnung. Ein
 * versehentlicher Klick soll nicht reichen. Doppelt erzeugt zwar nichts (dafür
 * sorgt der Index auf charges), aber die Nachfrage nennt Zahl und Summe, damit
 * der Vorstand vorher sieht, was gleich entsteht.
 */
export function BeitragslaufKarte({
  jahr, mitglieder, summeCents, schonBerechnet, faelligAm,
}: {
  jahr: number;
  mitglieder: number;
  summeCents: number;
  schonBerechnet: number;
  faelligAm: string;
}) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [gefragt, setGefragt] = useState(false);
  const [faellig, setFaellig] = useState(faelligAm);
  const [laeuft, starte] = useTransition();

  const offen = mitglieder - schonBerechnet;

  return (
    <section className="karte" style={{ marginBottom: 18 }}>
      <h2 className="dpl">Forderungen erzeugen</h2>
      <p className="unterzeile">
        Aus der Vorschau werden echte Forderungen. Eingezogen wird damit noch nichts – erst
        kommt die Vorabankündigung, dann der Lastschriftlauf.
      </p>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {offen === 0 ? (
        <p className="mit">
          Für {jahr} ist alles berechnet. {schonBerechnet}{" "}
          {schonBerechnet === 1 ? "Forderung besteht" : "Forderungen bestehen"} bereits.
        </p>
      ) : (
        <>
          <div className="formraster">
            <label>
              <span>Fällig am</span>
              <input
                type="date"
                value={faellig}
                onChange={(e) => setFaellig(e.target.value)}
              />
            </label>
          </div>

          <div className="fenster-fuss">
            {gefragt ? (
              <>
                <button
                  type="button"
                  className="knopf gefahr"
                  disabled={laeuft}
                  onClick={() =>
                    starte(async () => {
                      const e = await beitragslaufStarten({ jahr, faelligAm: faellig });
                      setMeldung({ ok: e.ok, text: e.meldung });
                      setGefragt(false);
                    })
                  }
                >
                  {laeuft
                    ? "Wird erzeugt…"
                    : `${offen} ${offen === 1 ? "Forderung" : "Forderungen"} über ${formatCents(
                        summeCents,
                      )} erzeugen`}
                </button>
                <button
                  type="button"
                  className="knopf leise"
                  disabled={laeuft}
                  onClick={() => setGefragt(false)}
                >
                  Doch nicht
                </button>
              </>
            ) : (
              <button
                type="button"
                className="knopf"
                disabled={laeuft || faellig === ""}
                onClick={() => setGefragt(true)}
              >
                Forderungen erzeugen
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
