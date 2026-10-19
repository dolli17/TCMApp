import Link from "next/link";
import { notFound } from "next/navigation";
import {
  EVENT_KIND_LABEL, EVENT_KIND_TON, einzugGruppeSchluessel, eventBegonnen, eventSchluss, eventSchlussVorbei, eventSchritte,
  eventStatusMarke, eventTagKurz, eventZeitText, formatCents, stundenText, type EventRegistrationStatus,
} from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { alsEvent } from "@/lib/veranstaltungen";
import { Geldweg } from "@/components/Geldweg";
import { TeilnehmerVerwaltung, type TeilnehmerZeileVoll } from "@/components/TeilnehmerVerwaltung";
import { VeranstaltungsAktionen } from "@/components/VeranstaltungsAktionen";

export const dynamic = "force-dynamic";

/**
 * Eine Veranstaltung in der Verwaltung (Entwurf AdminDetail)
 *
 * Stand, Kennzahlen, Teilnehmer mit Anwesenheit und darunter, wohin das Geld
 * bzw. die Stunden gehen. Die Zahlen kommen aus event_verwaltung, die Namen
 * aus event_teilnehmer - beides nur für den Vorstand.
 */
export default async function VeranstaltungSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const [listeRes, teilnehmerRes, mitgliederRes] = await Promise.all([
    supabase.rpc("event_verwaltung"),
    supabase.rpc("event_teilnehmer", { p_event_id: id }),
    supabase
      .from("members")
      .select("id, first_name, last_name")
      .eq("status", "active")
      .order("last_name")
      .order("first_name"),
  ]);

  const zeile = (listeRes.data ?? []).find((z) => z.id === id);
  if (!zeile) notFound();
  const e = alsEvent(zeile);
  const jetzt = new Date();
  const marke = eventStatusMarke(e, jetzt);
  const schritte = eventSchritte(e, e, jetzt);
  const schlussVorbei = eventSchlussVorbei(e, jetzt);
  const dienst = e.kind === "arbeitsdienst" && e.work_hours != null;

  const teilnehmer: TeilnehmerZeileVoll[] = (teilnehmerRes.data ?? []).map((t) => ({
    ...t,
    status: t.status as EventRegistrationStatus,
  }));
  const mitglieder = (mitgliederRes.data ?? []).map((m) => ({
    id: m.id,
    name: `${m.last_name ?? ""}, ${m.first_name ?? ""}`.replace(/^, |, $/g, ""),
  }));

  const unter = [
    eventZeitText(e.starts_at, e.ends_at),
    e.location,
    e.fee_cents ? `${formatCents(e.fee_cents)} pro Person` : null,
    dienst ? `${stundenText(e.work_hours!)} Std. je Teilnahme` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="verwaltung veranstaltung-detail">
      <Link href="/admin/veranstaltungen" className="zurueck">‹ Veranstaltungen</Link>

      <header className="verwaltung-kopf">
        <div>
          <div className="event-marken">
            <span className={`marke-klein ${EVENT_KIND_TON[e.kind]}`}>{EVENT_KIND_LABEL[e.kind]}</span>
            <span className={`statusmarke ${marke.ton}`}>{marke.text}</span>
          </div>
          <h1 className="pagetitle">{e.title}</h1>
          <p className="unterzeile">{unter}</p>
          {zeile.description && <p className="beschreibung">{zeile.description}</p>}
        </div>
        <VeranstaltungsAktionen
          id={id}
          status={e.status}
          loeschbar={e.status === "draft" && teilnehmer.length === 0}
          mitAnmeldung={e.registration_enabled}
        />
      </header>

      <section className="karte gross" aria-label="Stand">
        <Geldweg schritte={schritte} />
      </section>

      {e.registration_enabled && (
        <div className="kennzahlen vier">
          <div className="kennzahl">
            <span className="label">Anmeldungen</span>
            <span className="wert dpl tnum">{e.anmeldungen}</span>
            <span className="info">Mitglieder</span>
          </div>
          <div className="kennzahl">
            <span className="label">Personen</span>
            <span className="wert dpl tnum">
              {e.max_participants != null ? `${e.personen} / ${e.max_participants}` : e.personen}
            </span>
            <span className="info">inkl. {zeile.begleitpersonen} Begleitpersonen</span>
          </div>
          {dienst ? (
            <div className="kennzahl">
              <span className="label">Anwesend</span>
              <span className="wert dpl tnum">{e.anwesend}</span>
              <span className="info">{e.gutgeschrieben} mit Stunden gutgeschrieben</span>
            </div>
          ) : (
            <div className="kennzahl">
              <span className="label">Gebühr</span>
              <span className="wert dpl tnum">{formatCents(e.forderungen_cents)}</span>
              <span className="info">
                {e.fee_cents
                  ? `${e.forderungen} ${e.forderungen === 1 ? "Forderung" : "Forderungen"} in der Kasse`
                  : "keine Gebühr"}
              </span>
            </div>
          )}
          <div className="kennzahl">
            <span className="label">Warteliste</span>
            <span className="wert dpl tnum">{e.warteliste}</span>
            <span className="info">{schlussVorbei ? "rückt nicht mehr nach" : "rückt bei Absage nach"}</span>
          </div>
        </div>
      )}

      {teilnehmerRes.error && <div className="hinweis fehler">Die Teilnehmer ließen sich nicht laden.</div>}

      {(e.registration_enabled || teilnehmer.length > 0) && (
        <TeilnehmerVerwaltung
          eventId={id}
          zeilen={teilnehmer}
          mitglieder={mitglieder}
          begonnen={eventBegonnen(e, jetzt)}
          abgesagt={e.status === "cancelled"}
          mitBegleitung={zeile.companions_allowed}
          mitGebuehr={Boolean(e.fee_cents)}
          stunden={dienst ? e.work_hours : null}
        />
      )}

      {e.fee_cents ? (
        <section className="karte gross forderungen-hinweis" aria-label="Forderungen">
          <div>
            <b>
              {e.forderungen} {e.forderungen === 1 ? "Forderung" : "Forderungen"} über {formatCents(e.forderungen_cents)}{" "}
              {e.forderungen === 1 ? "liegt" : "liegen"} in der Kasse
            </b>
            <p className="unterzeile">
              Jede Anmeldung erzeugt sofort ihre Forderung (Art „Veranstaltung“, Begleitpersonen inklusive) und
              ändert sie mit.{" "}
              {schlussVorbei
                ? `Seit dem Anmeldeschluss am ${eventTagKurz(eventSchluss(e))} stehen sie fest und erscheinen unter „Einzug vorbereiten“ als Gruppe „${e.title}“.`
                : `Bis zum Anmeldeschluss am ${eventTagKurz(eventSchluss(e))} sind sie noch beweglich, danach fest – dann erscheinen sie unter „Einzug vorbereiten“ als Gruppe „${e.title}“.`}
              {e.im_einzug > 0 ? ` ${e.im_einzug} ${e.im_einzug === 1 ? "steckt" : "stecken"} schon in einem Einzug.` : ""}
            </p>
          </div>
          <Link
            className="knopf leise"
            href={e.einziehbar > 0
              ? `/admin/kasse/einzug?gruppe=${encodeURIComponent(einzugGruppeSchluessel({ kind: "event", period_label: null, ruecklaeufer: false, event_id: id }))}`
              : "/admin/kasse?abschnitt=forderungen"}
          >
            {e.einziehbar > 0 ? "Einzug vorbereiten" : "In der Kasse ansehen"}
          </Link>
        </section>
      ) : null}
    </div>
  );
}
