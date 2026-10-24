"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { centsAlsEingabe, einstellungsText, listeAusWert, listenOptionen } from "@tcm/core";
import { einstellungenSpeichern } from "@/app/admin/einstellungs-aktionen";
import { Gruppenkopf } from "@/components/Listenzeile";

export interface Einstellung {
  key: string;
  value: unknown;
  value_type: string;
  label: string | null;
  description: string | null;
  updated_at: string | null;
}

/** jsonb kommt als Zahl, String oder Boolean an - das Formular braucht Text. */
function alsText(wert: unknown): string {
  if (wert === null || wert === undefined) return "";
  if (typeof wert === "string") return wert;
  return String(wert);
}

function feldTyp(valueType: string): string {
  switch (valueType) {
    case "integer": return "number";
    case "time": return "time";
    case "date": return "date";
    default: return "text";
  }
}

/**
 * Eine Einstellung als Zeile: deutscher Name, Erklärung, rechts die Eingabe.
 *
 * Name und Erklärung kommen aus `@tcm/core` (einstellungen.ts), nicht aus der
 * Tabelle. Betraege stehen in Cent in der Datenbank und werden hier in Euro
 * gezeigt; die Aktion rechnet beim Speichern zurück. Listen von
 * Benachrichtigungsarten sind Häkchen. Der Rohwert geht als `alt:` mit, damit
 * nur Geändertes gespeichert wird.
 */
function EinstellungsFeld({ e }: { e: Einstellung }) {
  const t = einstellungsText(e);
  const wert = alsText(e.value);
  const feld = useRef<HTMLInputElement & HTMLSelectElement>(null);

  // Ein Hinweis wie „Es fehlt noch die IBAN“ führt mit #iban hierher: dann
  // steht der Cursor gleich im Feld (U50).
  useEffect(() => {
    if (t.anker && window.location.hash === `#${t.anker}`) feld.current?.focus();
  }, [t.anker]);
  const alt = <input type="hidden" name={`alt:${e.key}`} value={wert} />;

  if (t.art === "liste") {
    // Eine Gruppe statt fieldset: dessen Legende sitzt in der Trennlinie.
    const an = new Set(listeAusWert(e.value));
    const id = `einstellung-${e.key.replace(/\W/g, "-")}`;
    return (
      <div className="einstellung liste" role="group" aria-labelledby={id}>
        <span className="titel" id={id}>{t.label}</span>
        {t.beschreibung && <span className="beschreibung">{t.beschreibung}</span>}
        <input type="hidden" name={`liste:${e.key}`} value="" />
        <div className="haken-raster">
          {listenOptionen(e.value).map((o) => (
            <label key={o.kind} className="wahl">
              <input type="checkbox" name={`art:${e.key}`} value={o.kind} defaultChecked={an.has(o.kind)} />
              {o.label}
            </label>
          ))}
        </div>
        {alt}
      </div>
    );
  }

  let eingabe;
  if (t.art === "euro") {
    eingabe = (
      <input
        type="text"
        inputMode="decimal"
        name={`euro:${e.key}`}
        defaultValue={centsAlsEingabe(e.value)}
        placeholder="0,00"
        aria-label={`${t.label} (€)`}
      />
    );
  } else if (t.art === "auswahl" && t.optionen) {
    const optionen = t.optionen.some((o) => o.wert === wert)
      ? t.optionen
      : [...t.optionen, { wert, label: wert }];
    eingabe = (
      <select ref={feld} id={t.anker} name={`wert:${e.key}`} defaultValue={wert} aria-label={t.label}>
        {optionen.map((o) => (
          <option key={o.wert} value={o.wert}>{o.label}</option>
        ))}
      </select>
    );
  } else {
    eingabe = (
      <input
        ref={feld}
        id={t.anker}
        type={feldTyp(e.value_type)}
        name={`wert:${e.key}`}
        defaultValue={wert}
        min={e.value_type === "integer" ? 0 : undefined}
        step={e.value_type === "time" ? 900 : undefined}
        aria-label={t.label}
      />
    );
  }
  // Für die Prüfung vor dem Speichern (einstellungsEingabeFehler)
  const typ = <input type="hidden" name={`typ:${e.key}`} value={e.value_type} />;

  return (
    <label className="einstellung">
      <span className="titel">{t.art === "euro" ? `${t.label} (€)` : t.label}</span>
      {t.beschreibung && <span className="beschreibung">{t.beschreibung}</span>}
      {eingabe}
      {alt}
      {typ}
    </label>
  );
}

