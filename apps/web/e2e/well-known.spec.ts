import { expect, test } from "@playwright/test";

/**
 * Universal Links und App Links: Apple und Google holen die Dateien ohne
 * Anmeldung und folgen keiner Umleitung. Der Request-Kontext hier hat keine
 * Sitzung, maxRedirects 0 macht eine Umleitung auf /login zum Fehler.
 */
test.describe("/.well-known", () => {
  test("apple-app-site-association: JSON ohne Anmeldung und ohne Umleitung", async ({ request }) => {
    const antwort = await request.get("/.well-known/apple-app-site-association", { maxRedirects: 0 });
    expect(antwort.status()).toBe(200);
    expect(antwort.headers()["content-type"]).toMatch(/^application\/json/);
    expect(antwort.headers()["cache-control"]).toContain("public");

    const inhalt = await antwort.json();
    expect(inhalt.applinks.details[0].appIDs).toContain("93Z2KKGMV7.de.tcmuckensturm.app");
    expect(inhalt.applinks.details[0].components).toContainEqual({ "/": "/passwort-setzen/*" });
    expect(inhalt.webcredentials.apps).toContain("93Z2KKGMV7.de.tcmuckensturm.app.dev");
  });

  test("assetlinks.json: ohne ANDROID_APP_FINGERPRINTS 404, nicht /login", async ({ request }) => {
    test.skip(!!process.env.ANDROID_APP_FINGERPRINTS, "Fingerabdrücke gesetzt");
    const antwort = await request.get("/.well-known/assetlinks.json", { maxRedirects: 0 });
    expect(antwort.status()).toBe(404);
  });
});
