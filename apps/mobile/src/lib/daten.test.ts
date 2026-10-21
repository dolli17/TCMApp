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
  aendereSperre,
  akzeptiereDokumente,
  anmelden,
  bucheGetraenk,
  bucheplatz,
  entferneMerkmal,
  erteileMandat,
  hebeSperreAuf,
  ladeIchSelbst,
  ladeKontingent,
  ladeOnboarding,
  sageSerienterminAb,
  schliesseOnboardingAb,
  setzeMerkmal,
  setzeUm,
  spieleMit,
  speichereErziehungsberechtigte,
  speichereNotfallkontakt,
  speichereOnboardingNotfallkontakt,
  speichereOnboardingStammdaten,
  speichereStammdaten,
  speichereTennis,
  sperreStunde,
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

  // Angemeldet als Mitglied m-1, ohne Adminrolle, Onboarding erledigt.
  getUser.mockResolvedValue({ data: { user: { id: "auth-1" } } });
  einzelne.members = {
    data: { id: "m-1", onboarding_completed_at: "2026-01-01T10:00:00Z" },
    error: null,
  };
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

describe("ladeIchSelbst", () => {
  it("liefert ohne Rolle weder volle noch Platzrechte", async () => {
    expect(await ladeIchSelbst()).toEqual({
      id: "m-1", admin: false, platzRechte: false, onboardingErledigt: true,
    });
  });

  it("gibt dem Platzwart Platzrechte, aber keine vollen Rechte", async () => {
    listen.member_roles = { data: [{ role: "groundskeeper" }], error: null };
    expect(await ladeIchSelbst()).toMatchObject({ id: "m-1", admin: false, platzRechte: true });
  });

  it.each(["admin", "board"])("gibt %s volle und Platzrechte", async (rolle) => {
    listen.member_roles = { data: [{ role: rolle }], error: null };
    expect(await ladeIchSelbst()).toMatchObject({ id: "m-1", admin: true, platzRechte: true });
  });

  it("liefert ohne Anmeldung nichts", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await ladeIchSelbst()).toEqual({
      id: null, admin: false, platzRechte: false, onboardingErledigt: true,
    });
  });

  it("meldet ein offenes Onboarding", async () => {
    einzelne.members = { data: { id: "m-1", onboarding_completed_at: null }, error: null };
    expect(await ladeIchSelbst()).toMatchObject({ id: "m-1", onboardingErledigt: false });
  });

  it("liefert ohne Mitglied nichts, etwa am Kiosk", async () => {
    einzelne.members = { data: null, error: null };
    listen.member_roles = { data: [{ role: "admin" }], error: null };
    expect(await ladeIchSelbst()).toEqual({
      id: null, admin: false, platzRechte: false, onboardingErledigt: true,
    });
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

  it("gibt den Grund getrimmt an die RPC weiter", async () => {
    rpc.mockResolvedValue({ error: null });
    const r = await storniereBuchung("b1", "  Platz unter Wasser ");

    expect(rpc).toHaveBeenCalledWith("cancel_booking", {
      p_booking_id: "b1",
      p_reason: "Platz unter Wasser",
    });
    expect(r).toEqual({ ok: true, meldung: "Buchung storniert." });
  });

  it("schickt ohne Grund keinen leeren Text", async () => {
    rpc.mockResolvedValue({ error: null });
    await storniereBuchung("b1", "   ");
    expect(rpc).toHaveBeenCalledWith("cancel_booking", { p_booking_id: "b1", p_reason: undefined });
  });
});

describe("sperreStunde", () => {
  const STUNDE = {
    platzId: "p1",
    von: new Date("2026-08-11T15:00:00Z"),
    bis: new Date("2026-08-11T16:00:00Z"),
    typCode: "verbandsspiel",
    grund: "  ",
    verdraengen: false,
  };

  it("schickt die gewaehlte Kategorie und einen leeren Grund", async () => {
    rpc.mockResolvedValue({ error: null });
    const r = await sperreStunde(STUNDE);
    expect(rpc).toHaveBeenCalledWith("create_blocking", {
      p_court_ids: ["p1"],
      p_von: "2026-08-11T15:00:00.000Z",
      p_bis: "2026-08-11T16:00:00.000Z",
      p_type_code: "verbandsspiel",
      p_title: "",
      p_force: false,
    });
    expect(r).toEqual({ ok: true, meldung: "Gesperrt." });
  });

  it("nennt die Zahl der Buchungen, die im Weg liegen", async () => {
    rpc.mockResolvedValue({
      error: { code: "23P01", message: "2 Buchungen liegen in diesem Zeitraum. Bestaetige das Verdraengen." },
    });
    const r = await sperreStunde(STUNDE);
    expect(r.ok).toBe(false);
    expect(r.kollisionen).toBe(2);
  });
});

