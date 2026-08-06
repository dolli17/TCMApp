"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { formatCents } from "@tcm/core";
import {
  antragAblehnen,
  antragAlsSpam,
  antragAnnehmen,
} from "@/app/admin/mitglieder/antraege/aktionen";

export interface Antrag {
  id: string;
  first_name: string;
  last_name: string;
  salutation: string | null;
  birthday: string;
  email: string;
  phone: string | null;
  mobile: string | null;
  street: string | null;
  postcode: string | null;
  city: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  guardian_name: string | null;
  guardian_email: string | null;
  desired_fee_type_id: string | null;
  attribute_choices: Record<string, boolean> | null;
  message: string | null;
  status: string;
  possible_duplicate: boolean;
  submitted_at: string;
}

export interface Beitragsart {
  id: string;
  name: string;
  preis_cents: number | null;
}

function datum(wert: string | null): string {
  return wert ? new Intl.DateTimeFormat("de-DE").format(new Date(wert)) : "—";
}

function alter(geburtstag: string): number {
  return Math.floor((Date.now() - new Date(geburtstag).getTime()) / 31_557_600_000);
}

/**
 * Einen Antrag ansehen und entscheiden.
 *
 * Drei Wege hinaus: annehmen, ablehnen, als Spam kennzeichnen. Die Annahme ist
 * der einzige, der etwas anlegt – und sie verschickt gleich die Einladung,
 * weil ein Zugang ohne Einladung dem neuen Mitglied nichts nützt.
 */
