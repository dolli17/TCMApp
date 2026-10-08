/**
 * Verwaltung: der Weg des Geldes und was heute zu tun ist
 * (Entwuerfe AdminUebersicht und AdminKasse, docs/design/clubhaus)
 *
 * Reine Darstellung. Ob eine Forderung eingezogen werden darf, entscheidet
 * weiter die Datenbank (debit_batch_candidates, guard_prenotification). Hier
 * wird nur aus dem, was sie liefert, abgelesen, auf welchem Schritt ein Lauf
 * steht - keine Frist wird nachgerechnet.
 */

import { formatCents } from "./money";

export type DebitBatchStatus = "draft" | "generated" | "submitted" | "completed";
export type DebitStepKey = "forderung" | "ankuendigung" | "lauf" | "datei" | "ruecklaeufer";
/** erledigt = gruen, aktuell = gelb, offen = grau */
export type DebitStepState = "erledigt" | "aktuell" | "offen";

export interface DebitStep {
  key: DebitStepKey;
  nr: number;
  name: string;
  info: string;
  state: DebitStepState;
}

export interface DebitFlowInput {
  /** Die Forderungen, um die es geht - im Lauf oder auf dem Weg dorthin. */
  charges: {
    payers: number;
    totalCents: number;
    /** Offen und noch nicht angekuendigt */
    unannounced: number;
    /** Der spaeteste angekuendigte Faelligkeitstag (charges.due_date), ISO */
    dueDate: string | null;
  };
  /** Der Lauf, falls einer angelegt ist */
  batch: {
    status: DebitBatchStatus;
    collectionDate: string;
    itemCount: number;
    /** Zahler, die die Datenbank fuer diesen Lauf als einzugsfaehig meldet */
    readyPayers: number;
    returned: number;
  } | null;
  /** Heute in Berlin, ISO (YYYY-MM-DD) */
  today: string;
}

export interface DebitFlow {
  steps: DebitStep[];
  /** Kurzer Stand fuer die Marke neben dem Titel */
  label: string;
  /** Der aktuelle Schritt, oder null, wenn alles erledigt ist */
  current: DebitStepKey | null;
}

/** "2026-10-12" -> "12.10.2026" - ohne Date, also ohne Zeitzonenfalle. */
export function isoDateLabel(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}

const NAMEN: Record<DebitStepKey, string> = {
  forderung: "Forderung",
  ankuendigung: "Ankündigung",
  lauf: "Lastschriftlauf",
  datei: "Datei",
  ruecklaeufer: "Rückläufer",
};
const REIHE: DebitStepKey[] = ["forderung", "ankuendigung", "lauf", "datei", "ruecklaeufer"];

/**
 * Die fuenf Schritte Forderung -> Ankuendigung -> Lastschriftlauf -> Datei ->
 * Ruecklaeufer. Erledigt ist, was die Daten belegen; der erste nicht erledigte
 * Schritt ist der aktuelle, alle danach sind offen.
 */
export function debitFlow(input: DebitFlowInput): DebitFlow {
  const { charges, batch, today } = input;
  const imLauf = batch !== null && batch.itemCount > 0;
  const weiter = batch !== null && batch.status !== "draft";
  const frist = charges.dueDate;
  const fristLaeuft = frist !== null && frist > today;

  const erledigt: Record<DebitStepKey, boolean> = {
    forderung: charges.payers > 0 || imLauf || weiter,
    // Ist ein Zahler einzugsfaehig oder schon im Lauf, hat die Datenbank die
    // Frist fuer ihn bestaetigt. Ohne Lauf zaehlt der angekuendigte Tag.
    ankuendigung:
      imLauf || weiter || (batch?.readyPayers ?? 0) > 0 ||
      (batch === null && charges.unannounced === 0 && frist !== null && !fristLaeuft),
    lauf: imLauf || weiter,
    datei: weiter,
    ruecklaeufer: batch?.status === "completed",
  };

  const aktuell = REIHE.find((k) => !erledigt[k]) ?? null;
  const stand = (k: DebitStepKey): DebitStepState =>
    aktuell === null || REIHE.indexOf(k) < REIHE.indexOf(aktuell)
      ? "erledigt"
      : k === aktuell ? "aktuell" : "offen";

  const info: Record<DebitStepKey, string> = {
    forderung:
      charges.payers > 0
        ? `${charges.payers} Zahler, ${formatCents(charges.totalCents)}`
        : erledigt.forderung ? "erzeugt" : "Noch keine offene Forderung",
    ankuendigung:
      stand("ankuendigung") === "erledigt"
        ? frist ? `angekündigt zum ${isoDateLabel(frist)}` : "angekündigt"
        : charges.unannounced > 0
          ? `${charges.unannounced} noch nicht angekündigt`
          : frist ? `Frist läuft bis ${isoDateLabel(frist)}` : "Vorabankündigung je Zahler",
    lauf: !batch
      ? frist ? `ab ${isoDateLabel(frist)} möglich` : "Noch kein Lauf angelegt"
      : imLauf || weiter
        ? `${batch.itemCount} Posten zum ${isoDateLabel(batch.collectionDate)}`
        : batch.readyPayers > 0
          ? `${batch.readyPayers} Zahler einzugsfähig`
          : `Einzug am ${isoDateLabel(batch.collectionDate)}`,
    datei:
      batch?.status === "generated" ? "erzeugt, noch nicht eingereicht"
      : weiter ? "erzeugt und eingereicht"
      : "pain.008 fürs Onlinebanking",
    ruecklaeufer:
      (batch?.returned ?? 0) > 0
        ? `${batch!.returned} Rückläufer erfasst`
        : batch?.status === "completed" ? "keine Rückläufer" : "per EndToEndId eintragen",
  };

  const steps = REIHE.map((key, i) => ({ key, nr: i + 1, name: NAMEN[key], info: info[key], state: stand(key) }));

  return { steps, current: aktuell, label: standLabel(aktuell, batch, charges.unannounced, frist) };
}

