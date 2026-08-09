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
const getUser = vi.fn();
/** Schreibt mit, was an .update() ging - je Tabelle. */
const update = vi.fn();

/** Was eine Abfrage je Tabelle zurueckgibt; die Tests setzen das nach Bedarf. */
let listen: Record<string, unknown> = {};
let einzelne: Record<string, unknown> = {};

/**
 * Eine Kette, die auf alles reagiert, was die Datenschicht aufruft.
 *
 * Der echte Abfragebauer von Supabase ist selbst wartbar - er laesst sich
 * awaiten, ohne dass eine Endmethode aufgerufen wurde. Das bildet `then` nach;
 * ohne das haengt jedes `await supabase.from(...).update(...).eq(...)`.
 */
function kette(tabelle: string) {
  const k: Record<string, unknown> = {
    select: () => k,
    eq: () => k,
    is: () => k,
    order: () => k,
    limit: () => k,
    maybeSingle: () => Promise.resolve(einzelne[tabelle] ?? { data: null, error: null }),
    update: (patch: unknown) => {
      update(tabelle, patch);
      return k;
    },
    then: (aufloesen: (w: unknown) => unknown) =>
      Promise.resolve(listen[tabelle] ?? { data: [], error: null }).then(aufloesen),
  };
  return k;
}

vi.mock("./supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: {
      signInWithPassword: (...args: unknown[]) => signIn(...args),
      getUser: () => getUser(),
    },
    from: (tabelle: string) => kette(tabelle),
  },
  istKonfiguriert: () => true,
}));

const {
  aendereMitspieler,
  anmelden,
  bucheGetraenk,
  bucheplatz,
  entferneMerkmal,
  ladeKontingent,
  setzeMerkmal,
  spieleMit,
  speichereNotfallkontakt,
  speichereStammdaten,
  storniereBuchung,
  storniereGetraenk,
  sucheMitspieler,
  verlasseBuchung,
} = await import("./daten");

/** Stammdaten, wie sie aus der Datenbank kaemen. */
const STAMM = {
  first_name: "Anna", last_name: "Meier", title: "", phone: "", mobile: "",
  street: "Hauptstr. 1", postcode: "76456", city: "Kuppenheim",
};

