import { describe, expect, it } from "vitest";
import { adminTodos, debitFlow, isoDateLabel, memberCategory, type DebitFlowInput } from "./admin";

const HEUTE = "2026-09-28";
const keineForderung = { payers: 0, totalCents: 0, unannounced: 0, dueDate: null };
const lauf = (b: Partial<NonNullable<DebitFlowInput["batch"]>> = {}) => ({
  status: "draft" as const, collectionDate: "2026-10-15", itemCount: 0, readyPayers: 0, returned: 0, ...b,
});
const staende = (input: DebitFlowInput) => debitFlow(input).steps.map((s) => s.state);

describe("isoDateLabel", () => {
  it("schreibt das Datum deutsch, ohne Zeitzone", () => {
    expect(isoDateLabel("2026-10-12")).toBe("12.10.2026");
    expect(isoDateLabel("2026-01-01T00:30:00+01:00")).toBe("01.01.2026");
  });
});

describe("debitFlow", () => {
  it("ohne Forderungen steht alles auf dem ersten Schritt", () => {
    const f = debitFlow({ charges: keineForderung, batch: null, today: HEUTE });
    expect(f.current).toBe("forderung");
    expect(f.steps.map((s) => s.state)).toEqual(["aktuell", "offen", "offen", "offen", "offen"]);
    expect(f.steps[0]!.info).toBe("Noch keine offene Forderung");
  });

  it("nicht angekuendigte Forderungen: Ankuendigung ist dran", () => {
    const f = debitFlow({
      charges: { payers: 3, totalCents: 36000, unannounced: 4, dueDate: null }, batch: null, today: HEUTE,
    });
    expect(f.current).toBe("ankuendigung");
    expect(f.steps[0]!.info).toMatch(/^3 Zahler, 360,00/);
    expect(f.steps[1]!.info).toBe("4 noch nicht angekündigt");
    expect(f.label).toBe("Ankündigung offen");
  });

  it("die Frist laeuft: gelb mit Datum, der Lauf erst ab dann", () => {
    const f = debitFlow({
      charges: { payers: 3, totalCents: 36000, unannounced: 0, dueDate: "2026-10-12" }, batch: null, today: HEUTE,
    });
    expect(f.current).toBe("ankuendigung");
    expect(f.steps[1]!.info).toBe("Frist läuft bis 12.10.2026");
    expect(f.steps[2]!.info).toBe("ab 12.10.2026 möglich");
    expect(f.label).toBe("Vorabankündigung läuft");
  });

  it("ein Lauf ohne einzugsfaehige Zahler bleibt bei der Ankuendigung", () => {
    const f = debitFlow({
      charges: { payers: 2, totalCents: 1000, unannounced: 0, dueDate: "2026-10-12" },
      batch: lauf({ readyPayers: 0 }),
      today: HEUTE,
    });
    expect(f.current).toBe("ankuendigung");
  });

  it("meldet die Datenbank Zahler als einzugsfaehig, ist die Auswahl dran", () => {
    const f = debitFlow({
      charges: { payers: 2, totalCents: 1000, unannounced: 0, dueDate: "2026-10-12" },
      batch: lauf({ readyPayers: 2 }),
      today: HEUTE,
    });
    expect(staende({ charges: { payers: 2, totalCents: 1000, unannounced: 0, dueDate: null }, batch: lauf({ readyPayers: 2 }), today: HEUTE }))
      .toEqual(["erledigt", "erledigt", "aktuell", "offen", "offen"]);
    expect(f.steps[2]!.info).toBe("2 Zahler einzugsfähig");
    expect(f.label).toBe("Auswahl offen");
  });

  it("Posten im Entwurf: die Datei ist dran", () => {
    const f = debitFlow({ charges: keineForderung, batch: lauf({ itemCount: 5 }), today: HEUTE });
    expect(f.current).toBe("datei");
    expect(f.steps[2]!.info).toBe("5 Posten zum 15.10.2026");
    expect(f.label).toBe("Bereit für die Datei");
  });

  it("erzeugt und eingereicht: Ruecklaeufer sind dran", () => {
    expect(debitFlow({ charges: keineForderung, batch: lauf({ status: "generated", itemCount: 5 }), today: HEUTE }).label)
      .toBe("Datei liegt bereit");
    const f = debitFlow({ charges: keineForderung, batch: lauf({ status: "submitted", itemCount: 5, returned: 1 }), today: HEUTE });
    expect(f.current).toBe("ruecklaeufer");
    expect(f.steps[3]!.info).toBe("erzeugt und eingereicht");
    expect(f.steps[4]!.info).toBe("1 Rückläufer erfasst");
  });

  it("abgeschlossen: alles gruen", () => {
    const f = debitFlow({ charges: keineForderung, batch: lauf({ status: "completed", itemCount: 5 }), today: HEUTE });
    expect(f.current).toBeNull();
    expect(f.steps.every((s) => s.state === "erledigt")).toBe(true);
    expect(f.steps[4]!.info).toBe("keine Rückläufer");
    expect(f.label).toBe("Abgeschlossen");
  });

  it("es gibt immer hoechstens einen aktuellen Schritt, davor nur erledigte", () => {
    const f = debitFlow({
      charges: { payers: 1, totalCents: 100, unannounced: 1, dueDate: "2026-10-01" },
      batch: lauf({ readyPayers: 1 }),
      today: HEUTE,
    });
    const s = f.steps.map((x) => x.state);
    expect(s.filter((x) => x === "aktuell")).toHaveLength(1);
    expect(s.slice(0, s.indexOf("aktuell")).every((x) => x === "erledigt")).toBe(true);
  });
});

