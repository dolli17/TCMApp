"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { berlinDay, formatCents } from "@tcm/core";
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
 * Dieselben Mindestdaten wie beim Anlegen durch den Vorstand, dazu die
 * gewünschte Beitragsart und eine Nachricht. Erziehungsberechtigte,
 * Notfallkontakt, Einwilligungen und das Lastschriftmandat kommen erst nach
 * der Aufnahme im Onboarding. Je länger das Formular, desto mehr Leute brechen
 * ab – und desto mehr Daten liegen bei uns, bevor überhaupt feststeht, ob
 * jemand Mitglied wird.
 */
export function Antragsformular({ optionen }: { optionen: FormularOption[] }) {
  const router = useRouter();
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  const beitragsarten = optionen.filter((o) => o.art === "fee_type");

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
      {/* Honigtopf: für Menschen unsichtbar, für Programme verlockend. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="formraster">
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
            autoComplete="bday"
            max={berlinDay(new Date())}
          />
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
          <span>E-Mail</span>
          <input type="email" name="email" required autoComplete="email" />
        </label>
        <label>
          <span>Telefon</span>
          <input type="tel" name="mobile" required autoComplete="tel" />
        </label>
        <label className="breit">
          <span>Straße und Hausnummer</span>
          <input name="street" required autoComplete="street-address" />
        </label>
        <label>
          <span>PLZ</span>
          <input name="postcode" required autoComplete="postal-code" inputMode="numeric" />
        </label>
        <label>
          <span>Ort</span>
          <input name="city" required autoComplete="address-level2" />
        </label>
      </div>

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

      <label className="breit">
        <span>Nachricht an den Vorstand</span>
        <textarea name="message" rows={3} maxLength={1000} />
      </label>

      <p className="beschreibung">
        Nach der Aufnahme richtest du in der App dein Konto und das Lastschriftmandat ein.
      </p>

      {/* Die Meldung steht am Knopf: wer unten absendet, sieht sie sofort. */}
      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="alert">
          {meldung.text}
        </div>
      )}

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
