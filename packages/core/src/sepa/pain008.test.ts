import { describe, expect, it } from "vitest";
import { buildPain008, escapeXml, painNamespace } from "./pain008";
import {
  hasErrors,
  isMandateExpired,
  mandateCoversKind,
  validateBatch,
} from "./validation";
import { ibanCheckDigits } from "../iban";
import type { DirectDebitBatch, DebtorItem, Mandate } from "./types";

const HEUTE = new Date("2026-08-03T12:00:00Z");

function iban(bban: string): string {
  return `DE${ibanCheckDigits(bban)}${bban}`;
}

const VEREINS_IBAN = iban("600501010405665356");

function mandat(over: Partial<Mandate> = {}): Mandate {
  return {
    reference: "TCM-00001",
    signedOn: "2025-03-01",
    lastUsedOn: "2026-01-15",
    sequenceType: "RCUR",
    scope: "all_payments",
    status: "active",
    ...over,
  };
}

function posten(over: Partial<DebtorItem> = {}): DebtorItem {
  return {
    endToEndId: "TCM-2026-0001",
    debtorName: "Max Mustermann",
    debtorIban: iban("370400440532013000"),
    amountCents: 19000,
    remittanceInfo: "Jahresbeitrag 2026",
    kind: "fee",
    mandate: mandat(),
    ...over,
  };
}

function lauf(over: Partial<DirectDebitBatch> = {}): DirectDebitBatch {
  return {
    messageId: "TCM-MSG-2026-01",
    paymentInfoId: "TCM-PMT-2026-01",
    collectionDate: "2026-09-15",
    creationDateTime: "2026-08-03T12:00:00Z",
    creditor: {
      name: "TC Muckensturm e.V.",
      creditorId: "DE98ZZZ09999999999",
      iban: VEREINS_IBAN,
    },
    painVersion: "pain.008.001.08",
    items: [posten()],
    ...over,
  };
}

describe("escapeXml", () => {
  it("ersetzt die fuenf Sonderzeichen", () => {
    expect(escapeXml(`A & B < C > D " E ' F`)).toBe(
      "A &amp; B &lt; C &gt; D &quot; E &apos; F",
    );
  });

  it("laesst Umlaute stehen", () => {
    // Die Datei ist UTF-8, Umlaute brauchen keine Entity.
    expect(escapeXml("Müller-Lüdenscheidt")).toBe("Müller-Lüdenscheidt");
  });
});

