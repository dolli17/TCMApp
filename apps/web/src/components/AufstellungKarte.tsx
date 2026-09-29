"use client";

import { useState, useTransition } from "react";
import { spielerEntfernen, spielerSetzen } from "@/app/admin/mitglieder/mannschaften/aktionen";
import { Listenzeile } from "@/components/Listenzeile";
import { Personensuche, type Person } from "@/components/Personensuche";

export interface Aufstellungszeile {
  member_id: string;
  first_name: string;
  last_name: string;
  is_team_captain: boolean;
}

interface Props {
  mannschaftId: string;
  aktiv: boolean;
  zeilen: Aufstellungszeile[];
  verzeichnis: Person[];
}

/**
 * Die Aufstellung einer Mannschaft.
 *
 * Hinzufuegen ueber die Personensuche; wer schon in einer anderen Mannschaft
 * steht, wird umgehaengt - die Datenbank kennt nur eine je Spieler. Das
 * Mannschaftsfuehrer-Kennzeichen wandert per Knopf; ein zweiter wird von der
 * Datenbank abgewiesen, deshalb setzt der Knopf den bisherigen vorher zurueck.
 *
 * Keine Knoepfe in den Zeilen (docs/design/clubhaus/verwaltung, Regel 4):
 * ein Tippen waehlt den Spieler, darunter stehen seine Aktionen.
 */
export function AufstellungKarte(props: Props) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();
  const [gewaehltId, setGewaehltId] = useState<string | null>(null);
  const gewaehlt = props.zeilen.find((z) => z.member_id === gewaehltId) ?? null;

  function hinzufuegen(id: string | null) {
    if (!id) return;
    starte(async () => {
      const e = await spielerSetzen(props.mannschaftId, id, false);
      setMeldung({ ok: e.ok, text: e.meldung });
    });
  }

  function fuehrer(zeile: Aufstellungszeile) {
    starte(async () => {
      const bisher = props.zeilen.find((z) => z.is_team_captain && z.member_id !== zeile.member_id);
      if (!zeile.is_team_captain && bisher) {
        const e = await spielerSetzen(props.mannschaftId, bisher.member_id, false);
        if (!e.ok) {
          setMeldung({ ok: false, text: e.meldung });
          return;
        }
      }
      const e = await spielerSetzen(props.mannschaftId, zeile.member_id, !zeile.is_team_captain);
      setMeldung({ ok: e.ok, text: e.meldung });
    });
  }

  function entfernen(zeile: Aufstellungszeile) {
    starte(async () => {
      const e = await spielerEntfernen(zeile.member_id);
      setMeldung({ ok: e.ok, text: e.meldung });
    });
  }

  return (
    <section className="karte einstellungen" aria-label="Aufstellung">
      <h2 className="dpl">Aufstellung</h2>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {props.zeilen.length === 0 ? (
        <p className="beschreibung">Noch niemand eingetragen.</p>
      ) : (
        <>
          <ul className="liste-gruppe">
            {props.zeilen.map((z) => (
              <li key={z.member_id}>
                <Listenzeile
                  avatar={{ kurz: (z.first_name[0] ?? "") + (z.last_name[0] ?? ""), id: z.member_id }}
                  titel={`${z.last_name}, ${z.first_name}`}
                  hinweis={z.is_team_captain ? "Mannschaftsführer" : undefined}
                  hinweisTon="gold"
                  aktuell={z.member_id === gewaehltId}
                  onClick={() => setGewaehltId(z.member_id === gewaehltId ? null : z.member_id)}
                  pfeil={false}
                />
              </li>
            ))}
          </ul>

          {gewaehlt && (
            <div className="liste-gruppe" aria-label={`Aktionen für ${gewaehlt.first_name} ${gewaehlt.last_name}`}>
              <Listenzeile
                titel={gewaehlt.is_team_captain ? "Kennzeichen entfernen" : "Zum Mannschaftsführer machen"}
                kontext={`${gewaehlt.first_name} ${gewaehlt.last_name}`}
                onClick={laeuft ? undefined : () => fuehrer(gewaehlt)}
              />
              <Listenzeile titel="Zum Mitglied" href={`/admin/mitglieder/${gewaehlt.member_id}`} />
              <Listenzeile
                titel="Herausnehmen"
                gefahr
                onClick={laeuft ? undefined : () => {
                  entfernen(gewaehlt);
                  setGewaehltId(null);
                }}
                pfeil={false}
              />
            </div>
          )}
        </>
      )}

      <div className="einstellung">
        <span className="titel">Spieler hinzufügen</span>
        <span className="beschreibung">
          {props.aktiv
            ? "Wer bereits in einer anderen Mannschaft steht, wechselt hierher."
            : "Eine stillgelegte Mannschaft nimmt niemanden mehr auf."}
        </span>
        <Personensuche
          verzeichnis={props.verzeichnis}
          gewaehlt={null}
          onWahl={hinzufuegen}
          label="Mitglied"
          ausschluss={props.zeilen.map((z) => z.member_id)}
          disabled={laeuft || !props.aktiv}
        />
      </div>
    </section>
  );
}
