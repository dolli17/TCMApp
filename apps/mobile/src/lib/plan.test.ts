import { describe, expect, it } from "vitest";
import { berlinTime } from "@tcm/core";
import { sperrZeit } from "./plan";

const um = (tag: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return berlinTime(tag, h! * 60 + m!).toISOString();
};

describe("sperrZeit", () => {
  it("liest Beginn und Ende in Berliner Minuten", () => {
    expect(sperrZeit({ starts_at: um("2026-08-11", "13:00"), ends_at: um("2026-08-11", "15:30") }))
      .toEqual({ von: 13 * 60, bis: 15 * 60 + 30 });
  });

  it("stellt ein Ende nach Mitternacht auf 24:00", () => {
    expect(sperrZeit({ starts_at: um("2026-08-11", "20:00"), ends_at: um("2026-08-12", "02:00") }))
      .toEqual({ von: 20 * 60, bis: 24 * 60 });
  });
});