describe("adminTodos", () => {
  const leer = {
    today: HEUTE, openApplications: 0, noticeDueDate: null, batchHref: "/admin/kasse/lastschriften",
    returnedCharges: 0, openDrinkMonths: [{ year: 2026, month: 9 }],
  };

  it("ohne offene Punkte ist die Liste leer", () => {
    expect(adminTodos({ ...leer, today: "2026-09-10" })).toEqual([]);
  });

  it("Antraege und Ruecklaeufer sind zu handeln, mit Zahl im Titel", () => {
    const t = adminTodos({ ...leer, today: "2026-09-10", openApplications: 2, returnedCharges: 1 });
    expect(t.map((x) => x.title)).toEqual(["2 Mitgliedsanträge", "1 Rückläufer offen"]);
    expect(t.every((x) => x.urgent)).toBe(true);
    expect(t[0]!.href).toBe("/admin/mitglieder/antraege");
  });

  it("eine laufende Frist ist nur zur Kenntnis und fuehrt zum Lauf", () => {
    const t = adminTodos({ ...leer, today: "2026-09-10", noticeDueDate: "2026-10-12", batchHref: "/admin/kasse/lastschriften/x" });
    expect(t).toHaveLength(1);
    expect(t[0]!).toMatchObject({ title: "Vorabankündigung läuft", urgent: false, href: "/admin/kasse/lastschriften/x" });
    expect(t[0]!.text).toContain("12.10.2026");
  });

  it("eine abgelaufene Frist ist kein Punkt mehr", () => {
    expect(adminTodos({ ...leer, today: "2026-09-10", noticeDueDate: "2026-09-10" })).toEqual([]);
  });

  it("der laufende Getraenkemonat erscheint erst kurz vor dem Ende", () => {
    expect(adminTodos({ ...leer, today: "2026-09-27" })).toEqual([]);
    const t = adminTodos({ ...leer, today: "2026-09-28" });
    expect(t[0]!).toMatchObject({ title: "Getränkemonat September", urgent: false });
    expect(t[0]!.text).toContain("30.09.");
  });

  it("ein vergangener offener Monat ist zu handeln und steht vor den Hinweisen", () => {
    const t = adminTodos({
      ...leer, today: "2026-09-29", noticeDueDate: "2026-10-12",
      openDrinkMonths: [{ year: 2026, month: 9 }, { year: 2026, month: 8 }],
    });
    expect(t.map((x) => x.title)).toEqual([
      "Getränkemonat August abschließen", "Vorabankündigung läuft", "Getränkemonat September",
    ]);
  });

  it("Monatsende im Februar und Jahreswechsel", () => {
    expect(adminTodos({ ...leer, today: "2027-02-27", openDrinkMonths: [{ year: 2027, month: 2 }] })[0]!.text)
      .toContain("28.02.");
    expect(adminTodos({ ...leer, today: "2027-01-05", openDrinkMonths: [{ year: 2026, month: 12 }] })[0]!.title)
      .toBe("Getränkemonat Dezember abschließen");
  });
});

describe("memberCategory", () => {
  it("ordnet nach Code und Name ein", () => {
    expect(memberCategory([{ code: "erwachsener", name: "Erwachsener" }])).toBe("aktiv");
    expect(memberCategory([{ code: "erwachsener_passiv", name: "Erwachsener Passiv" }])).toBe("passiv");
    expect(memberCategory([{ code: "jugend", name: "Kinder und Jugendliche" }])).toBe("jugend");
    expect(memberCategory([{ code: "x1", name: "Kinder" }])).toBe("jugend");
    expect(memberCategory([])).toBeNull();
  });

  it("bei mehreren Beitragsarten gewinnt passiv vor Jugend vor aktiv", () => {
    const pfand = { code: "pfand", name: "Schluesselpfand" };
    expect(memberCategory([pfand, { code: "erwachsener_passiv", name: "Erwachsener Passiv" }])).toBe("passiv");
    expect(memberCategory([{ code: "jugend", name: "Jugend" }, pfand])).toBe("jugend");
    expect(memberCategory([pfand])).toBe("aktiv");
  });
});
