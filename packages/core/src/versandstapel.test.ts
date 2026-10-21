import { describe, expect, it, vi } from "vitest";
import { inStapelnSenden, type Sendung } from "./versandstapel";

/** Eine Sendung je Empfänger, die Nachricht ist hier nur ein Name. */
function sendungen(...ids: string[][]): Sendung<string>[] {
  return ids.map((n, i) => ({ nachricht: `an-${i}`, ids: n }));
}

describe("inStapelnSenden", () => {
  it("alles geht raus: nichts wird freigegeben", async () => {
    const senden = vi.fn(async () => {});
    const e = await inStapelnSenden(sendungen(["a"], ["b"], ["c"]), 2, senden);

    expect(e).toEqual({ fehler: null, freizugeben: [] });
    expect(senden).toHaveBeenCalledTimes(2);
    expect(senden).toHaveBeenNthCalledWith(1, ["an-0", "an-1"], 0);
    expect(senden).toHaveBeenNthCalledWith(2, ["an-2"], 2);
  });

  it("scheitert der zweite Stapel, bleibt der erste abgehakt (B9)", async () => {
    const senden = vi.fn(async (_stapel: string[], start: number) => {
      if (start === 2) throw new Error("503");
    });
    const e = await inStapelnSenden(sendungen(["a1", "a2"], ["b"], ["c"], ["d"], ["e"]), 2, senden);

    expect(e.fehler).toBeInstanceOf(Error);
    expect(e.freizugeben).toEqual(["c", "d", "e"]);
    // Nach dem Fehler wird nichts mehr versucht: der nächste Lauf holt es nach.
    expect(senden).toHaveBeenCalledTimes(2);
  });

  it("scheitert der erste Stapel, wird alles freigegeben", async () => {
    const e = await inStapelnSenden(sendungen(["a"], ["b"]), 100, async () => {
      throw new Error("Netz weg");
    });
    expect(e.freizugeben).toEqual(["a", "b"]);
  });

  it("eine Nachricht auf zwei Geräten: ist ein Gerät bedient, bleibt sie abgehakt", async () => {
    // Ein Mitglied mit zwei Geräten, die Stapelgrenze liegt dazwischen. Lieber
    // fehlt die Nachricht auf dem zweiten Gerät, als dass das erste sie doppelt
    // bekommt.
    const liste: Sendung<string>[] = [
      { nachricht: "x-telefon", ids: ["x"] },
      { nachricht: "x-tablet", ids: ["x"] },
      { nachricht: "y-telefon", ids: ["y"] },
    ];
    const e = await inStapelnSenden(liste, 1, async (_s, start) => {
      if (start >= 1) throw new Error("429");
    });
    expect(e.freizugeben).toEqual(["y"]);
  });

  it("jede Id höchstens einmal", async () => {
    const liste: Sendung<string>[] = [
      { nachricht: "x-telefon", ids: ["x"] },
      { nachricht: "x-tablet", ids: ["x"] },
    ];
    const e = await inStapelnSenden(liste, 1, async () => {
      throw new Error("500");
    });
    expect(e.freizugeben).toEqual(["x"]);
  });

  it("leere Liste: nichts zu tun", async () => {
    const senden = vi.fn(async () => {});
    expect(await inStapelnSenden([], 100, senden)).toEqual({ fehler: null, freizugeben: [] });
    expect(senden).not.toHaveBeenCalled();
  });
});
