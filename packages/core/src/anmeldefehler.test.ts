import { describe, expect, it } from "vitest";
import {
  ANMELDEDATEN_FALSCH_TEXT, ZU_VIELE_VERSUCHE_TEXT, anmeldeFehlerText, authStoerungText, passwortFehlerText,
} from "./anmeldefehler";
import { VERBINDUNGSFEHLER_TEXT } from "./errors";

/**
 * U19: Nicht jeder Fehler beim Login ist ein falsches Passwort. Die Formen
 * stammen aus auth-js 2.x (AuthApiError, AuthRetryableFetchError).
 */
describe("anmeldeFehlerText", () => {
  it("bleibt bei falschen Daten bei einem Satz für Adresse und Passwort", () => {
    expect(
      anmeldeFehlerText({ name: "AuthApiError", status: 400, code: "invalid_credentials", message: "Invalid login credentials" }),
    ).toBe(ANMELDEDATEN_FALSCH_TEXT);
  });

  it("meldet eine fehlende Verbindung als solche", () => {
    expect(
      anmeldeFehlerText({ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" }),
    ).toBe(VERBINDUNGSFEHLER_TEXT);
    // Auch ohne den Namen, nur am Text erkannt.
    expect(anmeldeFehlerText({ message: "TypeError: fetch failed" })).toBe(VERBINDUNGSFEHLER_TEXT);
  });

  it("meldet einen Serverfehler nicht als falsches Passwort", () => {
    const text = anmeldeFehlerText({ name: "AuthRetryableFetchError", status: 503, message: "" });
    expect(text).not.toBe(ANMELDEDATEN_FALSCH_TEXT);
    expect(text).toContain("Server");
    expect(anmeldeFehlerText({ name: "AuthApiError", status: 500, message: "boom" })).toContain("Server");
  });

  it("meldet die Sperre nach zu vielen Versuchen", () => {
    expect(
      anmeldeFehlerText({ name: "AuthApiError", status: 429, code: "over_request_rate_limit", message: "" }),
    ).toBe(ZU_VIELE_VERSUCHE_TEXT);
    expect(anmeldeFehlerText({ status: 429 })).toBe(ZU_VIELE_VERSUCHE_TEXT);
  });

  it("nennt einen gesperrten Zugang", () => {
    expect(anmeldeFehlerText({ status: 400, code: "user_banned" })).toContain("gesperrt");
  });
});

describe("passwortFehlerText", () => {
  it("übersetzt die bekannten Fälle", () => {
    expect(passwortFehlerText({ status: 422, code: "same_password" })).toContain("unterscheiden");
    expect(passwortFehlerText({ status: 422, code: "weak_password" })).toContain("zu schwach");
    expect(passwortFehlerText({ status: 429 })).toBe(ZU_VIELE_VERSUCHE_TEXT);
    expect(passwortFehlerText({ name: "AuthRetryableFetchError", status: 0 })).toBe(VERBINDUNGSFEHLER_TEXT);
  });

  it("zeigt keinen englischen Rohtext", () => {
    const text = passwortFehlerText({ status: 400, code: "unexpected_failure", message: "Something broke" });
    expect(text).not.toContain("Something");
  });
});

describe("authStoerungText", () => {
  it("meldet nur Störungen, nichts, was etwas über die Adresse verrät", () => {
    expect(authStoerungText(null)).toBeNull();
    expect(authStoerungText({ status: 400, code: "invalid_credentials" })).toBeNull();
    expect(authStoerungText({ status: 400, code: "user_not_found" })).toBeNull();
    expect(authStoerungText({ status: 429, code: "over_email_send_rate_limit" })).toBe(ZU_VIELE_VERSUCHE_TEXT);
    expect(authStoerungText({ name: "AuthRetryableFetchError", status: 0 })).toBe(VERBINDUNGSFEHLER_TEXT);
  });
});
