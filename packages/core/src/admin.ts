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
    members: number;
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
    /** Mitglieder, die die Datenbank fuer diesen Lauf als einzugsfaehig meldet */
    readyMembers: number;
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
  const { charges, batch } = input;
  const imLauf = batch !== null && batch.itemCount > 0;
  const weiter = batch !== null && batch.status !== "draft";
  const frist = charges.dueDate;

  const erledigt: Record<DebitStepKey, boolean> = {
    forderung: charges.members > 0 || imLauf || weiter,
    // Mit dem Versand ist die Ankuendigung erledigt. Die 14 Tage sind kein
    // eigener Schritt, sondern eine Bedingung an den Faelligkeitstag: Lauf
    // und Datei duerfen sofort entstehen, die Bank bucht erst am
    // angekuendigten Tag ab. Frueher galt der Schritt erst nach Ablauf der
    // Frist als erledigt, und die Kasse zeigte "Vorabankuendigung laeuft",
    // obwohl die Datei laengst erzeugt werden konnte.
    ankuendigung:
      imLauf || weiter || (batch?.readyMembers ?? 0) > 0 ||
      (charges.unannounced === 0 && frist !== null),
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
      charges.members > 0
        ? `${charges.members} ${charges.members === 1 ? "Mitglied" : "Mitglieder"}, ${formatCents(charges.totalCents)}`
        : erledigt.forderung ? "erzeugt" : "Noch keine offene Forderung",
    ankuendigung:
      stand("ankuendigung") === "erledigt"
        ? frist ? `angekündigt zum ${isoDateLabel(frist)}` : "angekündigt"
        : charges.unannounced > 0
          ? `${charges.unannounced} noch nicht angekündigt`
          : "Vorabankündigung je Mitglied",
    lauf: !batch
      ? frist ? `jetzt möglich, Einzug ab ${isoDateLabel(frist)}` : "Noch kein Lauf angelegt"
      : imLauf || weiter
        ? `${batch.itemCount} Posten zum ${isoDateLabel(batch.collectionDate)}`
        : batch.readyMembers > 0
          ? `${batch.readyMembers} ${batch.readyMembers === 1 ? "Mitglied" : "Mitglieder"} einzugsfähig`
          : frist && batch.collectionDate < frist
            ? `Einzug am ${isoDateLabel(batch.collectionDate)} liegt vor dem angekündigten ${isoDateLabel(frist)}`
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

  return { steps, current: aktuell, label: standLabel(aktuell, batch) };
}

function standLabel(aktuell: DebitStepKey | null, batch: DebitFlowInput["batch"]): string {
  switch (aktuell) {
    case null: return "Abgeschlossen";
    case "forderung": return "Keine Forderungen";
    case "ankuendigung": return "Ankündigung offen";
    case "lauf": return batch ? "Auswahl offen" : "Lauf anlegen";
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
  /** Der juengste noch nicht abgeschlossene Lastschriftlauf */
  batchStatus: DebitBatchStatus | null;
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

  // Nach der Ankuendigung ist sofort etwas zu tun: Lauf und Datei duerfen
  // vor Ablauf der Frist entstehen, die Bank bucht erst am angekuendigten Tag
  // ab. Frueher stand hier "Bis dahin ist nichts zu tun", und nach Ablauf der
  // Frist verschwand der Punkt ganz, obwohl noch nichts eingezogen war.
  if (input.batchStatus === "draft") {
    liste.push({
      key: "lauf-datei",
      title: "Lastschriftlauf fertigstellen",
      text: "Mitglieder aufnehmen und die Datei erzeugen. Abgebucht wird erst am Fälligkeitstag.",
      action: "Zum Lauf",
      href: input.batchHref,
      urgent: true,
    });
  } else if (input.batchStatus === "generated") {
    liste.push({
      key: "lauf-einreichen",
      title: "Lastschriftdatei einreichen",
      text: "Die Datei im Onlinebanking hochladen und danach im Lauf vermerken.",
      action: "Zum Lauf",
      href: input.batchHref,
      urgent: true,
    });
  } else if (input.noticeDueDate) {
    liste.push({
      key: "ankuendigung",
      title: "Angekündigte Forderungen einziehen",
      text: `Lastschriftlauf anlegen und die Datei erzeugen – schon jetzt möglich. Abgebucht wird frühestens am ${isoDateLabel(input.noticeDueDate)}.`,
      action: "Lauf anlegen",
      href: "/admin/kasse?abschnitt=lastschrift",
      urgent: true,
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