describe("buildPain008", () => {
  it("erzeugt eine Datei mit korrektem Namensraum", () => {
    const xml = buildPain008(lauf(), HEUTE);
    expect(xml).toContain(painNamespace("pain.008.001.08"));
    expect(xml).toContain("<CstmrDrctDbtInitn>");
    expect(xml).toContain("<PmtMtd>DD</PmtMtd>");
    expect(xml).toContain("<Cd>CORE</Cd>");
    expect(xml).toContain("<ChrgBr>SLEV</ChrgBr>");
  });

  it("nimmt in der Fassung .02 das Element BIC, in .08 BICFI", () => {
    const mitBic = { bic: "GENODEF1S02" };
    const alt = buildPain008(
      lauf({
        painVersion: "pain.008.001.02",
        creditor: { ...lauf().creditor, ...mitBic },
      }),
      HEUTE,
    );
    const neu = buildPain008(
      lauf({
        painVersion: "pain.008.001.08",
        creditor: { ...lauf().creditor, ...mitBic },
      }),
      HEUTE,
    );

    expect(alt).toContain("<BIC>GENODEF1S02</BIC>");
    expect(alt).not.toContain("<BICFI>");
    expect(neu).toContain("<BICFI>GENODEF1S02</BICFI>");
  });

  it("setzt NOTPROVIDED, wenn keine BIC vorliegt", () => {
    // Bei IBAN-only ist das der vorgesehene Weg.
    const xml = buildPain008(lauf(), HEUTE);
    expect(xml).toContain("<Id>NOTPROVIDED</Id>");
  });

  it("die Kontrollsumme entspricht der Summe der Posten", () => {
    const xml = buildPain008(
      lauf({
        items: [
          posten({ amountCents: 19000, endToEndId: "A", mandate: mandat({ reference: "R1" }) }),
          posten({ amountCents: 9000, endToEndId: "B", mandate: mandat({ reference: "R2" }) }),
          posten({ amountCents: 5, endToEndId: "C", mandate: mandat({ reference: "R3" }) }),
        ],
      }),
      HEUTE,
    );

    // 190,00 + 90,00 + 0,05 = 280,05
    expect(xml).toContain("<CtrlSum>280.05</CtrlSum>");
    expect(xml).toContain("<NbOfTxs>3</NbOfTxs>");
    // Kopf und Zahlungsblock muessen uebereinstimmen.
    expect(xml.match(/<CtrlSum>280\.05<\/CtrlSum>/g)).toHaveLength(2);
    expect(xml.match(/<NbOfTxs>3<\/NbOfTxs>/g)).toHaveLength(2);
  });

  it("schreibt Betraege mit genau zwei Nachkommastellen", () => {
    const xml = buildPain008(lauf({ items: [posten({ amountCents: 5 })] }), HEUTE);
    expect(xml).toContain('<InstdAmt Ccy="EUR">0.05</InstdAmt>');
  });

  it("maskiert Sonderzeichen im Namen", () => {
    const xml = buildPain008(
      lauf({ items: [posten({ debtorName: "Meyer & Söhne <GmbH>" })] }),
      HEUTE,
    );
    expect(xml).toContain("Meyer &amp; Söhne &lt;GmbH&gt;");
    expect(xml).not.toContain("<GmbH>");
  });

  it("entfernt Zeilenumbrueche aus Feldern", () => {
    // Ein Umbruch im Namen wuerde die Datei ungueltig machen.
    const xml = buildPain008(
      lauf({ items: [posten({ debtorName: "Max\nMustermann" })] }),
      HEUTE,
    );
    expect(xml).toContain("<Nm>Max Mustermann</Nm>");
  });

  it("kuerzt den Verwendungszweck auf 140 Zeichen", () => {
    const lang = "x".repeat(200);
    const xml = buildPain008(lauf({ items: [posten({ remittanceInfo: lang })] }), HEUTE);
    const treffer = xml.match(/<Ustrd>(.*?)<\/Ustrd>/)?.[1] ?? "";
    expect(treffer).toHaveLength(140);
  });

  it("uebernimmt Mandatsreferenz und Mandatsdatum unveraendert", () => {
    // Daran haengt die Gueltigkeit der Bestandsmandate: Glaeubiger-ID,
    // Referenz und Datum muessen exakt so bleiben wie in eBuSy.
    const xml = buildPain008(
      lauf({
        items: [posten({ mandate: mandat({ reference: "SEPA-0005", signedOn: "2023-04-11" }) })],
      }),
      HEUTE,
    );
    expect(xml).toContain("<MndtId>SEPA-0005</MndtId>");
    expect(xml).toContain("<DtOfSgntr>2023-04-11</DtOfSgntr>");
    expect(xml).toContain("<Id>DE98ZZZ09999999999</Id>");
  });

  it("normalisiert IBANs mit Leerzeichen", () => {
    const mitLuecken = "DE89 3704 0044 0532 0130 00";
    const xml = buildPain008(lauf({ items: [posten({ debtorIban: mitLuecken })] }), HEUTE);
    expect(xml).toContain("<IBAN>DE89370400440532013000</IBAN>");
  });
});

