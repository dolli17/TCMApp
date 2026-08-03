import { describe, expect, it } from "vitest";
import {
  findeMailKonflikte,
  findeReferenzKonflikte,
  istMinderjaehrig,
  leerZuNull,
  mapBankAccount,
  mapEmail,
  mapGender,
  mapMandate,
  mapMembership,
  mapPerson,
  type EbusyMembership,
  type EbusyPerson,
} from "./mapping";

/**
 * Die Beispieldaten sind den echten API-Antworten nachgebildet, aber mit
 * erfundenen Personen. Insbesondere die Eigenheiten sind uebernommen: eBuSy
 * liefert Leerstrings statt null, und die Beitragsart haengt an der
 * Mitgliedschaft, nicht an der Person.
 */
const PERSON: EbusyPerson = {
  id: 1307704,
  title: "",
  archived: false,
  gender: "FEMALE",
  salutation: "FEMALE",
  firstname: "Katrin",
  lastname: "Beispiel",
  pseudonym: "",
  birthday: "2000-09-01",
  company: "",
  nationality: "",
  address: { street: "Musterweg 7", postcode: "70736", city: "Fellbach", countryCode: null },
  contact: { email: "katrin@example.org", phone: "", mobile: "0170 1234567" },
  bankAccount: { holder: "Katrin Beispiel", number: "DE48200411550869699900", bank: "Testbank" },
  sepaMandate: { date: "2023-04-11", reference: "SEPA-0002", lastUsedDate: "2023-12-03" },
  code: "13344",
  transponder: "",
  customerId: "",
  comment: "Trainer müssen keine Arbeitsstunden leisten!",
  user: { id: 771036, name: "BeispielKatrin", enabled: true },
  attributes: [
    { name: "Trainer", value: { name: "Trainer" } },
    { name: "Beitragsstatus", value: { name: "Beitragsbefreit" } },
  ],
};

describe("leerZuNull", () => {
  it("macht aus den Leerstrings der eBuSy-API null", () => {
    // Die API liefert durchgehend "" statt null - ungefiltert landeten
    // Leerstrings in Spalten, die eigentlich leer sein sollen.
    expect(leerZuNull("")).toBeNull();
    expect(leerZuNull("   ")).toBeNull();
    expect(leerZuNull(null)).toBeNull();
    expect(leerZuNull("Wert")).toBe("Wert");
  });
});

describe("mapEmail", () => {
  it("verwirft Platzhalter-Adressen", () => {
    // fake@ebusy.de kommt im Bestand sechsmal vor und gehoert zu niemandem.
    expect(mapEmail("fake@ebusy.de")).toBeNull();
    expect(mapEmail("FAKE@EBUSY.DE")).toBeNull();
    expect(mapEmail("")).toBeNull();
  });

  it("normalisiert auf Kleinschreibung", () => {
    expect(mapEmail("Katrin@Example.ORG")).toBe("katrin@example.org");
  });
});

describe("mapGender", () => {
  it("uebersetzt die Enums", () => {
    expect(mapGender("FEMALE")).toBe("female");
    expect(mapGender("MALE")).toBe("male");
    expect(mapGender("DIVERSE")).toBe("diverse");
    expect(mapGender(null)).toBeNull();
    expect(mapGender("UNBEKANNT")).toBeNull();
  });
});