beforeEach(() => {
  rpc.mockReset();
  signIn.mockReset();
  getUser.mockReset();
  update.mockReset();

  listen = {};
  einzelne = {};

  // Angemeldet als Mitglied m-1, ohne Adminrolle.
  getUser.mockResolvedValue({ data: { user: { id: "auth-1" } } });
  einzelne.members = { data: { id: "m-1" }, error: null };
  listen.member_roles = { data: [], error: null };
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
      p_partner_wanted: false,
    });
  });

  it("gibt weiter, dass Mitspieler gesucht werden", async () => {
    rpc.mockResolvedValue({ data: "neue-id", error: null });

    await bucheplatz("platz-1", new Date(), "doppel", [], [], true);

    expect(rpc).toHaveBeenCalledWith(
      "create_booking",
      expect.objectContaining({ p_partner_wanted: true }),
    );
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

describe("aendereMitspieler", () => {
  it("schickt Mitglieder und Gaeste getrennt an die RPC", async () => {
    rpc.mockResolvedValue({ error: null });
    await aendereMitspieler("b-1", ["m-1", "m-2"], ["Gast Meier"]);

    expect(rpc).toHaveBeenCalledWith("update_booking_players", {
      p_booking_id: "b-1",
      p_member_ids: ["m-1", "m-2"],
      p_guest_names: ["Gast Meier"],
    });
  });

  it("wirft leere Gastnamen weg und schneidet Leerzeichen ab", async () => {
    // Ein leerer Name wuerde in der Datenbank auf einen Fehler laufen; das
    // passiert regelmaessig, wenn jemand das Feld antippt und wieder verlaesst.
    rpc.mockResolvedValue({ error: null });
    await aendereMitspieler("b-1", [], ["  Anna Gast  ", "   ", ""]);

    expect(rpc).toHaveBeenCalledWith("update_booking_players", {
      p_booking_id: "b-1",
      p_member_ids: [],
      p_guest_names: ["Anna Gast"],
    });
  });

  it("uebersetzt einen Datenbankfehler in einen lesbaren Satz", async () => {
    rpc.mockResolvedValue({
      error: { code: "42501", message: "Du kannst nur deine eigenen Buchungen aendern." },
    });
    const r = await aendereMitspieler("b-1", ["m-1"]);
    expect(r.ok).toBe(false);
    expect(r.meldung).toContain("eigenen Buchungen");
  });
});

describe("Mitspieler suchen und beitreten", () => {
  it("reicht join_booking durch", async () => {
    rpc.mockResolvedValue({ error: null });
    const r = await spieleMit("buchung-1");
    expect(r.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("join_booking", { p_booking_id: "buchung-1" });
  });

  it("übersetzt eine volle Buchung in einen ganzen Satz", async () => {
    rpc.mockResolvedValue({
      error: { code: "23514", message: "Diese Buchung ist bereits voll." },
    });
    const r = await spieleMit("buchung-1");
    expect(r.ok).toBe(false);
    expect(r.meldung).toBe("Diese Buchung ist bereits voll.");
  });

  it("schaltet die Ausschreibung an und wieder aus", async () => {
    rpc.mockResolvedValue({ error: null });

    const an = await sucheMitspieler("buchung-1", true);
    expect(rpc).toHaveBeenCalledWith("set_partner_wanted", {
      p_booking_id: "buchung-1",
      p_wanted: true,
    });
    expect(an.meldung).toContain("offenen Spielen");

    const aus = await sucheMitspieler("buchung-1", false);
    expect(aus.meldung).toContain("nicht mehr ausgeschrieben");
  });
});

describe("sich austragen", () => {
  it("benutzt leave_booking, nicht den Mitspielertausch", async () => {
    // update_booking_players gehört dem Bucher und würde einem Mitspieler
    // erlauben, die ganze Besetzung umzuwerfen.
    rpc.mockResolvedValue({ error: null });
    await verlasseBuchung("buchung-1");
    expect(rpc).toHaveBeenCalledWith("leave_booking", { p_booking_id: "buchung-1" });
  });

  it("reicht die Begründung der Datenbank durch", async () => {
    rpc.mockResolvedValue({
      error: {
        code: "23514",
        message: "Ohne dich waeren es zu wenige Spieler. Bitte sag dem Bucher Bescheid.",
      },
    });
    const r = await verlasseBuchung("buchung-1");
    expect(r.ok).toBe(false);
    expect(r.meldung).toContain("zu wenige Spieler");
  });
});

describe("speichereStammdaten", () => {
  it("schickt nur geänderte Spalten", async () => {
    // Die zentrale Regel: der Trigger guard_member_self_update weist den
    // ganzen Vorgang ab, sobald eine Spalte dabei ist, die er nicht kennt.
    // Ein vollständiger Datensatz käme also nie durch.
    listen.members = { data: null, error: null };
    await speichereStammdaten({ ...STAMM, city: "Rastatt" }, STAMM);
    expect(update).toHaveBeenCalledWith("members", { city: "Rastatt" });
  });

  it("meldet, wenn sich nichts geändert hat", async () => {
    const r = await speichereStammdaten(STAMM, STAMM);
    expect(r.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("weist eine vierstellige Postleitzahl ab, bevor sie die Datenbank sieht", async () => {
    const r = await speichereStammdaten({ ...STAMM, postcode: "7645" }, STAMM);
    expect(r.ok).toBe(false);
    expect(r.meldung).toContain("fünfstellig");
    expect(update).not.toHaveBeenCalled();
  });

  it("macht aus einem geleerten Feld null, nicht den leeren Text", async () => {
    // Die Spalten sind nullable; ein leerer Text wäre ein Wert und würde
    // etwa in der Adressliste als gesetzte, aber leere Straße erscheinen.
    listen.members = { data: null, error: null };
    await speichereStammdaten({ ...STAMM, street: "" }, STAMM);
    expect(update).toHaveBeenCalledWith("members", { street: null });
  });

  it("lässt Vor- und Nachname nie leer werden", async () => {
    const r = await speichereStammdaten({ ...STAMM, first_name: "" }, STAMM);
    expect(r.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("speichereNotfallkontakt", () => {
  it("verlangt einen Namen zur Nummer", async () => {
    // Denselben Constraint hat die Datenbank; hier kommt der Satz früher und
    // erklärt sich selbst.
    const r = await speichereNotfallkontakt({
      emergency_contact_name: "",
      emergency_contact_phone: "0170 1234567",
      emergency_contact_relation: "",
    });
    expect(r.ok).toBe(false);
    expect(r.meldung).toContain("Name");
    expect(update).not.toHaveBeenCalled();
  });

  it("speichert Name und Nummer zusammen", async () => {
    listen.members = { data: null, error: null };
    await speichereNotfallkontakt({
      emergency_contact_name: "Bernd Meier",
      emergency_contact_phone: "0170 1234567",
      emergency_contact_relation: "Ehemann",
    });
    expect(update).toHaveBeenCalledWith("members", {
      emergency_contact_name: "Bernd Meier",
      emergency_contact_phone: "0170 1234567",
      emergency_contact_relation: "Ehemann",
    });
  });
});

describe("Merkmale", () => {
  it("setzt ein Merkmal für das eigene Mitglied", async () => {
    rpc.mockResolvedValue({ error: null });
    await setzeMerkmal("newsletter", "true");
    expect(rpc).toHaveBeenCalledWith("set_member_attribute", {
      p_member_id: "m-1",
      p_type_code: "newsletter",
      p_option_value: "true",
      p_text_value: undefined,
    });
  });

  it("entfernt ein Merkmal", async () => {
    rpc.mockResolvedValue({ error: null });
    await entferneMerkmal("newsletter");
    expect(rpc).toHaveBeenCalledWith("remove_member_attribute", {
      p_member_id: "m-1",
      p_type_code: "newsletter",
      p_option_value: undefined,
    });
  });
});

describe("Getränke", () => {
  it("reicht die Menge durch", async () => {
    rpc.mockResolvedValue({ error: null });
    await bucheGetraenk("artikel-1", 3);
    expect(rpc).toHaveBeenCalledWith("record_drink_purchase", {
      p_item_id: "artikel-1",
      p_quantity: 3,
    });
  });

  it("nimmt eine Entnahme mit Grund zurück", async () => {
    rpc.mockResolvedValue({ error: null });
    await storniereGetraenk("kauf-1");
    expect(rpc).toHaveBeenCalledWith("void_drink_purchase", {
      p_purchase_id: "kauf-1",
      p_reason: "Fehlbuchung",
    });
  });

  it("übersetzt das abgelaufene Stornofenster", async () => {
    rpc.mockResolvedValue({
      error: { code: "P0001", message: "Das Stornofenster ist abgelaufen." },
    });
    const r = await storniereGetraenk("kauf-1");
    expect(r.ok).toBe(false);
    expect(r.meldung).toContain("Stornofenster");
  });
});
