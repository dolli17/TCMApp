/**
 * notification-pushes gegen nachgebildetes PostgREST, Expo, APNs und FCM (N7).
 *
 * Geprüft wird die Aufteilung nach Anbieter (`geraete`), der Rückfall auf
 * `tokens`, fehlende Konfiguration, das Stilllegen toter Geräte und die
 * Freigabe nach vorübergehenden Fehlern. Die Schlüssel für APNs und das
 * Dienstkonto entstehen zur Laufzeit; die Signaturen werden mit dem
 * öffentlichen Gegenstück geprüft.
 *
 *   deno test --allow-env --allow-read supabase/functions/_tests
 */

import { assert, assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1";
import { type Aufruf, anfrage, DIENST, json, ladeFunction, lies, Router } from "./attrappe.ts";
import { Apns, apnsKonfiguration } from "../notification-pushes/apns.ts";
import { Fcm, fcmKonfiguration } from "../notification-pushes/fcm.ts";
import { freizugeben, nebenlaeufig } from "../notification-pushes/zustellung.ts";

const MODUL = new URL("../notification-pushes/index.ts", import.meta.url);
const ZEITGEBER = `Bearer ${DIENST}`;
const APNS_PFAD = /^\/3\/device\//;
const FCM_PFAD = /^\/v1\/projects\/tcm-test\/messages:send$/;

// ---------------------------------------------------------------------------
// Testschlüssel
// ---------------------------------------------------------------------------

function pem(art: string, bytes: ArrayBuffer): string {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return `-----BEGIN ${art}-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END ${art}-----\n`;
}

const apnsPaar = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const APNS_P8 = pem("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", apnsPaar.privateKey));

const googlePaar = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
);
const DIENSTKONTO = JSON.stringify({
  type: "service_account",
  project_id: "tcm-test",
  client_email: "push@tcm-test.iam.gserviceaccount.com",
  private_key: pem("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", googlePaar.privateKey)),
  token_uri: "https://oauth2.googleapis.com/token",
});

const APNS_UMGEBUNG = {
  APNS_KEY_ID: "KEY1234567",
  APNS_TEAM_ID: "93Z2KKGMV7",
  APNS_PRIVATE_KEY: APNS_P8,
  APNS_BUNDLE_ID: "de.tcmuckensturm.app",
};
const ALLES = { PUSH_AKTIV: "true", ...APNS_UMGEBUNG, FCM_SERVICE_ACCOUNT: DIENSTKONTO };

