import { expect, test, type Page } from "@playwright/test";
import { anmelden, NUTZER } from "./hilfen";

/**
 * Sicherheits-Header (S4) und Fehlerdarstellung (U1, U19).
 *
 * Die CSP wird hier nicht nur gelesen, sondern auch gelebt: eine Seite, deren
 * Skripte die Richtlinie blockiert, lädt zwar, reagiert aber auf nichts. Darum
 * prüft jeder Test zusätzlich, dass der Browser keine Verletzung gemeldet hat.
 */

/** Sammelt die CSP-Verletzungen, die der Browser in die Konsole schreibt. */
function verletzungen(page: Page): string[] {
  const liste: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) liste.push(m.text());
  });
  return liste;
}

test.describe("Sicherheits-Header", () => {
  test("die Seite liefert CSP, Permissions-Policy und HSTS mit includeSubDomains", async ({ request }) => {
    const antwort = await request.get("/login");
    expect(antwort.ok()).toBe(true);
    const kopf = antwort.headers();

    const csp = kopf["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).not.toContain("'unsafe-inline' 'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("font-src 'self'");

    // Supabase per fetch und per WebSocket (Realtime im Belegungsplan).
    const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
    expect(supabase).not.toBe("");
    expect(csp).toContain(`connect-src 'self' ${supabase} ${supabase.replace(/^http/, "ws")}`);

    expect(kopf["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
    expect(kopf["permissions-policy"]).toContain("camera=()");
    expect(kopf["permissions-policy"]).toContain("geolocation=()");
    expect(kopf["x-content-type-options"]).toBe("nosniff");
    expect(kopf["x-frame-options"]).toBe("DENY");
    expect(kopf["x-powered-by"]).toBeUndefined();
  });

  test("jede Anfrage bekommt eine eigene Nonce, und das Theme-Skript trägt sie", async ({ request }) => {
    const nonceAus = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1];

    const erste = await request.get("/login");
    const zweite = await request.get("/login");
    const n1 = nonceAus(erste.headers()["content-security-policy"] ?? "");
    const n2 = nonceAus(zweite.headers()["content-security-policy"] ?? "");
    expect(n1).toBeTruthy();
    expect(n1).not.toBe(n2);

    // Das Inline-Skript im <head> (Theme) läuft nur mit dieser Nonce.
    const html = await erste.text();
    expect(html).toContain(`nonce="${n1}"`);
  });

  test("eine vorgegebene Nonce wird nicht übernommen", async ({ request }) => {
    const antwort = await request.get("/login", { headers: { "x-tcm-nonce": "fremd" } });
    expect(antwort.headers()["content-security-policy"]).not.toContain("'nonce-fremd'");
    expect(await antwort.text()).not.toContain('nonce="fremd"');
  });

  test("angemeldet laufen Seiten und Realtime ohne CSP-Verletzung", async ({ page }) => {
    const gemeldet = verletzungen(page);
    await anmelden(page, NUTZER.mitglied);

    // Der Belegungsplan abonniert Realtime per WebSocket.
    await page.goto("/plan");
    await expect(page.getByRole("heading", { level: 1, name: "Plätze", exact: true })).toBeVisible();

    // Das Theme-Skript lief: die Wahl wirkt nach dem Neuladen, ohne Klick.
    await page.goto("/konto");
    await page.getByRole("group", { name: "Erscheinungsbild" }).getByRole("button", { name: "Dunkel" }).click();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dunkel");
    // Zurück, damit andere Tests mit dem System-Theme beginnen.
    await page.getByRole("group", { name: "Erscheinungsbild" }).getByRole("button", { name: "System" }).click();

    expect(gemeldet).toEqual([]);
  });
});

/**
 * Eine Nonce-CSP blockiert die Skripte jeder Seite, die beim Build statisch
 * vorgerendert wurde - sie trägt keine Nonce. Die Seite sähe richtig aus,
 * reagierte aber auf nichts. Darum je Route: keine Verletzung, jedes Skript
 * mit Nonce, und React hat das HTML übernommen (Hydration).
 */
test.describe("CSP auf allen Seitenarten", () => {
  async function pruefeSeite(page: Page, pfad: string) {
    await page.addInitScript(() => {
      const w = window as unknown as { __csp: string[] };
      w.__csp = [];
      document.addEventListener("securitypolicyviolation", (e) =>
        w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
      );
    });
    const konsole = verletzungen(page);
    const antwort = await page.goto(pfad);
    expect(antwort?.ok(), pfad).toBe(true);
    await page.waitForLoadState("networkidle");

    const stand = await page.evaluate(() => ({
      csp: (window as unknown as { __csp: string[] }).__csp,
      ohneNonce: [...document.scripts].filter((s) => !s.nonce).length,
      hydriert: [...document.querySelectorAll("body *")].some((el) =>
        Object.keys(el).some((k) => k.startsWith("__reactFiber")),
      ),
    }));
    expect(stand.csp, pfad).toEqual([]);
    expect(konsole, pfad).toEqual([]);
    expect(stand.ohneNonce, pfad).toBe(0);
    expect(stand.hydriert, pfad).toBe(true);
  }

  test("der Wächter bemerkt eine Verletzung überhaupt", async ({ page }) => {
    // Gegenprobe: sonst bestünden die Tests unten auch mit taubem Listener.
    await page.addInitScript(() => {
      const w = window as unknown as { __csp: string[] };
      w.__csp = [];
      document.addEventListener("securitypolicyviolation", (e) => w.__csp.push(e.violatedDirective));
    });
    await page.goto("/login");
    await page.evaluate(() => {
      const img = document.createElement("img");
      img.src = "https://example.invalid/x.png";
      document.body.append(img);
    });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp))
      .toContain("img-src");
  });

  test("öffentliche Seiten", async ({ page }) => {
    for (const pfad of [
      "/login", "/passwort-vergessen", "/passwort-setzen", "/antrag",
      "/impressum", "/datenschutz", "/satzung", "/beitragsordnung",
    ]) {
      await pruefeSeite(page, pfad);
    }
  });

  test("Kiosk", async ({ page }) => {
    await anmelden(page, NUTZER.kiosk);
    await pruefeSeite(page, "/kiosk");
  });

  test("Verwaltung, Plan und Konto", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    for (const pfad of ["/admin", "/admin/kasse", "/plan", "/plan/spiele", "/konto"]) {
      await pruefeSeite(page, pfad);
    }
  });
});