describe("mapPerson", () => {
  const m = mapPerson(PERSON);

  it("uebernimmt die Stammdaten", () => {
    expect(m.ebusy_person_id).toBe(1307704);
    expect(m.first_name).toBe("Katrin");
    expect(m.last_name).toBe("Beispiel");
    expect(m.birthday).toBe("2000-09-01");
    expect(m.email).toBe("katrin@example.org");
    expect(m.mobile).toBe("0170 1234567");
  });

  it("macht aus Leerstrings null", () => {
    expect(m.title).toBeNull();
    expect(m.phone).toBeNull();
  });

  it("behaelt den Kommentar - er enthaelt fachliche Hinweise", () => {
    // Ein Drittel der Datensaetze hat einen Kommentar, oft mit Absprachen,
    // die sonst verloren gingen.
    expect(m.notes).toContain("Arbeitsstunden");
  });

  it("rettet Felder ohne eigene Spalte nach legacy_data", () => {
    // Sonst waere der Import verlustbehaftet und nicht wiederholbar.
    expect(m.legacy_data.code).toBe("13344");
    expect(m.legacy_data.ebusyUsername).toBe("BeispielKatrin");
    expect(m.legacy_data.attributes).toEqual([
      { name: "Trainer", value: "Trainer" },
      { name: "Beitragsstatus", value: "Beitragsbefreit" },
    ]);
  });

  it("laesst leere Felder aus legacy_data weg", () => {
    expect(m.legacy_data).not.toHaveProperty("transponder");
    expect(m.legacy_data).not.toHaveProperty("customerId");
  });

  it("vermerkt ein fehlendes Geburtsdatum", () => {
    const ohne = mapPerson({ ...PERSON, birthday: null });
    expect(ohne.import_notes).toContain("Geburtsdatum");
  });

  it("vermerkt eine verworfene Platzhalter-Adresse", () => {
    const fake = mapPerson({ ...PERSON, contact: { email: "fake@ebusy.de" } });
    expect(fake.email).toBeNull();
    expect(fake.import_notes).toContain("Platzhalter");
  });

  it("merkt sich den Zahler zur spaeteren Aufloesung", () => {
    const kind = mapPerson({ ...PERSON, paidByInfo: { id: 999 } });
    expect(kind.ebusy_payer_id).toBe(999);
  });
});

describe("mapBankAccount", () => {
  it("entfernt Leerzeichen aus der IBAN", () => {
    const b = mapBankAccount({
      ...PERSON,
      bankAccount: { number: "DE48 2004 1155 0869 6999 00", holder: "K. B." },
    });
    expect(b?.iban).toBe("DE48200411550869699900");
  });

  it("liefert null ohne IBAN", () => {
    // 21 Mitglieder haben weder IBAN noch Mandat und zahlen per Ueberweisung.
    expect(mapBankAccount({ ...PERSON, bankAccount: null })).toBeNull();
    expect(mapBankAccount({ ...PERSON, bankAccount: { number: "" } })).toBeNull();
  });

  it("faellt beim Kontoinhaber auf den Namen zurueck", () => {
    const b = mapBankAccount({
      ...PERSON,
      bankAccount: { number: "DE48200411550869699900", holder: "" },
    });
    expect(b?.holder).toBe("Katrin Beispiel");
  });
});

describe("mapMandate", () => {
  it("uebernimmt Referenz und Datum unveraendert", () => {
    // Daran haengt die Gueltigkeit: Glaeubiger-ID, Referenz und Datum muessen
    // exakt bleiben, sonst muessten alle Mandate neu eingeholt werden.
    const m = mapMandate(PERSON);
    expect(m?.reference).toBe("SEPA-0002");
    expect(m?.signed_on).toBe("2023-04-11");
    expect(m?.last_used_on).toBe("2023-12-03");
  });

  it("laesst nie benutzte Mandate auf null", () => {
    // 49 Mandate im Bestand wurden nie eingesetzt; die 36-Monats-Frist laeuft
    // dann ab Unterschrift.
    const m = mapMandate({ ...PERSON, sepaMandate: { date: "2023-04-11", reference: "X" } });
    expect(m?.last_used_on).toBeNull();
  });

  it("liefert null ohne Referenz oder Datum", () => {
    expect(mapMandate({ ...PERSON, sepaMandate: null })).toBeNull();
    expect(mapMandate({ ...PERSON, sepaMandate: { reference: "X" } })).toBeNull();
  });
});

