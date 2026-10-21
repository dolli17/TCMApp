import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ useWindowDimensions: () => ({ fontScale: 1 }) }));

const { grosseSchrift, SCHRIFT_DECKEL } = await import("./schrift");

describe("grosseSchrift", () => {
  it("Vorgabe und erste Stufe bleiben beim Layout", () => {
    expect(grosseSchrift(1)).toBe(false);
    expect(grosseSchrift(1.118)).toBe(false);
  });

  it("ab der zweiten Stufe stellt sich das Layout um", () => {
    expect(grosseSchrift(1.235)).toBe(true);
    expect(grosseSchrift(3.1)).toBe(true);
  });

  it("Deckel fuer feste Formen liegen ueber 1 - Text waechst, nur begrenzt", () => {
    expect(SCHRIFT_DECKEL.form).toBeGreaterThan(1);
    expect(SCHRIFT_DECKEL.leiste).toBeGreaterThan(SCHRIFT_DECKEL.form);
  });
});