describe("aendereSperre", () => {
  const AENDERUNG = {
    bookingId: "s1",
    platzIds: ["p1", "p2"],
    von: new Date("2026-08-11T15:00:00Z"),
    bis: new Date("2026-08-11T17:00:00Z"),
    typCode: "platzpflege",
    grund: " Regen ",
    verdraengen: true,
  };

  it("reicht alles an update_blocking durch", async () => {
    rpc.mockResolvedValue({ data: [{ created_count: 1, displaced_count: 0 }], error: null });
    const r = await aendereSperre(AENDERUNG);
    expect(rpc).toHaveBeenCalledWith("update_blocking", {
      p_booking_id: "s1",
      p_court_ids: ["p1", "p2"],
      p_von: "2026-08-11T15:00:00.000Z",
      p_bis: "2026-08-11T17:00:00.000Z",
      p_type_code: "platzpflege",
      p_title: "Regen",
      p_force: true,
    });
    expect(r).toEqual({ ok: true, meldung: "Sperrung geändert." });
  });

  it("meldet, wie viele Buchungen verdraengt wurden", async () => {
    rpc.mockResolvedValue({ data: [{ created_count: 0, displaced_count: 1 }], error: null });
    expect((await aendereSperre(AENDERUNG)).meldung).toBe("Sperrung geändert, 1 Buchung verdrängt.");
  });

  it("nennt ohne Bestaetigung die Zahl der Kollisionen", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "23P01", message: "3 Buchungen liegen in diesem Zeitraum. Bestaetige das Verdraengen." },
    });
    const r = await aendereSperre({ ...AENDERUNG, verdraengen: false });
    expect(r).toMatchObject({ ok: false, kollisionen: 3 });
  });

  it("gibt andere Fehler ohne Kollisionszahl weiter", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "22023", message: "Das Ende muss nach dem Beginn liegen." },
    });
    const r = await aendereSperre(AENDERUNG);
    expect(r.ok).toBe(false);
    expect(r.kollisionen).toBeUndefined();
  });
});

describe("hebeSperreAuf", () => {
  it("hebt ueber cancel_booking auf und sagt es so", async () => {
    rpc.mockResolvedValue({ error: null });
    const r = await hebeSperreAuf("s1");
    expect(rpc).toHaveBeenCalledWith("cancel_booking", { p_booking_id: "s1" });
    expect(r).toEqual({ ok: true, meldung: "Die Sperrung ist aufgehoben." });
  });
});

describe("sageSerienterminAb", () => {
  it("ruft cancel_series_occurrence mit Grund auf", async () => {
    rpc.mockResolvedValue({ error: null });
    const r = await sageSerienterminAb("b-7", " Ferien ");

    expect(rpc).toHaveBeenCalledWith("cancel_series_occurrence", {
      p_booking_id: "b-7",
      p_reason: "Ferien",
    });
    expect(r).toEqual({ ok: true, meldung: "Der Termin ist abgesagt." });
  });

  it("laesst den Grund weg, wenn keiner da ist", async () => {
    rpc.mockResolvedValue({ error: null });
    await sageSerienterminAb("b-7");
    expect(rpc).toHaveBeenCalledWith("cancel_series_occurrence", {
      p_booking_id: "b-7",
      p_reason: undefined,
    });
  });

  it("meldet einen Fehler der Datenbank", async () => {
    rpc.mockResolvedValue({
      error: { code: "42501", message: "Nur Administratoren duerfen Serientermine absagen." },
    });
    const r = await sageSerienterminAb("b-7");
    expect(r.ok).toBe(false);
    expect(r.meldung).not.toBe("");
  });
});

