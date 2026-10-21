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

  it("nimmt im Uebergang die Sitzung aus dem Fragment an (Parameter #)", () => {
    expect(linkAuswerten({ "#": "access_token=a%2Eb&refresh_token=r&type=recovery" })).toEqual({
      art: "fragment", accessToken: "a.b", refreshToken: "r",
    });
  });

  it("liest das Fragment notfalls aus der rohen Adresse", () => {
    expect(linkAuswerten({}, "tcm://passwort-setzen#access_token=a&refresh_token=r")).toEqual({
      art: "fragment", accessToken: "a", refreshToken: "r",
    });
  });

  it("token_hash geht dem Fragment vor", () => {
    expect(linkAuswerten({ token_hash: "h", type: "invite", "#": "access_token=a&refresh_token=r" })).toEqual({
      art: "token", tokenHash: "h", typ: "invite",
    });
  });

  it("ein Fragment ohne refresh_token reicht nicht", () => {
    expect(linkAuswerten({}, "tcm://passwort-setzen#access_token=a")).toEqual({ art: "ohne" });
  });

  it("meldet einen Fehler im Fragment als ungueltig", () => {
    expect(linkAuswerten({}, "tcm://passwort-setzen#error=access_denied&error_code=otp_expired")).toEqual({
      art: "ungueltig",
    });
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
