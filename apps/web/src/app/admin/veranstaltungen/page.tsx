import Link from "next/link";
import {
  EVENT_KIND_LABEL, EVENT_KIND_TON, eventDatumKachel, eventListenText, eventPlaetzeText, eventReiter,
  eventStatusMarke, eventTodos, type EventReiter,
} from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { alsEvent } from "@/lib/veranstaltungen";
import { Gruppenkopf, Listenzeile } from "@/components/Listenzeile";
import { BereichSegmente } from "@/components/BereichSegmente";
import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";
import { Leerzustand } from "@/components/Leerzustand";

export const dynamic = "force-dynamic";

const REITER: { wert: EventReiter; label: string }[] = [
  { wert: "kommend", label: "Kommend" },
  { wert: "entwuerfe", label: "Entwürfe" },
  { wert: "vergangen", label: "Vergangen" },
];

/**
 * Veranstaltungen in der Verwaltung (Entwurf AdminListe)
 *
 * Oben, was zu tun ist (einziehen, Stunden gutschreiben), darunter je Reiter
 * die Veranstaltungen. Abgeschlossen ist keine Spalte, sondern das Datum: in
 * welchem Reiter etwas steht, rechnet eventReiter.
 */
export default async function VeranstaltungenSeite({
  searchParams,
}: {
  searchParams: Promise<{ reiter?: string }>;
}) {
  const { reiter: reiterParam } = await searchParams;
  const reiter: EventReiter = REITER.some((r) => r.wert === reiterParam)
    ? (reiterParam as EventReiter)
    : "kommend";

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("event_verwaltung");
  const jetzt = new Date();
  const alle = (data ?? []).map(alsEvent);

  const todos = eventTodos(alle, jetzt);
  const sichtbar = alle.filter((e) => eventReiter(e, jetzt) === reiter);
  // Vergangenes neueste zuerst, sonst der Reihe nach.
  if (reiter === "vergangen") sichtbar.reverse();
  const anzahl = (r: EventReiter) => alle.filter((e) => eventReiter(e, jetzt) === r).length;

  return (
    <div className="verwaltung veranstaltungen">
      <VerwaltungsKopf
        titel="Veranstaltungen"
        unterzeile="Arbeitsdienste, Feste und Termine – mit Anmeldung, Gebühr und Stunden."
      >
        {/* Wie die Anlegen-Knöpfe der anderen Bereiche (FensterKnopf, U63) */}
        <Link className="knopf gold" href="/admin/veranstaltungen/neu">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
          <span className="text-lang">Veranstaltung anlegen</span>
          <span className="text-kurz">Anlegen</span>
        </Link>
      </VerwaltungsKopf>

      {error && <div className="hinweis fehler">Die Veranstaltungen ließen sich nicht laden.</div>}

      {todos.length > 0 && (
        <section className="liste-abschnitt" aria-labelledby="h-zutun">
          <Gruppenkopf titel="Zu tun" id="h-zutun" />
          <ul className="liste-gruppe zu-tun" aria-label="Zu tun">
            {todos.map((t) => {
              const e = alle.find((x) => x.id === t.eventId)!;
              const k = eventDatumKachel(e.starts_at);
              return (
                <li key={t.key}>
                  <Listenzeile
                    href={`/admin/veranstaltungen/${t.eventId}`}
                    symbol={<DatumKachel tag={k.tag} monat={k.monat} vorbei />}
                    punkt="dringend"
                    titel={t.title}
                    kontext={t.text}
                    hinweis={t.marke}
                    hinweisTon="gold"
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Derselbe Segmentschalter wie in Kasse, Mitgliedern und Plätzen (U63) */}
      <BereichSegmente
        label="Veranstaltungen"
        aktiv={`/admin/veranstaltungen?reiter=${reiter}`}
        eintraege={REITER.map((r) => ({
          href: `/admin/veranstaltungen?reiter=${r.wert}`,
          label: `${r.label} (${anzahl(r.wert)})`,
        }))}
      />

      <section className="liste-abschnitt" aria-label={REITER.find((r) => r.wert === reiter)!.label}>
        {sichtbar.length === 0 ? (
          <Leerzustand
            text={
              reiter === "entwuerfe"
                ? "Keine Entwürfe."
                : reiter === "vergangen" ? "Noch keine vergangenen Veranstaltungen." : "Nichts geplant."
            }
            aktion={reiter === "vergangen" ? undefined : { href: "/admin/veranstaltungen/neu", label: "Veranstaltung anlegen" }}
          />
        ) : (
          <ul className="liste-gruppe" aria-label="Veranstaltungen">
            {sichtbar.map((e) => {
              const k = eventDatumKachel(e.starts_at);
              const marke = eventStatusMarke(e, jetzt);
              return (
                <li key={e.id}>
                  <Listenzeile
                    href={`/admin/veranstaltungen/${e.id}`}
                    symbol={<DatumKachel tag={k.tag} monat={k.monat} vorbei={reiter === "vergangen"} />}
                    titel={
                      <>
                        <span className={`marke-klein ${EVENT_KIND_TON[e.kind]}`}>{EVENT_KIND_LABEL[e.kind]}</span>{" "}
                        {e.title}
                      </>
                    }
                    kontext={eventListenText(e)}
                    neben={
                      <span className="neben">
                        {e.registration_enabled ? (
                          <b className="tnum">{eventPlaetzeText(e.personen, e.max_participants)}</b>
                        ) : (
                          <span className="hinweis-rechts leise">ohne Anmeldung</span>
                        )}
                        <span className={`statusmarke ${marke.ton}`}>{marke.text}</span>
                      </span>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function DatumKachel({ tag, monat, vorbei }: { tag: string; monat: string; vorbei?: boolean }) {
  return (
    <span className={`datum-kachel${vorbei ? " vorbei" : ""}`}>
      <b>{tag}</b>
      <small>{monat}</small>
    </span>
  );
}
