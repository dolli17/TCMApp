/**
 * Veranstaltungen fuer Mitglieder (Entwurf "Veranstaltungen": Main, Detail, Home)
 *
 * Liste nach Monat, Kartentexte, Belegung, Betrag und der eigene Anmeldestand
 * - fuer Web und App gleich. Ob die Anmeldung wirklich klappt, entscheiden
 * die RPCs (event_anmelden, event_anmeldung_aendern, event_abmelden); hier
 * steht nur, was die Oberflaeche anbietet und wie sie es sagt.
 */

import { formatCents } from "./money";
import {
  eventBegonnen, eventGebuehrCents, eventSchluss, eventSchlussVorbei, eventTagKurz, eventVorbei, stundenText,
  type EventInfo, type EventRegistrationStatus, type EventTon,
} from "./veranstaltungen";

/** Eine Zeile aus events_fuer_mitglied. */
export interface MitgliedEvent extends EventInfo {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  companions_allowed: boolean;
  personen: number;
  warteliste: number;
  mein_status: EventRegistrationStatus | null;
  meine_begleitpersonen: number | null;
  meine_bemerkung: string | null;
}

const BERLIN = "Europe/Berlin";
const BERLIN_TAG = new Intl.DateTimeFormat("sv-SE", { timeZone: BERLIN });
const MONAT_JAHR = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: BERLIN });
const WOCHENTAG_KURZ = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: BERLIN });
const LANG = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: BERLIN });
const UHR = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: BERLIN });

function uhr(d: Date): string {
  const t = UHR.format(d);
  return t.endsWith(":00") ? t.slice(0, -3) : t;
}

function uhrSpanne(startsAt: string, endsAt: string | null): string {
  const a = new Date(startsAt);
  if (!endsAt) return `${uhr(a)} Uhr`;
  const b = new Date(endsAt);
  if (BERLIN_TAG.format(a) !== BERLIN_TAG.format(b)) return `ab ${uhr(a)} Uhr`;
  return `${uhr(a)}–${uhr(b)} Uhr`;
}

/** Bin ich dabei (angemeldet oder auf der Warteliste)? */
export function eventIchDabei(e: Pick<MitgliedEvent, "mein_status">): boolean {
  return e.mein_status === "registered" || e.mein_status === "waitlisted";
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------

export interface EventMonat<T> {
  /** "2026-11" */
  schluessel: string;
  /** "November 2026" */
  titel: string;
  events: T[];
}

/**
 * Kommende (bzw. mit vergangen: vergangene) Veranstaltungen nach Monat.
 * Kommendes der Reihe nach, Vergangenes neueste zuerst.
 */
export function eventMonatsGruppen<T extends Pick<MitgliedEvent, "starts_at" | "ends_at" | "status">>(
  liste: readonly T[],
  now: Date,
  vergangen = false,
): EventMonat<T>[] {
  const auswahl = liste
    .filter((e) => e.status !== "draft" && eventVorbei(e, now) === vergangen)
    .sort((a, b) => {
      const d = new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
      return vergangen ? -d : d;
    });
  const gruppen: EventMonat<T>[] = [];
  for (const e of auswahl) {
    const d = new Date(e.starts_at);
    const schluessel = BERLIN_TAG.format(d).slice(0, 7);
    let g = gruppen[gruppen.length - 1];
    if (!g || g.schluessel !== schluessel) {
      g = { schluessel, titel: MONAT_JAHR.format(d), events: [] };
      gruppen.push(g);
    }
    g.events.push(e);
  }
  return gruppen;
}

/** Die naechsten n veroeffentlichten Veranstaltungen fuer die Startseite. */
export function eventDemnaechst<T extends Pick<MitgliedEvent, "starts_at" | "ends_at" | "status">>(
  liste: readonly T[],
  now: Date,
  n = 2,
): T[] {
  return liste
    .filter((e) => e.status === "published" && !eventVorbei(e, now))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, n);
}

