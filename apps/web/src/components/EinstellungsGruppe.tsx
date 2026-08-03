"use client";

import { useState, useTransition } from "react";
import { einstellungenSpeichern } from "@/app/admin/einstellungen/aktionen";

export interface Einstellung {
  key: string;
  value: unknown;
  value_type: string;
  label: string | null;
  description: string | null;
  updated_at: string | null;
}

/** jsonb kommt als Zahl, String oder Boolean an - das Formular braucht Text. */
function alsText(wert: unknown): string {
  if (wert === null || wert === undefined) return "";
  if (typeof wert === "string") return wert;
  return String(wert);
}

function feldTyp(valueType: string): string {
  switch (valueType) {
    case "integer": return "number";
    case "time": return "time";
    case "date": return "date";
    default: return "text";
  }
}

/**
 * Eine Karte je Themengruppe, jede mit eigenem Formular und eigener Rückmeldung.
 *
 * Getrennt statt ein großes Formular über alles: wer die Schließzeit ändert,
 * soll nicht versehentlich die Gläubiger-ID mit abschicken.
 */
export function EinstellungsGruppe({
  titel, text, eintraege,
}: {
  titel: string;
  text: string;
  eintraege: Einstellung[];
}) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  function abschicken(fd: FormData) {
    starte(async () => {
      const e = await einstellungenSpeichern(fd);
      setMeldung({ ok: e.ok, text: e.meldung });
    });
  }

  return (
    <section className="karte einstellungen" aria-label={titel}>
      <h2 className="dpl">{titel}</h2>
      <p className="unterzeile">{text}</p>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      <form action={abschicken}>
        {eintraege.map((e) => {
          const wert = alsText(e.value);
          return (
            <label key={e.key} className="einstellung">
              <span className="titel">{e.label ?? e.key}</span>
              {e.description && <span className="beschreibung">{e.description}</span>}
              <input
                type={feldTyp(e.value_type)}
                name={`wert:${e.key}`}
                defaultValue={wert}
                min={e.value_type === "integer" ? 0 : undefined}
                step={e.value_type === "time" ? 900 : undefined}
                aria-label={e.label ?? e.key}
              />
              <input type="hidden" name={`alt:${e.key}`} value={wert} />
              <span className="schluessel">{e.key}</span>
            </label>
          );
        })}

        <button className="knopf" disabled={laeuft}>
          {laeuft ? "Wird gespeichert…" : "Speichern"}
        </button>
      </form>
    </section>
  );
}
