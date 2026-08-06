"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  mitgliedAnonymisieren,
  mitgliedArchivieren,
  mitgliedLoeschen,
} from "@/app/admin/mitglieder/[id]/aktionen";

export interface Loeschfolgen {
  charges: number;
  drink_purchases: number;
  bookings: number;
  booking_players: number;
  work_duty_entries: number;
  mandates: number;
  bank_accounts: number;
  payees: number;
  can_delete: boolean;
  reason: string | null;
}

interface Props {
  mitgliedId: string;
  nachname: string;
  archiviert: boolean;
  selbst: boolean;
  folgen: Loeschfolgen;
}

/**
 * Die drei Wege, einen Mitgliedsdatensatz zu beenden.
 *
 * Bewusst in dieser Reihenfolge und mit je einem Satz dazu, wann welcher der
 * richtige ist. Ohne diese Einordnung greift man im Zweifel zum Löschen –
 * und das ist fast immer die falsche Wahl.
 */
export function GefahrenzoneKarte(props: Props) {
  const router = useRouter();
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  const [archivGrund, setArchivGrund] = useState("");
  const [archivOffen, setArchivOffen] = useState(false);
  const [anonGrund, setAnonGrund] = useState("");
  const [anonOffen, setAnonOffen] = useState(false);
  const [tippName, setTippName] = useState("");

  const f = props.folgen;
  const offeneForderungen = f.charges > 0;
  const nameStimmt = tippName.trim().toLowerCase() === props.nachname.trim().toLowerCase();

  function archivieren(bestaetigt: boolean) {
    starte(async () => {
      const e = await mitgliedArchivieren(props.mitgliedId, bestaetigt, archivGrund);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) setArchivOffen(false);
    });
  }

  function anonymisieren() {
    starte(async () => {
      const e = await mitgliedAnonymisieren(props.mitgliedId, anonGrund);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) setAnonOffen(false);
    });
  }

  function loeschen() {
    starte(async () => {
      const e = await mitgliedLoeschen(props.mitgliedId, tippName);
      if (e.ok) {
        // Die Seite, auf der wir stehen, gibt es nicht mehr.
        router.push("/admin/mitglieder");
        return;
      }
      setMeldung({ ok: false, text: e.meldung });
    });
  }

  if (props.selbst) {
    return (
      <section className="karte einstellungen" aria-label="Datensatz beenden">
        <h2 className="dpl">Datensatz beenden</h2>
        <p className="hinweis">
          Das ist dein eigener Datensatz. Archivieren, anonymisieren und löschen sind für die eigene
          Person gesperrt – sonst sperrt man sich versehentlich selbst aus.
        </p>
      </section>
    );
  }

  return (
    <section className="karte einstellungen" aria-label="Datensatz beenden">
      <h2 className="dpl">Datensatz beenden</h2>
      <p className="unterzeile">Drei Wege, vom schonendsten zum endgültigen.</p>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {/* 1. Archivieren */}
      <div className="einstellung">
        <span className="titel">Archivieren</span>
        <span className="beschreibung">
          Der Regelfall beim Austritt. Alle Daten bleiben erhalten, das Mitglied verschwindet aus
          den laufenden Listen. Künftige Buchungen werden abgesagt, Mandate widerrufen, offene
          Forderungen bleiben bestehen.
        </span>

        {props.archiviert ? (
          <span className="marke-klein grau">Bereits archiviert</span>
        ) : !archivOffen ? (
          <button className="knopf leise klein" disabled={laeuft} onClick={() => setArchivOffen(true)}>
            Archivieren
          </button>
        ) : (
          <>
            <input
              type="text"
              value={archivGrund}
              placeholder="Grund, z. B. Austritt zum Jahresende"
              onChange={(e) => setArchivGrund(e.target.value)}
            />
            {offeneForderungen && (
              <p className="hinweis fehler">
                {f.charges} Forderungen sind noch offen. Sie bleiben bestehen und müssen weiterhin
                eingezogen werden.
              </p>
            )}
            <div className="detailkopf aktionen" style={{ gap: 8, marginTop: 8 }}>
              <button className="knopf leise klein" disabled={laeuft} onClick={() => setArchivOffen(false)}>
                Abbrechen
              </button>
              <button
                className="knopf gefahr klein"
                disabled={laeuft}
                onClick={() => archivieren(offeneForderungen)}
              >
                {laeuft ? "Wird archiviert…" : "Wirklich archivieren"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* 2. Anonymisieren */}
      <div className="einstellung">
        <span className="titel">Anonymisieren</span>
        <span className="beschreibung">
          Für einen Löschwunsch nach DSGVO, wenn die Buchhaltung die Zahlen zehn Jahre aufbewahren
          muss. Name, Anschrift, Geburtsdatum, Kontakt und Bankdaten werden entfernt; Forderungen
          und Buchungen bleiben ohne Klarnamen erhalten. Nicht umkehrbar.
        </span>

        {!anonOffen ? (
          <button className="knopf leise klein" disabled={laeuft} onClick={() => setAnonOffen(true)}>
            Anonymisieren
          </button>
        ) : (
          <>
            <input
              type="text"
              value={anonGrund}
              placeholder="Grund, z. B. Löschersuchen vom 06.08.2026"
              onChange={(e) => setAnonGrund(e.target.value)}
            />
            <div className="detailkopf aktionen" style={{ gap: 8, marginTop: 8 }}>
              <button className="knopf leise klein" disabled={laeuft} onClick={() => setAnonOffen(false)}>
                Abbrechen
              </button>
              <button className="knopf gefahr klein" disabled={laeuft} onClick={anonymisieren}>
                {laeuft ? "Wird anonymisiert…" : "Wirklich anonymisieren"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* 3. Löschen */}
      <div className="einstellung">
        <span className="titel">Endgültig löschen</span>
        <span className="beschreibung">
          Nur für Fehleingaben, Dubletten und Testdatensätze. Der Datensatz verschwindet samt
          Mitgliedschaft, Rollen, Beitragszuordnung und Bankdaten. Im Änderungsprotokoll bleibt
          vermerkt, dass und durch wen gelöscht wurde.
        </span>

        {!f.can_delete ? (
          <div className="hinweis fehler">
            <strong>Löschen ist hier nicht möglich.</strong> Zu diesem Mitglied gehören{" "}
            {f.charges} Forderungen, {f.drink_purchases} Getränkebuchungen und {f.bookings}{" "}
            Platzbuchungen. Ein Löschen würde die Buchhaltung zerreißen – bitte archivieren oder
            anonymisieren.
          </div>
        ) : (
          <>
            <label>
              <span>
                Zur Bestätigung den Nachnamen eingeben: <strong>{props.nachname}</strong>
              </span>
              <input
                type="text"
                value={tippName}
                autoComplete="off"
                placeholder={props.nachname}
                onChange={(e) => setTippName(e.target.value)}
              />
            </label>
            <button className="knopf gefahr klein" disabled={laeuft || !nameStimmt} onClick={loeschen}>
              {laeuft ? "Wird gelöscht…" : "Endgültig löschen"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
