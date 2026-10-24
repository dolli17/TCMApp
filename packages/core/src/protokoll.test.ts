import { describe, expect, it } from "vitest";
import {
  berlinTagesbeginn,
  PROTOKOLL_BEREICHE,
  protokollBereich,
  protokollSatz,
  protokollVorgang,
} from "./protokoll";

const NAMEN: Record<string, string> = {
  "m-max": "Max Muster",
  "m-kira": "Kira Kasse",
  "c-1": "Platz 1",
  "b-1": "Einzug Oktober",
};
const name = (id: string) => NAMEN[id];

describe("protokollSatz", () => {
  it("Forderung für ein anderes Mitglied", () => {
    expect(
      protokollSatz(
        {
          table_name: "charges",
          action: "insert",
          member_id: "m-max",
          changed_by: "m-kira",
          kenn: { description: "Gastgebühr", amount_cents: 1200, period_label: null },
        },
        "Kira Kasse",
        name,
      ),
    ).toBe("Kira Kasse hat Forderung „Gastgebühr 12,00\u00a0€“ für Max Muster angelegt");
  });

  it("Storno und Sperrung mit Platz und Zeit in Berliner Zeit", () => {
    const kenn = {
      kind: "booking",
      court_id: "c-1",
      title: null,
      slot: '["2026-10-24 08:00:00+00","2026-10-24 09:00:00+00")',
    };
    expect(
      protokollSatz(
        { table_name: "bookings", action: "update", member_id: "m-max", changed_by: "m-kira", kenn,
          diff: { status: { alt: "active", neu: "cancelled" } } },
        "Kira Kasse",
        name,
      ),
    ).toBe("Kira Kasse hat Buchung Platz 1 am 24.10.2026, 10:00 für Max Muster storniert");
    expect(
      protokollSatz(
        { table_name: "bookings", action: "insert", kenn: { ...kenn, kind: "blocking", title: "Regen" } },
        "Kira Kasse",
        name,
      ),
    ).toBe("Kira Kasse hat Sperrung „Regen“ Platz 1 am 24.10.2026, 10:00 angelegt");
  });

  it("eigener Antrag ohne „für“", () => {
    expect(
      protokollSatz(
        { table_name: "account_deletion_requests", action: "insert", member_id: "m-max", changed_by: "m-max" },
        "Max Muster",
        name,
      ),
    ).toBe("Max Muster hat Antrag auf Kontolöschung angelegt");
  });

  it("Entscheidung über einen Antrag", () => {
    expect(
      protokollSatz(
        {
          table_name: "membership_applications",
          action: "update",
          kenn: { first_name: "Anna", last_name: "Antrag" },
          diff: { status: { alt: "new", neu: "declined" } },
        },
        "Kira Kasse",
      ),
    ).toBe("Kira Kasse hat Mitgliedsantrag von Anna Antrag abgelehnt");
  });

  it("Sperren und Freigeben eines Zugangs", () => {
    const e = { table_name: "members", action: "update", member_id: "m-max",
                kenn: { first_name: "Max", last_name: "Muster" } };
    expect(protokollSatz({ ...e, diff: { login_disabled_at: { alt: null, neu: "2026-10-22" } } }, "Kira Kasse", name))
      .toBe("Kira Kasse hat Mitglied Max Muster gesperrt");
    expect(protokollSatz({ ...e, diff: { login_disabled_at: { alt: "2026-10-22", neu: null } } }, "Kira Kasse", name))
      .toBe("Kira Kasse hat Mitglied Max Muster wieder freigegeben");
  });

  it("Rollen mit Bezeichnung statt Schlüssel (U49)", () => {
    const e = { table_name: "member_roles", action: "insert", member_id: "m-max" };
    expect(protokollSatz({ ...e, kenn: { role: "admin" } }, "System", name))
      .toBe("System hat Rolle „App Admin“ für Max Muster angelegt");
    expect(protokollSatz({ ...e, kenn: { role: "member" } }, "System", name))
      .toBe("System hat Rolle „Spieler“ für Max Muster angelegt");
  });

  it("Ereignisse der Zugangsverwaltung", () => {
    const e = { table_name: "members", action: "event", member_id: "m-max" };
    expect(protokollSatz({ ...e, ereignis: "einladung_erneut" }, "Kira Kasse", name))
      .toBe("Kira Kasse hat die Einladung an Max Muster erneut gesendet");
    expect(protokollSatz({ ...e, ereignis: "passwort_zuruecksetzen" }, "Kira Kasse", name))
      .toBe("Kira Kasse hat Max Muster einen Link zum Zurücksetzen des Passworts gesendet");
  });

  it("Sammeleintrag eines Laufs mit Anzahl und Summe", () => {
    expect(
      protokollSatz(
        {
          table_name: "charges",
          action: "event",
          ereignis: "beitragslauf",
          kenn: { jahr: 2026, aktion: "insert", anzahl: 312, betrag_cents: 3744000 },
        },
        "Kira Kasse",
      ),
    ).toBe("Kira Kasse hat im Beitragslauf 2026 312 Forderungen (zusammen 37.440,00\u00a0€) angelegt");
    expect(
      protokollSatz(
        {
          table_name: "bookings",
          action: "event",
          ereignis: "serie_anlegen",
          kenn: { titel: "Training Herren", aktion: "insert", anzahl: 1, betrag_cents: 0 },
        },
        "Kira Kasse",
      ),
    ).toBe("Kira Kasse hat beim Anlegen der Serie „Training Herren“ 1 Termin angelegt");
    expect(
      protokollSatz(
        {
          table_name: "charges",
          action: "event",
          ereignis: "einzug_eingereicht",
          kenn: { batch_id: "b-1", aktion: "update", anzahl: 2, betrag_cents: 5000 },
        },
        "System",
        name,
      ),
    ).toBe("System hat beim Einreichen des Einzugs „Einzug Oktober“ 2 Forderungen (zusammen 50,00\u00a0€) geändert");
  });

  it("Lesen der IBANs für die Lastschriftdatei", () => {
    expect(protokollSatz({ table_name: "debit_batches", action: "read", row_id: "b-1" }, "Kira Kasse", name))
      .toBe("Kira Kasse hat die Lastschriftdatei „Einzug Oktober“ mit den IBANs erzeugt");
  });

  it("Einstellungen nach Bezeichnung, Arbeitsstunden mit Komma", () => {
    expect(
      protokollSatz(
        { table_name: "settings", action: "update", kenn: { key: "sepa.creditor_iban", label: "IBAN des Vereinskontos" } },
        "Kira Kasse",
      ),
    ).toBe("Kira Kasse hat Einstellung „IBAN des Vereinskontos“ geändert");
    expect(
      protokollSatz(
        { table_name: "work_duty_entries", action: "insert", member_id: "m-max", changed_by: "m-kira",
          kenn: { year: 2026, hours: 2.5, worked_on: "2026-05-02" } },
        "Kira Kasse",
        name,
      ),
    ).toBe("Kira Kasse hat 2,5 Arbeitsstunden vom 02.05.2026 für Max Muster angelegt");
  });
});

