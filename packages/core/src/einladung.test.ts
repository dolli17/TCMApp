import { describe, expect, it } from "vitest";
import { einladungsStatus } from "./einladung";

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

  it("nie angemeldet, Link älter als 24 Stunden: abgelaufen", () => {
    expect(
      einladungsStatus({
        onboardingAbgeschlossen: false,
        angemeldetAm: null,
        gesendetAm: "2026-10-13T11:59:00Z",
        jetzt: JETZT,
      }),
    ).toBe("abgelaufen");
  });

  it("nie ein Link verschickt (Testadresse): nur Onboarding offen", () => {
    expect(
      einladungsStatus({ onboardingAbgeschlossen: false, angemeldetAm: null, gesendetAm: null, jetzt: JETZT }),
    ).toBe("onboarding_offen");
  });
});
