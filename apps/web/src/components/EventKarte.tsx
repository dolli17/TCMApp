import Link from "next/link";
import {
  EVENT_KIND_LABEL, EVENT_KIND_TON, eventDatumKachel, eventKartenZeile, eventKartenZeit, eventMeineMarke,
  eventVorbei, type MitgliedEvent,
} from "@tcm/core";

/**
 * Eine Veranstaltung als Karte (Entwurf Main und Home): Datumskachel, Art,
 * der eigene Stand, Titel, Zeit und Ort, darunter Preis und Plätze.
 *
 * Mit aufforderung (Startseite) heißt die Marke "Anmelden", solange es geht.
 */
export function EventKarte({
  e, jetzt, aufforderung = false,
}: {
  e: MitgliedEvent;
  jetzt: Date;
  aufforderung?: boolean;
}) {
  const k = eventDatumKachel(e.starts_at);
  const vorbei = eventVorbei(e, jetzt) || e.status === "cancelled";
  const marke = eventMeineMarke(e, jetzt, aufforderung);
  return (
    <Link href={`/verein/veranstaltungen/${e.id}`} className={`event-karte${vorbei ? " vorbei" : ""}`}>
      <span className={`datum-kachel${vorbei ? " vorbei" : ""}`}>
        <b>{k.tag}</b>
        <small>{k.monat}</small>
      </span>
      <span className="event-karte-text">
        <span className="event-marken">
          <span className={`marke-klein ${EVENT_KIND_TON[e.kind]}`}>{EVENT_KIND_LABEL[e.kind]}</span>
          {marke && <span className={`marke-klein ${marke.ton}`}>{marke.text}</span>}
        </span>
        <b className="titel">{e.title}</b>
        <small>{eventKartenZeit(e)}</small>
        <span className="zeile">{eventKartenZeile(e, jetzt)}</span>
      </span>
    </Link>
  );
}
