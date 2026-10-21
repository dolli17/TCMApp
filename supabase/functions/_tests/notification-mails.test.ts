/**
 * notification-mails gegen nachgebildetes Auth, PostgREST und Resend (T6).
 *
 * Geprüft wird das Tor (Zeitgeber oder Administrator), der Trockenlauf ohne
 * Resend-Schlüssel und der Versand in Stapeln: was ein gescheiterter Stapel
 * nicht zugestellt hat, wird wieder freigegeben, was schon draußen ist, nicht
 * (B9). Die Vorlage und die Stapellogik selbst stehen in packages/core unter
 * Vitest.
 *
 *   deno test --allow-env --allow-read supabase/functions/_tests
 */

import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import {
  ANON,
  anfrage,
  authFehler,
  benutzer,
  DIENST,
  ladeFunction,
  lies,
  NUTZER,
  pgFehler,
  Router,
} from "./attrappe.ts";

const MODUL = new URL("../notification-mails/index.ts", import.meta.url);
const RESEND = "re_test";

/** Ein Empfänger mit einer Benachrichtigung je Nummer. */
function empfaenger(n: number) {
  return {
    member_id: `m-${n}`,
    email: `mitglied${n}@tcm.test`,
    first_name: `Vorname${n}`,
    notification_ids: [`n-${n}`],
    items: [{ kind: "booking", title: `Hinweis ${n}`, body: "Text", created_at: "2026-10-20T10:00:00Z" }],
  };
}

function vorgaben(abzuholen: unknown[] = [empfaenger(1)]): Router {
  return new Router()
    .route("GET", "/auth/v1/user", () => ({ json: benutzer("a0000000-0000-4000-8000-000000000001") }))
    .rpc("am_i_admin", () => ({ json: true }))
    .rpc("claim_notification_mails", () => ({ json: abzuholen }))
    .rpc("release_notification_mails", () => ({ json: null }))
    .route("POST", "/emails/batch", () => ({ json: { data: [] } }));
}

async function rufe(
  router: Router,
  { token = NUTZER, methode = "POST", resend = "" }: { token?: string | null; methode?: string; resend?: string } = {},
) {
  const handler = await ladeFunction(MODUL, router, resend ? { RESEND_API_KEY: resend } : {});
  // Der Trockenlauf meldet sich per console.warn; im Test nur Rauschen.
  const warn = console.warn;
  console.warn = () => {};
  try {
    return await lies(await handler(anfrage({}, { token, methode })));
  } finally {
    console.warn = warn;
  }
}

// ---------------------------------------------------------------------------
// Tor
// ---------------------------------------------------------------------------

Deno.test("nur POST, nur mit Token", async () => {
  const router = vorgaben();
  assertEquals((await rufe(router, { methode: "GET" })).status, 405);
  assertEquals((await rufe(router, { token: null })).status, 401);
  assertEquals(router.aufrufe, []);
});

Deno.test("Mitglied ohne Adminrechte: 403, nichts wird abgeholt", async () => {
  const router = vorgaben().rpc("am_i_admin", () => ({ json: false }));
  const r = await rufe(router);
  assertEquals(r.status, 403);
  assertEquals(router.an("/rest/v1/rpc/claim_notification_mails"), []);
  assertEquals(router.an("/rest/v1/rpc/am_i_admin")[0].authorization, NUTZER);
});

Deno.test("ungültiges Token: 401", async () => {
  const router = vorgaben().route("GET", "/auth/v1/user", () => authFehler("invalid JWT", 401, "bad_jwt"));
  assertEquals((await rufe(router)).status, 401);
  assertEquals(router.an("/rest/v1/rpc/claim_notification_mails"), []);
});

Deno.test("Administrator stößt an: abgeholt wird mit dem Service-Schlüssel", async () => {
  const router = vorgaben();
  const r = await rufe(router);
  assertEquals(r.status, 200);
  const [abholen] = router.an("/rest/v1/rpc/claim_notification_mails");
  assertEquals(abholen.koerper, { p_limit: 200 });
  assertEquals(abholen.schluessel, DIENST);
  assertEquals(router.an("/auth/v1/user")[0].schluessel, ANON);
});

Deno.test("Zeitgeber mit dem Dienstschlüssel: kein getUser, kein am_i_admin", async () => {
  const router = vorgaben();
  const r = await rufe(router, { token: `Bearer ${DIENST}` });
  assertEquals(r.status, 200);
  assertEquals(router.an("/auth/v1/user"), []);
  assertEquals(router.an("/rest/v1/rpc/am_i_admin"), []);
});

