"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { berlinDay, formatCents } from "@tcm/core";
import { mitgliedAnlegen } from "@/app/admin/mitglieder/aktionen";
import type { Beitragsart } from "@/lib/beitragsarten";
import { useVerwerfenFrage } from "@/components/VerwerfenFrage";

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
  // Mit Adresse geht die Einladung gleich mit raus – das sagt der Knopf (U47).
  const [email, setEmail] = useState("");
  const { fenster, rueckfrage } = useVerwerfenFrage(dialog, onSchliessen);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    // Sonst stünde der Fokus auf dem Schließen-Knopf oben (U61).
    el?.querySelector<HTMLInputElement>("input[name=first_name]")?.focus();
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
      {...fenster}
      aria-label="Mitglied anlegen"
    >
      <span className="griff" aria-hidden="true" />
      <div className="fenster-kopf">
        <div>
          <h2 className="dpl">Mitglied anlegen</h2>
          {/* Kurz, damit die Beitragsart am Desktop ohne Rollen sichtbar bleibt (U61).
              Nummer und Eintritt erklären sich über "freiwillig" und den Platzhalter. */}
          <p>
            Jedes Mitglied braucht eine eigene E-Mail-Adresse, auch Kinder. Dorthin geht sofort
            die Einladung zur App.
          </p>
        </div>
        <button className="fenster-zu" aria-label="Schließen" onClick={() => dialog.current?.close()}>
          ×
        </button>
      </div>
      {rueckfrage}

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
              <input
                type="email"
                name="email"
                required
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              <span>Telefon</span>
              <input type="tel" name="mobile" required autoComplete="off" />
            </label>
            <label className="breit">
              <span>Straße und Hausnummer</span>
              <input name="street" required autoComplete="off" />
            </label>
            {/* PLZ und Ort in einer Zeile, damit die Beitragsart ohne Rollen sichtbar bleibt */}
            <label>
              <span>PLZ und Ort</span>
              <span className="feldpaar">
                <input name="postcode" required autoComplete="off" inputMode="numeric" aria-label="PLZ" />
                <input name="city" required autoComplete="off" aria-label="Ort" />
              </span>
            </label>
            <label>
              <span>Mitgliedsnummer <small className="freiwillig">(freiwillig)</small></span>
              <input name="number" placeholder="automatisch" autoComplete="off" />
            </label>
            <label>
              <span>Eintritt <small className="freiwillig">(freiwillig)</small></span>
              <input type="date" name="started_on" defaultValue={heute} />
            </label>
            <label>
              <span>Beitragsart <small className="freiwillig">(freiwillig)</small></span>
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

        <div className="fenster-fuss haftend">
          <button
            type="button"
            className="knopf leise"
            disabled={laeuft}
            onClick={() => dialog.current?.close()}
          >
            Abbrechen
          </button>
          <button className="knopf" disabled={laeuft}>
            {laeuft ? "Wird angelegt…" : email.trim() ? "Anlegen und einladen" : "Anlegen"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
