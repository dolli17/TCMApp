import { describe, expect, it } from "vitest";
import { hatPlatzRechte, hatVolleRechte, rollenLabel, rollenMarken } from "./rollen";

describe("hatVolleRechte", () => {
  it("Vorstand und App Admin dürfen alles", () => {
    expect(hatVolleRechte(["member", "admin"])).toBe(true);
    expect(hatVolleRechte(["member", "board"])).toBe(true);
  });

  it("Platzwart und Spieler nicht", () => {
    expect(hatVolleRechte(["member", "groundskeeper"])).toBe(false);
    expect(hatVolleRechte(["member"])).toBe(false);
    expect(hatVolleRechte([])).toBe(false);
  });
});

describe("hatPlatzRechte", () => {
  it("Vorstand, App Admin und Platzwart verwalten die Plätze", () => {
    expect(hatPlatzRechte(["member", "admin"])).toBe(true);
    expect(hatPlatzRechte(["member", "board"])).toBe(true);
    expect(hatPlatzRechte(["member", "groundskeeper"])).toBe(true);
  });

  it("ein Spieler nicht", () => {
    expect(hatPlatzRechte(["member"])).toBe(false);
    expect(hatPlatzRechte([])).toBe(false);
  });
});

describe("rollenLabel", () => {
  it("übersetzt die Schlüssel", () => {
    expect(rollenLabel("member")).toBe("Spieler");
    expect(rollenLabel("board")).toBe("Vorstand");
    expect(rollenLabel("admin")).toBe("App Admin");
    expect(rollenLabel("groundskeeper")).toBe("Platzwart");
  });
});

describe("rollenMarken", () => {
  it("führt Rollen und Eigenschaften zusammen, ohne Spieler", () => {
    expect(
      rollenMarken({ roles: ["member", "groundskeeper", "board"], is_trainer: true, is_team_captain: true }),
    ).toEqual(["Vorstand", "Platzwart", "Trainer", "Mannschaftsführer"]);
  });

  it("ist leer für ein einfaches Mitglied", () => {
    expect(rollenMarken({ roles: ["member"] })).toEqual([]);
    expect(rollenMarken({})).toEqual([]);
  });
});
