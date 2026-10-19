/**
 * Veranstaltungen: Arbeitsdienste, Feste und Termine
 * (Entwurf "Veranstaltungen", AdminListe, AdminDetail, AdminFormular)
 *
 * Reine Darstellung und Formularlogik. Ob jemand sich anmelden darf, ob eine
 * Forderung noch beweglich ist und wer nachrueckt, entscheidet die Datenbank
 * (private.event_forderung_abgleichen, private.event_nachruecken). Hier wird
 * nur dieselbe Regel fuer die Anzeige nachgezeichnet: der Anmeldeschluss,
 * ohne Angabe der Beginn.
 */

import { isoDateLabel } from "./admin";
import { berlinTime } from "./booking";
import { formatCents } from "./money";

export type EventKind = "arbeitsdienst" | "fest" | "termin";
export type EventStatus = "draft" | "published" | "cancelled";
export type EventRegistrationStatus = "registered" | "waitlisted" | "cancelled";

export const EVENT_KINDS: readonly EventKind[] = ["arbeitsdienst", "fest", "termin"];

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  arbeitsdienst: "Arbeitsdienst",
  fest: "Fest",
  termin: "Termin",
};

export type EventTon = "gelb" | "gruen" | "blau" | "grau" | "rot";

export const EVENT_KIND_TON: Record<EventKind, EventTon> = {
  arbeitsdienst: "grau",
  fest: "gelb",
  termin: "blau",
};

export const REGISTRATION_STATUS_LABEL: Record<EventRegistrationStatus, string> = {
  registered: "angemeldet",
  waitlisted: "Warteliste",
  cancelled: "abgemeldet",
};

/** Was Liste und Detail von einer Veranstaltung brauchen (event_verwaltung). */
export interface EventInfo {
  kind: EventKind;
  status: EventStatus;
  starts_at: string;
  ends_at: string | null;
  registration_enabled: boolean;
  registration_deadline: string | null;
  max_participants: number | null;
  fee_cents: number | null;
  work_hours: number | null;
}

export interface EventZahlen {
  anmeldungen: number;
  personen: number;
  warteliste: number;
  forderungen: number;
  forderungen_cents: number;
  im_einzug: number;
  einziehbar: number;
  einziehbar_cents: number;
  anwesend: number;
  gutgeschrieben: number;
}

const BERLIN = "Europe/Berlin";
const WOCHENTAG = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: BERLIN });
const DATUM = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit", month: "2-digit", year: "numeric", timeZone: BERLIN,
});
const DATUM_KURZ = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: BERLIN });
const TAG = new Intl.DateTimeFormat("de-DE", { day: "2-digit", timeZone: BERLIN });
const MONAT_KURZ = new Intl.DateTimeFormat("de-DE", { month: "short", timeZone: BERLIN });
const BERLIN_TAG = new Intl.DateTimeFormat("sv-SE", { timeZone: BERLIN });
const UHR = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: BERLIN });

/** "19:00" -> "19", "23:30" bleibt. */
function uhrText(d: Date): string {
  const t = UHR.format(d);
  return t.endsWith(":00") ? t.slice(0, -3) : t;
}

/** Ab wann die Anmeldung feststeht: Anmeldeschluss, sonst Beginn. */
export function eventSchluss(e: Pick<EventInfo, "registration_deadline" | "starts_at">): string {
  return e.registration_deadline ?? e.starts_at;
}

/** Vorbei ist eine Veranstaltung mit ihrem Ende, ohne Ende mit dem Beginn. */
export function eventVorbei(e: Pick<EventInfo, "starts_at" | "ends_at">, now: Date): boolean {
  return new Date(e.ends_at ?? e.starts_at).getTime() < now.getTime();
}

export function eventBegonnen(e: Pick<EventInfo, "starts_at">, now: Date): boolean {
  return new Date(e.starts_at).getTime() <= now.getTime();
}

export function eventSchlussVorbei(
  e: Pick<EventInfo, "registration_deadline" | "starts_at">, now: Date,
): boolean {
  return new Date(eventSchluss(e)).getTime() <= now.getTime();
}

