"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CHARGE_KINDS, CHARGE_KIND_LABEL, debitBatchTitle, type ChargeKind } from "@tcm/core";
import { laufAnlegen } from "@/app/admin/kasse/lastschriften/aktionen";

/**
 * Einen neuen Lastschriftlauf anlegen.
 *
 * Der Lauf entsteht leer; gefüllt wird er auf seiner eigenen Seite, wo die
 * Kandidatenliste steht. Das ist bewusst zweistufig — der Fälligkeitstag
 * bestimmt, wer überhaupt in Frage kommt, und den will man erst setzen und
 * dann sehen, was er bedeutet.
 *
 * Ein Lauf zieht alle angekündigten Arten ein, außer man schränkt ihn ein -
 * etwa auf die Beiträge im Frühjahr, ohne dass Getränke mitgehen. Der Name
 * wird aus Datum und Auswahl vorgeschlagen; früher stand hier der Platzhalter
 * „Beitragslauf 2027“, obwohl der Lauf auch Getränke einzog.
 */
export function LaufAnlegen({ fristTage }: { fristTage: number }) {
  const router = useRouter();
  const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

  const vorschlag = new Date(heute);
  vorschlag.setDate(vorschlag.getDate() + fristTage + 1);
  const vorgabe = vorschlag.toISOString().slice(0, 10);

  const [faellig, setFaellig] = useState(vorgabe);
  const [alle, setAlle] = useState(true);
  const [arten, setArten] = useState<ChargeKind[]>(["fee"]);
  const [titel, setTitel] = useState(debitBatchTitle(vorgabe));
  // Solange niemand den Namen angefasst hat, folgt er Datum und Auswahl.
  const [titelSelbst, setTitelSelbst] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  function neuBenennen(datum: string, mitAllen: boolean, auswahl: ChargeKind[]) {
    if (!titelSelbst) setTitel(debitBatchTitle(datum, mitAllen ? null : auswahl));
  }

  function umschalten(k: ChargeKind) {
    const neu = arten.includes(k) ? arten.filter((a) => a !== k) : [...arten, k];
    setArten(neu);
    neuBenennen(faellig, alle, neu);
  }

  return (
    <section className="karte">
      <h2 className="dpl">Neuer Lastschriftlauf</h2>
      <p className="unterzeile">
        Der Fälligkeitstag entscheidet, welche Forderungen mitgehen: nur die, deren
        Vorabankündigung dann lange genug her ist.
      </p>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      <div className="formraster">
        <label>
          <span>Fällig am</span>
          <input
            type="date"
            min={heute}
            value={faellig}
            onChange={(e) => {
              setFaellig(e.target.value);
              neuBenennen(e.target.value, alle, arten);
            }}
          />
        </label>
        <fieldset className="art-wahl">
          <legend>Was einziehen?</legend>
          <label className="wahl">
            <input
              type="radio"
              name="umfang"
              checked={alle}
              onChange={() => { setAlle(true); neuBenennen(faellig, true, arten); }}
            />
            Alles Angekündigte
          </label>
          <label className="wahl">
            <input
              type="radio"
              name="umfang"
              checked={!alle}
              onChange={() => { setAlle(false); neuBenennen(faellig, false, arten); }}
            />
            Nur bestimmte Arten
          </label>
          {!alle && (
            <div className="art-haken">
              {CHARGE_KINDS.map((k) => (
                <label key={k} className="wahl">
                  <input type="checkbox" checked={arten.includes(k)} onChange={() => umschalten(k)} />
                  {CHARGE_KIND_LABEL[k]}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <label>
          <span>Bezeichnung</span>
          <input
            type="text"
            value={titel}
            onChange={(e) => { setTitel(e.target.value); setTitelSelbst(true); }}
          />
        </label>
      </div>

      <div className="fenster-fuss">
        <button
          type="button"
          className="knopf gold block gross"
          disabled={laeuft || titel.trim() === "" || faellig === "" || (!alle && arten.length === 0)}
          onClick={() =>
            starte(async () => {
              const e = await laufAnlegen({ titel, faelligAm: faellig, arten: alle ? null : arten });
              setMeldung({ ok: e.ok, text: e.meldung });
              if (e.ok && e.id) router.push(`/admin/kasse/lastschriften/${e.id}`);
            })
          }
        >
          Lauf anlegen
        </button>
      </div>
    </section>
  );
}
