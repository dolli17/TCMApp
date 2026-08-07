"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { laufAnlegen } from "@/app/admin/kasse/lastschriften/aktionen";

/**
 * Einen neuen Lastschriftlauf anlegen.
 *
 * Der Lauf entsteht leer; gefüllt wird er auf seiner eigenen Seite, wo die
 * Kandidatenliste steht. Das ist bewusst zweistufig — der Fälligkeitstag
 * bestimmt, wer überhaupt in Frage kommt, und den will man erst setzen und
 * dann sehen, was er bedeutet.
 */
export function LaufAnlegen({ fristTage }: { fristTage: number }) {
  const router = useRouter();
  const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

  const vorschlag = new Date(heute);
  vorschlag.setDate(vorschlag.getDate() + fristTage + 1);
  const vorgabe = vorschlag.toISOString().slice(0, 10);

  const [titel, setTitel] = useState("");
  const [faellig, setFaellig] = useState(vorgabe);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  return (
    <section className="karte" style={{ marginBottom: 18 }}>
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
          <span>Bezeichnung</span>
          <input
            type="text"
            value={titel}
            placeholder="Beitragslauf 2027"
            onChange={(e) => setTitel(e.target.value)}
          />
        </label>
        <label>
          <span>Fällig am</span>
          <input
            type="date"
            min={heute}
            value={faellig}
            onChange={(e) => setFaellig(e.target.value)}
          />
        </label>
      </div>

      <div className="fenster-fuss">
        <button
          type="button"
          className="knopf"
          disabled={laeuft || titel.trim() === "" || faellig === ""}
          onClick={() =>
            starte(async () => {
              const e = await laufAnlegen({ titel, faelligAm: faellig });
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
