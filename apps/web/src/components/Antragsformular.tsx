"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCents } from "@tcm/core";
import { antragEinreichen } from "@/app/antrag/aktionen";

export interface FormularOption {
  art: string;
  code: string;
  name: string;
  description: string | null;
  amount_cents: number | null;
}

/**
 * Aufnahmeantrag.
 *
 * Bewusst kurz: Name, Geburtstag, Kontakt, gewünschte Beitragsart. Alles
 * Weitere trägt der Vorstand nach der Aufnahme ein. Je länger das Formular,
 * desto mehr Leute brechen ab – und desto mehr Daten liegen bei uns, bevor
 * überhaupt feststeht, ob jemand Mitglied wird.
 */
export function Antragsformular({ optionen }: { optionen: FormularOption[] }) {
  const router = useRouter();
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();
  const [geburtstag, setGeburtstag] = useState("");

  const beitragsarten = optionen.filter((o) => o.art === "fee_type");
  const einwilligungen = optionen.filter((o) => o.art === "attribute");

  // Bei Minderjährigen braucht es die Erziehungsberechtigten – sie
  // unterschreiben und sie zahlen.
  const minderjaehrig = (() => {
    if (!geburtstag) return false;
    const alter = (Date.now() - new Date(geburtstag).getTime()) / 31_557_600_000;
    return alter < 18;
  })();

  function abschicken(fd: FormData) {
    starte(async () => {
      const e = await antragEinreichen(fd);
      if (e.ok) {
        router.push("/antrag/danke");
        return;
      }
      setMeldung({ ok: false, text: e.meldung });
    });
  }

  return (
    <form action={abschicken}>
      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {/* Honigtopf: für Menschen unsichtbar, für Programme verlockend. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="formraster">
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
          <span>Vorname</span>
          <input name="first_name" required autoComplete="given-name" />
        </label>
        <label>
          <span>Nachname</span>
          <input name="last_name" required autoComplete="family-name" />
        </label>
        <label>
          <span>Geburtstag</span>
          <input
            type="date"
            name="birthday"
            required
            value={geburtstag}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setGeburtstag(e.target.value)}
          />
        </label>
        <label>
          <span>E-Mail</span>
          <input type="email" name="email" required autoComplete="email" />
        </label>
        <label>
          <span>Telefon oder Mobil</span>
          <input type="tel" name="mobile" autoComplete="tel" />
        </label>
        <label className="breit">
          <span>Straße und Hausnummer</span>
          <input name="street" autoComplete="street-address" />
        </label>
        <label>
          <span>PLZ</span>
          <input name="postcode" autoComplete="postal-code" inputMode="numeric" />
        </label>
        <label>
          <span>Ort</span>
          <input name="city" autoComplete="address-level2" />
        </label>
      </div>

      {minderjaehrig && (
        <>
          <h2 className="dpl">Erziehungsberechtigte</h2>
          <p className="beschreibung">
            Bei Minderjährigen unterschreibt ein Elternteil den Aufnahmeantrag, und über ihn läuft
            auch der Beitrag.
          </p>
          <div className="formraster">
            <label>
              <span>Name</span>
              <input name="guardian_name" autoComplete="off" />
            </label>
            <label>
              <span>E-Mail</span>
              <input type="email" name="guardian_email" autoComplete="off" />
            </label>
            <label>
              <span>Notfallnummer</span>
              <input type="tel" name="emergency_contact_phone" autoComplete="off" />
            </label>
            <label>
              <span>Name für den Notfall</span>
              <input name="emergency_contact_name" autoComplete="off" />
            </label>
          </div>
        </>
      )}

      {beitragsarten.length > 0 && (
        <>
          <h2 className="dpl">Mitgliedschaft</h2>
          <label>
            <span>Gewünschte Beitragsart</span>
            <select name="desired_fee_type_id" defaultValue="">
              <option value="">Der Vorstand entscheidet</option>
              {beitragsarten.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                  {b.amount_cents !== null ? ` – ${formatCents(b.amount_cents)} im Jahr` : ""}
                </option>
              ))}
            </select>
            <span className="beschreibung">
              Unverbindlich. Was am Ende gilt, klärt der Vorstand mit dir.
            </span>
          </label>
        </>
      )}

      {einwilligungen.length > 0 && (
        <>
          <h2 className="dpl">Einwilligungen</h2>
          <p className="beschreibung">
            Freiwillig, und jederzeit widerrufbar. Ohne sie geht die Mitgliedschaft genauso.
          </p>
          {einwilligungen.map((e) => (
            <label key={e.code} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                name={`merkmal:${e.code}`}
                style={{ width: "auto", marginTop: 4 }}
              />
              <span style={{ marginBottom: 0 }}>
                <strong>{e.name}</strong>
                <br />
                {e.description}
              </span>
            </label>
          ))}
        </>
      )}

      <label className="breit">
        <span>Nachricht an den Vorstand</span>
        <textarea name="message" rows={3} maxLength={1000} />
      </label>

      <button className="knopf block" disabled={laeuft}>
        {laeuft ? "Wird gesendet…" : "Antrag absenden"}
      </button>

      <p className="beschreibung" style={{ marginTop: 12 }}>
        Deine Angaben gehen ausschließlich an den Vorstand des TC Muckensturm und dienen der
        Bearbeitung deines Aufnahmeantrags.
      </p>
    </form>
  );
}
