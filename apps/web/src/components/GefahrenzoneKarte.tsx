"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { berlinDay } from "@tcm/core";
import {
  mitgliedAnonymisieren,
  mitgliedArchivieren,
  mitgliedLoeschen,
  mitgliedReaktivieren,
} from "@/app/admin/mitglieder/[id]/aktionen";

export interface Loeschfolgen {
  charges: number;
  drink_purchases: number;
  bookings: number;
  booking_players: number;
  work_duty_entries: number;
  mandates: number;
  bank_accounts: number;
  can_delete: boolean;
  reason: string | null;
}

interface Props {
  mitgliedId: string;
  nachname: string;
  archiviert: boolean;
  anonymisiert: boolean;
  selbst: boolean;
  /** Läuft die Mitgliedschaft noch ohne Austrittsdatum? */
  mitgliedschaftLaeuft: boolean;
  /** Eingetragenes Austrittsdatum der letzten Mitgliedschaft */
  austrittZum: string | null;
  folgen: Loeschfolgen;
}

/** "1 Forderung", "3 Forderungen" */
function anzahl(n: number, eins: string, viele: string): string {
  return `${n} ${n === 1 ? eins : viele}`;
}

/** Nur die Posten, die es gibt: "1 Forderung und 3 Getränkebuchungen" */
function aufzaehlung(teile: string[]): string {
  return teile.length > 1 ? `${teile.slice(0, -1).join(", ")} und ${teile.at(-1)}` : (teile[0] ?? "");
}

