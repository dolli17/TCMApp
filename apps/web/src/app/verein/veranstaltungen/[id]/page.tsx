import Link from "next/link";
import { notFound } from "next/navigation";
import {
  EVENT_KIND_LABEL, EVENT_KIND_TON, eventBelegungAnteil, eventBelegungText, eventLangeZeit, eventSchluss,
  eventStatusMarke, eventTagKurz, eventZeitText, formatCents, stundenText,
} from "@tcm/core";
import { createServerSupabase, getCurrentMember } from "@/lib/supabase/server";
import { alsMitgliedEvent } from "@/lib/veranstaltungen";
import { EventAnmeldung } from "@/components/EventAnmeldung";

export const dynamic = "force-dynamic";

/**
 * Eine Veranstaltung für Mitglieder (Entwurf Detail)
 *
 * Eckdaten, Belegung als Zahl (keine Namen), Beschreibung und darunter die
 * eigene Anmeldung. Der Betrag kommt aus der eigenen Forderung, nicht aus
 * einer Rechnung hier - so steht da, was auch im Konto steht.
 */
export default async function VeranstaltungSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const angemeldet = await getCurrentMember();
  const supabase = await createServerSupabase();

  const [eventRes, platzRes, forderungRes] = await Promise.all([
    supabase.rpc("events_fuer_mitglied").eq("id", id).maybeSingle(),
    supabase.rpc("event_mein_wartelistenplatz", { p_event_id: id }),
    // Ausdrücklich die eigene: ein Admin sähe über RLS auch alle anderen.
    supabase
      .from("charges")
      .select("amount_cents, status")
      .eq("event_id", id)
      .eq("member_id", angemeldet?.member?.id ?? "")
      .neq("status", "waived")
      .maybeSingle(),
  ]);

  if (!eventRes.data) notFound();
  const e = alsMitgliedEvent(eventRes.data);
  const jetzt = new Date();
  const marke = eventStatusMarke(e, jetzt);
  const anteil = eventBelegungAnteil(e);
  const dienst = e.kind === "arbeitsdienst" && e.work_hours != null;

  return (
    <div className="veranstaltung-mitglied">
      {/* Entwurf "Veranstaltung": runder Rückweg, Marke, Titel - ohne farbige Fläche.
          Tag und Uhrzeit stehen in der Tabelle darunter. */}
      <header className="event-kopf">
        <Link href="/verein/veranstaltungen" className="rueck-kreis" aria-label="Zurück zu den Veranstaltungen">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="m14.5 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div className="event-marken">
          <span className={`marke-klein ${EVENT_KIND_TON[e.kind]}`}>{EVENT_KIND_LABEL[e.kind]}</span>
          {(e.status === "cancelled" || marke.text === "Abgeschlossen") && (
            <span className={`marke-klein ${marke.ton}`}>{marke.text}</span>
          )}
        </div>
        <h1 className="pagetitle">{e.title}</h1>
        <p>{eventLangeZeit(e.starts_at, e.ends_at)}</p>
      </header>

      <div className="event-raster">
        <div className="event-haupt">
          <section className="karte eckdaten" aria-label="Eckdaten">
            <dl>
              <div>
                <dt>Wann</dt>
                <dd>{eventZeitText(e.starts_at, e.ends_at)}</dd>
              </div>
              {e.location && (
                <div>
                  <dt>Ort</dt>
                  <dd>{e.location}</dd>
                </div>
              )}
              {e.fee_cents ? (
                <div>
                  <dt>Preis</dt>
                  <dd>
                    <b>{formatCents(e.fee_cents)} pro Person</b>
                    <small>
                      {e.companions_allowed ? "Auch für Begleitpersonen. " : ""}
                      Mit der Anmeldung steht der Betrag in deinem Konto und wird per Lastschrift eingezogen.
                    </small>
                  </dd>
                </div>
              ) : null}
              {dienst && (
                <div>
                  <dt>Stunden</dt>
                  <dd>
                    <b>{stundenText(e.work_hours!)} Std. Arbeitsdienst</b>
                    <small>Werden nach dem Termin für alle Anwesenden gutgeschrieben.</small>
                  </dd>
                </div>
              )}
              {e.registration_enabled && (
                <div>
                  <dt>Anmeldeschluss</dt>
                  <dd>
                    <b>{eventTagKurz(eventSchluss(e))}</b>
                    {e.fee_cents ? <small>Wer sich danach abmeldet, zahlt trotzdem.</small> : null}
                  </dd>
                </div>
              )}
              {e.registration_enabled && (
                <div className="belegung">
                  <dt>Belegung</dt>
                  <dd>
                    <b>{eventBelegungText(e)}</b>
                  </dd>
                  {anteil != null && (
                    <dd className="balken" aria-hidden="true">
                      <i style={{ width: `${Math.round(anteil * 100)}%` }} />
                    </dd>
                  )}
                </div>
              )}
            </dl>
          </section>

          {e.description && (
            <section className="beschreibung event-text" aria-label="Beschreibung">
              <p>{e.description}</p>
            </section>
          )}
        </div>

        <div className="event-seite">
          <EventAnmeldung
            e={e}
            jetztIso={jetzt.toISOString()}
            wartePlatz={platzRes.data ?? null}
            forderung={forderungRes.data ?? null}
          />
        </div>
      </div>
    </div>
  );
}
