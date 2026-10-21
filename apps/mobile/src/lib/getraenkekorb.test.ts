import { describe, expect, it } from "vitest";
import { changeBasket } from "@tcm/core";
import { aktuellerKorb, leereKorb, setzeKorb } from "./getraenkekorb";

describe("Getraenke-Korb der App", () => {
  it("behaelt den Korb ueber Aufrufe hinweg und leert ihn beim Abmelden", () => {
    setzeKorb((k) => changeBasket(k, "bier", 1));
    setzeKorb((k) => changeBasket(k, "bier", 1));
    expect(aktuellerKorb()).toEqual({ bier: 2 });
    leereKorb();
    expect(aktuellerKorb()).toEqual({});
  });
});
