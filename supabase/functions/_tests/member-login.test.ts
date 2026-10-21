/**
 * member-login gegen nachgebildetes Auth und PostgREST (T6).
 *
 * Geprüft wird, was die Function selbst entscheidet: die Reihenfolge
 * Identität - Rolle - Service-Schlüssel, dass Adressen aus der Datenbank kommen
 * und nicht aus der Anfrage, welcher Schlüssel welche Anfrage stellt und dass
 * ein halb angelegter Login wieder verschwindet. Die Regeln in den RPCs selbst
 * prüft pgTAP.
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

const MODUL = new URL("../member-login/index.ts", import.meta.url);

// auth-js prüft, dass Login-Ids UUIDs sind.
const ADMIN_LOGIN = "a0000000-0000-4000-8000-000000000001";
const KIRA_LOGIN = "a0000000-0000-4000-8000-000000000002";
const NEU_LOGIN = "a0000000-0000-4000-8000-000000000003";
const ALT_LOGIN = "a0000000-0000-4000-8000-000000000004";
const ANDERER_LOGIN = "a0000000-0000-4000-8000-000000000005";

const MITGLIED = {
  id: "m-1",
  email: "kira@tcm.test",
  auth_user_id: KIRA_LOGIN,
  status: "active",
  name: "Kira Kasse",
};

/** Ein Router, der einen Administrator und ein Mitglied kennt. */
function vorgaben(): Router {
  return new Router()
    .route("GET", "/auth/v1/user", () => ({ json: benutzer(ADMIN_LOGIN) }))
    .rpc("am_i_admin", () => ({ json: true }))
    .rpc("ist_testadresse", (a) => ({
      json: String((a.koerper as { p_email: string }).p_email).endsWith("@example.org"),
    }))
    .rpc("member_for_login_admin", (a) => ({
      json: (a.koerper as { p_member_id: string }).p_member_id === MITGLIED.id ? [MITGLIED] : [],
    }));
}

async function rufe(router: Router, koerper: unknown, optionen?: Parameters<typeof anfrage>[1]) {
  const handler = await ladeFunction(MODUL, router);
  return lies(await handler(anfrage(koerper, optionen)));
}

/** Kein einziger Aufruf mit dem Service-Schlüssel. */
function ohneDienst(router: Router) {
  assertEquals(router.aufrufe.filter((a) => a.schluessel === DIENST), []);
}

// ---------------------------------------------------------------------------
// Tor: Methode, Token, Rolle
// ---------------------------------------------------------------------------

Deno.test("nur POST", async () => {
  const router = vorgaben();
  const r = await rufe(router, null, { methode: "GET" });
  assertEquals(r.status, 405);
  assertEquals(router.aufrufe, []);
});

Deno.test("ohne Token: 401, kein Aufruf", async () => {
  const router = vorgaben();
  const r = await rufe(router, { aktion: "loeschen", memberId: "m-1" }, { token: null });
  assertEquals(r.status, 401);
  assertEquals(router.aufrufe, []);
});

Deno.test("ungültiges Token: 401, Auth entscheidet", async () => {
  const router = vorgaben().route("GET", "/auth/v1/user", () =>
    authFehler("invalid JWT", 401, "bad_jwt")
  );
  const r = await rufe(router, { aktion: "loeschen", memberId: "m-1" });
  assertEquals(r.status, 401);
  // Das Token ging so, wie es kam, mit dem Anon-Schlüssel an Auth.
  const [frage] = router.an("/auth/v1/user");
  assertEquals(frage.authorization, NUTZER);
  assertEquals(frage.schluessel, ANON);
  ohneDienst(router);
});

Deno.test("kein Administrator: 403, der Service-Schlüssel kommt nie zum Einsatz", async () => {
  for (const antwort of [{ json: false }, { json: null }, pgFehler("kaputt")]) {
    const router = vorgaben().rpc("am_i_admin", () => antwort);
    const r = await rufe(router, { aktion: "loeschen", memberId: "m-1", art: "loeschen" });
    assertEquals(r.status, 403);
    assertEquals(router.an("/rest/v1/rpc/am_i_admin")[0].authorization, NUTZER);
    ohneDienst(router);
  }
});

