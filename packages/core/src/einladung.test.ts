import { describe, expect, it } from "vitest";
import { einladungsStatus, spaetererZeitpunkt } from "./einladung";

const JETZT = new Date("2026-10-14T12:00:00Z");

describe("einladungsStatus", () => {
  it("abgeschlossenes Onboarding: kein Status, auch ohne Anmeldung (Bestand)", () => {
    expect(
      einladungsStatus({ onboardingAbgeschlossen: true, angemeldetAm: null, gesendetAm: null, jetzt: JETZT }),
    ).toBeNull();
  });

  it("angemeldet, aber nicht fertig: Onboarding offen", () => {
    expect(
      einladungsStatus({
        onboardingAbgeschlossen: false,
        angemeldetAm: "2026-10-13T08:00:00Z",
        gesendetAm: "2026-10-01T08:00:00Z",
        jetzt: JETZT,
      }),
    ).toBe("onboarding_offen");
  });

  it("nie angemeldet, Link jünger als 24 Stunden: ausstehend", () => {
    expect(
      einladungsStatus({
        onboardingAbgeschlossen: false,
        angemeldetAm: null,
        gesendetAm: "2026-10-13T13:00:00Z",
        jetzt: JETZT,
      }),
    ).toBe("ausstehend");
  });

  it("nie angemeldet, Link älter als 24 Stunden oder unbekannt: abgelaufen", () => {
    expect(
      einladungsStatus({
        onboardingAbgeschlossen: false,
        angemeldetAm: null,
        gesendetAm: "2026-10-13T11:59:00Z",
        jetzt: JETZT,
      }),
    ).toBe("abgelaufen");
    expect(
      einladungsStatus({ onboardingAbgeschlossen: false, angemeldetAm: null, gesendetAm: null, jetzt: JETZT }),
    ).toBe("abgelaufen");
  });
});

describe("spaetererZeitpunkt", () => {
  it("nimmt den jüngeren und verträgt null", () => {
    expect(spaetererZeitpunkt("2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z")).toBe("2026-10-02T00:00:00Z");
    expect(spaetererZeitpunkt(null, "2026-10-02T00:00:00Z")).toBe("2026-10-02T00:00:00Z");
    expect(spaetererZeitpunkt("2026-10-01T00:00:00Z", undefined)).toBe("2026-10-01T00:00:00Z");
    expect(spaetererZeitpunkt(null, null)).toBeNull();
  });
});