describe("findeReferenzKonflikte", () => {
  it("findet mehrfach vergebene Mandatsreferenzen", () => {
    const konflikte = findeReferenzKonflikte([
      { ebusy_person_id: 1, reference: "SEPA-0005", signed_on: "2023-01-01", last_used_on: null },
      { ebusy_person_id: 2, reference: "SEPA-0005", signed_on: "2023-01-01", last_used_on: null },
      { ebusy_person_id: 3, reference: "SEPA-0006", signed_on: "2023-01-01", last_used_on: null },
    ]);
    expect(konflikte.has("SEPA-0005")).toBe(true);
    expect(konflikte.has("SEPA-0006")).toBe(false);
  });

  it("vergleicht ohne Ruecksicht auf Gross- und Kleinschreibung", () => {
    const konflikte = findeReferenzKonflikte([
      { ebusy_person_id: 1, reference: "sepa-0005", signed_on: "2023-01-01", last_used_on: null },
      { ebusy_person_id: 2, reference: "SEPA-0005", signed_on: "2023-01-01", last_used_on: null },
    ]);
    expect(konflikte.size).toBe(1);
  });
});

describe("findeMailKonflikte", () => {
  it("findet mehrfach genutzte Adressen", () => {
    // auth.users.email ist eindeutig - von diesen Personen kann hoechstens
    // eine einen Login bekommen.
    const konflikte = findeMailKonflikte([
      { ...mapPerson(PERSON), email: "familie@example.org", ebusy_person_id: 1 },
      { ...mapPerson(PERSON), email: "familie@example.org", ebusy_person_id: 2 },
      { ...mapPerson(PERSON), email: "einzeln@example.org", ebusy_person_id: 3 },
      { ...mapPerson(PERSON), email: null, ebusy_person_id: 4 },
    ]);
    expect(konflikte.size).toBe(1);
    expect(konflikte.get("familie@example.org")).toHaveLength(2);
  });
});

describe("istMinderjaehrig", () => {
  const stichtag = new Date("2026-08-03");

  it("erkennt Minderjaehrige", () => {
    expect(istMinderjaehrig("2015-01-01", stichtag)).toBe(true);
    expect(istMinderjaehrig("2000-01-01", stichtag)).toBe(false);
  });

  it("behandelt ein fehlendes Geburtsdatum als volljaehrig", () => {
    // Lieber einen Login zu viel anbieten als ein Mitglied stillschweigend
    // aussperren; die Faelle stehen ohnehin im Import-Report.
    expect(istMinderjaehrig(null, stichtag)).toBe(false);
  });
});

describe("mapMembership", () => {
  const MS: EbusyMembership = {
    id: 118066,
    personId: 1312313,
    number: "0001",
    status: "ACTIVE",
    consideredActive: false,
    begin: "1982-01-01",
    end: null,
    comment: "Passiv seit 01.01.2026",
    membershipFeeTypes: [
      { id: 4371, name: "Betragsbefreit" },
      { id: 4366, name: "Erwachsener Passiv" },
    ],
    workServiceTypes: [{ id: 474, name: "Freiwillige Mehrarbeit" }],
  };

  it("uebernimmt Nummer und Eintrittsdatum", () => {
    const m = mapMembership(MS);
    expect(m.number).toBe("0001");
    expect(m.started_on).toBe("1982-01-01");
    expect(m.status).toBe("active");
  });

  it("uebernimmt mehrere Beitragsarten", () => {
    // 67 der 398 Mitgliedschaften haben zwei - typischerweise Beitrag plus
    // Schluesselpfand. Ein einzelnes Feld koennte das nicht abbilden.
    const m = mapMembership(MS);
    expect(m.fee_type_names).toEqual(["Betragsbefreit", "Erwachsener Passiv"]);
  });

  it("setzt den Status auf beendet, wenn ein Enddatum vorliegt", () => {
    expect(mapMembership({ ...MS, end: "2025-12-31" }).status).toBe("ended");
  });

  it("kommt ohne Nummer aus", () => {
    expect(mapMembership({ ...MS, number: null }).number).toBe("118066");
  });
});
