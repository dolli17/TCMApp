import { describe, expect, it } from "vitest";
import { basis, webLink } from "./web";

describe("basis", () => {
  it("schneidet Schraegstriche am Ende ab", () => {
    expect(basis("https://tcm.example/")).toBe("https://tcm.example");
    expect(basis(" https://tcm.example// ")).toBe("https://tcm.example");
  });
  it("ist ohne Wert leer", () => {
    expect(basis(undefined)).toBe("");
    expect(basis("")).toBe("");
  });
});

describe("webLink", () => {
  it("haengt den Pfad an die Basis", () => {
    expect(webLink("/admin", "https://tcm.example")).toBe("https://tcm.example/admin");
    expect(webLink("antrag", "https://tcm.example")).toBe("https://tcm.example/antrag");
  });
  it("gibt ohne Basisadresse null", () => {
    expect(webLink("/admin", "")).toBeNull();
  });
});
