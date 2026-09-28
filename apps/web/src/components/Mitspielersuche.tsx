"use client";

import { useId, useMemo, useState } from "react";
import type { Mitglied } from "@/components/Belegungsplan";

interface Props {
  /** Der Bucher, fest vorn - "Du" oder der Name des Buchers. */
  kopf: { initialen: string; name: string; gelb?: boolean };
  verzeichnis: Mitglied[];
  mitglieder: string[];
  gaeste: string[];
  /** Wie viele Mitspieler die Buchungsart neben dem Bucher noch zulaesst. */
  maxWeitere: number;
  pflicht: boolean;
  /** Betrag je Gast in Cent. */
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

export const initialen = (vor?: string | null, nach?: string | null) =>
  `${(vor ?? "").charAt(0)}${(nach ?? "").charAt(0)}`.toUpperCase() || "?";

/**
 * "Wer spielt mit?" - wie im Buchungsblatt der App.
 *
 * Vorn der Bucher, dahinter die Gewaehlten als Chips. Mitglieder kommen ueber
 * "+ Mitglied" und ein Suchfeld: der Verein hat rund 300 Mitglieder, eine
 * Auswahlliste waere unbenutzbar. Gaeste kommen ueber einen eigenen Knopf -
 * sie kosten Geld, und das soll eine bewusste Handlung sein und kein
 * Nebeneffekt davon, dass die Suche nichts gefunden hat.
 */
export function Mitspielersuche(props: Props) {
  const [suchen, setSuchen] = useState(false);
  const [suche, setSuche] = useState("");
  const feldId = useId();
  const titelId = useId();

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
    setSuchen(false);
  }

  function gastHinzu() {
    if (voll) return;
    props.onGaeste([...props.gaeste, GAST]);
  }

  const gebuehr = props.gastgebuehrCents > 0 ? euro(props.gastgebuehrCents) : null;

  return (
    <div className="mitspieler" role="group" aria-labelledby={titelId}>
      <p className="feldname" id={titelId}>
        Wer spielt mit?{props.pflicht ? " (mindestens eine Person)" : ""}
      </p>

      <div className="chips">
        <span className={`chip${props.kopf.gelb ? " ich" : ""}`}>
          <span className="avatar" aria-hidden="true">{props.kopf.initialen}</span>
          <span className="name">{props.kopf.name}</span>
        </span>
        {(gewaehlteMitglieder.length > 0 || props.gaeste.length > 0) && (
          <ul className="marken" aria-label="Gewählte Mitspieler">
            {gewaehlteMitglieder.map((m) => (
              <li key={m.id} className="chip">
                <span className="avatar" aria-hidden="true">{initialen(m.first_name, m.last_name)}</span>
                <span className="name">{m.first_name} {m.last_name}</span>
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
              <li key={`g${i}`} className="chip gast">
                <span className="avatar" aria-hidden="true">G</span>
                <span className="name">{g}</span>
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
      </div>

      {voll ? (
        <p className="mit" style={{ color: "var(--muted)", margin: 0 }}>
          Für diese Spielform sind alle Plätze besetzt.
        </p>
      ) : (
        <div className="hinzu">
          <button
            type="button"
            className="gestrichelt"
            aria-expanded={suchen}
            aria-controls={feldId}
            onClick={() => setSuchen(!suchen)}
          >
            <Plus /> Mitglied
          </button>
          <button
            type="button"
            className="gestrichelt"
            aria-label={gebuehr ? `Gast hinzufügen, ${gebuehr}` : "Gast hinzufügen"}
            onClick={gastHinzu}
          >
            <Plus /> Gast{gebuehr ? ` · ${gebuehr}` : ""}
          </button>
        </div>
      )}

      {suchen && !voll && (
        <div className="suche">
          <input
            id={feldId}
            type="text"
            value={suche}
            autoComplete="off"
            autoFocus
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
              if (e.key === "Escape" && suche !== "") {
                // Escape leert erst das Feld, bevor es das Blatt schliesst.
                e.preventDefault();
                setSuche("");
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
        </div>
      )}

      {props.gaeste.length > 0 && gebuehr && (
        <p className="mit gasthinweis">
          Für jeden Gast werden {gebuehr} berechnet und mit der nächsten Lastschrift eingezogen.
        </p>
      )}
    </div>
  );
}

function Plus() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

const EURO = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const euro = (cents: number) => EURO.format(cents / 100);