Deno.test("unvollständige Anfragen: 400", async () => {
  for (const koerper of ["kein json", {}, { aktion: "loeschen" }]) {
    const r = await rufe(vorgaben(), koerper);
    assertEquals(r.status, 400, JSON.stringify(koerper));
    assertEquals(r.koerper.meldung, "Die Anfrage ist unvollständig.");
  }
});

Deno.test("unbekanntes Mitglied: 404", async () => {
  const r = await rufe(vorgaben(), { aktion: "login_deaktivieren", memberId: "m-x" });
  assertEquals(r.status, 404);
});

Deno.test("unbekannte Aktion: 400", async () => {
  const r = await rufe(vorgaben(), { aktion: "allmacht", memberId: "m-1" });
  assertEquals(r.status, 400);
  assertEquals(r.koerper.meldung, "Unbekannte Aktion.");
});

// ---------------------------------------------------------------------------
// Passwort und Einladung
// ---------------------------------------------------------------------------

Deno.test("passwort_zuruecksetzen: an die Adresse aus der Datenbank, nie aus der Anfrage", async () => {
  const router = vorgaben().route("POST", "/auth/v1/recover", () => ({ json: {} }));
  const r = await rufe(router, {
    aktion: "passwort_zuruecksetzen",
    memberId: "m-1",
    email: "angreifer@boese.test",
  });
  assertEquals(r.status, 200);
  assertEquals(r.koerper.ok, true);
  const [mail] = router.an("/auth/v1/recover");
  assertEquals((mail.koerper as { email: string }).email, MITGLIED.email);
  assertEquals(mail.suche.get("redirect_to"), "https://tcm.test/passwort-setzen");
  assertEquals(mail.schluessel, DIENST);
});

Deno.test("passwort_zuruecksetzen: keine Mail an Testadressen", async () => {
  const router = vorgaben()
    .rpc("member_for_login_admin", () => ({ json: [{ ...MITGLIED, email: "x@example.org" }] }))
    .route("POST", "/auth/v1/recover", () => ({ json: {} }));
  const r = await rufe(router, { aktion: "passwort_zuruecksetzen", memberId: "m-1" });
  assertEquals(r.status, 400);
  assertMatch(String(r.koerper.meldung), /Testadresse/);
  assertEquals(router.an("/auth/v1/recover"), []);
});

Deno.test("passwort_zuruecksetzen: ohne Login 400", async () => {
  const router = vorgaben().rpc("member_for_login_admin", () => ({
    json: [{ ...MITGLIED, auth_user_id: null }],
  }));
  const r = await rufe(router, { aktion: "passwort_zuruecksetzen", memberId: "m-1" });
  assertEquals(r.status, 400);
  assertEquals(r.koerper.meldung, "Dieses Mitglied hat keinen Zugang.");
});

function einladungRouter(onboarding: string | null, bestaetigt: boolean): Router {
  return vorgaben()
    .route("GET", "/rest/v1/members", () => ({ json: [{ onboarding_completed_at: onboarding }] }))
    .route("GET", `/auth/v1/admin/users/${KIRA_LOGIN}`, () => ({
      json: benutzer(KIRA_LOGIN, { email_confirmed_at: bestaetigt ? "2026-10-01T00:00:00Z" : null }),
    }))
    .route("POST", "/auth/v1/invite", () => ({ json: benutzer(KIRA_LOGIN) }))
    .route("POST", "/auth/v1/recover", () => ({ json: {} }));
}

Deno.test("einladung_erneut: unbestätigt gibt es eine neue Einladung", async () => {
  const router = einladungRouter(null, false);
  const r = await rufe(router, { aktion: "einladung_erneut", memberId: "m-1" });
  assertEquals(r.status, 200);
  assertEquals(router.an("/auth/v1/invite").length, 1);
  assertEquals((router.an("/auth/v1/invite")[0].koerper as { email: string }).email, MITGLIED.email);
  assertEquals(router.an("/auth/v1/recover"), []);
  // Das Onboarding liest die Function mit dem Token des Aufrufers.
  assertEquals(router.an("/rest/v1/members")[0].authorization, NUTZER);
});

Deno.test("einladung_erneut: bestätigt gibt es einen Recovery-Link", async () => {
  const router = einladungRouter(null, true);
  const r = await rufe(router, { aktion: "einladung_erneut", memberId: "m-1" });
  assertEquals(r.status, 200);
  assertEquals(router.an("/auth/v1/invite"), []);
  assertEquals(router.an("/auth/v1/recover").length, 1);
});

