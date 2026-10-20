import { describe, expect, it } from "vitest";
import { sichererWeiterPfad } from "./weiterleitung";

describe("sichererWeiterPfad", () => {
  it("lässt Pfade der eigenen Seite durch, samt Suche und Anker", () => {
    expect(sichererWeiterPfad("/")).toBe("/");
    expect(sichererWeiterPfad("/plan")).toBe("/plan");
    expect(sichererWeiterPfad("/plan?tag=2026-10-20#oben")).toBe("/plan?tag=2026-10-20#oben");
    expect(sichererWeiterPfad("/admin/mitglieder/abc")).toBe("/admin/mitglieder/abc");
  });

  it("fällt ohne Wert auf / zurück", () => {
    expect(sichererWeiterPfad(null)).toBe("/");
    expect(sichererWeiterPfad(undefined)).toBe("/");
    expect(sichererWeiterPfad("")).toBe("/");
    expect(sichererWeiterPfad(42)).toBe("/");
  });

  it("weist fremde Adressen und Schemata ab", () => {
    for (const boese of [
      "https://boese.example",
      "http://boese.example/plan",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "boese.example",
      "plan",
    ]) {
      expect(sichererWeiterPfad(boese), boese).toBe("/");
    }
  });

  it("weist protokollrelative Adressen und Backslash-Tricks ab", () => {
    for (const boese of ["//boese.example", "///boese.example", "/\\boese.example", "/\\/boese.example", "/plan\\..\\x"]) {
      expect(sichererWeiterPfad(boese), boese).toBe("/");
    }
  });

  it("weist Steuerzeichen ab, die der Parser sonst wegwirft", () => {
    for (const boese of ["/\t/boese.example", "/\n/boese.example", "/\r/boese.example", "/plan\u0000"]) {
      expect(sichererWeiterPfad(boese), JSON.stringify(boese)).toBe("/");
    }
  });

  it("nimmt einen eigenen Fallback", () => {
    expect(sichererWeiterPfad("//boese.example", "/home")).toBe("/home");
  });
});
