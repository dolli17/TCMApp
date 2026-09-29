/**
 * Der Arbeitsdienst der Verwaltung gegen einen nachgebildeten Client:
 * richtige RPCs mit richtigen Parametern, Pruefung vor dem Absenden,
 * Meldungen wortgleich mit dem Web.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
  istKonfiguriert: () => true,
}));

const { jahrAbrechnen, sollStundenSetzen, stundenAusText, stundenEintragen } = await import("./arbeitsdienst");

const MITGLIED = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
});

describe("stundenAusText", () => {
  it("liest Komma und Punkt", () => {
    expect(stundenAusText("2,5")).toBe(2.5);
    expect(stundenAusText(" 3 ")).toBe(3);
    expect(stundenAusText("")).toBeNaN();
    expect(stundenAusText("zwei")).toBeNaN();
  });
});

describe("stundenEintragen", () => {
  it("ruft record_work_duty mit ISO-Datum", async () => {
    const e = await stundenEintragen({ mitgliedId: MITGLIED, stunden: 2.5, amTag: "03.05.2026", beschreibung: " Platzaufbau " });
    expect(rpc).toHaveBeenCalledWith("record_work_duty", {
      p_member_id: MITGLIED,
      p_hours: 2.5,
      p_worked_on: "2026-05-03",
      p_description: "Platzaufbau",
    });
    expect(e).toEqual({ ok: true, meldung: "2.5 Stunden eingetragen.", daten: undefined });
  });

  it("weist unlesbares Datum und unsinnige Stunden vor dem Absenden ab", async () => {
    expect((await stundenEintragen({ mitgliedId: MITGLIED, stunden: 2, amTag: "31.02.2026", beschreibung: "" })).ok).toBe(false);
    expect((await stundenEintragen({ mitgliedId: MITGLIED, stunden: 0, amTag: "01.05.2026", beschreibung: "" })).meldung)
      .toBe("Die Stundenzahl muss zwischen 0,25 und 24 liegen.");
    expect((await stundenEintragen({ mitgliedId: MITGLIED, stunden: 25, amTag: "01.05.2026", beschreibung: "" })).ok).toBe(false);
    expect((await stundenEintragen({ mitgliedId: "", stunden: 2, amTag: "01.05.2026", beschreibung: "" })).ok).toBe(false);
    expect((await stundenEintragen({ mitgliedId: MITGLIED, stunden: 2, amTag: "01.01.2999", beschreibung: "" })).meldung)
      .toBe("Ein Einsatz in der Zukunft lässt sich nicht eintragen.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uebersetzt Fehler der Datenbank", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Dieses Mitglied gibt es nicht.", code: "P0002" } });
    const e = await stundenEintragen({ mitgliedId: MITGLIED, stunden: 1, amTag: "2026-05-01", beschreibung: "" });
    expect(e.ok).toBe(false);
    expect(e.meldung).toBe("Dieses Mitglied gibt es nicht.");
  });
});

describe("sollStundenSetzen", () => {
  it("ruft upsert_work_duty_rule", async () => {
    const e = await sollStundenSetzen({ artId: "art", jahr: 2026, stunden: 8 });
    expect(rpc).toHaveBeenCalledWith("upsert_work_duty_rule", { p_fee_type_id: "art", p_year: 2026, p_required_hours: 8 });
    expect(e.meldung).toBe("Soll auf 8 Stunden gesetzt.");
  });

  it("0 heisst kein Arbeitsdienst", async () => {
    expect((await sollStundenSetzen({ artId: "art", jahr: 2026, stunden: 0 })).meldung)
      .toBe("Diese Beitragsart leistet keinen Arbeitsdienst mehr.");
  });

  it("weist Unsinn ab", async () => {
    expect((await sollStundenSetzen({ artId: "art", jahr: 2026, stunden: Number.NaN })).ok).toBe(false);
    expect((await sollStundenSetzen({ artId: "art", jahr: 2026, stunden: -1 })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("jahrAbrechnen", () => {
  it("ruft work_duty_settle_year und zaehlt", async () => {
    rpc.mockResolvedValue({ data: [{ abgerechnet: 3, forderungen: 1, summe_cents: 4500 }], error: null });
    const e = await jahrAbrechnen(2025);
    expect(rpc).toHaveBeenCalledWith("work_duty_settle_year", { p_year: 2025, p_due_date: undefined });
    expect(e).toEqual({ ok: true, meldung: "3 Mitglieder abgerechnet, 1 Forderung entstanden." });
  });

  it("sagt, wenn es nichts gab", async () => {
    rpc.mockResolvedValue({ data: [{ abgerechnet: 0, forderungen: 0, summe_cents: 0 }], error: null });
    expect((await jahrAbrechnen(2025)).meldung).toBe("Es gab nichts abzurechnen.");
  });

  it("uebersetzt Fehler", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Das Jahr 2026 laeuft noch.", code: "22023" } });
    const e = await jahrAbrechnen(2026);
    expect(e.ok).toBe(false);
    expect(e.meldung).toContain("2026");
  });
});
