/**
 * Verwaltung: was heute zu tun ist (Entwurf AdminUebersicht,
 * docs/design/clubhaus). Den Stand eines Einzugs rechnet einzug.ts.
 *
 * Reine Darstellung. Ob eine Forderung eingezogen werden darf, entscheidet
 * weiter die Datenbank - keine Frist wird nachgerechnet.
 */

import { formatCents } from "./money";

export type DebitBatchStatus = "draft" | "generated" | "submitted" | "completed";

/** "2026-10-12" -> "12.10.2026" - ohne Date, also ohne Zeitzonenfalle. */
export function isoDateLabel(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}

// ---------------------------------------------------------------------------
// Heute zu tun
// ---------------------------------------------------------------------------

export interface AdminTodoInput {
  /** Heute in Berlin, ISO (YYYY-MM-DD) */
  today: string;
  openApplications: number;
  /**
   * Angekuendigte Forderungen, die in keinem Einzug stecken (aus der alten
   * Kasse, in der Ankuendigung und Lauf getrennt waren), oder null
   */
  notice: {
    count: number;
    totalCents: number;
    /** Der spaeteste angekuendigte Faelligkeitstag, ISO */
    dueDate: string;
    /** Wie die Gruppen heissen, etwa "Jahresbeiträge 2026" */
    groups: string[];
  } | null;
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
      title: "Einzug: Datei erzeugen",
      text: "Die Datei kannst du schon jetzt erzeugen und einreichen. Abgebucht wird erst am Abbuchungstag.",
      action: "Zum Einzug",
      href: input.batchHref,
      urgent: true,
    });
  } else if (input.batchStatus === "generated") {
    liste.push({
      key: "lauf-einreichen",
      title: "Lastschriftdatei einreichen",
      text: "Die Datei im Onlinebanking hochladen und danach im Einzug vermerken.",
      action: "Zum Einzug",
      href: input.batchHref,
      urgent: true,
    });
  } else if (input.notice) {
    const { count, totalCents, dueDate, groups } = input.notice;
    liste.push({
      key: "ankuendigung",
      title: `${count === 1 ? "1 angekündigte Forderung" : `${count} angekündigte Forderungen`} ohne Einzug`,
      text: `${groups.join(", ")}: ${formatCents(totalCents)}, angekündigt zum ${isoDateLabel(dueDate)}, aber in keinem Einzug – abgebucht wird so nichts. Ein neuer Einzug kündigt sie mit seinem Abbuchungstag erneut an.`,
      action: "Einzug vorbereiten",
      href: "/admin/kasse/einzug",
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
