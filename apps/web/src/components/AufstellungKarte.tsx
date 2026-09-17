"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { spielerEntfernen, spielerSetzen } from "@/app/admin/mitglieder/mannschaften/aktionen";
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
 */
export function AufstellungKarte(props: Props) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

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
        <div className="tabellenhuelle">
          <table className="liste">
            <thead>
              <tr>
                <th>Name</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {props.zeilen.map((z) => (
                <tr key={z.member_id}>
                  <td>
                    <Link href={`/admin/mitglieder/${z.member_id}`}>
                      {z.last_name}, {z.first_name}
                    </Link>
                    {z.is_team_captain && (
                      <span className="marke-klein gold"> Mannschaftsführer</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="knopf leise"
                      disabled={laeuft}
                      onClick={() => fuehrer(z)}
                    >
                      {z.is_team_captain ? "Kennzeichen entfernen" : "Zum Mannschaftsführer machen"}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="knopf leise"
                      disabled={laeuft}
                      onClick={() => entfernen(z)}
                    >
                      Herausnehmen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
