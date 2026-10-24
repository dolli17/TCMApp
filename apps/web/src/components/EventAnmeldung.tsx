"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  eventAbmeldbar, eventAbmeldenKnopf, eventAenderbar, eventAnmeldbar, eventAnmeldenKnopf, eventBegonnen,
  eventGebuehrCents, eventGebuehrHinweis, eventNurWarteliste, eventPersonenText, eventSchlussVorbei,
  eventVorbei, eventWartelisteText, formatCents, type MitgliedEvent,
} from "@tcm/core";
import { abmelden, anmelden, anmeldungAendern } from "@/app/verein/veranstaltungen/aktionen";

const MAX_BEGLEITUNG = 20;

/**
 * Die eigene Anmeldung (Entwurf Detail): anmelden mit Begleitpersonen und
 * Bemerkung, ändern, abmelden, Stand auf der Warteliste.
 *
 * Ob es klappt, entscheidet die Datenbank; die Knöpfe zeigen nur an, was
 * gerade geht, und die Meldung sagt, was daraus geworden ist.
 */
export function EventAnmeldung({
  e, jetztIso, wartePlatz, forderung,
}: {
  e: MitgliedEvent;
  jetztIso: string;
  wartePlatz: number | null;
  forderung: { amount_cents: number; status: string } | null;
}) {
  const router = useRouter();
  const jetzt = new Date(jetztIso);
  // Abgesagt ist abgesagt: dann zaehlt die Anmeldung nicht mehr, es gibt nur den Hinweis.
  const dabei = e.status !== "cancelled" && (e.mein_status === "registered" || e.mein_status === "waitlisted");
  const [begleitung, setBegleitung] = useState(dabei ? e.meine_begleitpersonen ?? 0 : 0);
  const [bemerkung, setBemerkung] = useState(dabei ? e.meine_bemerkung ?? "" : "");
  const [bearbeiten, setBearbeiten] = useState(false);
  const [abmeldenFrage, setAbmeldenFrage] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  function tue(aktion: () => Promise<{ ok: boolean; meldung: string }>, danach?: () => void) {
    starte(async () => {
      const r = await aktion();
      setMeldung({ ok: r.ok, text: r.meldung });
      if (r.ok) {
        danach?.();
        router.refresh();
      }
    });
  }

  const gebuehr = eventGebuehrHinweis(e);
  const hinweis = meldung && (
    <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">{meldung.text}</div>
  );

  const formular = (aendern: boolean) => (
    <form
      className="event-formular"
      onSubmit={(ev) => {
        ev.preventDefault();
        tue(
          () => aendern ? anmeldungAendern(e.id, begleitung, bemerkung) : anmelden(e.id, begleitung, bemerkung),
          () => setBearbeiten(false),
        );
      }}
    >
      {e.companions_allowed && (
        <div className="event-begleitung">
          <span>
            <b>Begleitpersonen</b>
            <small>{e.fee_cents ? `je ${formatCents(e.fee_cents)}` : "Familie, Freunde"}</small>
          </span>
          <div className="zaehler">
            <button
              type="button" aria-label="Eine Begleitperson weniger" disabled={begleitung <= 0}
              onClick={() => setBegleitung((b) => Math.max(0, b - 1))}
            >
              <Zeichen d="M5 12h14" />
            </button>
            <output className="dpl" aria-label={`${begleitung} ${begleitung === 1 ? "Begleitperson" : "Begleitpersonen"}`}>{begleitung}</output>
            <button
              type="button" className={begleitung > 0 ? "gelb" : undefined} aria-label="Eine Begleitperson mehr" disabled={begleitung >= MAX_BEGLEITUNG}
              onClick={() => setBegleitung((b) => Math.min(MAX_BEGLEITUNG, b + 1))}
            >
              <Zeichen d="M12 5v14M5 12h14" />
            </button>
          </div>
        </div>
      )}
      <label className="event-bemerkung">
        <span>Bemerkung</span>
        <input
          value={bemerkung} maxLength={500} placeholder="z. B. vegetarisch"
          onChange={(ev) => setBemerkung(ev.target.value)}
        />
      </label>
      {!aendern && eventNurWarteliste(e, begleitung) && (
        <p className="unterzeile">
          Für {begleitung > 0 ? "euch alle" : "dich"} ist gerade kein Platz frei – du kommst auf die Warteliste
          und rückst automatisch nach, wenn etwas frei wird.
        </p>
      )}
      {/* Was es kostet, steht vor dem Knopf und nicht erst danach. */}
      {!aendern && gebuehr && <p className="unterzeile gebuehr-hinweis">{gebuehr}</p>}
      <button type="submit" className="knopf gold block" disabled={laeuft}>
        {aendern
          ? e.fee_cents && e.mein_status === "registered"
            ? `Änderung sichern · ${formatCents(eventGebuehrCents(e.fee_cents, begleitung))}`
            : "Änderung sichern"
          : eventAnmeldenKnopf(e, begleitung)}
      </button>
      {aendern && (
        <button type="button" className="knopf leise block" onClick={() => setBearbeiten(false)}>
          Abbrechen
        </button>
      )}
    </form>
  );

  // --- Schon dabei -----------------------------------------------------------
  if (dabei) {
    const wartet = e.mein_status === "waitlisted";
    const offen = forderung && ["open", "notified", "returned"].includes(forderung.status);
    return (
      <section className={`karte event-mein ${wartet ? "wartet" : "angemeldet"}`} aria-labelledby="h-mein">
        <h2 id="h-mein" className="dpl">{wartet ? "Du stehst auf der Warteliste" : "Du bist angemeldet"}</h2>
        {hinweis}
        {bearbeiten ? (
          formular(true)
        ) : (
          <>
            <p className="personen">
              <b>{eventPersonenText(e.meine_begleitpersonen ?? 0)}</b>
            </p>
            {wartet ? (
              <p className="unterzeile">{eventWartelisteText(wartePlatz, e.warteliste)}</p>
            ) : forderung ? (
              <p className="betrag">
                <b className="dpl tnum">{formatCents(forderung.amount_cents)}</b>{" "}
                {offen ? "steht in deinem Konto unter „Offen“" : "ist im Einzug"}
              </p>
            ) : null}
            {e.meine_bemerkung && <p className="unterzeile">Bemerkung: {e.meine_bemerkung}</p>}

            {abmeldenFrage ? (
              <div className="event-abmelden-frage">
                <p>
                  {!wartet && e.fee_cents && eventSchlussVorbei(e, jetzt)
                    ? "Der Anmeldeschluss ist vorbei – die Gebühr bleibt trotzdem fällig. Wirklich abmelden?"
                    : "Wirklich abmelden?"}
                </p>
                <button
                  type="button" className="knopf gefahr" disabled={laeuft}
                  onClick={() => tue(() => abmelden(e.id), () => {
                    setAbmeldenFrage(false);
                    setBegleitung(0);
                    setBemerkung("");
                  })}
                >
                  Ja, abmelden
                </button>
                <button type="button" className="knopf leise" onClick={() => setAbmeldenFrage(false)}>Nein</button>
              </div>
            ) : (
              <div className="event-knoepfe">
                {eventAenderbar(e, jetzt) && (
                  <button type="button" className="knopf leise" onClick={() => { setMeldung(null); setBearbeiten(true); }}>
                    Anmeldung ändern
                  </button>
                )}
                {eventAbmeldbar(e, jetzt) && (
                  <button type="button" className="knopf gefahr-leise" onClick={() => setAbmeldenFrage(true)}>
                    {eventAbmeldenKnopf(e, jetzt)}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>
    );
  }

  // --- Anmelden --------------------------------------------------------------
  if (eventAnmeldbar(e, jetzt)) {
    return (
      <section className="karte event-anmelden" aria-labelledby="h-anmelden">
        <h2 id="h-anmelden" className="dpl">Anmelden</h2>
        {hinweis}
        {formular(false)}
      </section>
    );
  }

  // --- Nichts zu tun ---------------------------------------------------------
  const text = e.status === "cancelled"
    ? "Diese Veranstaltung ist abgesagt."
    : eventVorbei(e, jetzt)
      ? "Diese Veranstaltung ist vorbei."
      : !e.registration_enabled
        ? "Ohne Anmeldung – komm einfach vorbei."
        : eventBegonnen(e, jetzt)
          ? "Die Veranstaltung läuft schon."
          : "Der Anmeldeschluss ist vorbei.";
  return (
    <section className="karte event-anmelden" aria-label="Anmeldung">
      {hinweis}
      <p className="leer-klein">{text}</p>
    </section>
  );
}

function Zeichen({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true" focusable="false">
      <path d={d} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}
