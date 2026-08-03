import { describe, expect, it } from "vitest";
import {
  completedHoursFor,
  requiredHoursFor,
  settleWorkDuty,
  type WorkDutyEntry,
  type WorkDutyRule,
} from "./workDuty";

const REGELN: WorkDutyRule[] = [
  { feeTypeId: "erwachsener", year: 2026, requiredHours: 8 },
  { feeTypeId: "jugend", year: 2026, requiredHours: 0 },
  { feeTypeId: "schluesselpfand", year: 2026, requiredHours: 0 },
  { feeTypeId: "passiv", year: 2026, requiredHours: 0 },
];

describe("requiredHoursFor", () => {
  it("nimmt die Anforderung der Beitragsart", () => {
    expect(requiredHoursFor(["erwachsener"], REGELN, 2026)).toBe(8);
    expect(requiredHoursFor(["jugend"], REGELN, 2026)).toBe(0);
  });

  it("bei mehreren Beitragsarten zaehlt die hoechste, nicht die Summe", () => {
    // Sonst muesste jemand mit Beitrag plus Schluesselpfand doppelt arbeiten.
    expect(requiredHoursFor(["erwachsener", "schluesselpfand"], REGELN, 2026)).toBe(8);
  });

  it("ohne passende Regel gilt null", () => {
    expect(requiredHoursFor(["unbekannt"], REGELN, 2026)).toBe(0);
    expect(requiredHoursFor([], REGELN, 2026)).toBe(0);
    expect(requiredHoursFor(["erwachsener"], REGELN, 2025)).toBe(0);
  });
});

describe("completedHoursFor", () => {
  const eintraege: WorkDutyEntry[] = [
    { memberId: "m1", year: 2026, hours: 3, confirmedAt: "2026-05-01T10:00:00Z" },
    { memberId: "m1", year: 2026, hours: 2.5, confirmedAt: "2026-06-01T10:00:00Z" },
    { memberId: "m1", year: 2026, hours: 4, confirmedAt: null },
    { memberId: "m1", year: 2025, hours: 8, confirmedAt: "2025-05-01T10:00:00Z" },
  ];

  it("zaehlt nur bestaetigte Stunden des Jahres", () => {
    // Unbestaetigte Eintraege zaehlen nicht - sonst koennte sich jemand selbst
    // Stunden gutschreiben und die Forderung verschwinden lassen.
    expect(completedHoursFor(eintraege, 2026)).toBe(5.5);
    expect(completedHoursFor(eintraege, 2025)).toBe(8);
  });
});

describe("settleWorkDuty", () => {
  it("rechnet fehlende Stunden ab", () => {
    const s = settleWorkDuty(8, 5.5, 1500);
    expect(s.missingHours).toBe(2.5);
    expect(s.amountCents).toBe(3750);
  });

  it("erzeugt keine negative Forderung bei Mehrarbeit", () => {
    const s = settleWorkDuty(8, 12, 1500);
    expect(s.missingHours).toBe(0);
    expect(s.amountCents).toBe(0);
  });

  it("gar nichts geleistet ergibt das volle Soll", () => {
    expect(settleWorkDuty(8, 0, 1500).amountCents).toBe(12000);
  });

  it("kein Soll ergibt keine Forderung", () => {
    expect(settleWorkDuty(0, 0, 1500).amountCents).toBe(0);
  });

  it("rundet auf ganze Cent", () => {
    // 8 - 5,667 = 2,333 fehlende Stunden. Mal 15,00 Euro ergibt 34,995 Euro -
    // eine Lastschrift kann keine Bruchteile eines Cents abbilden, also 34,99
    // beziehungsweise hier kaufmaennisch 35,00 Euro.
    const s = settleWorkDuty(8, 5.667, 1500);
    expect(Number.isInteger(s.amountCents)).toBe(true);
    expect(s.amountCents).toBe(3500);
  });

  it("rundet auch bei Dritteln auf ganze Cent", () => {
    const s = settleWorkDuty(8, 5 + 1 / 3, 1234);
    expect(Number.isInteger(s.amountCents)).toBe(true);
    // 2,6667 Stunden mal 12,34 Euro = 32,9067 Euro -> 32,91 Euro
    expect(s.amountCents).toBe(3291);
  });
});