/**
 * onSubmit statt `<form action>`: React 19 setzt ein Formular nach jeder
 * Action zurück, auch wenn sie {ok:false} meldet - dann wären alle Eingaben
 * weg. So bleiben sie stehen. Nach einem Erfolg baut `stand` die Felder neu
 * auf, damit sie die gespeicherten Werte zeigen (etwa "17,50" statt "17,5").
 */
function useSpeichern() {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [stand, setStand] = useState(0);
  const [laeuft, starte] = useTransition();

  function abschicken(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    starte(async () => {
      const e = await einstellungenSpeichern(fd);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) setStand((n) => n + 1);
    });
  }

  const hinweis = meldung && (
    <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
      {meldung.text}
    </div>
  );
  return { abschicken, stand, laeuft, hinweis };
}

function Felder({ eintraege }: { eintraege: Einstellung[] }) {
  return (
    <div className="liste-gruppe einstellungs-felder">
      {eintraege.map((e) => <EinstellungsFeld key={e.key} e={e} />)}
    </div>
  );
}

/**
 * Eine gruppierte Karte je Themengruppe, jede mit eigenem Formular und eigener
 * Rückmeldung; die Felder stehen als Zeilen darin, das Eingabefeld rechts.
 *
 * Getrennt statt ein großes Formular über alles: wer die Schließzeit ändert,
 * soll nicht versehentlich die Gläubiger-ID mit abschicken.
 */
export function EinstellungsGruppe({
  titel, text, eintraege,
}: {
  titel: string;
  text: string;
  eintraege: Einstellung[];
}) {
  const { abschicken, stand, laeuft, hinweis } = useSpeichern();

  return (
    <section className="liste-abschnitt einstellungen" aria-label={titel}>
      <Gruppenkopf titel={titel} />
      <p className="unterzeile">{text}</p>
      {hinweis}

      <form key={stand} onSubmit={abschicken}>
        <Felder eintraege={eintraege} />
        <button className="knopf" disabled={laeuft}>
          {laeuft ? "Wird gespeichert…" : "Speichern"}
        </button>
      </form>
    </section>
  );
}

/**
 * Mehrere Gruppen in einem Formular mit einem Knopf am Ende (Systemseite,
 * U12). Dort stehen lauter kleine, unabhängige Werte; drei Knöpfe ließen
 * offen, welcher was speichert. Gespeichert wird ohnehin nur, was sich
 * geändert hat.
 */
export function EinstellungsFormular({
  gruppen,
}: {
  gruppen: { titel: string; text: string; eintraege: Einstellung[] }[];
}) {
  const { abschicken, stand, laeuft, hinweis } = useSpeichern();

  return (
    <form key={stand} onSubmit={abschicken} className="einstellungs-formular">
      <div className="einstellungs-raster">
        {gruppen.map((g) => (
          <section key={g.titel} className="liste-abschnitt einstellungen" aria-label={g.titel}>
            <Gruppenkopf titel={g.titel} />
            <p className="unterzeile">{g.text}</p>
            <Felder eintraege={g.eintraege} />
          </section>
        ))}
      </div>
      <div className="einstellungs-fuss">
        {hinweis}
        <button className="knopf" disabled={laeuft}>
          {laeuft ? "Wird gespeichert…" : "Alle Änderungen speichern"}
        </button>
      </div>
    </form>
  );
}