function standLabel(
  aktuell: DebitStepKey | null,
  batch: DebitFlowInput["batch"],
  unannounced: number,
  frist: string | null,
): string {
  switch (aktuell) {
    case null: return "Abgeschlossen";
    case "forderung": return "Keine Forderungen";
    case "ankuendigung":
      return unannounced > 0 || !frist ? "Ankündigung offen" : "Vorabankündigung läuft";
    case "lauf": return "Auswahl offen";
    case "datei": return "Bereit für die Datei";
    case "ruecklaeufer": return batch?.status === "generated" ? "Datei liegt bereit" : "Eingereicht";
  }
}

// ---------------------------------------------------------------------------
// Heute zu tun
// ---------------------------------------------------------------------------

export interface AdminTodoInput {
  /** Heute in Berlin, ISO (YYYY-MM-DD) */
  today: string;
  openApplications: number;
  /** Angekuendigte Forderungen: der spaeteste Faelligkeitstag, ISO */
  noticeDueDate: string | null;
  /** Wohin "Lauf ansehen" fuehrt */
  batchHref: string;
  /** Zurueckgebuchte Forderungen, die noch offen sind */
  returnedCharges: number;
  /** Getraenkemonate, die noch nicht abgeschlossen sind */
  openDrinkMonths: { year: number; month: number }[];
}

export interface AdminTodo {
  key: string;
  title: string;
  text: string;
  action: string;
  href: string;
  /** true = es muss jemand handeln; false = nur zur Kenntnis */
  urgent: boolean;
}

const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** Wie viele Tage vor Monatsende der laufende Getraenkemonat erwaehnt wird */
export const DRINK_MONTH_NOTICE_DAYS = 3;

/**
 * Nur echte offene Punkte, je mit einem Ziel. Was zu handeln ist, steht
 * vorn; was nur zur Kenntnis ist, danach. Leer heisst: alles erledigt.
 */
export function adminTodos(input: AdminTodoInput): AdminTodo[] {
  const { today } = input;
  const [jahr, monat, tag] = today.split("-").map(Number) as [number, number, number];
  const liste: AdminTodo[] = [];

  if (input.openApplications > 0) {
    const n = input.openApplications;
    liste.push({
      key: "antraege",
      title: n === 1 ? "1 Mitgliedsantrag" : `${n} Mitgliedsanträge`,
      text: "Prüfen, Mitgliedschaft zuordnen, Zugang anlegen.",
      action: "Anträge prüfen",
      href: "/admin/mitglieder/antraege",
      urgent: true,
    });
  }

  if (input.returnedCharges > 0) {
    const n = input.returnedCharges;
    liste.push({
      key: "ruecklaeufer",
      title: n === 1 ? "1 Rückläufer offen" : `${n} Rückläufer offen`,
      text: "Zurückgebuchte Lastschriften klären und den Betrag neu fordern.",
      action: "Rückläufer ansehen",
      href: "/admin/kasse?abschnitt=forderungen&stand=returned",
      urgent: true,
    });
  }

  const vorbei = input.openDrinkMonths
    .filter((p) => p.year * 12 + p.month < jahr * 12 + monat)
    .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  for (const p of vorbei) {
    liste.push({
      key: `getraenke-${p.year}-${p.month}`,
      title: `Getränkemonat ${MONATE[p.month - 1]} abschließen`,
      text: "Der Monat ist vorbei. Abschließen, damit die Abrechnung in den Einzug kann.",
      action: "Zur Getränkeabrechnung",
      href: "/admin/kasse?abschnitt=abrechnen",
      urgent: true,
    });
  }

  if (input.noticeDueDate && input.noticeDueDate > today) {
    liste.push({
      key: "ankuendigung",
      title: "Vorabankündigung läuft",
      text: `Einzug frühestens am ${isoDateLabel(input.noticeDueDate)}. Bis dahin ist nichts zu tun.`,
      action: "Lauf ansehen",
      href: input.batchHref,
      urgent: false,
    });
  }

  const letzter = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  const laufend = input.openDrinkMonths.some((p) => p.year === jahr && p.month === monat);
  if (laufend && letzter - tag < DRINK_MONTH_NOTICE_DAYS) {
    liste.push({
      key: "getraenkemonat",
      title: `Getränkemonat ${MONATE[monat - 1]}`,
      text: `Endet am ${String(letzter).padStart(2, "0")}.${String(monat).padStart(2, "0")}. Danach wird die Abrechnung erzeugt.`,
      action: "Zur Getränkeabrechnung",
      href: "/admin/kasse?abschnitt=abrechnen",
      urgent: false,
    });
  }

  return liste;
}

// ---------------------------------------------------------------------------
// Mitgliedschaft
// ---------------------------------------------------------------------------

export type MemberCategory = "aktiv" | "jugend" | "passiv";

/**
 * Die Beitragsarten eines Jahres grob eingeordnet, fuer die Filter der
 * Mitgliederliste. Beitragsarten legt der Vorstand selbst an; eingeordnet wird
 * deshalb nach Code und Name, nicht nach einer festen Liste. Hat jemand
 * mehrere (etwa Beitrag und Pfand), gewinnt passiv vor Jugend vor aktiv.
 */
export function memberCategory(fees: readonly { code: string; name: string }[]): MemberCategory | null {
  if (fees.length === 0) return null;
  const text = fees.map((f) => `${f.code} ${f.name}`).join(" ").toLowerCase();
  if (/passiv/.test(text)) return "passiv";
  if (/jugend|kind/.test(text)) return "jugend";
  return "aktiv";
}
