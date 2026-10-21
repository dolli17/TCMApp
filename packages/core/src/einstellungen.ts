/**
 * Einstellungen, wie die Oberflaeche sie zeigt
 *
 * In der Tabelle settings stehen Schluessel wie "booking.guest_fee_cents",
 * Betraege in Cent und Listen als kommagetrennter Text. Das ist fuer die
 * Datenbank richtig, fuer den Vorstand aber nicht lesbar (U12). Hier steht,
 * wie jede bekannte Einstellung heisst, was sie bedeutet und wie sie
 * eingegeben wird. Label und Beschreibung aus der Datenbank gelten nur noch
 * fuer Schluessel, die hier (noch) fehlen.
 *
 * Was gespeichert wird, bleibt dasselbe: Cent und Kommaliste. Umgerechnet
 * wird beim Anzeigen und beim Speichern, die Pruefung bleibt in set_setting.
 */

import type { PainVersion } from "./sepa/types";
import { parseAmountToCents } from "./money";

export type EinstellungsArt =
  /** Ganzzahl, Text, Uhrzeit oder Datum, wie value_type sagt */
  | "einfach"
  /** Betrag in Cent, eingegeben in Euro */
  | "euro"
  /** Kommaliste von Benachrichtigungsarten, als Haekchen */
  | "liste"
  /** Ein Wert aus einer festen Auswahl */
  | "auswahl";

export interface EinstellungsText {
  label: string;
  beschreibung?: string;
  art?: EinstellungsArt;
  optionen?: readonly { wert: string; label: string }[];
}

const PAIN_VERSIONEN: readonly { wert: PainVersion; label: string }[] = [
  { wert: "pain.008.001.08", label: "Aktuelle Fassung (pain.008.001.08)" },
  { wert: "pain.008.001.02", label: "Ältere Fassung (pain.008.001.02)" },
];

export const EINSTELLUNGS_TEXTE: Readonly<Record<string, EinstellungsText>> = {
  "booking.max_open_bookings": {
    label: "Maximale offene Buchungen",
    beschreibung:
      "Wie viele künftige Buchungen ein Mitglied gleichzeitig haben darf. Mitspieler zählen mit. 0 bedeutet unbegrenzt.",
  },
  "booking.lead_days": {
    label: "Buchungsvorlauf in Tagen",
    beschreibung: "Buchbar ist alles innerhalb der nächsten so vielen Tage.",
  },
  "booking.opening_time": {
    label: "Öffnungszeit",
    beschreibung: "Früheste Startzeit einer Buchung.",
  },
  "booking.closing_time": {
    label: "Schließzeit",
    beschreibung: "Späteste Endzeit einer Buchung.",
  },
  "booking.slot_minutes": {
    label: "Buchungsraster in Minuten",
    beschreibung: "Buchungen beginnen nur auf diesem Raster (30 = zur vollen und zur halben Stunde).",
  },
  "booking.display_minutes": {
    label: "Raster der Belegung in Minuten",
    beschreibung: "In welchen Schritten die Belegung Zeilen zeigt. Gebucht wird im feineren Buchungsraster.",
  },
  "booking.guest_fee_cents": {
    label: "Gastgebühr",
    beschreibung:
      "Je Gast, dem buchenden Mitglied berechnet und mit der nächsten Lastschrift eingezogen. 0,00 € = keine Gebühr.",
    art: "euro",
  },
  "notifications.mail_kinds": {
    label: "Auch per E-Mail",
    beschreibung:
      "Diese Benachrichtigungen gehen zusätzlich als E-Mail. Wer bei „E-Mails zu Buchungen“ auf „Alle“ steht, bekommt jede Art.",
    art: "liste",
  },
  "notifications.push_kinds": {
    label: "Auch als Push",
    beschreibung:
      "Diese Benachrichtigungen gehen zusätzlich als Push aufs Telefon. Ein Push darf auch Erfreuliches melden, das als E-Mail nur stören würde.",
    art: "liste",
  },
  "drinks.min_debit_cents": {
    label: "Mindestbetrag Lastschrift",
    beschreibung:
      "Kleinere Beträge werden nicht eingezogen, sondern beim nächsten Einzug mitgenommen. Die Grenze gilt je Zahler über alle offenen Forderungen.",
    art: "euro",
  },
  "drinks.void_window_minutes": {
    label: "Storno-Frist Getränke in Minuten",
    beschreibung: "So lange darf ein Mitglied eine eigene Fehlbuchung selbst zurücknehmen.",
  },
  "sepa.creditor_id": {
    label: "Gläubiger-Identifikationsnummer",
    beschreibung:
      "Aus dem bisherigen Vereinsprogramm eBuSy übernehmen. Sie muss unverändert bleiben, damit die bestehenden Mandate gültig bleiben.",
  },
  "sepa.creditor_iban": {
    label: "IBAN des Vereinskontos",
    beschreibung: "Auf dieses Konto gehen die Lastschriften. Ohne sie lässt sich keine Bankdatei erzeugen.",
  },
  "sepa.creditor_bic": {
    label: "BIC des Vereinskontos",
    beschreibung: "Freiwillig. Innerhalb des SEPA-Raums reicht die IBAN.",
  },
  "sepa.pain_version": {
    label: "Format der Bankdatei",
    beschreibung: "Welche Fassung die Hausbank annimmt. Nur nach Rücksprache mit der Bank ändern.",
    art: "auswahl",
    optionen: PAIN_VERSIONEN,
  },
  "sepa.prenotification_days": {
    label: "Vorabankündigung in Tagen",
    beschreibung: "Pflicht vor jedem Einzug: So viele Tage liegen mindestens zwischen Ankündigung und Abbuchung.",
  },
  "sepa.creditor_name": {
    label: "Name des Zahlungsempfängers",
    beschreibung: "Erscheint auf dem Kontoauszug der Mitglieder.",
  },
  "sepa.mandate_text_version": {
    label: "Fassung des Mandatstexts",
    beschreibung:
      "Nummer des Textes, mit dem Mitglieder ihr SEPA-Mandat online erteilen. Wird erhöht, wenn sich der Text ändert.",
  },
  "fees.annual_run_month": {
    label: "Monat des Beitragslaufs",
    beschreibung: "Der Lauf wird trotzdem von Hand gestartet.",
  },
  "fees.annual_run_day": {
    label: "Tag des Beitragslaufs",
    beschreibung: "Fälligkeitstag der Lastschrift für den Jahresbeitrag.",
  },
  "work_duty.hourly_rate_cents": {
    label: "Stundensatz Arbeitsdienst",
    beschreibung: "Womit nicht geleistete Stunden zum Jahresende abgerechnet werden.",
    art: "euro",
  },
  "privacy.change_log_days": {
    label: "Aufbewahrung des Änderungsprotokolls in Tagen",
    beschreibung: "Ältere Einträge werden beim Aufräumen entfernt. 1095 Tage sind drei Jahre.",
  },
};

