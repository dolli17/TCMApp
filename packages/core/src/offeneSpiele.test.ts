import { describe, expect, it } from "vitest";
import { aufzaehlung, offenesSpielText } from "./offeneSpiele";

const spiel = (frei: number, players: string[] = [], owner_name: string | null = "Robin Heinzler") => ({
  owner_name,
  players,
  frei,
});

describe("aufzaehlung", () => {
  it("verbindet Namen wie im Satz", () => {
    expect(aufzaehlung([])).toBe("");
    expect(aufzaehlung(["A"])).toBe("A");
    expect(aufzaehlung(["A", "B"])).toBe("A und B");
    expect(aufzaehlung(["A", "B", "C"])).toBe("A, B und C");
  });
});

describe("offenesSpielText", () => {
  it("nennt den Suchenden in der Kopfzeile", () => {
    expect(offenesSpielText(spiel(1)).kopf).toBe("Robin Heinzler sucht einen Mitspieler");
    expect(offenesSpielText(spiel(3)).kopf).toBe("Robin Heinzler sucht 3 Mitspieler");
  });

  it("spricht bei der eigenen Buchung mit du an", () => {
    expect(offenesSpielText(spiel(1), true).kopf).toBe("Du suchst einen Mitspieler");
    expect(offenesSpielText(spiel(2), true).kopf).toBe("Du suchst 2 Mitspieler");
  });

  it("listet die schon Eingetragenen", () => {
    expect(offenesSpielText(spiel(2)).dabei).toBeNull();
    expect(offenesSpielText(spiel(1, ["Anna Schmidt"])).dabei).toBe("Schon dabei: Anna Schmidt");
    expect(offenesSpielText(spiel(1, ["Anna Schmidt", "", "Max Gast"])).dabei).toBe(
      "Schon dabei: Anna Schmidt und Max Gast",
    );
  });

  it("kommt ohne Namen des Buchers aus", () => {
    expect(offenesSpielText(spiel(1, [], null)).kopf).toBe("Jemand sucht einen Mitspieler");
    expect(offenesSpielText(spiel(1, [], "  ")).kopf).toBe("Jemand sucht einen Mitspieler");
  });
});
