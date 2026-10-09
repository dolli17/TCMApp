/**
 * Benachrichtigungen als Push verschicken.
 *
 * Zwillingsstück zu notification-mails, mit demselben Ablauf: Aufrufer prüfen,
 * abholen und dabei abhaken, senden, bei Fehlschlag wieder freigeben. Warum
 * „erst abhaken, dann senden" richtig ist, steht dort ausführlich — über einen
 * HTTP-Aufruf hinweg gibt es keine Transaktionsklammer, und eine verlorene
 * Nachricht ist der bessere Fehler als dreihundert doppelte.
 *
 * Zwei Dinge sind hier anders als beim Mailversand:
 *
 *   - Ein Push-Ziel kann dauerhaft tot sein. Meldet Expo „DeviceNotRegistered",
 *     wird das Gerät stillgelegt; sonst wüchse die Tabelle mit jeder
 *     Neuinstallation weiter.
 *   - Ein Mitglied hat womöglich mehrere Geräte. Jede Nachricht geht an alle.
 *
 * Ohne gesetzte Konfiguration läuft alles bis auf das Senden — derselbe
 * Trockenlauf wie beim Mailversand, damit sich die Kette lokal gefahrlos
 * prüfen lässt.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
/** Nur nötig, wenn im Expo-Konto die erhöhte Sicherheit für Push aktiv ist. */
const EXPO_ACCESS_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN") ?? "";
/** Abschaltbar, damit ein Trockenlauf ohne Expo-Konto möglich bleibt. */
const PUSH_AKTIV = (Deno.env.get("PUSH_AKTIV") ?? "").toLowerCase() === "true";

const EXPO_ENDPUNKT = "https://exp.host/--/api/v2/push/send";

/** Wie viele Benachrichtigungen ein Lauf höchstens anfasst. */
const JE_LAUF = 200;

/** Expo nimmt bis zu 100 Nachrichten je Stapel. */
const STAPEL = 100;

interface Posten {
  kind: string;
  title: string;
  body: string;
  created_at: string;
}

interface Empfaenger {
  member_id: string;
  tokens: string[];
  notification_ids: string[];
  items: Posten[];
}

interface Nachricht {
  to: string;
  title: string;
  body: string;
  sound: string;
  badge: number;
  data: Record<string, string>;
}

