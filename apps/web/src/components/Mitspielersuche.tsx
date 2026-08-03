"use client";

import { useId, useMemo, useState } from "react";
import type { Mitglied } from "@/components/Belegungsplan";

interface Props {
  verzeichnis: Mitglied[];
  mitglieder: string[];
  gaeste: string[];
  /** Wie viele Mitspieler die Buchungsart neben dem Bucher noch zulaesst. */
  maxWeitere: number;
  pflicht: boolean;
  onMitglieder: (ids: string[]) => void;
  onGaeste: (namen: string[]) => void;
}

const TREFFER_MAX = 8;

/**
 * Mitspieler durch Tippen finden.
 *
 * Der Verein hat rund 300 Mitglieder; eine Auswahlliste mit 300 Eintraegen ist
 * am Telefon unbenutzbar. Deshalb ein Textfeld, das das Verzeichnis filtert,
 * und die Auswahl als entfernbare Marke darunter. Gaeste kommen ueber dasselbe
 * Feld herein, wenn kein Mitglied passt.
 */
export function Mitspielersuche(props: Props) {
  const [suche, setSuche] = useState("");
  const listenId = useId();

  const gewaehlteMitglieder = useMemo(
    () =>
      props.mitglieder
        .map((id) => props.verzeichnis.find((m) => m.id === id))
        .filter((m): m is Mitglied => Boolean(m)),
    [props.mitglieder, props.verzeichnis],
  );

  const voll = props.mitglieder.length + props.gaeste.length >= props.maxWeitere;

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (q.length === 0) return [];
    return props.verzeichnis
      .filter((m) => !props.mitglieder.includes(m.id))
      .filter((m) => `${m.first_name} ${m.last_name}`.toLowerCase().includes(q)
        || `${m.last_name} ${m.first_name}`.toLowerCase().includes(q))
      .slice(0, TREFFER_MAX);
  }, [suche, props.verzeichnis, props.mitglieder]);

  function mitgliedHinzu(id: string) {
    if (voll) return;
    props.onMitglieder([...props.mitglieder, id]);
    setSuche("");
  }

  function gastHinzu() {
    const name = suche.trim();
    if (!name || voll) return;
    props.onGaeste([...props.gaeste, name]);
    setSuche("");
  }

  return (
    <div className="mitspieler">
      <label htmlFor={listenId}>
        <span>
          Mitspieler{props.pflicht ? " (Pflicht)" : ""}
        </span>
      </label>

      {(gewaehlteMitglieder.length > 0 || props.gaeste.length > 0) && (
        <ul className="marken" aria-label="Gewählte Mitspieler">
          {gewaehlteMitglieder.map((m) => (
            <li key={m.id}>
              <span>{m.first_name} {m.last_name}</span>
              <button
                type="button"
                aria-label={`${m.first_name} ${m.last_name} entfernen`}
                onClick={() => props.onMitglieder(props.mitglieder.filter((x) => x !== m.id))}
              >
                ×
              </button>
            </li>
          ))}
          {props.gaeste.map((g, i) => (
            <li key={`g${i}`} className="gast">
              <span>{g} (Gast)</span>
              <button
                type="button"
                aria-label={`Gast ${g} entfernen`}
                onClick={() => props.onGaeste(props.gaeste.filter((_, k) => k !== i))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {voll ? (
        <p className="mit" style={{ color: "var(--muted)", margin: 0 }}>
          Für diese Buchungsart sind alle Plätze besetzt.
        </p>
      ) : (
        <>
          <input
            id={listenId}
            type="text"
            value={suche}
            autoComplete="off"
            placeholder="Namen tippen…"
            aria-label="Mitspieler suchen"
            aria-expanded={treffer.length > 0}
            onChange={(e) => setSuche(e.target.value)}
            onKeyDown={(e) => {
              // Enter im Suchfeld darf nicht das ganze Formular abschicken -
              // sonst bucht ein Tippfehler den Platz.
              if (e.key === "Enter") {
                e.preventDefault();
                const erster = treffer[0];
                if (erster) mitgliedHinzu(erster.id);
                else gastHinzu();
              }
            }}
          />

          {suche.trim().length > 0 && (
            <ul className="trefferliste" role="listbox" aria-label="Gefundene Mitglieder">
              {treffer.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => mitgliedHinzu(m.id)}>
                    {m.last_name}, {m.first_name}
                  </button>
                </li>
              ))}
              <li className="gast-anlegen">
                <button type="button" onClick={gastHinzu}>
                  „{suche.trim()}“ als Gast eintragen
                </button>
              </li>
            </ul>
          )}
        </>
      )}
    </div>
  );
}
