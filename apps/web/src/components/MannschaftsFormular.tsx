"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  mannschaftLoeschen,
  mannschaftSpeichern,
} from "@/app/admin/mitglieder/mannschaften/aktionen";

export interface Mannschaft {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
  member_count: number;
  captain_name: string | null;
}

/**
 * Eine Mannschaft anlegen oder umbenennen.
 *
 * Bewusst klein: eine Mannschaft hat einen Namen und eine Reihenfolge, mehr
 * nicht. Die Aufstellung steht in einer eigenen Karte darunter, weil sie
 * ein anderes Tempo hat - Spieler kommen und gehen, der Name bleibt.
 */
export function MannschaftsFormular({ vorhanden }: { vorhanden?: Mannschaft }) {
  const router = useRouter();
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();
  const [loeschenOffen, setLoeschenOffen] = useState(false);

  function abschicken(fd: FormData) {
    starte(async () => {
      const e = await mannschaftSpeichern(fd);
      setMeldung({ ok: e.ok, text: e.meldung });
      // Nach dem Anlegen direkt in die Bearbeitung springen, damit die
      // Aufstellung gefuellt werden kann, ohne die Mannschaft erst zu suchen.
      if (e.ok && !vorhanden && e.id) {
        router.push(`/admin/mitglieder/mannschaften?bearbeiten=${e.id}`);
      }
    });
  }

  function loeschen() {
    if (!vorhanden) return;
    starte(async () => {
      const e = await mannschaftLoeschen(vorhanden.id);
      if (e.ok) {
        router.push("/admin/mitglieder/mannschaften");
        return;
      }
      setMeldung({ ok: false, text: e.meldung });
      setLoeschenOffen(false);
    });
  }

  const spieler = vorhanden?.member_count ?? 0;

  return (
    <form action={abschicken} className="karte einstellungen" aria-label="Mannschaft">
      <h2 className="dpl">{vorhanden ? vorhanden.name : "Neue Mannschaft"}</h2>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {vorhanden && <input type="hidden" name="id" value={vorhanden.id} />}

      <div className="formraster">
        <label>
          <span>Name</span>
          <input
            name="name"
            defaultValue={vorhanden?.name}
            placeholder="z. B. Herren 30"
            required
          />
        </label>

        <label>
          <span>Reihenfolge</span>
          <input type="number" name="sort_order" defaultValue={vorhanden?.sort_order ?? 0} />
        </label>
      </div>

      {vorhanden && (
        <label>
          <span>Einstellungen</span>
          <span className="beschreibung">
            <label style={{ display: "inline-flex", gap: 6, marginBottom: 0 }}>
              <input
                type="checkbox"
                name="stillgelegt"
                defaultChecked={!vorhanden.active}
                style={{ width: "auto" }}
              />
              Stillgelegt – nimmt niemanden mehr auf, die Aufstellung bleibt sichtbar
            </label>
          </span>
        </label>
      )}

      <div className="detailkopf aktionen">
        <button className="knopf" disabled={laeuft}>
          {laeuft ? "Wird gespeichert…" : "Speichern"}
        </button>

        {vorhanden &&
          (loeschenOffen ? (
            <>
              <span className="beschreibung">
                {spieler === 0
                  ? "Die Mannschaft wird gelöscht."
                  : spieler === 1
                    ? "Ein Spieler wird aus der Mannschaft genommen."
                    : `${spieler} Spieler werden aus der Mannschaft genommen.`}
              </span>
              <button
                type="button"
                className="knopf leise"
                disabled={laeuft}
                onClick={() => setLoeschenOffen(false)}
              >
                Abbrechen
              </button>
              <button type="button" className="knopf gefahr" disabled={laeuft} onClick={loeschen}>
                Wirklich löschen
              </button>
            </>
          ) : (
            <button
              type="button"
              className="knopf leise"
              disabled={laeuft}
              onClick={() => setLoeschenOffen(true)}
            >
              Mannschaft löschen
            </button>
          ))}
      </div>
    </form>
  );
}
