"use client";

import { useId, useMemo, useState } from "react";

export interface Person {
  id: string;
  first_name: string;
  last_name: string;
}

interface Props {
  verzeichnis: Person[];
  /** Aktuell gewählte Person, oder null. */
  gewaehlt: string | null;
  onWahl: (id: string | null) => void;
  label: string;
  /** Diese Person taucht in den Treffern nicht auf – etwa das Mitglied selbst. */
  ausschluss?: string[];
  platzhalter?: string;
  disabled?: boolean;
}

const TREFFER_MAX = 8;

/**
 * Eine Person aus dem Verzeichnis wählen.
 *
 * Die Einzelauswahl-Schwester von Mitspielersuche: dieselbe Bedienung, aber
 * genau ein Treffer statt einer Liste, und ohne Gäste. Gebraucht wird sie
 * überall dort, wo eine Person auf eine andere zeigt – Zahler zuweisen,
 * Login verknüpfen.
 *
 * Wie beim Vorbild wird das Verzeichnis vorgeladen und im Browser gefiltert:
 * bei rund 300 Mitgliedern ist jede Netzwerkrunde pro Tastendruck verschwendet.
 */
export function Personensuche(props: Props) {
  const [suche, setSuche] = useState("");
  const feldId = useId();

  const person = useMemo(
    () => props.verzeichnis.find((m) => m.id === props.gewaehlt) ?? null,
    [props.verzeichnis, props.gewaehlt],
  );

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (q.length === 0) return [];
    const raus = new Set(props.ausschluss ?? []);
    return props.verzeichnis
      .filter((m) => !raus.has(m.id) && m.id !== props.gewaehlt)
      // Beide Reihenfolgen, weil manche „Meier Anna“ und manche „Anna Meier“ tippen.
      .filter(
        (m) =>
          `${m.first_name} ${m.last_name}`.toLowerCase().includes(q) ||
          `${m.last_name} ${m.first_name}`.toLowerCase().includes(q),
      )
      .slice(0, TREFFER_MAX);
  }, [suche, props.verzeichnis, props.ausschluss, props.gewaehlt]);

  function waehle(id: string) {
    props.onWahl(id);
    setSuche("");
  }

  return (
    <div className="mitspieler">
      <label htmlFor={feldId}>
        <span>{props.label}</span>
      </label>

      {person && (
        <ul className="marken" aria-label={`${props.label}: Auswahl`}>
          <li>
            <span>
              {person.last_name}, {person.first_name}
            </span>
            <button
              type="button"
              aria-label={`${person.first_name} ${person.last_name} entfernen`}
              disabled={props.disabled}
              onClick={() => props.onWahl(null)}
            >
              ×
            </button>
          </li>
        </ul>
      )}

      {!person && (
        <>
          <input
            id={feldId}
            type="text"
            value={suche}
            autoComplete="off"
            disabled={props.disabled}
            placeholder={props.platzhalter ?? "Namen tippen…"}
            aria-label={props.label}
            aria-expanded={treffer.length > 0}
            onChange={(e) => setSuche(e.target.value)}
            onKeyDown={(e) => {
              // Enter wählt den ersten Treffer, statt das Formular abzuschicken.
              if (e.key === "Enter") {
                e.preventDefault();
                const erster = treffer[0];
                if (erster) waehle(erster.id);
              }
            }}
          />

          {suche.trim().length > 0 && (
            <ul className="trefferliste" role="listbox" aria-label="Gefundene Mitglieder">
              {treffer.length === 0 ? (
                <li className="gast-anlegen">
                  <button type="button" disabled>
                    Niemand gefunden
                  </button>
                </li>
              ) : (
                treffer.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => waehle(m.id)}>
                      {m.last_name}, {m.first_name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
