import { describe, expect, it } from "vitest";
import { antragsLink, antragsmailHtml, antragsmailText } from "./antragsmail";

const LINK = antragsLink("https://tcm.example/", "abc123");

describe("antragsLink", () => {
  it("führt auf die Bestätigungsseite, ohne doppelten Schrägstrich", () => {
    expect(LINK).toBe("https://tcm.example/antrag/bestaetigen?token=abc123");
  });
});

describe("antragsmailHtml", () => {
  it("enthält den Link im Knopf und zum Kopieren", () => {
    const html = antragsmailHtml("Anna", LINK);
    expect(html.match(/antrag\/bestaetigen\?token=abc123/g)).toHaveLength(2);
    expect(html).toContain("Hallo Anna,");
    expect(html).toContain("Antrag bestätigen");
  });

  it("maskiert den Vornamen, er ist ungeprüfte Eingabe", () => {
    const html = antragsmailHtml('<a href="x">Klick</a>', LINK);
    expect(html).not.toContain('<a href="x">');
    expect(html).toContain("&lt;a href=&quot;x&quot;&gt;");
  });

  it("kürzt einen langen Vornamen und kommt ohne aus", () => {
    expect(antragsmailHtml("x".repeat(200), LINK)).toContain(`Hallo ${"x".repeat(50)},`);
    expect(antragsmailHtml(null, LINK)).toContain("<p>Hallo,</p>");
  });
});

describe("antragsmailText", () => {
  it("trägt den Link und die Gültigkeit", () => {
    const text = antragsmailText("Anna", LINK);
    expect(text).toContain(`Antrag bestätigen: ${LINK}`);
    expect(text).toContain("24 Stunden");
    expect(text.startsWith("Hallo Anna,")).toBe(true);
  });
});