test.describe("Fehlerdarstellung", () => {
  test("eine unbekannte Adresse zeigt die eigene 404-Seite", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    const antwort = await page.goto("/gibt-es-nicht");
    expect(antwort?.status()).toBe(404);
    await expect(page.getByText("Diese Seite gibt es nicht.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Zur Startseite" })).toBeVisible();
  });

  /**
   * Die Meldung im Formular. Nicht getByRole("alert") allein: Next.js hat
   * einen eigenen, leeren Ansager mit derselben Rolle (__next-route-announcer__).
   */
  const meldung = (page: Page) => page.locator("form").getByRole("alert");

  /** Login-Formular ausfüllen, ohne auf die Weiterleitung zu warten. */
  async function versuche(page: Page) {
    await page.goto("/login");
    await page.getByLabel("E-Mail").fill(NUTZER.mitglied);
    await page.getByLabel("Passwort").fill("irgendwas-falsches");
    await page.getByRole("button", { name: "Anmelden" }).click();
  }

  test("ohne Verbindung meldet der Login keine falschen Zugangsdaten (U19)", async ({ page }) => {
    await page.route("**/auth/v1/token**", (route) => route.abort("internetdisconnected"));
    await versuche(page);
    await expect(meldung(page)).toContainText("Keine Verbindung zum Server");
    await expect(meldung(page)).not.toContainText("Passwort stimmt nicht");
  });

  test("nach zu vielen Versuchen sagt der Login das (U19)", async ({ page }) => {
    await page.route("**/auth/v1/token**", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ code: "over_request_rate_limit", message: "Request rate limit reached" }),
      }),
    );
    await versuche(page);
    await expect(meldung(page)).toContainText("Zu viele Versuche");
  });

  test("falsche Zugangsdaten bleiben ein Satz für Adresse und Passwort", async ({ page }) => {
    await versuche(page);
    await expect(meldung(page)).toHaveText("E-Mail-Adresse oder Passwort stimmt nicht.");
  });
});
