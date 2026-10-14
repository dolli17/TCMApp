import { describe, expect, it } from "vitest";
import { gleichesProjekt, istLokal, projektRef } from "./ziel";

describe("gleichesProjekt", () => {
  it("lässt lokal nur eine lokale Datenbank zu", () => {
    expect(gleichesProjekt("http://127.0.0.1:54321", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")).toBe(true);
    expect(gleichesProjekt("http://127.0.0.1:54321", "postgresql://postgres:x@db.abcd.supabase.co:5432/postgres")).toBe(false);
  });

  it("erkennt Direktverbindung und Pooler desselben Projekts", () => {
    const url = "https://abcd1234.supabase.co";
    expect(gleichesProjekt(url, "postgresql://postgres:x@db.abcd1234.supabase.co:5432/postgres")).toBe(true);
    expect(
      gleichesProjekt(url, "postgresql://postgres.abcd1234:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"),
    ).toBe(true);
  });

  it("weist ein anderes Projekt ab", () => {
    const url = "https://abcd1234.supabase.co";
    expect(gleichesProjekt(url, "postgresql://postgres:x@db.zzzz9999.supabase.co:5432/postgres")).toBe(false);
    expect(
      gleichesProjekt(url, "postgresql://postgres.zzzz9999:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"),
    ).toBe(false);
    expect(gleichesProjekt(url, "postgresql://postgres:postgres@127.0.0.1:54322/postgres")).toBe(false);
  });
});

describe("istLokal / projektRef", () => {
  it("liest Host und Kennung", () => {
    expect(istLokal("http://localhost:54321")).toBe(true);
    expect(istLokal("https://abcd1234.supabase.co")).toBe(false);
    expect(projektRef("https://abcd1234.supabase.co")).toBe("abcd1234");
    expect(projektRef("https://example.org")).toBeNull();
  });
});
