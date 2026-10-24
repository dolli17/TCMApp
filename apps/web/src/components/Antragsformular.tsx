"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
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
/**
 * Die Pflichtfelder und was am Feld steht, wenn eines fehlt oder nicht passt.
 * Die Reihenfolge ist die im Formular: der Fokus springt aufs erste.
 */
const PFLICHT: { name: string; leer: string }[] = [
  { name: "first_name", leer: "Bitte gib deinen Vornamen an." },
  { name: "last_name", leer: "Bitte gib deinen Nachnamen an." },
  { name: "birthday", leer: "Bitte gib deinen Geburtstag an." },
  { name: "gender", leer: "Bitte wähle eine Angabe." },
  { name: "email", leer: "Ohne E-Mail-Adresse können wir dir nicht antworten." },
  { name: "mobile", leer: "Bitte gib eine Telefonnummer an." },
  { name: "street", leer: "Bitte gib Straße und Hausnummer an." },
  { name: "postcode", leer: "Bitte gib deine Postleitzahl an." },
  { name: "city", leer: "Bitte gib deinen Wohnort an." },
];

function pruefe(form: HTMLFormElement): Record<string, string> {
  const fehler: Record<string, string> = {};
  for (const f of PFLICHT) {
    const feld = form.elements.namedItem(f.name) as HTMLInputElement | HTMLSelectElement | null;
    if (!feld) continue;
    if (!feld.value.trim()) fehler[f.name] = f.leer;
    else if (f.name === "email" && feld.validity.typeMismatch) {
      fehler[f.name] = "Diese E-Mail-Adresse stimmt nicht – bitte prüfen, etwa name@beispiel.de.";
    } else if (f.name === "birthday" && feld.validity.rangeOverflow) {
      fehler[f.name] = "Der Geburtstag liegt in der Zukunft – bitte prüfen.";
    }
  }
  return fehler;
}

export function Antragsformular({ optionen }: { optionen: FormularOption[] }) {
  const router = useRouter();
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [fehler, setFehler] = useState<Record<string, string>>({});
  const [laeuft, starte] = useTransition();

  const beitragsarten = optionen.filter((o) => o.art === "fee_type");

  // Eigene Prüfung statt der Browserblase (U70): die verschwindet nach zwei
  // Sekunden und nennt nur das erste Feld. Der Fehler steht am Feld, das
  // Eingabefeld verweist per aria-describedby darauf, der Fokus springt hin.
  function absenden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const neu = pruefe(form);
    setFehler(neu);
    const erstes = PFLICHT.find((f) => neu[f.name]);
    if (erstes) {
      (form.elements.namedItem(erstes.name) as HTMLElement | null)?.focus();
      return;
    }
    const fd = new FormData(form);
    setMeldung(null);
    starte(async () => {
      const ergebnis = await antragEinreichen(fd);
      if (ergebnis.ok) {
        router.push("/antrag/danke");
        return;
      }
      setMeldung({ ok: false, text: ergebnis.meldung });
    });
  }

  // Ist ein Fehler einmal angezeigt, verschwindet er, sobald das Feld passt -
  // nicht erst beim nächsten Absenden.
  function nachpruefen(e: FormEvent<HTMLFormElement>) {
    const name = (e.target as HTMLInputElement).name;
    if (!fehler[name]) return;
    const neu = pruefe(e.currentTarget);
    setFehler((alt) => {
      const rest = { ...alt };
      if (neu[name]) rest[name] = neu[name];
      else delete rest[name];
      return rest;
    });
  }

  /** Was jedes Pflichtfeld braucht: Fehlerzustand und Verweis auf den Text. */
  function pflicht(name: string) {
    return {
      name,
      required: true,
      "aria-invalid": fehler[name] ? (true as const) : undefined,
      "aria-describedby": fehler[name] ? `antrag-${name}-fehler` : undefined,
    };
  }

  function fehlerText(name: string) {
    if (!fehler[name]) return null;
    return (
      <span className="feldfehler" id={`antrag-${name}-fehler`}>
        {fehler[name]}
      </span>
    );
  }

  return (
    <form onSubmit={absenden} onChange={nachpruefen} noValidate>
      {/* Honigtopf: für Menschen unsichtbar, für Programme verlockend. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <p className="beschreibung" style={{ margin: 0 }}>Alle Angaben brauchen wir, außer denen mit „freiwillig“.</p>

      {/* Der Fehler steht neben dem label, nicht darin: sonst wäre er Teil
          des Feldnamens und würde zweimal vorgelesen. */}
      <div className="formraster">
        <div className="feld">
          <label>
            <span>Vorname</span>
            <input {...pflicht("first_name")} autoComplete="given-name" />
          </label>
          {fehlerText("first_name")}
        </div>
        <div className="feld">
          <label>
            <span>Nachname</span>
            <input {...pflicht("last_name")} autoComplete="family-name" />
          </label>
          {fehlerText("last_name")}
        </div>
        <div className="feld">
          <label>
            <span>Geburtstag</span>
            <input type="date" {...pflicht("birthday")} autoComplete="bday" max={berlinDay(new Date())} />
          </label>
          {fehlerText("birthday")}
        </div>
        <div className="feld">
          <label>
            <span>Geschlecht</span>
            <select {...pflicht("gender")} defaultValue="">
              <option value="" disabled>
                Bitte wählen
              </option>
              <option value="female">weiblich</option>
              <option value="male">männlich</option>
              <option value="diverse">divers</option>
            </select>
          </label>
          {fehlerText("gender")}
        </div>
        <div className="feld">
          <label>
            <span>E-Mail</span>
            <input type="email" {...pflicht("email")} autoComplete="email" />
          </label>
          {fehlerText("email")}
        </div>
        <div className="feld">
          <label>
            <span>Telefon</span>
            <input type="tel" {...pflicht("mobile")} autoComplete="tel" />
          </label>
          {fehlerText("mobile")}
        </div>
        <div className="feld breit">
          <label>
            <span>Straße und Hausnummer</span>
            <input {...pflicht("street")} autoComplete="street-address" />
          </label>
          {fehlerText("street")}
        </div>
        {/* PLZ und Ort teilen sich eine Zeile, die PLZ schmal - sonst bliebe
            im dreispaltigen Raster eine leere Spalte daneben. */}
        <div className="plz-ort">
          <div className="feld">
            <label>
              <span>PLZ</span>
              <input {...pflicht("postcode")} autoComplete="postal-code" inputMode="numeric" />
            </label>
            {fehlerText("postcode")}
          </div>
          <div className="feld">
            <label>
              <span>Ort</span>
              <input {...pflicht("city")} autoComplete="address-level2" />
            </label>
            {fehlerText("city")}
          </div>
        </div>
      </div>

      {beitragsarten.length > 0 && (
        <>
          <h2 className="dpl">Mitgliedschaft</h2>
          <div className="feld">
            <label>
              <span>Gewünschte Beitragsart (freiwillig)</span>
              <select name="desired_fee_type_id" defaultValue="" aria-describedby="antrag-beitrag-hinweis">
                <option value="">Der Vorstand entscheidet</option>
                {beitragsarten.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                    {b.amount_cents !== null ? ` – ${formatCents(b.amount_cents)} im Jahr` : ""}
                  </option>
                ))}
              </select>
            </label>
            <span className="feldhinweis" id="antrag-beitrag-hinweis">
              Unverbindlich. Was am Ende gilt, klärt der Vorstand mit dir.
            </span>
          </div>
        </>
      )}

      <label className="breit">
        <span>Nachricht an den Vorstand (freiwillig)</span>
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
