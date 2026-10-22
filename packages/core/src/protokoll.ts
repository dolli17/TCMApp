/**
 * Verwaltungsprotokoll (O27): ein Eintrag aus change_log als Satz.
 *
 * Die Datenbank speichert je Eintrag Tabelle, Aktion, die Kennfelder der Zeile
 * (kenn) und bei Ereignissen eine Kennung (ereignis). Hier wird daraus
 * "Kira Kasse hat Forderung „Gastgebühr 12,00 €“ für Max Muster angelegt".
 * Namen zu Kennungen (Mitglieder, Plätze, Beitragsarten ...) liefert der
 * Aufrufer über `name`, weil nur er die Tabellen lesen kann.
 */
import { formatCents } from "./money";

export type ProtokollBereich = "finanzen" | "plaetze" | "mitglieder" | "verein" | "system";

export const PROTOKOLL_BEREICHE: Record<ProtokollBereich, { titel: string; tabellen: string[] }> = {
  finanzen: {
    titel: "Finanzen",
    tabellen: ["charges", "debit_batches", "debit_items", "fee_types", "fee_prices", "billing_periods"],
  },
  plaetze: {
    titel: "Plätze",
    tabellen: ["bookings", "booking_series", "courts", "booking_types"],
  },
  mitglieder: {
    titel: "Mitglieder",
    tabellen: [
      "members",
      "memberships",
      "member_roles",
      "member_fees",
      "bank_accounts",
      "sepa_mandates",
      "member_attribute_values",
      "membership_applications",
      "account_deletion_requests",
    ],
  },
  verein: {
    titel: "Verein",
    tabellen: [
      "events",
      "teams",
      "work_duty_rules",
      "work_duty_settlements",
      "work_duty_entries",
      "drink_items",
      "drink_prices",
      "kiosk_devices",
      "member_attribute_types",
      "member_attribute_options",
    ],
  },
  system: { titel: "System", tabellen: ["settings", "legal_documents"] },
};

export function protokollBereich(tabelle: string): ProtokollBereich | null {
  for (const [bereich, { tabellen }] of Object.entries(PROTOKOLL_BEREICHE)) {
    if (tabellen.includes(tabelle)) return bereich as ProtokollBereich;
  }
  return null;
}

export interface ProtokollEintrag {
  table_name: string;
  row_id?: string | null;
  action: string;
  ereignis?: string | null;
  member_id?: string | null;
  changed_by?: string | null;
  diff?: unknown;
  kenn?: unknown;
}

/** Name zu einer Kennung (Mitglied, Platz, Beitragsart, Getränk, Merkmal, Einzug). */
export type Namen = (id: string) => string | undefined;

type Werte = Record<string, unknown>;

const DATUM = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium" });
const ZEIT = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "medium",
  timeStyle: "short",
});

function text(wert: unknown): string {
  return wert === null || wert === undefined ? "" : String(wert);
}

function zahl(wert: unknown): number | null {
  const n = typeof wert === "number" ? wert : Number(wert);
  return wert === null || wert === undefined || Number.isNaN(n) ? null : n;
}

function euro(wert: unknown): string {
  const n = zahl(wert);
  return n === null ? "" : formatCents(n);
}

/** "2026-10-24" -> "24.10.2026" */
function tag(wert: unknown): string {
  const t = text(wert);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? DATUM.format(new Date(`${t}T12:00:00Z`)) : t;
}

/** Beginn eines tstzrange wie ["2026-10-24 08:00:00+00","2026-10-24 09:00:00+00") */
function beginn(slot: unknown): string {
  const m = /^[[(]"?([^",]+)"?,/.exec(text(slot));
  if (!m?.[1]) return "";
  const d = new Date(m[1].replace(" ", "T").replace(/\+00$/, "Z"));
  return Number.isNaN(d.getTime()) ? "" : ZEIT.format(d);
}

function zitat(wert: string): string {
  return wert ? `„${wert}“` : "";
}

function verbinde(...teile: string[]): string {
  return teile.filter(Boolean).join(" ");
}