function datum(iso: string): string {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
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
  const [reaktivOffen, setReaktivOffen] = useState(false);
  const [anonGrund, setAnonGrund] = useState("");
  const [anonOffen, setAnonOffen] = useState(false);
  const [anonName, setAnonName] = useState("");
  const [tippName, setTippName] = useState("");

  const f = props.folgen;
  const posten = [
    f.charges ? anzahl(f.charges, "Forderung", "Forderungen") : null,
    f.drink_purchases ? anzahl(f.drink_purchases, "Getränkebuchung", "Getränkebuchungen") : null,
    f.bookings ? anzahl(f.bookings, "Platzbuchung", "Platzbuchungen") : null,
  ].filter((x): x is string => x !== null);
  // "gehört 1 Forderung", sonst "gehören …"
  const einzeln = posten.length === 1 && posten[0]?.startsWith("1 ");
  const historie = posten.length ? `${einzeln ? "gehört" : "gehören"} ${aufzaehlung(posten)}` : "";
  const offeneForderungen = f.charges > 0;
  // Archivieren ist der zweite Schritt beim Austritt, erst nach dem Datum (U62).
  // Vorher geht es auch, sperrt dann aber sofort.
  const vorzeitig = props.mitgliedschaftLaeuft || (props.austrittZum !== null && props.austrittZum > berlinDay(new Date()));
  const stimmt = (getippt: string) => getippt.trim().toLowerCase() === props.nachname.trim().toLowerCase();

  function archivieren(bestaetigt: boolean) {
    starte(async () => {
      const e = await mitgliedArchivieren(props.mitgliedId, bestaetigt, archivGrund);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) setArchivOffen(false);
    });
  }

  function reaktivieren() {
    starte(async () => {
      const e = await mitgliedReaktivieren(props.mitgliedId);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) setReaktivOffen(false);
    });
  }

  function anonymisieren() {
    starte(async () => {
      const e = await mitgliedAnonymisieren(props.mitgliedId, anonGrund);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) {
        setAnonOffen(false);
        setAnonName("");
      }
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
      <section className="karte einstellungen gefahrenzone" aria-label="Datensatz beenden">
        <h2 className="dpl">Datensatz beenden</h2>
        <p className="hinweis">
          Das ist dein eigener Datensatz. Archivieren, anonymisieren und löschen sind für die eigene
          Person gesperrt – sonst sperrt man sich versehentlich selbst aus.
        </p>
      </section>
    );
  }

  return (
    <section className="karte einstellungen gefahrenzone" aria-label="Datensatz beenden">
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
          {props.archiviert
            ? ""
            : props.mitgliedschaftLaeuft
              ? "Der zweite Schritt beim Austritt: erst oben den Austritt eintragen, archivieren nach diesem Tag. "
              : props.austrittZum && vorzeitig
                ? `Nach dem Austritt am ${datum(props.austrittZum)} der nächste Schritt. `
                : props.austrittZum
                  ? `Der Austritt am ${datum(props.austrittZum)} ist vorbei, jetzt kann archiviert werden. `
                  : ""}
          Alle Daten bleiben erhalten, das Mitglied verschwindet aus den laufenden Listen. Künftige
          Buchungen werden abgesagt, Mandate widerrufen, offene Forderungen bleiben bestehen.
        </span>

        {props.archiviert && props.anonymisiert ? (
          <span className="marke-klein grau">Anonymisiert</span>
        ) : props.archiviert && !reaktivOffen ? (
          <>
            <span className="marke-klein grau">Archiviert</span>
            <button className="knopf leise klein" disabled={laeuft} onClick={() => setReaktivOffen(true)}>
              Reaktivieren
            </button>
          </>
        ) : props.archiviert ? (
          <div className="rueckfrage" role="group" aria-label="Reaktivieren bestätigen">
            <p className="hinweis">
              Das Mitglied wird wieder aktiv. Der Zugang bleibt gesperrt, bis du unter Zugang die
              Sperre aufhebst und neu einlädst. Danach geht es noch einmal durchs Onboarding und
              bestätigt seine Stammdaten. Rollen kommen nicht zurück, die Mitgliedschaft trägst du
              über „Wieder aufnehmen“ ein.
            </p>
            <span className="knopfreihe">
              <button className="knopf leise klein" disabled={laeuft} onClick={() => setReaktivOffen(false)}>
                Abbrechen
              </button>
              <button className="knopf klein" disabled={laeuft} onClick={reaktivieren}>
                {laeuft ? "Wird reaktiviert…" : "Wirklich reaktivieren"}
              </button>
            </span>
          </div>
        ) : !archivOffen ? (
          <button className="knopf leise klein" disabled={laeuft} onClick={() => setArchivOffen(true)}>
            Archivieren
          </button>
        ) : (
          <div className="rueckfrage" role="group" aria-label="Archivieren bestätigen">
            <label>
              <span>Grund</span>
              <input
                type="text"
                value={archivGrund}
                autoFocus
                placeholder="z. B. Austritt zum Jahresende"
                onChange={(e) => setArchivGrund(e.target.value)}
              />
            </label>
            {vorzeitig && (
              <p className="hinweis">
                {props.mitgliedschaftLaeuft
                  ? "Die Mitgliedschaft läuft noch. Archivieren beendet sie heute, sperrt sofort den Zugang und sagt künftige Buchungen ab. Für einen Austritt zu einem späteren Tag erst oben das Datum eintragen."
                  : `Der Austritt ist erst am ${datum(props.austrittZum!)}. Archivieren sperrt schon heute den Zugang und sagt künftige Buchungen ab.`}
              </p>
            )}
            {offeneForderungen && (
              <p className="hinweis fehler">
                {f.charges === 1 ? "1 Forderung ist" : `${f.charges} Forderungen sind`} noch offen. Sie
                bleiben bestehen und müssen weiterhin eingezogen werden.
              </p>
            )}
            <span className="knopfreihe">
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
            </span>
          </div>
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
          <div className="rueckfrage" role="group" aria-label="Anonymisieren bestätigen">
            <label>
              <span>Grund</span>
              <input
                type="text"
                value={anonGrund}
                autoFocus
                placeholder="z. B. Löschersuchen vom 06.08.2026"
                onChange={(e) => setAnonGrund(e.target.value)}
              />
            </label>
            <NachnameBestaetigen nachname={props.nachname} wert={anonName} setWert={setAnonName} />
            <span className="knopfreihe">
              <button className="knopf leise klein" disabled={laeuft} onClick={() => setAnonOffen(false)}>
                Abbrechen
              </button>
              <button
                className="knopf gefahr klein"
                disabled={laeuft || !stimmt(anonName)}
                onClick={anonymisieren}
              >
                {laeuft ? "Wird anonymisiert…" : "Wirklich anonymisieren"}
              </button>
            </span>
          </div>
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
            <strong>Löschen ist hier nicht möglich.</strong>{" "}
            {historie ? `Zu diesem Mitglied ${historie}. ` : ""}Ein Löschen würde die Buchhaltung
            zerreißen – bitte archivieren oder anonymisieren.
          </div>
        ) : (
          <div className="rueckfrage">
            <NachnameBestaetigen nachname={props.nachname} wert={tippName} setWert={setTippName} />
            <span className="knopfreihe">
              <button className="knopf gefahr klein" disabled={laeuft || !stimmt(tippName)} onClick={loeschen}>
                {laeuft ? "Wird gelöscht…" : "Endgültig löschen"}
              </button>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Nicht umkehrbares wird mit dem getippten Nachnamen bestätigt. Ohne
 * Platzhalter: ein vorausgefüllt wirkendes Feld verleitet zum Durchklicken.
 */
function NachnameBestaetigen(props: { nachname: string; wert: string; setWert: (w: string) => void }) {
  return (
    <label>
      <span>
        Zum Bestätigen den Nachnamen <strong>{props.nachname}</strong> eintippen
      </span>
      <input
        type="text"
        value={props.wert}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => props.setWert(e.target.value)}
      />
    </label>
  );
}