/** Was eine Anmeldung kostet: Preis pro Person, Begleitpersonen eingerechnet. */
export function eventGebuehrCents(feeCents: number | null | undefined, begleitpersonen: number): number {
  return (feeCents ?? 0) * (1 + Math.max(0, begleitpersonen));
}

export type EventReiter = "kommend" | "entwuerfe" | "vergangen";

/** Entwuerfe fuer sich, sonst nach dem Datum. Abgesagte bleiben, wo ihr Datum sie hinstellt. */
export function eventReiter(e: Pick<EventInfo, "status" | "starts_at" | "ends_at">, now: Date): EventReiter {
  if (e.status === "draft") return "entwuerfe";
  return eventVorbei(e, now) ? "vergangen" : "kommend";
}

export interface EventMarke {
  text: string;
  ton: EventTon;
}

/** Die Statusmarke: "Entwurf", "Anmeldung offen", "Abgeschlossen" … */
export function eventStatusMarke(e: EventInfo, now: Date): EventMarke {
  if (e.status === "draft") return { text: "Entwurf", ton: "grau" };
  if (e.status === "cancelled") return { text: "Abgesagt", ton: "rot" };
  if (eventVorbei(e, now)) return { text: "Abgeschlossen", ton: "gruen" };
  if (eventBegonnen(e, now)) return { text: "Läuft", ton: "gelb" };
  if (!e.registration_enabled) return { text: "Veröffentlicht", ton: "grau" };
  return eventSchlussVorbei(e, now)
    ? { text: "Anmeldung geschlossen", ton: "gelb" }
    : { text: "Anmeldung offen", ton: "blau" };
}

/** Datum fuer die Kachel links: { tag: "06", monat: "Nov" }. */
export function eventDatumKachel(startsAt: string): { tag: string; monat: string } {
  const d = new Date(startsAt);
  return { tag: TAG.format(d), monat: MONAT_KURZ.format(d).replace(".", "") };
}

/**
 * "Fr 06.11.2026 · 19–23:30 Uhr", mehrtaegig "Fr 06.11.2026, 19 Uhr – Sa 07.11.2026, 2 Uhr".
 */
export function eventZeitText(startsAt: string, endsAt: string | null): string {
  const a = new Date(startsAt);
  const tagA = `${WOCHENTAG.format(a).replace(".", "")} ${DATUM.format(a)}`;
  if (!endsAt) return `${tagA} · ${uhrText(a)} Uhr`;
  const b = new Date(endsAt);
  if (BERLIN_TAG.format(a) === BERLIN_TAG.format(b)) {
    return `${tagA} · ${uhrText(a)}–${uhrText(b)} Uhr`;
  }
  const tagB = `${WOCHENTAG.format(b).replace(".", "")} ${DATUM.format(b)}`;
  return `${tagA}, ${uhrText(a)} Uhr – ${tagB}, ${uhrText(b)} Uhr`;
}

/** "06.11." */
export function eventTagKurz(iso: string): string {
  return DATUM_KURZ.format(new Date(iso));
}

/** "14 von 25", ohne Grenze "14 Personen". */
export function eventPlaetzeText(personen: number, max: number | null): string {
  if (max != null) return `${personen} von ${max}`;
  return personen === 1 ? "1 Person" : `${personen} Personen`;
}

/** Stunden deutsch: 3 -> "3", 2.5 -> "2,5". */
export function stundenText(h: number): string {
  return String(Math.round(h * 100) / 100).replace(".", ",");
}

/** Die Unterzeile in der Liste: "Sa 9–13 Uhr · Anlage · 18,00 € p. P. · Anmeldung bis 30.10." */
export function eventListenText(
  e: EventInfo & { location: string | null },
): string {
  const teile: string[] = [eventZeitText(e.starts_at, e.ends_at)];
  if (e.location) teile.push(e.location);
  if (e.fee_cents) teile.push(`${formatCents(e.fee_cents)} p. P.`);
  if (e.kind === "arbeitsdienst" && e.work_hours) teile.push(`${stundenText(e.work_hours)} Std. je Teilnahme`);
  if (e.registration_enabled && e.registration_deadline) {
    teile.push(`Anmeldung bis ${eventTagKurz(e.registration_deadline)}`);
  }
  return teile.join(" · ");
}

