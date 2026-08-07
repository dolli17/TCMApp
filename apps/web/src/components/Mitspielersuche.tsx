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
  /** 0 schaltet den Gast-Knopf ab. Sonst der Betrag je Gast in Cent. */
  gastgebuehrCents: number;
  onMitglieder: (ids: string[]) => void;
  onGaeste: (namen: string[]) => void;
}

/**
 * Gaeste haben keinen Namen.
 *
 * Der Verein braucht ihn nicht - es geht um die Gebuehr und um den belegten
 * Platz, nicht um eine Gaesteliste. Ein Freitextfeld hat frueher dazu gefuehrt,
 * dass Mitglieder als "Gast" mit falsch geschriebenem Namen eingetragen wurden
 * statt aus dem Verzeichnis gewaehlt. Die Datenbank verlangt einen nicht leeren
 * guest_name, also traegt jeder Gastplatz genau dieses Wort.
 */
const GAST = "Gast";

const TREFFER_MAX = 8;

/**
 * Mitspieler durch Tippen finden.
 *
 * Der Verein hat rund 300 Mitglieder; eine Auswahlliste mit 300 Eintraegen ist
 * am Telefon unbenutzbar. Deshalb ein Textfeld, das das Verzeichnis filtert,
 * und die Auswahl als entfernbare Marke darunter.
 *
 * Im Feld stehen ausschliesslich Mitglieder. Gaeste kommen ueber einen eigenen
 * Knopf daneben - sie kosten Geld, und das soll eine bewusste Handlung sein
 * und kein Nebeneffekt davon, dass die Suche nichts gefunden hat.
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
    if (voll) return;
    props.onGaeste([...props.gaeste, GAST]);
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
              <span>{g}</span>
              <button
                type="button"
                aria-label={`Gast ${i + 1} entfernen`}
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
              }
            }}
          />

          {suche.trim().length > 0 && (
            <ul className="trefferliste" role="listbox" aria-label="Gefundene Mitglieder">
              {treffer.length === 0 ? (
                <li className="leer">Niemand gefunden.</li>
              ) : (
                treffer.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => mitgliedHinzu(m.id)}>
                      {m.last_name}, {m.first_name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}

          <button type="button" className="knopf leise klein gastknopf" onClick={gastHinzu}>
            + Gast
          </button>
        </>
      )}

      {props.gaeste.length > 0 && props.gastgebuehrCents > 0 && (
        <p className="mit gasthinweis">
          Für jeden Gast werden {euro(props.gastgebuehrCents)} berechnet und mit der nächsten
          Lastschrift eingezogen.
        </p>
      )}
    </div>
  );
}

const EURO = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const euro = (cents: number) => EURO.format(cents / 100);
