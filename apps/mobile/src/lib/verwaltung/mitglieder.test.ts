/**
 * Die Schreibfunktionen der Mitgliederverwaltung gegen einen nachgebildeten
 * Supabase-Client (Muster: src/lib/daten.test.ts).
 *
 * Geprueft wird, was hier Logik ist: welche RPC mit welchen Parametern
 * gerufen wird, dass Fehler in Saetze uebersetzt werden, dass getippte
 * Daten nach ISO gehen und die IBAN vorab geprueft wird. Die Regeln selbst
 * stehen in der Datenbank.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const invoke = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
  istKonfiguriert: () => true,
}));

const m = await import("./mitglieder");

/** Ein Fehler, wie ihn PostgREST fuer eine verletzte Regel liefert. */
const REGEL = { message: "Nur Administratoren duerfen das.", code: "P0001" };

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
});

describe("mitgliedAnlegen", () => {
  it("verlangt Vor- und Nachname ohne Datenbankrunde", async () => {
    const r = await m.mitgliedAnlegen({ first_name: " ", last_name: "Meier" });
    expect(r).toEqual({ ok: false, meldung: "Vor- und Nachname sind Pflicht." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("wandelt deutsche Daten nach ISO und laesst Leeres weg", async () => {
    rpc.mockResolvedValue({ data: "neu-1", error: null });
    const r = await m.mitgliedAnlegen({
      first_name: "Anna", last_name: "Meier", birthday: "3.4.1990", started_on: "01.10.2026", email: "",
    });
    expect(r).toEqual({ ok: true, meldung: "Anna Meier wurde angelegt.", daten: "neu-1" });
    const [name, p] = rpc.mock.calls[0]!;
    expect(name).toBe("create_member");
    expect(p).toMatchObject({ p_first_name: "Anna", p_last_name: "Meier", p_birthday: "1990-04-03", p_started_on: "2026-10-01" });
    expect(p.p_email).toBeUndefined();
  });

  it("weist ein ungueltiges Datum ab", async () => {
    const r = await m.mitgliedAnlegen({ first_name: "Anna", last_name: "Meier", birthday: "31.02.1990" });
    expect(r.ok).toBe(false);
    expect(r.meldung).toContain("Geburtstag");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("stammdatenSpeichern", () => {
  it("schickt nur Geaendertes, Daten als ISO, Schalter als Wahrheitswert", async () => {
    const r = await m.stammdatenSpeichern(
      "m-1",
      { first_name: "Anna", city: "Rastatt", birthday: "03.04.1990", is_trainer: true },
      { first_name: "Anna", city: "Kuppenheim", birthday: "1990-04-03", is_trainer: false },
      { birthday: "Geburtstag" },
    );
    expect(r).toEqual({ ok: true, meldung: "Gespeichert." });
    expect(rpc).toHaveBeenCalledWith("update_member", {
      p_member_id: "m-1",
      p_patch: { city: "Rastatt", is_trainer: true },
    });
  });

  it("meldet, wenn nichts geaendert wurde", async () => {
    const r = await m.stammdatenSpeichern("m-1", { city: "A" }, { city: "A" });
    expect(r).toEqual({ ok: false, meldung: "Nichts geändert." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uebersetzt Fehler der Datenbank", async () => {
    rpc.mockResolvedValue({ data: null, error: REGEL });
    const r = await m.stammdatenSpeichern("m-1", { city: "B" }, { city: "A" });
    expect(r.ok).toBe(false);
    expect(r.meldung).toBe("Nur Administratoren duerfen das.");
  });
});

describe("Rolle, Zahler, Mannschaft", () => {
  it("setzt die Adminrolle", async () => {
    expect(await m.rolleSetzen("m-1", false)).toEqual({ ok: true, meldung: "Verwaltungsrechte entzogen." });
    expect(rpc).toHaveBeenCalledWith("set_member_role", { p_member_id: "m-1", p_role: "admin", p_granted: false });
  });

  it("laesst den Zahler weg, wenn das Mitglied selbst zahlt", async () => {
    expect((await m.zahlerSetzen("m-1", null)).meldung).toBe("Zahlt jetzt selbst.");
    expect(rpc).toHaveBeenCalledWith("set_billing_payer", { p_member_id: "m-1", p_payer_id: undefined });
  });

  it("traegt ohne Mannschaft auch den Fuehrer aus", async () => {
    await m.mannschaftSetzen("m-1", null, true);
    expect(rpc).toHaveBeenCalledWith("set_member_team", { p_member_id: "m-1", p_team_id: undefined, p_is_captain: false });
  });
});

describe("bankverbindungAnlegen", () => {
  it("prueft die IBAN vorab", async () => {
    const r = await m.bankverbindungAnlegen("m-1", { iban: "DE00 1234 5678 9012 3456 78" });
    expect(r).toEqual({ ok: false, meldung: "Diese IBAN ist nicht gültig – bitte die Ziffern prüfen." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("verlangt eine IBAN", async () => {
    expect((await m.bankverbindungAnlegen("m-1", { iban: "  " })).meldung).toBe("Bitte eine IBAN eingeben.");
  });

  it("schickt die IBAN ohne Leerzeichen", async () => {
    const r = await m.bankverbindungAnlegen("m-1", { iban: "de89 3704 0044 0532 0130 00", holder: "", bank_name: "Sparkasse" });
    expect(r).toEqual({ ok: true, meldung: "Bankverbindung gespeichert." });
    expect(rpc).toHaveBeenCalledWith("add_bank_account", {
      p_member_id: "m-1", p_iban: "DE89370400440532013000", p_holder: undefined, p_bank_name: "Sparkasse",
    });
  });
});

describe("mandatErteilen und beitragsartZuordnen", () => {
  it("meldet die vergebene Mandatsreferenz", async () => {
    rpc.mockResolvedValue({ data: "TCM-0042", error: null });
    const r = await m.mandatErteilen("m-1", { konto: "k-1", signed_on: "29.09.2026" });
    expect(r).toEqual({ ok: true, meldung: "Mandat TCM-0042 erteilt." });
    expect(rpc).toHaveBeenCalledWith("create_sepa_mandate", {
      p_member_id: "m-1", p_bank_account_id: "k-1", p_reference: undefined, p_signed_on: "2026-09-29",
    });
  });

  it("rechnet den Sonderbetrag in Cent", async () => {
    rpc.mockResolvedValue({ data: [{ already_charged: false }], error: null });
    await m.beitragsartZuordnen("m-1", 2026, { fee_type: "f-1", override: "19,50", note: "" });
    expect(rpc).toHaveBeenCalledWith("set_member_fee", {
      p_member_id: "m-1", p_fee_type_id: "f-1", p_year: 2026, p_override_amount_cents: 1950, p_note: undefined,
    });
  });

  it("weist einen ungueltigen Sonderbetrag ab", async () => {
    const r = await m.beitragsartZuordnen("m-1", 2026, { fee_type: "f-1", override: "abc" });
    expect(r).toEqual({ ok: false, meldung: "Der Sonderbetrag ist keine gültige Zahl." });
  });
});

describe("Austritt", () => {
  it("nennt, was nach dem Beenden offen bleibt", async () => {
    rpc.mockResolvedValue({ data: [{ open_charges: 2, open_amount_cents: 12000, future_bookings: 1 }], error: null });
    const r = await m.mitgliedschaftBeenden("m-1", "31.12.2026", "Umzug");
    expect(rpc).toHaveBeenCalledWith("end_membership", { p_member_id: "m-1", p_ended_on: "2026-12-31", p_reason: "Umzug" });
    expect(r.meldung).toMatch(/^Mitgliedschaft beendet\. 2 Forderungen über 120,00\s€ bleiben offen\. 1 künftige Buchungen bestehen weiter\.$/);
  });

  it("loescht nur mit dem Nachnamen als Bestaetigung", async () => {
    await m.mitgliedLoeschen("m-1", "Meier");
    expect(rpc).toHaveBeenCalledWith("delete_member", { p_member_id: "m-1", p_confirm_name: "Meier" });
  });
});

describe("loginVerwalten", () => {
  it("schickt denselben Body wie das Web", async () => {
    invoke.mockResolvedValue({ data: { ok: true, meldung: "Einladung verschickt." }, error: null });
    const r = await m.loginVerwalten("m-1", "einladen");
    expect(invoke).toHaveBeenCalledWith("member-login", { body: { aktion: "einladen", memberId: "m-1" } });
    expect(r).toEqual({ ok: true, meldung: "Einladung verschickt." });
  });

  it("liest die Meldung auch aus einer Fehlerantwort", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: "Edge Function returned a non-2xx status code", context: { status: 403, json: async () => ({ ok: false, meldung: "Zugänge verwalten dürfen nur Administratoren." }) } },
    });
    expect(await m.loginVerwalten("m-1", "login_entfernen")).toEqual({
      ok: false, meldung: "Zugänge verwalten dürfen nur Administratoren.",
    });
  });

  it("sagt, wenn die Funktion nicht erreichbar ist", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("Failed to send a request to the Edge Function") });
    const r = await m.loginVerwalten("m-1", "einladen");
    expect(r.ok).toBe(false);
    expect(r.meldung).toBe("Die Zugangsverwaltung ist nicht erreichbar: Failed to send a request to the Edge Function");
  });
});

describe("antragAnnehmen", () => {
  it("laedt nach der Aufnahme ein und meldet beides", async () => {
    rpc.mockResolvedValue({ data: [{ member_id: "neu-1", membership_number: "1042", needs_invite: true }], error: null });
    invoke.mockResolvedValue({ data: { ok: false, meldung: "Keine E-Mail." }, error: null });
    const r = await m.antragAnnehmen("a-1", { number: "", started_on: "01.10.2026", fee_type: "f-1", einladen: true });
    expect(rpc).toHaveBeenCalledWith("accept_membership_application", {
      p_application_id: "a-1", p_number: undefined, p_fee_type_ids: ["f-1"], p_started_on: "2026-10-01",
    });
    expect(r).toEqual({
      ok: true,
      meldung: "Aufgenommen unter der Nummer 1042. Die Einladung ging nicht raus: Keine E-Mail.",
      daten: "neu-1",
    });
  });

  it("laedt nicht ein, wenn es abgewaehlt ist", async () => {
    rpc.mockResolvedValue({ data: [{ member_id: "neu-1", membership_number: "1042", needs_invite: true }], error: null });
    await m.antragAnnehmen("a-1", { einladen: false });
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("Mannschaften", () => {
  it("legt eine Mannschaft an und gibt die Kennung zurueck", async () => {
    rpc.mockResolvedValue({ data: "t-9", error: null });
    const r = await m.mannschaftSpeichern({ name: " Herren 30 ", sort_order: "2", stillgelegt: false });
    expect(r).toEqual({ ok: true, meldung: "„Herren 30\" gespeichert.", daten: "t-9" });
    expect(rpc).toHaveBeenCalledWith("upsert_team", { p_name: "Herren 30", p_id: undefined, p_active: true, p_sort_order: 2 });
  });

  it("verlangt einen Namen", async () => {
    expect((await m.mannschaftSpeichern({ name: "", sort_order: "", stillgelegt: false })).meldung).toBe("Der Name fehlt.");
  });

  it("nimmt einen Spieler heraus", async () => {
    expect((await m.spielerEntfernen("m-1")).meldung).toBe("Aus der Mannschaft genommen.");
    expect(rpc).toHaveBeenCalledWith("set_member_team", { p_member_id: "m-1", p_team_id: undefined });
  });
});

describe("zeilenHinweis", () => {
  const zeile = { has_login: true, mandat: true, offenCents: 0 } as Parameters<typeof m.zeilenHinweis>[0];
  it("fehlendes Mandat vor offenem Betrag vor fehlendem Zugang", () => {
    expect(m.zeilenHinweis({ ...zeile, mandat: false, offenCents: 500, has_login: false }, "aktiv")?.text).toBe("kein Mandat");
    expect(m.zeilenHinweis({ ...zeile, offenCents: 500, has_login: false }, "aktiv")?.ton).toBe("gold");
    expect(m.zeilenHinweis({ ...zeile, has_login: false }, "aktiv")?.text).toBe("kein Zugang");
    expect(m.zeilenHinweis({ ...zeile, mandat: false, has_login: false }, "ohne-login")?.text).toBe("kein Zugang");
    expect(m.zeilenHinweis(zeile, "aktiv")).toBeNull();
  });
});
