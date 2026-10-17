import { describe, expect, it } from "vitest";
import { adminTodos, isoDateLabel, memberCategory } from "./admin";

const HEUTE = "2026-09-28";

describe("isoDateLabel", () => {
  it("schreibt das Datum deutsch, ohne Zeitzone", () => {
    expect(isoDateLabel("2026-10-12")).toBe("12.10.2026");
    expect(isoDateLabel("2026-01-01T00:30:00+01:00")).toBe("01.01.2026");
  });
});

describe("adminTodos", () => {
  const notice = { count: 144, totalCents: 36500, dueDate: "2026-10-12", groups: ["Gastgebühren", "Jahresbeiträge 2026"] };
  const leer = {
    today: HEUTE, openApplications: 0, notice: null, batchStatus: null, batchHref: "/admin/kasse/lastschriften",
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

  it("angekuendigt ohne Lauf: sofort einziehen, auch waehrend die Frist laeuft", () => {
    const t = adminTodos({ ...leer, today: "2026-09-10", notice });
    expect(t).toHaveLength(1);
    expect(t[0]!).toMatchObject({ title: "144 angekündigte Forderungen ohne Einzug", urgent: true, href: "/admin/kasse/einzug" });
    expect(t[0]!.text).toContain("12.10.2026");
    expect(t[0]!.text).toContain("Gastgebühren, Jahresbeiträge 2026");
    expect(t[0]!.text).toContain("365,00");
  });

  it("nach Ablauf der Frist bleibt der Punkt stehen, bis eingezogen ist", () => {
    expect(adminTodos({ ...leer, today: "2026-10-20", notice, openDrinkMonths: [] }))
      .toHaveLength(1);
  });

  it("ein offener Lauf fuehrt zu seinem naechsten Schritt", () => {
    const entwurf = adminTodos({ ...leer, today: "2026-09-10", notice, batchStatus: "draft", batchHref: "/admin/kasse/lastschriften/x" });
    expect(entwurf.map((x) => x.title)).toEqual(["Einzug: Datei erzeugen"]);
    expect(entwurf[0]!.href).toBe("/admin/kasse/lastschriften/x");
    expect(adminTodos({ ...leer, today: "2026-09-10", batchStatus: "generated" }).map((x) => x.title))
      .toEqual(["Lastschriftdatei einreichen"]);
    expect(adminTodos({ ...leer, today: "2026-09-10", batchStatus: "submitted" })).toEqual([]);
  });

  it("der laufende Getraenkemonat erscheint erst kurz vor dem Ende", () => {
    expect(adminTodos({ ...leer, today: "2026-09-27" })).toEqual([]);
    const t = adminTodos({ ...leer, today: "2026-09-28" });
    expect(t[0]!).toMatchObject({ title: "Getränkemonat September", urgent: false });
    expect(t[0]!.text).toContain("30.09.");
  });

  it("ein vergangener offener Monat ist zu handeln und steht vor den Hinweisen", () => {
    const t = adminTodos({
      ...leer, today: "2026-09-29", notice,
      openDrinkMonths: [{ year: 2026, month: 9 }, { year: 2026, month: 8 }],
    });
    expect(t.map((x) => x.title)).toEqual([
      "Getränkemonat August abschließen", "144 angekündigte Forderungen ohne Einzug", "Getränkemonat September",
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
