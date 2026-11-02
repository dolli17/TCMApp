import { describe, expect, it } from "vitest";
import { notificationSymbol, notificationWebZiel } from "./home";
import {
  einladungHinweis,
  einladungTitel,
  istMannschaftsNachricht,
  kandidatMarken,
  mannschaftEintragSichtbar,
  mannschaftKurzfassung,
  mannschaftsfuehrerHinweis,
  meineMannschaftLesen,
  telefonHref,
  verfallText,
  type MeineMannschaftsEinladung,
} from "./mannschaft";

const einladung = (teil: Partial<MeineMannschaftsEinladung> = {}): MeineMannschaftsEinladung => ({
  id: "i1",
  team_id: "t1",
  team_name: "Herren 40",
  eingeladen_von: "Lukas Meier",
  created_at: "2026-11-01T10:00:00Z",
  expires_at: "2026-12-01T10:00:00Z",
  wechsel_von: null,
  annehmen_moeglich: true,
  hinweis: null,
  ...teil,
});

describe("einladungHinweis", () => {
  it("ohne Wechsel kein Hinweis", () => {
    expect(einladungHinweis(einladung())).toBeNull();
  });

  it("nennt den Wechsel", () => {
    expect(einladungHinweis(einladung({ wechsel_von: "Herren 30" }))).toEqual({
      text: "Du wechselst damit aus Herren 30 in Herren 40.",
      sperrt: false,
    });
  });

  it("MF-Sperre: Text aus der Datenbank geht vor", () => {
    expect(
      einladungHinweis(einladung({ wechsel_von: "Herren 30", annehmen_moeglich: false, hinweis: "Aus der DB." })),
    ).toEqual({ text: "Aus der DB.", sperrt: true });
  });

  it("MF-Sperre ohne Text aus der Datenbank", () => {
    expect(einladungHinweis(einladung({ wechsel_von: "Herren 30", annehmen_moeglich: false }))).toEqual({
      text: "Du bist Mannschaftsführer von Herren 30. Das kann nur der Vorstand ändern.",
      sperrt: true,
    });
  });
});

describe("einladungTitel", () => {
  it("nennt den Einladenden", () => {
    expect(einladungTitel(einladung())).toBe("Lukas Meier lädt dich in die Mannschaft Herren 40 ein.");
  });
  it("ohne Einladenden", () => {
    expect(einladungTitel(einladung({ eingeladen_von: null }))).toBe("Einladung in die Mannschaft Herren 40.");
  });
});

describe("verfallText", () => {
  const jetzt = new Date("2026-11-02T12:00:00Z");
  it("zählt die ganzen Tage", () => {
    expect(verfallText("2026-11-30T12:00:00Z", jetzt)).toBe("verfällt in 28 Tagen");
    expect(verfallText("2026-11-03T18:00:00Z", jetzt)).toBe("verfällt morgen");
    expect(verfallText("2026-11-02T20:00:00Z", jetzt)).toBe("verfällt heute");
    expect(verfallText("2026-11-01T20:00:00Z", jetzt)).toBe("verfallen");
    expect(verfallText("kaputt", jetzt)).toBe("");
  });
});

describe("kandidatMarken", () => {
  it("eingeladen, Interesse, andere Mannschaft", () => {
    expect(
      kandidatMarken({
        member_id: "m",
        first_name: "A",
        last_name: "B",
        tennis_lk: null,
        mannschaft_interesse: true,
        aktuelle_mannschaft: "Damen",
        eingeladen: true,
      }).map((m) => m.text),
    ).toEqual(["eingeladen", "Interesse", "spielt in Damen"]);
  });
  it("ohne alles keine Marke", () => {
    expect(
      kandidatMarken({
        member_id: "m",
        first_name: "A",
        last_name: "B",
        tennis_lk: null,
        mannschaft_interesse: false,
        aktuelle_mannschaft: null,
        eingeladen: false,
      }),
    ).toEqual([]);
  });
});

describe("telefonHref", () => {
  it("räumt die Schreibweise auf", () => {
    expect(telefonHref("0171 / 123 45-6")).toBe("tel:0171123456");
    expect(telefonHref("+49 (171) 12345")).toBe("tel:+4917112345");
    expect(telefonHref("0049 171 12345")).toBe("tel:+4917112345");
  });
  it("ohne Ziffern kein Link", () => {
    expect(telefonHref(null)).toBeNull();
    expect(telefonHref("")).toBeNull();
    expect(telefonHref("—")).toBeNull();
  });
});