function b64urlBytes(teil: string): Uint8Array<ArrayBuffer> {
  const b64 = teil.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Kopf und Nutzlast eines JWT, nachdem die Signatur mit `pruefen` bestätigt ist. */
async function jwtPruefen(
  jwt: string,
  schluessel: CryptoKey,
  verfahren: AlgorithmIdentifier | EcdsaParams,
): Promise<{ kopf: Record<string, unknown>; nutzlast: Record<string, unknown> }> {
  const [k, n, s] = jwt.split(".");
  const gueltig = await crypto.subtle.verify(
    verfahren,
    schluessel,
    b64urlBytes(s!),
    new TextEncoder().encode(`${k}.${n}`),
  );
  assert(gueltig, "Signatur ungültig");
  const lesen = (t: string) => JSON.parse(new TextDecoder().decode(b64urlBytes(t)));
  return { kopf: lesen(k!), nutzlast: lesen(n!) };
}

// ---------------------------------------------------------------------------
// Attrappe
// ---------------------------------------------------------------------------

function empfaenger(n: number, geraete: { token: string; provider: string }[] | undefined, felder = {}) {
  return {
    member_id: `m-${n}`,
    tokens: (geraete ?? []).filter((g) => g.provider === "expo").map((g) => g.token),
    notification_ids: [`n-${n}`],
    items: [{
      kind: "event_changed",
      title: `Hinweis ${n}`,
      body: "Text",
      created_at: "2026-10-29T10:00:00Z",
      event_id: "e-1",
    }],
    ...(geraete ? { geraete } : {}),
    ...felder,
  };
}

function vorgaben(abzuholen: unknown[]): Router {
  return new Router()
    .rpc("claim_notification_pushes", () => ({ json: abzuholen }))
    .rpc("release_notification_pushes", () => ({ json: null }))
    .rpc("disable_push_token", () => ({ json: null }))
    .route("POST", "/--/api/v2/push/send", (a) => ({
      json: { data: (a.koerper as unknown[]).map(() => ({ status: "ok" })) },
    }))
    .route("POST", APNS_PFAD, () => new Response(null, { status: 200 }))
    .route("POST", "/token", () => ({ json: { access_token: "ya29.zugriff", expires_in: 3600 } }))
    .route("POST", FCM_PFAD, () => ({ json: { name: "projects/tcm-test/messages/1" } }));
}

async function rufe(router: Router, umgebung: Record<string, string> = ALLES) {
  const handler = await ladeFunction(MODUL, router, umgebung);
  const warn = console.warn;
  const log: string[] = [];
  console.warn = (...teile: unknown[]) => log.push(teile.join(" "));
  try {
    return { ...await lies(await handler(anfrage({}, { token: ZEITGEBER }))), log };
  } finally {
    console.warn = warn;
  }
}

const stillgelegt = (r: Router) =>
  r.an("/rest/v1/rpc/disable_push_token").map((a) => (a.koerper as { p_token: string }).p_token);

const apnsMarke = (a: Aufruf) => decodeURIComponent(a.pfad.replace(APNS_PFAD, ""));

// ---------------------------------------------------------------------------
// Aufteilung nach Anbieter
// ---------------------------------------------------------------------------

Deno.test("Aufteilung: Expo an exp.host, APNs und FCM direkt, je mit Ziel und Daten", async () => {
  const router = vorgaben([
    empfaenger(1, [
      { token: "ExponentPushToken[a]", provider: "expo" },
      { token: "aabbcc", provider: "apns" },
      { token: "fcm-1", provider: "fcm" },
      { token: "fcm-2", provider: "fcm" },
    ]),
  ]);
  const r = await rufe(router);
  assertEquals(r.status, 200);
  assertEquals(r.koerper, { ok: true, empfaenger: 1, gesendet: 4, stillgelegt: 0, uebersprungen: 0 });

  // Expo unverändert: nur die Expo-Marke, Daten nur das Ziel.
  const [expo] = router.an("/--/api/v2/push/send");
  assertEquals(expo.koerper, [{
    to: "ExponentPushToken[a]",
    title: "Hinweis 1",
    body: "Text",
    sound: "default",
    badge: 1,
    data: { ziel: "/verein/veranstaltung/e-1" },
  }]);

  // APNs: Produktion, Bundle-ID als Topic, Alert, signiertes JWT.
  const [apns] = router.an(APNS_PFAD);
  assertEquals(apns.host, "api.push.apple.com");
  assertEquals(apnsMarke(apns), "aabbcc");
  assertEquals(apns.kopf.get("apns-topic"), "de.tcmuckensturm.app");
  assertEquals(apns.kopf.get("apns-push-type"), "alert");
  assertEquals(apns.koerper, {
    aps: { alert: { title: "Hinweis 1", body: "Text" }, sound: "default", badge: 1 },
    ziel: "/verein/veranstaltung/e-1",
    kind: "event_changed",
    event_id: "e-1",
  });
  const jwt = apns.kopf.get("authorization")!.replace(/^bearer /, "");
  const { kopf, nutzlast } = await jwtPruefen(jwt, apnsPaar.publicKey, { name: "ECDSA", hash: "SHA-256" });
  assertEquals(kopf.alg, "ES256");
  assertEquals(kopf.kid, "KEY1234567");
  assertEquals(nutzlast.iss, "93Z2KKGMV7");
  assert(typeof nutzlast.iat === "number");

  // FCM: ein Zugriffstoken für beide Geräte.
  const [tausch] = router.an("/token");
  assertEquals(router.an("/token").length, 1);
  assertEquals(tausch.host, "oauth2.googleapis.com");
  const form = new URLSearchParams(tausch.koerper as string);
  assertEquals(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  const g = await jwtPruefen(form.get("assertion")!, googlePaar.publicKey, { name: "RSASSA-PKCS1-v1_5" });
  assertEquals(g.kopf.alg, "RS256");
  assertEquals(g.nutzlast.iss, "push@tcm-test.iam.gserviceaccount.com");
  assertEquals(g.nutzlast.aud, "https://oauth2.googleapis.com/token");
  assertEquals(g.nutzlast.scope, "https://www.googleapis.com/auth/firebase.messaging");

  const fcm = router.an(FCM_PFAD);
  assertEquals(fcm.map((a) => (a.koerper as { message: { token: string } }).message.token).sort(), [
    "fcm-1",
    "fcm-2",
  ]);
  assertEquals(fcm[0].host, "fcm.googleapis.com");
  assertEquals(fcm[0].authorization, "Bearer ya29.zugriff");
  const nachricht = (fcm[0].koerper as { message: Record<string, unknown> }).message;
  assertEquals(nachricht.notification, { title: "Hinweis 1", body: "Text" });
  assertEquals(nachricht.data, { ziel: "/verein/veranstaltung/e-1", kind: "event_changed", event_id: "e-1" });

  assertEquals(router.an("/rest/v1/rpc/release_notification_pushes"), []);
  assertEquals(stillgelegt(router), []);
});

Deno.test("APNS_UMGEBUNG=sandbox geht an den Sandbox-Rechner", async () => {
  const router = vorgaben([empfaenger(1, [{ token: "aabbcc", provider: "apns" }])]);
  await rufe(router, { ...ALLES, APNS_UMGEBUNG: "sandbox" });
  assertEquals(router.an(APNS_PFAD)[0].host, "api.sandbox.push.apple.com");
});

Deno.test("ohne geraete (ältere Datenbank): tokens gehen wie bisher an Expo", async () => {
  const router = vorgaben([{ ...empfaenger(1, undefined), tokens: ["ExponentPushToken[alt]"] }]);
  const r = await rufe(router);
  assertEquals(r.koerper.gesendet, 1);
  assertEquals((router.an("/--/api/v2/push/send")[0].koerper as { to: string }[])[0].to, "ExponentPushToken[alt]");
  assertEquals(router.an(APNS_PFAD), []);
  assertEquals(router.an(FCM_PFAD), []);
});

Deno.test("mehrere Posten: Sammeltitel, kind nur bei einer Art, event_id nur bei einer Veranstaltung", async () => {
  const e = empfaenger(1, [{ token: "aabbcc", provider: "apns" }], {
    notification_ids: ["n-1", "n-2"],
    items: [
      { kind: "booking_cancelled", title: "A", body: "a", created_at: "2026-10-29T10:00:00Z", event_id: null },
      { kind: "event_changed", title: "B", body: "b", created_at: "2026-10-29T10:01:00Z", event_id: "e-1" },
    ],
  });
  const router = vorgaben([e]);
  await rufe(router);
  assertEquals(router.an(APNS_PFAD)[0].koerper, {
    aps: { alert: { title: "2 Neuigkeiten vom TC Muckensturm", body: "A · B" }, sound: "default", badge: 2 },
    ziel: "/nachrichten",
  });
});

// ---------------------------------------------------------------------------
// Fehlende Konfiguration und Trockenlauf
// ---------------------------------------------------------------------------

Deno.test("ohne APNs- und FCM-Konfiguration: diese Geräte übersprungen, Expo läuft, Log ohne Marken", async () => {
  const router = vorgaben([
    empfaenger(1, [
      { token: "ExponentPushToken[a]", provider: "expo" },
      { token: "geheime-apns-marke", provider: "apns" },
      { token: "geheime-fcm-marke", provider: "fcm" },
    ]),
  ]);
  const r = await rufe(router, { PUSH_AKTIV: "true" });
  assertEquals(r.status, 200);
  assertEquals(r.koerper.gesendet, 1);
  assertEquals(r.koerper.uebersprungen, 2);
  assertEquals(router.an(APNS_PFAD), []);
  assertEquals(router.an(FCM_PFAD), []);
  assertEquals(router.an("/token"), []);
  assertEquals(router.an("/rest/v1/rpc/release_notification_pushes"), []);
  assertEquals(r.log.length, 2);
  for (const zeile of r.log) assert(!/geheime/.test(zeile), zeile);
});

Deno.test("unvollständige APNs-Konfiguration oder kaputtes Dienstkonto gilt als fehlend", () => {
  const env = (werte: Record<string, string>) => (n: string) => werte[n];
  assertEquals(apnsKonfiguration(env({ ...APNS_UMGEBUNG, APNS_KEY_ID: "" })), null);
  assertEquals(apnsKonfiguration(env(APNS_UMGEBUNG))?.umgebung, "production");
  assertEquals(fcmKonfiguration("kein json"), null);
  assertEquals(fcmKonfiguration(JSON.stringify({ project_id: "p" })), null);
  assertEquals(fcmKonfiguration(DIENSTKONTO)?.projektId, "tcm-test");
});

Deno.test("Trockenlauf ohne PUSH_AKTIV: zeigt auch die direkten Nachrichten, schickt nichts", async () => {
  const { PUSH_AKTIV: _, ...ohne } = ALLES;
  const router = vorgaben([
    empfaenger(1, [{ token: "ExponentPushToken[a]", provider: "expo" }, { token: "aabbcc", provider: "apns" }]),
  ]);
  const r = await rufe(router, ohne);
  assertEquals(r.koerper.trockenlauf, true);
  assertEquals((r.koerper.nachrichten as unknown[]).length, 1);
  assertEquals((r.koerper.direkt as { anbieter: string; to: string }[]).map((d) => [d.anbieter, d.to]), [[
    "apns",
    "aabbcc",
  ]]);
  assertEquals(router.an("/--/api/v2/push/send"), []);
  assertEquals(router.an(APNS_PFAD), []);
});

// ---------------------------------------------------------------------------
// Tote Geräte und Fehler
// ---------------------------------------------------------------------------

Deno.test("APNs 410 und 400 BadDeviceToken: stilllegen; DeviceTokenNotForTopic nicht", async () => {
  const router = vorgaben([
    empfaenger(1, [
      { token: "weg", provider: "apns" },
      { token: "kaputt", provider: "apns" },
      { token: "falschesthema", provider: "apns" },
    ]),
  ]).route("POST", APNS_PFAD, (a) => {
    const marke = apnsMarke(a);
    if (marke === "weg") return { status: 410, json: { reason: "Unregistered", timestamp: 1 } };
    if (marke === "kaputt") return { status: 400, json: { reason: "BadDeviceToken" } };
    return { status: 400, json: { reason: "DeviceTokenNotForTopic" } };
  });
  const r = await rufe(router);
  assertEquals(r.status, 200);
  assertEquals(stillgelegt(router).sort(), ["kaputt", "weg"]);
  assertEquals(r.koerper.stillgelegt, 2);
  assertEquals(r.koerper.gesendet, 0);
  assertEquals(router.an("/rest/v1/rpc/release_notification_pushes"), []);
});

Deno.test("FCM UNREGISTERED, 404 und INVALID_ARGUMENT an der Marke: stilllegen; anderer INVALID_ARGUMENT nicht", async () => {
  const fehler = (status: number, code: string, extra: Record<string, unknown> = {}) => ({
    status,
    json: {
      error: {
        code: status,
        status: code,
        message: "x",
        details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: code }, extra],
      },
    },
  });
  const router = vorgaben([
    empfaenger(1, [
      { token: "abgemeldet", provider: "fcm" },
      { token: "unbekannt", provider: "fcm" },
      { token: "ungueltig", provider: "fcm" },
      { token: "nachricht-kaputt", provider: "fcm" },
    ]),
  ]).route("POST", FCM_PFAD, (a) => {
    const marke = (a.koerper as { message: { token: string } }).message.token;
    if (marke === "abgemeldet") return fehler(404, "UNREGISTERED");
    if (marke === "unbekannt") return fehler(404, "NOT_FOUND");
    if (marke === "ungueltig") {
      return fehler(400, "INVALID_ARGUMENT", { fieldViolations: [{ field: "message.token" }] });
    }
    return fehler(400, "INVALID_ARGUMENT", { fieldViolations: [{ field: "message.data" }] });
  });
  const r = await rufe(router);
  assertEquals(r.status, 200);
  assertEquals(stillgelegt(router).sort(), ["abgemeldet", "unbekannt", "ungueltig"]);
});

