import { describe, expect, it } from "vitest";
import { merkmalBeschreibung } from "./merkmaltexte";

const FOTO =
  "Darf die Person auf Fotos der Website, in Aushängen und in der Presse erscheinen? " +
  "Bei Minderjährigen erteilen die Erziehungsberechtigten die Einwilligung.";
const BUCHUNGSMAIL =
  "Ob Änderungen an deinen Platzbuchungen zusätzlich per E-Mail kommen. In der App siehst du sie in jedem Fall.";

describe("merkmalBeschreibung", () => {
  it("duzt das Mitglied im Konto", () => {
    expect(merkmalBeschreibung("foto", FOTO, "mitglied")).toMatch(/^Dürfen wir dich/);
  });

  it("lässt den neutralen Text in der Verwaltung stehen", () => {
    expect(merkmalBeschreibung("foto", FOTO, "verwaltung")).toBe(FOTO);
  });

  it("spricht in der Verwaltung nicht von deinen Buchungen", () => {
    const text = merkmalBeschreibung("booking_mail", BUCHUNGSMAIL, "verwaltung");
    expect(text).not.toMatch(/dein|siehst du/);
    expect(merkmalBeschreibung("booking_mail", BUCHUNGSMAIL, "mitglied")).toBe(BUCHUNGSMAIL);
  });

  it("erkennt den alten Text ohne Umlaute", () => {
    const alt =
      "Ob Aenderungen an deinen Platzbuchungen zusaetzlich per E-Mail kommen. In der App siehst du sie in jedem Fall.";
    expect(merkmalBeschreibung("booking_mail", alt, "verwaltung")).not.toBe(alt);
  });

  it("behält einen Text, den der Vorstand geändert hat", () => {
    expect(merkmalBeschreibung("foto", "Eigener Text.", "mitglied")).toBe("Eigener Text.");
  });

  it("behält unbekannte Merkmale", () => {
    expect(merkmalBeschreibung("ehrung", "Vom Verein verliehen.", "mitglied")).toBe("Vom Verein verliehen.");
  });
});