/**
 * Die Benachrichtigungsarten (notifications.kind) mit deutschem Namen, in der
 * Reihenfolge, in der die Haekchen stehen.
 */
export const BENACHRICHTIGUNGS_ARTEN: readonly { kind: string; label: string }[] = [
  { kind: "booking_displaced", label: "Buchung wegen Sperre oder Serie aufgehoben" },
  { kind: "booking_cancelled", label: "Buchung storniert" },
  { kind: "booking_moved", label: "Buchung auf anderen Platz umgesetzt" },
  { kind: "booking_added", label: "Als Mitspieler eingetragen" },
  { kind: "booking_removed", label: "Als Mitspieler ausgetragen" },
  { kind: "player_joined", label: "Jemand spielt mit" },
  { kind: "player_left", label: "Mitspieler hat abgesagt" },
  { kind: "event_published", label: "Neue Veranstaltung" },
  { kind: "event_changed", label: "Veranstaltung geändert" },
  { kind: "event_cancelled", label: "Veranstaltung abgesagt" },
  { kind: "event_promoted", label: "Von der Warteliste nachgerückt" },
  { kind: "event_reminder", label: "Erinnerung an eine Veranstaltung" },
  { kind: "charge_announced", label: "Lastschrift angekündigt" },
  { kind: "charge_returned", label: "Lastschrift zurückgekommen" },
  { kind: "application_new", label: "Neuer Aufnahmeantrag (Verwaltung)" },
  { kind: "account_deletion_requested", label: "Kontolöschung beantragt (Verwaltung)" },
];

export function einstellungsText(
  e: { key: string; label: string | null; description: string | null },
): Required<Pick<EinstellungsText, "label" | "art">> & EinstellungsText {
  const bekannt = EINSTELLUNGS_TEXTE[e.key];
  if (bekannt) return { art: "einfach", ...bekannt };
  return {
    label: e.label ?? e.key,
    ...(e.description ? { beschreibung: e.description } : {}),
    art: e.key.endsWith("_cents") ? "euro" : "einfach",
  };
}

/** "a, b,,c" -> ["a", "b", "c"] */
export function listeAusWert(wert: unknown): string[] {
  if (typeof wert !== "string") return [];
  return wert.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Die Haekchen einer Liste: alle bekannten Arten und dazu, was sonst noch im
 * Wert steht. Eine Art, die hier niemand eingetragen hat, faellt so beim
 * Speichern nicht still heraus.
 */
export function listenOptionen(wert: unknown): { kind: string; label: string }[] {
  const bekannt = new Set(BENACHRICHTIGUNGS_ARTEN.map((a) => a.kind));
  const fremd = listeAusWert(wert).filter((k) => !bekannt.has(k));
  return [...BENACHRICHTIGUNGS_ARTEN, ...fremd.map((kind) => ({ kind, label: kind }))];
}

/** 1500 -> "15,00", fuer ein Eingabefeld ohne Waehrungszeichen */
export function centsAlsEingabe(wert: unknown): string {
  const cents = typeof wert === "number" ? wert : Number(wert);
  if (!Number.isInteger(cents)) return "";
  const vorzeichen = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${vorzeichen}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** "15,00" -> "1500"; null, wenn es kein Betrag ist. */
export function euroEingabeAlsCents(eingabe: string): string | null {
  try {
    return String(parseAmountToCents(eingabe));
  } catch {
    return null;
  }
}
