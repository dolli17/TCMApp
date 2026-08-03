/**
 * pain.008 erzeugen
 *
 * Unterstuetzt zwei Versionen, weil die deutsche Kreditwirtschaft gerade von
 * .02 auf .08 umstellt und beide je nach Bank noch akzeptiert werden. Welche
 * eure Bank beim Upload nimmt, steht in den Einstellungen unter
 * sepa.pain_version - falsch geraten heisst, die Datei wird ohne brauchbare
 * Meldung abgelehnt.
 *
 * Unterschiede zwischen den Versionen, die hier eine Rolle spielen:
 *   .02  Bankleitzahl-Element heisst BIC, Namen max. 70 Zeichen
 *   .08  heisst BICFI, sonst gleiche Struktur an den benutzten Stellen
 */

import { centsToAmountString, sumCents } from "../money";
import { normalizeIban } from "../iban";
import type { DirectDebitBatch, PainVersion } from "./types";
import { hasErrors, validateBatch } from "./validation";

/** XML-Sonderzeichen ersetzen. Umlaute bleiben, die Datei ist UTF-8. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Feld auf die zulaessige Laenge kuerzen und Steuerzeichen entfernen.
 * Zeilenumbrueche in einem Namen wuerden die Datei ungueltig machen.
 */
function field(value: string, maxLength: number): string {
  const clean = value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return escapeXml(clean.slice(0, maxLength));
}