Deno.test("einladung_erneut: nach dem Onboarding nicht mehr", async () => {
  const router = einladungRouter("2026-10-02T00:00:00Z", true);
  const r = await rufe(router, { aktion: "einladung_erneut", memberId: "m-1" });
  assertEquals(r.status, 400);
  assertMatch(String(r.koerper.meldung), /schon eingerichtet/);
  assertEquals(router.an("/auth/v1/recover"), []);
  assertEquals(router.an("/auth/v1/invite"), []);
});

Deno.test("einladung_status: Stand je Mitglied, letzter Versand gewinnt", async () => {
  const router = vorgaben().route("GET", `/auth/v1/admin/users/${KIRA_LOGIN}`, () => ({
    json: benutzer(KIRA_LOGIN, {
      email_confirmed_at: null,
      last_sign_in_at: null,
      invited_at: "2026-10-01T10:00:00Z",
      recovery_sent_at: "2026-10-03T10:00:00Z",
      confirmation_sent_at: null,
    }),
  }));
  const r = await rufe(router, { aktion: "einladung_status", memberIds: ["m-1", "m-x"] });
  assertEquals(r.status, 200);
  assertEquals(r.koerper.status, {
    "m-1": { bestaetigt: false, angemeldet_am: null, gesendet_am: "2026-10-03T10:00:00Z" },
  });
});

Deno.test("einladung_status: höchstens 200 Mitglieder", async () => {
  const ids = Array.from({ length: 201 }, (_, i) => `m-${i}`);
  const router = vorgaben();
  const r = await rufe(router, { aktion: "einladung_status", memberIds: ids });
  assertEquals(r.status, 400);
  assertEquals(router.an(/admin\/users/), []);
});

// ---------------------------------------------------------------------------
// Sperren, Adresse, Löschen
// ---------------------------------------------------------------------------

Deno.test("login_deaktivieren und login_aktivieren: Bann und Kennzeichen", async () => {
  for (const [aktion, dauer, gesperrt] of [
    ["login_deaktivieren", "876000h", true],
    ["login_aktivieren", "none", false],
  ] as const) {
    const router = vorgaben()
      .route("PUT", `/auth/v1/admin/users/${KIRA_LOGIN}`, () => ({ json: benutzer(KIRA_LOGIN) }))
      .rpc("set_login_disabled", () => ({ json: null }));
    const r = await rufe(router, { aktion, memberId: "m-1" });
    assertEquals(r.status, 200, aktion);
    assertEquals(
      (router.an(`/auth/v1/admin/users/${KIRA_LOGIN}`, "PUT")[0].koerper as { ban_duration: string })
        .ban_duration,
      dauer,
    );
    const [kennzeichen] = router.an("/rest/v1/rpc/set_login_disabled");
    assertEquals(kennzeichen.koerper, { p_member_id: "m-1", p_disabled: gesperrt });
    assertEquals(kennzeichen.schluessel, DIENST);
  }
});

Deno.test("login_deaktivieren: scheitert der Bann, bleibt das Kennzeichen", async () => {
  const router = vorgaben()
    .route("PUT", `/auth/v1/admin/users/${KIRA_LOGIN}`, () => authFehler("kaputt", 500))
    .rpc("set_login_disabled", () => ({ json: null }));
  const r = await rufe(router, { aktion: "login_deaktivieren", memberId: "m-1" });
  assertEquals(r.status, 400);
  assertEquals(router.an("/rest/v1/rpc/set_login_disabled"), []);
});

Deno.test("email_aendern: erst die Datenbank mit dem Token des Aufrufers, dann der Login", async () => {
  const router = vorgaben()
    .rpc("update_member", () => ({ json: null }))
    .route("PUT", `/auth/v1/admin/users/${KIRA_LOGIN}`, () => ({ json: benutzer(KIRA_LOGIN) }));
  const r = await rufe(router, { aktion: "email_aendern", memberId: "m-1", email: " Neu@TCM.test " });
  assertEquals(r.status, 200);
  const [db] = router.an("/rest/v1/rpc/update_member");
  assertEquals(db.koerper, { p_member_id: "m-1", p_patch: { email: "neu@tcm.test" } });
  assertEquals(db.authorization, NUTZER);
  assertEquals(router.an(`/auth/v1/admin/users/${KIRA_LOGIN}`, "PUT")[0].koerper, {
    email: "neu@tcm.test",
    email_confirm: true,
  });
});

