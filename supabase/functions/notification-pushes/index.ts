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
 *   - Es gibt drei Wege hinaus: Geräte der Expo-App über exp.host, die der
 *     nativen Apps direkt über APNs (iOS) und FCM (Android). Welcher Weg,
 *     steht je Gerät in `geraete` (provider). Fehlt die Konfiguration für
 *     APNs oder FCM, bleiben diese Geräte liegen, Expo läuft weiter.
 *
 * Ohne gesetzte Konfiguration läuft alles bis auf das Senden — derselbe
 * Trockenlauf wie beim Mailversand, damit sich die Kette lokal gefahrlos
 * prüfen lässt.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { pushMeldung } from "./pushvorlage.ts";
// Symlink auf packages/core/src/dienstschluessel.ts, dort unter Test.
import { istDienstschluessel } from "./dienstschluessel.ts";
// Symlink auf packages/core/src/versandstapel.ts, dort unter Test.
import { inStapelnSenden, type Sendung } from "./versandstapel.ts";
import { Apns, apnsKonfiguration } from "./apns.ts";
import { Fcm, fcmKonfiguration } from "./fcm.ts";
import {
  freizugeben,
  type Geraet,
  type Meldung,
  nebenlaeufig,
  type Zusteller,
  type Zustellung,
} from "./zustellung.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
/** Nur nötig, wenn im Expo-Konto die erhöhte Sicherheit für Push aktiv ist. */
const EXPO_ACCESS_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN") ?? "";
/** Abschaltbar, damit ein Trockenlauf ohne Expo-Konto möglich bleibt. */
const PUSH_AKTIV = (Deno.env.get("PUSH_AKTIV") ?? "").toLowerCase() === "true";

/** APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, APNS_BUNDLE_ID, APNS_UMGEBUNG */
const APNS = apnsKonfiguration((name) => Deno.env.get(name));
/** FCM_SERVICE_ACCOUNT: die JSON-Datei des Firebase-Dienstkontos */
const FCM = fcmKonfiguration(Deno.env.get("FCM_SERVICE_ACCOUNT"));

// Auf Modulebene, damit JWT und Zugriffstoken über Aufrufe hinweg halten,
// solange die Instanz warm ist.
const zusteller: Record<string, Zusteller | null> = {
  apns: APNS ? (() => {
    const apns = new Apns(APNS);
    return (marke, meldung) => apns.senden(marke, meldung);
  })() : null,
  fcm: FCM ? (() => {
    const fcm = new Fcm(FCM);
    return (marke, meldung) => fcm.senden(marke, meldung);
  })() : null,
};

const EXPO_ENDPUNKT = "https://exp.host/--/api/v2/push/send";

/** Wie viele Benachrichtigungen ein Lauf höchstens anfasst. */
const JE_LAUF = 200;

/** Expo nimmt bis zu 100 Nachrichten je Stapel. */
const STAPEL = 100;

/** So viele Aufrufe an APNs bzw. FCM laufen gleichzeitig. */
const GLEICHZEITIG = 20;

interface Posten {
  kind: string;
  title: string;
  body: string;
  created_at: string;
  event_id?: string | null;
}

interface Empfaenger {
  member_id: string;
  tokens: string[];
  notification_ids: string[];
  items: Posten[];
  /** Alle aktiven Geräte mit Anbieter; fehlt bei einer älteren Datenbank. */
  geraete?: Geraet[] | null;
}

/** Eine Nachricht an ein Gerät der nativen Apps. */
interface Direkt {
  anbieter: "apns" | "fcm";
  marke: string;
  meldung: Meldung;
  ids: string[];
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
  const sendungen: Sendung<Nachricht>[] = [];
  const direkt: Direkt[] = [];
  const uebersprungen: Record<string, number> = {};
  for (const e of empfaenger) {
    // Texte und Ziel aus @tcm/core (pushvorlage.ts), dort getestet.
    const m = pushMeldung(e.items);
    for (const geraet of geraeteVon(e)) {
      if (geraet.provider === "expo") {
        sendungen.push({
          nachricht: {
            to: geraet.token,
            title: m.titel,
            body: m.text,
            sound: "default",
            badge: e.items.length,
            data: { ziel: m.ziel },
          },
          ids: e.notification_ids,
        });
      } else if ((geraet.provider === "apns" || geraet.provider === "fcm") && zusteller[geraet.provider]) {
        direkt.push({
          anbieter: geraet.provider,
          marke: geraet.token,
          meldung: { titel: m.titel, text: m.text, badge: e.items.length, daten: daten(e.items, m.ziel) },
          ids: e.notification_ids,
        });
      } else {
        uebersprungen[geraet.provider] = (uebersprungen[geraet.provider] ?? 0) + 1;
      }
    }
  }

  // Nur Anzahlen ins Log, keine Marken.
  for (const [anbieter, anzahl] of Object.entries(uebersprungen)) {
    console.warn(`${anbieter}: nicht eingerichtet oder unbekannt, ${anzahl} Gerät(e) übersprungen`);
  }
  const nUebersprungen = Object.values(uebersprungen).reduce((a, b) => a + b, 0);

