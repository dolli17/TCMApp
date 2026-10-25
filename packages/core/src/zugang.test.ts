import { describe, expect, it } from "vitest";
import { keinZugangText, zugangsGrund } from "./zugang";

describe("zugangsGrund", () => {
  it.each(["archiviert", "gesperrt", "ausgetreten", "unbekannt"])("übernimmt %s", (g) => {
    expect(zugangsGrund(g)).toBe(g);
  });

  it.each([null, undefined, "", "admin", "<script>"])("macht aus %s unbekannt", (g) => {
    expect(zugangsGrund(g)).toBe("unbekannt");
  });
});

describe("keinZugangText", () => {
  it("nennt beim Austritt das Ende der Mitgliedschaft", () => {
    expect(keinZugangText("ausgetreten")).toMatch(/Mitgliedschaft ist beendet/);
    expect(keinZugangText("archiviert")).toMatch(/Mitgliedschaft ist beendet/);
  });

  it("nennt die Sperre", () => {
    expect(keinZugangText("gesperrt")).toMatch(/gesperrt/);
  });

  it("bleibt ohne sicheren Grund allgemein", () => {
    expect(keinZugangText("unbekannt")).not.toMatch(/Mitgliedschaft|gesperrt/);
  });
});