describe("setzeUm", () => {
  it("bildet die Startzeit in Berliner Zeit, im Sommer wie im Winter", async () => {
    rpc.mockResolvedValue({ error: null });

    // 15:00 Uhr in Berlin: im Sommer 13:00 UTC, im Winter 14:00 UTC.
    const r = await setzeUm({ bookingId: "b1", platzId: "p2", tag: "2026-07-01", minute: 15 * 60 });
    expect(rpc).toHaveBeenCalledWith("move_booking", {
      p_booking_id: "b1",
      p_court_id: "p2",
      p_starts_at: "2026-07-01T13:00:00.000Z",
      p_reason: undefined,
    });
    expect(r).toEqual({ ok: true, meldung: "Die Buchung ist umgesetzt." });

    await setzeUm({ bookingId: "b1", platzId: "p2", tag: "2026-12-01", minute: 15 * 60 });
    expect(rpc).toHaveBeenLastCalledWith(
      "move_booking",
      expect.objectContaining({ p_starts_at: "2026-12-01T14:00:00.000Z" }),
    );
  });

  it("gibt den Grund getrimmt weiter und schickt keinen leeren", async () => {
    rpc.mockResolvedValue({ error: null });
    await setzeUm({ bookingId: "b1", platzId: "p2", tag: "2026-07-01", minute: 600, grund: "  Platz 3 nass " });
    expect(rpc).toHaveBeenLastCalledWith(
      "move_booking",
      expect.objectContaining({ p_reason: "Platz 3 nass" }),
    );

    await setzeUm({ bookingId: "b1", platzId: "p2", tag: "2026-07-01", minute: 600, grund: "   " });
    expect(rpc).toHaveBeenLastCalledWith(
      "move_booking",
      expect.objectContaining({ p_reason: undefined }),
    );
  });

  it("meldet einen belegten Platz verstaendlich", async () => {
    rpc.mockResolvedValue({
      error: { code: "23P01", message: "Dieser Platz ist zu der Zeit bereits belegt." },
    });
    const r = await setzeUm({ bookingId: "b1", platzId: "p2", tag: "2026-07-01", minute: 600 });
    expect(r).toEqual({ ok: false, meldung: "Dieser Platz ist zu der Zeit bereits belegt." });
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

describe("Onboarding", () => {
  const STAMMDATEN = {
    first_name: " Lena ", last_name: "Kurz", title: "", birthday: "03.04.2014",
    gender: "female" as const, street: "Hauptstr. 1", postcode: "76456", city: "Kuppenheim",
    phone: "", mobile: "0170 123",
  };

  it("lädt den Zustand aus my_onboarding", async () => {
    rpc.mockResolvedValue({ data: { minderjaehrig: true }, error: null });
    expect(await ladeOnboarding()).toEqual({ minderjaehrig: true });
    expect(rpc).toHaveBeenCalledWith("my_onboarding");
  });

  it("liefert null ohne Mitglied", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await ladeOnboarding()).toBeNull();
  });

  it("wirft beim Laden einen Satz", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Nicht angemeldet." } });
    await expect(ladeOnboarding()).rejects.toThrow("Nicht angemeldet.");
  });

  it("speichert Stammdaten mit ISO-Datum und ohne leere Felder", async () => {
    rpc.mockResolvedValue({ error: null });
    const r = await speichereOnboardingStammdaten(STAMMDATEN);
    expect(r.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("onboarding_save_stammdaten", {
      p_first_name: "Lena",
      p_last_name: "Kurz",
      p_birthday: "2014-04-03",
      p_gender: "female",
      p_street: "Hauptstr. 1",
      p_postcode: "76456",
      p_city: "Kuppenheim",
      p_phone: undefined,
      p_mobile: "0170 123",
      p_title: undefined,
    });
  });

  it("weist ein unlesbares Geburtsdatum ab, bevor es zur Datenbank geht", async () => {
    const r = await speichereOnboardingStammdaten({ ...STAMMDATEN, birthday: "31.02.2014" });
    expect(r).toEqual({ ok: false, meldung: "Bitte das Geburtsdatum als TT.MM.JJJJ angeben." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("liest ein zweistelliges Jahr nicht als Zukunft", async () => {
    const r = await speichereOnboardingStammdaten({ ...STAMMDATEN, birthday: "03.04.85" });
    expect(r.ok).toBe(false);
    expect(r.meldung).toContain("vierstellig");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("verlangt ein Geschlecht", async () => {
    const r = await speichereOnboardingStammdaten({ ...STAMMDATEN, gender: "" });
    expect(r).toEqual({ ok: false, meldung: "Bitte das Geschlecht wählen." });
  });

  it("reicht die Meldung der Datenbank durch", async () => {
    rpc.mockResolvedValue({ error: { code: "22023", message: "Pflichtangaben fehlen: Strasse." } });
    const r = await speichereOnboardingStammdaten(STAMMDATEN);
    expect(r).toEqual({ ok: false, meldung: "Pflichtangaben fehlen: Strasse." });
  });

  it("stimmt nur den genannten Texten zu", async () => {
    rpc.mockResolvedValue({ error: null });
    await akzeptiereDokumente(["satzung", "datenschutz"]);
    expect(rpc).toHaveBeenCalledWith("onboarding_accept_documents", {
      p_codes: ["satzung", "datenschutz"],
    });
  });

  it("ruft ohne offene Texte nichts auf", async () => {
    expect(await akzeptiereDokumente([])).toEqual({ ok: true, meldung: "" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("speichert die Erziehungsberechtigten mit Zustimmung", async () => {
    rpc.mockResolvedValue({ error: null });
    await speichereErziehungsberechtigte({ name: " Eva Kurz ", email: "", phone: "0721 1", zustimmung: true });
    expect(rpc).toHaveBeenCalledWith("onboarding_save_guardian", {
      p_name: "Eva Kurz",
      p_email: undefined,
      p_phone: "0721 1",
      p_consent: true,
    });
  });

  it("speichert den Notfallkontakt über die RPC", async () => {
    rpc.mockResolvedValue({ error: null });
    await speichereOnboardingNotfallkontakt({ name: "Eva", phone: "0721 1", relation: "" });
    expect(rpc).toHaveBeenCalledWith("onboarding_save_notfallkontakt", {
      p_name: "Eva",
      p_phone: "0721 1",
      p_relation: undefined,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("erteilt das Mandat und liefert die Referenz", async () => {
    rpc.mockResolvedValue({ data: "TCM-0042-01", error: null });
    const r = await erteileMandat({ iban: "DE89 3704 0044 0532 0130 00", kontoinhaber: "", bestaetigt: true });
    expect(r).toEqual({ ok: true, meldung: "Das Mandat ist erteilt.", daten: "TCM-0042-01" });
    expect(rpc).toHaveBeenCalledWith("create_my_sepa_mandate", {
      p_iban: "DE89 3704 0044 0532 0130 00",
      p_holder: undefined,
      p_accept: true,
    });
  });

  it("erteilt ohne Bestätigung oder mit falscher IBAN nichts", async () => {
    expect((await erteileMandat({ iban: "DE89370400440532013000", kontoinhaber: "", bestaetigt: false })).ok).toBe(false);
    const r = await erteileMandat({ iban: "DE00 1234", kontoinhaber: "", bestaetigt: true });
    expect(r.meldung).toContain("IBAN");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("speichert Tennisangaben", async () => {
    rpc.mockResolvedValue({ error: null });
    await speichereTennis({ lk: " 18,4 ", nuligaId: "", mannschaftInteresse: true });
    expect(rpc).toHaveBeenCalledWith("save_my_tennis", {
      p_tennis_lk: "18,4",
      p_nuliga_id: undefined,
      p_mannschaft_interesse: true,
    });
  });

  it("schaltet das Konto frei", async () => {
    rpc.mockResolvedValue({ data: "2026-10-14T10:00:00Z", error: null });
    expect(await schliesseOnboardingAb()).toEqual({ ok: true, meldung: "Dein Konto ist freigeschaltet." });
    expect(rpc).toHaveBeenCalledWith("complete_onboarding");
  });

  it("nennt beim Abschluss die fehlenden Schritte aus dem DETAIL", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "Es fehlt noch: Satzung, Beitragsordnung und Datenschutz, SEPA-Lastschriftmandat.",
        details: "rechtliches,sepa",
      },
    });
    const r = await schliesseOnboardingAb();
    expect(r.ok).toBe(false);
    expect(r.meldung).toContain("Es fehlt noch");
    expect(r.fehlt).toEqual(["rechtliches", "sepa"]);
  });

  it("lässt fehlt weg, wenn das DETAIL nichts Bekanntes enthält", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Nur Mitglieder haben ein Onboarding." } });
    const r = await schliesseOnboardingAb();
    expect(r).toEqual({ ok: false, meldung: "Nur Mitglieder haben ein Onboarding." });
  });
});
