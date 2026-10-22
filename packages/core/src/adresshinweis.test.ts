/**
 * Die Hinweis-Mail an die alte Adresse (S18). Versendet wird sie in
 * member-login; hier steht der Text unter Test.
 */

import { describe, expect, it } from "vitest";
import { ADRESSHINWEIS_BETREFF, adresshinweisHtml, adresshinweisText } from "./adresshinweis";

describe("adresshinweis", () => {
  it("sagt, was passiert ist und an wen man sich wendet", () => {
    for (const inhalt of [adresshinweisHtml("Kira Kasse", "https://tcm.test"), adresshinweisText("Kira Kasse", "https://tcm.test")]) {
      expect(inhalt).toContain("Hallo Kira Kasse,");
      expect(inhalt).toContain("andere E-Mail-Adresse eingetragen");
      expect(inhalt).toContain("Warst du das nicht");
      expect(inhalt).toContain("Vorstand des Vereins");
      expect(inhalt).toContain("https://tcm.test");
    }
    expect(ADRESSHINWEIS_BETREFF).toMatch(/E-Mail-Adresse .* geändert/);
  });

  it("maskiert den Namen im HTML", () => {
    const html = adresshinweisHtml('<b>"Kira"</b>', "https://tcm.test");
    expect(html).toContain("Hallo &lt;b&gt;&quot;Kira&quot;&lt;/b&gt;,");
    expect(html).not.toContain("<b>");
  });

  it("kommt ohne Namen aus", () => {
    expect(adresshinweisText(null, "https://tcm.test")).toMatch(/^Hallo,\n/);
    expect(adresshinweisHtml(null, "https://tcm.test")).toContain("<p>Hallo,</p>");
  });
});