  const nachrichten = sendungen.map((s) => s.nachricht);

  if (!PUSH_AKTIV) {
    // Trockenlauf: nichts senden, aber zeigen, was rausgegangen wäre.
    // Freigegeben wird trotzdem nicht - sonst liefe der nächste Lauf in
    // dieselbe Ausgabe, und lokal entstünde eine Endlosschleife.
    console.warn(
      `Trockenlauf: ${nachrichten.length + direkt.length} Push an ${empfaenger.length} Empfänger`,
    );
    return antwort({
      ok: true,
      trockenlauf: true,
      empfaenger: empfaenger.length,
      nachrichten,
      direkt: direkt.map((d) => ({ anbieter: d.anbieter, to: d.marke, ...d.meldung })),
      uebersprungen: nUebersprungen,
    });
  }

  const kopfzeilen: Record<string, string> = { "Content-Type": "application/json" };
  if (EXPO_ACCESS_TOKEN) kopfzeilen.Authorization = `Bearer ${EXPO_ACCESS_TOKEN}`;

  let gesendet = 0;
  const abgemeldet: string[] = [];

  // Expo in Stapeln, APNs und FCM je Gerät, beides zugleich. Ein Ausfall bei
  // Apple hält Android nicht auf und umgekehrt.
  const [expo, zustellungen] = await Promise.all([
    inStapelnSenden(sendungen, STAPEL, async (stapel) => {
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
    }),
    nebenlaeufig(direkt, GLEICHZEITIG, (d): Promise<Zustellung> => zusteller[d.anbieter]!(d.marke, d.meldung)),
  ]);

  // Was ein früherer Stapel oder ein anderes Gerät schon zugestellt hat,
  // bleibt abgehakt (B9). Freigegeben wird nur, was vorübergehend scheiterte.
  const expoFrei = new Set(expo.freizugeben);
  const zugestellt = sendungen.flatMap((s) => s.ids).filter((id) => !expoFrei.has(id));
  const gescheitert = [...expo.freizugeben];
  const fehlermeldungen: string[] = [];
  if (expo.fehler !== null) {
    fehlermeldungen.push(expo.fehler instanceof Error ? expo.fehler.message : "Versand gescheitert.");
  }

  zustellungen.forEach((z, i) => {
    const d = direkt[i]!;
    if (z.ergebnis === "gesendet") {
      gesendet += 1;
      zugestellt.push(...d.ids);
      return;
    }
    if (z.ergebnis === "tot") {
      abgemeldet.push(d.marke);
      return;
    }
    // Ohne Marke ins Log, nur Anbieter und Grund.
    console.warn(`${d.anbieter}: ${z.ergebnis} (${z.grund ?? "ohne Grund"})`);
    if (z.ergebnis === "fehler") {
      gescheitert.push(...d.ids);
      fehlermeldungen.push(`${d.anbieter === "apns" ? "APNs" : "FCM"} antwortete mit ${z.grund ?? "Fehler"}`);
    }
  });

  // Tote Ziele stilllegen. Das ist der Unterschied zur Mail: eine Adresse
  // bleibt gültig, eine Push-Marke stirbt mit der Neuinstallation.
  for (const ziel of abgemeldet) {
    await alsDienst.rpc("disable_push_token", { p_token: ziel });
  }

  if (fehlermeldungen.length > 0) {
    // Das Abhaken war verfrüht, aber nur für das, was noch nicht draußen ist.
    const frei = freizugeben(gescheitert, zugestellt);
    if (frei.length > 0) {
      await alsDienst.rpc("release_notification_pushes", { p_ids: frei });
    }
    return antwort(
      {
        ok: false,
        meldung: [...new Set(fehlermeldungen)].join("; "),
        gesendet,
        stillgelegt: abgemeldet.length,
        freigegeben: frei.length,
      },
      502,
    );
  }

  return antwort({
    ok: true,
    empfaenger: empfaenger.length,
    gesendet,
    stillgelegt: abgemeldet.length,
    uebersprungen: nUebersprungen,
  });
});

/** Die Geräte eines Empfängers; ohne `geraete` (ältere Datenbank) die Expo-Marken wie bisher. */
function geraeteVon(e: Empfaenger): Geraet[] {
  if (Array.isArray(e.geraete)) return e.geraete;
  return (e.tokens ?? []).map((token) => ({ token, provider: "expo" }));
}

/**
 * Was die native App beim Tippen braucht: das Ziel wie bei Expo, dazu die Art
 * und die Veranstaltung, wenn alle Posten dieselbe haben.
 */
function daten(items: Posten[], ziel: string): Record<string, string> {
  const d: Record<string, string> = { ziel };
  const arten = new Set(items.map((i) => i.kind));
  if (arten.size === 1) d.kind = items[0]!.kind;
  const veranstaltungen = new Set(items.map((i) => i.event_id ?? ""));
  const [eventId] = [...veranstaltungen];
  if (veranstaltungen.size === 1 && eventId) d.event_id = eventId;
  return d;
}