export function AntragsFenster({
  antrag,
  beitragsarten,
  onSchliessen,
}: {
  antrag: Antrag;
  beitragsarten: Beitragsart[];
  onSchliessen: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();
  const [ablehnenOffen, setAblehnenOffen] = useState(false);
  const [grund, setGrund] = useState("");

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const [aufgenommen, setAufgenommen] = useState<string | null>(null);

  function annehmen(fd: FormData) {
    starte(async () => {
      const e = await antragAnnehmen(fd);
      setMeldung({ ok: e.ok, text: e.meldung });
      // Bewusst keine automatische Weiterleitung: in der Meldung steht die
      // vergebene Mitgliedsnummer, und ob die Einladung rausging. Wer das
      // wegblendet, bevor es jemand lesen konnte, hat nichts gewonnen.
      if (e.ok && e.memberId) setAufgenommen(e.memberId);
    });
  }

  function ablehnen() {
    starte(async () => {
      const e = await antragAblehnen(antrag.id, grund);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) dialog.current?.close();
    });
  }

  function spam() {
    starte(async () => {
      const e = await antragAlsSpam(antrag.id);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) dialog.current?.close();
    });
  }

  const jahre = alter(antrag.birthday);
  const einwilligungen = Object.entries(antrag.attribute_choices ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k);

  return (
    <dialog
      ref={dialog}
      className="fenster breit"
      onClose={() => {
        // Erst jetzt auffrischen: währenddessen würde der Teilbau samt
        // Fenster ersetzt.
        if (aufgenommen) router.refresh();
        onSchliessen();
      }}
      onCancel={onSchliessen}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      aria-label={`Antrag von ${antrag.first_name} ${antrag.last_name}`}
    >
      <div className="fenster-kopf">
        <div>
          <h2 className="dpl">
            {antrag.last_name}, {antrag.first_name}
          </h2>
          <p>
            Eingegangen am {datum(antrag.submitted_at)} · {jahre} Jahre
            {jahre < 18 ? " (minderjährig)" : ""}
          </p>
        </div>
        <button className="fenster-zu" aria-label="Schließen" onClick={() => dialog.current?.close()}>
          ×
        </button>
      </div>

      {/* Ein Formular über Inhalt und Fuß statt eines Knopfes mit form-Attribut:
          das ist dieselbe Struktur wie im Anlegen-Fenster und kommt ohne
          Fernsteuerung aus. */}
      <form action={annehmen}>
      <input type="hidden" name="antrag" value={antrag.id} />

      <div className="fenster-inhalt">
        {meldung && (
          <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
            {meldung.text}
          </div>
        )}

        {antrag.possible_duplicate && (
          <div className="hinweis">
            Zu dieser E-Mail-Adresse gibt es bereits ein Mitglied. Bitte vor der Aufnahme prüfen,
            ob es sich um dieselbe Person handelt.
          </div>
        )}

        <div className="tabellenhuelle">
          <table className="liste">
            <tbody>
              <tr>
                <th>E-Mail</th>
                <td>{antrag.email}</td>
              </tr>
              <tr>
                <th>Telefon</th>
                <td>{antrag.mobile ?? antrag.phone ?? "—"}</td>
              </tr>
              <tr>
                <th>Geburtstag</th>
                <td>{datum(antrag.birthday)}</td>
              </tr>
              <tr>
                <th>Anschrift</th>
                <td>
                  {antrag.street ?? "—"}
                  {antrag.postcode || antrag.city ? (
                    <>
                      <br />
                      {antrag.postcode} {antrag.city}
                    </>
                  ) : null}
                </td>
              </tr>
              {(antrag.guardian_name || antrag.guardian_email) && (
                <tr>
                  <th>Erziehungsberechtigte</th>
                  <td>
                    {antrag.guardian_name ?? "—"}
                    {antrag.guardian_email ? <> · {antrag.guardian_email}</> : null}
                  </td>
                </tr>
              )}
              {antrag.emergency_contact_name && (
                <tr>
                  <th>Notfallkontakt</th>
                  <td>
                    {antrag.emergency_contact_name} · {antrag.emergency_contact_phone ?? "—"}
                  </td>
                </tr>
              )}
              <tr>
                <th>Einwilligungen</th>
                <td>{einwilligungen.length > 0 ? einwilligungen.join(", ") : "keine"}</td>
              </tr>
              {antrag.message && (
                <tr>
                  <th>Nachricht</th>
                  <td>{antrag.message}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!ablehnenOffen ? (
          <>
            <h3 className="dpl">Aufnehmen</h3>
            <div className="formraster">
              <label>
                <span>Mitgliedsnummer</span>
                <input name="number" placeholder="automatisch" />
              </label>
              <label>
                <span>Eintritt</span>
                <input
                  type="date"
                  name="started_on"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </label>
              <label>
                <span>Beitragsart</span>
                <select name="fee_type" defaultValue={antrag.desired_fee_type_id ?? ""}>
                  <option value="">später festlegen</option>
                  {beitragsarten.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.preis_cents !== null ? ` – ${formatCents(b.preis_cents)}` : ""}
                    </option>
                  ))}
                </select>
                {antrag.desired_fee_type_id && (
                  <span className="beschreibung">Vorbelegt mit dem Wunsch aus dem Antrag.</span>
                )}
              </label>
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                name="einladen"
                defaultChecked
                style={{ width: "auto" }}
              />
              <span style={{ marginBottom: 0 }}>Einladung zur App gleich mitschicken</span>
            </label>
          </>
        ) : (
          <>
            <h3 className="dpl">Ablehnen</h3>
            <label>
              <span>Grund (nur für die Akte)</span>
              <input value={grund} onChange={(e) => setGrund(e.target.value)} />
              <span className="beschreibung">
                Es geht keine automatische Absage raus – die schreibt der Vorstand persönlich.
              </span>
            </label>
          </>
        )}
      </div>

      <div className="fenster-fuss">
        {aufgenommen ? (
          <>
            <button type="button" className="knopf leise" onClick={() => dialog.current?.close()}>
              Schließen
            </button>
            <button
              type="button"
              className="knopf"
              onClick={() => router.push(`/admin/mitglieder/${aufgenommen}`)}
            >
              Zum neuen Mitglied
            </button>
          </>
        ) : !ablehnenOffen ? (
          <>
            <button type="button" className="knopf leise klein" disabled={laeuft} onClick={spam}>
              Spam
            </button>
            <button
              type="button"
              className="knopf leise"
              disabled={laeuft}
              onClick={() => setAblehnenOffen(true)}
            >
              Ablehnen
            </button>
            <button className="knopf" disabled={laeuft}>
              {laeuft ? "Wird aufgenommen…" : "Aufnehmen"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="knopf leise"
              disabled={laeuft}
              onClick={() => setAblehnenOffen(false)}
            >
              Zurück
            </button>
            <button type="button" className="knopf gefahr" disabled={laeuft} onClick={ablehnen}>
              {laeuft ? "Wird abgelehnt…" : "Wirklich ablehnen"}
            </button>
          </>
        )}
      </div>
      </form>
    </dialog>
  );
}