Deno.test("email_aendern: lehnt die Datenbank ab, bleibt der Login unberührt", async () => {
  const router = vorgaben()
    .rpc("update_member", () => pgFehler("doppelt", "23505", 409))
    .route("PUT", `/auth/v1/admin/users/${KIRA_LOGIN}`, () => ({ json: benutzer(KIRA_LOGIN) }));
  const r = await rufe(router, { aktion: "email_aendern", memberId: "m-1", email: "neu@tcm.test" });
  assertEquals(r.status, 400);
  // Code geht mit, damit das Web den Fehler übersetzen kann.
  assertEquals(r.koerper.code, "23505");
  assertEquals(router.an(`/auth/v1/admin/users/${KIRA_LOGIN}`, "PUT"), []);
});

Deno.test("email_aendern: scheitert der Login, geht die Adresse zurück", async () => {
  const router = vorgaben()
    .rpc("update_member", () => ({ json: null }))
    .route("PUT", `/auth/v1/admin/users/${KIRA_LOGIN}`, () => authFehler("email_exists"));
  const r = await rufe(router, { aktion: "email_aendern", memberId: "m-1", email: "neu@tcm.test" });
  assertEquals(r.status, 400);
  assertMatch(String(r.koerper.meldung), /bleibt die alte/);
  const patches = router.an("/rest/v1/rpc/update_member").map(
    (a) => (a.koerper as { p_patch: { email: string } }).p_patch.email,
  );
  assertEquals(patches, ["neu@tcm.test", MITGLIED.email]);
});

Deno.test("email_aendern: gleiche oder leere Adresse", async () => {
  const router = vorgaben();
  assertEquals(
    (await rufe(router, { aktion: "email_aendern", memberId: "m-1", email: "KIRA@tcm.test" })).koerper.meldung,
    "Die E-Mail-Adresse ist unverändert.",
  );
  assertEquals(
    (await rufe(router, { aktion: "email_aendern", memberId: "m-1", email: "  " })).status,
    400,
  );
  assertEquals(router.an("/rest/v1/rpc/update_member"), []);
});

Deno.test("loeschen: erst die Datenbank, dann der Login", async () => {
  const router = vorgaben()
    .rpc("delete_member", () => ({ json: null }))
    .route("DELETE", `/auth/v1/admin/users/${KIRA_LOGIN}`, () => ({ json: {} }));
  const r = await rufe(router, { aktion: "loeschen", memberId: "m-1", art: "loeschen", nachname: "Kasse" });
  assertEquals(r.status, 200);
  const [db] = router.an("/rest/v1/rpc/delete_member");
  assertEquals(db.koerper, { p_member_id: "m-1", p_confirm_name: "Kasse" });
  assertEquals(db.authorization, NUTZER);
  assertEquals(router.an(`/auth/v1/admin/users/${KIRA_LOGIN}`, "DELETE").length, 1);
});

Deno.test("loeschen: lehnt die Datenbank ab, bleibt der Login", async () => {
  const router = vorgaben()
    .rpc("delete_member", () => pgFehler("Nachname passt nicht", "22023"))
    .route("DELETE", `/auth/v1/admin/users/${KIRA_LOGIN}`, () => ({ json: {} }));
  const r = await rufe(router, { aktion: "loeschen", memberId: "m-1", art: "loeschen", nachname: "x" });
  assertEquals(r.status, 400);
  assertEquals(r.koerper.code, "22023");
  assertEquals(router.an(`/auth/v1/admin/users/${KIRA_LOGIN}`, "DELETE"), []);
});

Deno.test("loeschen als anonymisieren: mit Grund", async () => {
  const router = vorgaben()
    .rpc("anonymize_member", () => ({ json: null }))
    .route("DELETE", `/auth/v1/admin/users/${KIRA_LOGIN}`, () => ({ json: {} }));
  const r = await rufe(router, { aktion: "loeschen", memberId: "m-1", art: "anonymisieren", grund: "Austritt" });
  assertEquals(r.status, 200);
  assertMatch(String(r.koerper.meldung), /anonymisiert/);
  assertEquals(router.an("/rest/v1/rpc/anonymize_member")[0].koerper, {
    p_member_id: "m-1",
    p_reason: "Austritt",
  });
  assertEquals(router.an("/rest/v1/rpc/delete_member"), []);
});

