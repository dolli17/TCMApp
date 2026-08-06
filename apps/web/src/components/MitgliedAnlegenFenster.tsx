"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { mitgliedAnlegen } from "@/app/admin/mitglieder/aktionen";

/**
 * Neues Mitglied anlegen.
 *
 * Natives <dialog> wie im Buchungsfenster: es bringt Fokusfalle, Escape zum
 * Schließen und Inertheit des Hintergrunds mit. Breiter als das Standardfenster,
 * weil hier zwei Spalten Formular stehen statt einer.
 */
export function MitgliedAnlegenFenster({ onSchliessen }: { onSchliessen: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  function abschicken(fd: FormData) {
    starte(async () => {
      const e = await mitgliedAnlegen(fd);
      setMeldung({ ok: e.ok, text: e.meldung });
      // Direkt auf die Detailseite: nach dem Anlegen fehlen fast immer noch
      // Beitragsart, Zahler oder Notfallkontakt.
      if (e.ok && e.id) router.push(`/admin/mitglieder/${e.id}`);
    });
  }

  const heute = new Date().toISOString().slice(0, 10);

  return (
    <dialog
      ref={dialog}
      className="fenster breit"
      onClose={onSchliessen}
      onCancel={onSchliessen}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      aria-label="Mitglied anlegen"
    >
      <div className="fenster-kopf">
        <div>
          <h2 className="dpl">Mitglied anlegen</h2>
          <p>Mitgliedsnummer und Eintritt werden gesetzt, wenn du nichts angibst.</p>
        </div>
        <button className="fenster-zu" aria-label="Schließen" onClick={() => dialog.current?.close()}>
          ×
        </button>
      </div>

      <form action={abschicken}>
        <div className="fenster-inhalt">
          {meldung && (
            <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
              {meldung.text}
            </div>
          )}

          <div className="formraster">
            <label>
              <span>Vorname</span>
              <input name="first_name" required autoComplete="off" />
            </label>
            <label>
              <span>Nachname</span>
              <input name="last_name" required autoComplete="off" />
            </label>
            <label>
              <span>Anrede</span>
              <select name="salutation" defaultValue="">
                <option value="">—</option>
                <option value="female">Frau</option>
                <option value="male">Herr</option>
                <option value="none">keine</option>
              </select>
            </label>
            <label>
              <span>Geschlecht</span>
              <select name="gender" defaultValue="">
                <option value="">—</option>
                <option value="female">weiblich</option>
                <option value="male">männlich</option>
                <option value="diverse">divers</option>
              </select>
            </label>
            <label>
              <span>Geburtstag</span>
              <input type="date" name="birthday" />
            </label>
            <label>
              <span>E-Mail</span>
              <input type="email" name="email" autoComplete="off" />
            </label>
            <label>
              <span>Telefon</span>
              <input type="tel" name="phone" autoComplete="off" />
            </label>
            <label>
              <span>Mobil</span>
              <input type="tel" name="mobile" autoComplete="off" />
            </label>
            <label className="breit">
              <span>Straße und Hausnummer</span>
              <input name="street" autoComplete="off" />
            </label>
            <label>
              <span>PLZ</span>
              <input name="postcode" autoComplete="off" />
            </label>
            <label>
              <span>Ort</span>
              <input name="city" autoComplete="off" />
            </label>
            <label>
              <span>Mitgliedsnummer</span>
              <input name="number" placeholder="automatisch" autoComplete="off" />
            </label>
            <label>
              <span>Eintritt</span>
              <input type="date" name="started_on" defaultValue={heute} />
            </label>
          </div>
        </div>

        <div className="fenster-fuss">
          <button
            type="button"
            className="knopf leise"
            disabled={laeuft}
            onClick={() => dialog.current?.close()}
          >
            Abbrechen
          </button>
          <button className="knopf" disabled={laeuft}>
            {laeuft ? "Wird angelegt…" : "Anlegen"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