Deno.test("neuer sb_secret-Schlüssel: Auth bestätigt ihn über die Admin-Schnittstelle", async () => {
  const geheim = "sb_secret_neu";
  const router = vorgaben().route("GET", "/auth/v1/admin/users", (a) =>
    a.schluessel === geheim ? { json: { users: [] } } : authFehler("nein", 401)
  );
  assertEquals((await rufe(router, { token: `Bearer ${geheim}` })).status, 200);
  assertEquals(router.an("/auth/v1/user"), []);

  // Lehnt Auth ab, ist es ein gewöhnliches Token - und das kennt getUser nicht.
  const abgelehnt = vorgaben()
    .route("GET", "/auth/v1/admin/users", () => authFehler("nein", 401))
    .route("GET", "/auth/v1/user", () => authFehler("invalid JWT", 401, "bad_jwt"));
  assertEquals((await rufe(abgelehnt, { token: "Bearer sb_secret_falsch" })).status, 401);
  assertEquals(abgelehnt.an("/rest/v1/rpc/claim_notification_mails"), []);
});

// ---------------------------------------------------------------------------
// Abholen und Trockenlauf
// ---------------------------------------------------------------------------

Deno.test("Abholen scheitert: 500", async () => {
  const router = vorgaben().rpc("claim_notification_mails", () => pgFehler("kaputt"));
  const r = await rufe(router);
  assertEquals(r.status, 500);
  assertEquals(r.koerper.ok, false);
});

Deno.test("nichts offen: nichts zu versenden", async () => {
  const router = vorgaben([]);
  const r = await rufe(router, { resend: RESEND });
  assertEquals(r.koerper, { ok: true, meldung: "Nichts zu versenden.", empfaenger: 0 });
  assertEquals(router.an("/emails/batch"), []);
});

Deno.test("Trockenlauf ohne RESEND_API_KEY: zeigt die Mails, schickt und gibt nichts frei", async () => {
  const router = vorgaben([empfaenger(1), { ...empfaenger(2), notification_ids: ["n-2", "n-3"] }]);
  const r = await rufe(router);
  assertEquals(r.status, 200);
  assertEquals(r.koerper.trockenlauf, true);
  assertEquals(r.koerper.empfaenger, 2);
  assertEquals(r.koerper.benachrichtigungen, 3);
  const mails = r.koerper.mails as { to: string[]; subject: string; html: string; text: string }[];
  assertEquals(mails.map((m) => m.to), [["mitglied1@tcm.test"], ["mitglied2@tcm.test"]]);
  assertEquals(mails[0].subject, "Hinweis 1");
  assertMatch(mails[0].text, /Vorname1/);
  assertMatch(mails[0].html, /https:\/\/tcm\.test/);
  assertEquals(router.an("/emails/batch"), []);
  assertEquals(router.an("/rest/v1/rpc/release_notification_mails"), []);
});

// ---------------------------------------------------------------------------
// Versand
// ---------------------------------------------------------------------------

Deno.test("Versand in Stapeln zu 100 mit Idempotenzschlüssel", async () => {
  const alle = Array.from({ length: 150 }, (_, i) => empfaenger(i));
  const router = vorgaben(alle);
  const r = await rufe(router, { resend: RESEND });
  assertEquals(r.status, 200);
  assertEquals(r.koerper.meldung, "150 Mails verschickt.");

  const stapel = router.an("/emails/batch");
  assertEquals(stapel.map((s) => (s.koerper as unknown[]).length), [100, 50]);
  for (const s of stapel) assertEquals(s.authorization, `Bearer ${RESEND}`);
  const schluessel = stapel.map((s) => s.kopf.get("Idempotency-Key") ?? "");
  assertMatch(schluessel[0], /-0$/);
  assertMatch(schluessel[1], /-100$/);
  // Derselbe Lauf, verschiedene Stapel.
  assertEquals(schluessel[0].replace(/-0$/, ""), schluessel[1].replace(/-100$/, ""));
  assertEquals(router.an("/rest/v1/rpc/release_notification_mails"), []);
});

Deno.test("scheitert ein Stapel, wird nur freigegeben, was nicht draußen ist (B9)", async () => {
  const alle = Array.from({ length: 150 }, (_, i) => empfaenger(i));
  let n = 0;
  const router = vorgaben(alle).route("POST", "/emails/batch", () =>
    ++n === 1 ? { json: { data: [] } } : { status: 500, json: { message: "Resend ist weg" } }
  );
  const r = await rufe(router, { resend: RESEND });
  assertEquals(r.status, 502);
  assertMatch(String(r.koerper.meldung), /50 Nachrichten stehen wieder an/);
  assertMatch(String(r.koerper.meldung), /Resend antwortete mit 500/);

  const [freigabe] = router.an("/rest/v1/rpc/release_notification_mails");
  const ids = (freigabe.koerper as { p_ids: string[] }).p_ids;
  assertEquals(ids, Array.from({ length: 50 }, (_, i) => `n-${i + 100}`));
  assert(!ids.includes("n-0"));
  assertEquals(freigabe.schluessel, DIENST);
});