/** "Fr 19 Uhr · Clubhaus", "Sa 9–13 Uhr · Anlage". */
export function eventKartenZeit(e: Pick<MitgliedEvent, "starts_at" | "ends_at" | "location">): string {
  const tag = WOCHENTAG_KURZ.format(new Date(e.starts_at)).replace(".", "");
  const zeit = `${tag} ${uhrSpanne(e.starts_at, e.ends_at)}`;
  return e.location ? `${zeit} · ${e.location}` : zeit;
}

/** Freie Plaetze, ohne Grenze null. */
export function eventFrei(e: Pick<MitgliedEvent, "max_participants" | "personen">): number | null {
  if (e.max_participants == null) return null;
  return Math.max(0, e.max_participants - e.personen);
}

function plaetzeFreiText(frei: number): string {
  if (frei === 0) return "ausgebucht · Warteliste";
  return `noch ${frei} ${frei === 1 ? "Platz" : "Plätze"} frei`;
}

/**
 * Die fette Zeile der Karte:
 * "18,00 € p. P. · noch 18 Plätze frei", "3 Std. Arbeitsdienst · 14 von 25 Plätzen",
 * "Ohne Anmeldung", "15,00 € p. P. · Anmeldung bis 05.12.".
 */
export function eventKartenZeile(e: MitgliedEvent, now: Date): string {
  if (e.status === "cancelled") return "Abgesagt";
  const vorbei = eventVorbei(e, now);

  if (e.kind === "arbeitsdienst" && e.work_hours) {
    const stunden = `${stundenText(e.work_hours)} Std. Arbeitsdienst`;
    if (!e.registration_enabled) return stunden;
    const belegt = e.max_participants != null
      ? `${e.personen} von ${e.max_participants} Plätzen`
      : `${e.personen} angemeldet`;
    return `${stunden} · ${belegt}`;
  }

  if (!e.registration_enabled) return "Ohne Anmeldung";
  const teile: string[] = [];
  if (e.fee_cents) teile.push(`${formatCents(e.fee_cents)} p. P.`);
  if (vorbei) {
    teile.push(e.personen === 1 ? "1 Person war dabei" : `${e.personen} Personen waren dabei`);
  } else if (eventSchlussVorbei(e, now)) {
    teile.push("Anmeldung geschlossen");
  } else {
    // Mit Platzgrenze zaehlt, was frei ist, sonst bis wann man sich anmeldet.
    const frei = eventFrei(e);
    if (frei != null) teile.push(plaetzeFreiText(frei));
    else if (e.registration_deadline) teile.push(`Anmeldung bis ${eventTagKurz(e.registration_deadline)}`);
    else teile.push("Anmeldung offen");
  }
  return teile.join(" · ");
}

export interface MeineMarke {
  text: string;
  ton: EventTon;
}

/**
 * Der eigene Stand als Marke: "Angemeldet · 2", "Warteliste". Mit
 * aufforderung (Startseite) auch "Anmelden", solange es geht.
 */
