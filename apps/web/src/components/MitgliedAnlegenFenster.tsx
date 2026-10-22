"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { berlinDay, formatCents } from "@tcm/core";
import { mitgliedAnlegen } from "@/app/admin/mitglieder/aktionen";
import type { Beitragsart } from "@/lib/beitragsarten";

/**
 * Neues Mitglied anlegen.
 *
 * Natives <dialog> wie im Buchungsfenster: es bringt Fokusfalle, Escape zum
 * Schließen und Inertheit des Hintergrunds mit. Breiter als das Standardfenster,
 * weil hier zwei Spalten Formular stehen statt einer.
 *
 * Dieselben Pflichtfelder wie der Aufnahmeantrag. Alles Weitere (Rechtliches,
 * Erziehungsberechtigte, Mandat) ergänzt das Mitglied selbst im Onboarding.
 */
export function MitgliedAnlegenFenster({
  beitragsarten,
  onSchliessen,
}: {
  beitragsarten: Beitragsart[];
  onSchliessen: () => void;
}) {
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
      // Direkt auf die Detailseite, um das neue Mitglied gleich zu sehen.
      if (e.ok && e.id) router.push(`/admin/mitglieder/${e.id}`);
    });
  }

  const heute = berlinDay(new Date());

  return (
    <dialog
      ref={dialog}
      className="fenster blatt breit"
      onClose={onSchliessen}
      onCancel={onSchliessen}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      aria-label="Mitglied anlegen"
    >
      <span className="griff" aria-hidden="true" />
      <div className="fenster-kopf">
        <div>
          <h2 className="dpl">Mitglied anlegen</h2>
          <p>
            Mitgliedsnummer und Eintritt werden gesetzt, wenn du nichts angibst. Jedes Mitglied
            braucht eine eigene E-Mail-Adresse, auch Kinder.
          </p>
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
              <span>Geschlecht</span>
              <select name="gender" required defaultValue="">
                <option value="" disabled>
                  Bitte wählen
                </option>
                <option value="female">weiblich</option>
                <option value="male">männlich</option>
                <option value="diverse">divers</option>
              </select>
            </label>
            <label>
              <span>Geburtstag</span>
              <input type="date" name="birthday" required max={heute} />
            </label>
            <label>
              <span>E-Mail</span>
              <input type="email" name="email" required autoComplete="off" />
              <span className="beschreibung">Bekommt sofort eine Einladung zur App.</span>
            </label>
            <label>
              <span>Telefon</span>
              <input type="tel" name="mobile" required autoComplete="off" />
            </label>
            <label className="breit">
              <span>Straße und Hausnummer</span>
              <input name="street" required autoComplete="off" />
            </label>
            <label>
              <span>PLZ</span>
              <input name="postcode" required autoComplete="off" inputMode="numeric" />
            </label>
            <label>
              <span>Ort</span>
              <input name="city" required autoComplete="off" />
            </label>
            <label>
              <span>Mitgliedsnummer</span>
              <input name="number" placeholder="automatisch" autoComplete="off" />
            </label>
            <label>
              <span>Eintritt</span>
              <input type="date" name="started_on" defaultValue={heute} />
            </label>
            <label>
              <span>Beitragsart</span>
              <select name="fee_type" defaultValue="">
                <option value="">später festlegen</option>
                {beitragsarten.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.preis_cents !== null ? ` – ${formatCents(b.preis_cents)}` : ""}
                  </option>
                ))}
              </select>
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