describe("mannschaftKurzfassung und Sichtbarkeit", () => {
  const m = { name: "Herren 40", ich_bin_mf: false, offene_einladungen: [] };
  it("Spieler", () => {
    expect(mannschaftKurzfassung(m, 0)).toBe("Herren 40");
  });
  it("MF mit offenen Einladungen", () => {
    const offen = { id: "", member_id: "", first_name: "", last_name: "", created_at: "", expires_at: "" };
    expect(mannschaftKurzfassung({ ...m, ich_bin_mf: true, offene_einladungen: [offen, offen] }, 0)).toBe(
      "Herren 40 · Mannschaftsführer · 2 Einladungen offen",
    );
  });
  it("nur eine Einladung", () => {
    expect(mannschaftKurzfassung(null, 1)).toBe("1 neue Einladung");
    expect(mannschaftKurzfassung(null, 0)).toBeUndefined();
  });
  it("sichtbar mit Mannschaft oder Einladung", () => {
    expect(mannschaftEintragSichtbar(null, 0)).toBe(false);
    expect(mannschaftEintragSichtbar(null, 2)).toBe(true);
    expect(mannschaftEintragSichtbar(meineMannschaftLesen({ team_id: "t", name: "X" }), 0)).toBe(true);
  });
});

describe("meineMannschaftLesen", () => {
  it("ohne Mannschaft null", () => {
    expect(meineMannschaftLesen(null)).toBeNull();
    expect(meineMannschaftLesen({})).toBeNull();
    expect(meineMannschaftLesen([])).toBeNull();
  });

  it("liest Kader und Einladungen, fehlende Felder werden sicher", () => {
    const m = meineMannschaftLesen({
      team_id: "t1",
      name: "Herren 40",
      ich_bin_mf: true,
      telefon_sichtbar: false,
      kader: [
        { member_id: "a", first_name: "Anna", last_name: "Alt", tennis_lk: "LK10", is_team_captain: true, telefon: "0171" },
        { member_id: "b", first_name: "Ben", last_name: "Bau", tennis_lk: null, is_team_captain: false, telefon: null },
        "kaputt",
      ],
    });
    expect(m?.kader).toHaveLength(2);
    expect(m?.kader[0]).toEqual({
      member_id: "a",
      first_name: "Anna",
      last_name: "Alt",
      tennis_lk: "LK10",
      is_team_captain: true,
      telefon: "0171",
    });
    expect(m?.offene_einladungen).toEqual([]);
    expect(m?.ich_bin_mf).toBe(true);
  });
});

describe("Benachrichtigungen der Mannschaft", () => {
  it("erkennt die Arten", () => {
    expect(istMannschaftsNachricht("team_invited")).toBe(true);
    expect(istMannschaftsNachricht("team_left")).toBe(true);
    expect(istMannschaftsNachricht("booking_added")).toBe(false);
    expect(istMannschaftsNachricht(null)).toBe(false);
  });

  it("führen im Web auf /konto/mannschaft", () => {
    for (const kind of ["team_invited", "team_invitation_answered", "team_removed", "team_left"]) {
      expect(notificationWebZiel({ kind })).toEqual({ href: "/konto/mannschaft", text: "Zur Mannschaft" });
      expect(notificationSymbol(kind)).toBe("person");
    }
  });

  it("Veranstaltungen weiter wie bisher, sonst nirgends", () => {
    expect(notificationWebZiel({ kind: "event_promoted", event_id: "e1" })).toEqual({
      href: "/verein/veranstaltungen/e1",
      text: "Zur Veranstaltung",
    });
    expect(notificationWebZiel({ kind: "booking_added" })).toBeNull();
  });
});

describe("mannschaftsfuehrerHinweis", () => {
  it("steht wie vereinbart", () => {
    expect(mannschaftsfuehrerHinweis("Herren 40")).toBe(
      "Mannschaftsführer Herren 40: darf in seine Mannschaft einladen und Spieler austragen",
    );
  });
});
