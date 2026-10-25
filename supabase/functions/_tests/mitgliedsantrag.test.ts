/**
 * mitgliedsantrag gegen nachgebildetes PostgREST, Resend und Mailpit (S22).
 *
 * Geprüft wird, dass das Token nur in der Mail landet und nie in der Antwort,
 * dass ohne Zeile keine Mail rausgeht und die Antwort trotzdem gleich lautet,
 * und dass ein gescheiterter Versand die Sperrfrist zurücknimmt. Die Vorlage
 * steht in packages/core unter Vitest.
 */

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { anfrage, DIENST, ladeFunction, lies, pgFehler, Router } from "./attrappe.ts";

const MODUL = new URL("../mitgliedsantrag/index.ts", import.meta.url);
const TOKEN = "a".repeat(64);
const DATEN = { first_name: "Anna", last_name: "Neu", email: "anna@example.org" };

function eingang() {
  return [{ application_id: "app-1", email: "anna@example.org", first_name: "Anna", token: TOKEN }];
}

function vorgaben(zeilen: unknown[] = eingang()): Router {
  return new Router()
    .rpc("begin_membership_application", () => ({ json: zeilen }))
    .rpc("release_membership_application_mail", () => ({ json: null }))
    .route("POST", "/emails", () => ({ json: { id: "re-1" } }))
    .route("POST", "/api/v1/send", () => ({ json: { ID: "mp-1" } }));
}

async function rufe(
  router: Router,
  {
    umgebung = { MAILPIT_URL: "http://mailpit.test" } as Record<string, string>,
    koerper = { daten: DATEN, userAgent: "Test" } as unknown,
    ip = "203.0.113.7, 10.0.0.1",
    methode = "POST",
  } = {},
) {
  const handler = await ladeFunction(MODUL, router, umgebung);
  const req = anfrage(koerper, { token: null, methode });
  if (ip) req.headers.set("x-forwarded-for", ip);
  const fehler = console.error;
  console.error = () => {};
  try {
    return await lies(await handler(req));
  } finally {
    console.error = fehler;
  }
}

Deno.test("nur POST mit Daten", async () => {
  assertEquals((await rufe(vorgaben(), { methode: "GET" })).status, 405);
  const router = vorgaben();
  assertEquals((await rufe(router, { koerper: { daten: null } })).status, 400);
  assertEquals(router.aufrufe, []);
});

Deno.test("legt mit dem Dienstschlüssel an und reicht die Herkunft durch", async () => {
  const router = vorgaben();
  const r = await rufe(router);
  assertEquals(r.status, 200);
  const [anlegen] = router.an("/rest/v1/rpc/begin_membership_application");
  assertEquals(anlegen.schluessel, DIENST);
  assertEquals(anlegen.koerper, { p_data: DATEN, p_ip: "203.0.113.7", p_user_agent: "Test" });
});

Deno.test("das Token steht in der Mail, nie in der Antwort", async () => {
  const router = vorgaben();
  const r = await rufe(router);
  assertEquals(r.koerper, { ok: true, meldung: "Eingegangen." });
  assert(!JSON.stringify(r.koerper).includes(TOKEN));

  const [mail] = router.an("/api/v1/send");
  const m = mail.koerper as { To: { Email: string }[]; HTML: string; Text: string; Subject: string };
  assertEquals(m.To, [{ Email: "anna@example.org" }]);
  assertStringIncludes(m.HTML, `https://tcm.test/antrag/bestaetigen?token=${TOKEN}`);
  assertStringIncludes(m.Text, `https://tcm.test/antrag/bestaetigen?token=${TOKEN}`);
  assertEquals(m.Subject, "Bitte bestätige deinen Mitgliedsantrag");
});

Deno.test("keine Zeile: keine Mail, dieselbe Antwort", async () => {
  const router = vorgaben([]);
  const r = await rufe(router);
  assertEquals(r.koerper, { ok: true, meldung: "Eingegangen." });
  assertEquals(router.an("/api/v1/send"), []);
});

Deno.test("mit Resend-Schlüssel geht die Mail an Resend, nicht an Mailpit", async () => {
  const router = vorgaben();
  const r = await rufe(router, { umgebung: { RESEND_API_KEY: "re_test", MAILPIT_URL: "http://mailpit.test" } });
  assertEquals(r.status, 200);
  assertEquals(router.an("/api/v1/send"), []);
  const [mail] = router.an("/emails");
  assertEquals(mail.authorization, "Bearer re_test");
  assertEquals((mail.koerper as { to: string[] }).to, ["anna@example.org"]);
});

Deno.test("Versand scheitert: Sperrfrist zurück, Fehler an den Absender", async () => {
  const router = vorgaben().route("POST", "/api/v1/send", () => ({ status: 500, json: { error: "kaputt" } }));
  const r = await rufe(router);
  assertEquals(r.status, 502);
  assertEquals(r.koerper.ok, false);
  const [frei] = router.an("/rest/v1/rpc/release_membership_application_mail");
  assertEquals(frei.koerper, { p_application_id: "app-1" });
});

Deno.test("ohne Versandweg: 503, und es wird gar nicht erst angelegt", async () => {
  const router = vorgaben();
  const r = await rufe(router, { umgebung: {} });
  assertEquals(r.status, 503);
  assertEquals(router.an("/rest/v1/rpc/begin_membership_application"), []);
});

Deno.test("Fehler der RPC gehen mit Code durch", async () => {
  const router = vorgaben().rpc("begin_membership_application", () =>
    pgFehler("Es sind gerade zu viele Anträge eingegangen. Bitte später erneut versuchen.", "P0003")
  );
  const r = await rufe(router);
  assertEquals(r.status, 400);
  assertEquals(r.koerper.code, "P0003");
  assertEquals(router.an("/api/v1/send"), []);
});
