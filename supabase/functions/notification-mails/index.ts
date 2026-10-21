/**
 * Benachrichtigungen als E-Mail verschicken.
 *
 * Warum eine Edge Function und keine Server Action: hier laufen zwei
 * Schlüssel zusammen, die die Serverseite nie verlassen dürfen — der
 * Dienstschlüssel und der Resend-Schlüssel. Beide gehören an genau einen eng
 * umrissenen Ort.
 *
 * Der Ablauf ist bewusst „erst abhaken, dann senden":
 *
 *   1. Aufrufer prüfen. Zwei sind erlaubt — der Zeitgeber mit Dienstschlüssel
 *      und ein Administrator, der von Hand anstößt. Der zweite Weg ist kein
 *      Luxus: er ist der Grund, warum sich die ganze Kette ohne Zeitgeber
 *      prüfen lässt.
 *   2. `claim_notification_mails` holt die offenen Benachrichtigungen und setzt
 *      dabei `mailed_at`. Über einen HTTP-Aufruf hinweg gibt es keine
 *      Transaktionsklammer; wer erst sendet und danach markiert, verschickt bei
 *      einem Absturz dazwischen beim nächsten Lauf alles noch einmal.
 *   3. Senden. Scheitert ein Stapel, gibt `release_notification_mails` die
 *      Nachrichten frei, die noch nicht draußen sind, und der nächste Lauf
 *      versucht es erneut. Was in einem früheren Stapel rausging, bleibt
 *      abgehakt (B9).
 *
 * Ohne `RESEND_API_KEY` läuft alles bis auf Schritt 3 — der Trockenlauf, den
 * .env.example seit jeher zusagt. So lässt sich die Funktion lokal gefahrlos
 * aufrufen, und ein vergessener Schlüssel führt nicht zu einer Fehlerlawine.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
// mailvorlage.ts ist ein Symlink auf packages/core/src/mailvorlage.ts. Die
// Vorlage liegt dort, weil sie dort unter Test steht - und hier, weil eine
// Edge Function nur mitnimmt, was neben ihr liegt. Ein Symlink statt einer
// Kopie: zwei Vorlagen waeren zwei Wahrheiten, und getestet wuerde die falsche.
import { betreff, html, text, type Posten } from "./mailvorlage.ts";
// Symlink auf packages/core/src/dienstschluessel.ts, dort unter Test.
import { istDienstschluessel } from "./dienstschluessel.ts";
// Symlink auf packages/core/src/versandstapel.ts, dort unter Test.
import { inStapelnSenden } from "./versandstapel.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "http://localhost:3000";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "TC Muckensturm <noreply@example.org>";

/** Wie viele Benachrichtigungen ein Lauf höchstens anfasst. */
const JE_LAUF = 200;

/** Resend nimmt bis zu 100 Mails je Stapel. */
const STAPEL = 100;

interface Empfaenger {
  member_id: string;
  email: string;
  first_name: string | null;
  notification_ids: string[];
  items: Posten[];
}

function antwort(koerper: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return antwort({ ok: false, meldung: "Nur POST." }, 405);
  }

  const kopf = req.headers.get("Authorization") ?? "";
  const token = kopf.replace(/^Bearer\s+/i, "");

  if (!token) {
    return antwort({ ok: false, meldung: "Nicht angemeldet." }, 401);
  }

  // 1.: Der Zeitgeber weist sich mit dem Dienstschlüssel aus. Jeder andere muss
  // ein angemeldeter Administrator sein - geprüft über die Datenbank, nicht
  // über eine Liste in dieser Datei.
  const istZeitgeber = await istDienstschluessel(token, {
    supabaseUrl: SUPABASE_URL,
    dienstschluessel: SERVICE_KEY,
    holen: fetch,
  });

  if (!istZeitgeber) {
    const alsAufrufer = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: benutzer, error: authFehler } = await alsAufrufer.auth.getUser();
    if (authFehler || !benutzer?.user) {
      return antwort({ ok: false, meldung: "Nicht angemeldet." }, 401);
    }

    const { data: istAdmin, error: rolleFehler } = await alsAufrufer.rpc("am_i_admin");
    if (rolleFehler || istAdmin !== true) {
      return antwort(
        { ok: false, meldung: "Den Versand anstoßen dürfen nur Administratoren." },
        403,
      );
    }
  }

  const alsDienst = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // 2.: Abholen und im selben Zug abhaken.
  const { data, error } = await alsDienst.rpc("claim_notification_mails", {
    p_limit: JE_LAUF,
  });

  if (error) {
    return antwort({ ok: false, meldung: error.message }, 500);
  }

  const empfaenger = (data ?? []) as Empfaenger[];
  if (empfaenger.length === 0) {
    return antwort({ ok: true, meldung: "Nichts zu versenden.", empfaenger: 0 });
  }

  const mails = empfaenger.map((e) => ({
    from: MAIL_FROM,
    to: [e.email],
    subject: betreff(e.items),
    html: html(e.first_name, e.items, SITE_URL),
    text: text(e.first_name, e.items, SITE_URL),
  }));
  const sendungen = mails.map((mail, i) => ({ nachricht: mail, ids: empfaenger[i].notification_ids }));

  const benachrichtigungen = empfaenger.reduce((s, e) => s + e.notification_ids.length, 0);

  if (!RESEND_API_KEY) {
    // Trockenlauf: nichts verschicken, aber zeigen, was rausgegangen wäre.
    // Freigegeben wird trotzdem nicht - sonst liefe der nächste Lauf in
    // dieselbe Ausgabe, und lokal entstünde eine Endlosschleife.
    // console.warn statt .log: die Projektregeln lassen nur warn und error zu,
    // und ein Trockenlauf ist genau das - ein Hinweis, dass hier nichts
    // wirklich rausgeht.
    console.warn(
      `Trockenlauf: ${mails.length} Mails an ${mails.map((m) => m.to[0]).join(", ")}`,
    );
    return antwort({
      ok: true,
      trockenlauf: true,
      meldung: "Kein RESEND_API_KEY gesetzt - es wurde nichts verschickt.",
      empfaenger: empfaenger.length,
      benachrichtigungen,
      mails,
    });
  }

  // 3.: Senden. Ein Fehlschlag gibt frei, was noch nicht draußen ist - lieber
  // fünf Minuten später noch einmal als eine Nachricht, die niemand je
  // bekommt. Was ein früherer Stapel schon verschickt hat, bleibt abgehakt.
  const lauf = crypto.randomUUID();

  const { fehler, freizugeben } = await inStapelnSenden(sendungen, STAPEL, async (teil, i) => {
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        // Wiederholt pg_net die Anfrage, entstehen keine zweiten Mails.
        "Idempotency-Key": `${lauf}-${i}`,
      },
      body: JSON.stringify(teil),
    });

    if (!res.ok) {
      throw new Error(`Resend antwortete mit ${res.status}: ${await res.text()}`);
    }
  });

  if (fehler !== null) {
    await alsDienst.rpc("release_notification_mails", { p_ids: freizugeben });
    return antwort(
      {
        ok: false,
        meldung: `Der Versand ist fehlgeschlagen; ${freizugeben.length} Nachrichten stehen wieder an. ${
          fehler instanceof Error ? fehler.message : String(fehler)
        }`,
      },
      502,
    );
  }

  return antwort({
    ok: true,
    meldung: `${mails.length} Mails verschickt.`,
    empfaenger: empfaenger.length,
    benachrichtigungen,
  });
});