/** Was betroffen ist, mit Artikel-freiem Nomen: "Forderung „Gastgebühr 12,00 €“". */
function gegenstand(tabelle: string, k: Werte, name: Namen): string {
  switch (tabelle) {
    case "charges":
      return verbinde("Forderung", zitat(verbinde(text(k.description), euro(k.amount_cents))));
    case "debit_batches":
      return verbinde("Lastschriftlauf", zitat(text(k.title)));
    case "debit_items":
      return verbinde("Lastschriftposten", zitat(verbinde(text(k.mandate_reference), euro(k.amount_cents))));
    case "fee_types":
      return verbinde("Beitragsart", zitat(text(k.name)));
    case "fee_prices":
      return verbinde(
        "Beitragspreis",
        zitat(verbinde(name(text(k.fee_type_id)) ?? "", text(k.valid_from_year), euro(k.amount_cents))),
      );
    case "billing_periods":
      return `Abrechnungszeitraum ${text(k.month)}/${text(k.year)}`;
    case "bookings":
      return verbinde(
        k.kind === "blocking" ? "Sperrung" : "Buchung",
        zitat(text(k.title)),
        name(text(k.court_id)) ?? "",
        beginn(k.slot) ? `am ${beginn(k.slot)}` : "",
      );
    case "booking_series":
      return verbinde("Serie", zitat(text(k.title)));
    case "courts":
      return verbinde("Platz", zitat(text(k.name)));
    case "booking_types":
      return verbinde("Buchungsart", zitat(text(k.name)));
    case "members":
      return verbinde("Mitglied", verbinde(text(k.first_name), text(k.last_name)));
    case "memberships":
      return verbinde("Mitgliedschaft", text(k.number));
    case "member_roles":
      return verbinde("Rolle", zitat(text(k.role)));
    case "member_fees":
      return verbinde("Beitragszuordnung", verbinde(name(text(k.fee_type_id)) ?? "", text(k.year)));
    case "bank_accounts":
      return k.iban_last4 ? `Bankverbindung …${text(k.iban_last4)}` : "Bankverbindung";
    case "sepa_mandates":
      return verbinde("SEPA-Mandat", text(k.reference));
    case "member_attribute_values":
      return verbinde("Merkmal", zitat(name(text(k.attribute_type_id)) ?? ""));
    case "membership_applications":
      return verbinde("Mitgliedsantrag von", verbinde(text(k.first_name), text(k.last_name)));
    case "account_deletion_requests":
      return "Antrag auf Kontolöschung";
    case "events":
      return verbinde("Veranstaltung", zitat(text(k.title)));
    case "teams":
      return verbinde("Mannschaft", zitat(text(k.name)));
    case "work_duty_rules":
      return verbinde(
        "Arbeitsstunden-Regel",
        zitat(verbinde(name(text(k.fee_type_id)) ?? "", text(k.year))),
      );
    case "work_duty_settlements":
      return verbinde("Arbeitsstunden-Abrechnung", text(k.year), euro(k.amount_cents));
    case "work_duty_entries":
      return verbinde(
        k.hours !== undefined ? `${String(k.hours).replace(".", ",")} Arbeitsstunden` : "Arbeitsstunden",
        k.worked_on ? `vom ${tag(k.worked_on)}` : "",
      );
    case "drink_items":
      return verbinde("Getränk", zitat(text(k.name)));
    case "drink_prices":
      return verbinde("Getränkepreis", zitat(verbinde(name(text(k.drink_item_id)) ?? "", euro(k.price_cents))));
    case "kiosk_devices":
      return verbinde("Kiosk-Gerät", zitat(text(k.name)));
    case "member_attribute_types":
      return verbinde("Merkmal", zitat(text(k.name)));
    case "member_attribute_options":
      return verbinde("Merkmalsoption", zitat(text(k.label)));
    case "settings":
      return verbinde("Einstellung", zitat(text(k.label) || text(k.key)));
    case "legal_documents":
      return verbinde("Rechtstext", zitat(text(k.title)), k.version ? `(Fassung ${text(k.version)})` : "");
    default:
      return tabelle;
  }
}

const MEHRZAHL: Record<string, [string, string]> = {
  charges: ["Forderung", "Forderungen"],
  debit_items: ["Lastschriftposten", "Lastschriftposten"],
  bookings: ["Termin", "Termine"],
  work_duty_settlements: ["Abrechnung", "Abrechnungen"],
  sepa_mandates: ["Mandat", "Mandate"],
};

function lauf(k: Werte, ereignis: string, name: Namen): string {
  const einzug = zitat(name(text(k.batch_id)) ?? "");
  switch (ereignis) {
    case "beitragslauf":
      return `im Beitragslauf ${text(k.jahr)}`;
    case "monatsabrechnung":
      return `in der Monatsabrechnung ${text(k.monat)}/${text(k.jahr)}`;
    case "arbeitsstunden_abrechnung":
      return `in der Arbeitsstunden-Abrechnung ${text(k.jahr)}`;
    case "ankuendigung":
      return verbinde("bei der Vorabankündigung", k.faellig ? `(fällig ${tag(k.faellig)})` : "");
    case "einzug_vorbereiten":
      return verbinde("beim Vorbereiten des Einzugs", k.einzug ? `zum ${tag(k.einzug)}` : "");
    case "einzug_ergaenzen":
      return verbinde("beim Ergänzen des Einzugs", einzug);
    case "einzug_datei":
      return verbinde("beim Erzeugen der Lastschriftdatei", einzug ? `für ${einzug}` : "");
    case "einzug_eingereicht":
      return verbinde("beim Einreichen des Einzugs", einzug);
    case "einzug_abgeschlossen":
      return verbinde("beim Abschluss des Einzugs", einzug);
    case "serie_anlegen":
      return verbinde("beim Anlegen der Serie", zitat(text(k.titel)));
    case "serie_aendern":
      return verbinde("beim Ändern der Serie", zitat(name(text(k.series_id)) ?? ""));
    case "serie_beenden":
      return verbinde("beim Beenden der Serie", zitat(name(text(k.series_id)) ?? ""));
    default:
      return `bei „${ereignis}“`;
  }
}