describe("protokollBereich", () => {
  it("ordnet jede Tabelle genau einem Bereich zu", () => {
    const alle = Object.values(PROTOKOLL_BEREICHE).flatMap((b) => b.tabellen);
    expect(new Set(alle).size).toBe(alle.length);
    expect(protokollBereich("charges")).toBe("finanzen");
    expect(protokollBereich("bookings")).toBe("plaetze");
    expect(protokollBereich("legal_documents")).toBe("system");
    expect(protokollBereich("drink_purchases")).toBeNull();
  });
});

describe("protokollVorgang", () => {
  it("ohne Subjekt, für die Spalte im Protokoll je Mitglied", () => {
    expect(protokollVorgang({ table_name: "members", action: "event", ereignis: "einladung_erneut",
                              kenn: { first_name: "Max", last_name: "Muster" } }))
      .toBe("die Einladung an Max Muster erneut gesendet");
  });
});

describe("berlinTagesbeginn", () => {
  it("Sommer- und Winterzeit", () => {
    expect(berlinTagesbeginn("2026-07-01")).toBe("2026-07-01T00:00:00+02:00");
    expect(berlinTagesbeginn("2026-12-01")).toBe("2026-12-01T00:00:00+01:00");
    // Tage der Umstellung: Mitternacht liegt noch vor ihr
    expect(berlinTagesbeginn("2026-03-29")).toBe("2026-03-29T00:00:00+01:00");
    expect(berlinTagesbeginn("2026-10-25")).toBe("2026-10-25T00:00:00+02:00");
  });
});