describe("Abbruchbedingungen", () => {
  it("bricht ohne Glaeubiger-ID ab", () => {
    expect(() =>
      buildPain008(lauf({ creditor: { ...lauf().creditor, creditorId: "" } }), HEUTE),
    ).toThrow(/Glaeubiger-Identifikationsnummer fehlt/);
  });

  it("bricht bei ungueltiger IBAN ab", () => {
    expect(() =>
      buildPain008(lauf({ items: [posten({ debtorIban: "DE00000000000000000000" })] }), HEUTE),
    ).toThrow(/ungueltig/);
  });

  it("bricht bei erloschenem Mandat ab", () => {
    expect(() =>
      buildPain008(
        lauf({
          items: [
            posten({ mandate: mandat({ signedOn: "2020-01-01", lastUsedOn: "2021-01-01" }) }),
          ],
        }),
        HEUTE,
      ),
    ).toThrow(/36/);
  });

  it("bricht ab, wenn das Mandat den Einzug nicht deckt", () => {
    expect(() =>
      buildPain008(
        lauf({ items: [posten({ kind: "drinks", mandate: mandat({ scope: "fees_only" }) })] }),
        HEUTE,
      ),
    ).toThrow(/separates Mandat/);
  });

  it("bricht bei doppelter Mandatsreferenz ab", () => {
    // Genau der Fall, den der eBuSy-Bestand 113 mal enthaelt.
    expect(() =>
      buildPain008(
        lauf({
          items: [
            posten({ endToEndId: "A", mandate: mandat({ reference: "SEPA-0005" }) }),
            posten({ endToEndId: "B", mandate: mandat({ reference: "SEPA-0005" }) }),
          ],
        }),
        HEUTE,
      ),
    ).toThrow(/mehrfach/);
  });

  it("bricht bei leerem Lauf ab", () => {
    expect(() => buildPain008(lauf({ items: [] }), HEUTE)).toThrow(/keine Posten/);
  });

  it("bricht bei Betrag null ab", () => {
    expect(() =>
      buildPain008(lauf({ items: [posten({ amountCents: 0 })] }), HEUTE),
    ).toThrow(/groesser als null/);
  });

  it("bricht bei Faelligkeit in der Vergangenheit ab", () => {
    expect(() =>
      buildPain008(lauf({ collectionDate: "2020-01-01" }), HEUTE),
    ).toThrow(/Vergangenheit/);
  });
});

describe("isMandateExpired", () => {
  it("rechnet ab der letzten Nutzung", () => {
    expect(
      isMandateExpired({ signedOn: "2015-01-01", lastUsedOn: "2026-01-15" }, HEUTE),
    ).toBe(false);
  });

  it("rechnet ab der Unterschrift, wenn nie benutzt", () => {
    // Die 49 Mandate im Bestand ohne lastUsedDate fallen in diesen Fall.
    expect(isMandateExpired({ signedOn: "2026-01-01", lastUsedOn: null }, HEUTE)).toBe(false);
    expect(isMandateExpired({ signedOn: "2022-01-01", lastUsedOn: null }, HEUTE)).toBe(true);
  });

  it("die Grenze liegt bei genau 36 Monaten", () => {
    expect(isMandateExpired({ signedOn: "2023-08-03", lastUsedOn: null }, HEUTE)).toBe(false);
    expect(isMandateExpired({ signedOn: "2023-08-02", lastUsedOn: null }, HEUTE)).toBe(true);
  });
});

describe("mandateCoversKind", () => {
  it("all_payments deckt alles", () => {
    for (const kind of ["fee", "drinks", "deposit", "work_duty", "misc"] as const) {
      expect(mandateCoversKind("all_payments", kind)).toBe(true);
    }
  });

  it("fees_only deckt keine Getraenke", () => {
    expect(mandateCoversKind("fees_only", "fee")).toBe(true);
    expect(mandateCoversKind("fees_only", "work_duty")).toBe(true);
    expect(mandateCoversKind("fees_only", "deposit")).toBe(true);
    expect(mandateCoversKind("fees_only", "drinks")).toBe(false);
    expect(mandateCoversKind("fees_only", "misc")).toBe(false);
  });
});

describe("validateBatch", () => {
  it("meldet einen zu langen Verwendungszweck als Warnung, nicht als Fehler", () => {
    const issues = validateBatch(
      lauf({ items: [posten({ remittanceInfo: "x".repeat(200) })] }),
      HEUTE,
    );
    expect(hasErrors(issues)).toBe(false);
    expect(issues.some((i) => i.severity === "warning")).toBe(true);
  });

  it("nennt den Namen des Betroffenen im Befund", () => {
    const issues = validateBatch(
      lauf({ items: [posten({ debtorName: "Erika Beispiel", debtorIban: "DE00" })] }),
      HEUTE,
    );
    expect(issues.some((i) => i.debtorName === "Erika Beispiel")).toBe(true);
  });
});
