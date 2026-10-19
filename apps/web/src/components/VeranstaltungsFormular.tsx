"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  EVENT_KINDS, EVENT_KIND_LABEL, eventFormularPruefen, type EventFormular,
} from "@tcm/core";
import { veranstaltungSpeichern } from "@/app/admin/veranstaltungen/aktionen";

/**
 * Neue Veranstaltung anlegen oder eine bestehende bearbeiten (Entwurf
 * AdminFormular).
 *
 * Geprüft wird zweimal: vorab mit eventFormularPruefen, damit ein Tippfehler
 * sofort auffällt, und verbindlich in event_speichern. Was die Datenbank
 * zusätzlich weiß (wie viele schon angemeldet sind, ob der Anmeldeschluss
 * vorbei ist), meldet sie zurück.
 */
export function VeranstaltungsFormular({
  id,
  anfang,
  entwurf,
  angemeldet = 0,
}: {
  /** null = neu */
  id: string | null;
  anfang: EventFormular;
  /** Noch nicht veröffentlicht: dann gibt es "Als Entwurf speichern" und "Veröffentlichen" */
  entwurf: boolean;
  /** Schon angemeldete Personen, für den Hinweis bei den Plätzen */
  angemeldet?: number;
}) {
  const router = useRouter();
  const [f, setF] = useState<EventFormular>(anfang);
  const [fehler, setFehler] = useState<string | null>(null);
  // Beim Veröffentlichen alle Mitglieder benachrichtigen - Vorgabe an.
  const [benachrichtigen, setBenachrichtigen] = useState(true);
  const [laeuft, starte] = useTransition();

  const setze = <K extends keyof EventFormular>(k: K, v: EventFormular[K]) => setF((alt) => ({ ...alt, [k]: v }));

  function absenden(veroeffentlichen: boolean) {
    const r = eventFormularPruefen(f);
    if (!r.ok) {
      setFehler(r.fehler);
      return;
    }
    setFehler(null);
    starte(async () => {
      const e = await veranstaltungSpeichern(id, r.daten, veroeffentlichen, benachrichtigen);
      if (!e.ok) {
        setFehler(e.meldung);
        return;
      }
      router.push(`/admin/veranstaltungen/${e.id ?? id}`);
      router.refresh();
    });
  }

  return (
    <form
      className="veranstaltungs-formular"
      onSubmit={(e) => {
        e.preventDefault();
        absenden(entwurf);
      }}
    >
      <section className="karte gross abschnitt" aria-labelledby="h-was">
        <h2 id="h-was" className="dpl">Was und wann</h2>
        <fieldset className="art-wahl-veranstaltung">
          <legend>Art</legend>
          <div>
            {EVENT_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={f.kind === k}
                onClick={() => setF((alt) => ({ ...alt, kind: k, gebuehr: k === "arbeitsdienst" && id === null ? false : alt.gebuehr }))}
              >
                {EVENT_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          <span>Titel</span>
          <input value={f.title} onChange={(e) => setze("title", e.target.value)} required maxLength={120} />
        </label>
        <label>
          <span>Beschreibung</span>
          <textarea rows={3} value={f.description} onChange={(e) => setze("description", e.target.value)} />
        </label>
        <div className="formraster">
          <label>
            <span>Beginn</span>
            <input type="datetime-local" value={f.start} onChange={(e) => setze("start", e.target.value)} required />
          </label>
          <label>
            <span>Ende</span>
            <input type="datetime-local" value={f.ende} onChange={(e) => setze("ende", e.target.value)} />
          </label>
          <label>
            <span>Ort</span>
            <input value={f.location} onChange={(e) => setze("location", e.target.value)} />
          </label>
        </div>
      </section>

      <section className="karte gross abschnitt" aria-labelledby="h-anm">
        <h2 id="h-anm" className="dpl">Anmeldung</h2>
        <label className="schalter">
          <input type="checkbox" checked={f.anmeldung} onChange={(e) => setze("anmeldung", e.target.checked)} />
          <span>Mitglieder melden sich an</span>
        </label>
        {f.anmeldung && (
          <>
            <div className="formraster">
              <label>
                <span>Anmeldeschluss</span>
                <input type="datetime-local" value={f.schluss} onChange={(e) => setze("schluss", e.target.value)} />
                <small>Leer: bis zum Beginn.</small>
              </label>
              <label>
                <span>Plätze höchstens</span>
                <input inputMode="numeric" value={f.plaetze} onChange={(e) => setze("plaetze", e.target.value)} />
                <small>
                  Personen, Begleitpersonen eingerechnet. Leer: unbegrenzt.
                  {angemeldet > 0 ? ` Schon angemeldet: ${angemeldet}.` : ""}
                </small>
              </label>
            </div>
            <label className="schalter">
              <input type="checkbox" checked={f.begleitung} onChange={(e) => setze("begleitung", e.target.checked)} />
              <span>Begleitpersonen erlaubt</span>
            </label>
            <p className="hinweis">
              Ist die Veranstaltung voll, kommen weitere auf die Warteliste und rücken bei einer Absage bis zum
              Anmeldeschluss automatisch nach.
            </p>
          </>
        )}
      </section>

      {f.kind === "arbeitsdienst" && (
        <section className="karte gross abschnitt" aria-labelledby="h-std">
          <h2 id="h-std" className="dpl">Arbeitsdienst</h2>
          <label className="schmal">
            <span>Stunden je Teilnahme</span>
            <input inputMode="decimal" value={f.stunden} onChange={(e) => setze("stunden", e.target.value)} />
          </label>
          <p className="hinweis">
            Nach dem Einsatz hakst du die Anwesenden ab, und mit „Stunden gutschreiben“ landen die Stunden bestätigt
            im Arbeitsdienst.
          </p>
        </section>
      )}

      <section className="karte gross abschnitt" aria-labelledby="h-geb">
        <h2 id="h-geb" className="dpl">Teilnahmegebühr</h2>
        {f.anmeldung ? (
          <>
            <label className="schalter">
              <input type="checkbox" checked={f.gebuehr} onChange={(e) => setze("gebuehr", e.target.checked)} />
              <span>Es wird eine Gebühr fällig</span>
            </label>
            {f.gebuehr && (
              <>
                <label className="schmal">
                  <span>Preis pro Person (€)</span>
                  <input inputMode="decimal" value={f.preis} onChange={(e) => setze("preis", e.target.value)} placeholder="18,00" />
                </label>
                <p className="hinweis">
                  Gilt auch für Begleitpersonen. Jede Anmeldung erzeugt sofort eine Forderung in der Kasse, eine
                  Abmeldung vor dem Anmeldeschluss löscht sie wieder. Ab dem Anmeldeschluss ist sie fest und kann
                  eingezogen werden – wer sich danach abmeldet, zahlt trotzdem.
                </p>
              </>
            )}
          </>
        ) : (
          <p className="unterzeile">Eine Gebühr gibt es nur mit Anmeldung.</p>
        )}
      </section>

      {entwurf ? (
        <label className="schalter">
          <input type="checkbox" checked={benachrichtigen} onChange={(e) => setBenachrichtigen(e.target.checked)} />
          <span>Mitglieder beim Veröffentlichen benachrichtigen</span>
        </label>
      ) : (
        <p className="unterzeile">
          Ändern sich Tag, Uhrzeit oder Ort, bekommen Angemeldete und Wartende eine Nachricht.
        </p>
      )}

      {fehler && <div className="hinweis fehler" role="alert">{fehler}</div>}

      <div className="formular-fuss">
        {entwurf ? (
          <>
            <button type="button" className="knopf leise" disabled={laeuft} onClick={() => absenden(false)}>
              Als Entwurf speichern
            </button>
            <button type="submit" className="knopf gold" disabled={laeuft}>Veröffentlichen</button>
          </>
        ) : (
          <button type="submit" className="knopf gold" disabled={laeuft}>Speichern</button>
        )}
      </div>
    </form>
  );
}