Deno.test("vorübergehender Fehler: freigegeben wird nur, was auf keinem Gerät ankam", async () => {
  const router = vorgaben([
    // Nur ein iPhone, und Apple ist weg: wieder freigeben.
    empfaenger(1, [{ token: "nur-apns", provider: "apns" }]),
    // iPhone weg, aber Android kam an: abgehakt lassen.
    empfaenger(2, [{ token: "auch-apns", provider: "apns" }, { token: "fcm-2", provider: "fcm" }]),
    // Expo kam an.
    empfaenger(3, [{ token: "ExponentPushToken[c]", provider: "expo" }]),
  ]).route("POST", APNS_PFAD, () => ({ status: 503, json: { reason: "ServiceUnavailable" } }));
  const r = await rufe(router);
  assertEquals(r.status, 502);
  assertEquals(r.koerper.ok, false);
  assertMatch(String(r.koerper.meldung), /APNs antwortete mit 503 ServiceUnavailable/);
  assertEquals(r.koerper.gesendet, 2);
  const [freigabe] = router.an("/rest/v1/rpc/release_notification_pushes");
  assertEquals((freigabe.koerper as { p_ids: string[] }).p_ids, ["n-1"]);
  assertEquals(stillgelegt(router), []);
});

Deno.test("Expo-Stapel scheitert, APNs kommt an: nur die Expo-Empfänger werden frei, tote Marken trotzdem stillgelegt", async () => {
  const router = vorgaben([
    empfaenger(1, [{ token: "ExponentPushToken[a]", provider: "expo" }]),
    empfaenger(2, [{ token: "ExponentPushToken[b]", provider: "expo" }, { token: "ios-2", provider: "apns" }]),
    empfaenger(3, [{ token: "tot", provider: "apns" }]),
  ])
    .route("POST", "/--/api/v2/push/send", () => ({ status: 500, json: {} }))
    .route("POST", APNS_PFAD, (a) =>
      apnsMarke(a) === "tot" ? { status: 410, json: { reason: "Unregistered" } } : new Response(null, { status: 200 })
    );
  const r = await rufe(router);
  assertEquals(r.status, 502);
  assertMatch(String(r.koerper.meldung), /Expo antwortete mit 500/);
  const [freigabe] = router.an("/rest/v1/rpc/release_notification_pushes");
  assertEquals((freigabe.koerper as { p_ids: string[] }).p_ids, ["n-1"]);
  assertEquals(stillgelegt(router), ["tot"]);
});

