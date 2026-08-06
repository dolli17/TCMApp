"use client";

import { useState, useTransition } from "react";
import type { AktionsErgebnis } from "@/app/admin/mitglieder/[id]/aktionen";

export type FeldArt = "text" | "email" | "tel" | "datum" | "auswahl" | "schalter";

export interface Feld {
  name: string;
  label: string;
  art: FeldArt;
  wert: string | boolean | null;
  hinweis?: string;
  /** Nur bei art: "auswahl". */
  optionen?: { wert: string; label: string }[];
  breit?: boolean;
}

interface Props {
  titel: string;
  text?: string;
  felder: Feld[];
  /** Versteckte Felder, die jede Übermittlung mitschickt (z. B. die Id). */
  versteckt?: Record<string, string>;
  aktion: (fd: FormData) => Promise<AktionsErgebnis>;
  /** Ist die Karte nur zum Ansehen? Etwa bei archivierten Mitgliedern. */
  gesperrt?: boolean;
  gesperrtGrund?: string;
}

function eingabetyp(art: FeldArt): string {
  switch (art) {
    case "email":
      return "email";
    case "tel":
      return "tel";
    case "datum":
      return "date";
    default:
      return "text";
  }
}

function alsText(wert: string | boolean | null): string {
  if (wert === null || wert === undefined) return "";
  if (typeof wert === "boolean") return wert ? "true" : "false";
  return wert;
}

/**
 * Ein Block Stammdaten mit eigenem Formular und eigener Rückmeldung.
 *
 * Übernimmt das Muster aus EinstellungsGruppe: jedes Feld schickt seinen
 * aktuellen Wert als `wert:` und den ursprünglichen als `alt:` mit, und der
 * Server Action vergleicht beide. Unveränderte Felder gehen gar nicht erst zur
 * Datenbank – das hält das Änderungsprotokoll sauber.
 *
 * Dieselbe Komponente trägt die Adminansicht und die Selbstpflege im Konto;
 * unterschiedlich ist nur, welche Felder hineingereicht werden.
 */
export function Stammdatenkarte(props: Props) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  function abschicken(fd: FormData) {
    starte(async () => {
      const e = await props.aktion(fd);
      setMeldung({ ok: e.ok, text: e.meldung });
    });
  }

  return (
    <section className="karte einstellungen" aria-label={props.titel}>
      <h2 className="dpl">{props.titel}</h2>
      {props.text && <p className="unterzeile">{props.text}</p>}

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {props.gesperrt && props.gesperrtGrund && (
        <div className="hinweis">{props.gesperrtGrund}</div>
      )}

      <form action={abschicken}>
        {Object.entries(props.versteckt ?? {}).map(([name, wert]) => (
          <input key={name} type="hidden" name={name} value={wert} />
        ))}

        <div className="formraster">
          {props.felder.map((f) => {
            const wert = alsText(f.wert);
            return (
              <label key={f.name} className={f.breit ? "breit" : undefined}>
                <span>{f.label}</span>

                {f.art === "auswahl" ? (
                  <select name={`wert:${f.name}`} defaultValue={wert} disabled={props.gesperrt}>
                    {(f.optionen ?? []).map((o) => (
                      <option key={o.wert} value={o.wert}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.art === "schalter" ? (
                  <>
                    {/* Ein nicht angehaktes Kästchen schickt gar nichts mit.
                        Das Begleitfeld sagt dem Server Action, dass es diesen
                        Schalter überhaupt gibt. */}
                    <input type="hidden" name={`schalter:${f.name}`} value="1" />
                    <input
                      type="checkbox"
                      name={`wert:${f.name}`}
                      defaultChecked={wert === "true"}
                      disabled={props.gesperrt}
                      style={{ width: "auto" }}
                    />
                  </>
                ) : (
                  <input
                    type={eingabetyp(f.art)}
                    name={`wert:${f.name}`}
                    defaultValue={wert}
                    disabled={props.gesperrt}
                    autoComplete="off"
                  />
                )}

                {f.hinweis && <span className="beschreibung">{f.hinweis}</span>}
                <input type="hidden" name={`alt:${f.name}`} value={wert} />
              </label>
            );
          })}
        </div>

        {!props.gesperrt && (
          <button className="knopf" disabled={laeuft}>
            {laeuft ? "Wird gespeichert…" : "Speichern"}
          </button>
        )}
      </form>
    </section>
  );
}
