import { describe, expect, it, vi } from "vitest";
import { behauptetDienstrolle, gleichZeitkonstant, istDienstschluessel, type Holen } from "./dienstschluessel";

/** Ein JWT mit beliebiger Nutzlast und falscher Signatur - so baut es jeder selbst. */
function token(nutzlast: Record<string, unknown>): string {
  const teil = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${teil({ alg: "HS256", typ: "JWT" })}.${teil(nutzlast)}.gefaelscht`;
}

const SCHLUESSEL = token({ role: "service_role", iss: "supabase-demo" });

function umgebung(holen: Holen) {
  return { supabaseUrl: "http://kong:8000/", dienstschluessel: SCHLUESSEL, holen };
}

describe("gleichZeitkonstant", () => {
  it("gleich, ungleich, verschieden lang", () => {
    expect(gleichZeitkonstant("abc", "abc")).toBe(true);
    expect(gleichZeitkonstant("abc", "abd")).toBe(false);
    expect(gleichZeitkonstant("abc", "abcd")).toBe(false);
    expect(gleichZeitkonstant("", "")).toBe(true);
  });
});

describe("behauptetDienstrolle", () => {
  it("liest nur die Nutzlast", () => {
    expect(behauptetDienstrolle(token({ role: "service_role" }))).toBe(true);
    expect(behauptetDienstrolle(token({ role: "authenticated" }))).toBe(false);
    expect(behauptetDienstrolle("sb_secret_abc")).toBe(false);
    expect(behauptetDienstrolle("a.%%%.c")).toBe(false);
  });
});

describe("istDienstschluessel", () => {
  it("der Schlüssel aus der Umgebung gilt, ohne Auth zu fragen", async () => {
    const holen = vi.fn<Holen>();
    expect(await istDienstschluessel(SCHLUESSEL, umgebung(holen))).toBe(true);
    expect(holen).not.toHaveBeenCalled();
  });

  it("ein selbst gebautes Token mit service_role lehnt Auth ab - und damit die Function (S3)", async () => {
    const holen = vi.fn<Holen>().mockResolvedValue({ ok: false });
    const falsch = token({ role: "service_role", sub: "angreifer" });
    expect(await istDienstschluessel(falsch, umgebung(holen))).toBe(false);
    expect(holen).toHaveBeenCalledWith("http://kong:8000/auth/v1/admin/users?page=1&per_page=1", {
      method: "GET",
      headers: { apikey: falsch, Authorization: `Bearer ${falsch}` },
    });
  });

  it("ein anderer echter Dienstschlüssel (Umstellung der Schlüssel): Auth bestätigt", async () => {
    const holen = vi.fn<Holen>().mockResolvedValue({ ok: true });
    expect(await istDienstschluessel(token({ role: "service_role", ref: "alt" }), umgebung(holen))).toBe(true);
  });

  it("ein neuer sb_secret_…: entscheidet Auth", async () => {
    const holen = vi.fn<Holen>().mockResolvedValue({ ok: true });
    expect(await istDienstschluessel("sb_secret_neu", umgebung(holen))).toBe(true);
    holen.mockResolvedValue({ ok: false });
    expect(await istDienstschluessel("sb_secret_geraten", umgebung(holen))).toBe(false);
  });

  it("Mitglieds-Token und Unsinn gehen gar nicht erst zu Auth", async () => {
    const holen = vi.fn<Holen>();
    expect(await istDienstschluessel(token({ role: "authenticated" }), umgebung(holen))).toBe(false);
    expect(await istDienstschluessel("", umgebung(holen))).toBe(false);
    expect(await istDienstschluessel("kein-token", umgebung(holen))).toBe(false);
    expect(holen).not.toHaveBeenCalled();
  });

  it("Auth nicht erreichbar: nein", async () => {
    const holen = vi.fn<Holen>().mockRejectedValue(new Error("Netz weg"));
    expect(await istDienstschluessel(token({ role: "service_role" }), umgebung(holen))).toBe(false);
  });

  it("ohne Schlüssel in der Umgebung gilt das leere Token nicht", async () => {
    const holen = vi.fn<Holen>();
    expect(await istDienstschluessel("", { ...umgebung(holen), dienstschluessel: "" })).toBe(false);
  });
});
