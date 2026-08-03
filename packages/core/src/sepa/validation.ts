/**
 * Pruefungen vor dem Erzeugen einer Lastschriftdatei
 *
 * Was hier durchrutscht, faellt spaetestens der Bank auf - dann aber als
 * abgelehnte Sammeleinreichung, oft ohne brauchbare Fehlermeldung und mit
 * Gebuehren. Deshalb wird lieber hier abgebrochen.
 */

import { isValidIban, normalizeIban } from "../iban.js";
import type { DirectDebitBatch, DebtorItem, ValidationIssue } from "./types.js";

/** Mandate verfallen, wenn sie 36 Monate lang nicht benutzt wurden. */
export const MANDATE_EXPIRY_MONTHS = 36;

/**
 * Ist das Mandat noch gueltig?
 *
 * Gerechnet wird ab der letzten Nutzung, und wenn es nie benutzt wurde, ab
 * dem Unterschriftsdatum.
 *
 * Der Vergleich laeuft bewusst auf Tagesebene: eine Frist, die von der
 * Tageszeit abhaengt, gaebe es rechtlich nicht. Ohne die Normalisierung waere
 * dasselbe Mandat am Stichtag um neun Uhr noch gueltig und um vierzehn Uhr
 * erloschen, je nachdem wann der Beitragslauf gestartet wird.
 *
 * Am Stichtag selbst ist das Mandat noch gueltig; erloschen ist es ab dem
 * Folgetag.
 */
export function isMandateExpired(
  mandate: { signedOn: string; lastUsedOn?: string | null },
  reference: Date = new Date(),
): boolean {
  const basis = new Date(mandate.lastUsedOn ?? mandate.signedOn);
  if (Number.isNaN(basis.getTime())) return true;

  const grenze = new Date(
    Date.UTC(basis.getUTCFullYear(), basis.getUTCMonth(), basis.getUTCDate()),
  );
  grenze.setUTCMonth(grenze.getUTCMonth() + MANDATE_EXPIRY_MONTHS);

  const heute = Date.UTC(
    reference.getUTCFullYear(),
    reference.getUTCMonth(),
    reference.getUTCDate(),
  );

  return heute > grenze.getTime();
}

/**
 * Deckt das Mandat diese Forderungsart ab?
 *
 * Ein Mandat, dessen Text nur Mitgliedsbeitraege nennt, traegt den monatlichen
 * Getraenkeeinzug nicht. Zieht der Verein trotzdem ein, kann das Mitglied noch
 * 13 Monate lang widersprechen statt der ueblichen 8 Wochen.
 */
export function mandateCoversKind(
  scope: "fees_only" | "all_payments",
  kind: DebtorItem["kind"],
): boolean {
  if (scope === "all_payments") return true;
  return kind === "fee" || kind === "work_duty" || kind === "deposit";
}

export function validateBatch(
  batch: DirectDebitBatch,
  reference: Date = new Date(),
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const add = (
    severity: ValidationIssue["severity"],
    message: string,
    item?: DebtorItem,
  ) =>
    issues.push({
      endToEndId: item?.endToEndId ?? null,
      debtorName: item?.debtorName ?? null,
      severity,
      message,
    });

  // --- Glaeubiger ---
  if (!batch.creditor.creditorId?.trim()) {
    add(
      "error",
      "Die Glaeubiger-Identifikationsnummer fehlt. Sie steht im eBuSy-Backend " +
        "und muss unveraendert uebernommen werden, damit die Bestandsmandate " +
        "gueltig bleiben.",
    );
  } else if (!/^[A-Z]{2}\d{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$/.test(
    batch.creditor.creditorId.replace(/\s/g, "").toUpperCase(),
  )) {
    add("error", `Die Glaeubiger-ID "${batch.creditor.creditorId}" hat kein gueltiges Format.`);
  }

  if (!batch.creditor.name?.trim()) {
    add("error", "Der Name des Zahlungsempfaengers fehlt.");
  }

  if (!isValidIban(batch.creditor.iban)) {
    add("error", "Die IBAN des Vereinskontos ist ungueltig.");
  }

  // --- Faelligkeit ---
  const faellig = new Date(batch.collectionDate);
  if (Number.isNaN(faellig.getTime())) {
    add("error", "Das Faelligkeitsdatum ist ungueltig.");
  } else if (faellig < startOfDay(reference)) {
    add("error", "Das Faelligkeitsdatum liegt in der Vergangenheit.");
  }

  // --- Posten ---
  if (batch.items.length === 0) {
    add("error", "Der Lauf enthaelt keine Posten.");
  }

  const gesehen = new Set<string>();
  for (const item of batch.items) {
    if (item.amountCents <= 0) {
      add("error", "Betrag muss groesser als null sein.", item);
    }
    if (!Number.isInteger(item.amountCents)) {
      add("error", "Betrag muss ganzzahlig in Cent vorliegen.", item);
    }
    if (!isValidIban(item.debtorIban)) {
      add("error", `IBAN von ${item.debtorName} ist ungueltig.`, item);
    }
    if (!item.debtorName?.trim()) {
      add("error", "Name des Zahlungspflichtigen fehlt.", item);
    }
    if (!item.mandate.reference?.trim()) {
      add("error", "Mandatsreferenz fehlt.", item);
    }
    if (item.mandate.status !== "active") {
      add("error", `Mandat von ${item.debtorName} ist ${item.mandate.status}.`, item);
    }
    if (isMandateExpired(item.mandate, reference)) {
      add(
        "error",
        `Mandat von ${item.debtorName} ist seit ueber ${MANDATE_EXPIRY_MONTHS} ` +
          "Monaten ungenutzt und damit erloschen. Es muss neu eingeholt werden.",
        item,
      );
    }
    if (!mandateCoversKind(item.mandate.scope, item.kind)) {
      add(
        "error",
        `Das Mandat von ${item.debtorName} deckt nur Beitraege ab und traegt ` +
          "diesen Einzug nicht. Dafuer wird ein separates Mandat gebraucht.",
        item,
      );
    }
    if (new Date(item.mandate.signedOn) > reference) {
      add("error", `Mandatsdatum von ${item.debtorName} liegt in der Zukunft.`, item);
    }

    // Doppelte Referenz im selben Lauf: die Bank kann Rueckgaben dann nicht
    // eindeutig zuordnen.
    const key = item.mandate.reference.trim().toUpperCase();
    if (gesehen.has(key)) {
      add("error", `Die Mandatsreferenz "${item.mandate.reference}" kommt mehrfach vor.`, item);
    }
    gesehen.add(key);

    if (item.remittanceInfo.length > 140) {
      add("warning", "Der Verwendungszweck wird auf 140 Zeichen gekuerzt.", item);
    }
    if (normalizeIban(item.debtorIban) === normalizeIban(batch.creditor.iban)) {
      add("warning", "Der Zahlungspflichtige hat dieselbe IBAN wie der Verein.", item);
    }
  }

  return issues;
}

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
