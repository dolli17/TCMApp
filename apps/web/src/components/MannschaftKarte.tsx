"use client";

import { useState, useTransition } from "react";
import { mannschaftSetzen } from "@/app/admin/mitglieder/[id]/aktionen";

interface Props {
  mitgliedId: string;
  mannschaften: { id: string; name: string; active: boolean }[];
  mannschaftId: string | null;
  mannschaftsfuehrer: boolean;
  archiviert: boolean;
}

/**
 * In welcher Mannschaft spielt dieses Mitglied?
 *
 * Ein Select statt einer Suche: es gibt eine Handvoll Mannschaften, und die
 * Antwort "keine" ist der Normalfall - sie steht deshalb ganz oben.
 */
export function MannschaftKarte(props: Props) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();
  const [wahl, setWahl] = useState<string>(props.mannschaftId ?? "");
  const [fuehrer, setFuehrer] = useState(props.mannschaftsfuehrer);

  function speichern() {
    starte(async () => {
      const e = await mannschaftSetzen(props.mitgliedId, wahl || null, fuehrer);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (!e.ok) {
        setWahl(props.mannschaftId ?? "");
        setFuehrer(props.mannschaftsfuehrer);
      }
    });
  }

  // Stillgelegte Mannschaften bleiben waehlbar, wenn das Mitglied schon drin
  // steht - sonst liesse sich der Stand nicht einmal mehr anzeigen.
  const auswahl = props.mannschaften.filter((m) => m.active || m.id === props.mannschaftId);

  return (
    <section className="karte einstellungen" aria-label="Mannschaft">
      <h2 className="dpl">Mannschaft</h2>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      <div className="einstellung">
        <span className="titel">Spielt in</span>
        <span className="beschreibung">
          Ein Spieler steht in höchstens einer Mannschaft. Neue Mannschaften legt der Vorstand
          unter Mitglieder → Mannschaften an.
        </span>
        <select
          value={wahl}
          onChange={(e) => {
            setWahl(e.target.value);
            if (!e.target.value) setFuehrer(false);
          }}
          disabled={laeuft || props.archiviert}
          aria-label="Mannschaft"
        >
          <option value="">– keine –</option>
          {auswahl.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {!m.active ? " (stillgelegt)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="einstellung">
        <label style={{ display: "inline-flex", gap: 6, marginBottom: 0 }}>
          <input
            type="checkbox"
            checked={fuehrer}
            onChange={(e) => setFuehrer(e.target.checked)}
            disabled={laeuft || props.archiviert || !wahl}
            style={{ width: "auto" }}
          />
          Mannschaftsführer
        </label>
        <span className="beschreibung">
          Je Mannschaft nur einer. Steht dort schon jemand, wird das Speichern abgewiesen.
        </span>
      </div>

      <div className="detailkopf aktionen">
        <button
          type="button"
          className="knopf"
          onClick={speichern}
          disabled={
            laeuft ||
            props.archiviert ||
            (wahl === (props.mannschaftId ?? "") && fuehrer === props.mannschaftsfuehrer)
          }
        >
          {laeuft ? "Wird gespeichert…" : "Speichern"}
        </button>
      </div>
    </section>
  );
}
