import { describe, expect, it, vi } from "vitest";
import { linkAuswerten, mitFrist } from "./passwortlink";

describe("linkAuswerten", () => {
  it("erkennt Einladung und Wiederherstellung", () => {
    expect(linkAuswerten({ token_hash: "abc", type: "invite" })).toEqual({
      art: "token", tokenHash: "abc", typ: "invite",
    });
    expect(linkAuswerten({ token_hash: "abc", type: "recovery" })).toEqual({
      art: "token", tokenHash: "abc", typ: "recovery",
    });
  });

  it("lehnt fremde oder fehlende Typen ab", () => {
    expect(linkAuswerten({ token_hash: "abc", type: "magiclink" })).toEqual({ art: "ungueltig" });
    expect(linkAuswerten({ token_hash: "abc" })).toEqual({ art: "ungueltig" });
  });

  it("nimmt bei doppelten Parametern den ersten", () => {
    expect(linkAuswerten({ token_hash: ["a", "b"], type: ["recovery"] })).toEqual({
      art: "token", tokenHash: "a", typ: "recovery",
    });
  });

  it("meldet einen Fehler aus dem Link als ungueltig", () => {
    expect(linkAuswerten({ error: "access_denied", error_code: "otp_expired" })).toEqual({ art: "ungueltig" });
  });

  it("ignoriert Sitzungen im Fragment", () => {
    // Expo Router reicht das Fragment nicht als Parameter durch; selbst wenn,
    // ist access_token kein Weg mehr hinein.
    expect(linkAuswerten({ access_token: "x", refresh_token: "y" })).toEqual({ art: "ohne" });
  });

  it("ohne Parameter: kein Link", () => {
    expect(linkAuswerten({})).toEqual({ art: "ohne" });
  });
});

describe("mitFrist", () => {
  it("reicht das Ergebnis durch", async () => {
    await expect(mitFrist(Promise.resolve(1), 100)).resolves.toBe(1);
  });

  it("bricht nach der Frist ab", async () => {
    vi.useFakeTimers();
    const p = mitFrist(new Promise(() => undefined), 1000);
    vi.advanceTimersByTime(1000);
    await expect(p).rejects.toThrow("Zeitueberschreitung");
    vi.useRealTimers();
  });
});
