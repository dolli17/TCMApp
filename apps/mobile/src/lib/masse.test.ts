import { describe, expect, it } from "vitest";
import { INHALT_LUFT_UNTEN, LEISTE_ABSTAND_UNTEN, LEISTE_HOEHE } from "./masse";

describe("INHALT_LUFT_UNTEN", () => {
  it("laesst unter dem Inhalt die Leiste samt Abstand und etwas Luft frei", () => {
    expect(INHALT_LUFT_UNTEN).toBeGreaterThanOrEqual(LEISTE_HOEHE + LEISTE_ABSTAND_UNTEN + 20);
  });
});