// ---------------------------------------------------------------------------
// Anlegen und Antrag annehmen
// ---------------------------------------------------------------------------

const NEU = {
  p_first_name: "Nina",
  p_last_name: "Neu",
  p_email: " Nina@TCM.test ",
  p_auth_user_id: "fremder-login",
  p_irgendwas: "weg",
  p_phone: "",
};

function anlegeRouter(): Router {
  return vorgaben()
    .route("POST", "/auth/v1/invite", () => ({ json: benutzer(NEU_LOGIN) }))
    .route("POST", "/auth/v1/admin/users", () => ({ json: benutzer(NEU_LOGIN) }))
    .route("DELETE", /\/auth\/v1\/admin\/users\//, () => ({ json: {} }))
    .rpc("create_member", () => ({ json: "m-neu" }));
}

Deno.test("anlegen: Einladung, dann create_member nur mit erlaubten Feldern", async () => {
  const router = anlegeRouter();
  const r = await rufe(router, { aktion: "anlegen", daten: NEU });
  assertEquals(r.status, 200);
  assertEquals(r.koerper.id, "m-neu");
  assertEquals(r.koerper.meldung, "Einladung an nina@tcm.test verschickt.");

  const [einladung] = router.an("/auth/v1/invite");
  assertEquals((einladung.koerper as { email: string }).email, "nina@tcm.test");
  assertEquals(einladung.suche.get("redirect_to"), "https://tcm.test/passwort-setzen");

  const [db] = router.an("/rest/v1/rpc/create_member");
  assertEquals(db.koerper, {
    p_first_name: "Nina",
    p_last_name: "Neu",
    p_email: "nina@tcm.test",
    p_auth_user_id: NEU_LOGIN,
  });
  assertEquals(db.authorization, NUTZER);
});

Deno.test("anlegen: Testadresse bekommt ein stilles Konto ohne Mail", async () => {
  const router = anlegeRouter();
  const r = await rufe(router, { aktion: "anlegen", daten: { ...NEU, p_email: "nina@example.org" } });
  assertEquals(r.status, 200);
  assertEquals(router.an("/auth/v1/invite"), []);
  const [konto] = router.an("/auth/v1/admin/users", "POST");
  assertEquals(konto.koerper, { email: "nina@example.org", email_confirm: true });
  assertMatch(String(r.koerper.meldung), /Testadresse/);
});

Deno.test("anlegen: Pflichtfelder vor jeder Mail", async () => {
  for (const daten of [{ ...NEU, p_email: " " }, { ...NEU, p_last_name: "" }]) {
    const router = anlegeRouter();
    const r = await rufe(router, { aktion: "anlegen", daten });
    assertEquals(r.status, 400);
    assertEquals(router.an(/\/auth\/v1\/(invite|admin)/), []);
  }
});

Deno.test("anlegen: scheitert create_member, verschwindet der neue Login", async () => {
  const router = anlegeRouter().rpc("create_member", () => pgFehler("doppelt", "23505", 409));
  const r = await rufe(router, { aktion: "anlegen", daten: NEU });
  assertEquals(r.status, 400);
  assertEquals(r.koerper.code, "23505");
  assertEquals(router.an(`/auth/v1/admin/users/${NEU_LOGIN}`, "DELETE").length, 1);
});

/** Die Einladung scheitert, weil es die Adresse schon gibt; listUsers findet sie. */
function vorhandenRouter(kiosk: boolean): Router {
  return anlegeRouter()
    .route("POST", "/auth/v1/invite", () => authFehler("already been registered", 422, "email_exists"))
    .route("GET", "/auth/v1/admin/users", () => ({
      json: { users: [benutzer(ANDERER_LOGIN), benutzer(ALT_LOGIN, { email: "NINA@tcm.test" })], aud: "authenticated" },
    }))
    .route("GET", "/rest/v1/kiosk_devices", () => ({ json: kiosk ? [{ id: "k-1" }] : [] }));
}

Deno.test("anlegen: vorhandenes Konto wird übernommen und beim Scheitern nicht gelöscht", async () => {
  const router = vorhandenRouter(false);
  const r = await rufe(router, { aktion: "anlegen", daten: NEU });
  assertEquals(r.status, 200);
  assertMatch(String(r.koerper.meldung), /bereits einen Zugang/);
  assertEquals(
    (router.an("/rest/v1/rpc/create_member")[0].koerper as { p_auth_user_id: string }).p_auth_user_id,
    ALT_LOGIN,
  );

  const scheitert = vorhandenRouter(false).rpc("create_member", () => pgFehler("doppelt", "23505", 409));
  assertEquals((await rufe(scheitert, { aktion: "anlegen", daten: NEU })).status, 400);
  assertEquals(scheitert.an(/\/auth\/v1\/admin\/users\//, "DELETE"), []);
});

Deno.test("anlegen: ein Kiosk-Konto wird keinem Mitglied zugeordnet", async () => {
  const router = vorhandenRouter(true);
  const r = await rufe(router, { aktion: "anlegen", daten: NEU });
  assertEquals(r.status, 400);
  assertMatch(String(r.koerper.meldung), /Kiosk-Konto/);
  assertEquals(router.an("/rest/v1/rpc/create_member"), []);
  // Gelesen mit dem Token des Aufrufers, nicht mit dem Service-Schlüssel.
  assertEquals(router.an("/rest/v1/kiosk_devices")[0].authorization, NUTZER);
});

function antragRouter(status = "new", email: string | null = "Anna@TCM.test"): Router {
  return anlegeRouter()
    .route("GET", "/rest/v1/membership_applications", () => ({ json: [{ email, status }] }))
    .rpc("accept_membership_application", () => ({
      json: [{ member_id: "m-anna", membership_number: "1042" }],
    }));
}

Deno.test("antrag_annehmen: Adresse aus dem Antrag, leere Beitragsart heißt später", async () => {
  const router = antragRouter();
  const r = await rufe(router, {
    aktion: "antrag_annehmen",
    antrag: { id: "a-1", nummer: "", beitragsart: "", eintritt: "2026-11-01" },
    email: "angreifer@boese.test",
  });
  assertEquals(r.status, 200);
  assertEquals(r.koerper.id, "m-anna");
  assertMatch(String(r.koerper.meldung), /^Aufgenommen unter der Nummer 1042\. Einladung an anna@tcm\.test/);
  assertEquals((router.an("/auth/v1/invite")[0].koerper as { email: string }).email, "anna@tcm.test");
  const [db] = router.an("/rest/v1/rpc/accept_membership_application");
  assertEquals(db.koerper, {
    p_application_id: "a-1",
    p_fee_type_ids: [],
    p_started_on: "2026-11-01",
    p_auth_user_id: NEU_LOGIN,
  });
  assertEquals(db.authorization, NUTZER);
});

Deno.test("antrag_annehmen: bearbeitete, fehlende und adresslose Anträge", async () => {
  const faelle: [Router, number, RegExp][] = [
    [antragRouter("accepted"), 400, /bereits bearbeitet/],
    [antragRouter("new", null), 400, /keine E-Mail-Adresse/],
    [anlegeRouter().route("GET", "/rest/v1/membership_applications", () => ({ json: [] })), 404, /gibt es nicht/],
  ];
  for (const [router, status, meldung] of faelle) {
    const r = await rufe(router, { aktion: "antrag_annehmen", antrag: { id: "a-1" } });
    assertEquals(r.status, status);
    assertMatch(String(r.koerper.meldung), meldung);
    assertEquals(router.an(/\/auth\/v1\/(invite|admin)/), []);
  }
  assertEquals((await rufe(vorgaben(), { aktion: "antrag_annehmen" })).status, 400);
});

Deno.test("antrag_annehmen: scheitert die RPC, bleibt der Antrag offen und der Login geht", async () => {
  const router = antragRouter().rpc("accept_membership_application", () => pgFehler("Nummer vergeben", "23505", 409));
  const r = await rufe(router, {
    aktion: "antrag_annehmen",
    antrag: { id: "a-1", nummer: "7", beitragsart: "f-1" },
  });
  assertEquals(r.status, 400);
  const koerper = router.an("/rest/v1/rpc/accept_membership_application")[0].koerper as Record<string, unknown>;
  assertEquals(koerper.p_number, "7");
  assertEquals(koerper.p_fee_type_ids, ["f-1"]);
  assert(router.an(`/auth/v1/admin/users/${NEU_LOGIN}`, "DELETE").length === 1);
});