function isoDate(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function isoDateTime(value: string): string {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function painNamespace(version: PainVersion): string {
  return `urn:iso:std:iso:20022:tech:xsd:${version}`;
}

/**
 * Erzeugt die Lastschriftdatei.
 *
 * Bricht ab, wenn die Pruefung Fehler meldet - eine Datei mit einem
 * erloschenen Mandat oder einer falschen IBAN darf gar nicht erst entstehen.
 */
export function buildPain008(
  batch: DirectDebitBatch,
  reference: Date = new Date(),
): string {
  const issues = validateBatch(batch, reference);
  if (hasErrors(issues)) {
    const texte = issues
      .filter((i) => i.severity === "error")
      .map((i) => `- ${i.debtorName ? `${i.debtorName}: ` : ""}${i.message}`)
      .join("\n");
    throw new Error(`Lastschriftdatei kann nicht erzeugt werden:\n${texte}`);
  }

  const v = batch.painVersion;
  const bicTag = v === "pain.008.001.02" ? "BIC" : "BICFI";
  const nameMax = 70;

  const ctrlSum = centsToAmountString(sumCents(batch.items.map((i) => i.amountCents)));
  const anzahl = batch.items.length;

  // Alle Posten teilen sich einen Sequenztyp; gemischte Typen muessten in
  // getrennte PmtInf-Bloecke. Bei durchgehendem RCUR ist das kein Thema.
  const seqTyp = batch.items[0]?.mandate.sequenceType ?? "RCUR";

  const transaktionen = batch.items
    .map((item) => {
      const dbtrAgt = item.debtorBic
        ? `        <DbtrAgt>\n          <FinInstnId>\n            <${bicTag}>${field(item.debtorBic, 11)}</${bicTag}>\n          </FinInstnId>\n        </DbtrAgt>\n`
        : `        <DbtrAgt>\n          <FinInstnId>\n            <Othr>\n              <Id>NOTPROVIDED</Id>\n            </Othr>\n          </FinInstnId>\n        </DbtrAgt>\n`;

      return (
        `      <DrctDbtTxInf>\n` +
        `        <PmtId>\n` +
        `          <EndToEndId>${field(item.endToEndId, 35)}</EndToEndId>\n` +
        `        </PmtId>\n` +
        `        <InstdAmt Ccy="EUR">${centsToAmountString(item.amountCents)}</InstdAmt>\n` +
        `        <DrctDbtTx>\n` +
        `          <MndtRltdInf>\n` +
        `            <MndtId>${field(item.mandate.reference, 35)}</MndtId>\n` +
        `            <DtOfSgntr>${isoDate(item.mandate.signedOn)}</DtOfSgntr>\n` +
        `            <AmdmntInd>false</AmdmntInd>\n` +
        `          </MndtRltdInf>\n` +
        `        </DrctDbtTx>\n` +
        dbtrAgt +
        `        <Dbtr>\n` +
        `          <Nm>${field(item.debtorName, nameMax)}</Nm>\n` +
        `        </Dbtr>\n` +
        `        <DbtrAcct>\n` +
        `          <Id>\n` +
        `            <IBAN>${normalizeIban(item.debtorIban)}</IBAN>\n` +
        `          </Id>\n` +
        `        </DbtrAcct>\n` +
        `        <RmtInf>\n` +
        `          <Ustrd>${field(item.remittanceInfo, 140)}</Ustrd>\n` +
        `        </RmtInf>\n` +
        `      </DrctDbtTxInf>\n`
      );
    })
    .join("");

  const cdtrAgt = batch.creditor.bic
    ? `      <CdtrAgt>\n        <FinInstnId>\n          <${bicTag}>${field(batch.creditor.bic, 11)}</${bicTag}>\n        </FinInstnId>\n      </CdtrAgt>\n`
    : `      <CdtrAgt>\n        <FinInstnId>\n          <Othr>\n            <Id>NOTPROVIDED</Id>\n          </Othr>\n        </FinInstnId>\n      </CdtrAgt>\n`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Document xmlns="${painNamespace(v)}" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n` +
    `  <CstmrDrctDbtInitn>\n` +
    `    <GrpHdr>\n` +
    `      <MsgId>${field(batch.messageId, 35)}</MsgId>\n` +
    `      <CreDtTm>${isoDateTime(batch.creationDateTime)}</CreDtTm>\n` +
    `      <NbOfTxs>${anzahl}</NbOfTxs>\n` +
    `      <CtrlSum>${ctrlSum}</CtrlSum>\n` +
    `      <InitgPty>\n` +
    `        <Nm>${field(batch.creditor.name, nameMax)}</Nm>\n` +
    `      </InitgPty>\n` +
    `    </GrpHdr>\n` +
    `    <PmtInf>\n` +
    `      <PmtInfId>${field(batch.paymentInfoId, 35)}</PmtInfId>\n` +
    `      <PmtMtd>DD</PmtMtd>\n` +
    `      <BtchBookg>true</BtchBookg>\n` +
    `      <NbOfTxs>${anzahl}</NbOfTxs>\n` +
    `      <CtrlSum>${ctrlSum}</CtrlSum>\n` +
    `      <PmtTpInf>\n` +
    `        <SvcLvl>\n` +
    `          <Cd>SEPA</Cd>\n` +
    `        </SvcLvl>\n` +
    `        <LclInstrm>\n` +
    `          <Cd>CORE</Cd>\n` +
    `        </LclInstrm>\n` +
    `        <SeqTp>${seqTyp}</SeqTp>\n` +
    `      </PmtTpInf>\n` +
    `      <ReqdColltnDt>${isoDate(batch.collectionDate)}</ReqdColltnDt>\n` +
    `      <Cdtr>\n` +
    `        <Nm>${field(batch.creditor.name, nameMax)}</Nm>\n` +
    `      </Cdtr>\n` +
    `      <CdtrAcct>\n` +
    `        <Id>\n` +
    `          <IBAN>${normalizeIban(batch.creditor.iban)}</IBAN>\n` +
    `        </Id>\n` +
    `      </CdtrAcct>\n` +
    cdtrAgt +
    `      <ChrgBr>SLEV</ChrgBr>\n` +
    `      <CdtrSchmeId>\n` +
    `        <Id>\n` +
    `          <PrvtId>\n` +
    `            <Othr>\n` +
    `              <Id>${field(batch.creditor.creditorId, 35)}</Id>\n` +
    `              <SchmeNm>\n` +
    `                <Prtry>SEPA</Prtry>\n` +
    `              </SchmeNm>\n` +
    `            </Othr>\n` +
    `          </PrvtId>\n` +
    `        </Id>\n` +
    `      </CdtrSchmeId>\n` +
    transaktionen +
    `    </PmtInf>\n` +
    `  </CstmrDrctDbtInitn>\n` +
    `</Document>\n`
  );
}

/** Dateiname nach dem Muster TCM-Lastschrift-2026-01-15.xml */
export function pain008Filename(batch: DirectDebitBatch): string {
  return `TCM-Lastschrift-${isoDate(batch.collectionDate)}.xml`;
}