// ---------------------------------------------------------------------------
// Staende im Detail
// ---------------------------------------------------------------------------

export type EventSchrittState = "erledigt" | "aktuell" | "offen";

export interface EventSchritt {
  key: "angelegt" | "veroeffentlicht" | "schluss" | "einziehen" | "stunden" | "termin";
  name: string;
  info: string;
  state: EventSchrittState;
}

/**
 * Die vier Staende: angelegt, veroeffentlicht, Anmeldeschluss (bzw. Termin)
 * und was danach zu tun ist - einziehen bei einer Gebuehr, Stunden bei einem
 * Arbeitsdienst, sonst der Termin selbst.
 */
export function eventSchritte(
  e: EventInfo & { created_at: string; published_at: string | null },
  z: Pick<EventZahlen, "forderungen" | "einziehbar" | "im_einzug" | "anwesend" | "gutgeschrieben">,
  now: Date,
): EventSchritt[] {
  const schluss = eventSchluss(e);
  const schlussVorbei = eventSchlussVorbei(e, now);
  const fertig = {
    angelegt: true,
    veroeffentlicht: e.status !== "draft",
    schluss: schlussVorbei,
  };

  const schritte: Omit<EventSchritt, "state">[] = [
    { key: "angelegt", name: "Angelegt", info: `am ${eventTagKurz(e.created_at)}` },
    {
      key: "veroeffentlicht", name: "Veröffentlicht",
      info: e.published_at ? `am ${eventTagKurz(e.published_at)}` : "noch Entwurf",
    },
  ];

  if (e.registration_enabled) {
    schritte.push({
      key: "schluss", name: "Anmeldeschluss",
      info: `${WOCHENTAG.format(new Date(schluss)).replace(".", "")} ${eventTagKurz(schluss)}${
        e.registration_deadline ? "" : " (Beginn)"
      }`,
    });
  } else {
    schritte.push({ key: "termin", name: "Termin", info: eventTagKurz(e.starts_at) });
  }

  let letzterFertig = false;
  if (e.kind === "arbeitsdienst" && e.work_hours) {
    letzterFertig = z.anwesend > 0 && z.gutgeschrieben >= z.anwesend;
    schritte.push({
      key: "stunden", name: "Stunden gutschreiben",
      info: letzterFertig
        ? `${z.gutgeschrieben} gutgeschrieben`
        : eventBegonnen(e, now) ? "Anwesende abhaken" : `ab ${eventTagKurz(e.starts_at)}`,
    });
  } else if (e.fee_cents) {
    letzterFertig = z.forderungen > 0 && z.im_einzug >= z.forderungen;
    schritte.push({
      key: "einziehen", name: "Einziehen",
      info: letzterFertig
        ? "alle Forderungen im Einzug"
        : schlussVorbei
          ? "in der Kasse unter „Einzug vorbereiten“"
          : `ab ${eventTagKurz(schluss)} in der Kasse unter „Einzug vorbereiten“`,
    });
  }

  const istFertig = (k: EventSchritt["key"]): boolean =>
    k === "angelegt" ? fertig.angelegt
      : k === "veroeffentlicht" ? fertig.veroeffentlicht
        : k === "schluss" ? fertig.schluss
          : k === "termin" ? eventVorbei(e, now)
            : letzterFertig;

  const aktuell = e.status === "cancelled" ? null : schritte.find((s) => !istFertig(s.key))?.key ?? null;
  return schritte.map((s) => ({
    ...s,
    state: istFertig(s.key) ? "erledigt" : s.key === aktuell ? "aktuell" : "offen",
  }));
}

// ---------------------------------------------------------------------------
// Zu tun
// ---------------------------------------------------------------------------

export interface EventTodo {
  key: string;
  eventId: string;
  title: string;
  text: string;
  marke: string;
}

/**
 * Was bei den Veranstaltungen wartet: Gebuehren, die eingezogen werden
 * koennen, und Arbeitsdienste, deren Stunden noch nicht gutgeschrieben sind.
 */