function verb(e: ProtokollEintrag, diff: Werte): string {
  if (e.action === "insert") return "angelegt";
  if (e.action === "delete") return "gelöscht";
  const status = (diff.status as { neu?: unknown } | undefined)?.neu;
  if (e.table_name === "membership_applications") {
    if (status === "accepted") return "angenommen";
    if (status === "declined") return "abgelehnt";
    if (status === "spam") return "als Spam markiert";
  }
  if (e.table_name === "bookings" && status === "cancelled") return "storniert";
  if (e.table_name === "charges" && status === "waived") return "erlassen";
  if (e.table_name === "members" && "login_disabled_at" in diff) {
    return (diff.login_disabled_at as { neu?: unknown }).neu ? "gesperrt" : "wieder freigegeben";
  }
  return "geändert";
}

/**
 * Was geschah, ohne Subjekt: "Forderung „Gastgebühr 12,00 €“ für Max Muster
 * angelegt". Das Protokoll je Mitglied zeigt die handelnde Person in einer
 * eigenen Spalte und braucht nur diesen Teil.
 */
export function protokollVorgang(e: ProtokollEintrag, name: Namen = () => undefined): string {
  const k = (e.kenn ?? {}) as Werte;
  const diff = (e.diff ?? {}) as Werte;
  const person = e.member_id ? name(e.member_id) : undefined;

  if (e.action === "event") {
    const betroffen = person ?? verbinde(text(k.first_name), text(k.last_name));
    if (e.ereignis === "einladung_erneut") return `die Einladung an ${betroffen} erneut gesendet`;
    if (e.ereignis === "passwort_zuruecksetzen") {
      return `${betroffen} einen Link zum Zurücksetzen des Passworts gesendet`;
    }
    const anzahl = zahl(k.anzahl) ?? 0;
    const [eins, viele] = MEHRZAHL[e.table_name] ?? ["Eintrag", "Einträge"];
    const summe = zahl(k.betrag_cents) ? ` (zusammen ${euro(k.betrag_cents)})` : "";
    const was = verb({ ...e, action: text(k.aktion) }, {});
    return `${lauf(k, text(e.ereignis), name)} ${anzahl} ${anzahl === 1 ? eins : viele}${summe} ${was}`;
  }

  if (e.action === "read") {
    // Bisher einzige Lesung im Protokoll: debit_batch_payload gibt die IBANs heraus.
    return verbinde("die Lastschriftdatei", zitat(name(text(e.row_id)) ?? ""), "mit den IBANs erzeugt");
  }

  const fuer =
    person && e.table_name !== "members" && e.member_id !== e.changed_by ? ` für ${person}` : "";
  return `${gegenstand(e.table_name, k, name)}${fuer} ${verb(e, diff)}`;
}

/** Der Eintrag als Satz, mit `wer` als Subjekt. */
export function protokollSatz(e: ProtokollEintrag, wer: string, name: Namen = () => undefined): string {
  return `${wer} hat ${protokollVorgang(e, name)}`;
}

/**
 * Beginn eines Kalendertags in Berlin als Zeitpunkt mit Versatz, für Filter
 * auf changed_at: "2026-10-24" -> "2026-10-24T00:00:00+02:00".
 */
export function berlinTagesbeginn(tag: string): string {
  // Um 0 Uhr UTC gilt in Berlin noch der Versatz der Mitternacht davor, auch
  // an den Tagen der Zeitumstellung (sie liegt nachts zwischen 1 und 3 Uhr UTC).
  const nullUhr = new Date(`${tag}T00:00:00Z`);
  const versatz = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", timeZoneName: "longOffset" })
    .formatToParts(nullUhr)
    .find((t) => t.type === "timeZoneName")?.value;
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(versatz ?? "");
  return `${tag}T00:00:00${m ? `${m[1]}:${m[2] ?? "00"}` : "Z"}`;
}
