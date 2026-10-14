import { describe, expect, it } from "vitest";
import { istLokal } from "./ziel";

describe("istLokal", () => {
  it("erkennt den lokalen Stack", () => {
    expect(istLokal("http://127.0.0.1:54321")).toBe(true);
    expect(istLokal("http://localhost:54321")).toBe(true);
    expect(istLokal("https://abcd1234.supabase.co")).toBe(false);
  });
});