// ---------------------------------------------------------------------------
// Anmeldetokens zwischenspeichern
// ---------------------------------------------------------------------------

const MELDUNG = { titel: "T", text: "x", badge: 1, daten: { ziel: "/nachrichten" } };

Deno.test("APNs-JWT gilt fünfzig Minuten; nach 403 ExpiredProviderToken gibt es ein neues", async () => {
  let uhr = 1_800_000_000_000;
  const router = new Router().route("POST", APNS_PFAD, () => new Response(null, { status: 200 }));
  const apns = new Apns(apnsKonfiguration((n) => (APNS_UMGEBUNG as Record<string, string>)[n])!, router.fetch, () => uhr);

  const erstes = await apns.token();
  uhr += 49 * 60 * 1000;
  assertEquals(await apns.token(), erstes);
  uhr += 2 * 60 * 1000;
  const zweites = await apns.token();
  assertNotEquals(zweites, erstes);

  router.route("POST", APNS_PFAD, () => ({ status: 403, json: { reason: "ExpiredProviderToken" } }));
  uhr += 1000;
  assertEquals((await apns.senden("aabbcc", MELDUNG)).ergebnis, "fehler");
  assertNotEquals(await apns.token(), zweites);
});

Deno.test("FCM-Zugriffstoken bis kurz vor Ablauf behalten, nach 401 neu holen", async () => {
  let uhr = 1_800_000_000_000;
  let n = 0;
  const router = new Router()
    .route("POST", "/token", () => ({ json: { access_token: `t-${++n}`, expires_in: 3600 } }))
    .route("POST", FCM_PFAD, () => ({ json: {} }));
  const fcm = new Fcm(fcmKonfiguration(DIENSTKONTO)!, router.fetch, () => uhr);

  // Gleichzeitige Abrufe teilen sich einen Tausch.
  assertEquals(await Promise.all([fcm.token(), fcm.token()]), ["t-1", "t-1"]);
  uhr += 54 * 60 * 1000;
  assertEquals(await fcm.token(), "t-1");
  uhr += 2 * 60 * 1000;
  assertEquals(await fcm.token(), "t-2");

  router.route("POST", FCM_PFAD, () => ({ status: 401, json: { error: { code: 401, status: "UNAUTHENTICATED" } } }));
  assertEquals((await fcm.senden("fcm-1", MELDUNG)).ergebnis, "fehler");
  assertEquals(await fcm.token(), "t-3");
});

