/**
 * Ein Mitgliedsantrag von außen, mit Bestätigungsmail (S22).
 *
 * Warum eine Edge Function: Das Token für den Bestätigungslink darf nur
 * sehen, wer es per Mail verschickt. Gäbe die Datenbank es an anon zurück,
 * könnte jeder seinen Antrag selbst bestätigen, ohne das Postfach zu haben,
 * und die Bestätigung wäre wertlos. Also holt es diese Function mit dem
 * Dienstschlüssel und schickt es direkt weiter.
 *
 * Der Ablauf:
 *
 *   1. `begin_membership_application` prüft die Angaben und die Sperren und
 *      legt den Antrag unbestätigt an. Keine Zeile zurück heißt: keine Mail
 *      (schon bestätigt, Sperrfrist, genug Mails). Die Antwort nach außen ist
 *      dann trotzdem dieselbe.
 *   2. Die Mail geht über Resend raus, ohne `RESEND_API_KEY` an Mailpit
 *      (`MAILPIT_URL`, nur im lokalen Stack gesetzt, supabase/config.toml).
 *      Gibt es keins von beiden, sagt die Function das, statt still zu
 *      verwerfen: ein Antrag ohne Mail käme nie beim Vorstand an.
 *   3. Scheitert der Versand, nimmt `release_membership_application_mail`
 *      Sperrfrist und Zähler zurück, damit der nächste Versuch gleich wieder
 *      eine Mail auslöst.
 *
 * Die Herkunft kommt wie bei S6 aus dem ersten Eintrag von x-forwarded-for;
 * das Web reicht dort die Adresse seines Aufrufers durch.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
// Symlink auf packages/core/src/antragsmail.ts, dort unter Test.
import {
  ANTRAG_BETREFF,
  antragsLink,
  antragsmailHtml,
  antragsmailText,
} from "./antragsmail.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "http://localhost:3000";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAILPIT_URL = (Deno.env.get("MAILPIT_URL") ?? "").replace(/\/$/, "");
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "TC Muckensturm <noreply@example.org>";

const NICHT_VERSCHICKT =
  "Die Bestätigungsmail ließ sich gerade nicht verschicken. Bitte versuch es in ein paar Minuten noch einmal.";

interface Eingang {
  application_id: string;
  email: string;
  first_name: string | null;
  token: string;
}

interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

function antwort(ok: boolean, meldung: string, status = 200, zusatz: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ ok, meldung, ...zusatz }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** "Name <adresse>" in die Form, die Mailpit erwartet. */
function absender(von: string): { Email: string; Name?: string } {
  const t = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(von);
  return t ? { Name: t[1] || undefined, Email: t[2]! } : { Email: von.trim() };
}

async function senden(mail: Mail): Promise<void> {
  if (RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    });
    if (!res.ok) throw new Error(`Resend antwortete mit ${res.status}: ${await res.text()}`);
    return;
  }

  const res = await fetch(`${MAILPIT_URL}/api/v1/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      From: absender(MAIL_FROM),
      To: [{ Email: mail.to }],
      Subject: mail.subject,
      HTML: mail.html,
      Text: mail.text,
    }),
  });
  if (!res.ok) throw new Error(`Mailpit antwortete mit ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return antwort(false, "Nur POST.", 405);
  }

  let koerper: { daten?: unknown; userAgent?: unknown };
  try {
    koerper = await req.json();
  } catch {
    return antwort(false, "Die Anfrage ist unvollständig.", 400);
  }
  if (!koerper || typeof koerper.daten !== "object" || koerper.daten === null) {
    return antwort(false, "Die Anfrage ist unvollständig.", 400);
  }

  if (!RESEND_API_KEY && !MAILPIT_URL) {
    console.error("mitgliedsantrag: weder RESEND_API_KEY noch MAILPIT_URL gesetzt");
    return antwort(false, NICHT_VERSCHICKT, 503);
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;

  const alsDienst = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // 1.: Prüfen, anlegen, Token holen.
  const { data, error } = await alsDienst.rpc("begin_membership_application", {
    p_data: koerper.daten,
    p_ip: ip,
    p_user_agent: typeof koerper.userAgent === "string" ? koerper.userAgent : null,
  });
  if (error) {
    // Die Meldungen der RPC sind für Menschen geschrieben (fehlende Angaben,
    // Sperre); Code und Details gehen mit wie bei member-login.
    return antwort(false, error.message, 400, { code: error.code, details: error.details });
  }

  const eingang = ((data ?? []) as Eingang[])[0];
  if (!eingang) return antwort(true, "Eingegangen.");

  // 2.: Senden.
  const link = antragsLink(SITE_URL, eingang.token);
  try {
    await senden({
      to: eingang.email,
      subject: ANTRAG_BETREFF,
      html: antragsmailHtml(eingang.first_name, link),
      text: antragsmailText(eingang.first_name, link),
    });
  } catch (fehler) {
    // 3.: Zurücknehmen, damit der nächste Versuch sofort wieder mailt.
    console.error("mitgliedsantrag: Versand gescheitert:", fehler instanceof Error ? fehler.message : fehler);
    await alsDienst.rpc("release_membership_application_mail", { p_application_id: eingang.application_id });
    return antwort(false, NICHT_VERSCHICKT, 502);
  }

  return antwort(true, "Eingegangen.");
});
