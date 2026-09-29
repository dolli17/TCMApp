/**
 * System und Merkmale gegen einen nachgebildeten Client: Aufteilung der
 * Einstellungen wie im Web, Merkmale samt Werteliste, Loeschen.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
  istKonfiguriert: () => true,
}));

const { gruppiereEinstellungen, leseOptionen, merkmalLoeschen, merkmalSpeichern, optionenAlsText } =
  await import("./system");

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
});

const einstellung = (key: string) => ({
  key, value: 1, value_type: "integer", label: null, description: null, updated_at: null,
});

describe("gruppiereEinstellungen", () => {
  it("verteilt auf die Gruppen, laesst Fremdes weg und sammelt Unbekanntes", () => {
    const bloecke = gruppiereEinstellungen([
      einstellung("booking.max_days"),
      einstellung("notifications.mail"),
      einstellung("privacy.log_days"),
      einstellung("sepa.creditor_id"),
      einstellung("neu.irgendwas"),
      einstellung("work_duty.hourly_rate_cents"),
    ]);
    expect(bloecke.map((b) => [b.titel, b.eintraege.map((e) => e.key)])).toEqual([
      ["Benachrichtigungen", ["notifications.mail"]],
      ["Arbeitsdienst", ["work_duty.hourly_rate_cents"]],
      ["Datenschutz", ["privacy.log_days"]],
      ["Weitere", ["neu.irgendwas"]],
    ]);
  });

  it("zeigt leere Gruppen nicht", () => {
    expect(gruppiereEinstellungen([einstellung("privacy.x")]).map((b) => b.titel)).toEqual(["Datenschutz"]);
  });
});

describe("Werteliste", () => {
  it("liest Zeilen mit und ohne Anzeigetext", () => {
    expect(leseOptionen("silber = Silberne Nadel\n\n gold \n= leer\nx = a = b")).toEqual([
      { value: "silber", label: "Silberne Nadel" },
      { value: "gold", label: "gold" },
      { value: "x", label: "a = b" },
    ]);
  });

  it("schreibt sie zurueck", () => {
    expect(optionenAlsText([{ value: "a", label: "A" }, { value: "b", label: "b" }])).toBe("a = A\nb");
  });
});

const EINGABE = {
  code: " foto ",
  name: " Fotoeinwilligung ",
  description: "Fotos auf der Website",
  value_kind: "list" as const,
  multiple: true,
  self_editable: true,
  in_application: false,
  stillgelegt: false,
  sort_order: "3",
  optionen: "ja = Ja\nnein",
};

describe("merkmalSpeichern", () => {
  it("legt an und setzt die Werteliste", async () => {
    rpc.mockResolvedValueOnce({ data: "typ-1", error: null }).mockResolvedValueOnce({ data: 2, error: null });
    const e = await merkmalSpeichern(EINGABE);
    expect(rpc).toHaveBeenNthCalledWith(1, "upsert_member_attribute_type", {
      p_code: "foto",
      p_name: "Fotoeinwilligung",
      p_description: "Fotos auf der Website",
      p_value_kind: "list",
      p_multiple: true,
      p_self_editable: true,
      p_in_application: false,
      p_active: true,
      p_sort_order: 3,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "set_member_attribute_options", {
      p_type_id: "typ-1",
      p_options: [{ value: "ja", label: "Ja" }, { value: "nein", label: "nein" }],
    });
    expect(e).toEqual({ ok: true, meldung: "„Fotoeinwilligung\" gespeichert." });
  });

  it("setzt bei anderen Arten keine Werteliste und legt still", async () => {
    rpc.mockResolvedValueOnce({ data: "typ-1", error: null });
    await merkmalSpeichern({ ...EINGABE, value_kind: "boolean", stillgelegt: true, sort_order: "" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_active: false, p_sort_order: 0, p_value_kind: "boolean" });
  });

  it("verlangt Schluessel und Name", async () => {
    expect(await merkmalSpeichern({ ...EINGABE, code: " " })).toEqual({ ok: false, meldung: "Der Schlüssel fehlt." });
    expect(await merkmalSpeichern({ ...EINGABE, name: "" })).toEqual({ ok: false, meldung: "Der Name fehlt." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uebersetzt Fehler beider Schritte", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Bitte beschreiben, wofuer dieses Merkmal gebraucht wird.", code: "22023" } });
    const e = await merkmalSpeichern(EINGABE);
    expect(e.ok).toBe(false);
    expect(e.meldung).toContain("Bitte beschreiben");
    expect(rpc).toHaveBeenCalledTimes(1);

    rpc.mockReset();
    rpc.mockResolvedValueOnce({ data: "typ-1", error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "kaputt", code: "22023" } });
    expect((await merkmalSpeichern(EINGABE)).ok).toBe(false);
  });
});

describe("merkmalLoeschen", () => {
  it("ruft delete_member_attribute_type", async () => {
    const e = await merkmalLoeschen("foto");
    expect(rpc).toHaveBeenCalledWith("delete_member_attribute_type", { p_code: "foto" });
    expect(e.meldung).toBe("Merkmal gelöscht.");
  });

  it("reicht die Zahl der Verwendungen durch", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: '3 Mitglieder haben einen Wert zu "Foto". Das Merkmal laesst sich deshalb nur stilllegen, nicht loeschen.', code: "23514" },
    });
    const e = await merkmalLoeschen("foto");
    expect(e.ok).toBe(false);
    expect(e.meldung).toContain("3 Mitglieder");
  });
});