export function eventTodos(
  liste: readonly (EventInfo & EventZahlen & { id: string; title: string })[],
  now: Date,
): EventTodo[] {
  const todos: EventTodo[] = [];
  for (const e of liste) {
    if (e.status !== "published") continue;
    if (e.einziehbar > 0) {
      const n = e.einziehbar;
      todos.push({
        key: `einziehen-${e.id}`, eventId: e.id,
        title: `${e.title} · einziehen`,
        text: `${n} ${n === 1 ? "Forderung" : "Forderungen"} über ${formatCents(e.einziehbar_cents)} in der Kasse · Anmeldeschluss vorbei`,
        marke: "Noch nicht eingezogen",
      });
    }
    if (e.kind === "arbeitsdienst" && e.work_hours && eventBegonnen(e, now)) {
      const offen = e.anwesend - e.gutgeschrieben;
      if (offen > 0) {
        todos.push({
          key: `stunden-${e.id}`, eventId: e.id,
          title: `${e.title} · Stunden gutschreiben`,
          text: `${offen} ${offen === 1 ? "Anwesender" : "Anwesende"} ohne Gutschrift · je ${stundenText(e.work_hours)} Std.`,
          marke: "Stunden offen",
        });
      } else if (e.anwesend === 0 && e.anmeldungen > 0 && eventVorbei(e, now)) {
        todos.push({
          key: `abhaken-${e.id}`, eventId: e.id,
          title: `${e.title} · Anwesende abhaken`,
          text: `${e.anmeldungen} angemeldet · je ${stundenText(e.work_hours)} Std.`,
          marke: "Stunden offen",
        });
      }
    }
  }
  return todos;
}

// ---------------------------------------------------------------------------
// Formular
// ---------------------------------------------------------------------------

export interface EventFormular {
  kind: EventKind;
  title: string;
  description: string;
  location: string;
  /** datetime-local in Berliner Zeit: "2026-11-06T19:00" */
  start: string;
  ende: string;
  anmeldung: boolean;
  /** datetime-local oder leer */
  schluss: string;
  plaetze: string;
  begleitung: boolean;
  gebuehr: boolean;
  /** "18,00" */
  preis: string;
  stunden: string;
}

/** Was event_speichern bekommt, ohne Id und Veroeffentlichen. */
export interface EventSpeichernDaten {
  kind: EventKind;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  registrationEnabled: boolean;
  registrationDeadline: string | null;
  maxParticipants: number | null;
  companionsAllowed: boolean;
  feeCents: number | null;
  workHours: number | null;
}

/** "2026-11-06T19:00" in Berliner Zeit -> ISO in UTC (ueber berlinTime, wie bei Buchungen). */
export function berlinLokalZuIso(wert: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(wert.trim());
  if (!m) return null;
  return berlinTime(m[1]!, Number(m[2]) * 60 + Number(m[3])).toISOString();
}