function antwort(koerper: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Aus mehreren Posten wird eine Meldung.
 *
 * Eine Serienanlage mit sechzig Terminen erzeugt sechzig Benachrichtigungen in
 * Sekunden. Als sechzig Tonsignale wäre das ein Grund, Push abzuschalten.
 */
function meldung(items: Posten[]): { titel: string; text: string } {
  if (items.length === 1) {
    const eins = items[0];
    return { titel: eins.title, text: eins.body };
  }

  return {
    titel: `${items.length} Änderungen an deinen Buchungen`,
    text: items.map((i) => i.title).join(" · "),
  };
}

/**
 * Ist der Aufrufer der Zeitgeber (pg_cron mit Dienstschlüssel)?
 *
 * Nicht nur der wörtliche Vergleich mit SUPABASE_SERVICE_ROLE_KEY: Supabase
 * stellt die Schlüssel um (alter JWT-Schlüssel neben neuen sb_secret_…), und
 * in der Umgebung der Funktion steht dann ein anderer gültiger Dienstschlüssel
 * als im Vault des Zeitgebers. Deshalb zählt auch die Rolle im Token. Das ist
 * nur sicher, weil verify_jwt = true (config.toml) die Signatur schon am Tor
 * prüft - ein selbst gebautes Token mit "service_role" kommt gar nicht bis hier.
 */
function istDienstschluessel(token: string): boolean {
  if (token === SERVICE_KEY) return true;
  const teile = token.split(".");
  if (teile.length !== 3) return false;
  try {
    const nutzlast = JSON.parse(
      atob(teile[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(teile[1].length / 4) * 4, "=")),
    );
    return nutzlast?.role === "service_role";
  } catch {
    return false;
  }
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

  // Der Zeitgeber weist sich mit dem Dienstschlüssel aus. Jeder andere muss ein
  // angemeldeter Administrator sein - geprüft über die Datenbank, nicht über
  // eine Liste in dieser Datei.
  const istZeitgeber = istDienstschluessel(token);

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

  // Abholen und im selben Zug abhaken.
  const { data, error } = await alsDienst.rpc("claim_notification_pushes", {
    p_limit: JE_LAUF,
  });

  if (error) {
    return antwort({ ok: false, meldung: error.message }, 500);
  }

  const empfaenger = (data ?? []) as Empfaenger[];
  if (empfaenger.length === 0) {
    return antwort({ ok: true, meldung: "Nichts zu senden.", empfaenger: 0 });
  }

  // Je Gerät eine Nachricht: ein Mitglied kann Telefon und Tablet angemeldet
  // haben, und beide sollen es erfahren.
  const nachrichten: Nachricht[] = [];
  for (const e of empfaenger) {
    const m = meldung(e.items);
    for (const geraet of e.tokens) {
      nachrichten.push({
        to: geraet,
        title: m.titel,
        body: m.text,
        sound: "default",
        badge: e.items.length,
        data: { ziel: "/nachrichten" },
      });
    }
  }

  const alleIds = empfaenger.flatMap((e) => e.notification_ids);

  if (!PUSH_AKTIV) {
    // Trockenlauf: nichts senden, aber zeigen, was rausgegangen wäre.
    // Freigegeben wird trotzdem nicht - sonst liefe der nächste Lauf in
    // dieselbe Ausgabe, und lokal entstünde eine Endlosschleife.
    console.warn(
      `Trockenlauf: ${nachrichten.length} Push an ${empfaenger.length} Empfänger`,
    );
    return antwort({
      ok: true,
      trockenlauf: true,
      empfaenger: empfaenger.length,
      nachrichten,
    });
  }

  const kopfzeilen: Record<string, string> = { "Content-Type": "application/json" };
  if (EXPO_ACCESS_TOKEN) kopfzeilen.Authorization = `Bearer ${EXPO_ACCESS_TOKEN}`;

  let gesendet = 0;
  const abgemeldet: string[] = [];

  try {
    for (let i = 0; i < nachrichten.length; i += STAPEL) {
      const stapel = nachrichten.slice(i, i + STAPEL);

      const res = await fetch(EXPO_ENDPUNKT, {
        method: "POST",
        headers: kopfzeilen,
        body: JSON.stringify(stapel),
      });

      if (!res.ok) {
        throw new Error(`Expo antwortete mit ${res.status}`);
      }

      const ergebnis = await res.json() as {
        data?: { status: string; details?: { error?: string } }[];
      };

      // Die Belege kommen in derselben Reihenfolge wie die Nachrichten.
      (ergebnis.data ?? []).forEach((beleg, index) => {
        if (beleg.status === "ok") {
          gesendet += 1;
          return;
        }
        if (beleg.details?.error === "DeviceNotRegistered") {
          const ziel = stapel[index]?.to;
          if (ziel) abgemeldet.push(ziel);
        }
      });
    }
  } catch (fehler) {
    // Das Abhaken war verfrüht - der nächste Lauf soll es erneut versuchen.
    await alsDienst.rpc("release_notification_pushes", { p_ids: alleIds });
    return antwort(
      { ok: false, meldung: fehler instanceof Error ? fehler.message : "Versand gescheitert." },
      502,
    );
  }

  // Tote Ziele stilllegen. Das ist der Unterschied zur Mail: eine Adresse
  // bleibt gültig, eine Push-Marke stirbt mit der Neuinstallation.
  for (const ziel of abgemeldet) {
    await alsDienst.rpc("disable_push_token", { p_token: ziel });
  }

  return antwort({
    ok: true,
    empfaenger: empfaenger.length,
    gesendet,
    stillgelegt: abgemeldet.length,
  });
});
