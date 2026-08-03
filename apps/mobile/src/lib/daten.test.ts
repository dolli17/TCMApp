/**
 * Die Datenschicht der App gegen einen nachgebildeten Supabase-Client.
 *
 * Getestet wird, was hier tatsaechlich Logik ist: dass Fehler in
 * verstaendliche Saetze uebersetzt werden und dass die richtigen Parameter an
 * die RPCs gehen. Die Regeln selbst stehen in der Datenbank und werden dort
 * geprueft - sie hier noch einmal nachzubilden wuerde nur beweisen, dass die
 * Nachbildung stimmt.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const signIn = vi.fn();

vi.mock("./supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { signInWithPassword: (...args: unknown[]) => signIn(...args) },
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ data: [], error: null }) }) }),
    }),
  },
  istKonfiguriert: () => true,
}));

const {
  anmelden,
  bucheGetraenk,
  bucheplatz,
  ladeKontingent,
  storniereBuchung,
} = await import("./daten");

beforeEach(() => {
  rpc.mockReset();
  signIn.mockReset();
});

describe("anmelden", () => {
  it("meldet Erfolg", async () => {
    signIn.mockResolvedValue({ error: null });
    expect(await anmelden("a@b.de", "geheim")).toEqual({ ok: true, meldung: "" });
  });

  it("verraet nicht, ob es die Adresse gibt", async () => {
    // Sonst liesse sich damit herausfinden, wer im Verein ist.
    signIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const r = await anmelden("a@b.de", "falsch");
    expect(r.ok).toBe(false);
    expect(r.meldung).toBe("E-Mail-Adresse oder Passwort stimmt nicht.");
    expect(r.meldung).not.toContain("Invalid");
  });

  it("schneidet Leerzeichen ab", async () => {
    signIn.mockResolvedValue({ error: null });
    await anmelden("  a@b.de  ", "geheim");
    expect(signIn).toHaveBeenCalledWith({ email: "a@b.de", password: "geheim" });
  });
});

describe("bucheplatz", () => {
  it("reicht die Parameter an create_booking durch", async () => {
    rpc.mockResolvedValue({ data: "neue-id", error: null });
    const start = new Date("2026-08-05T08:00:00Z");

    const r = await bucheplatz("platz-1", start, "einzel", ["m1"], ["Gast"]);

    expect(r.ok).toBe(true);
    expect(r.daten).toBe("neue-id");
    expect(rpc).toHaveBeenCalledWith("create_booking", {
      p_court_id: "platz-1",
      p_starts_at: start.toISOString(),
      p_booking_type_code: "einzel",
      p_player_member_ids: ["m1"],
      p_guest_names: ["Gast"],
    });
  });

  it("uebersetzt einen belegten Platz in einen verstaendlichen Satz", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "23P01", message: "conflicting key value violates exclusion constraint" },
    });

    const r = await bucheplatz("platz-1", new Date(), "einzel", ["m1"]);
    expect(r.ok).toBe(false);
    expect(r.meldung).toBe("Dieser Platz ist zu der Zeit bereits belegt.");
    expect(r.meldung).not.toContain("constraint");
  });

  it("reicht die Meldung der Regelpruefung unveraendert durch", async () => {
    // Die RPCs schreiben bereits deutsche Saetze - die sollen nicht durch eine
    // allgemeine Ersatzmeldung verschluckt werden.
    rpc.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "Du hast bereits 2 offene Buchungen. Mehr sind nicht moeglich." },
    });

    const r = await bucheplatz("platz-1", new Date(), "einzel", ["m1"]);
    expect(r.meldung).toContain("2 offene Buchungen");
  });
});

describe("bucheGetraenk", () => {
  it("bucht mit Menge", async () => {
    rpc.mockResolvedValue({ data: "id", error: null });
    const r = await bucheGetraenk("artikel-1", 3);
    expect(r.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("record_drink_purchase", {
      p_item_id: "artikel-1",
      p_quantity: 3,
    });
  });

  it("nimmt standardmaessig ein Stueck", async () => {
    rpc.mockResolvedValue({ data: "id", error: null });
    await bucheGetraenk("artikel-1");
    expect(rpc).toHaveBeenCalledWith("record_drink_purchase", {
      p_item_id: "artikel-1",
      p_quantity: 1,
    });
  });
});

describe("storniereBuchung", () => {
  it("meldet fehlende Berechtigung verstaendlich", async () => {
    rpc.mockResolvedValue({
      error: { code: "42501", message: "Du kannst nur deine eigenen Buchungen stornieren." },
    });
    const r = await storniereBuchung("b1");
    expect(r.ok).toBe(false);
    expect(r.meldung).toContain("eigenen Buchungen");
  });
});

describe("ladeKontingent", () => {
  it("faellt auf null zurueck, wenn nichts kommt", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await ladeKontingent()).toEqual({ used: 0, allowed: 0 });
  });

  it("liefert den Stand", async () => {
    rpc.mockResolvedValue({ data: [{ used: 1, allowed: 2 }], error: null });
    expect(await ladeKontingent()).toEqual({ used: 1, allowed: 2 });
  });
});
