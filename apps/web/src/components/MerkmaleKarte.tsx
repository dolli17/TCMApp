"use client";

import { useState, useTransition } from "react";
import { merkmalEntfernen, merkmalSetzen } from "@/app/merkmale-aktionen";

export interface MerkmalZeile {
  code: string;
  name: string;
  description: string;
  value_kind: "list" | "text" | "date" | "boolean" | "number";
  multiple: boolean;
  self_editable: boolean;
  darf_ich: boolean;
  option_value: string | null;
  option_label: string | null;
  text_value: string | null;
  set_at: string | null;
  optionen: { value: string; label: string }[];
}

/** Aus den Zeilen der RPC wird je Merkmal ein Eintrag mit allen seinen Werten. */
interface Merkmal {
  code: string;
  name: string;
  description: string;
  art: MerkmalZeile["value_kind"];
  multiple: boolean;
  darfIch: boolean;
  optionen: { value: string; label: string }[];
  werte: { option: string | null; label: string | null; text: string | null; seit: string | null }[];
}

function buendeln(zeilen: MerkmalZeile[]): Merkmal[] {
  const map = new Map<string, Merkmal>();

  for (const z of zeilen) {
    let m = map.get(z.code);
    if (!m) {
      m = {
        code: z.code,
        name: z.name,
        description: z.description,
        art: z.value_kind,
        multiple: z.multiple,
        darfIch: z.darf_ich,
        optionen: z.optionen ?? [],
        werte: [],
      };
      map.set(z.code, m);
    }
    // Die RPC liefert auch Merkmale ohne Wert – dann bleibt die Liste leer.
    if (z.option_value !== null || z.text_value !== null) {
      m.werte.push({
        option: z.option_value,
        label: z.option_label,
        text: z.text_value,
        seit: z.set_at,
      });
    }
  }

  return [...map.values()];
}

function datum(wert: string | null): string {
  if (!wert) return "";
  return new Intl.DateTimeFormat("de-DE").format(new Date(wert));
}

interface Props {
  mitgliedId: string;
  zeilen: MerkmalZeile[];
  titel?: string;
  text?: string;
  /** Nur Merkmale zeigen, die das Mitglied selbst setzen darf (Konto-Ansicht). */
  nurSelbstpflege?: boolean;
}

/**
 * Merkmale eines Mitglieds anzeigen und setzen.
 *
 * Dieselbe Komponente trägt zwei Ansichten: beim Vorstand alle Merkmale, im
 * Konto nur die Einwilligungen. Was jemand ändern darf, entscheidet die
 * Datenbank – `darf_ich` kommt fertig aus der RPC, hier wird es nur angezeigt.
 */
export function MerkmaleKarte(props: Props) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();
  const [entwuerfe, setEntwuerfe] = useState<Record<string, string>>({});

  const merkmale = buendeln(props.zeilen).filter((m) =>
    props.nurSelbstpflege ? props.zeilen.some((z) => z.code === m.code && z.self_editable) : true,
  );

  function fuehreAus(auf: () => Promise<{ ok: boolean; meldung: string }>) {
    starte(async () => {
      const e = await auf();
      setMeldung({ ok: e.ok, text: e.meldung });
    });
  }

  if (merkmale.length === 0) {
    return (
      <section className="karte einstellungen" aria-label={props.titel ?? "Merkmale"}>
        <h2 className="dpl">{props.titel ?? "Merkmale"}</h2>
        <p className="leer">
          {props.nurSelbstpflege
            ? "Zurzeit sind keine Einwilligungen zu erteilen."
            : "Es sind noch keine Merkmale angelegt."}
        </p>
      </section>
    );
  }

  return (
    <section className="karte einstellungen" aria-label={props.titel ?? "Merkmale"}>
      <h2 className="dpl">{props.titel ?? "Merkmale"}</h2>
      {props.text && <p className="unterzeile">{props.text}</p>}

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {merkmale.map((m) => {
        const gesetzt = m.werte.length > 0;

        return (
          <div key={m.code} className="einstellung">
            <span className="titel">{m.name}</span>
            <span className="beschreibung">{m.description}</span>

            {m.art === "boolean" ? (
              <>
                <div className="segtoggle" role="group" aria-label={m.name}>
                  <button
                    type="button"
                    aria-pressed={gesetzt}
                    disabled={laeuft || !m.darfIch}
                    onClick={() => fuehreAus(() => merkmalSetzen(props.mitgliedId, m.code))}
                  >
                    Ja
                  </button>
                  <button
                    type="button"
                    aria-pressed={!gesetzt}
                    disabled={laeuft || !m.darfIch}
                    onClick={() => fuehreAus(() => merkmalEntfernen(props.mitgliedId, m.code))}
                  >
                    Nein
                  </button>
                </div>
                {gesetzt && m.werte[0]?.seit && (
                  <span className="beschreibung">Erteilt am {datum(m.werte[0].seit)}</span>
                )}
              </>
            ) : m.art === "list" ? (
              <>
                {m.werte.length > 0 && (
                  <ul className="marken" aria-label={`${m.name}: gewählt`}>
                    {m.werte.map((w) => (
                      <li key={w.option ?? w.text}>
                        <span>{w.label ?? w.option}</span>
                        {m.darfIch && (
                          <button
                            type="button"
                            aria-label={`${w.label ?? w.option} entfernen`}
                            disabled={laeuft}
                            onClick={() =>
                              fuehreAus(() =>
                                merkmalEntfernen(props.mitgliedId, m.code, w.option ?? undefined),
                              )
                            }
                          >
                            ×
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {m.darfIch && (m.multiple || m.werte.length === 0) && (
                  <select
                    aria-label={m.name}
                    value=""
                    disabled={laeuft}
                    onChange={(e) => {
                      const wert = e.target.value;
                      if (wert) fuehreAus(() => merkmalSetzen(props.mitgliedId, m.code, wert));
                    }}
                  >
                    <option value="">Auswählen…</option>
                    {m.optionen
                      .filter((o) => !m.werte.some((w) => w.option === o.value))
                      .map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                  </select>
                )}
              </>
            ) : (
              <>
                <input
                  type={m.art === "date" ? "date" : m.art === "number" ? "number" : "text"}
                  aria-label={m.name}
                  disabled={laeuft || !m.darfIch}
                  value={entwuerfe[m.code] ?? m.werte[0]?.text ?? ""}
                  onChange={(e) => setEntwuerfe({ ...entwuerfe, [m.code]: e.target.value })}
                />
                {m.darfIch && (
                  <button
                    className="knopf klein"
                    disabled={laeuft || (entwuerfe[m.code] ?? "") === (m.werte[0]?.text ?? "")}
                    onClick={() =>
                      fuehreAus(() =>
                        merkmalSetzen(props.mitgliedId, m.code, undefined, entwuerfe[m.code] ?? ""),
                      )
                    }
                  >
                    Speichern
                  </button>
                )}
              </>
            )}

            {!m.darfIch && (
              <span className="beschreibung">Dieses Merkmal pflegt der Vorstand.</span>
            )}
          </div>
        );
      })}
    </section>
  );
}
