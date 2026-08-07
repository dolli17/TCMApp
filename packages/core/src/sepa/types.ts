/**
 * SEPA-Basislastschrift (CORE)
 *
 * Begriffe, die im Code auftauchen und leicht zu verwechseln sind:
 *
 * - Glaeubiger-ID (Creditor Identifier): identifiziert den Verein, wird bei der
 *   Bundesbank beantragt und gilt dauerhaft. Aendert sie sich, verlieren alle
 *   Mandate ihre Gueltigkeit - deshalb wird sie beim Umzug von eBuSy
 *   unveraendert uebernommen.
 * - Mandatsreferenz: vergibt der Verein selbst, muss zusammen mit der
 *   Glaeubiger-ID eindeutig sein.
 * - Mandatsdatum: Tag der Unterschrift. Wird bei jedem Einzug mitgeschickt.
 * - Sequenztyp: FRST, RCUR, OOFF, FNAL. Seit 2016 kann durchgehend RCUR
 *   verwendet werden.
 */

export type PainVersion = "pain.008.001.02" | "pain.008.001.08";

export type SequenceType = "FRST" | "RCUR" | "OOFF" | "FNAL";

export type MandateScope = "fees_only" | "all_payments";

/**
 * Muss zu public.charge_kind passen. `guest` kam mit der Gastgebuehr dazu und
 * fehlte hier - der Dateierzeuger haette nicht uebersetzt, sobald eine solche
 * Forderung in einen Lauf kommt.
 */
export type ChargeKind = "fee" | "drinks" | "deposit" | "work_duty" | "guest" | "misc";

export interface Creditor {
  /** Name, wie er auf dem Kontoauszug des Mitglieds erscheint. */
  name: string;
  /** Glaeubiger-ID, z.B. DE98ZZZ09999999999 */
  creditorId: string;
  iban: string;
  bic?: string | undefined;
}

export interface Mandate {
  reference: string;
  signedOn: string;      // ISO-Datum
  lastUsedOn?: string | null;
  sequenceType: SequenceType;
  scope: MandateScope;
  status: "active" | "revoked" | "expired";
}

export interface DebtorItem {
  /** Fachliche Kennung der Forderung, landet als EndToEndId in der Datei. */
  endToEndId: string;
  debtorName: string;
  debtorIban: string;
  debtorBic?: string | undefined;
  amountCents: number;
  /** Erscheint als Verwendungszweck auf dem Kontoauszug. */
  remittanceInfo: string;
  kind: ChargeKind;
  mandate: Mandate;
}

export interface DirectDebitBatch {
  messageId: string;
  paymentInfoId: string;
  /** Faelligkeitstag. Muss die Vorlauffrist der Bank einhalten. */
  collectionDate: string;
  creationDateTime: string;
  creditor: Creditor;
  painVersion: PainVersion;
  items: DebtorItem[];
}

export interface ValidationIssue {
  endToEndId: string | null;
  debtorName: string | null;
  severity: "error" | "warning";
  message: string;
}