export function eventMeineMarke(e: MitgliedEvent, now: Date, aufforderung = false): MeineMarke | null {
  if (e.status === "cancelled") return null;
  if (e.mein_status === "registered") {
    const b = e.meine_begleitpersonen ?? 0;
    return { text: b > 0 ? `Angemeldet · ${1 + b}` : "Angemeldet", ton: "gruen" };
  }
  if (e.mein_status === "waitlisted") return { text: "Warteliste", ton: "gelb" };
  if (aufforderung && eventAnmeldbar(e, now)) return { text: "Anmelden", ton: "gelb" };
  return null;
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

/** "Freitag, 6. November · 19–23:30 Uhr" */
export function eventLangeZeit(startsAt: string, endsAt: string | null): string {
  return `${LANG.format(new Date(startsAt))} · ${uhrSpanne(startsAt, endsAt)}`;
}

/** Kann ich mich (noch) anmelden? */
export function eventAnmeldbar(e: MitgliedEvent, now: Date): boolean {
  return e.status === "published" && e.registration_enabled && !eventSchlussVorbei(e, now) && !eventIchDabei(e);
}

/** Begleitpersonen und Bemerkung aendern geht bis zum Anmeldeschluss. */
export function eventAenderbar(e: MitgliedEvent, now: Date): boolean {
  return e.status === "published" && eventIchDabei(e) && !eventSchlussVorbei(e, now);
}

/** Abmelden geht bis zum Beginn - nach dem Anmeldeschluss kostet es trotzdem. */
export function eventAbmeldbar(e: MitgliedEvent, now: Date): boolean {
  return e.status === "published" && eventIchDabei(e) && !eventBegonnen(e, now);
}

/** Wuerde diese Gruppe nur noch auf die Warteliste passen? */
export function eventNurWarteliste(e: MitgliedEvent, begleitpersonen: number): boolean {
  if (e.max_participants == null) return false;
  return e.personen + 1 + Math.max(0, begleitpersonen) > e.max_participants;
}

/** "62 angemeldet · noch 18 frei", ohne Grenze "62 angemeldet". Nur Zahlen, keine Namen. */
export function eventBelegungText(e: Pick<MitgliedEvent, "personen" | "max_participants" | "warteliste">): string {
  const frei = eventFrei(e);
  const teile = [`${e.personen} angemeldet`];
  if (frei != null) teile.push(frei > 0 ? `noch ${frei} frei` : "ausgebucht");
  if (e.warteliste > 0) teile.push(`${e.warteliste} auf der Warteliste`);
  return teile.join(" · ");
}

/** Fuellstand fuer den Balken (0..1), ohne Grenze null. */
export function eventBelegungAnteil(e: Pick<MitgliedEvent, "personen" | "max_participants">): number | null {
  if (!e.max_participants) return null;
  return Math.min(1, e.personen / e.max_participants);
}

/** "Du allein", "Du + 1 Begleitperson", "Du + 2 Begleitpersonen". */
export function eventPersonenText(begleitpersonen: number): string {
  if (begleitpersonen <= 0) return "Du allein";
  return `Du + ${begleitpersonen} ${begleitpersonen === 1 ? "Begleitperson" : "Begleitpersonen"}`;
}

/** Beschriftung des Anmeldeknopfs: "Verbindlich anmelden · 36,00 €", "Auf die Warteliste". */
export function eventAnmeldenKnopf(e: MitgliedEvent, begleitpersonen: number): string {
  if (eventNurWarteliste(e, begleitpersonen)) return "Auf die Warteliste";
  if (!e.fee_cents) return "Anmelden";
  return `Verbindlich anmelden · ${formatCents(eventGebuehrCents(e.fee_cents, begleitpersonen))}`;
}

/** "Abmelden (bis 30.10. kostenlos)", nach dem Schluss "Abmelden (Gebühr bleibt)". */
export function eventAbmeldenKnopf(e: MitgliedEvent, now: Date): string {
  if (!e.fee_cents || e.mein_status === "waitlisted") return "Abmelden";
  return eventSchlussVorbei(e, now)
    ? "Abmelden (Gebühr bleibt)"
    : `Abmelden (bis ${eventTagKurz(eventSchluss(e))} kostenlos)`;
}

/**
 * Der Hinweis zur Gebuehr vor dem Anmelden. Die Forderung entsteht mit der
 * Anmeldung, steht im Konto unter Offen; nach dem Schluss kostet Abmelden
 * trotzdem.
 */
export function eventGebuehrHinweis(e: MitgliedEvent): string | null {
  if (!e.fee_cents) return null;
  const preis = formatCents(e.fee_cents);
  const begleit = e.companions_allowed ? " – auch für jede Begleitperson" : "";
  return `${preis} pro Person${begleit}. Mit der Anmeldung entsteht die Forderung, `
    + "sie steht in deinem Konto unter „Offen“ und wird per Lastschrift eingezogen. "
    + `Bis zum Anmeldeschluss am ${eventTagKurz(eventSchluss(e))} kannst du dich kostenlos abmelden, `
    + "danach kostet die Abmeldung trotzdem.";
}

/** Der Stand auf der Warteliste: "Platz 2 von 3 auf der Warteliste". */
export function eventWartelisteText(platz: number | null, laenge: number): string {
  const wo = platz != null ? `Platz ${platz} von ${Math.max(platz, laenge)}` : "Du stehst";
  return `${wo} auf der Warteliste. Wird ein Platz frei, rückst du bis zum Anmeldeschluss automatisch nach – `
    + "erst dann entsteht eine Forderung.";
}
