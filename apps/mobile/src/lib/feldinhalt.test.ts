import { describe, expect, it } from "vitest";
import { feldEigenschaften, tastaturFuer } from "./feldinhalt";

describe("feldEigenschaften", () => {
  it("ohne Inhalt nur keine Autokorrektur", () => {
    expect(feldEigenschaften(undefined)).toEqual({ autoCorrect: false });
  });

  it("Namen und Adresse fuer das Autofill", () => {
    expect(feldEigenschaften("vorname")).toMatchObject({ textContentType: "givenName", autoComplete: "given-name", autoCapitalize: "words" });
    expect(feldEigenschaften("plz")).toMatchObject({ textContentType: "postalCode", autoComplete: "postal-code", keyboardType: "number-pad" });
    expect(feldEigenschaften("ort")).toMatchObject({ textContentType: "addressCity", autoComplete: "postal-address-locality" });
  });

  it("E-Mail ohne Grossschreibung, mit passender Tastatur", () => {
    expect(feldEigenschaften("email")).toEqual({
      autoCorrect: false, textContentType: "emailAddress", autoComplete: "email",
      keyboardType: "email-address", autoCapitalize: "none",
    });
  });

  it("neues Passwort, damit der Schluesselbund eins vorschlaegt", () => {
    expect(feldEigenschaften("passwort-neu")).toMatchObject({ textContentType: "newPassword", autoComplete: "new-password" });
  });

  it("IBAN ohne Autofill", () => {
    expect(feldEigenschaften("iban")).toMatchObject({ autoComplete: "off", autoCapitalize: "characters" });
  });
});

describe("tastaturFuer", () => {
  it("Telefon bekommt das Ziffernfeld, Name keine eigene", () => {
    expect(tastaturFuer("telefon")).toBe("phone-pad");
    expect(tastaturFuer("name")).toBeUndefined();
    expect(tastaturFuer(undefined)).toBeUndefined();
  });
});