/** ISO -> "2026-11-06T19:00" in Berliner Zeit, fuer datetime-local. */
export function isoZuBerlinLokal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${BERLIN_TAG.format(d)}T${UHR.format(d)}`;
}

function zahl(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** "18,00 €", "18", "18.5" -> Cent; leer -> null; Unsinn -> NaN. */
function preisCents(text: string): number | null {
  const t = text.replace(/€/g, "").replace(/\s/g, "");
  if (t === "") return null;
  if (!/^\d+([.,]\d{1,2})?$/.test(t)) return NaN;
  const [euro, cent = ""] = t.split(/[.,]/);
  return Number(euro) * 100 + Number(cent.padEnd(2, "0"));
}

/**
 * Das Formular pruefen und in die Parameter von event_speichern uebersetzen.
 *
 * Dieselben Regeln wie in der Datenbank, nur frueher: damit ein Tippfehler
 * nicht erst nach dem Absenden auffaellt. Stunden gibt es nur beim
 * Arbeitsdienst, Gebuehr und Plaetze nur mit Anmeldung.
 */
export function eventFormularPruefen(
  f: EventFormular,
): { ok: true; daten: EventSpeichernDaten } | { ok: false; fehler: string } {
  const title = f.title.trim();
  if (!title) return { ok: false, fehler: "Der Titel ist Pflicht." };

  const startsAt = berlinLokalZuIso(f.start);
  if (!startsAt) return { ok: false, fehler: "Bitte den Beginn angeben." };
  const endsAt = f.ende.trim() ? berlinLokalZuIso(f.ende) : null;
  if (f.ende.trim() && !endsAt) return { ok: false, fehler: "Das Ende ist kein gültiger Zeitpunkt." };
  if (endsAt && endsAt < startsAt) return { ok: false, fehler: "Das Ende liegt vor dem Beginn." };

  let registrationDeadline: string | null = null;
  let maxParticipants: number | null = null;
  let feeCents: number | null = null;
  if (f.anmeldung) {
    if (f.schluss.trim()) {
      registrationDeadline = berlinLokalZuIso(f.schluss);
      if (!registrationDeadline) return { ok: false, fehler: "Der Anmeldeschluss ist kein gültiger Zeitpunkt." };
      if (registrationDeadline > startsAt) {
        return { ok: false, fehler: "Der Anmeldeschluss liegt nach dem Beginn." };
      }
    }
    const plaetze = zahl(f.plaetze);
    if (plaetze != null) {
      if (!Number.isInteger(plaetze) || plaetze < 1) {
        return { ok: false, fehler: "Plätze: eine ganze Zahl ab 1, oder leer für unbegrenzt." };
      }
      maxParticipants = plaetze;
    }
    if (f.gebuehr) {
      const cents = preisCents(f.preis);
      if (cents == null || Number.isNaN(cents) || cents <= 0 || cents > 100000) {
        return { ok: false, fehler: "Bitte einen Preis zwischen 0,01 € und 1.000,00 € angeben." };
      }
      feeCents = cents;
    }
  }

  let workHours: number | null = null;
  if (f.kind === "arbeitsdienst" && f.stunden.trim()) {
    const h = zahl(f.stunden);
    if (h == null || Number.isNaN(h) || h <= 0 || h > 24) {
      return { ok: false, fehler: "Die Stunden je Teilnahme müssen zwischen 0,25 und 24 liegen." };
    }
    workHours = h;
  }

  return {
    ok: true,
    daten: {
      kind: f.kind,
      title,
      description: f.description.trim() || null,
      location: f.location.trim() || null,
      startsAt,
      endsAt,
      registrationEnabled: f.anmeldung,
      registrationDeadline,
      maxParticipants,
      companionsAllowed: f.anmeldung && f.begleitung,
      feeCents,
      workHours,
    },
  };
}

/** "18,00" aus Cent, fuer das Preisfeld. */
export function centsZuPreisText(cents: number | null | undefined): string {
  if (!cents) return "";
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface TeilnehmerZeile {
  member_name: string;
  companions: number;
  note: string | null;
  status: EventRegistrationStatus;
  attended: boolean;
  registered_at: string;
  cancelled_at: string | null;
  charge_cents: number | null;
}

function csvFeld(wert: string): string {
  return /[";\n\r]/.test(wert) ? `"${wert.replace(/"/g, '""')}"` : wert;
}

/**
 * Die Teilnehmerliste als CSV fuer Excel: Semikolon, deutsches Komma,
 * BOM vorneweg, damit Umlaute richtig ankommen.
 */
export function teilnehmerCsv(zeilen: readonly TeilnehmerZeile[]): string {
  const kopf = ["Mitglied", "Personen", "Begleitpersonen", "Status", "Bemerkung", "Angemeldet", "Abgemeldet", "Anwesend", "Betrag"];
  const reihen = zeilen.map((z) => [
    z.member_name,
    String(1 + z.companions),
    String(z.companions),
    REGISTRATION_STATUS_LABEL[z.status],
    z.note ?? "",
    isoDateLabel(BERLIN_TAG.format(new Date(z.registered_at))),
    z.cancelled_at ? isoDateLabel(BERLIN_TAG.format(new Date(z.cancelled_at))) : "",
    z.attended ? "ja" : "",
    z.charge_cents != null ? (z.charge_cents / 100).toFixed(2).replace(".", ",") : "",
  ]);
  return "﻿" + [kopf, ...reihen].map((r) => r.map(csvFeld).join(";")).join("\r\n") + "\r\n";
}