Deno.test("FCM: scheitert die Google-Anmeldung, ist das ein vorübergehender Fehler", async () => {
  const router = new Router().route("POST", "/token", () => json({ error: "invalid_grant" }, 400));
  const fcm = new Fcm(fcmKonfiguration(DIENSTKONTO)!, router.fetch);
  const z = await fcm.senden("fcm-1", MELDUNG);
  assertEquals(z.ergebnis, "fehler");
  assertMatch(z.grund ?? "", /400/);
  assertEquals(router.an(FCM_PFAD), []);
});

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

Deno.test("nebenlaeufig: höchstens n gleichzeitig, Ergebnisse in Eingabereihenfolge", async () => {
  let laufend = 0;
  let hoechstens = 0;
  const ergebnis = await nebenlaeufig([5, 1, 4, 2, 3, 0], 2, async (ms) => {
    hoechstens = Math.max(hoechstens, ++laufend);
    await new Promise((r) => setTimeout(r, ms));
    laufend--;
    return ms * 10;
  });
  assertEquals(ergebnis, [50, 10, 40, 20, 30, 0]);
  assertEquals(hoechstens, 2);
  assertEquals(await nebenlaeufig([], 3, () => Promise.resolve(1)), []);
});

Deno.test("freizugeben: gescheitert minus zugestellt, ohne Doppelte", () => {
  assertEquals(freizugeben(["a", "b", "a", "c"], ["b"]), ["a", "c"]);
  assertEquals(freizugeben([], ["a"]), []);
});
